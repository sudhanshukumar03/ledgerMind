import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(merchantId: string) {
    const [
      totalOrders,
      matchedPayments,
      openExceptions,
      criticalExceptions,
      pendingApprovals
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { merchantId },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: { merchantId, status: 'CAPTURED' },
      }),
      this.prisma.exception.count({
        where: { merchantId, status: 'OPEN' },
      }),
      this.prisma.exception.count({
        where: { merchantId, status: 'OPEN', severity: 'CRITICAL' },
      }),
      this.prisma.action.count({
        where: { merchantId, status: 'PENDING_APPROVAL' },
      }),
    ]);

    const totalTransactionVolume = totalOrders._sum.amount ? Number(totalOrders._sum.amount) : 0;
    
    // Simplistic reconciliation rate: matched payments / total payments (or total orders)
    const totalPayments = await this.prisma.payment.count({ where: { merchantId }});
    const reconciliationRate = totalPayments === 0 ? 100 : (matchedPayments / totalPayments) * 100;

    return {
      total_transaction_volume: totalTransactionVolume,
      reconciliation_rate: parseFloat(reconciliationRate.toFixed(1)),
      open_exceptions: openExceptions,
      critical_exceptions: criticalExceptions,
      pending_approvals: pendingApprovals,
    };
  }
}
