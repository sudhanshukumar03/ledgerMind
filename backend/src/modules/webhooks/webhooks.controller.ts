import { Controller, Post, Get, Req, Query, Headers, RawBodyRequest, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly webhooksService: WebhooksService) { }

    @Public()
    @Post('razorpay')
    async handleRazorpay(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-razorpay-signature') signature: string,
        @Headers('x-razorpay-timestamp') timestamp: string,
    ) {
        // 0. Replay protection: reject if timestamp is missing or older than 5 minutes
        const fiveMinutes = 5 * 60 * 1000;
        const eventTime = Number(timestamp) * 1000; // Razorpay sends seconds
        if (!timestamp || isNaN(eventTime) || Date.now() - eventTime > fiveMinutes) {
            return { status: 'rejected', reason: 'stale_webhook' };
        }

        // 1. Verify signature
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

        // 4. Enqueue for async processing
        await this.webhooksService.enqueue(event.id);

        // 5. Return 200 quickly
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