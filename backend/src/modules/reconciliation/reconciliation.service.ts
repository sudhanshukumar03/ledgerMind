import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, Severity, ReconciliationRunStatus, MatchEntityType, MatchMethod, ExceptionType, ImpactLevel, ExceptionStatus, Order, Payment, Refund, Settlement, BankTransaction } from '@prisma/client';

/**
 * Evidence item for an exception audit trail.
 * Invariant: occurredAt reflects the domain event timestamp, not the run timestamp, to preserve chronology.
 */
export interface ExceptionEventDraft {
  eventType: string;
  entityType: string;
  entityId: string;
  snapshot: Prisma.InputJsonValue;
  occurredAt: Date;
}

export interface ExceptionDraft {
  type: ExceptionType;
  merchantId: string;
  status: ExceptionStatus;
  expectedAmount: bigint;
  actualAmount: bigint;
  differenceAmount: bigint;
  financialImpact: bigint;
  customerImpact: ImpactLevel;
  dedupKey: string;
  primaryEntityType: string;
  primaryEntityId: string;
  events: ExceptionEventDraft[];
}

/**
 * Serializes Prisma entities into JSON-safe snapshots for Json columns.
 * Converts BigInt to string to avoid serialization failures in environments without a global BigInt.toJSON patch.
 */
function toSnapshot(entity: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(entity, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  );
}

function evidence(
  eventType: string,
  entityType: string,
  entity: { id: string },
  occurredAt: Date | null | undefined,
): ExceptionEventDraft {
  return {
    eventType,
    entityType,
    entityId: entity.id,
    snapshot: toSnapshot(entity),
    occurredAt: occurredAt ?? new Date(),
  };
}

export interface MatchDraft {
  sourceType: MatchEntityType;
  sourceId: string;
  targetType: MatchEntityType;
  targetId: string;
  matchScore: number;
  matchMethod: MatchMethod;
}

export interface RunReconciliationArgs {
  merchantId: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Deterministic 3-way reconciliation engine (Gateway, Bank, Ledger).
 * Matching ladder: Exact ID -> UTR -> Amount and time window proximity.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  // Weights prioritize customer-facing exposure first, followed by monetary scale and unresolved duration.
  private readonly FINANCIAL_IMPACT_WEIGHT = 0.5;
  private readonly CUSTOMER_IMPACT_WEIGHT = 20;
  private readonly AGE_WEIGHT = 0.5;
  private readonly RECURRENCE_WEIGHT = 5;

  constructor(private prisma: PrismaService) {}

  /**
   * Reconciles gateway records against bank transactions for a single merchant over an optional window.
   * Idempotent: repeated runs update severity and occurrence counts without creating duplicate exceptions.
   *
   * @throws PrismaClientKnownRequestError if transaction persistence fails.
   */
  async runReconciliation(args: RunReconciliationArgs) {
    const { merchantId, dateFrom, dateTo } = args;

    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
    if (dateTo) dateFilter['lte'] = new Date(dateTo);
    const dateCondition = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [orders, payments, refunds, settlements, bankTransactions] = await Promise.all([
      this.prisma.order.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.payment.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.refund.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.settlement.findMany({ where: { merchantId, ...dateCondition } }),
      this.prisma.bankTransaction.findMany({ where: { merchantId, ...dateCondition } }),
    ]);

    const exceptionsToUpsert: ExceptionDraft[] = [];
    const matchesToCreate: MatchDraft[] = [];

    this.checkOrderPayment(orders, payments, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkPaymentSettlement(payments, settlements, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkSettlementBank(settlements, bankTransactions, exceptionsToUpsert, matchesToCreate, merchantId);
    this.checkRefundDelay(refunds, exceptionsToUpsert, merchantId);
    // Detects orphan credits where the bank settled funds despite gateway failure.
    this.checkBankPaymentMismatch(payments, bankTransactions, exceptionsToUpsert, merchantId);

    const results = await this.prisma.$transaction(async (tx) => {
      const run = await tx.reconciliationRun.create({
        data: {
          merchantId,
          status: ReconciliationRunStatus.IN_PROGRESS,
          dateFrom: dateFrom ? new Date(dateFrom) : null,
          dateTo: dateTo ? new Date(dateTo) : null,
          totalRecords: orders.length + payments.length + refunds.length + settlements.length + bankTransactions.length,
        },
      });

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
        
        const occurrenceCount = existing ? existing.occurrenceCount + 1 : 1;
        const now = new Date();
        const firstSeen = existing ? existing.createdAt : now;
        const ageInHours = (now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);

        let customerImpactRating = 1; // LOW
        if (exc.customerImpact === 'HIGH') customerImpactRating = 3;
        if (exc.customerImpact === 'MEDIUM') customerImpactRating = 2;

        // Difference amount is stored in paise; convert to rupees so weight scales with standard currency units.
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
          await this.writeExceptionEvents(tx, existing.id, exc, now);
          updated++;
        } else {
          // Counter suffix guarantees unique keys when multiple exceptions are detected within the same second.
          const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
          const excId = `EXC-${timestamp}-${counter.toString().padStart(3, '0')}`;
          counter++;

          const createdExc = await tx.exception.create({
            data: {
              ...this.toExceptionData(exc),
              exceptionId: excId,
              severity: calculatedSeverity,
              severityScore: Math.round(score),
              runId: run.id,
            },
          });
          await this.writeExceptionEvents(tx, createdExc.id, exc, now);
          created++;
        }
      }

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

  /**
   * Strips transient timeline events so draft payloads match the Prisma Exception table schema.
   */
  private toExceptionData(exc: ExceptionDraft) {
    const { events: _events, ...data } = exc;
    return data;
  }

  /**
   * Persists evidence timeline events and appends the terminal EXCEPTION_DETECTED record.
   * Upserts ensure re-runs refresh state snapshots without duplicating timeline entries.
   */
  private async writeExceptionEvents(
    tx: Prisma.TransactionClient,
    exceptionId: string,
    exc: ExceptionDraft,
    detectedAt: Date,
  ) {
    const events: ExceptionEventDraft[] = [
      ...exc.events,
      {
        eventType: 'EXCEPTION_DETECTED',
        entityType: exc.primaryEntityType,
        entityId: exc.primaryEntityId,
        snapshot: {
          type: exc.type,
          financialImpact: exc.financialImpact.toString(),
          differenceAmount: exc.differenceAmount.toString(),
        },
        occurredAt: detectedAt,
      },
    ];

    for (const ev of events) {
      await tx.exceptionEvent.upsert({
        where: {
          exception_event_unique: {
            exceptionId,
            eventType: ev.eventType,
            entityId: ev.entityId,
          },
        },
        create: {
          exceptionId,
          eventType: ev.eventType,
          entityType: ev.entityType,
          entityId: ev.entityId,
          snapshot: ev.snapshot,
          occurredAt: ev.occurredAt,
        },
        update: {
          entityType: ev.entityType,
          snapshot: ev.snapshot,
          occurredAt: ev.occurredAt,
        },
      });
    }
  }
  
  /**
   * Identifies breaks between orders and gateway payments.
   * Flags unpaid orders with missing capture, split/duplicate captures, and currency amount mismatches.
   */
  private checkOrderPayment(orders: Order[], payments: Payment[], exceptions: ExceptionDraft[], matches: MatchDraft[], merchantId: string) {
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
          events: [evidence('ORDER_PLACED', 'ORDER', order, order.createdAt)],
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
          events: [
            evidence('ORDER_PLACED', 'ORDER', order, order.createdAt),
            ...relatedPayments.map((p) =>
              evidence('PAYMENT_CAPTURED', 'PAYMENT', p, p.createdAt),
            ),
          ],
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
            events: [
              evidence('ORDER_PLACED', 'ORDER', order, order.createdAt),
              evidence('PAYMENT_CAPTURED', 'PAYMENT', p, p.createdAt),
            ],
          });
        }
      }
    }
  }

  /**
   * Matches captured payments to settlement batches within a 7-day clearing window.
   * Flags captured payments that have no corresponding settlement batch.
   */
  private checkPaymentSettlement(payments: Payment[], settlements: Settlement[], exceptions: ExceptionDraft[], matches: MatchDraft[], merchantId: string) {
    const captured = payments.filter((p) => p.status === 'CAPTURED');
    const availableSettlements = new Set(settlements.map((s) => s.id));

    for (const payment of captured) {
      // 7-day window accommodates standard rolling settlement batch schedules.
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
          events: [evidence('PAYMENT_CAPTURED', 'PAYMENT', payment, payment.createdAt)],
        });
      } else {
        // Enforce 1-to-1 matching to prevent multiple payments claiming the same settlement batch.
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

  /**
   * Reconciles gateway settlement records against bank account credit entries.
   * Prefers exact UTR identifier matching; falls back to exact amount within a 3-day clearing window.
   */
  private checkSettlementBank(settlements: Settlement[], bankTransactions: BankTransaction[], exceptions: ExceptionDraft[], matches: MatchDraft[], merchantId: string) {
    const availableBankTxns = new Set(bankTransactions.map(b => b.id));

    for (const s of settlements) {
      let match = bankTransactions.find((b) => availableBankTxns.has(b.id) && b.utr && b.utr === s.utr);
      let matchMethod: MatchMethod = MatchMethod.UTR;
      
      // Fallback handles bank statements missing explicit UTR headers within standard NEFT/RTGS settlement turnaround.
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
          events: [evidence('SETTLEMENT_CREATED', 'SETTLEMENT', s, s.createdAt)],
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
            events: [
              evidence('SETTLEMENT_CREATED', 'SETTLEMENT', s, s.createdAt),
              evidence('BANK_CREDIT', 'BANK_TRANSACTION', match, match.transactionDate),
            ],
          });
        }
      }
    }
  }

  /**
   * Flags refunds stuck in PROCESSING beyond the 24-hour SLA threshold.
   */
  private checkRefundDelay(refunds: Refund[], exceptions: ExceptionDraft[], merchantId: string) {
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
            events: [evidence('REFUND_INITIATED', 'REFUND', r, r.createdAt)],
          });
        }
      }
    }
  }

  /**
   * Flags state divergence where the bank received credit for a payment marked FAILED by the gateway.
   * Occurs during late gateway drop-offs where the acquiring bank captured funds but callback failed.
   */
  private checkBankPaymentMismatch(
    payments: Payment[],
    bankTransactions: BankTransaction[],
    exceptions: ExceptionDraft[],
    merchantId: string,
  ) {
    const failedPayments = payments.filter((p) => p.status === 'FAILED');
    for (const payment of failedPayments) {
      // UTR is unavailable on failed gateway transactions; match against unreconciled credits by amount.
      const bankCredit = bankTransactions.find(
        (b) =>
          b.transactionType === 'CREDIT' &&
          b.amount === payment.amount &&
          !b.settlementId,
      );
      if (bankCredit) {
        exceptions.push({
          type: ExceptionType.BANK_PAYMENT_MISMATCH,
          merchantId,
          status: 'OPEN',
          expectedAmount: BigInt(0),
          actualAmount: payment.amount,
          differenceAmount: payment.amount,
          financialImpact: payment.amount,
          customerImpact: ImpactLevel.HIGH,
          dedupKey: `${merchantId}:BANK_PAYMENT_MISMATCH:${payment.id}`,
          primaryEntityType: MatchEntityType.PAYMENT,
          primaryEntityId: payment.id,
          events: [
            evidence('PAYMENT_FAILED', 'PAYMENT', payment, payment.createdAt),
            evidence('BANK_CREDIT_RECEIVED', 'BANK_TRANSACTION', bankCredit, bankCredit.transactionDate),
          ],
        });
      }
    }
  }

  /**
   * Fetches recent reconciliation runs for a merchant with ISO-formatted timestamps for JSON clients.
   */
  async listRuns(merchantId: string) {
    const rows = await this.prisma.reconciliationRun.findMany({
      where: { merchantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({
      ...r,
      startedAt: r.startedAt?.toISOString(),
      completedAt: r.finishedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Aggregates merchant ledger metrics: capture volume, match rate, and active exception breakdowns.
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
      // Counts payment-level matches to calculate reconciliation coverage against total captured payments.
      this.prisma.reconciliationMatch.count({
        where: { sourceType: MatchEntityType.PAYMENT, run: { merchantId } },
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
