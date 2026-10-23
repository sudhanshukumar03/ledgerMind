/** Isolated regression suite. Requires a guarded local ledgermind_test* DB and TEST_REDIS_PORT. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
const { PrismaClient } = require('@prisma/client');
const { Queue, Worker } = require('bullmq');
const { ActionsService } =
  await import('../backend/dist/modules/actions/actions.service.js');
const { PolicyService } =
  await import('../backend/dist/modules/actions/policy.service.js');
const { WebhooksService } =
  await import('../backend/dist/modules/webhooks/webhooks.service.js');
const { WebhookProcessor } =
  await import('../backend/dist/workers/webhook.processor.js');
const { ReconciliationService } =
  await import('../backend/dist/modules/reconciliation/reconciliation.service.js');
const { SettlementsService } =
  await import('../backend/dist/modules/settlements/settlements.service.js');
const { AiService } = await import('../backend/dist/modules/ai/ai.service.js');
const { BankDataGenerator } =
  await import('../backend/dist/integrations/bank/bank-data.generator.js');
const prisma = new PrismaClient();
const results = [];
const test = async (name, fn) => {
  await fn();
  results.push(name);
  console.log('PASS', name);
};
const ago = (hours) => new Date(Date.now() - hours * 3600000);
const owner = await prisma.merchant.create({
  data: {
    name: 'Fix verification',
    email: 'synthetic@example.invalid',
    razorpayAccountId: `acc_${randomUUID()}`,
  },
});
const merchantId = owner.id;
const users = await Promise.all(
  ['FINANCE', 'ADMIN', 'ADMIN'].map((role) =>
    prisma.user.create({
      data: {
        merchantId,
        name: role,
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'unusable',
        role,
      },
    }),
  ),
);
const [finance, admin1, admin2] = users;
let providerCalls = 0;
const gateway = {
  createRefund: async (paymentId, amount, operationId) => {
    providerCalls++;
    return {
      id: `rfnd_${operationId.replaceAll('-', '')}`,
      payment_id: paymentId,
      amount,
      currency: 'INR',
      status: 'pending',
      simulated: true,
      notes: { operation_id: operationId },
    };
  },
  createPaymentLink: async (_orderId, amount, id) => {
    providerCalls++;
    return {
      id: `plink_${id}`,
      amount,
      currency: 'INR',
      reference_id: id,
      short_url: 'https://example.invalid/payment',
    };
  },
};
const actions = new ActionsService(prisma, new PolicyService(), gateway);
const recon = new ReconciliationService(prisma);
const exception = (entityType, entityId, extra = {}) =>
  prisma.exception.create({
    data: {
      merchantId,
      exceptionId: `EXC-${randomUUID()}`,
      dedupKey: `manual:${randomUUID()}`,
      type: 'DUPLICATE_PAYMENT',
      severity: 'HIGH',
      primaryEntityType: entityType,
      primaryEntityId: entityId,
      ...extra,
    },
  });
async function captured(amount = 1000000n) {
  const order = await prisma.order.create({
    data: {
      merchantId,
      orderId: `order_${randomUUID()}`,
      amount,
      status: 'PAID',
      createdAt: ago(240),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      merchantId,
      orderId: order.id,
      paymentId: `pay_${randomUUID()}`,
      amount,
      status: 'CAPTURED',
      capturedAt: ago(240),
      createdAt: ago(240),
    },
  });
  return { order, payment, exc: await exception('PAYMENT', payment.id) };
}
const propose = (exc, payment, amount, reason = 'synthetic refund') => ({
  exception_id: exc.id,
  action_type: 'REFUND',
  parameters: { payment_id: payment.id, amount, reason },
});
let queue, worker;
try {
  await test('01 atomic competing refund reservations prevent overspend', async () => {
    const f = await captured(100000n);
    const before = providerCalls;
    const outcomes = await Promise.allSettled([
      actions.createAction(finance.id, propose(f.exc, f.payment, 60000, 'a')),
      actions.createAction(finance.id, propose(f.exc, f.payment, 60000, 'b')),
    ]);
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    assert.equal(providerCalls - before, 1);
    assert.equal(
      (
        await prisma.refund.aggregate({
          where: { paymentId: f.payment.id },
          _sum: { amount: true },
        })
      )._sum.amount,
      60000n,
    );
    assert.equal(
      (await prisma.exception.findUnique({ where: { id: f.exc.id } })).status,
      'OPEN',
    );
    const replay = await actions.createAction(
      finance.id,
      propose(
        f.exc,
        f.payment,
        60000,
        outcomes[0].status === 'fulfilled' ? 'a' : 'b',
      ),
    );
    assert.equal(replay.status, 'COMPLETED');
    assert.equal(providerCalls - before, 1);
  });
  await test('02 maker-checker, distinct dual approvals, and finance rejection', async () => {
    const f = await captured(10000000n),
      before = providerCalls;
    const action = await actions.createAction(
      finance.id,
      propose(f.exc, f.payment, 5000001),
    );
    assert.equal(action.requiredApprovals, 2);
    assert.equal(
      (
        await actions.approveAction(action.id, admin1.id, merchantId, {
          reason: 'first independent review',
        })
      ).status,
      'PENDING_APPROVAL',
    );
    await assert.rejects(
      () =>
        actions.approveAction(action.id, admin1.id, merchantId, {
          reason: 'repeat',
        }),
      /already voted/,
    );
    assert.equal(providerCalls, before);
    assert.equal(
      (
        await actions.approveAction(action.id, admin2.id, merchantId, {
          reason: 'second independent review',
        })
      ).status,
      'COMPLETED',
    );
    const own = await actions.createAction(
      admin1.id,
      propose(f.exc, f.payment, 100000, 'own'),
    );
    await assert.rejects(
      () =>
        actions.approveAction(own.id, admin1.id, merchantId, {
          reason: 'self',
        }),
      /own action/,
    );
    assert.equal(
      (
        await actions.rejectAction(own.id, finance.id, merchantId, {
          reason: 'rejected during review',
        })
      ).status,
      'REJECTED',
    );
  });
  await test('03 proposal audit failure rolls back the action and reservation', async () => {
    const f = await captured(),
      count = await prisma.action.count();
    const failing = new Proxy(prisma, {
      get: (target, key) =>
        key === '$transaction'
          ? (cb) =>
              target.$transaction((tx) =>
                cb(
                  new Proxy(tx, {
                    get: (t, k) =>
                      k === 'auditLog'
                        ? {
                            create: async () => {
                              throw new Error('audit offline');
                            },
                          }
                        : Reflect.get(t, k),
                  }),
                ),
              )
          : Reflect.get(target, key),
    });
    await assert.rejects(
      () =>
        new ActionsService(failing, new PolicyService(), gateway).createAction(
          finance.id,
          propose(f.exc, f.payment, 100),
        ),
      /audit offline/,
    );
    assert.equal(await prisma.action.count(), count);
  });
  await test('04 external success followed by local failure remains uncertain and reserved', async () => {
    const f = await captured(),
      before = providerCalls;
    const failing = new Proxy(prisma, {
      get: (target, key) =>
        key === '$transaction'
          ? (cb) =>
              target.$transaction((tx) =>
                cb(
                  new Proxy(tx, {
                    get: (t, k) =>
                      k === 'refund'
                        ? new Proxy(t.refund, {
                            get: (r, op) =>
                              op === 'upsert'
                                ? async () => {
                                    throw new Error('local write interrupted');
                                  }
                                : Reflect.get(r, op),
                          })
                        : Reflect.get(t, k),
                  }),
                ),
              )
          : Reflect.get(target, key),
    });
    const service = new ActionsService(failing, new PolicyService(), gateway);
    await assert.rejects(
      () => service.createAction(finance.id, propose(f.exc, f.payment, 100)),
      /local write interrupted/,
    );
    const action = await prisma.action.findFirst({
      where: { exceptionId: f.exc.id },
    });
    assert.equal(action.status, 'OUTCOME_UNKNOWN');
    assert.equal(action.reservedAmount, 100n);
    await actions.recoverExecution();
    assert.equal(providerCalls - before, 1);
    gateway.fetchOutcome = async () => ({
      id: `rfnd_${action.id.replaceAll('-', '')}`,
      payment_id: f.payment.paymentId,
      amount: 100,
      currency: 'INR',
      notes: { operation_id: action.id },
      status: 'pending',
    });
    assert.equal(
      (
        await actions.recoverOutcome(
          action.id,
          admin1.id,
          merchantId,
          `rfnd_${action.id.replaceAll('-', '')}`,
        )
      ).status,
      'COMPLETED',
    );
    assert.equal(providerCalls - before, 1);
  });
  await test('05 ineligible, unrelated, and over-balance payment links are refused', async () => {
    const f = await captured();
    const exc = await exception('ORDER', f.order.id);
    const dto = {
      exception_id: exc.id,
      action_type: 'CREATE_PAYMENT_LINK',
      parameters: { order_id: f.order.id, amount: 100 },
    };
    await assert.rejects(
      () => actions.createAction(finance.id, dto),
      /collectible/,
    );
    await prisma.order.update({
      where: { id: f.order.id },
      data: { status: 'CREATED' },
    });
    await assert.rejects(
      () => actions.createAction(finance.id, dto),
      /outstanding/,
    );
    await prisma.order.update({
      where: { id: f.order.id },
      data: { amount: 2000000n },
    });
    assert.equal(
      (await actions.createAction(finance.id, dto)).status,
      'COMPLETED',
    );
    await assert.rejects(
      () =>
        actions.createAction(finance.id, {
          ...dto,
          parameters: { ...dto.parameters, amount: 200 },
        }),
      /active payment link/,
    );
  });
  const connection = {
    host: '127.0.0.1',
    port: Number(process.env.TEST_REDIS_PORT),
    maxRetriesPerRequest: null,
  };
  if (connection.port !== 56383)
    throw new Error('Use the isolated Redis port 56383');
  queue = new Queue(`verify_${randomUUID()}`, { connection });
  const ingress = new WebhooksService(prisma, queue);
  const processor = new WebhookProcessor(prisma, {
    runReconciliation: async () => ({ status: 'COMPLETED' }),
  });
  const event = async (kind, payload, id = `evt_${randomUUID()}`) =>
    ingress.storeWebhookEvent(
      JSON.stringify({
        event_id: id,
        event: kind,
        account_id: owner.razorpayAccountId,
        created_at: Math.floor(Date.now() / 1000),
        payload,
      }),
      'verified-by-test',
      true,
    );
  await test('06 duplicate ingress preserves pending work and repairs missing queue submission with real Redis', async () => {
    const paymentId = `pay_${randomUUID()}`;
    const body = {
      payment: {
        entity: {
          id: paymentId,
          amount: 12345,
          currency: 'INR',
          created_at: Math.floor(ago(1).getTime() / 1000),
        },
      },
    };
    const id = `evt_${randomUUID()}`;
    const stored = await event('payment.captured', body, id);
    await Promise.all(
      Array.from({ length: 8 }, () => event('payment.captured', body, id)),
    );
    assert.equal(
      (await prisma.webhookEvent.findUnique({ where: { id: stored.event.id } }))
        .processingStatus,
      'PENDING',
    );
    worker = new Worker(queue.name, (job) => processor.process(job), {
      connection,
      concurrency: 2,
    });
    await ingress.recoverDispatch();
    for (let i = 0; i < 100; i++) {
      if (
        (
          await prisma.webhookEvent.findUnique({
            where: { id: stored.event.id },
          })
        ).processingStatus === 'PROCESSED'
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const row = await prisma.webhookEvent.findUnique({
      where: { id: stored.event.id },
    });
    assert.equal(row.processingStatus, 'PROCESSED');
    const payment = await prisma.payment.findUnique({ where: { paymentId } });
    assert.equal(payment.amount, 12345n);
    assert.equal(payment.status, 'CAPTURED');
    await worker.close();
    worker = null;
    for (const kind of ['payment.authorized', 'payment.failed']) {
      const e = await event(kind, body);
      await processor.process({ data: { webhookEventId: e.event.id } });
    }
    assert.equal(
      (await prisma.payment.findUnique({ where: { paymentId } })).status,
      'CAPTURED',
    );
    assert.equal(
      (
        await prisma.payment.findUnique({ where: { paymentId } })
      ).capturedAt.getTime(),
      payment.capturedAt.getTime(),
    );
  });
  await test('07 failed dependencies retry and expired PROCESSING claims recover', async () => {
    const providerPaymentId = `pay_${randomUUID()}`,
      refundId = `rfnd_${randomUUID()}`;
    const refundBody = {
      refund: {
        entity: {
          id: refundId,
          payment_id: providerPaymentId,
          amount: 100,
          currency: 'INR',
        },
      },
    };
    const refund = await event('refund.processed', refundBody);
    await assert.rejects(
      () => processor.process({ data: { webhookEventId: refund.event.id } }),
      /awaits payment/,
    );
    assert.equal(
      (await prisma.webhookEvent.findUnique({ where: { id: refund.event.id } }))
        .processingStatus,
      'FAILED',
    );
    const payment = await event('payment.captured', {
      payment: {
        entity: { id: providerPaymentId, amount: 100, currency: 'INR' },
      },
    });
    await prisma.webhookEvent.update({
      where: { id: payment.event.id },
      data: {
        processingStatus: 'PROCESSING',
        claimToken: 'crashed',
        leaseExpiresAt: ago(1),
      },
    });
    await processor.process({ data: { webhookEventId: payment.event.id } });
    await processor.process({ data: { webhookEventId: refund.event.id } });
    const late = await event('refund.failed', refundBody);
    await processor.process({ data: { webhookEventId: late.event.id } });
    assert.equal(
      (await prisma.refund.findUnique({ where: { refundId } })).status,
      'PROCESSED',
    );
    assert.equal(
      (
        await prisma.payment.findUnique({
          where: { paymentId: providerPaymentId },
        })
      ).status,
      'REFUNDED',
    );
  });
  await test('08 deferred order relationships attach when the trusted order arrives', async () => {
    const paymentId = `pay_${randomUUID()}`,
      orderId = `order_${randomUUID()}`;
    const e = await event('payment.captured', {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: 1000,
          currency: 'INR',
        },
      },
    });
    await processor.process({ data: { webhookEventId: e.event.id } });
    assert.equal(
      (await prisma.payment.findUnique({ where: { paymentId } })).orderId,
      null,
    );
    const o = await event('order.paid', {
      order: { entity: { id: orderId, amount: 1000, currency: 'INR' } },
    });
    await processor.process({ data: { webhookEventId: o.event.id } });
    assert.ok(
      (await prisma.payment.findUnique({ where: { paymentId } })).orderId,
    );
  });
  await test('09 exception facts resolve and reopen across repeat runs with collision-free IDs', async () => {
    const order = await prisma.order.create({
      data: {
        merchantId,
        orderId: `order_${randomUUID()}`,
        amount: 10000n,
        status: 'PAID',
        createdAt: ago(240),
      },
    });
    await recon.runReconciliation({ merchantId });
    let exc = await prisma.exception.findFirst({
      where: { merchantId, primaryEntityId: order.id, type: 'PAYMENT_MISSING' },
    });
    assert.ok(exc);
    const id = exc.id;
    await prisma.payment.create({
      data: {
        merchantId,
        orderId: order.id,
        paymentId: `pay_${randomUUID()}`,
        amount: 10000n,
        status: 'CAPTURED',
        capturedAt: ago(240),
        createdAt: ago(240),
      },
    });
    await recon.runReconciliation({ merchantId });
    assert.equal(
      (await prisma.exception.findUnique({ where: { id } })).status,
      'RESOLVED',
    );
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { status: 'FAILED' },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { amount: 12000n },
    });
    await recon.runReconciliation({ merchantId });
    exc = await prisma.exception.findUnique({ where: { id } });
    assert.equal(exc.status, 'OPEN');
    assert.equal(exc.expectedAmount, 12000n);
    assert.equal(exc.resolvedAt, null);
    const ids = await prisma.exception.findMany({
      where: { merchantId },
      select: { exceptionId: true },
    });
    assert.equal(new Set(ids.map((x) => x.exceptionId)).size, ids.length);
  });
  await test('10 scoped runs retain older related captures and full-run metric snapshots', async () => {
    const order = await prisma.order.create({
      data: {
        merchantId,
        orderId: `order_${randomUUID()}`,
        amount: 400n,
        status: 'PAID',
      },
    });
    await prisma.payment.create({
      data: {
        merchantId,
        orderId: order.id,
        paymentId: `pay_${randomUUID()}`,
        amount: 400n,
        status: 'CAPTURED',
        capturedAt: ago(48),
        createdAt: ago(48),
      },
    });
    const before = (await recon.getStats(merchantId)).reconciliation_rate;
    const result = await recon.runReconciliation({
      merchantId,
      dateFrom: ago(1).toISOString(),
    });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(
      await prisma.exception.count({
        where: {
          primaryEntityId: order.id,
          type: 'PAYMENT_MISSING',
          status: 'OPEN',
        },
      }),
      0,
    );
    assert.equal(
      (await recon.getStats(merchantId)).reconciliation_rate,
      before,
    );
  });
  await test('11 large valid financial exposure cannot overflow severity storage', async () => {
    const f = await captured(1000000000000n);
    await prisma.order.update({
      where: { id: f.order.id },
      data: { amount: 1n },
    });
    assert.equal(
      (await recon.runReconciliation({ merchantId })).status,
      'COMPLETED',
    );
    const exc = await prisma.exception.findFirst({
      where: { primaryEntityId: f.order.id, type: 'DUPLICATE_PAYMENT' },
    });
    assert.equal(exc.severityScore, 2147483647);
  });
  await test('12 failed reconciliation persists FAILED and coalesces competing requests', async () => {
    await prisma.payment.create({
      data: {
        merchantId,
        paymentId: `pay_${randomUUID()}`,
        amount: 100n,
        currency: 'USD',
      },
    });
    await assert.rejects(() => recon.runReconciliation({ merchantId }), /INR/);
    assert.ok(
      await prisma.reconciliationRun.findFirst({
        where: {
          merchantId,
          status: 'FAILED',
          errorMessage: { contains: 'INR' },
        },
      }),
    );
    await prisma.payment.updateMany({
      where: { merchantId, currency: 'USD' },
      data: { currency: 'INR' },
    });
    let locked;
    const ready = new Promise((r) => (locked = r));
    const hold = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${merchantId}, 1))`;
      locked();
      await tx.$executeRaw`SELECT pg_sleep(0.4)`;
    });
    await ready;
    const outcomes = await Promise.all([
      recon.runReconciliation({ merchantId }),
      recon.runReconciliation({ merchantId }),
    ]);
    await hold;
    assert.equal(outcomes.filter((o) => o.coalesced).length, 1);
  });
  await test('13 larger bank generator writes valid internal UUIDs', async () => {
    await new BankDataGenerator(prisma).generate({
      merchantId,
      cleanCount: 1,
      noiseCount: 1,
      createPrerequisites: true,
    });
    assert.ok(await prisma.bankTransaction.count({ where: { merchantId } }));
  });
  await test('14 explicit batch import validates net and prevents cross-batch over-allocation', async () => {
    const a = await captured(10000n),
      b = await captured(10000n);
    const settlement = await prisma.settlement.create({
      data: {
        merchantId,
        settlementId: `setl_${randomUUID()}`,
        amount: 19528n,
        status: 'PROCESSED',
        settlementDate: ago(100),
      },
    });
    const service = new SettlementsService(prisma);
    const allocations = [a, b].map((f) => ({
      payment_id: f.payment.id,
      gross_amount: 10000,
      fee_amount: 200,
      tax_amount: 36,
    }));
    await assert.rejects(
      () =>
        service.replaceAllocations(merchantId, finance.id, settlement.id, [
          { ...allocations[0], gross_amount: 9000 },
          allocations[1],
        ]),
      /net must equal/,
    );
    assert.equal(
      (
        await service.replaceAllocations(
          merchantId,
          finance.id,
          settlement.id,
          allocations,
        )
      ).netAmount,
      '19528',
    );
    const other = await prisma.settlement.create({
      data: {
        merchantId,
        settlementId: `setl_${randomUUID()}`,
        amount: 10000n,
        status: 'PROCESSED',
        settlementDate: ago(100),
      },
    });
    await assert.rejects(
      () =>
        service.replaceAllocations(merchantId, finance.id, other.id, [
          { payment_id: a.payment.id, gross_amount: 10000 },
        ]),
      /exceeds captured/,
    );
    const run = await recon.runReconciliation({ merchantId });
    assert.equal(
      await prisma.reconciliationMatch.count({
        where: {
          runId: run.runId,
          targetId: settlement.id,
          sourceType: 'PAYMENT',
        },
      }),
      2,
    );
  });
  await test('15 execution rechecks eligibility after approval and releases a refused reservation', async () => {
    const f = await captured();
    const action = await actions.createAction(
      finance.id,
      propose(f.exc, f.payment, 100000),
    );
    const before = providerCalls;
    await prisma.payment.update({
      where: { id: f.payment.id },
      data: { status: 'FAILED' },
    });
    const result = await actions.approveAction(
      action.id,
      admin1.id,
      merchantId,
      { reason: 'approved before changed payment evidence was observed' },
    );
    assert.equal(result.status, 'FAILED');
    assert.equal(providerCalls, before);
  });
  await test('16 legacy approved intents are not automatically submitted', async () => {
    const f = await captured(),
      before = providerCalls;
    const legacy = await prisma.action.create({
      data: {
        merchantId,
        exceptionId: f.exc.id,
        actionType: 'REFUND',
        status: 'APPROVED',
        requestedById: finance.id,
        parameters: { payment_id: f.payment.id, amount: 100 },
        idempotencyKey: `legacy_${randomUUID()}`,
      },
    });
    await actions.recoverExecution();
    await actions.executeAction(legacy.id, merchantId);
    assert.equal(providerCalls, before);
    assert.equal(
      (await prisma.action.findUnique({ where: { id: legacy.id } })).status,
      'APPROVED',
    );
  });
  await test('17 refund investigation saves evidence trails, integer confidence, fallback and audit atomically', async () => {
    const f = await captured();
    const refund = await prisma.refund.create({
      data: {
        merchantId,
        paymentId: f.payment.id,
        refundId: `rfnd_${randomUUID()}`,
        amount: 100n,
        status: 'PROCESSING',
      },
    });
    const exc = await exception('REFUND', refund.id, {
      type: 'REFUND_DELAY',
      financialImpact: 100n,
    });
    const ai = new AiService(prisma);
    let round = 0;
    ai.client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message:
                  ++round === 1
                    ? {
                        role: 'assistant',
                        tool_calls: [
                          {
                            type: 'function',
                            id: 'read-refund',
                            function: {
                              name: 'get_refund',
                              arguments: JSON.stringify({
                                refund_id: refund.id,
                              }),
                            },
                          },
                        ],
                      }
                    : {
                        content: JSON.stringify({
                          summary: 'Refund awaits processing',
                          confidence: 80,
                          likely_cause: 'Pending refund',
                        }),
                      },
              },
            ],
          }),
        },
      },
    };
    const saved = await ai.investigateException(exc.id, merchantId, finance.id);
    assert.equal(saved.financialExposure, '100');
    assert.equal(saved.toolCalls[0].tool, 'get_refund');
    assert.equal(saved.isFallback, false);
    assert.ok(Number.isInteger(saved.latencyMs));
    assert.ok(
      await prisma.auditLog.findFirst({
        where: { merchantId, entityId: exc.id, action: 'AI_INVESTIGATION' },
      }),
    );
    ai.client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Invalid confidence',
                    confidence: 55.5,
                  }),
                },
              },
            ],
          }),
        },
      },
    };
    const fallback = await ai.investigateException(
      exc.id,
      merchantId,
      finance.id,
    );
    assert.equal(fallback.isFallback, true);
    assert.equal(fallback.confidence, 0);
    const before = await prisma.aiAnalysis.count({
      where: { exceptionId: exc.id },
    });
    const failing = new Proxy(prisma, {
      get: (target, key) =>
        key === '$transaction'
          ? (cb) =>
              target.$transaction((tx) =>
                cb(
                  new Proxy(tx, {
                    get: (t, k) =>
                      k === 'auditLog'
                        ? {
                            create: async () => {
                              throw new Error('audit offline');
                            },
                          }
                        : Reflect.get(t, k),
                  }),
                ),
              )
          : Reflect.get(target, key),
    });
    const failedAi = new AiService(failing);
    failedAi.client = null;
    await assert.rejects(
      () => failedAi.investigateException(exc.id, merchantId, finance.id),
      /audit offline/,
    );
    assert.equal(
      await prisma.aiAnalysis.count({ where: { exceptionId: exc.id } }),
      before,
    );
  });
  await test('18 a verified refund webhook replaces an uncertain reservation exactly once', async () => {
    const f = await captured(1000n);
    const uncertain = new ActionsService(prisma, new PolicyService(), {
      ...gateway,
      createRefund: async () => {
        providerCalls++;
        throw new Error('reply lost');
      },
    });
    await assert.rejects(
      () =>
        uncertain.createAction(
          finance.id,
          propose(f.exc, f.payment, 100, 'lost reply'),
        ),
      /reply lost/,
    );
    const action = await prisma.action.findFirst({
      where: { exceptionId: f.exc.id },
    });
    assert.equal(action.status, 'OUTCOME_UNKNOWN');
    const confirmation = await event('refund.created', {
      refund: {
        entity: {
          id: `rfnd_${randomUUID()}`,
          payment_id: f.payment.paymentId,
          amount: 100,
          currency: 'INR',
          notes: { operation_id: action.id },
        },
      },
    });
    await processor.process({
      data: { webhookEventId: confirmation.event.id },
    });
    assert.equal(
      (await prisma.action.findUnique({ where: { id: action.id } })).status,
      'COMPLETED',
    );
    assert.equal(
      (
        await actions.createAction(
          finance.id,
          propose(f.exc, f.payment, 900, 'remaining balance'),
        )
      ).status,
      'COMPLETED',
    );
    assert.ok(
      await prisma.auditLog.findFirst({
        where: {
          entityId: action.id,
          action: 'ACTION_OUTCOME_VERIFIED_BY_WEBHOOK',
        },
      }),
    );
  });
  await test('19 later refund-only batch components require processed refund evidence without repeating capture gross', async () => {
    const a = await captured(10000n),
      b = await captured(10000n),
      service = new SettlementsService(prisma);
    const first = await prisma.settlement.create({
      data: {
        merchantId,
        settlementId: `setl_${randomUUID()}`,
        amount: 10000n,
        status: 'PROCESSED',
        settlementDate: ago(100),
      },
    });
    await service.replaceAllocations(merchantId, finance.id, first.id, [
      { payment_id: a.payment.id, gross_amount: 10000 },
    ]);
    const later = await prisma.settlement.create({
      data: {
        merchantId,
        settlementId: `setl_${randomUUID()}`,
        amount: 5000n,
        status: 'PROCESSED',
        settlementDate: ago(100),
      },
    });
    const rows = [
      { payment_id: a.payment.id, gross_amount: 0, refund_amount: 5000 },
      { payment_id: b.payment.id, gross_amount: 10000 },
    ];
    await assert.rejects(
      () => service.replaceAllocations(merchantId, finance.id, later.id, rows),
      /processed refund evidence/,
    );
    await prisma.refund.create({
      data: {
        merchantId,
        paymentId: a.payment.id,
        refundId: `rfnd_${randomUUID()}`,
        amount: 5000n,
        status: 'PROCESSED',
        processedAt: ago(101),
      },
    });
    await service.replaceAllocations(merchantId, finance.id, later.id, rows);
    const run = await recon.runReconciliation({ merchantId });
    assert.equal(
      await prisma.reconciliationMatch.count({
        where: { runId: run.runId, targetId: later.id, sourceType: 'PAYMENT' },
      }),
      2,
    );
  });
  console.log(
    JSON.stringify({
      passed: results.length,
      database: 'isolated loopback',
      queue: 'isolated Redis',
      providerCalls: 'stubbed only',
    }),
  );
} finally {
  await worker?.close();
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  await prisma.$disconnect();
}
