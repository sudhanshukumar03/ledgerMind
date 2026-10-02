import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

/**
 * Shape of a single throttler decision. Structurally identical to
 * `ThrottlerStorageRecord` (which the package does not re-export from its
 * barrel), so this class still satisfies `ThrottlerStorage`.
 *
 * `timeToExpire` / `timeToBlockExpire` are in SECONDS to match the built-in
 * in-memory storage the guard was written against.
 */
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Atomic fixed-window increment for one key. Runs entirely inside Redis so the
 * read-modify-write can never race across concurrent requests or app
 * instances. `ttl` / `blockDuration` arrive in milliseconds.
 *
 * KEYS[1] = hit counter, KEYS[2] = block marker.
 * Returns { totalHits, pttlMs, isBlocked(0|1), blockPttlMs }.
 */
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

-- Already blocked: do not count further hits while the block is active.
local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  local hitsPttl = redis.call('PTTL', hitsKey)
  if hitsPttl < 0 then hitsPttl = blockPttl end
  return { hits, hitsPttl, 1, blockPttl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end
local hitsPttl = redis.call('PTTL', hitsKey)
if hitsPttl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsPttl = ttl
end

local isBlocked = 0
local blockExpire = 0
if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  isBlocked = 1
  blockExpire = blockDuration
end

return { hits, hitsPttl, isBlocked, blockExpire }
`;

/**
 * Redis-backed storage for `@nestjs/throttler`. Replaces the default in-memory
 * store so rate-limit windows are shared across every app instance and survive
 * restarts — a prerequisite for the limits to mean anything under load.
 *
 * Built on the `ioredis` client already used by BullMQ (same REDIS_* env), so
 * this adds no new dependency. If Redis is unreachable it FAILS OPEN (allows
 * the request) and logs a warning: a rate limiter must never take the whole API
 * down when its backing store blips.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;

  /** `client` is injectable for tests; production passes nothing and a client
   * is built from the same REDIS_* env BullMQ uses. */
  constructor(client?: Redis) {
    this.redis =
      client ??
      new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        // Fail fast instead of queueing commands while disconnected, so the
        // fail-open path below triggers promptly during a Redis outage.
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
    this.redis.on('error', (err) => this.logger.warn(`Redis throttler storage error: ${err.message}`));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const block = blockDuration || ttl;
    const hitsKey = `throttle:${key}`;
    const blockKey = `throttle:${key}:blocked`;

    try {
      const [hits, hitsPttl, isBlocked, blockPttl] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        hitsKey,
        blockKey,
        ttl.toString(),
        limit.toString(),
        block.toString(),
      )) as [number, number, number, number];

      return {
        totalHits: hits,
        timeToExpire: Math.ceil(hitsPttl / 1000),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: Math.ceil(blockPttl / 1000),
      };
    } catch (err) {
      // Fail open: never let a Redis problem become an availability outage.
      this.logger.warn(`Throttler fail-open (Redis unavailable): ${(err as Error).message}`);
      return { totalHits: 0, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
