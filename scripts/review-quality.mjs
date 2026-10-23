/** Quality-review acceptance probes: guarded disposable PostgreSQL, synthetic data,
 * stubbed providers only. Nonzero exit means an expected invariant failed.
 * This does not treat reproduction of a defect as a passing regression.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
assert.equal(
  process.env.AI_ENABLED,
  'false',
  'Provider calls must be disabled',
);
const { PrismaClient } = require('@prisma/client');
const { ActionsService } =
  await import('../backend/dist/modules/actions/actions.service.js');
const { PolicyService } =
  await import('../backend/dist/modules/actions/policy.service.js');
const { ReconciliationService } =
  await import('../backend/dist/modules/reconciliation/reconciliation.service.js');
const { WebhookProcessor } =
  await import('../backend/dist/workers/webhook.processor.js');
const { WebhooksService } =
  await import('../backend/dist/modules/webhooks/webhooks.service.js');
const { AiService } = await import('../backend/dist/modules/ai/ai.service.js');
const prisma = new PrismaClient();
const results = [];
async function check(id, description, fn) {
  try {
    await fn();
    results.push({ id, description, passed: true });
  } catch (error) {
    results.push({
      id,
      description,
      passed: false,
      error: String(error.message),
    });
  }
  console.log(JSON.stringify(results.at(-1)));
}
const ago = (hours) => new Date(Date.now() - hours * 3600000);
async function fixture() {
  const merchant = await prisma.merchant.create({
    data: {
      name: 'Quality review',
      email: `${randomUUID()}@example.invalid`,
      razorpayAccountId: `acc_${randomUUID()}`,
    },
  });
  const users = await Promise.all(
    ['FINANCE', 'ADMIN'].map((role) =>
      prisma.user.create({
        data: {
          merchantId: merchant.id,
          name: role,
          email: `${randomUUID()}@example.invalid`,
          passwordHash: 'unusable',
          role,
        },
      }),
    ),
  );
  return { merchant, finance: users[0], admin: users[1] };
}
async function orderFor(merchant, amount = 10000n) {
  return prisma.order.create({
    data: {
      merchantId: merchant.id,
      orderId: `order_${randomUUID()}`,
      amount,
      status: 'CREATED',
      createdAt: ago(240),
    },
  });
}
function gateway() {
  return {
    mode: 'simulation',
    createRefund: async (paymentId, amount, operationId) => ({
      id: `rfnd_${operationId}`,
      payment_id: paymentId,
      amount,
      currency: 'INR',
      status: 'processed',
    }),
  };
}
try {
  await check(
    'Q1',
    'empty or truncated AI analysis is reported as fallback',
    async () => {
      const exception = {
        id: randomUUID(),
        exceptionId: 'EXC-synthetic',
        financialImpact: 100n,
        customerImpact: 'LOW',
        events: [],
      };
      const fake = {
        exception: { findFirst: async () => exception },
        $transaction: async (fn) =>
          fn({
            aiAnalysis: {
              create: async ({ data }) => ({ id: randomUUID(), ...data }),
            },
            auditLog: { create: async () => ({}) },
          }),
      };
      const ai = new AiService(fake);
      ai.client = {
        chat: {
          completions: {
            create: async () => ({
              choices: [
                { finish_reason: 'length', message: { content: null } },
              ],
            }),
          },
        },
      };
      const result = await ai.investigateException(exception.id, randomUUID());
      assert.equal(
        result.isFallback,
        true,
        `Empty content was saved as summary=${JSON.stringify(result.summary)}, isFallback=${result.isFallback}`,
      );
    },
  );
  await check(
    'Q2',
    'reconciliation preserves a newer operator review transition',
    async () => {
      const { merchant, finance } = await fixture();
      const order = await orderFor(merchant);
      const recon = new ReconciliationService(prisma);
      await recon.runReconciliation({ merchantId: merchant.id });
      const parent = await prisma.exception.findFirstOrThrow({
        where: {
          merchantId: merchant.id,
          primaryEntityId: order.id,
          type: 'PAYMENT_MISSING',
        },
      });
      let signal, release;
      const reached = new Promise((resolve) => {
        signal = resolve;
      });
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      let paused = false;
      const wrapper = new Proxy(prisma, {
        get(target, key) {
          if (key === '$transaction')
            return (fn, options) =>
              prisma.$transaction(
                (tx) =>
                  fn(
                    new Proxy(tx, {
                      get(transaction, property) {
                        if (property === 'exception')
                          return new Proxy(transaction.exception, {
                            get(delegate, method) {
                              if (method === 'findUnique')
                                return async (args) => {
                                  const row = await delegate.findUnique(args);
                                  if (
                                    !paused &&
                                    args.where?.dedupKey === parent.dedupKey
                                  ) {
                                    paused = true;
                                    signal();
                                    await gate;
                                  }
                                  return row;
                                };
                              const value = delegate[method];
                              return typeof value === 'function'
                                ? value.bind(delegate)
                                : value;
                            },
                          });
                        const value = transaction[property];
                        return typeof value === 'function'
                          ? value.bind(transaction)
                          : value;
                      },
                    }),
                  ),
                options,
              );
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const running = new ReconciliationService(wrapper).runReconciliation({
        merchantId: merchant.id,
      });
      try {
        await Promise.race([
          reached,
          new Promise((_, reject) => {
            const timer = setTimeout(
              () =>
                reject(new Error('Review schedule did not reach its pause')),
              15000,
            );
            timer.unref();
          }),
        ]);
        const actions = new ActionsService(
          prisma,
          new PolicyService(),
          gateway(),
        );
        await actions.createAction(finance.id, {
          exception_id: parent.id,
          action_type: 'MARK_REVIEWED',
          parameters: {},
        });
        assert.equal(
          (
            await prisma.exception.findUniqueOrThrow({
              where: { id: parent.id },
            })
          ).status,
          'INVESTIGATING',
        );
      } finally {
        release();
        await running;
      }
      assert.equal(
        (await prisma.exception.findUniqueOrThrow({ where: { id: parent.id } }))
          .status,
        'INVESTIGATING',
        'Reconciliation replaced the newer review state with its stale OPEN snapshot',
      );
    },
  );
  await check(
    'Q3',
    'an exhausted webhook cannot acquire attempt 21',
    async () => {
      const { merchant } = await fixture();
      const event = await prisma.webhookEvent.create({
        data: {
          eventId: `quality_${randomUUID()}`,
          merchantId: merchant.id,
          eventType: 'payment.captured',
          signatureVerified: true,
          processingStatus: 'FAILED',
          processingAttempts: 20,
          payload: { account_id: merchant.razorpayAccountId, payload: {} },
        },
      });
      const worker = new WebhookProcessor(prisma, {
        runReconciliation: async () => ({}),
      });
      let processingError;
      try {
        await worker.process({ data: { webhookEventId: event.id } });
      } catch (error) {
        processingError = error;
      }
      assert.equal(
        (
          await prisma.webhookEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).processingAttempts,
        20,
        'Worker retried a permanently exhausted event',
      );
      assert.equal(
        processingError,
        undefined,
        'An exhausted delivery must be an intentional no-op, not an unrelated worker error',
      );
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingAttempts: 19 },
      });
      await assert.rejects(
        () => worker.process({ data: { webhookEventId: event.id } }),
        /Missing payment entity/,
      );
      await worker.process({ data: { webhookEventId: event.id } });
      assert.equal(
        (
          await prisma.webhookEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).processingAttempts,
        20,
      );
      let queued = 0;
      const ingress = new WebhooksService(prisma, {
        add: async () => {
          queued++;
        },
      });
      assert.equal((await ingress.retry(merchant.id, event.id)).retried, true);
      assert.equal(queued, 1);
      await assert.rejects(
        () => worker.process({ data: { webhookEventId: event.id } }),
        /Missing payment entity/,
      );
      assert.equal(
        (
          await prisma.webhookEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).processingAttempts,
        1,
      );
    },
  );
  await check(
    'Q4',
    'confirmed cancelled links permit a fresh collectible proposal',
    async () => {
      const { merchant, finance, admin } = await fixture();
      const order = await orderFor(merchant);
      const recon = new ReconciliationService(prisma);
      await recon.runReconciliation({ merchantId: merchant.id });
      const parent = await prisma.exception.findFirstOrThrow({
        where: {
          merchantId: merchant.id,
          primaryEntityId: order.id,
          type: 'PAYMENT_MISSING',
        },
      });
      let reference;
      const provider = {
        mode: 'simulation',
        createPaymentLink: async (_order, _amount, id) => {
          reference = id;
          throw new Error('Synthetic lost provider response');
        },
        fetchOutcome: async () => ({
          id: 'plink_synthetic_cancelled',
          reference_id: reference,
          amount: 10000,
          currency: 'INR',
          short_url: 'https://example.invalid/cancelled',
          status: 'cancelled',
        }),
      };
      const actions = new ActionsService(prisma, new PolicyService(), provider);
      const proposal = {
        exception_id: parent.id,
        action_type: 'CREATE_PAYMENT_LINK',
        parameters: { order_id: order.id, amount: 10000 },
      };
      await actions.createAction(finance.id, proposal).catch(() => {});
      const unknown = await prisma.action.findUniqueOrThrow({
        where: { id: reference },
      });
      assert.equal(unknown.status, 'OUTCOME_UNKNOWN');
      await assert.rejects(
        () =>
          actions.createAction(finance.id, {
            ...proposal,
            parameters: {
              ...proposal.parameters,
              reason: 'Unknown links stay protective',
            },
          }),
        /active payment link/,
      );
      const recovered = await actions.recoverOutcome(
        reference,
        admin.id,
        merchant.id,
        'plink_synthetic_cancelled',
      );
      assert.equal(recovered.executionResult.status, 'cancelled');
      assert.equal(recovered.status, 'FAILED');
      assert.equal(
        await prisma.auditLog.count({
          where: {
            entityId: reference,
            action: 'ACTION_PAYMENT_LINK_INACTIVE',
          },
        }),
        1,
      );
      // A different reason distinguishes the new intent from an idempotent replay.
      let replacements = 0;
      provider.createPaymentLink = async (_order, amount, id) => {
        replacements++;
        return {
          id: `plink_${id.replaceAll('-', '')}`,
          reference_id: id,
          amount,
          currency: 'INR',
          short_url: 'https://example.invalid/new',
          status: 'created',
        };
      };
      const outcomes = await Promise.allSettled(
        ['replacement A', 'replacement B'].map((reason) =>
          actions.createAction(finance.id, {
            ...proposal,
            parameters: {
              ...proposal.parameters,
              reason,
            },
          }),
        ),
      );
      assert.equal(
        outcomes.filter((result) => result.status === 'fulfilled').length,
        1,
        'Exactly one concurrent replacement may succeed',
      );
      assert.equal(replacements, 1);
      const active = outcomes.find(
        (result) => result.status === 'fulfilled',
      ).value;
      provider.fetchOutcome = async () => ({
        ...active.executionResult,
        status: 'created',
      });
      assert.equal(
        (
          await actions.recoverOutcome(
            active.id,
            admin.id,
            merchant.id,
            active.executionResult.id,
          )
        ).status,
        'COMPLETED',
      );
      await assert.rejects(
        () =>
          actions.createAction(finance.id, {
            ...proposal,
            parameters: {
              ...proposal.parameters,
              reason: 'Active links remain protective',
            },
          }),
        /active payment link/,
      );
      provider.fetchOutcome = async () => ({
        ...active.executionResult,
        status: 'expired',
      });
      assert.equal(
        (
          await actions.recoverOutcome(
            active.id,
            admin.id,
            merchant.id,
            active.executionResult.id,
          )
        ).status,
        'FAILED',
      );
      await assert.doesNotReject(() =>
        actions.createAction(finance.id, {
          ...proposal,
          parameters: {
            ...proposal.parameters,
            reason: 'Replace verified expired link',
          },
        }),
      );
    },
  );
  await check(
    'Q5',
    'an unsubmitted refund is revalidated against a resolved parent',
    async () => {
      const { merchant, finance, admin } = await fixture();
      const order = await orderFor(merchant, 100000n);
      const payments = await Promise.all(
        [0, 1].map(() =>
          prisma.payment.create({
            data: {
              merchantId: merchant.id,
              orderId: order.id,
              paymentId: `pay_${randomUUID()}`,
              amount: 100000n,
              status: 'CAPTURED',
              capturedAt: ago(1),
            },
          }),
        ),
      );
      const recon = new ReconciliationService(prisma);
      await recon.runReconciliation({ merchantId: merchant.id });
      const parent = await prisma.exception.findFirstOrThrow({
        where: {
          merchantId: merchant.id,
          primaryEntityId: order.id,
          type: 'DUPLICATE_PAYMENT',
        },
      });
      let calls = 0;
      const provider = gateway();
      const refund = provider.createRefund;
      provider.createRefund = async (...args) => {
        calls++;
        return refund(...args);
      };
      const actions = new ActionsService(prisma, new PolicyService(), provider);
      const pending = await actions.createAction(finance.id, {
        exception_id: parent.id,
        action_type: 'REFUND',
        parameters: {
          payment_id: payments[0].id,
          amount: 100000,
          reason: 'Remove duplicate charge',
        },
      });
      assert.equal(pending.status, 'PENDING_APPROVAL');
      await prisma.refund.create({
        data: {
          merchantId: merchant.id,
          paymentId: payments[1].id,
          refundId: `rfnd_${randomUUID()}`,
          amount: 100000n,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
      await prisma.payment.update({
        where: { id: payments[1].id },
        data: { status: 'REFUNDED' },
      });
      await recon.runReconciliation({ merchantId: merchant.id });
      assert.equal(
        (await prisma.exception.findUniqueOrThrow({ where: { id: parent.id } }))
          .status,
        'RESOLVED',
      );
      let approvalError;
      try {
        await actions.approveAction(pending.id, admin.id, merchant.id, {
          reason: 'Review the existing proposal',
        });
      } catch (error) {
        approvalError = error;
      }
      assert.equal(
        calls,
        0,
        'Provider was called for an unsubmitted intent after its discrepancy had already resolved',
      );
      const outcome = await prisma.action.findUniqueOrThrow({
        where: { id: pending.id },
      });
      if (approvalError) {
        assert.equal(
          approvalError.getStatus?.(),
          400,
          'Only an intentional eligibility rejection counts as a pass',
        );
        assert.match(
          approvalError.message,
          /exception|parent|resolved|actionable|active/i,
        );
      } else {
        assert.ok(
          ['FAILED', 'REJECTED'].includes(outcome.status),
          'A blocked stale intent must have a visible nonexecution outcome',
        );
        assert.match(
          outcome.failureReason ?? '',
          /exception|parent|resolved|actionable|active/i,
        );
      }
      for (const state of ['RESOLVED', 'IGNORED', 'OPEN', 'INVESTIGATING']) {
        const capture = await prisma.payment.create({
          data: {
            merchantId: merchant.id,
            paymentId: `pay_${randomUUID()}`,
            amount: 10000n,
            status: 'CAPTURED',
            capturedAt: new Date(),
          },
        });
        const parent = await prisma.exception.create({
          data: {
            merchantId: merchant.id,
            exceptionId: `EXC-${randomUUID()}`,
            dedupKey: `gate:${randomUUID()}`,
            type: 'DUPLICATE_PAYMENT',
            severity: 'LOW',
            primaryEntityType: 'PAYMENT',
            primaryEntityId: capture.id,
          },
        });
        let interleaved = false,
          submissions = 0;
        const proxy = new Proxy(prisma, {
          get(target, key) {
            if (key === '$transaction')
              return async (...args) => {
                const result = await target.$transaction(...args);
                if (!interleaved && result?.status === 'EXECUTING') {
                  interleaved = true;
                  await prisma.exception.update({
                    where: { id: parent.id },
                    data: { status: state },
                  });
                }
                return result;
              };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        const provider = gateway();
        const refund = provider.createRefund;
        provider.createRefund = async (...args) => {
          submissions++;
          return refund(...args);
        };
        const service = new ActionsService(
          proxy,
          new PolicyService(),
          provider,
        );
        let error;
        try {
          await service.createAction(finance.id, {
            exception_id: parent.id,
            action_type: 'REFUND',
            parameters: { payment_id: capture.id, amount: 10000 },
          });
        } catch (caught) {
          error = caught;
        }
        const action = await prisma.action.findFirstOrThrow({
          where: { exceptionId: parent.id },
        });
        const terminal = ['RESOLVED', 'IGNORED'].includes(state);
        assert.equal(submissions, terminal ? 0 : 1);
        assert.equal(action.status, terminal ? 'FAILED' : 'COMPLETED');
        if (terminal) {
          assert.equal(error?.getStatus?.(), 400);
          assert.equal(action.externalSubmittedAt, null);
          assert.match(action.failureReason, /no longer active/);
        } else assert.equal(error, undefined);
      }
    },
  );
  console.log(
    JSON.stringify({
      checks: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      providerCalls: 'stubbed only',
    }),
  );
  if (results.some((result) => !result.passed)) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
