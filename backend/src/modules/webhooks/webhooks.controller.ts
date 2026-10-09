import { Controller, Post, Get, Req, Query, Headers, RawBodyRequest, UseGuards, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service.js';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { THROTTLE } from '../../common/throttler/throttler.config.js';

@Controller('webhooks')
export class WebhooksController {
    // Razorpay retries an undelivered webhook with exponential backoff for up to
    // ~24h, so the freshness window must be wide enough to accept a legitimately
    // delayed redelivery. A 5-minute window rejected those as `stale_webhook`
    // and silently dropped real events. This check exists only to reject an
    // *ancient* captured payload being replayed; near-term duplicates are
    // already handled by the unique event_id (find-then-create) plus
    // PENDING-only processing in the worker.
    private static readonly DEFAULT_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

    constructor(private readonly webhooksService: WebhooksService) { }

    private get maxEventAgeMs(): number {
        const configured = Number(process.env.WEBHOOK_MAX_EVENT_AGE_MS);
        return Number.isFinite(configured) && configured > 0
            ? configured
            : WebhooksController.DEFAULT_MAX_EVENT_AGE_MS;
    }

    // Unauthenticated endpoint: each request costs an HMAC verify + a DB write
    // (invalid events are still persisted for audit). Cap a forged-webhook
    // flood per source IP without dropping legitimate bursty delivery.
    @Throttle({ default: THROTTLE.WEBHOOK })
    @Public()
    @Post('razorpay')
    @HttpCode(200)
    async handleRazorpay(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-razorpay-signature') signature: string,
    ) {
        // 1. Verify signature over the raw body (Razorpay signs the exact bytes)
        const rawBody = req.rawBody?.toString() || '';
        const isValid = this.verifySignature(rawBody, signature);

        // 2. Always store raw event (even if invalid, for audit)
        const { event, isDuplicate } = await this.webhooksService.storeWebhookEvent(
            rawBody,
            signature,
            isValid,
        );

        // 3. If invalid, reject immediately
        if (!isValid) {
            return { status: 'rejected', reason: 'invalid_signature' };
        }

        if (isDuplicate) {
            return { status: 'ignored', reason: 'duplicate_event' };
        }

        // 4. Replay protection: reject only clearly ancient events. Razorpay
        //    sends no timestamp header on webhooks, so the event time is derived
        //    from the payload's `created_at` (seconds). When absent, we rely on
        //    the unique event_id + PENDING-only processing for idempotency.
        //    A `created_at` in the future (clock skew between Razorpay and us)
        //    yields a negative age and is treated as fresh.
        let createdAtMs: number | undefined;
        try {
            const parsed = JSON.parse(rawBody);
            if (typeof parsed?.created_at === 'number' && Number.isFinite(parsed.created_at)) {
                createdAtMs = parsed.created_at * 1000;
            }
        } catch {
            // non-JSON body already captured for audit above
        }
        if (createdAtMs !== undefined && Date.now() - createdAtMs > this.maxEventAgeMs) {
            // Mark the persisted event so it isn't left dangling in PENDING
            // (it is never enqueued). Duplicates keep their existing status.
            await this.webhooksService.markStale(event.id);
            return { status: 'rejected', reason: 'stale_webhook' };
        }

        // 5. Enqueue for async processing
        await this.webhooksService.enqueue(event.id);

        // 6. Return 200 quickly
        return { status: 'accepted' };
    }

    @Get('events')
    @UseGuards(JwtAuthGuard)
    async getEvents(
        @Req() req: any,
        @Query('page') page: string,
        @Query('limit') limit: string,
    ) {
        const merchantId = req.user?.merchantId;
        const pageNumber = page ? parseInt(page, 10) : 1;
        const limitNumber = limit ? parseInt(limit, 10) : 20;
        
        return this.webhooksService.findAll(merchantId, pageNumber, limitNumber);
    }

    private verifySignature(payload: string, signature: string): boolean {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
            throw new Error('FATAL: RAZORPAY_WEBHOOK_SECRET is not configured');
        }
        if (!signature) return false;
        
        const expected = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
            
        if (expected.length !== signature.length) return false;
        
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
}