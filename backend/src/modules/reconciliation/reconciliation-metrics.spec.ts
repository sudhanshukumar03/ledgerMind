import { jest } from '@jest/globals';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { ReconciliationService } from './reconciliation.service.js';

describe.each(['dashboard', 'reconciliation'] as const)('%s reconciliation metrics', (endpoint) => {
  function fixture() {
    const runs = [
      { id: 'filtered-run', merchantId: 'm1', status: 'COMPLETED', dateFrom: new Date(), dateTo: null },
      { id: 'full-run', merchantId: 'm1', status: 'COMPLETED', dateFrom: null, dateTo: null, capturedPayments: 100, matchedPayments: 100 },
      { id: 'older-full-run', merchantId: 'm1', status: 'COMPLETED', dateFrom: null, dateTo: null, capturedPayments: 100, matchedPayments: 100 },
    ];
    const prisma = {
      payment: {
        aggregate: jest.fn(async () => ({ _sum: { amount: 100000n } })),
        count: jest.fn(async () => 100),
      },
      reconciliationRun: {
        findFirst: jest.fn(async ({ where }: any) => runs.find((run) =>
          Object.entries(where).every(([key, value]) => run[key as keyof typeof run] === value),
        ) ?? null),
      },
      reconciliationMatch: {
        count: jest.fn(async ({ where }: any): Promise<number> => where.runId === 'filtered-run' ? 1 : 100),
      },
      exception: { count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
      action: { count: jest.fn(async () => 0) },
    };
    const getMetrics = () => endpoint === 'dashboard'
      ? new DashboardService(prisma as any).getMetrics('m1')
      : new ReconciliationService(prisma as any).getStats('m1');
    return { prisma, runs, getMetrics };
  }

  it('keeps the all-time rate when a newer date-filtered run covers only one payment', async () => {
    const { getMetrics } = fixture();
    expect((await getMetrics()).reconciliation_rate).toBe(100);
  });

  it('does not inflate coverage by counting matches from repeated full runs', async () => {
    const { prisma, runs, getMetrics } = fixture();
    runs.shift();
    prisma.reconciliationMatch.count.mockImplementation(async ({ where }: any) => where.runId ? 100 : 200);
    runs[0].capturedPayments = 200;
    expect((await getMetrics()).reconciliation_rate).toBe(50);
  });

  it('returns zero when only a filtered run has completed', async () => {
    const { runs, getMetrics } = fixture();
    runs.splice(1);
    expect((await getMetrics()).reconciliation_rate).toBe(0);
  });

  it('returns zero without captured payments', async () => {
    const { runs, getMetrics } = fixture();
    runs[1].capturedPayments = 0;
    expect((await getMetrics()).reconciliation_rate).toBe(0);
  });
});
