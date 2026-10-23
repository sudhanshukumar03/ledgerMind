// Explicit live connectivity checks. Only synthetic text and authenticated reads.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'backend/package.json'));
const args = process.argv.slice(2);
const env = parseEnv(
  readFileSync(
    resolve(root, args.includes('--compose') ? '.env' : 'backend/.env'),
    'utf8',
  ),
);
const providers = args.filter((arg) => arg !== '--compose');
if (providers.some((p) => !['groq', 'razorpay'].includes(p)))
  throw new Error('Choose groq and/or razorpay, optionally --compose');
const selected = providers.length ? providers : ['groq', 'razorpay'];
// Razorpay's SDK has no public timeout option; this read-only probe must still end.
const deadline = setTimeout(() => {
  console.log(
    JSON.stringify({
      check: 'provider probe deadline',
      ok: false,
      reason: 'TIMEOUT',
    }),
  );
  process.exit(1);
}, 90000);
deadline.unref();
let failed = false;
function report(provider, check, ok, details = {}) {
  console.log(JSON.stringify({ provider, check, ok, ...details }));
  if (!ok) failed = true;
}
if (selected.includes('groq')) {
  try {
    if (!env.GROQ_API_KEY) throw new Error('MISSING_KEY');
    const { default: OpenAI } = require('openai');
    const client = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: env.GROQ_API_KEY,
      timeout: 20000,
      maxRetries: 0,
    });
    const model = env.AI_MODEL || 'llama-3.3-70b-versatile';
    // Reasoning models spend completion tokens before producing visible text.
    const reasoning = /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {};
    const models = await client.models.list();
    if (!models.data.some((candidate) => candidate.id === model))
      throw new Error('CONFIGURED_MODEL_UNAVAILABLE');
    report('Groq', 'authenticated model lookup', true);
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content:
            'This is a synthetic LedgerMind connectivity check. Reply with exactly OK.',
        },
      ],
      max_completion_tokens: 512,
      ...reasoning,
      temperature: 0,
    });
    report(
      'Groq',
      'synthetic completion',
      !!completion.choices[0]?.message.content,
      { tokens: completion.usage?.total_tokens },
    );
    const tool = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content:
            'Call get_probe_status. This is a synthetic capability check.',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_probe_status',
            description: 'Read a synthetic connectivity status',
            parameters: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'get_probe_status' } },
      max_completion_tokens: 512,
      ...reasoning,
      temperature: 0,
    });
    report(
      'Groq',
      'function-call capability',
      tool.choices[0]?.message.tool_calls?.some(
        (call) =>
          call.type === 'function' && call.function.name === 'get_probe_status',
      ) === true,
      { tokens: tool.usage?.total_tokens },
    );
  } catch (error) {
    report('Groq', 'connectivity', false, {
      status: error.status ?? null,
      reason:
        error.status === 401
          ? 'INVALID_OR_REVOKED_KEY'
          : ['MISSING_KEY', 'CONFIGURED_MODEL_UNAVAILABLE'].includes(
                error.message,
              )
            ? error.message
            : 'PROVIDER_REQUEST_FAILED',
    });
  }
}
if (selected.includes('razorpay')) {
  try {
    if (
      !env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') ||
      !env.RAZORPAY_KEY_SECRET
    )
      throw new Error('TEST_KEYS_REQUIRED');
    const Razorpay = require('razorpay');
    const client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
    const result = await client.payments.all({ count: 1 });
    report(
      'Razorpay',
      'test-mode authenticated payment read',
      result.entity === 'collection',
      { countReturned: result.count },
    );
    const refunds = await client.refunds.all({ count: 1 });
    report(
      'Razorpay',
      'test-mode authenticated refund read',
      refunds.entity === 'collection',
      { countReturned: refunds.count },
    );
  } catch (error) {
    report('Razorpay', 'connectivity', false, {
      status: error.statusCode ?? null,
      reason:
        error.message === 'TEST_KEYS_REQUIRED'
          ? error.message
          : 'PROVIDER_REQUEST_FAILED',
    });
  }
}
clearTimeout(deadline);
process.exitCode = failed ? 1 : 0;
