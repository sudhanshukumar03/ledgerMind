import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookProcessingStatus } from '@prisma/client';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
  ) {}

  /**
   * Persists the raw webhook event and returns the database record.
   * Idempotency is enforced by the unique event_id.
   */
  async storeWebhookEvent(payload: string, signature: string, signatureValid: boolean) {
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      // If JSON parsing fails, store the raw string as payload
      parsed = { raw: payload };
    }

    // Extract event_id for idempotency (Razorpay sends `event_id` at the root)
    const eventId = parsed.event_id ?? parsed.payload?.payment?.entity?.id ?? null;

    if (!eventId) {
      // If no event_id, we cannot enforce idempotency; generate a fallback but log a warning
      this.logger.warn('Webhook payload missing event_id, generating fallback id.');
    }

    const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = eventId ?? fallbackId;

    // Guard against audit tampering: a caller replaying a KNOWN event_id with an
    // invalid signature must not be able to downgrade an already-verified /
    // processed event. Only the first write (create) records the signature
    // outcome; subsequent deliveries are marked duplicate without clobbering it.
    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventId: key } });

    if (existing) {
      await this.prisma.webhookEvent.update({
        where: { eventId: key },
        data: { processingStatus: WebhookProcessingStatus.IGNORED_DUPLICATE },
      });
      return existing;
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        eventId: key,
        eventType: parsed.event ?? 'unknown',
        payload: parsed,
        signatureVerified: signatureValid,
        processingStatus: WebhookProcessingStatus.PENDING,
      },
    });

    return event;
  }

  /**
   * Adds a job to the BullMQ 'webhooks' queue for asynchronous processing.
   */
  async enqueue(webhookEventId: string) {
    await this.webhookQueue.add(
      'process-webhook',
      { webhookEventId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
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
      where: { id: webhookEventId, processingStatus: WebhookProcessingStatus.PENDING },
      data: { processingStatus: WebhookProcessingStatus.IGNORED_STALE },
    });
  }

  /**
   * Fetch paginated webhook events for a merchant (or all if not specified, though merchant isolation is preferred).
   */
  async findAll(merchantId: string, page: number = 1, limit: number = 20) {
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