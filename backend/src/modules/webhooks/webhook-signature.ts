import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: unknown,
  secret: string | undefined,
): boolean {
  if (!secret)
    throw new Error('FATAL: RAZORPAY_WEBHOOK_SECRET is not configured');
  // Character length alone cannot establish equal UTF-8 byte lengths. Decode
  // only a complete SHA-256 hexadecimal digest before constant-time comparison.
  if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature))
    return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
