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

    /**
     * Determines whether a payment or order should run in gateway simulation mode.
     * Evaluates to true if gateway credentials are not configured, or if test/sandbox IDs are provided.
     */
    private isSimulationMode(referenceId: string): boolean {
        return !this.client || referenceId.startsWith('sim_') || referenceId.startsWith('test_') || referenceId.startsWith('mock_') || referenceId.includes('DEMO');
    }

    async createRefund(paymentId: string, amountInPaise?: number) {
        if (this.isSimulationMode(paymentId)) {
            this.logger.log(`[SIMULATION] Gateway refund simulated for payment: ${paymentId}`);
            return {
                id: `rfnd_sim_${Date.now()}`,
                entity: 'refund',
                amount: amountInPaise ?? 0,
                payment_id: paymentId,
                status: 'processed'
            };
        }

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
        if (this.isSimulationMode(orderId)) {
            this.logger.log(`[SIMULATION] Payment link simulated for order: ${orderId}`);
            return {
                id: `plink_sim_${Date.now()}`,
                entity: 'payment_link',
                amount: amountInPaise,
                currency: 'INR',
                reference_id: orderId,
                status: 'created',
                short_url: `https://rzp.io/i/sim_${orderId}`,
            };
        }

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