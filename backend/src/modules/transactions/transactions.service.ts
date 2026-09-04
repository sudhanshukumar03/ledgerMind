import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async getTransactions(merchantId: string, query: ListTransactionsDto) {
    const { type, status, from, to, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = { merchantId };
    
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    let data: any[] = [];
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

    throw new NotFoundException('Transaction not found');
  }

  private serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(item => this.serializeBigInt(item));
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.serializeBigInt(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }
}
