import { randomUUID } from 'node:crypto';
import { parseDateRange, requireInr } from '../../common/utils/pagination.js';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  Prisma,
  Severity,
  ReconciliationRunStatus,
  MatchEntityType,
  MatchMethod,
  ExceptionType,
  ImpactLevel,
  ExceptionStatus,
  Order,
  Payment,
  Refund,
  Settlement,
  BankTransaction,
} from '@prisma/client';

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

function evidence<T extends { id: string }>(
  eventType: string,
  entityType: string,
  entity: T,
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

const abs = (amount: bigint) => (amount < 0n ? -amount : amount);
const hasCapture = (p: Payment) =>
  ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status);
const sla = (name: string, fallbackHours: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0
    ? value * 3600000
    : fallbackHours * 3600000;
};
const overdue = (at: Date, duration: number) =>
  Date.now() - at.getTime() > duration;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  constructor(private prisma: PrismaService) {}

  async runReconciliation(args: RunReconciliationArgs) {
    const range = parseDateRange(args.dateFrom, args.dateTo);
    const { merchantId } = args;
    // Commit a visible run before doing financial work. Coordinate competing
    // starts with a merchant advisory lock; an interrupted run expires explicitly.
    const started = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${merchantId}, 2))`;
      await tx.reconciliationRun.updateMany({
        where: {
          merchantId,
          status: 'IN_PROGRESS',
          startedAt: { lt: new Date(Date.now() - 300000) },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Run interrupted or lease expired',
          finishedAt: new Date(),
        },
      });
      const existing = await tx.reconciliationRun.findFirst({
        where: { merchantId, status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
      });
      if (existing) return { run: existing, coalesced: true };
      return {
        run: await tx.reconciliationRun.create({
          data: { merchantId, dateFrom: range.gte, dateTo: range.lte },
        }),
        coalesced: false,
      };
    });
    if (started.coalesced)
      return {
        status: 'IN_PROGRESS',
        coalesced: true,
        runId: started.run.id,
        message: 'A reconciliation run is already in progress',
      };
    const runId = started.run.id;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${merchantId}, 1))`;
          const [orders, payments, refunds, settlements, bank, allocations] =
            await Promise.all([
              tx.order.findMany({ where: { merchantId } }),
              tx.payment.findMany({ where: { merchantId } }),
              tx.refund.findMany({ where: { merchantId } }),
              tx.settlement.findMany({ where: { merchantId } }),
              tx.bankTransaction.findMany({ where: { merchantId } }),
              tx.settlementAllocation.findMany({
                where: { settlement: { merchantId } },
              }),
            ]);
          for (const record of [
            ...orders,
            ...payments,
            ...settlements,
            ...bank,
          ])
            requireInr(record.currency);
          const scoped = !!(args.dateFrom || args.dateTo);
          const inRange = (at: Date) =>
            (!range.gte || at >= range.gte) && (!range.lte || at <= range.lte);
          const anchors = new Set<string>();
          for (const record of [...orders, ...payments, ...refunds])
            if (!scoped || inRange(record.createdAt)) anchors.add(record.id);
          for (const record of settlements)
            if (!scoped || inRange(record.settlementDate))
              anchors.add(record.id);
          for (const record of bank)
            if (!scoped || inRange(record.transactionDate))
              anchors.add(record.id);
          // Expand selected anchors through explicit relations, retaining evidence
          // outside the requested date window. Never infer membership by amount.
          let changed = true;
          const link = (a: string, b: string | null) => {
            if (b && (anchors.has(a) || anchors.has(b))) {
              const size = anchors.size;
              anchors.add(a);
              anchors.add(b);
              if (anchors.size !== size) changed = true;
            }
          };
          while (changed) {
            changed = false;
            for (const p of payments) link(p.id, p.orderId);
            for (const r of refunds) link(r.id, r.paymentId);
            for (const a of allocations) link(a.paymentId, a.settlementId);
            for (const b of bank) {
              link(b.id, b.settlementId);
              link(b.id, b.paymentId);
              link(b.id, b.refundId);
            }
          }
          const exceptions: ExceptionDraft[] = [],
            matches: MatchDraft[] = [];
          this.checkOrderPayment(
            orders,
            payments,
            exceptions,
            matches,
            merchantId,
            refunds,
          );
          this.checkPaymentSettlement(
            payments,
            settlements,
            exceptions,
            matches,
            merchantId,
            allocations,
            refunds,
          );
          this.checkSettlementBank(
            settlements,
            bank,
            exceptions,
            matches,
            merchantId,
          );
          this.checkRefundDelay(refunds, exceptions, merchantId);
          for (const payment of payments) {
            const returned = refunds.filter(
              (r) => r.paymentId === payment.id && r.status === 'PROCESSED',
            );
            const totalReturned = returned.reduce(
              (sum, r) => sum + r.amount,
              0n,
            );
            if (totalReturned > payment.amount)
              this.draft(
                exceptions,
                merchantId,
                'REFUND_MISMATCH',
                'PAYMENT',
                payment.id,
                payment.amount,
                totalReturned,
                'HIGH',
                returned.map((r) =>
                  evidence(
                    'OVER_REFUND',
                    'REFUND',
                    r,
                    r.processedAt ?? r.createdAt,
                  ),
                ),
              );
          }
          this.checkBankPaymentMismatch(
            payments,
            bank,
            exceptions,
            merchantId,
            matches,
          );
          this.checkRefundBank(refunds, bank, exceptions, matches, merchantId);
          const used = new Set(
            matches
              .filter((m) => m.targetType === 'BANK_TRANSACTION')
              .map((m) => m.targetId),
          );
          for (const b of bank.filter(
            (b) => b.status === 'POSTED' && !used.has(b.id),
          )) {
            this.draft(
              exceptions,
              merchantId,
              'UNKNOWN_EXCEPTION',
              'BANK_TRANSACTION',
              b.id,
              0n,
              b.amount,
              'MEDIUM',
              [
                evidence(
                  'UNALLOCATED_BANK_MOVEMENT',
                  'BANK_TRANSACTION',
                  b,
                  b.valueAt ?? b.transactionDate,
                ),
              ],
            );
          }
          const selected = exceptions.filter(
            (e) => !scoped || anchors.has(e.primaryEntityId),
          );
          let created = 0,
            updated = 0,
            resolved = 0;
          const now = new Date();
          for (const draft of selected) {
            let existing = await tx.exception.findUnique({
              where: { dedupKey: draft.dedupKey },
            });
            if (existing) {
              // Derive lifecycle fields from the locked current row, including
              // decisions committed after the initial detector observation.
              await tx.$queryRaw`SELECT id FROM exceptions WHERE id = ${existing.id}::uuid FOR UPDATE`;
              existing = await tx.exception.findUnique({
                where: { id: existing.id },
              });
            }
            const occurrenceCount = existing
              ? existing.occurrenceCount +
                (existing.status === 'RESOLVED' ? 1 : 0)
              : 1;
            const ageHours = existing
              ? Math.max(
                  0,
                  (now.getTime() - existing.createdAt.getTime()) / 3600000,
                )
              : 0;
            const rating =
              draft.customerImpact === 'HIGH'
                ? 3
                : draft.customerImpact === 'MEDIUM'
                  ? 2
                  : 1;
            const score = Math.min(
              2147483647,
              Math.round(
                Number(abs(draft.financialImpact)) / 200 +
                  rating * 20 +
                  ageHours * 0.5 +
                  occurrenceCount * 5,
              ),
            );
            const severity: Severity =
              score >= 200
                ? 'CRITICAL'
                : score >= 100
                  ? 'HIGH'
                  : score >= 50
                    ? 'MEDIUM'
                    : 'LOW';
            const { events, ...facts } = draft;
            const status =
              existing?.status === 'IGNORED'
                ? 'IGNORED'
                : existing?.status === 'INVESTIGATING'
                  ? 'INVESTIGATING'
                  : 'OPEN';
            const row = await tx.exception.upsert({
              where: { dedupKey: draft.dedupKey },
              create: {
                ...facts,
                status,
                exceptionId: `EXC-${randomUUID()}`,
                severity,
                severityScore: score,
                runId,
              },
              update: {
                ...facts,
                status,
                severity,
                severityScore: score,
                occurrenceCount,
                lastSeenAt: now,
                runId,
                resolvedAt: null,
                resolutionNote:
                  existing?.status === 'RESOLVED'
                    ? 'Reopened: discrepancy observed again'
                    : existing?.resolutionNote,
              },
            });
            if (existing?.status === 'RESOLVED' && status !== 'IGNORED') {
              await tx.exceptionEvent.create({
                data: {
                  exceptionId: row.id,
                  eventType: 'REOPENED',
                  entityType: 'RECONCILIATION_RUN',
                  entityId: runId,
                  occurredAt: now,
                  snapshot: {
                    previousStatus: existing.status,
                    status: row.status,
                  },
                },
              });
            }
            for (const ev of events)
              await tx.exceptionEvent.upsert({
                where: {
                  exception_event_unique: {
                    exceptionId: row.id,
                    eventType: ev.eventType,
                    entityId: ev.entityId,
                  },
                },
                create: { ...ev, exceptionId: row.id },
                update: { snapshot: ev.snapshot, occurredAt: ev.occurredAt },
              });
            existing ? updated++ : created++;
          }
          const keys = selected.map((e) => e.dedupKey);
          const candidates = await tx.exception.findMany({
            where: {
              merchantId,
              status: { in: ['OPEN', 'INVESTIGATING'] },
              dedupKey: { notIn: keys },
              ...(scoped ? { primaryEntityId: { in: [...anchors] } } : {}),
            },
          });
          // Only deterministic detector-owned facts are eligible for automatic closure.
          for (const old of candidates) {
            if (!old.dedupKey.startsWith(`${merchantId}:`)) continue;
            await tx.exception.update({
              where: { id: old.id },
              data: {
                status: 'RESOLVED',
                resolvedAt: now,
                resolutionNote:
                  'Discrepancy no longer present in complete evaluated evidence',
                runId,
              },
            });
            await tx.exceptionEvent.create({
              data: {
                exceptionId: old.id,
                eventType: 'RESOLVED',
                entityType: 'RECONCILIATION_RUN',
                entityId: runId,
                occurredAt: now,
                snapshot: {
                  previousStatus: old.status,
                  status: 'RESOLVED',
                  reason:
                    'Complete evidence no longer contains this discrepancy',
                },
              },
            });
            resolved++;
          }
          const selectedMatches = matches.filter(
            (m) =>
              !scoped || anchors.has(m.sourceId) || anchors.has(m.targetId),
          );
          for (const match of selectedMatches)
            await tx.reconciliationMatch.upsert({
              where: {
                run_pair_unique: {
                  runId,
                  ...{
                    sourceType: match.sourceType,
                    sourceId: match.sourceId,
                    targetType: match.targetType,
                    targetId: match.targetId,
                  },
                },
              },
              create: { ...match, runId },
              update: {},
            });
          const captures = payments.filter(
            (p) => hasCapture(p) && (!scoped || anchors.has(p.id)),
          );
          const covered = new Set(
            selectedMatches
              .filter(
                (m) =>
                  m.sourceType === 'PAYMENT' && m.targetType === 'SETTLEMENT',
              )
              .map((m) => m.sourceId),
          );
          const totalRecords =
            orders.length +
            payments.length +
            refunds.length +
            settlements.length +
            bank.length;
          await tx.reconciliationRun.update({
            where: { id: runId },
            data: {
              status: 'COMPLETED',
              finishedAt: now,
              totalRecords: scoped ? anchors.size : totalRecords,
              matchedCount: selectedMatches.length,
              exceptionCount: selected.length,
              resolvedCount: resolved,
              capturedPayments: captures.length,
              matchedPayments: captures.filter((p) => covered.has(p.id)).length,
              capturedVolume: captures.reduce((sum, p) => sum + p.amount, 0n),
            },
          });
          return {
            status: 'COMPLETED',
            message: 'Reconciliation completed deterministically',
            runId,
            recordsProcessed: scoped ? anchors.size : totalRecords,
            exceptions: {
              created,
              updated,
              resolved,
              totalExceptions: selected.length,
              runId,
            },
          };
        },
        { timeout: 120000, maxWait: 10000 },
      );
    } catch (error) {
      await this.prisma.reconciliationRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: String(error),
        },
      });
      throw error;
    }
  }

  private draft(
    out: ExceptionDraft[],
    merchantId: string,
    type: ExceptionType,
    entityType: string,
    id: string,
    expected: bigint,
    actual: bigint,
    impact: ImpactLevel,
    events: ExceptionEventDraft[],
  ) {
    out.push({
      type,
      merchantId,
      status: 'OPEN',
      expectedAmount: expected,
      actualAmount: actual,
      differenceAmount: abs(expected - actual),
      financialImpact: abs(expected - actual),
      customerImpact: impact,
      dedupKey: `${merchantId}:${type}:${type === 'BANK_MISMATCH' ? `${entityType}:` : ''}${id}${events[0]?.eventType === 'SETTLEMENT_ALLOCATION' ? ':ALLOCATION' : ''}`,
      primaryEntityType: entityType,
      primaryEntityId: id,
      events,
    });
  }
  private match(
    out: MatchDraft[],
    sourceType: MatchEntityType,
    sourceId: string,
    targetType: MatchEntityType,
    targetId: string,
    method: MatchMethod = 'EXACT_ID',
  ) {
    out.push({
      sourceType,
      sourceId,
      targetType,
      targetId,
      matchMethod: method,
      matchScore: method === 'AMOUNT_TIME' ? 80 : 100,
    });
  }

  private checkOrderPayment(
    orders: Order[],
    payments: Payment[],
    exceptions: ExceptionDraft[],
    matches: MatchDraft[],
    merchantId: string,
    refunds: Refund[] = [],
  ) {
    for (const order of orders) {
      const captured = payments.filter(
        (p) =>
          p.orderId === order.id &&
          hasCapture(p) &&
          p.currency === order.currency,
      );
      const total = captured.reduce((sum, p) => sum + p.amount, 0n);
      const returned = refunds
        .filter(
          (r) =>
            r.status === 'PROCESSED' &&
            captured.some((p) => p.id === r.paymentId),
        )
        .reduce((sum, r) => sum + r.amount, 0n);
      const ev = [
        evidence('ORDER_PLACED', 'ORDER', order, order.createdAt),
        ...captured.map((p) =>
          evidence(
            'PAYMENT_CAPTURED',
            'PAYMENT',
            p,
            p.capturedAt ?? p.createdAt,
          ),
        ),
      ];
      if (['CANCELLED', 'FAILED'].includes(order.status)) {
        if (total > returned)
          this.draft(
            exceptions,
            merchantId,
            'ORDER_PAYMENT_MISMATCH',
            'ORDER',
            order.id,
            0n,
            total - returned,
            'HIGH',
            ev,
          );
        continue;
      }
      if (
        total < order.amount &&
        (order.status === 'PAID' ||
          overdue(order.createdAt, sla('ORDER_PAYMENT_SLA_HOURS', 1)))
      ) {
        this.draft(
          exceptions,
          merchantId,
          total === 0n ? 'PAYMENT_MISSING' : 'ORDER_PAYMENT_MISMATCH',
          'ORDER',
          order.id,
          order.amount,
          total,
          'HIGH',
          ev,
        );
      } else if (total - returned > order.amount) {
        this.draft(
          exceptions,
          merchantId,
          'DUPLICATE_PAYMENT',
          'ORDER',
          order.id,
          order.amount,
          total - returned,
          'HIGH',
          ev,
        );
      } else if (total >= order.amount)
        for (const p of captured)
          this.match(matches, 'ORDER', order.id, 'PAYMENT', p.id);
    }
  }

  private checkPaymentSettlement(
    payments: Payment[],
    settlements: Settlement[],
    exceptions: ExceptionDraft[],
    matches: MatchDraft[],
    merchantId: string,
    allocations: {
      paymentId: string;
      settlementId: string;
      grossAmount: bigint;
      refundAmount: bigint;
      feeAmount: bigint;
      taxAmount: bigint;
      adjustmentAmount: bigint;
    }[] = [],
    refunds: Refund[] = [],
  ) {
    const validSettlements = new Set<string>();
    for (const s of settlements.filter((s) => s.status === 'PROCESSED')) {
      const members = allocations.filter((a) => a.settlementId === s.id);
      const net = members.reduce(
        (sum, a) =>
          sum +
          a.grossAmount -
          a.refundAmount -
          a.feeAmount -
          a.taxAmount +
          a.adjustmentAmount,
        0n,
      );
      const valid =
        members.length > 0 &&
        members.every((a) => {
          const p = payments.find(
            (p) =>
              p.id === a.paymentId &&
              p.merchantId === merchantId &&
              p.currency === s.currency &&
              hasCapture(p),
          );
          return (
            !!p &&
            a.grossAmount >= 0n &&
            a.refundAmount >= 0n &&
            a.feeAmount >= 0n &&
            a.taxAmount >= 0n &&
            (a.grossAmount > 0n ||
              a.refundAmount > 0n ||
              a.feeAmount > 0n ||
              a.taxAmount > 0n ||
              a.adjustmentAmount !== 0n) &&
            allocations
              .filter(
                (x) =>
                  x.paymentId === a.paymentId &&
                  settlements.some(
                    (batch) =>
                      batch.id === x.settlementId &&
                      batch.status === 'PROCESSED',
                  ),
              )
              .reduce((sum, x) => sum + x.grossAmount, 0n) <= p.amount &&
            allocations
              .filter(
                (x) =>
                  x.paymentId === a.paymentId &&
                  settlements.some(
                    (batch) =>
                      batch.id === x.settlementId &&
                      batch.status === 'PROCESSED',
                  ),
              )
              .reduce((sum, x) => sum + x.refundAmount, 0n) <=
              refunds
                .filter(
                  (r) =>
                    r.paymentId === a.paymentId && r.status === 'PROCESSED',
                )
                .reduce((sum, r) => sum + r.amount, 0n)
          );
        });
      if (!valid || net !== s.amount) {
        this.draft(
          exceptions,
          merchantId,
          'SETTLEMENT_AMOUNT_MISMATCH',
          'SETTLEMENT',
          s.id,
          net,
          s.amount,
          'MEDIUM',
          [
            evidence(
              'SETTLEMENT_ALLOCATION',
              'SETTLEMENT',
              { ...s, allocations: members },
              s.settlementDate,
            ),
          ],
        );
      } else validSettlements.add(s.id);
    }
    for (const p of payments.filter(hasCapture)) {
      const members = allocations.filter(
        (a) => a.paymentId === p.id && validSettlements.has(a.settlementId),
      );
      const allocated = members.reduce((sum, a) => sum + a.grossAmount, 0n);
      if (allocated === p.amount)
        for (const a of members)
          this.match(matches, 'PAYMENT', p.id, 'SETTLEMENT', a.settlementId);
      else if (
        allocated > p.amount ||
        overdue(
          p.capturedAt ?? p.createdAt,
          sla('PAYMENT_SETTLEMENT_SLA_HOURS', 168),
        )
      )
        this.draft(
          exceptions,
          merchantId,
          'SETTLEMENT_MISSING',
          'PAYMENT',
          p.id,
          p.amount,
          allocated,
          'MEDIUM',
          [
            evidence(
              'PAYMENT_CAPTURED',
              'PAYMENT',
              p,
              p.capturedAt ?? p.createdAt,
            ),
          ],
        );
    }
  }

  private checkSettlementBank(
    settlements: Settlement[],
    bank: BankTransaction[],
    exceptions: ExceptionDraft[],
    matches: MatchDraft[],
    merchantId: string,
  ) {
    const batches = settlements.filter((s) => s.status === 'PROCESSED');
    const eligible = bank.filter((b) => {
      if (
        b.status !== 'POSTED' ||
        b.transactionType !== 'CREDIT' ||
        b.merchantId !== merchantId ||
        b.refundId ||
        b.paymentId
      )
        return false;
      // A stored link and a UTR naming a different known batch are contradictory.
      const referenced = b.utr
        ? settlements.filter(
            (s) => s.currency === b.currency && s.utr === b.utr,
          )
        : [];
      return (
        !b.settlementId ||
        referenced.length === 0 ||
        referenced.some((s) => s.id === b.settlementId)
      );
    });
    const compatible = (s: Settlement, b: BankTransaction) =>
      b.currency === s.currency &&
      (!b.settlementId || b.settlementId === s.id) &&
      !(b.utr && s.utr && b.utr !== s.utr);
    const strong = new Map(
      batches.map((s) => [
        s.id,
        eligible.filter(
          (b) =>
            compatible(s, b) &&
            (b.settlementId === s.id || (!!s.utr && b.utr === s.utr)),
        ),
      ]),
    );
    const claimCounts = (graph: Map<string, BankTransaction[]>) => {
      const counts = new Map<string, number>();
      for (const rows of graph.values())
        for (const row of rows)
          counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
      return counts;
    };
    const strongClaims = claimCounts(strong);
    const chosen = new Map<string, BankTransaction>();
    const used = new Set<string>();
    for (const s of batches) {
      const exact = strong.get(s.id)!;
      if (exact.length === 1 && strongClaims.get(exact[0].id) === 1) {
        chosen.set(s.id, exact[0]);
        used.add(exact[0].id);
      }
    }
    // Never consume evidence claimed by a strong relationship, even if that
    // relationship is ambiguous. Weak candidates must be unique in both directions.
    const weak = new Map(
      batches
        .filter((s) => strong.get(s.id)!.length === 0)
        .map((s) => [
          s.id,
          eligible.filter(
            (b) =>
              !used.has(b.id) &&
              !strongClaims.has(b.id) &&
              compatible(s, b) &&
              !b.settlementId &&
              !(b.utr && s.utr) &&
              !(
                b.utr &&
                settlements.some(
                  (other) =>
                    other.currency === b.currency && other.utr === b.utr,
                )
              ) &&
              b.amount === s.amount &&
              Math.abs(
                b.transactionDate.getTime() - s.settlementDate.getTime(),
              ) <=
                3 * 86400000,
          ),
        ]),
    );
    const weakClaims = claimCounts(weak);
    for (const s of batches) {
      const candidates = weak.get(s.id) ?? [];
      if (candidates.length === 1 && weakClaims.get(candidates[0].id) === 1)
        chosen.set(s.id, candidates[0]);
    }
    for (const s of batches) {
      const match = chosen.get(s.id);
      if (match) {
        this.match(
          matches,
          'SETTLEMENT',
          s.id,
          'BANK_TRANSACTION',
          match.id,
          match.settlementId === s.id
            ? 'EXACT_ID'
            : match.utr && s.utr
              ? 'UTR'
              : 'AMOUNT_TIME',
        );
        if (match.amount !== s.amount)
          this.draft(
            exceptions,
            merchantId,
            'SETTLEMENT_AMOUNT_MISMATCH',
            'SETTLEMENT',
            s.id,
            s.amount,
            match.amount,
            'MEDIUM',
            [
              evidence(
                'BANK_CREDIT',
                'BANK_TRANSACTION',
                match,
                match.valueAt ?? match.transactionDate,
              ),
            ],
          );
      } else if (
        overdue(s.settlementDate, sla('SETTLEMENT_BANK_SLA_HOURS', 72))
      )
        this.draft(
          exceptions,
          merchantId,
          'BANK_MISMATCH',
          'SETTLEMENT',
          s.id,
          s.amount,
          0n,
          'MEDIUM',
          [evidence('SETTLEMENT_PROCESSED', 'SETTLEMENT', s, s.settlementDate)],
        );
    }
  }
  private checkRefundDelay(
    refunds: Refund[],
    exceptions: ExceptionDraft[],
    merchantId: string,
  ) {
    for (const r of refunds)
      if (
        r.status === 'FAILED' ||
        (['CREATED', 'PROCESSING'].includes(r.status) &&
          overdue(r.createdAt, sla('REFUND_SLA_HOURS', 24)))
      ) {
        this.draft(
          exceptions,
          merchantId,
          r.status === 'FAILED' ? 'REFUND_MISMATCH' : 'REFUND_DELAY',
          'REFUND',
          r.id,
          r.amount,
          0n,
          'HIGH',
          [
            evidence(
              'REFUND_STATUS',
              'REFUND',
              r,
              r.processedAt ?? r.createdAt,
            ),
          ],
        );
      }
  }
  private checkBankPaymentMismatch(
    payments: Payment[],
    bank: BankTransaction[],
    exceptions: ExceptionDraft[],
    merchantId: string,
    matches: MatchDraft[] = [],
  ) {
    const used = new Set(
      matches
        .filter((m) => m.targetType === 'BANK_TRANSACTION')
        .map((m) => m.targetId),
    );
    for (const p of payments.filter((p) => p.status === 'FAILED')) {
      const credits = bank.filter(
        (b) =>
          !used.has(b.id) &&
          b.status === 'POSTED' &&
          b.transactionType === 'CREDIT' &&
          b.paymentId === p.id &&
          b.merchantId === merchantId &&
          b.currency === p.currency &&
          !b.settlementId &&
          !b.refundId,
      );
      for (const b of credits) {
        used.add(b.id);
        this.match(matches, 'PAYMENT', p.id, 'BANK_TRANSACTION', b.id);
      }
      if (credits.length > 0)
        this.draft(
          exceptions,
          merchantId,
          'BANK_PAYMENT_MISMATCH',
          'PAYMENT',
          p.id,
          0n,
          credits.reduce((sum, b) => sum + b.amount, 0n),
          'HIGH',
          [
            evidence('PAYMENT_FAILED', 'PAYMENT', p, p.createdAt),
            ...credits.map((b) =>
              evidence(
                'BANK_CREDIT_RECEIVED',
                'BANK_TRANSACTION',
                b,
                b.valueAt ?? b.transactionDate,
              ),
            ),
          ],
        );
    }
  }
  private checkRefundBank(
    refunds: Refund[],
    bank: BankTransaction[],
    exceptions: ExceptionDraft[],
    matches: MatchDraft[],
    merchantId: string,
  ) {
    const used = new Set(
      matches
        .filter((m) => m.targetType === 'BANK_TRANSACTION')
        .map((m) => m.targetId),
    );
    for (const r of refunds.filter((r) => r.status === 'PROCESSED')) {
      const debits = bank.filter(
        (b) =>
          !used.has(b.id) &&
          b.status === 'POSTED' &&
          b.transactionType === 'DEBIT' &&
          b.refundId === r.id &&
          b.merchantId === merchantId &&
          !b.settlementId &&
          !b.paymentId,
      );
      const amount = debits.reduce((sum, b) => sum + b.amount, 0n);
      for (const b of debits) {
        used.add(b.id);
        this.match(matches, 'REFUND', r.id, 'BANK_TRANSACTION', b.id);
      }
      if (
        amount !== r.amount &&
        (debits.length > 0 ||
          overdue(
            r.processedAt ?? r.createdAt,
            sla('REFUND_BANK_SLA_HOURS', 72),
          ))
      )
        this.draft(
          exceptions,
          merchantId,
          'REFUND_MISMATCH',
          'REFUND',
          r.id,
          r.amount,
          amount,
          'HIGH',
          [
            evidence(
              'REFUND_PROCESSED',
              'REFUND',
              r,
              r.processedAt ?? r.createdAt,
            ),
            ...debits.map((b) =>
              evidence(
                'BANK_DEBIT',
                'BANK_TRANSACTION',
                b,
                b.valueAt ?? b.transactionDate,
              ),
            ),
          ],
        );
    }
  }
  async listRuns(merchantId: string) {
    await this.prisma.reconciliationRun.updateMany({
      where: {
        merchantId,
        status: 'IN_PROGRESS',
        startedAt: { lt: new Date(Date.now() - 300000) },
      },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: 'Run interrupted or lease expired',
      },
    });
    const rows = await this.prisma.reconciliationRun.findMany({
      where: { merchantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({
      ...r,
      capturedVolume: r.capturedVolume.toString(),
      startedAt: r.startedAt.toISOString(),
      completedAt: r.finishedAt?.toISOString() ?? null,
    }));
  }
  async getStats(merchantId: string) {
    const [
      latest,
      volume,
      open,
      critical,
      pending,
      types,
      severities,
      resolved,
    ] = await Promise.all([
      this.prisma.reconciliationRun.findFirst({
        where: {
          merchantId,
          status: 'COMPLETED',
          dateFrom: null,
          dateTo: null,
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.payment.aggregate({
        where: {
          merchantId,
          status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.exception.count({
        where: { merchantId, status: { in: ['OPEN', 'INVESTIGATING'] } },
      }),
      this.prisma.exception.count({
        where: {
          merchantId,
          status: { in: ['OPEN', 'INVESTIGATING'] },
          severity: 'CRITICAL',
        },
      }),
      this.prisma.action.count({
        where: { merchantId, status: 'PENDING_APPROVAL' },
      }),
      this.prisma.exception.groupBy({
        by: ['type'],
        where: { merchantId, status: { in: ['OPEN', 'INVESTIGATING'] } },
        _count: { _all: true },
      }),
      this.prisma.exception.groupBy({
        by: ['severity'],
        where: { merchantId, status: { in: ['OPEN', 'INVESTIGATING'] } },
        _count: { _all: true },
      }),
      this.prisma.exception.count({
        where: {
          merchantId,
          status: 'RESOLVED',
          resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    return {
      total_transaction_volume: (volume._sum.amount ?? 0n).toString(),
      reconciliation_rate: latest?.capturedPayments
        ? Number(
            ((latest.matchedPayments / latest.capturedPayments) * 100).toFixed(
              2,
            ),
          )
        : 0,
      snapshot_at: latest?.finishedAt?.toISOString() ?? null,
      open_exceptions: open,
      critical_exceptions: critical,
      pending_approvals: pending,
      resolved_today: resolved,
      exceptions_by_type: types.map((e) => ({
        type: e.type,
        count: e._count._all,
      })),
      exceptions_by_severity: severities.map((e) => ({
        severity: e.severity,
        count: e._count._all,
      })),
    };
  }
}
