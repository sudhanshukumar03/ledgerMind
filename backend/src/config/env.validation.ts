import { createRequire } from 'node:module';
const { assertTestDatabase } = createRequire(import.meta.url)(
  '../../scripts/test-database-guard.cjs',
);

export function validateEnvironment(env: Record<string, unknown>) {
  const result = { ...env };
  if (!env.DATABASE_URL)
    throw new Error('DATABASE_URL must be explicitly configured');
  try {
    if (
      !['postgresql:', 'postgres:'].includes(
        new URL(String(env.DATABASE_URL)).protocol,
      )
    )
      throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (env.NODE_ENV === 'test') assertTestDatabase(env);
  result.TRUST_PROXY = env.TRUST_PROXY ?? 'false';
  result.AI_ENABLED = env.AI_ENABLED ?? 'false';
  result.REDIS_HOST = env.REDIS_HOST ?? 'localhost';
  result.REDIS_PASSWORD = env.REDIS_PASSWORD ?? '';
  result.JWT_EXPIRES_IN = env.JWT_EXPIRES_IN ?? '24h';
  for (const key of ['GROQ_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'])
    result[key] = env[key] ?? '';
  if (env.NODE_ENV === 'production' && !env.FRONTEND_URL)
    throw new Error('FRONTEND_URL must be set in production');
  for (const [key, fallback, minimum, maximum] of [
    ['PORT', 3001, 1, 65535],
    ['REDIS_PORT', 6379, 1, 65535],
    ['THROTTLE_IP_GLOBAL', 300, 1, 100000],
  ] as const) {
    const value =
      env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(`Invalid ${key}`);
    result[key] = value;
  }
  const mode = env.PAYMENT_EXECUTION_MODE || 'disabled';
  if (!['disabled', 'simulation', 'provider_test'].includes(String(mode)))
    throw new Error('Invalid PAYMENT_EXECUTION_MODE');
  result.PAYMENT_EXECUTION_MODE = mode;
  if (
    mode === 'provider_test' &&
    (!String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ||
      !env.RAZORPAY_KEY_SECRET)
  ) {
    throw new Error('provider_test requires Razorpay test credentials');
  }
  if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  return result;
}
