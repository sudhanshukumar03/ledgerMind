import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature.js';

describe('webhook signature encoding boundary', () => {
  const secret = 'synthetic-webhook-boundary-secret';
  it.each([
    undefined,
    'g'.repeat(64),
    '\u00e9'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
  ])('rejects malformed signature %p without throwing', (signature) => {
    expect(
      verifyWebhookSignature('{"event":"payment.captured"}', signature, secret),
    ).toBe(false);
  });
  it.each(['lowercase', 'uppercase'])(
    'accepts a valid %s digest over the original UTF-8 bytes',
    (encoding) => {
      const body = '{ "event": "payment.captured", "label": "\u20b9" }';
      let signature = createHmac('sha256', secret).update(body).digest('hex');
      if (encoding === 'uppercase') signature = signature.toUpperCase();
      expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    },
  );
  it('rejects body tampering with a well-formed hex digest', () => {
    const body = '{"event":"payment.captured"}';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body + ' ', signature, secret)).toBe(false);
  });
});
