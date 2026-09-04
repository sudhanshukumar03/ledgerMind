import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Severity, ReconciliationRunStatus, MatchEntityType, MatchMethod, ExceptionType, ImpactLevel } from '@prisma/client';

export interface RunReconciliationArgs {
  merchantId: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  // Configurables for scoring
  private readonly FINANCIAL_IMPACT_WEIGHT = 0.5; // score per unit difference
  private readonly CUSTOMER_IMPACT_WEIGHT = 20; // HIGH = 3, MEDIUM = 2, LOW = 1
  private readonly AGE_WEIGHT = 0.5; // per hour
  private readonly RECURRENCE_WEIGHT = 5;

  constructor(private prisma: PrismaService) {}

  async runReconciliation(args: RunReconciliationArgs) {
    const { merchantId, dateFrom, dateTo } = args;

    const dateFilter: any = {};
    if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
    if (dateTo) dateFilter['lte'] = new Date(dateTo);
    const dateCondition = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    // 1. Fetch data
    const [orders, payments, refunds, settlements, bankTransactions] = await Promise.all([
      this.prisma.order.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.payment.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.refund.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.settlement.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.bankTransaction.findMany({ where: { merchantId, ...dateCondition } }),
    ]);

    const exceptionsToUpsert: any[] = [];
    const matchesToCreate: any[] = [];

    // 2. Apply Rules & Collect Matches
    this.checkOrderPayment(orders, payments, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkPaymentSettlement(payments, settlements, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkSettlementBank(settlements, bankTransactions, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkRefundDelay(refunds, exceptionsToUpsert, merchantId);
    // Rule 5: Bank credit exists for a FAILED payment — the primary demo scenario
    this.checkBankPaymentMismatch(payments, bankTransactions, exceptionsToUpsert, merchantId);

    // 3. Save Exceptions and Matches within Transaction
    const results = await this.prisma.$transaction(async (tx) => {
      // Create Run Record
      const run = await tx.reconciliationRun.create({
        data: {
          merchantId,
          status: ReconciliationRunStatus.IN_PROGRESS,
          dateFrom: dateFrom ? new Date(dateFrom) : null,
          dateTo: dateTo ? new Date(dateTo) : null,
          totalRecords: orders.length + payments.length + refunds.length + settlements.length + bankTransactions.length,
        },
      });

      // Insert Matches
      for (const match of matchesToCreate) {
        await tx.reconciliationMatch.upsert({
          where: {
            run_pair_unique: {
              runId: run.id,
              sourceType: match.sourceType,
              sourceId: match.sourceId,
              targetType: match.targetType,
              targetId: match.targetId,
            }
          },
          create: {
            ...match,
            runId: run.id,
          },
          update: {},
        });
      }

      let created = 0;
      let updated = 0;
      let counter = 1;

      for (const exc of exceptionsToUpsert) {
        const existing = await tx.exception.findUnique({ where: { dedupKey: exc.dedupKey } });
        
        // Dynamic Severity Calculation
        const occurrenceCount = existing ? existing.occurrenceCount + 1 : 1;
        const now = new Date();
        const firstSeen = existing ? existing.createdAt : now;
        const ageInHours = (now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);

        let customerImpactRating = 1; // LOW
        if (exc.customerImpact === 'HIGH') customerImpactRating = 3;
        if (exc.customerImpact === 'MEDIUM') customerImpactRating = 2;

        const diffAmtStr = exc.differenceAmount.toString();
        const diffNum = Number(diffAmtStr);
        const diffInRupees = Math.abs(diffNum) / 100;

        const score = (this.FINANCIAL_IMPACT_WEIGHT * diffInRupees)
                    + (this.CUSTOMER_IMPACT_WEIGHT * customerImpactRating)
                    + (this.AGE_WEIGHT * ageInHours)
                    + (this.RECURRENCE_WEIGHT * occurrenceCount);
        
        let calculatedSeverity: Severity = 'LOW';
        if (score >= 200) calculatedSeverity = 'CRITICAL';
        else if (score >= 100) calculatedSeverity = 'HIGH';
        else if (score >= 50) calculatedSeverity = 'MEDIUM';

        if (existing) {
          await tx.exception.update({
            where: { id: existing.id },
            data: {
              severity: calculatedSeverity,
              lastSeenAt: now,
              occurrenceCount,
              severityScore: Math.round(score),
            },
          });
          updated++;
        } else {
          // Generate unique Exception ID: EXC-YYYYMMDD-HHMMSS-XXX
          const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
          const excId = `EXC-${timestamp}-${counter.toString().padStart(3, '0')}`;
          counter++;

          await tx.exception.create({
            data: {
              ...exc,
              exceptionId: excId,
              severity: calculatedSeverity,
              severityScore: Math.round(score),
              runId: run.id,
            },
          });
          created++;
        }
      }

      // Complete Run Record
      await tx.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.COMPLETED,
          finishedAt: new Date(),
          matchedCount: matchesToCreate.length,
          exceptionCount: created + updated,
        }
      });

      return { created, updated, totalExceptions: created + updated, runId: run.id };
    });

    return {
      message: 'Reconciliation completed deterministically',
      recordsProcessed: orders.length + payments.length + refunds.length + settlements.length + bankTransactions.length,
      exceptions: results,
    };
  }

  // --- Rule Hierarchy Implementations ---
  
  private checkOrderPayment(orders: any[], payments: any[], exceptions: any[], matches: any[], merchantId: string) {
    for (const order of orders) {
      if (order.status !== 'PAID') continue;

      const relatedPayments = payments.filter((p) => p.orderId === order.id && p.status === 'CAPTURED');

      if (relatedPayments.length === 0) {
        exceptions.push({
          type: 'PAYMENT_MISSING',
          merchantId,
          status: 'OPEN',
          expectedAmount: order.amount,
          actualAmount: BigInt(0),
          differenceAmount: order.amount,
          financialImpact: order.amount,
          customerImpact: 'HIGH',
          dedupKey: `${merchantId}:PAYMENT_MISSING:${order.id}`,
          primaryEntityType: 'ORDER',
          primaryEntityId: order.id,
        });
      } else if (relatedPayments.length > 1) {
        const actual = relatedPayments.reduce((sum, p) => sum + p.amount, BigInt(0));
        exceptions.push({
          type: 'DUPLICATE_PAYMENT',
          merchantId,
          status: 'OPEN',
          expectedAmount: order.amount,
          actualAmount: actual,
          differenceAmount: actual - order.amount,
          financialImpact: actual - order.amount,
          customerImpact: 'HIGH',
          dedupKey: `${merchantId}:DUPLICATE_PAYMENT:${order.id}`,
          primaryEntityType: 'ORDER',
          primaryEntityId: order.id,
        });
      } else {
        const p = relatedPayments[0];
        
        matches.push({
          sourceType: MatchEntityType.ORDER,
          sourceId: order.id,
          targetType: MatchEntityType.PAYMENT,
          targetId: p.id,
          matchScore: 100,
          matchMethod: MatchMethod.EXACT_ID,
        });

        if (p.amount !== order.amount) {
          const diff = p.amount - order.amount;
          exceptions.push({
            type: 'ORDER_PAYMENT_MISMATCH',
            merchantId,
            status: 'OPEN',
            expectedAmount: order.amount,
            actualAmount: p.amount,
            differenceAmount: diff > 0 ? diff : -diff,
            financialImpact: diff > 0 ? diff : -diff,
            customerImpact: 'HIGH',
            dedupKey: `${merchantId}:ORDER_PAYMENT_MISMATCH:${order.id}`,
            primaryEntityType: 'ORDER',
            primaryEntityId: order.id,
          });
        }
      }
    }
  }

  private checkPaymentSettlement(payments: any[], settlements: any[], exceptions: any[], matches: any[], merchantId: string) {
    const captured = payments.filter((p) => p.status === 'CAPTURED');
    const availableSettlements = new Set(settlements.map((s) => s.id));

    for (const payment of captured) {
      // Level 1/3 Match equivalent logic for settlements
      const matched = settlements.find((s) => 
        availableSettlements.has(s.id) && 
        s.amount === payment.amount &&
        Math.abs(new Date(s.createdAt).getTime() - new Date(payment.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000
      );

      if (!matched) {
        exceptions.push({
          type: 'SETTLEMENT_MISSING',
          merchantId,
          status: 'OPEN',
          expectedAmount: payment.amount,
          actualAmount: BigInt(0),
          differenceAmount: payment.amount,
          financialImpact: payment.amount,
          customerImpact: 'MEDIUM',
          dedupKey: `${merchantId}:SETTLEMENT_MISSING:${payment.id}`,
          primaryEntityType: 'PAYMENT',
          primaryEntityId: payment.id,
        });
      } else {
        availableSettlements.delete(matched.id);
        matches.push({
          sourceType: MatchEntityType.PAYMENT,
          sourceId: payment.id,
          targetType: MatchEntityType.SETTLEMENT,
          targetId: matched.id,
          matchScore: 80,
          matchMethod: MatchMethod.AMOUNT_TIME,
        });
      }
    }
  }

  private checkSettlementBank(settlements: any[], bankTransactions: any[], exceptions: any[], matches: any[], merchantId: string) {
    const availableBankTxns = new Set(bankTransactions.map(b => b.id));

    for (const s of settlements) {
      // Level 2 Match: Exact UTR
      let match = bankTransactions.find((b) => availableBankTxns.has(b.id) && b.utr && b.utr === s.utr);
      let matchMethod: MatchMethod = MatchMethod.UTR;
      
      // Level 3 Match: Fallback Amount Proximity
      if (!match) {
        match = bankTransactions.find((b) => 
          availableBankTxns.has(b.id) && 
          b.amount === s.amount &&
          Math.abs(new Date(b.transactionDate).getTime() - new Date(s.createdAt).getTime()) < 3 * 24 * 60 * 60 * 1000
        );
        matchMethod = MatchMethod.AMOUNT_TIME;
      }

      if (!match) {
        exceptions.push({
          type: 'BANK_MISMATCH',
          merchantId,
          status: 'OPEN',
          expectedAmount: s.amount,
          actualAmount: BigInt(0),
          differenceAmount: s.amount,
          financialImpact: s.amount,
          customerImpact: 'MEDIUM',
          dedupKey: `${merchantId}:BANK_MISMATCH:SETTLEMENT:${s.id}`,
          primaryEntityType: 'SETTLEMENT',
          primaryEntityId: s.id,
        });
      } else {
        availableBankTxns.delete(match.id);
        matches.push({
          sourceType: MatchEntityType.SETTLEMENT,
          sourceId: s.id,
          targetType: MatchEntityType.BANK_TRANSACTION,
          targetId: match.id,
          matchScore: matchMethod === MatchMethod.UTR ? 100 : 80,
          matchMethod,
        });

        if (match.amount !== s.amount) {
          const diff = s.amount - match.amount;
          exceptions.push({
            type: 'SETTLEMENT_AMOUNT_MISMATCH',
            merchantId,
            status: 'OPEN',
            expectedAmount: s.amount,
            actualAmount: match.amount,
            differenceAmount: diff > 0 ? diff : -diff,
            financialImpact: diff > 0 ? diff : -diff,
            customerImpact: 'MEDIUM',
            dedupKey: `${merchantId}:SETTLEMENT_AMOUNT_MISMATCH:${s.id}`,
            primaryEntityType: 'SETTLEMENT',
            primaryEntityId: s.id,
          });
        }
      }
    }
  }

  private checkRefundDelay(refunds: any[], exceptions: any[], merchantId: string) {
    const now = new Date();
    for (const r of refunds) {
      if (r.status === 'PROCESSING') {
        const hoursDiff = (now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 24) {
          exceptions.push({
            type: 'REFUND_DELAY',
            merchantId,
            status: 'OPEN',
            expectedAmount: r.amount,
            actualAmount: r.amount,
            differenceAmount: BigInt(0),
            financialImpact: r.amount,
            customerImpact: 'LOW',
            dedupKey: `${merchantId}:REFUND_DELAY:${r.id}`,
            primaryEntityType: 'REFUND',
            primaryEntityId: r.id,
          });
        }
      }
    }
  }

  /**
   * Rule 5 — Bank credit exists for a FAILED payment.
   * This is the primary demo scenario (docs/14-BUILDATHON-DEMO.md Scene 3).
   * A FAILED payment means the merchant was NOT supposed to receive money,
   * yet the bank statement shows a corresponding credit — indicating a
   * payment-state inconsistency between the gateway and the bank.
   */
  private checkBankPaymentMismatch(
    payments: any[],
    bankTransactions: any[],
    exceptions: any[],
    merchantId: string,
  ) {
    const failedPayments = payments.filter((p) => p.status === 'FAILED');
    for (const payment of failedPayments) {
      // Match by amount only — UTR is not available on failed payments
      const bankCredit = bankTransactions.find(
        (b) =>
          b.transactionType === 'CREDIT' &&
          b.amount === payment.amount &&
          !b.settlementId, // unreconciled bank credit
      );
      if (bankCredit) {
        exceptions.push({
          type: ExceptionType.BANK_PAYMENT_MISMATCH,
          merchantId,
          status: 'OPEN',
          expectedAmount: BigInt(0),      // expected: no credit (payment failed)
          actualAmount: payment.amount,   // actual: bank shows credit
          differenceAmount: payment.amount,
          financialImpact: payment.amount,
          customerImpact: ImpactLevel.HIGH,
          dedupKey: `${merchantId}:BANK_PAYMENT_MISMATCH:${payment.id}`,
          primaryEntityType: MatchEntityType.PAYMENT,
          primaryEntityId: payment.id,
        });
      }
    }
  }

  // ─── Query Methods ──────────────────────────────────────────────────────────

  /**
   * Returns the 20 most recent reconciliation runs for a merchant.
   * Used by GET /reconciliation/runs (frontend ReconciliationPage).
   */
  async listRuns(merchantId: string) {
    const rows = await this.prisma.reconciliationRun.findMany({
      where: { merchantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    // Serialise BigInt fields for JSON transport
    return rows.map((r) => ({
      ...r,
      startedAt: r.startedAt?.toISOString(),
      completedAt: r.finishedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Aggregated stats consumed by:
   *  - GET /reconciliation/stats  → dashboardApi.getStats()
   * Shape matches the DashboardStats interface in api-client.ts.
   */
  async getStats(merchantId: string) {
    const [
      volumeAgg,
      openExceptions,
      criticalExceptions,
      pendingApprovals,
      exceptionsByType,
      exceptionsBySeverity,
      totalPayments,
      matchedCount,
      resolvedToday,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { merchantId, status: 'CAPTURED' },
      }),
      this.prisma.exception.count({ where: { merchantId, status: 'OPEN' } }),
      this.prisma.exception.count({ where: { merchantId, status: 'OPEN', severity: 'CRITICAL' } }),
      this.prisma.action.count({ where: { merchantId, status: 'PENDING_APPROVAL' } }),
      this.prisma.exception.groupBy({
        by: ['type'],
        where: { merchantId },
        _count: { _all: true },
      }),
      this.prisma.exception.groupBy({
        by: ['severity'],
        where: { merchantId },
        _count: { _all: true },
      }),
      this.prisma.payment.count({ where: { merchantId } }),
      // matchedCount: count distinct payment-level matches across all runs
      this.prisma.reconciliationMatch.count({
        where: { sourceType: MatchEntityType.PAYMENT },
      }),
      this.prisma.exception.count({
        where: {
          merchantId,
          status: 'RESOLVED',
          resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const totalCapturedVolume = volumeAgg._sum.amount ?? BigInt(0);
    const reconciliationRate =
      totalPayments > 0
        ? Number(((matchedCount / totalPayments) * 100).toFixed(2))
        : 0;

    return {
      total_transaction_volume: totalCapturedVolume.toString(),
      reconciliation_rate: reconciliationRate,
      open_exceptions: openExceptions,
      critical_exceptions: criticalExceptions,
      pending_approvals: pendingApprovals,
      resolved_today: resolvedToday,
      exceptions_by_type: exceptionsByType.map((e) => ({
        type: e.type,
        count: e._count._all,
      })),
      exceptions_by_severity: exceptionsBySeverity.map((e) => ({
        severity: e.severity,
        count: e._count._all,
      })),
    };
  }
}
