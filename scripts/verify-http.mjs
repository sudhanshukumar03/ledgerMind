import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac } from 'node:crypto';
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
require('../backend/scripts/test-database-guard.cjs').assertTestDatabase();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
const merchant = await prisma.merchant.create({
  data: { name: 'HTTP verification', email: 'fixture@example.invalid' },
});
const email = `${randomUUID()}@example.invalid`,
  password = 'synthetic-test-password';
await prisma.user.create({
  data: {
    merchantId: merchant.id,
    name: 'Verifier',
    email,
    passwordHash: await bcrypt.hash(password, 4),
    role: 'FINANCE',
  },
});
// Load infrastructure settings from an owned .env after module import, rather
// than relying on pre-exported Redis values. The real 429 assertion proves the
// runtime-configured storage connects to the isolated nondefault Redis port.
const config = {
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: '3108',
  BIND_ADDRESS: '127.0.0.1',
  JWT_SECRET: 'isolated_native_http_verification_secret',
  AI_ENABLED: 'false',
  PAYMENT_EXECUTION_MODE: 'disabled',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '56383',
  REDIS_PASSWORD: '',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: 'synthetic-http-webhook-secret',
};
const tempPath = mkdtempSync(join(tmpdir(), 'ledgermind-http-'));
const envPath = join(tempPath, '.env');
writeFileSync(
  envPath,
  Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'),
);
const childEnv = { ...process.env };
// The database and disabled provider modes stay explicit in every test child.
// Only Redis settings are omitted to exercise env-file initialization order.
Object.assign(childEnv, config);
for (const key of ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'TRUST_PROXY'])
  delete childEnv[key];
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL('../backend/dist/main.js', import.meta.url))],
  {
    cwd: tempPath,
    env: childEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '';
child.stdout.on('data', (b) => (logs = (logs + b).slice(-16000)));
child.stderr.on('data', (b) => (logs = (logs + b).slice(-16000)));
const base = 'http://127.0.0.1:3108/api/v1';
async function request(path, method = 'GET', data, token, headers = {}) {
  return fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(5000),
  });
}
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null)
      throw new Error(`API failed to start: ${logs}`);
    try {
      if ((await request('/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(ready, true, logs);
  assert.equal((await request('/exceptions')).status, 401);
  const financialCounts = () =>
    prisma.$transaction([
      prisma.order.count({ where: { merchantId: merchant.id } }),
      prisma.payment.count({ where: { merchantId: merchant.id } }),
      prisma.refund.count({ where: { merchantId: merchant.id } }),
    ]);
  const beforeMalformed = await financialCounts();
  for (const event of [null, {}, [], 42, false]) {
    const body = { event, event_id: `invalid_metadata_${randomUUID()}` };
    const rejected = await request(
      '/webhooks/razorpay',
      'POST',
      body,
      undefined,
      { 'x-razorpay-signature': 'deadbeef' },
    );
    assert.equal(rejected.status, 200);
    assert.deepEqual(await rejected.json(), {
      status: 'rejected',
      reason: 'invalid_signature',
    });
    const diagnostic = await prisma.webhookEvent.findFirstOrThrow({
      where: { payload: { path: ['event_id'], equals: body.event_id } },
    });
    assert.equal(diagnostic.signatureVerified, false);
    assert.equal(diagnostic.eventType, 'unknown');
    assert.deepEqual(diagnostic.payload, body);
  }
  const nonAscii = await request(
    '/webhooks/razorpay',
    'POST',
    { event: 'payment.captured', event_id: `non_ascii_${randomUUID()}` },
    undefined,
    { 'x-razorpay-signature': '\u00e9'.repeat(64) },
  );
  assert.equal(nonAscii.status, 200);
  assert.deepEqual(await nonAscii.json(), {
    status: 'rejected',
    reason: 'invalid_signature',
  });
  // A verified but unsupported shape stays diagnostic; it cannot ingest finance facts.
  const malformed = {
    event: { invalid: true },
    event_id: `verified_metadata_${randomUUID()}`,
  };
  const signature = createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(malformed))
    .digest('hex');
  const accepted = await request(
    '/webhooks/razorpay',
    'POST',
    malformed,
    undefined,
    { 'x-razorpay-signature': signature },
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { status: 'accepted' });
  let diagnostic;
  for (let n = 0; n < 40; n++) {
    diagnostic = await prisma.webhookEvent.findUniqueOrThrow({
      where: { eventId: malformed.event_id },
    });
    if (diagnostic.processingStatus === 'UNSUPPORTED') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(diagnostic.processingStatus, 'UNSUPPORTED');
  assert.deepEqual(diagnostic.payload, malformed);
  assert.deepEqual(await financialCounts(), beforeMalformed);
  console.log(
    'PASS R9 native webhook boundary: malformed metadata/non-ASCII signatures rejected safely, diagnostics retained, verified unsupported input cannot create finance facts',
  );
  const login = await request('/auth/login', 'POST', { email, password });
  assert.equal(login.status, 201);
  const { access_token: token } = await login.json();
  assert.ok(token);
  assert.equal(
    (await request('/payments/not-a-uuid', 'GET', undefined, token)).status,
    400,
  );
  assert.equal(
    (await request('/audit?limit=1.5', 'GET', undefined, token)).status,
    400,
  );
  assert.equal(
    (await request('/transactions?type=unknown', 'GET', undefined, token))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        '/reconciliation/run',
        'POST',
        { dateFrom: '2026-10-22', dateTo: '2026-10-21' },
        token,
      )
    ).status,
    400,
  );
  const ai = await request(
    '/ai/chat',
    'POST',
    { messages: [{ role: 'user', content: 'Synthetic verification only' }] },
    token,
  );
  assert.equal(ai.status, 201);
  assert.equal((await ai.json()).isFallback, true);
  // Login already consumed one of five allowed attempts. Four failures remain;
  // a changing forwarding header must not bypass the default untrusted-proxy identity.
  for (let n = 0; n < 4; n++)
    assert.equal(
      (
        await request(
          '/auth/login',
          'POST',
          { email, password: 'wrong-password' },
          undefined,
          { 'X-Forwarded-For': `203.0.113.${n + 1}` },
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await request(
        '/auth/login',
        'POST',
        { email, password: 'wrong-password' },
        undefined,
        { 'X-Forwarded-For': '203.0.113.99' },
      )
    ).status,
    429,
  );
  console.log(
    'PASS native HTTP: startup, authentication, validation, audited optional AI, real Redis throttling, spoof-resistant default proxy identity',
  );
} finally {
  const stopped =
    child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await stopped;
  await prisma.$disconnect();
  unlinkSync(envPath);
  rmdirSync(tempPath);
}
