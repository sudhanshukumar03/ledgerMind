import { parsePagination, requireUuid } from "../../common/utils/pagination.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { QueryExceptionsDto } from "./dto/query-exceptions.dto.js";
import { Prisma, ExceptionType } from "@prisma/client";

@Injectable()
export class ExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(merchantId: string, query: QueryExceptionsDto) {
    const { type, severity, status, search } = query;
    const { page, limit } = parsePagination(query.page, query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: Prisma.ExceptionWhereInput = { merchantId };
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    if (search) {
      const normalized = search.trim().replace(/ /g, "_").toUpperCase();
      where.OR = [
        { exceptionId: { contains: search.trim(), mode: "insensitive" } },
        ...Object.values(ExceptionType)
          .filter((t) => t.includes(normalized))
          .map((type) => ({ type })),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.exception.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.exception.count({ where }),
    ]);

    return {
      data: items.map(this.mapException),
      total,
      page,
      limit,
    };
  }

  async findOne(merchantId: string, id: string) {
    const isFriendlyId = /^EXC-[A-Za-z0-9-]+$/.test(id);
    if (!isFriendlyId) requireUuid(id);

    const exception = await this.prisma.exception.findFirst({
      where: isFriendlyId
        ? { exceptionId: id, merchantId }
        : { id, merchantId },
      include: { aiAnalyses: { orderBy: { createdAt: "desc" } } },
    });

    if (!exception) {
      throw new NotFoundException("Exception not found");
    }

    const paymentWhere =
      exception.primaryEntityType === "PAYMENT"
        ? { id: exception.primaryEntityId! }
        : exception.primaryEntityType === "ORDER"
          ? { orderId: exception.primaryEntityId! }
          : null;
    const payments = paymentWhere
      ? await this.prisma.payment.findMany({
          where: {
            merchantId,
            ...paymentWhere,
            status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] },
          },
          include: { refunds: true },
          take: 100,
          orderBy: { createdAt: "asc" },
        })
      : [];
    const eligiblePayments = await Promise.all(
      payments.map(async (payment) => {
        const reserved = await this.prisma.action.aggregate({
          where: {
            targetPaymentId: payment.id,
            status: {
              in: [
                "PENDING_APPROVAL",
                "APPROVED",
                "EXECUTING",
                "OUTCOME_UNKNOWN",
              ],
            },
          },
          _sum: { reservedAmount: true },
        });
        const refunded = payment.refunds
          .filter((r) => r.status !== "FAILED")
          .reduce((sum, r) => sum + r.amount, 0n);
        const remaining =
          payment.amount - refunded - (reserved._sum.reservedAmount ?? 0n);
        return {
          id: payment.id,
          paymentId: payment.paymentId,
          remainingAmount: (remaining > 0n ? remaining : 0n).toString(),
        };
      }),
    );
    return { ...this.mapException(exception), eligiblePayments };
  }

  async getTimeline(merchantId: string, id: string) {
    // verify exception belongs to merchant
    const isFriendlyId = /^EXC-[A-Za-z0-9-]+$/.test(id);
    if (!isFriendlyId) requireUuid(id);

    const exception = await this.prisma.exception.findFirst({
      where: isFriendlyId
        ? { exceptionId: id, merchantId }
        : { id, merchantId },
    });

    if (!exception) {
      throw new NotFoundException("Exception not found");
    }

    // Query events by the resolved internal UUID — `id` may be a friendly
    // EXC-… reference, and ExceptionEvent.exceptionId is a UUID FK, so using
    // the raw param would throw an invalid-UUID error for friendly ids.
    const events = await this.prisma.exceptionEvent.findMany({
      where: { exceptionId: exception.id },
      orderBy: { occurredAt: "asc" },
    });

    return events;
  }

  private mapException(exception: any) {
    return {
      ...exception,
      expectedAmount: exception.expectedAmount?.toString() ?? null,
      actualAmount: exception.actualAmount?.toString() ?? null,
      differenceAmount: exception.differenceAmount?.toString() ?? null,
      financialImpact: exception.financialImpact?.toString() ?? "0",
    };
  }
}
