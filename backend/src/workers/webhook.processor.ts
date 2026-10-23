import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma, WebhookProcessingStatus as Status } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { ReconciliationService } from '../modules/reconciliation/reconciliation.service.js';
import { positiveSafePaise, requireInr } from '../common/utils/pagination.js';
import { MAX_WEBHOOK_ATTEMPTS } from '../modules/webhooks/webhook.constants.js';

const supported = new Set([
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
  'order.created',
  'refund.created',
  'refund.processed',
  'refund.failed',
  'settlement.processed',
  'settlement.failed',
]);
const time = (seconds: unknown, fallback: Date): Date =>
  typeof seconds === 'number' &&
  Number.isSafeInteger(seconds) &&
  seconds > 0 &&
  seconds < 8_640_000_000_000
    ? new Date(seconds * 1000)
    : fallback;
const captured = (status: string) =>
  ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(status);

@Processor('webhooks')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationService: ReconciliationService,
  ) {
    super();
  }

  async process(job: Job<{ webhookEventId: string }>): Promise<void> {
    const id = job.data.webhookEventId;
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.webhookEvent.updateMany({
      where: {
        id,
        signatureVerified: true,
        processingAttempts: { lt: MAX_WEBHOOK_ATTEMPTS },
        OR: [
          { processingStatus: { in: [Status.PENDING, Status.FAILED] } },
          { processingStatus: Status.PROCESSING, leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        processingStatus: Status.PROCESSING,
        claimToken: token,
        leaseExpiresAt: new Date(now.getTime() + 60000),
        processingAttempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    let resolvedMerchant: string | null = null;
    try {
      const merchantId = await this.prisma.$transaction(
        async (tx) => {
          // Lock the claimed row through the entire mutation transaction. An expired
          // owner cannot commit after a replacement worker has acquired the claim.
          const owned = await tx.webhookEvent.updateMany({
            where: {
              id,
              claimToken: token,
              processingStatus: Status.PROCESSING,
            },
            data: { leaseExpiresAt: new Date(Date.now() + 60000) },
          });
          if (!owned.count) return null;
          const event = await tx.webhookEvent.findUniqueOrThrow({
            where: { id },
          });
          if (!supported.has(event.eventType)) {
            await tx.webhookEvent.update({
              where: { id },
              data: {
                processingStatus: Status.UNSUPPORTED,
                processingError: `Unsupported event: ${event.eventType}`,
                claimToken: null,
                leaseExpiresAt: null,
              },
            });
            return null;
          }
          const payload = event.payload as any;
          const owner = await this.resolveMerchant(tx, payload);
          resolvedMerchant = owner;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 1))`;
          await this.ingest(
            tx,
            owner,
            event.eventType,
            payload,
            event.receivedAt,
          );
          await tx.webhookEvent.update({
            where: { id },
            data: {
              merchantId: owner,
              processingStatus: Status.PROCESSED,
              processingError: null,
              claimToken: null,
              leaseExpiresAt: null,
            },
          });
          return owner;
        },
        { timeout: 30000 },
      );
      if (merchantId) {
        try {
          await this.reconciliationService.runReconciliation({ merchantId });
        } catch (error) {
          this.logger.error(
            `Reconciliation after webhook ${id} failed: ${String(error)}`,
          );
          await this.prisma.webhookEvent.update({
            where: { id },
            data: {
              processingError: `Reconciliation failed: ${String(error)}`,
            },
          });
        }
      }
    } catch (error) {
      await this.prisma.webhookEvent.updateMany({
        where: { id, claimToken: token },
        data: {
          ...(resolvedMerchant ? { merchantId: resolvedMerchant } : {}),
          processingStatus: Status.FAILED,
          processingError: String(error),
          claimToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + 10000),
        },
      });
      throw error;
    }
  }

  private async resolveMerchant(
    tx: Prisma.TransactionClient,
    payload: any,
  ): Promise<string> {
    if (typeof payload.account_id === 'string') {
      const owners = await tx.merchant.findMany({
        where: { razorpayAccountId: payload.account_id },
        take: 2,
      });
      if (owners.length !== 1)
        throw new Error('Webhook account is unknown or ambiguous');
      return owners[0].id;
    }
    // Legacy fixtures may omit account_id, but can update only an existing entity.
    const p = payload.payload;
    const entity = p?.payment?.entity?.id
      ? await tx.payment.findUnique({
          where: { paymentId: p.payment.entity.id },
        })
      : p?.order?.entity?.id
        ? await tx.order.findUnique({ where: { orderId: p.order.entity.id } })
        : p?.refund?.entity?.id
          ? await tx.refund.findUnique({
              where: { refundId: p.refund.entity.id },
            })
          : p?.settlement?.entity?.id
            ? await tx.settlement.findUnique({
                where: { settlementId: p.settlement.entity.id },
              })
            : null;
    if (!entity)
      throw new Error(
        'A trusted account mapping is required to ingest a new entity',
      );
    return entity.merchantId;
  }

  private async ingest(
    tx: Prisma.TransactionClient,
    merchantId: string,
    kind: string,
    body: any,
    received: Date,
  ) {
    const p = body.payload;
    const eventAt = time(body.created_at, received);
    // Every provided entity is scoped to the verified account, never a payload merchant UUID.
    const owner = (entity: { merchantId: string } | null) => {
      if (entity && entity.merchantId !== merchantId)
        throw new Error('Cross-merchant provider entity');
    };
    if (p?.order?.entity) {
      const e = p.order.entity;
      if (typeof e.id !== 'string') throw new Error('Missing order id');
      requireInr(e.currency ?? 'INR');
      const old = await tx.order.findUnique({ where: { orderId: e.id } });
      owner(old);
      const status =
        kind === 'order.paid' || e.status === 'paid' ? 'PAID' : 'CREATED';
      const order = await tx.order.upsert({
        where: { orderId: e.id },
        create: {
          orderId: e.id,
          merchantId,
          amount: BigInt(positiveSafePaise(e.amount)),
          currency: 'INR',
          status,
          createdAt: time(e.created_at, eventAt),
        },
        update:
          old?.status === 'PAID' || old?.status === 'REFUNDED'
            ? {}
            : { status },
      });
      await tx.payment.updateMany({
        where: { merchantId, providerOrderId: e.id, orderId: null },
        data: { orderId: order.id },
      });
    }
    if (kind.startsWith('payment.')) {
      const e = p?.payment?.entity;
      if (typeof e?.id !== 'string') throw new Error('Missing payment entity');
      requireInr(e.currency ?? 'INR');
      await tx.$queryRaw`SELECT id FROM payments WHERE payment_id = ${e.id} FOR UPDATE`;
      const old = await tx.payment.findUnique({ where: { paymentId: e.id } });
      owner(old);
      if (
        old &&
        (old.amount !== BigInt(positiveSafePaise(e.amount)) ||
          (old.providerOrderId &&
            e.order_id &&
            old.providerOrderId !== e.order_id))
      )
        throw new Error('Conflicting immutable payment facts');
      const order =
        typeof e.order_id === 'string'
          ? await tx.order.findUnique({ where: { orderId: e.order_id } })
          : null;
      owner(order);
      const status = captured(old?.status ?? '')
        ? old!.status
        : kind === 'payment.captured'
          ? 'CAPTURED'
          : kind === 'payment.authorized'
            ? 'AUTHORIZED'
            : old?.status === 'AUTHORIZED'
              ? 'AUTHORIZED'
              : 'FAILED';
      await tx.payment.upsert({
        where: { paymentId: e.id },
        create: {
          paymentId: e.id,
          merchantId,
          orderId: order?.id,
          providerOrderId: e.order_id,
          amount: BigInt(positiveSafePaise(e.amount)),
          currency: 'INR',
          method: e.method?.toLowerCase(),
          status,
          capturedAt: kind === 'payment.captured' ? eventAt : null,
          createdAt: time(e.created_at, eventAt),
        },
        update: {
          status,
          ...(order ? { orderId: order.id } : {}),
          ...(e.order_id ? { providerOrderId: e.order_id } : {}),
          ...(kind === 'payment.captured' && !old?.capturedAt
            ? { capturedAt: eventAt }
            : {}),
        },
      });
    }
    if (kind.startsWith('refund.')) {
      const e = p?.refund?.entity;
      if (typeof e?.id !== 'string' || typeof e.payment_id !== 'string')
        throw new Error('Missing refund relationship');
      let payment = await tx.payment.findUnique({
        where: { paymentId: e.payment_id },
      });
      owner(payment);
      if (!payment) throw new Error('Refund awaits payment evidence');
      requireInr(e.currency ?? payment.currency);
      const operationId = e.notes?.operation_id ?? e.receipt;
      let operation: any = null;
      if (
        typeof operationId === 'string' &&
        /^[0-9a-f-]{36}$/i.test(operationId)
      ) {
        await tx.$queryRaw`SELECT id FROM actions WHERE id = ${operationId}::uuid FOR UPDATE`;
        operation = await tx.action.findFirst({
          where: {
            id: operationId,
            merchantId,
            executionProtocol: 'v2',
            actionType: 'REFUND',
            targetPaymentId: payment.id,
          },
        });
        if (
          operation &&
          BigInt((operation.parameters as any).amount) !==
            BigInt(positiveSafePaise(e.amount))
        )
          throw new Error(
            'Refund operation amount conflicts with submitted intent',
          );
      }
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
      payment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      const old = await tx.refund.findUnique({ where: { refundId: e.id } });
      owner(old);
      if (
        old &&
        (old.paymentId !== payment.id ||
          old.amount !== BigInt(positiveSafePaise(e.amount)))
      )
        throw new Error('Conflicting immutable refund facts');
      const status =
        old?.status === 'PROCESSED' || kind === 'refund.processed'
          ? 'PROCESSED'
          : kind === 'refund.failed'
            ? 'FAILED'
            : (old?.status ?? 'CREATED');
      await tx.refund.upsert({
        where: { refundId: e.id },
        create: {
          refundId: e.id,
          merchantId,
          paymentId: payment.id,
          amount: BigInt(positiveSafePaise(e.amount)),
          status,
          createdAt: time(e.created_at, eventAt),
          processedAt: status === 'PROCESSED' ? eventAt : null,
        },
        update: {
          status,
          ...(status === 'PROCESSED' && !old?.processedAt
            ? { processedAt: eventAt }
            : {}),
        },
      });
      if (
        operation &&
        ['EXECUTING', 'OUTCOME_UNKNOWN'].includes(operation.status)
      ) {
        const result = {
          ...e,
          currency: e.currency ?? payment.currency,
          reconciled_from_webhook: true,
        };
        await tx.action.update({
          where: { id: operation.id },
          data: {
            status: status === 'FAILED' ? 'FAILED' : 'COMPLETED',
            executionResult: result,
            executedAt: eventAt,
            executionLeaseUntil: null,
            executionClaimToken: null,
            failureReason:
              status === 'FAILED' ? 'Provider reports refund failure' : null,
          },
        });
        await tx.auditLog.create({
          data: {
            merchantId,
            actorType: 'SYSTEM',
            action: 'ACTION_OUTCOME_VERIFIED_BY_WEBHOOK',
            entityType: 'ACTION',
            entityId: operation.id,
            afterState: result,
          },
        });
      }
      const total = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: 'PROCESSED' },
        _sum: { amount: true },
      });
      if ((total._sum.amount ?? 0n) > 0n)
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status:
              (total._sum.amount ?? 0n) >= payment.amount
                ? 'REFUNDED'
                : 'PARTIALLY_REFUNDED',
            capturedAt:
              payment.capturedAt ??
              time(p?.payment?.entity?.created_at, payment.createdAt),
          },
        });
    }
    if (kind.startsWith('settlement.')) {
      const e = p?.settlement?.entity;
      if (typeof e?.id !== 'string')
        throw new Error('Missing settlement entity');
      requireInr(e.currency ?? 'INR');
      const old = await tx.settlement.findUnique({
        where: { settlementId: e.id },
      });
      owner(old);
      const status =
        old?.status === 'PROCESSED' || kind === 'settlement.processed'
          ? 'PROCESSED'
          : 'FAILED';
      await tx.settlement.upsert({
        where: { settlementId: e.id },
        create: {
          settlementId: e.id,
          merchantId,
          amount: BigInt(positiveSafePaise(e.amount)),
          status,
          utr: e.utr,
          settlementDate: time(e.created_at, eventAt),
          createdAt: time(e.created_at, eventAt),
        },
        update: { status, ...(e.utr ? { utr: e.utr } : {}) },
      });
    }
  }
}
