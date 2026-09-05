import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayClient {
    private readonly logger = new Logger(RazorpayClient.name);
    private readonly client: Razorpay | null;

    constructor() {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            this.logger.warn(
                'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — ' +
                'Razorpay actions are disabled. Set keys to enable payment execution.',
            );
            this.client = null;
        } else {
            this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
        }
    }

    private getClient(): Razorpay {
        if (!this.client) {
            throw new Error(
                'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env',
            );
        }
        return this.client;
    }

    async createRefund(paymentId: string, amountInPaise?: number) {
        try {
            const refund = await this.getClient().payments.refund(paymentId, {
                amount: amountInPaise,
            });
            return refund;
        } catch (error) {
            this.logger.error('Razorpay refund failed', { paymentId, error });
            throw error;
        }
    }

    async createPaymentLink(orderId: string, amountInPaise: number) {
        try {
            const link = await this.getClient().paymentLink.create({
                amount: amountInPaise,
                currency: 'INR',
                reference_id: orderId,
                description: `Payment link for ${orderId}`,
                customer: {
                    name: "Customer",
                }
            });
            return link;
        } catch (error) {
            this.logger.error('Razorpay payment link creation failed', { orderId, error });
            throw error;
        }
    }
}