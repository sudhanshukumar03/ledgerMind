import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { ReconciliationService } from '../modules/reconciliation/reconciliation.service.js';
import {
  WebhookProcessingStatus,
  PaymentStatus,
  OrderStatus,
  RefundStatus,
  SettlementStatus,
} from '@prisma/client';
import { Logger } from '@nestjs/common';

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
    const { webhookEventId } = job.data;

    // Fetch the webhook event
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event) {
      throw new Error(`Webhook event ${webhookEventId} not found`);
    }

    // Prevent duplicate processing: only PENDING events should be processed
    if (event.processingStatus !== WebhookProcessingStatus.PENDING) {
      this.logger.warn(`Skipping webhook ${event.id} with status ${event.processingStatus}`);
      return;
    }

    // Mark as PROCESSING
    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processingStatus: WebhookProcessingStatus.PROCESSING },
    });

    try {
      await this.handleEvent(event.eventType, event.payload);

      // Mark as PROCESSED
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingStatus: WebhookProcessingStatus.PROCESSED },
      });

      // Trigger reconciliation for the affected merchant
      const merchantId = await this.extractMerchantId(event.payload);
      if (merchantId) {
        await this.reconciliationService.runReconciliation({ merchantId });
      } else {
        this.logger.warn('No merchantId found in webhook payload; skipping reconciliation.');
      }
    } catch (error: any) {
      this.logger.error(`Failed to process webhook ${event.id}: ${error.message}`);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          processingError: error.message,
        },
      });
      // Rethrow to let BullMQ retry the job
      throw error;
    }
  }

  /**
   * Route the event to the appropriate handler.
   */
  private async handleEvent(eventType: string, payload: any): Promise<void> {
    switch (eventType) {
      case 'payment.authorized':
        await this.handlePaymentAuthorized(payload);
        break;
      case 'payment.captured':
        await this.handlePaymentCaptured(payload);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(payload);
        break;
      case 'order.paid':
        await this.handleOrderPaid(payload);
        break;
      case 'refund.processed':
        await this.handleRefundProcessed(payload);
        break;
      case 'settlement.processed':
        await this.handleSettlementProcessed(payload);
        break;
      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
        // Do nothing for unhandled events
    }
  }

  // ========== Event Handlers ==========

  private async handlePaymentAuthorized(payload: any) {
    const paymentId = payload?.payload?.payment?.entity?.id;
    if (paymentId) {
      await this.prisma.payment.updateMany({
        where: { paymentId },
        data: { status: PaymentStatus.AUTHORIZED },
      });
    }
  }

  private async handlePaymentCaptured(payload: any) {
    const paymentId = payload?.payload?.payment?.entity?.id;
    if (paymentId) {
      await this.prisma.payment.updateMany({
        where: { paymentId },
        data: {
          status: PaymentStatus.CAPTURED,
          capturedAt: new Date(),
        },
      });
    }
  }

  private async handlePaymentFailed(payload: any) {
    const paymentId = payload?.payload?.payment?.entity?.id;
    if (paymentId) {
      await this.prisma.payment.updateMany({
        where: { paymentId },
        data: { status: PaymentStatus.FAILED },
      });
    }
  }

  private async handleOrderPaid(payload: any) {
    const orderId = payload?.payload?.order?.entity?.id;
    if (orderId) {
      await this.prisma.order.updateMany({
        where: { orderId },
        data: { status: OrderStatus.PAID },
      });
    }
  }

  private async handleRefundProcessed(payload: any) {
    const refundId = payload?.payload?.refund?.entity?.id;
    if (refundId) {
      await this.prisma.refund.updateMany({
        where: { refundId },
        data: {
          status: RefundStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    }
  }

  private async handleSettlementProcessed(payload: any) {
    const settlementId = payload?.payload?.settlement?.entity?.id;
    if (settlementId) {
      await this.prisma.settlement.updateMany({
        where: { settlementId },
        data: { status: SettlementStatus.PROCESSED },
      });
    }
  }

  /**
   * Extract merchantId from the database by looking up the entity.
   */
  private async extractMerchantId(payload: any): Promise<string | null> {
    const p = payload?.payload;
    if (p?.payment?.entity?.id) {
        const payment = await this.prisma.payment.findUnique({ where: { paymentId: p.payment.entity.id }});
        return payment?.merchantId || null;
    }
    if (p?.order?.entity?.id) {
        const order = await this.prisma.order.findUnique({ where: { orderId: p.order.entity.id }});
        return order?.merchantId || null;
    }
    if (p?.refund?.entity?.id) {
        const refund = await this.prisma.refund.findUnique({ where: { refundId: p.refund.entity.id }});
        return refund?.merchantId || null;
    }
    if (p?.settlement?.entity?.id) {
        const settlement = await this.prisma.settlement.findUnique({ where: { settlementId: p.settlement.entity.id }});
        return settlement?.merchantId || null;
    }
    return null;
  }
}
