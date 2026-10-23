// Opt-in sandbox write: guarded test DB, Razorpay test keys, one INR 1 link.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'backend/package.json'));
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
assert.equal(
  process.env.PROVIDER_TEST_ALLOW_LINK,
  'true',
  'Set PROVIDER_TEST_ALLOW_LINK=true for this sandbox write',
);
const env = parseEnv(readFileSync(resolve(root, 'backend/.env'), 'utf8'));
assert.ok(
  env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') && env.RAZORPAY_KEY_SECRET,
  'Razorpay test credentials required',
);
process.env.RAZORPAY_KEY_ID = env.RAZORPAY_KEY_ID;
process.env.RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET;
process.env.PAYMENT_EXECUTION_MODE = 'provider_test';
process.env.AI_ENABLED = 'false';
const { PrismaClient } = require('@prisma/client');
const { RazorpayClient } =
  await import('../backend/dist/integrations/razorpay/razorpay.client.js');
const { ActionsService } =
  await import('../backend/dist/modules/actions/actions.service.js');
const { PolicyService } =
  await import('../backend/dist/modules/actions/policy.service.js');
const prisma = new PrismaClient();
const gateway = new RazorpayClient();
const actions = new ActionsService(prisma, new PolicyService(), gateway);
const run = randomUUID();
const record = { run, amount: 100, currency: 'INR', mode: 'provider_test' };
const records = resolve(root, '.runtime', 'provider-probes');
mkdirSync(records, { recursive: true });
const save = () =>
  writeFileSync(
    resolve(records, `${run}.json`),
    JSON.stringify(record, null, 2),
  );
save();
const createLink = gateway.createPaymentLink.bind(gateway);
gateway.createPaymentLink = async (...args) => {
  record.referenceId = args[2];
  save(); // Retain operation identity before an external request, including uncertain outcomes.
  const result = await createLink(...args);
  record.providerId = result.id;
  save();
  return result;
};
const deadline = setTimeout(() => {
  console.log(
    JSON.stringify({
      ok: false,
      reason: 'TIMEOUT',
      cleanupRequired: !!record.referenceId,
      run,
    }),
  );
  process.exit(1);
}, 90000);
deadline.unref();
async function provider(path, method = 'GET') {
  const response = await fetch(
    `https://api.razorpay.com/v1/payment_links${path}`,
    {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  return response.json();
}
try {
  const owner = await prisma.merchant.create({
    data: { name: 'Synthetic provider probe', email: `${run}@example.invalid` },
  });
  const actor = await prisma.user.create({
    data: {
      merchantId: owner.id,
      name: 'Synthetic FINANCE',
      email: `${run}@example.invalid`,
      passwordHash: 'unusable',
      role: 'FINANCE',
    },
  });
  const order = await prisma.order.create({
    data: {
      merchantId: owner.id,
      orderId: `probe_${run}`,
      amount: 100n,
      status: 'CREATED',
    },
  });
  const exception = await prisma.exception.create({
    data: {
      merchantId: owner.id,
      exceptionId: `PROBE-${run}`,
      dedupKey: `probe:${run}`,
      type: 'PAYMENT_MISSING',
      severity: 'LOW',
      primaryEntityType: 'ORDER',
      primaryEntityId: order.id,
    },
  });
  const action = await actions.createAction(actor.id, {
    exception_id: exception.id,
    action_type: 'CREATE_PAYMENT_LINK',
    parameters: { order_id: order.id, amount: 100 },
  });
  assert.equal(action.status, 'COMPLETED');
  assert.equal(action.executionResult.id, record.providerId);
  const link = await provider(`/${encodeURIComponent(record.providerId)}`);
  assert.equal(link.reference_id, action.id);
  assert.equal(link.amount, 100);
  assert.equal(link.currency, 'INR');
  assert.equal(link.status, 'created');
  assert.equal(link.notes.order_id, order.orderId);
  const audit = await prisma.auditLog.findMany({
    where: { entityId: action.id },
  });
  assert.ok(audit.some((entry) => entry.action === 'ACTION_PROPOSED'));
  assert.ok(audit.some((entry) => entry.action === 'ACTION_EXECUTED'));
  record.verified = true;
  save();
  console.log(
    JSON.stringify({
      check:
        'real test-mode Action Engine link creation, provider fetch and audit',
      ok: true,
      amountPaise: 100,
    }),
  );
} catch (error) {
  process.exitCode = 1;
  console.log(
    JSON.stringify({
      check: 'provider action',
      ok: false,
      status: error.statusCode ?? null,
      reason:
        error.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'PROBE_FAILED',
      run,
    }),
  );
} finally {
  try {
    if (record.referenceId) {
      let links;
      if (record.providerId)
        links = [await provider(`/${encodeURIComponent(record.providerId)}`)];
      else
        links = (
          await provider(
            `?reference_id=${encodeURIComponent(record.referenceId)}&count=100`,
          )
        ).items;
      assert.ok(
        Array.isArray(links) && links.length > 0,
        'Uncertain outcome requires manual inspection using the saved reference',
      );
      for (const link of links) {
        assert.equal(link.reference_id, record.referenceId);
        assert.equal(link.notes.operation_id, record.referenceId);
        assert.equal(link.amount, 100);
        if (link.status !== 'cancelled')
          await provider(`/${encodeURIComponent(link.id)}/cancel`, 'POST');
        assert.equal(
          (await provider(`/${encodeURIComponent(link.id)}`)).status,
          'cancelled',
        );
      }
      record.cancelled = true;
      save();
      console.log(
        JSON.stringify({
          check: 'task-owned test link cancelled and fetched',
          ok: true,
        }),
      );
    }
  } catch {
    process.exitCode = 1;
    console.log(
      JSON.stringify({
        check: 'provider cleanup',
        ok: false,
        reason: 'INSPECT_SAVED_REFERENCE',
        run,
      }),
    );
  }
  clearTimeout(deadline);
  await prisma.$disconnect();
}
