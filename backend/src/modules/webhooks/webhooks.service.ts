import { parsePagination, requireUuid } from '../../common/utils/pagination.js';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, WebhookProcessingStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { MAX_WEBHOOK_ATTEMPTS } from './webhook.constants.js';

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;

  onModuleInit() {
    this.timer = setInterval(() => void this.recoverDispatch(), 5000);
    this.timer.unref();
    void this.recoverDispatch();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async recoverDispatch() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const now = new Date();
      const events = await this.prisma.webhookEvent.findMany({
        where: {
          signatureVerified: true,
          nextAttemptAt: { lte: now },
          processingAttempts: { lt: MAX_WEBHOOK_ATTEMPTS },
          OR: [
            {
              processingStatus: {
                in: [
                  WebhookProcessingStatus.PENDING,
                  WebhookProcessingStatus.FAILED,
                ],
              },
            },
            {
              processingStatus: WebhookProcessingStatus.PROCESSING,
              leaseExpiresAt: { lt: now },
            },
          ],
        },
        take: 100,
        orderBy: { receivedAt: 'asc' },
      });
      for (const event of events)
        await this.enqueue(event.id, event.processingAttempts);
    } catch (error) {
      this.logger.warn(`Webhook dispatch delayed: ${String(error)}`);
    } finally {
      this.dispatching = false;
    }
  }
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
  ) {}

  /**
   * Persists the raw webhook event and returns the database record.
   * Idempotency is enforced by the unique event_id.
   */
  async storeWebhookEvent(
    payload: string,
    signature: string,
    signatureValid: boolean,
    deliveryId?: string,
  ) {
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      // If JSON parsing fails, store the raw string as payload
      parsed = { raw: payload };
    }
    // Only an object can carry provider event metadata. Preserve other bodies
    // as diagnostics without dereferencing null or passing JSON null to Prisma.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      parsed = { raw: payload };
    const eventType =
      typeof parsed.event === 'string' && parsed.event.trim().length > 0
        ? parsed.event
        : 'unknown';

    // Extract event_id for idempotency (Razorpay sends `event_id` at the root)
    const eventId =
      deliveryId ||
      (typeof parsed?.event_id === 'string' && parsed.event_id.length > 0
        ? parsed.event_id
        : null);

    if (!eventId) {
      // If no event_id, we cannot enforce idempotency; generate a fallback but log a warning
      this.logger.warn(
        'Webhook payload missing event_id, generating fallback id.',
      );
    }

    const payloadHash = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');
    // Invalid deliveries are retained for audit, but must never reserve the
    // provider's real event ID and suppress a later valid delivery.
    const key = signatureValid
      ? (eventId ?? `payload-${payloadHash}`)
      : `invalid-${payloadHash}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    // Invalid signatures have unique audit keys, so only valid deliveries
    // participate in idempotency and replay protection.
    const existing = signatureValid
      ? await this.prisma.webhookEvent.findUnique({ where: { eventId: key } })
      : null;

    if (existing) {
      return { event: existing, isDuplicate: true };
    }

    const owners =
      signatureValid && typeof parsed.account_id === 'string'
        ? await this.prisma.merchant.findMany({
            where: { razorpayAccountId: parsed.account_id },
            select: { id: true },
            take: 2,
          })
        : [];
    let event;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          eventId: key,
          merchantId: owners.length === 1 ? owners[0].id : null,
          eventType,
          payload: parsed,
          signatureVerified: signatureValid,
          processingStatus:
            signatureValid &&
            typeof parsed.created_at === 'number' &&
            Date.now() - parsed.created_at * 1000 >
              (Number(process.env.WEBHOOK_MAX_EVENT_AGE_MS) || 86400000)
              ? WebhookProcessingStatus.IGNORED_STALE
              : WebhookProcessingStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        signatureValid &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.webhookEvent.findUnique({
          where: { eventId: key },
        });
        if (concurrent) return { event: concurrent, isDuplicate: true };
      }
      throw error;
    }

    return { event, isDuplicate: false };
  }

  /**
   * Adds a job to the BullMQ 'webhooks' queue for asynchronous processing.
   */
  async enqueue(webhookEventId: string, attempt = 0) {
    await this.webhookQueue.add(
      'process-webhook',
      { webhookEventId },
      {
        jobId: `webhook_${webhookEventId}_${attempt}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /**
   * Mark a freshly-stored event as stale so it is not left dangling in PENDING
   * (stale events are never enqueued). Only PENDING rows are touched, so a
   * duplicate already marked IGNORED_DUPLICATE / a PROCESSED event is untouched.
   */
  async markStale(webhookEventId: string) {
    await this.prisma.webhookEvent.updateMany({
      where: {
        id: webhookEventId,
        processingStatus: WebhookProcessingStatus.PENDING,
      },
      data: { processingStatus: WebhookProcessingStatus.IGNORED_STALE },
    });
  }

  /**
   * Fetch paginated webhook events for a merchant (or all if not specified, though merchant isolation is preferred).
   */
  async retry(merchantId: string, id: string) {
    requireUuid(id);
    const changed = await this.prisma.webhookEvent.updateMany({
      where: {
        id,
        merchantId,
        signatureVerified: true,
        OR: [
          { processingStatus: WebhookProcessingStatus.FAILED },
          {
            processingStatus: WebhookProcessingStatus.PROCESSING,
            leaseExpiresAt: { lt: new Date() },
          },
        ],
      },
      data: {
        processingStatus: WebhookProcessingStatus.PENDING,
        processingAttempts: 0,
        nextAttemptAt: new Date(),
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
    if (!changed.count) return { retried: false };
    await this.enqueue(id);
    return { retried: true };
  }

  async findAll(merchantId: string, page: number = 1, limit: number = 20) {
    ({ page, limit } = parsePagination(page, limit));
    const skip = (page - 1) * limit;

    // Scope strictly to the merchant. WebhookEvent.merchantId is populated by
    // the processor once the underlying entity is resolved; unattributed events
    // (merchantId null) are NOT surfaced cross-tenant to avoid leaking another
    // merchant's payment data.
    const where = { merchantId };

    const [total, data] = await Promise.all([
      this.prisma.webhookEvent.count({ where }),
      this.prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit };
  }
}
