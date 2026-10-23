/** R8 regression acceptance. Guarded disposable PostgreSQL only; providers are stubs. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
const { PrismaClient } = require('@prisma/client');
const { ActionsService } =
  await import('../backend/dist/modules/actions/actions.service.js');
const { PolicyService } =
  await import('../backend/dist/modules/actions/policy.service.js');
const { ReconciliationService } =
  await import('../backend/dist/modules/reconciliation/reconciliation.service.js');
const prisma = new PrismaClient();
const merchant = await prisma.merchant.create({
  data: { name: 'Lifecycle acceptance', email: 'lifecycle@example.invalid' },
});
const merchantId = merchant.id;
const user = await prisma.user.create({
  data: {
    merchantId,
    name: 'Reviewer',
    email: `${randomUUID()}@example.invalid`,
    role: 'FINANCE',
    passwordHash: 'unusable',
  },
});
const recon = new ReconciliationService(prisma);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const parentFacts = (parent) => ({
  status: parent.status,
  resolvedAt: parent.resolvedAt?.toISOString() ?? null,
  resolutionNote: parent.resolutionNote,
  severity: parent.severity,
  severityScore: parent.severityScore,
  runId: parent.runId,
  occurrenceCount: parent.occurrenceCount,
  financialImpact: parent.financialImpact,
  updatedAt: parent.updatedAt.toISOString(),
});
const parent = (id) => prisma.exception.findUniqueOrThrow({ where: { id } });
const terminalData = (status) => ({
  status,
  resolvedAt: status === 'RESOLVED' ? new Date() : null,
  resolutionNote: `Keep ${status} decision`,
  severity: 'LOW',
  severityScore: 25,
});
async function fixture() {
  const order = await prisma.order.create({
    data: {
      merchantId,
      orderId: `order_${randomUUID()}`,
      amount: 10000n,
      status: 'CREATED',
      createdAt: new Date(Date.now() - 2 * 3600000),
    },
  });
  await recon.runReconciliation({ merchantId });
  const exception = await prisma.exception.findFirstOrThrow({
    where: {
      merchantId,
      primaryEntityId: order.id,
      type: 'PAYMENT_MISSING',
      status: 'OPEN',
    },
  });
  return { order, exception };
}
async function claimed(f, actionType) {
  return prisma.action.create({
    data: {
      merchantId,
      exceptionId: f.exception.id,
      actionType,
      status: 'EXECUTING',
      executionProtocol: 'v2',
      executionClaimToken: randomUUID(),
      executionLeaseUntil: new Date(Date.now() + 120000),
      parameters:
        actionType === 'CREATE_PAYMENT_LINK'
          ? { order_id: f.order.id, amount: 10000 }
          : {},
      targetOrderId: actionType === 'CREATE_PAYMENT_LINK' ? f.order.id : null,
      requestedById: user.id,
      idempotencyKey: randomUUID(),
    },
  });
}
const result = (action) =>
  action.actionType === 'CREATE_PAYMENT_LINK'
    ? {
        id: `plink_${action.id}`,
        amount: 10000,
        currency: 'INR',
        reference_id: action.id,
        short_url: 'https://example.invalid/link',
      }
    : {};
async function assertCompletion(action, before) {
  assert.equal(
    (await prisma.action.findUniqueOrThrow({ where: { id: action.id } }))
      .status,
    'COMPLETED',
  );
  assert.deepEqual(
    parentFacts(await parent(action.exceptionId)),
    parentFacts(before),
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { entityId: action.id, action: 'ACTION_PARENT_STATE_PRESERVED' },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { entityId: action.id, action: 'ACTION_EXECUTED' },
    }),
    1,
  );
}
try {
  // Real public submission: payment/reconciliation or operator ignore wins while provider is pending.
  for (const status of ['RESOLVED', 'IGNORED']) {
    const f = await fixture(),
      started = deferred(),
      release = deferred();
    const gateway = {
      mode: 'simulation',
      createPaymentLink: async (_order, amount, id) => {
        started.resolve();
        await release.promise;
        return {
          id: `plink_${id}`,
          amount,
          currency: 'INR',
          reference_id: id,
          short_url: 'https://example.invalid/late-link',
        };
      },
    };
    const actions = new ActionsService(prisma, new PolicyService(), gateway);
    const creation = actions.createAction(user.id, {
      exception_id: f.exception.id,
      action_type: 'CREATE_PAYMENT_LINK',
      parameters: { order_id: f.order.id, amount: 10000 },
    });
    const watchdog = new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Provider barrier not reached')),
        5000,
      );
      timer.unref();
    });
    try {
      await Promise.race([
        started.promise,
        creation.then(() => {
          throw new Error('Action completed before provider barrier');
        }),
        watchdog,
      ]);
      if (status === 'RESOLVED') {
        await prisma.$transaction(async (tx) => {
          await tx.payment.create({
            data: {
              merchantId,
              orderId: f.order.id,
              paymentId: `pay_${randomUUID()}`,
              amount: 10000n,
              status: 'CAPTURED',
              capturedAt: new Date(),
            },
          });
          await tx.order.update({
            where: { id: f.order.id },
            data: { status: 'PAID' },
          });
        });
        await recon.runReconciliation({ merchantId });
      } else
        await prisma.exception.update({
          where: { id: f.exception.id },
          data: terminalData(status),
        });
      const before = await parent(f.exception.id);
      assert.equal(before.status, status);
      const eventCount = await prisma.exceptionEvent.count({
        where: { exceptionId: f.exception.id },
      });
      release.resolve();
      const action = await creation;
      await assertCompletion(action, before);
      assert.equal(
        await prisma.exceptionEvent.count({
          where: { exceptionId: f.exception.id },
        }),
        eventCount,
      );
      assert.equal(
        action.executionResult.short_url,
        'https://example.invalid/late-link',
      );
      console.log(
        `PASS R8 late provider: ${status} and complete lifecycle metadata survive completion`,
      );
    } finally {
      release.resolve();
      await creation.catch(() => {});
    }
  }
  // Completion starts while the terminal-state writer still holds the parent row lock.
  for (const status of ['RESOLVED', 'IGNORED'])
    for (const type of ['MARK_REVIEWED', 'ESCALATE', 'CREATE_PAYMENT_LINK']) {
      const f = await fixture(),
        action = await claimed(f, type),
        written = deferred(),
        attempted = deferred();
      const beforeCommit = prisma.$transaction(async (tx) => {
        const before = await tx.exception.update({
          where: { id: f.exception.id },
          data: terminalData(status),
        });
        written.resolve();
        await attempted.promise;
        // Do not commit until PostgreSQL confirms the competing UPDATE is blocked.
        const deadline = Date.now() + 3000;
        let blocked = false;
        while (Date.now() < deadline) {
          const [activity] = await prisma.$queryRaw`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'
                AND query LIKE 'UPDATE %"exceptions"%'
            ) AS waiting
          `;
          if (activity.waiting) {
            blocked = true;
            break;
          }
          await delay(20);
        }
        assert.ok(
          blocked,
          'Competing parent UPDATE must wait for the terminal writer',
        );
        return before;
      });
      const proxy = new Proxy(prisma, {
        get(target, key) {
          if (key === '$transaction')
            return (cb) =>
              target.$transaction((tx) =>
                cb(
                  new Proxy(tx, {
                    get(t, k) {
                      if (k === 'exception')
                        return new Proxy(t.exception, {
                          get(delegate, method) {
                            if (method === 'updateMany')
                              return async (args) => {
                                attempted.resolve();
                                return delegate.updateMany(args);
                              };
                            return Reflect.get(delegate, method);
                          },
                        });
                      return Reflect.get(t, k);
                    },
                  }),
                ),
              );
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await written.promise;
      const finishing = new ActionsService(
        proxy,
        new PolicyService(),
        {},
      ).finish(action, result(action), user.id);
      try {
        const [before] = await Promise.all([beforeCommit, finishing]);
        await assertCompletion(action, before);
      } finally {
        attempted.resolve();
      }
      console.log(`PASS R8 competing writer: ${type} preserves ${status}`);
    }
  // Positive controls: current active parents still support the intended transitions.
  for (const status of ['OPEN', 'INVESTIGATING'])
    for (const type of ['MARK_REVIEWED', 'ESCALATE', 'CREATE_PAYMENT_LINK']) {
      const f = await fixture();
      await prisma.exception.update({
        where: { id: f.exception.id },
        data: { status, severity: 'LOW' },
      });
      const action = await claimed(f, type);
      await new ActionsService(prisma, new PolicyService(), {}).finish(
        action,
        result(action),
        user.id,
      );
      const after = await parent(f.exception.id);
      assert.equal(after.status, 'INVESTIGATING');
      if (type === 'ESCALATE') assert.equal(after.severity, 'CRITICAL');
      if (type === 'CREATE_PAYMENT_LINK')
        assert.match(after.resolutionNote, /Payment link created:/);
      assert.equal(
        await prisma.auditLog.count({
          where: {
            entityId: action.id,
            action: 'ACTION_PARENT_STATE_PRESERVED',
          },
        }),
        0,
      );
    }
  console.log(
    'PASS R8 positive controls: active parents still transition, escalate and retain link information',
  );
  // Required audit must remain atomic with action completion, including the skipped parent transition.
  {
    const f = await fixture(),
      action = await claimed(f, 'MARK_REVIEWED');
    const before = await prisma.exception.update({
      where: { id: f.exception.id },
      data: terminalData('IGNORED'),
    });
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (cb) =>
            target.$transaction((tx) =>
              cb(
                new Proxy(tx, {
                  get(t, k) {
                    if (k === 'auditLog')
                      return new Proxy(t.auditLog, {
                        get(delegate, method) {
                          if (method === 'create')
                            return async (args) => {
                              if (
                                args.data.action ===
                                'ACTION_PARENT_STATE_PRESERVED'
                              )
                                throw new Error(
                                  'Synthetic preserved-parent audit failure',
                                );
                              return delegate.create(args);
                            };
                          return Reflect.get(delegate, method);
                        },
                      });
                    return Reflect.get(t, k);
                  },
                }),
              ),
            );
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await assert.rejects(
      () =>
        new ActionsService(proxy, new PolicyService(), {}).finish(
          action,
          {},
          user.id,
        ),
      /Synthetic preserved-parent audit failure/,
    );
    assert.equal(
      (await prisma.action.findUniqueOrThrow({ where: { id: action.id } }))
        .status,
      'EXECUTING',
    );
    assert.deepEqual(
      parentFacts(await parent(f.exception.id)),
      parentFacts(before),
    );
    await new ActionsService(prisma, new PolicyService(), {}).finish(
      action,
      {},
      user.id,
    );
    await assertCompletion(action, before);
    console.log(
      'PASS R8 audit: persistence failure prevents false completion; retry preserves the parent',
    );
  }
} finally {
  await prisma.$disconnect();
}
