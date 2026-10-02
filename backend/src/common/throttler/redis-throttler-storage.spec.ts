import { jest } from '@jest/globals';
import { RedisThrottlerStorage } from './redis-throttler-storage.js';
import { throttlerTracker, THROTTLE } from './throttler.config.js';

// A minimal fake ioredis client — only `eval` (the atomic increment) and `on`
// (error listener) are exercised. Injecting it keeps the tests off a real
// socket.
function fakeRedis(evalImpl: (...args: any[]) => any) {
  return {
    on: jest.fn(),
    eval: jest.fn(evalImpl as any),
    quit: jest.fn(async () => 'OK'),
    disconnect: jest.fn(),
  } as any;
}

describe('throttlerTracker', () => {
  it('keys on the (proxy-resolved) client IP', () => {
    expect(throttlerTracker({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });

  it('falls back to the socket address, then to "unknown"', () => {
    expect(throttlerTracker({ socket: { remoteAddress: '10.0.0.1' } })).toBe('ip:10.0.0.1');
    expect(throttlerTracker({})).toBe('ip:unknown');
  });
});

describe('THROTTLE limits', () => {
  it('keeps the sensitive endpoints tighter than the global ceiling', () => {
    expect(THROTTLE.LOGIN.limit).toBeLessThan(THROTTLE.GLOBAL_LIMIT);
    expect(THROTTLE.AI_CHAT.limit).toBeLessThan(THROTTLE.GLOBAL_LIMIT);
  });
});

describe('RedisThrottlerStorage', () => {
  it('maps the Lua reply to a ThrottlerStorageRecord (ms → seconds)', async () => {
    // hits=3, hitsPttl=45000ms, isBlocked=0, blockPttl=0
    const storage = new RedisThrottlerStorage(fakeRedis(() => [3, 45000, 0, 0]));
    const rec = await storage.increment('key', 60000, 100, 60000, 'default');
    expect(rec).toEqual({ totalHits: 3, timeToExpire: 45, isBlocked: false, timeToBlockExpire: 0 });
  });

  it('reports a block when the limit is exceeded', async () => {
    const storage = new RedisThrottlerStorage(fakeRedis(() => [101, 30000, 1, 60000]));
    const rec = await storage.increment('key', 60000, 100, 60000, 'default');
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(60);
  });

  it('FAILS OPEN when Redis is unavailable (availability > enforcement)', async () => {
    const storage = new RedisThrottlerStorage(
      fakeRedis(() => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const rec = await storage.increment('key', 60000, 100, 60000, 'default');
    expect(rec.isBlocked).toBe(false);
    expect(rec.totalHits).toBe(0);
    expect(rec.timeToExpire).toBe(60);
  });
});
