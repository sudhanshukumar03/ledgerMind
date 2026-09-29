/** Minimal shape the tracker needs; accepts an Express req and the guard's `Record<string, any>`. */
type TrackableRequest = { ip?: string; socket?: { remoteAddress?: string } };

/**
 * Named-throttler limits for LedgerMind. There is a single global throttler
 * (`default`) that every route inherits; individual routes tighten it with the
 * `@Throttle({ default: { ... } })` decorator (see auth/ai/webhook controllers).
 *
 * ttl values are milliseconds.
 */
export const THROTTLE = {
  /** Baseline per-tracker ceiling for every route (keyed per route+IP). */
  GLOBAL_TTL: 60_000,
  GLOBAL_LIMIT: 100,

  /**
   * Route-agnostic hard ceiling per IP across the WHOLE API. Without this the
   * per-route limit lets one IP spread traffic over N endpoints (N × 100/min);
   * this caps the aggregate so a single source can't flood by fan-out.
   * Generous enough for a real user's dashboard (many parallel calls on load),
   * tight enough to blunt an L7 flood. Tune via env if fronted by shared NAT.
   */
  IP_GLOBAL: { limit: Number(process.env.THROTTLE_IP_GLOBAL || 300), ttl: 60_000 },

  /** Auth login — credential-stuffing / brute-force guard. */
  LOGIN: { limit: 5, ttl: 60_000 },

  /**
   * Groq-backed AI chat — each call spends money and CPU, so this is the
   * economic-denial (EDoS) guard. Deliberately tight.
   */
  AI_CHAT: { limit: 20, ttl: 60_000 },

  /**
   * Razorpay webhook ingestion. Legitimate traffic is bursty but bounded;
   * this caps a forged-webhook flood (each request otherwise costs an HMAC
   * check + a DB write) without dropping normal delivery.
   */
  WEBHOOK: { limit: 120, ttl: 60_000 },
} as const;

/**
 * Rate-limit tracker key. The ThrottlerGuard runs before auth (cheapest
 * possible rejection), so `req.user` is not yet populated — we track by client
 * IP. `req.ip` already honours `trust proxy` (configured in main.ts), so behind
 * a known proxy this is the real client address from `X-Forwarded-For`; the
 * socket address is a fallback when no proxy is trusted.
 */
export function throttlerTracker(req: TrackableRequest): string {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Key generator for the route-agnostic `ip-global` throttler: one bucket per
 * client, regardless of which route is hit — the opposite of the built-in
 * per-route key. This is what turns the aggregate per-IP ceiling into a real
 * cap across the whole API.
 */
export function ipGlobalKey(_context: unknown, tracker: string, throttlerName: string): string {
  return `${throttlerName}:${tracker}`;
}

