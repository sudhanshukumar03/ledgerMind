import { validateEnvironment } from './env.validation.js';
import { createRequire } from 'node:module';
const { assertTestDatabase } = createRequire(import.meta.url)(
  '../../scripts/test-database-guard.cjs',
);

describe('startup and test database boundaries', () => {
  const base = {
    JWT_SECRET: 'x'.repeat(32),
    DATABASE_URL: 'postgresql://audit@127.0.0.1/ledgermind_test_config',
  };
  it('validates configuration before providers receive it', () => {
    expect(
      validateEnvironment({ ...base, REDIS_PORT: '6380' }).REDIS_PORT,
    ).toBe(6380);
    expect(() =>
      validateEnvironment({ ...base, REDIS_PORT: 'not-a-port' }),
    ).toThrow('REDIS_PORT');
    expect(() =>
      validateEnvironment({ ...base, PAYMENT_EXECUTION_MODE: 'live' }),
    ).toThrow();
    expect(() =>
      validateEnvironment({ ...base, PAYMENT_EXECUTION_MODE: 'provider_test' }),
    ).toThrow();
  });
  it('requires an explicit database before importing application clients', () => {
    expect(() => validateEnvironment({ JWT_SECRET: 'x'.repeat(32) })).toThrow(
      'DATABASE_URL',
    );
    expect(validateEnvironment(base).TRUST_PROXY).toBe('false');
    expect(validateEnvironment(base).AI_ENABLED).toBe('false');
  });
  it('refuses cleanup of ordinary or remote databases before app imports', () => {
    const env = {
      NODE_ENV: 'test',
      TEST_ALLOW_DATABASE_RESET: 'true',
      DATABASE_URL: 'postgresql://audit@localhost/ledgermind',
    };
    expect(() => assertTestDatabase(env)).toThrow('refused');
    expect(() =>
      assertTestDatabase({
        ...env,
        DATABASE_URL: 'postgresql://audit@remote/ledgermind_test',
      }),
    ).toThrow();
    expect(
      assertTestDatabase({
        ...env,
        DATABASE_URL:
          'postgresql://audit@127.0.0.1:55483/ledgermind_test_audit',
      }),
    ).toBe('ledgermind_test_audit');
    expect(() =>
      assertTestDatabase({
        ...env,
        DATABASE_URL: 'postgresql://audit@localhost/ledgermind_test',
        TEST_ALLOW_DATABASE_RESET: 'false',
      }),
    ).toThrow();
  });
});
