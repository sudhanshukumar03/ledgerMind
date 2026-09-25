import { Controller, Post, Get, Req, Query, Headers, RawBodyRequest, UseGuards, HttpCode } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly webhooksService: WebhooksService) { }

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
        const event = await this.webhooksService.storeWebhookEvent(
            rawBody,
            signature,
            isValid,
        );

        // 3. If invalid, reject immediately
        if (!isValid) {
            return { status: 'rejected', reason: 'invalid_signature' };
        }

        // 4. Replay protection: reject clearly stale events. Razorpay does NOT
        //    send a timestamp header on webhooks, so derive the event time from
        //    the payload's `created_at` (seconds). When absent, we rely on the
        //    unique event_id (find-then-create) + PENDING-only processing for
        //    idempotency.
        const fiveMinutes = 5 * 60 * 1000;
        let createdAt: number | undefined;
        try {
            const parsed = JSON.parse(rawBody);
            if (typeof parsed?.created_at === 'number') {
                createdAt = parsed.created_at * 1000;
            }
        } catch {
            // non-JSON body already captured for audit above
        }
        if (createdAt !== undefined && Date.now() - createdAt > fiveMinutes) {
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