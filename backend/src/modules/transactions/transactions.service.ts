import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { OrderStatus, PaymentStatus, RefundStatus, SettlementStatus, BankTransactionStatus } from '@prisma/client';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';
import { parsePagination, parseDateRange, parseEnum, requireUuid } from '../../common/utils/pagination.js';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async getTransactions(merchantId: string, query: ListTransactionsDto) {
    const { status, from, to } = query;
    const type = parseEnum(query.type, ['order', 'payment', 'refund', 'settlement', 'bank'] as const, 'type') ?? 'payment';
    const { page, limit } = parsePagination(query.page, query.limit);
    const statuses = { order: OrderStatus, payment: PaymentStatus, refund: RefundStatus, settlement: SettlementStatus, bank: BankTransactionStatus };
    parseEnum(status, Object.values(statuses[type]), 'status');
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: Record<string, unknown> = { merchantId };
    
    if (status) where.status = status;
    if (from || to) {
      const createdAt = parseDateRange(from, to);
      where.createdAt = createdAt;
    }

    let data: unknown[] = [];
    let total = 0;

    switch (type) {
      case 'order':
        [data, total] = await Promise.all([
          this.prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.order.count({ where }),
        ]);
        break;
      case 'payment':
        [data, total] = await Promise.all([
          this.prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.payment.count({ where }),
        ]);
        break;
      case 'refund':
        [data, total] = await Promise.all([
          this.prisma.refund.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.refund.count({ where }),
        ]);
        break;
      case 'settlement':
        [data, total] = await Promise.all([
          this.prisma.settlement.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.settlement.count({ where }),
        ]);
        break;
      case 'bank':
        [data, total] = await Promise.all([
          this.prisma.bankTransaction.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.bankTransaction.count({ where }),
        ]);
        break;
      default:
        // Default to payments if type is not specified or invalid
        [data, total] = await Promise.all([
          this.prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
          this.prisma.payment.count({ where }),
        ]);
        break;
    }

    // Convert BigInt to string for JSON serialization
    const serializedData = data.map(item => this.serializeBigInt(item));

    return {
      data: serializedData,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
      },
    };
  }

  async getTransactionDetails(merchantId: string, id: string) {
    requireUuid(id);
    // Attempt to find the transaction by id in any of the tables
    // Since we don't know the type from the URL parameters for this generic endpoint,
    // we search through the entities. A more optimized approach would pass the type.
    
    // Check Payment
    const payment = await this.prisma.payment.findFirst({
      where: { id, merchantId },
      include: {
        order: true,
        refunds: true,
      }
    });

    if (payment) {
      // Find related settlement if possible (based on amount, UTR etc. - simplify for now)
      // Usually would rely on ReconciliationMatch table or direct relations
      return this.serializeBigInt({
        id: payment.id,
        type: 'payment',
        external_id: payment.paymentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        related: {
          order: payment.order,
          refunds: payment.refunds,
        }
      });
    }

    // Check Order
    const order = await this.prisma.order.findFirst({
      where: { id, merchantId },
      include: {
        payments: true,
      }
    });

    if (order) {
      return this.serializeBigInt({
        id: order.id,
        type: 'order',
        external_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        related: {
          payments: order.payments,
        }
      });
    }

    // Check Refund
    const refund = await this.prisma.refund.findFirst({
      where: { id, merchantId },
      include: {
        payment: {
          include: { order: true }
        }
      }
    });

    if (refund) {
      return this.serializeBigInt({
        id: refund.id,
        type: 'refund',
        external_id: refund.refundId,
        amount: refund.amount,
        status: refund.status,
        related: {
          payment: refund.payment,
        }
      });
    }

    const settlement = await this.prisma.settlement.findFirst({ where: { id, merchantId }, include: { bankTransactions: true, allocations: true } });
    if (settlement) return this.serializeBigInt({ ...settlement, type: 'settlement', external_id: settlement.settlementId });
    const bank = await this.prisma.bankTransaction.findFirst({ where: { id, merchantId }, include: { settlement: true } });
    if (bank) return this.serializeBigInt({ ...bank, type: 'bank', external_id: bank.bankTxnId });
    throw new NotFoundException('Transaction not found');
  }

  private serializeBigInt(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(item => this.serializeBigInt(item));
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const key in obj as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.serializeBigInt((obj as Record<string, unknown>)[key]);
        }
      }
      return result;
    }
    return obj;
  }
}
