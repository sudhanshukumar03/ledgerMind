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

    const event = await this.prisma.webhookEvent.upsert({
      where: { eventId: eventId ?? fallbackId },
      update: {
        // Duplicate event: update signature status and mark ignored
        signatureVerified: signatureValid,
        processingStatus: WebhookProcessingStatus.IGNORED_DUPLICATE,
      },
      create: {
        eventId: eventId ?? fallbackId,
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
   * Fetch paginated webhook events for a merchant (or all if not specified, though merchant isolation is preferred).
   */
  async findAll(merchantId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    // In our schema, merchantId is optional on WebhookEvent. 
    // We should show events that belong to the merchant or are global.
    const where = merchantId ? { OR: [{ merchantId }, { merchantId: null }] } : {};

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