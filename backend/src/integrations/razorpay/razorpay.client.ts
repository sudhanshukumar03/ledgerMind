import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import { createHash, randomUUID } from 'node:crypto';

export type ExecutionMode = 'disabled' | 'simulation' | 'provider_test';

@Injectable()
export class RazorpayClient {
  readonly mode: ExecutionMode;
  private readonly client: Razorpay | null;

  constructor() {
    const mode = process.env.PAYMENT_EXECUTION_MODE || 'disabled';
    if (!['disabled', 'simulation', 'provider_test'].includes(mode)) throw new Error('Invalid PAYMENT_EXECUTION_MODE');
    this.mode = mode as ExecutionMode;
    if (this.mode === 'provider_test') {
      const key = process.env.RAZORPAY_KEY_ID;
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!key?.startsWith('rzp_test_') || !secret) throw new Error('provider_test requires Razorpay test credentials');
      this.client = new Razorpay({ key_id: key, key_secret: secret });
    } else this.client = null;
  }

  async fetchOutcome(type: string, providerId: string): Promise<any> {
    if (this.mode !== 'provider_test') throw new Error('Provider verification requires provider_test mode');
    return type === 'REFUND' ? this.getClient().refunds.fetch(providerId) : this.getClient().paymentLink.fetch(providerId);
  }

  private simulationId(kind: string, operationId?: string) {
    return `${kind}_sim_${createHash('sha256').update(operationId || randomUUID()).digest('hex').slice(0, 24)}`;
  }

  private getClient(): Razorpay {
    if (!this.client) throw new Error('Payment execution is disabled; choose simulation or provider_test explicitly');
    return this.client;
  }

  async createRefund(paymentId: string, amountInPaise?: number, operationId?: string) {
    if (this.mode === 'simulation') return {
      id: this.simulationId('rfnd', operationId), entity: 'refund', amount: amountInPaise ?? 0,
      payment_id: paymentId, currency: 'INR', notes: { operation_id: operationId }, status: 'processed', simulated: true, execution_mode: this.mode,
    };
    return this.getClient().payments.refund(paymentId, { amount: amountInPaise, notes: { operation_id: operationId ?? '' }, receipt: operationId });
  }

  async createPaymentLink(orderId: string, amountInPaise: number, operationId?: string) {
    if (this.mode === 'simulation') {
      const id = this.simulationId('plink', operationId);
      return {
      id, entity: 'payment_link', amount: amountInPaise,
      currency: 'INR', reference_id: operationId ?? orderId, status: 'created', simulated: true, execution_mode: this.mode,
      short_url: `https://example.invalid/simulated-payment/${id}`,
      };
    }
    return this.getClient().paymentLink.create({ amount: amountInPaise, currency: 'INR', reference_id: operationId ?? orderId,
      description: `Payment link for ${orderId}`, notes: { order_id: orderId, operation_id: operationId ?? '' }, customer: { name: 'Customer' } });
  }
}
