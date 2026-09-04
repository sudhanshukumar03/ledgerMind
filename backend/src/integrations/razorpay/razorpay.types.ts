export enum RazorpayWebhookEventType {
  PAYMENT_AUTHORIZED = 'payment.authorized',
  PAYMENT_CAPTURED = 'payment.captured',
  PAYMENT_FAILED = 'payment.failed',
  ORDER_PAID = 'order.paid',
  REFUND_CREATED = 'refund.created',
  REFUND_PROCESSED = 'refund.processed',
  REFUND_FAILED = 'refund.failed',
  SETTLEMENT_CREATED = 'settlement.created',
  SETTLEMENT_PROCESSED = 'settlement.processed',
  SETTLEMENT_FAILED = 'settlement.failed',
}

export interface RazorpayPaymentEntity {
  readonly id: string;
  readonly entity: 'payment';
  readonly amount: number;
  readonly currency: string;
  readonly status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  readonly order_id: string;
  readonly invoice_id: string | null;
  readonly international: boolean;
  readonly method: string;
  readonly amount_refunded: number;
  readonly refund_status: 'partial' | 'full' | null;
  readonly captured: boolean;
  readonly description: string | null;
  readonly card_id: string | null;
  readonly bank: string | null;
  readonly wallet: string | null;
  readonly vpa: string | null;
  readonly email: string;
  readonly contact: string;
  readonly notes: Record<string, any>;
  readonly fee: number;
  readonly tax: number;
  readonly error_code: string | null;
  readonly error_description: string | null;
  readonly error_source: string | null;
  readonly error_step: string | null;
  readonly error_reason: string | null;
  readonly created_at: number;
}

export interface RazorpayOrderEntity {
  readonly id: string;
  readonly entity: 'order';
  readonly amount: number;
  readonly amount_paid: number;
  readonly amount_due: number;
  readonly currency: string;
  readonly receipt: string;
  readonly status: 'created' | 'attempted' | 'paid';
  readonly attempts: number;
  readonly notes: Record<string, any>;
  readonly created_at: number;
}

export interface RazorpayRefundEntity {
  readonly id: string;
  readonly entity: 'refund';
  readonly amount: number;
  readonly currency: string;
  readonly payment_id: string;
  readonly notes: Record<string, any>;
  readonly receipt: string | null;
  readonly acquirer_data: {
    readonly arn: string | null;
  } | null;
  readonly created_at: number;
  readonly batch_id: string | null;
  readonly status: 'pending' | 'processed' | 'failed';
  readonly speed_processed: 'normal' | 'optimum';
  readonly speed_requested: 'normal' | 'optimum';
}

export interface RazorpaySettlementEntity {
  readonly id: string;
  readonly entity: 'settlement';
  readonly amount: number;
  readonly currency: string;
  readonly status: 'created' | 'processed' | 'failed';
  readonly created_at: number;
  readonly settled_at: number | null;
  readonly utr: string | null;
  readonly description: string | null;
}

export interface RazorpayWebhookPayload {
  readonly entity: 'event';
  readonly account_id: string;
  readonly event: RazorpayWebhookEventType | string;
  readonly contains: string[];
  readonly payload: {
    readonly payment?: {
      readonly entity: RazorpayPaymentEntity;
    };
    readonly order?: {
      readonly entity: RazorpayOrderEntity;
    };
    readonly refund?: {
      readonly entity: RazorpayRefundEntity;
    };
    readonly settlement?: {
      readonly entity: RazorpaySettlementEntity;
    };
  };
  readonly created_at: number;
}
