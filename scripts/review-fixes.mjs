/** Regression acceptance for R1–R6 from the follow-up review.
 * Uses only a guarded disposable database; providers are stubbed/disabled.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
const { PrismaClient } = require('@prisma/client');
const { ActionsService } =
  await import('../backend/dist/modules/actions/actions.service.js');
const { PolicyService } =
  await import('../backend/dist/modules/actions/policy.service.js');
const { RazorpayClient } =
  await import('../backend/dist/integrations/razorpay/razorpay.client.js');
const { ReconciliationService } =
  await import('../backend/dist/modules/reconciliation/reconciliation.service.js');
const prisma = new PrismaClient();
const ago = (h) => new Date(Date.now() - h * 3600000);
const owner = await prisma.merchant.create({
  data: { name: 'Fix re-review', email: 'review@example.invalid' },
});
const merchantId = owner.id;
const user = await prisma.user.create({
  data: {
    merchantId,
    name: 'Reviewer',
    email: `${randomUUID()}@example.invalid`,
    passwordHash: 'unusable',
    role: 'FINANCE',
  },
});
async function fixture() {
  const order = await prisma.order.create({
    data: {
      merchantId,
      orderId: `order_${randomUUID()}`,
      amount: 10000n,
      status: 'PAID',
      createdAt: ago(240),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      merchantId,
      orderId: order.id,
      paymentId: `pay_${randomUUID()}`,
      amount: 10000n,
      status: 'CAPTURED',
      capturedAt: ago(240),
    },
  });
  const exception = await prisma.exception.create({
    data: {
      merchantId,
      exceptionId: `EXC-${randomUUID()}`,
      dedupKey: `manual:${randomUUID()}`,
      type: 'DUPLICATE_PAYMENT',
      severity: 'HIGH',
      primaryEntityType: 'PAYMENT',
      primaryEntityId: payment.id,
    },
  });
  return { order, payment, exception };
}
async function intent(f, overrides = {}) {
  return prisma.action.create({
    data: {
      merchantId,
      exceptionId: f.exception.id,
      actionType: 'REFUND',
      parameters: { payment_id: f.payment.id, amount: 5000 },
      requestedById: user.id,
      idempotencyKey: randomUUID(),
      targetPaymentId: f.payment.id,
      reservedAmount: 5000n,
      status: 'EXECUTING',
      executionProtocol: 'v2',
      executionLeaseUntil: ago(1),
      ...overrides,
    },
  });
}
const gateway = {
  createRefund: async (payment_id, amount, id) => ({
    id: `rfnd_${id}`,
    payment_id,
    amount,
    currency: 'INR',
    status: 'processed',
  }),
};
try {
  // Submission occurs after the recovery query read the expired row, before its UPDATE.
  {
    const f = await fixture(),
      action = await intent(f);
    let submissions = 0,
      interleaved = false;
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return async (...args) => {
            if (!interleaved) {
              interleaved = true;
              await prisma.action.update({
                where: { id: action.id },
                data: { externalSubmittedAt: new Date() },
              });
              submissions++;
            }
            return target.$transaction(...args);
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const service = new ActionsService(proxy, new PolicyService(), {
      ...gateway,
      createRefund: async (...args) => {
        submissions++;
        return gateway.createRefund(...args);
      },
    });
    await service.recoverExecution();
    assert.equal(submissions, 1);
    assert.equal(
      (await prisma.action.findUniqueOrThrow({ where: { id: action.id } }))
        .status,
      'OUTCOME_UNKNOWN',
    );
    console.log(
      'PASS R1: recovery re-reads concurrent submission and never re-submits the intent',
    );
  }
  // A previously paused worker must not mark or fail a replacement's claim.
  {
    for (const replaceClaim of [false, true]) {
      const f = await fixture(),
        action = await intent(f, {
          status: 'APPROVED',
          executionLeaseUntil: null,
        });
      let calls = 0,
        intercepted = false;
      const provider = {
        ...gateway,
        createRefund: async (...args) => {
          calls++;
          return gateway.createRefund(...args);
        },
      };
      const recovery = new ActionsService(
        prisma,
        new PolicyService(),
        provider,
      );
      const proxy = new Proxy(prisma, {
        get(target, key) {
          if (key === '$transaction')
            return async (...args) => {
              const result = await target.$transaction(...args);
              // Pause after the claim commits, before the now-transactional
              // submission gate locks/rechecks ownership and parent lifecycle.
              if (
                !intercepted &&
                result?.id === action.id &&
                result.status === 'EXECUTING' &&
                !result.externalSubmittedAt
              ) {
                intercepted = true;
                await prisma.action.update({
                  where: { id: action.id },
                  data: { executionLeaseUntil: ago(1) },
                });
                if (replaceClaim) await recovery.recoverExecution();
              }
              return result;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await new ActionsService(
        proxy,
        new PolicyService(),
        provider,
      ).executeAction(action.id, merchantId);
      assert.equal(calls, replaceClaim ? 1 : 0);
      if (!replaceClaim) await recovery.recoverExecution();
      assert.equal(calls, 1);
      assert.equal(
        (await prisma.action.findUniqueOrThrow({ where: { id: action.id } }))
          .status,
        'COMPLETED',
      );
    }
    console.log(
      'PASS R1 ownership: expired and replaced owners never submit or overwrite a replacement',
    );
  }
  // Both finish transactions read their own refund before either commits.
  {
    const f = await fixture(),
      a = await intent(f, { externalSubmittedAt: new Date() }),
      b = await intent(f, { externalSubmittedAt: new Date() });
    // Force B to attempt its payment lock while A holds it. B must read sums
    // only after A commits; this schedule failed before the shared lock fix.
    let firstLocked, secondAttempted;
    const firstHasLock = new Promise((resolve) => {
      firstLocked = resolve;
    });
    const secondStarted = new Promise((resolve) => {
      secondAttempted = resolve;
    });
    let transactions = 0,
      paymentLocks = 0;
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (cb, ...rest) => {
            const first = ++transactions === 1;
            return target.$transaction(
              async (tx) => {
                const wrapped = new Proxy(tx, {
                  get(t, k) {
                    if (k === '$queryRaw')
                      return async (strings, ...args) => {
                        const paymentLock = strings
                          .join('')
                          .includes('FROM payments');
                        if (paymentLock) paymentLocks++;
                        if (paymentLock && !first) {
                          await firstHasLock;
                          secondAttempted();
                        }
                        const value = await t.$queryRaw(strings, ...args);
                        if (paymentLock && first) {
                          firstLocked();
                          await secondStarted;
                        }
                        return value;
                      };
                    return Reflect.get(t, k);
                  },
                });
                return cb(wrapped);
              },
              ...rest,
            );
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const service = new ActionsService(proxy, new PolicyService(), gateway);
    await Promise.all(
      [a, b].map((action) =>
        service.finish(action, {
          id: `rfnd_${action.id}`,
          payment_id: f.payment.paymentId,
          amount: 5000,
          currency: 'INR',
          status: 'processed',
        }),
      ),
    );
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: f.payment.id },
    });
    const total = await prisma.refund.aggregate({
      where: { paymentId: payment.id, status: 'PROCESSED' },
      _sum: { amount: true },
    });
    assert.equal(total._sum.amount, 10000n);
    assert.equal(payment.status, 'REFUNDED');
    assert.equal(paymentLocks, 2);
    console.log(
      'PASS R2: concurrent processed refunds serialize on the payment and derive REFUNDED',
    );
  }
  {
    const f = await fixture();
    process.env.PAYMENT_EXECUTION_MODE = 'disabled';
    const service = new ActionsService(
      prisma,
      new PolicyService(),
      new RazorpayClient(),
    );
    await assert.rejects(
      () =>
        service.createAction(user.id, {
          exception_id: f.exception.id,
          action_type: 'REFUND',
          parameters: { payment_id: f.payment.id, amount: 5000 },
        }),
      /disabled/,
    );
    assert.equal(
      await prisma.action.count({ where: { exceptionId: f.exception.id } }),
      0,
    );
    console.log(
      'PASS R3: disabled execution rejects new financial intent without reserving capacity',
    );
  }
  {
    const service = new ReconciliationService(prisma),
      at = ago(100);
    const settlements = [
      {
        id: 'weak',
        merchantId,
        amount: 10000n,
        currency: 'INR',
        status: 'PROCESSED',
        utr: null,
        settlementDate: at,
      },
      {
        id: 'exact',
        merchantId,
        amount: 10000n,
        currency: 'INR',
        status: 'PROCESSED',
        utr: 'KNOWN',
        settlementDate: at,
      },
    ];
    const bank = [
      {
        id: 'credit',
        merchantId,
        amount: 10000n,
        currency: 'INR',
        status: 'POSTED',
        transactionType: 'CREDIT',
        utr: 'KNOWN',
        transactionDate: at,
      },
    ];
    const exceptions = [],
      matches = [];
    service.checkSettlementBank(
      settlements,
      bank,
      exceptions,
      matches,
      merchantId,
    );
    assert.equal(matches[0].sourceId, 'exact');
    assert.equal(matches[0].matchMethod, 'UTR');
    assert.ok(exceptions.some((e) => e.primaryEntityId === 'weak'));
    const reversed = [];
    service.checkSettlementBank(
      [...settlements].reverse(),
      bank,
      [],
      reversed,
      merchantId,
    );
    assert.deepEqual(reversed, matches);
    const ambiguous = [];
    service.checkSettlementBank(
      settlements.map((s) => ({ ...s, utr: null })),
      bank,
      [],
      ambiguous,
      merchantId,
    );
    assert.equal(ambiguous.length, 0);
    console.log(
      'PASS R4: exact evidence wins independent of iteration order; ambiguous fallback is refused',
    );
    const errors = [],
      links = [];
    service.checkBankPaymentMismatch(
      [
        {
          id: 'failed',
          merchantId,
          currency: 'INR',
          status: 'FAILED',
          createdAt: at,
        },
      ],
      [4000n, 6000n].map((amount, i) => ({
        id: `credit${i}`,
        merchantId,
        paymentId: 'failed',
        currency: 'INR',
        status: 'POSTED',
        transactionType: 'CREDIT',
        amount,
        transactionDate: at,
      })),
      errors,
      merchantId,
      links,
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0].financialImpact, 10000n);
    const failed = await prisma.payment.create({
      data: {
        merchantId,
        paymentId: `pay_${randomUUID()}`,
        amount: 10000n,
        status: 'FAILED',
        createdAt: at,
      },
    });
    for (const amount of [4000n, 6000n])
      await prisma.bankTransaction.create({
        data: {
          merchantId,
          bankTxnId: `bank_${randomUUID()}`,
          paymentId: failed.id,
          amount,
          status: 'POSTED',
          transactionType: 'CREDIT',
          transactionDate: at,
        },
      });
    await service.runReconciliation({ merchantId });
    const saved = await prisma.exception.findFirstOrThrow({
      where: {
        merchantId,
        type: 'BANK_PAYMENT_MISMATCH',
        primaryEntityId: failed.id,
      },
    });
    assert.equal(saved.financialImpact, 10000n);
    console.log(
      'PASS R5: actual SQL reconciliation preserves the combined 10000 exposure',
    );
  }
  // A new exception after partial collection ignores a prior link for the same order.
  {
    const order = await prisma.order.create({
      data: {
        merchantId,
        orderId: `order_${randomUUID()}`,
        amount: 10000n,
        status: 'CREATED',
        createdAt: ago(240),
      },
    });
    const makeException = (type) =>
      prisma.exception.create({
        data: {
          merchantId,
          exceptionId: `EXC-${randomUUID()}`,
          dedupKey: `manual:${randomUUID()}`,
          type,
          severity: 'HIGH',
          primaryEntityType: 'ORDER',
          primaryEntityId: order.id,
        },
      });
    const first = await makeException('PAYMENT_MISSING');
    let calls = 0;
    const service = new ActionsService(prisma, new PolicyService(), {
      createPaymentLink: async (_order, amount, id) => {
        calls++;
        return {
          id: `plink_${id}`,
          amount,
          currency: 'INR',
          reference_id: id,
          short_url: 'https://example.invalid/link',
        };
      },
    });
    await service.createAction(user.id, {
      exception_id: first.id,
      action_type: 'CREATE_PAYMENT_LINK',
      parameters: { order_id: order.id, amount: 10000 },
    });
    await prisma.exception.update({
      where: { id: first.id },
      data: { status: 'RESOLVED' },
    });
    await prisma.payment.create({
      data: {
        merchantId,
        orderId: order.id,
        paymentId: `pay_${randomUUID()}`,
        amount: 3000n,
        status: 'CAPTURED',
        capturedAt: new Date(),
      },
    });
    const second = await makeException('ORDER_PAYMENT_MISMATCH');
    await assert.rejects(
      () =>
        service.createAction(user.id, {
          exception_id: second.id,
          action_type: 'CREATE_PAYMENT_LINK',
          parameters: { order_id: order.id, amount: 7000 },
        }),
      /active payment link/,
    );
    assert.equal(calls, 1);
    // Legacy targets must remain protective after a schema upgrade.
    await prisma.action.updateMany({
      where: { exceptionId: first.id },
      data: { targetOrderId: null },
    });
    await assert.rejects(
      () =>
        service.createAction(user.id, {
          exception_id: second.id,
          action_type: 'CREATE_PAYMENT_LINK',
          parameters: { order_id: order.id, amount: 7000 },
        }),
      /active payment link/,
    );
    console.log(
      'PASS R6: one active link per order across exception transitions, including legacy rows',
    );
  }
} finally {
  await prisma.$disconnect();
}
