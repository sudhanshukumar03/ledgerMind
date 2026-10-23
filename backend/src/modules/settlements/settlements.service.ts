import {
  parsePagination,
  parseDateRange,
  requireUuid,
  parseEnum,
  positiveSafePaise,
  requireInr,
} from '../../common/utils/pagination.js';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    merchantId: string,
    page = 1,
    limit = 20,
    filters: {
      status?: string;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    ({ page, limit } = parsePagination(page, limit));
    const skip = (page - 1) * limit;

    // Merchant-isolated WHERE clause with optional filters.
    const where: Prisma.SettlementWhereInput = { merchantId };
    where.status = parseEnum(
      filters.status,
      Object.values(SettlementStatus),
      'status',
    );
    if (filters.search) {
      where.OR = [
        { settlementId: { contains: filters.search, mode: 'insensitive' } },
        { utr: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.from || filters.to) {
      const settlementDate = parseDateRange(filters.from, filters.to);
      where.settlementDate = settlementDate;
    }

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements.map((s) => ({
        ...s,
        amount: s.amount.toString(),
      })),
      total,
      page,
      limit,
    };
  }

  async replaceAllocations(
    merchantId: string,
    userId: string,
    id: string,
    allocations: unknown,
  ) {
    requireUuid(id);
    if (
      !Array.isArray(allocations) ||
      allocations.length < 1 ||
      allocations.length > 500
    )
      throw new BadRequestException('Supply 1 to 500 allocations');
    const parsed = allocations.map((a) => {
      if (!a || typeof a !== 'object')
        throw new BadRequestException('Invalid allocation');
      requireUuid(a.payment_id);
      const nonnegative = (value: unknown) => {
        if (
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 0
        )
          throw new BadRequestException(
            'Allocation units must be nonnegative safe integer paise',
          );
        return BigInt(value);
      };
      const adjustment = a.adjustment_amount ?? 0;
      if (!Number.isSafeInteger(adjustment))
        throw new BadRequestException(
          'adjustment_amount must be safe integer paise',
        );
      return {
        paymentId: a.payment_id as string,
        grossAmount: nonnegative(a.gross_amount),
        refundAmount: nonnegative(a.refund_amount ?? 0),
        feeAmount: nonnegative(a.fee_amount ?? 0),
        taxAmount: nonnegative(a.tax_amount ?? 0),
        adjustmentAmount: BigInt(adjustment),
      };
    });
    if (new Set(parsed.map((a) => a.paymentId)).size !== parsed.length)
      throw new BadRequestException('Duplicate allocation payment');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${merchantId}, 1))`;
      const settlement = await tx.settlement.findFirst({
        where: { id, merchantId },
      });
      if (!settlement) throw new NotFoundException('Settlement not found');
      requireInr(settlement.currency);
      for (const a of [...parsed].sort((a, b) =>
        a.paymentId.localeCompare(b.paymentId),
      )) {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${a.paymentId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findFirst({
          where: { id: a.paymentId, merchantId },
        });
        if (
          !payment ||
          !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
            payment.status,
          )
        )
          throw new BadRequestException(
            'Allocation requires a related merchant capture',
          );
        requireInr(payment.currency);
        const others = await tx.settlementAllocation.aggregate({
          where: {
            paymentId: a.paymentId,
            settlementId: { not: id },
            settlement: { status: { not: 'FAILED' } },
          },
          _sum: { grossAmount: true },
        });
        if (
          a.grossAmount + (others._sum.grossAmount ?? 0n) > payment.amount ||
          (a.grossAmount === 0n &&
            a.refundAmount === 0n &&
            a.feeAmount === 0n &&
            a.taxAmount === 0n &&
            a.adjustmentAmount === 0n)
        )
          throw new BadRequestException('Allocation exceeds captured amount');
      }
      for (const a of parsed) {
        const processed = await tx.refund.aggregate({
          where: { paymentId: a.paymentId, merchantId, status: 'PROCESSED' },
          _sum: { amount: true },
        });
        const assigned = await tx.settlementAllocation.aggregate({
          where: {
            paymentId: a.paymentId,
            settlementId: { not: id },
            settlement: { status: { not: 'FAILED' } },
          },
          _sum: { refundAmount: true },
        });
        if (
          a.refundAmount + (assigned._sum.refundAmount ?? 0n) >
          (processed._sum.amount ?? 0n)
        )
          throw new BadRequestException(
            'Refund allocation exceeds processed refund evidence',
          );
      }
      const net = parsed.reduce(
        (sum, a) =>
          sum +
          a.grossAmount -
          a.refundAmount -
          a.feeAmount -
          a.taxAmount +
          a.adjustmentAmount,
        0n,
      );
      if (net !== settlement.amount)
        throw new BadRequestException(
          'Allocation net must equal settlement amount',
        );
      await tx.settlementAllocation.deleteMany({ where: { settlementId: id } });
      await tx.settlementAllocation.createMany({
        data: parsed.map((a) => ({ ...a, settlementId: id })),
      });
      await tx.auditLog.create({
        data: {
          merchantId,
          userId,
          actorType: 'USER',
          action: 'SETTLEMENT_ALLOCATIONS_REPLACED',
          entityType: 'SETTLEMENT',
          entityId: id,
          afterState: JSON.parse(
            JSON.stringify(parsed, (_, v) =>
              typeof v === 'bigint' ? v.toString() : v,
            ),
          ),
        },
      });
      return {
        settlementId: id,
        allocatedPayments: parsed.length,
        netAmount: net.toString(),
      };
    });
  }

  async findOne(merchantId: string, id: string) {
    requireUuid(id);
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, merchantId },
      include: { bankTransactions: true, allocations: true },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    return {
      ...settlement,
      amount: settlement.amount.toString(),
      allocations: settlement.allocations.map((a) => ({
        ...a,
        grossAmount: a.grossAmount.toString(),
        refundAmount: a.refundAmount.toString(),
        feeAmount: a.feeAmount.toString(),
        taxAmount: a.taxAmount.toString(),
        adjustmentAmount: a.adjustmentAmount.toString(),
      })),
      bankTransactions: settlement.bankTransactions.map((bt) => ({
        ...bt,
        amount: bt.amount.toString(),
      })),
    };
  }
}
