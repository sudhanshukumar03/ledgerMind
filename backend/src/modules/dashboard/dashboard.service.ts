import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async getMetrics(merchantId: string) { return new ReconciliationService(this.prisma).getStats(merchantId); }
}
