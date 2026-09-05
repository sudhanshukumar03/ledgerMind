import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminAToken: string;
  let adminBToken: string;
  let merchantAId: string;
  let merchantBId: string;
  let exceptionAId: string;
  let paymentAId: string;

  before(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    // Clean up test DB tables if they exist
    await prisma.action.deleteMany();
    await prisma.aiAnalysis.deleteMany();
    await prisma.exception.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
    await prisma.merchant.deleteMany();

    // Seed database
    const merchantA = await prisma.merchant.create({ data: { name: 'Merchant A', email: 'merchantA@test.com', razorpayAccountId: 'rzp_a' } });
    merchantAId = merchantA.id;
    const merchantB = await prisma.merchant.create({ data: { name: 'Merchant B', email: 'merchantB@test.com', razorpayAccountId: 'rzp_b' } });
    merchantBId = merchantB.id;

    const userA = await prisma.user.create({
      data: { merchantId: merchantAId, name: 'Admin A', email: 'adminA@test.com', passwordHash: 'hash', role: 'ADMIN' },
    });
    const userB = await prisma.user.create({
      data: { merchantId: merchantBId, name: 'Admin B', email: 'adminB@test.com', passwordHash: 'hash', role: 'ADMIN' },
    });

    adminAToken = jwtService.sign({ sub: userA.id, email: userA.email, role: userA.role, merchantId: merchantAId });
    adminBToken = jwtService.sign({ sub: userB.id, email: userB.email, role: userB.role, merchantId: merchantBId });

    const orderA = await prisma.order.create({
      data: { id: 'order_a', merchantId: merchantAId, orderId: 'ext_order_a', amount: 1000n, currency: 'INR', status: 'PAID' },
    });

    const paymentA = await prisma.payment.create({
      data: { id: 'payment_a', orderId: orderA.id, merchantId: merchantAId, paymentId: 'ext_pay_a', amount: 1000n, currency: 'INR', status: 'CAPTURED', method: 'card' },
    });
    paymentAId = paymentA.id;

    const exceptionA = await prisma.exception.create({
      data: {
        merchantId: merchantAId,
        exceptionId: 'EXC-TEST-1',
        type: 'ORDER_PAYMENT_MISMATCH',
        severity: 'HIGH',
        status: 'OPEN',
        expectedAmount: 1000n,
        actualAmount: 500n,
        differenceAmount: 500n,
        financialImpact: 500n,
        customerImpact: 'HIGH',
        dedupKey: `${merchantAId}:ORDER_PAYMENT_MISMATCH:order_a`,
      },
    });
    exceptionAId = exceptionA.id;
  });

  after(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1. Unauthenticated access returns 401 Unauthorized', async () => {
    const response = await request(app.getHttpServer()).get('/exceptions');
    assert.strictEqual(response.status, 401);
  });

  it('2. Cross-tenant IDOR protection (Admin B accessing Merchant A exception)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exceptions/${exceptionAId}`)
      .set('Authorization', `Bearer ${adminBToken}`);
    
    // The controller should return 404 because it limits search to req.user.merchantId
    assert([403, 404].includes(response.status), 'Expected 403 or 404');
  });

  it('3. Refund amount validation (greater than payment amount)', async () => {
    // Admin A tries to refund 1500 (payment is 1000)
    const response = await request(app.getHttpServer())
      .post('/actions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        exceptionId: exceptionAId,
        actionType: 'REFUND',
        parameters: {
          paymentId: paymentAId,
          amount: 1500,
          reason: 'Test over refund',
        },
      });
    
    assert.strictEqual(response.status, 400);
  });

  it.skip('4. Login rate limiting', async () => {
    // 5 failed logins should be allowed by rate limiter
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'adminA@test.com', password: 'wrong' });
    }
    
    // 6th attempt should be rate limited (429)
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'adminA@test.com', password: 'wrong' });
      
    assert.strictEqual(response.status, 429);
  });

  it('5. Webhook freshness (stale timestamps older than 5 mins are rejected)', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const payload = JSON.stringify({ event: 'payment.failed' });
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const response = await request(app.getHttpServer())
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-timestamp', staleTimestamp.toString())
      .send(payload)
      .type('json');
    
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error.code, 'stale_webhook');
  });
});
