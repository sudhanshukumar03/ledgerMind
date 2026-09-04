import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayClient {
    private readonly logger = new Logger(RazorpayClient.name);
    private readonly client: Razorpay;

    constructor() {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            throw new Error('FATAL: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
        }
        this.client = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });
    }

    // Create a refund (only called after policy + approval)
    async createRefund(paymentId: string, amountInPaise?: number) {
        try {
            const refund = await this.client.payments.refund(paymentId, {
                amount: amountInPaise,
            });
            return refund;
        } catch (error) {
            this.logger.error('Razorpay refund failed', { paymentId, error });
            throw error;
        }
    }

    // Create a payment link (for collecting money)
    async createPaymentLink(orderId: string, amountInPaise: number) {
        try {
            const link = await this.client.paymentLink.create({
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