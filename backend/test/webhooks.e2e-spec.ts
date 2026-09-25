import { RazorpayClient } from '../src/integrations/razorpay/razorpay.client.js';

delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import * as crypto from 'crypto';

const freshTimestamp = () => Math.floor(Date.now() / 1000).toString();

function sign(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret';

  beforeAll(async () => {
    // Override secret for testing if not set
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(RazorpayClient)
      .useValue({
        createRefund: async () => ({ id: 'ref_mock' }),
        createPaymentLink: async () => ({ id: 'plink_mock' }),
      })
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true } as any);
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects (HTTP 200, reason: invalid_signature) on a bad signature', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_1' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-timestamp', freshTimestamp())
      .set('x-razorpay-signature', 'deadbeef')
      .send(payload)
      .expect(200);
    expect(res.body).toEqual({ status: 'rejected', reason: 'invalid_signature' });
  });

  it('rejects (HTTP 200, reason: invalid_signature) with no signature header', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_2' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-timestamp', freshTimestamp())
      .send(payload)
      .expect(200);
    expect(res.body.reason).toBe('invalid_signature');
  });

  // Razorpay does NOT send an x-razorpay-timestamp header on webhooks, so
  // staleness is derived from the payload's `created_at` (seconds). A valid
  // signature is required first; freshness is only evaluated after it passes.
  it('accepts when the payload carries no created_at (no timestamp header sent)', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_3' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', sign(payload, secret))
      .send(payload)
      .expect(200);
    expect(res.body).toEqual({ status: 'accepted' });
  });

  it('rejects (HTTP 200, reason: stale_webhook) when payload created_at is >5min old', async () => {
    const staleCreatedAt = Math.floor((Date.now() - 6 * 60 * 1000) / 1000);
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_4', created_at: staleCreatedAt });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', sign(payload, secret))
      .send(payload)
      .expect(200);
    expect(res.body.reason).toBe('stale_webhook');
  });

  it('accepts a valid signature + fresh timestamp, stores and enqueues the event', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_5' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-timestamp', freshTimestamp())
      .set('x-razorpay-signature', sign(payload, secret))
      .send(payload)
      .expect(200);
    expect(res.body).toEqual({ status: 'accepted' });

    const stored = await prisma.webhookEvent.findUnique({ where: { eventId: 'evt_5' } });
    expect(stored).not.toBeNull();
    expect(stored?.signatureVerified).toBe(true);
  });

  it('marks a repeated event_id as IGNORED_DUPLICATE (idempotency via upsert)', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', event_id: 'evt_5' }); // same id as above
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-timestamp', freshTimestamp())
      .set('x-razorpay-signature', sign(payload, secret))
      .send(payload)
      .expect(200);

    const stored = await prisma.webhookEvent.findUnique({ where: { eventId: 'evt_5' } });
    expect(stored?.processingStatus).toBe('IGNORED_DUPLICATE');
  });
});
