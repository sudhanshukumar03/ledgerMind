# Quality Assurance & Testing Strategy

## 1. Overview

LedgerMind applies multi-layered testing across deterministic algorithms, state transitions, security boundaries, and AI tool orchestration. Because the system handles financial transactions and exceptions, correctness invariants are strictly enforced before any code can merge.

---

## 2. Active Test Inventory

The backend test suite runs under Jest with Node.js ESM modules (`npm run test:backend`).

| Test Suite | File Location | Tests | What It Verifies |
| :--- | :--- | :---: | :--- |
| **Reconciliation Engine** | `src/modules/reconciliation/reconciliation.service.spec.ts` | 13 | 3-way matching ladder (ID, UTR, amount, window), discrepancy detection, and exposure calculation |
| **Action Engine** | `src/modules/actions/actions.service.spec.ts` | 11 | Action creation, BigInt paise validation, positive integer regex, and simulation fallbacks |
| **Policy Engine** | `src/modules/actions/policy.service.spec.ts` | 8 | Approval limits (<₹1,000 auto, ₹1,000–₹50,000 single, >₹50,000 dual) and role enforcement |
| **Authentication & RBAC** | `src/modules/auth/auth.service.spec.ts` | 8 | Password hashing with bcrypt, JWT claims generation, and role checks |
| **AI Investigation** | `src/modules/ai/ai.service.spec.ts` | 8 | Tool execution scoping, prompt versioning, structured Zod parsing, and error fallbacks |
| **Throttler Storage** | `src/common/throttler/redis-throttler-storage.spec.ts` | 5 | Redis rate-limiting, counter increments, and fail-open resilience when Redis is offline |
| **Health Controller** | `src/modules/health/health.controller.spec.ts` | 5 | Liveness (`/health`) and readiness (`/health/ready`) probe endpoints |
| **Total** | **7 Test Suites** | **58** | **100% Passing** |

---

## 3. Integration & Security E2E Suites

E2E tests require active backing services (PostgreSQL and Redis) and execute via Supertest:

```bash
npm run test:e2e -w backend
```

- **`test/webhooks.e2e-spec.ts`**:
  - HMAC SHA256 signature verification and bad signature rejection (401).
  - Stale timestamp TTL window rejection (replay attack defense).
  - Webhook deduplication via unique event ID constraints.
  - Event payload normalization and BullMQ queuing.
- **`test/security.e2e-spec.ts`**:
  - Multi-tenant query isolation (ensures Merchant A cannot inspect Merchant B's exceptions).
  - RBAC endpoint guards (`VIEWER` cannot propose or approve actions).
  - Unauthenticated access rejection across all protected endpoints.

---

## 4. Test Execution Commands

```bash
# Run unit test suite across backend
npm run test:backend

# Run TypeScript type check & linting on backend
npm run lint:backend

# Run TypeScript type check & linting on frontend
npm run lint:frontend

# Validate Docker Compose configuration
docker compose config -q
```

---

## 5. Critical Invariants Under Test

1. **Deterministic Arithmetic**: Monetary math uses 64-bit integer paise. Floating-point arithmetic on currency is strictly prohibited.
2. **Read-Only AI Boundaries**: The AI Controller only accesses read-only tool services; financial state mutations require explicit operator approval through the Action Engine.
3. **Idempotency & Deduplication**: Database unique constraints (`dedup_key`, `idempotency_key`, `event_id`) prevent duplicate exceptions, duplicate webhook processing, and double-execution of refunds.
4. **Fail-Open Throttling**: If Redis experiences an outage, rate limiters fail open to prevent blocking legitimate financial operations.