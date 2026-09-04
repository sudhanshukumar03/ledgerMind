import { PaymentStatus, OrderStatus, RefundStatus, SettlementStatus } from '@prisma/client';
import { RazorpayPaymentEntity, RazorpayOrderEntity, RazorpayRefundEntity, RazorpaySettlementEntity } from './razorpay.types.js';

export function mapRazorpayPaymentStatus(status: RazorpayPaymentEntity['status']): PaymentStatus {
  switch (status) {
    case 'authorized':
      return PaymentStatus.AUTHORIZED;
    case 'captured':
      return PaymentStatus.CAPTURED;
    case 'failed':
      return PaymentStatus.FAILED;
    case 'refunded':
      return PaymentStatus.REFUNDED;
    case 'created':
    default:
      return PaymentStatus.CREATED;
  }
}

export function mapRazorpayOrderStatus(status: RazorpayOrderEntity['status']): OrderStatus {
  switch (status) {
    case 'paid':
      return OrderStatus.PAID;
    case 'attempted':
      return OrderStatus.ATTEMPTED;
    case 'created':
    default:
      return OrderStatus.CREATED;
  }
}

export function mapRazorpayRefundStatus(status: RazorpayRefundEntity['status']): RefundStatus {
  switch (status) {
    case 'processed':
      return RefundStatus.PROCESSED;
    case 'failed':
      return RefundStatus.FAILED;
    case 'pending':
    default:
      return RefundStatus.PROCESSING;
  }
}

export function mapRazorpaySettlementStatus(status: RazorpaySettlementEntity['status']): SettlementStatus {
  switch (status) {
    case 'processed':
      return SettlementStatus.PROCESSED;
    case 'failed':
      return SettlementStatus.FAILED;
    case 'created':
    default:
      return SettlementStatus.CREATED;
  }
}
