# LedgerMind — Backend

NestJS modular monolith serving `/api/v1`, plus BullMQ workers. Nine modules, one PostgreSQL system of record, and one architectural rule that overrides every other consideration:

> **The reconciliation engine is deterministic code. The AI has read-only tools and proposal tools. Nothing else may move money.**

> Root overview: [../README.md](../README.md) · Diagrams: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

---

## Modules

| Module | Responsibility |
| --- | --- |
| `auth/` | JWT issue and verify, RBAC guards (`ADMIN`, `FINANCE`, `VIEWER`), login throttle at 5/min |
| `webhook/` | HMAC SHA256 on the raw buffer, raw-event persistence, replay + stale-TTL rejection, idempotency, enqueue |
| `transaction/` | Orders, payments, refunds, settlements, bank transactions, and the unified `/transactions` view |
| `reconciliation/` | The matching ladder, exposure scoring, run lifecycle. **Pure deterministic code, no AI** |
| `exception/` | Classification, `dedup_key` upsert, severity, timeline (`exception_events`) |
| `ai/` | Gemini controller, 14 read-only merchant-scoped tools, analysis persistence with `prompt_version` and `tool_calls` |
| `policy/` | Evaluates every proposed action against limits, role, and exposure. Rules live in env config for the MVP |
| `action/` | `PROPOSED → PENDING_APPROVAL → APPROVED → EXECUTING → COMPLETED/FAILED`, plus provider execution |
| `audit/` | Correlated audit log for every state change, analysis, policy decision, and execution |

Module dependency direction and the AI trust boundary are drawn in [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §2 and §3.

---

## Commands

```bash
npm run start:dev          # API + workers, watch mode
npm run prisma:migrate     # prisma migrate dev
npm run prisma:reset       # prisma migrate reset — destructive, use before a rehearsal
npm run prisma:studio
npm run seed               # merchants, users, and records — never exceptions
npm run test               # Jest unit: matching ladder + state machines first
npm run test:e2e           # Supertest: auth, RBAC, tenancy isolation, IDOR
npx tsc --noEmit           # must stay clean
```

---

## Environment

Copy `.env.example` to `.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | API listen port — `3001`, leaving `3000` to the Next.js frontend |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string for BullMQ |
| `JWT_SECRET` | Access-token signing secret |
| `JWT_EXPIRES_IN` | Token lifetime |
| `GEMINI_API_KEY` | AI Controller model access |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC SHA256 verification secret |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Provider credentials — the provider is mocked behind an interface for the MVP |
| `POLICY_REFUND_MAX_PAISE` | Refund ceiling the Policy Engine enforces |
| `WEBHOOK_MAX_AGE_SECONDS` | Stale-event TTL |

---

## Invariants

Break one of these and the failure shows up as a wrong financial conclusion, not as an exception in the logs.

**Money is `BIGINT` paise. There are no floats in financial math, ever.** Not in matching, not in scoring, not in exposure. `0.1 + 0.2 !== 0.3`, and sub-paise drift becomes a false mismatch.

**BigInt does not survive `JSON.stringify`.** `main.ts` patches `BigInt.prototype.toJSON` so money serializes as a string. Every monetary field crosses the wire as a JSON string — that is the contract, not an accident.

**Webhook HMAC is verified against the unparsed body.** Bootstrap with `rawBody: true` and verify the buffer. Verifying a re-serialized object will pass in development and fail against real payloads.

**Idempotency is enforced by the database, not by application memory.** `webhook_events.event_id`, `actions.idempotency_key`, and `exceptions.dedup_key` are unique constraints. Delivery is at-least-once, so duplicates are the normal case.

**Concurrent webhooks update with `updateMany`, not `update`.** Two events touching the same payment row will otherwise race.

**`merchantId` always comes from the JWT.** Never from a body, a query, or a param — including inside AI tool execution. Cross-tenant IDOR was closed in every service and every tool; keep it closed.

**Use `prisma migrate dev` / `migrate reset`, never `db push`.** `db push` silently diverges the migration history from the schema.

**The seed must never create exceptions.** Reconciliation produces them live. A seeded exception on stage proves nothing.

**Refund amounts are re-validated against live state immediately before the provider call**, not only at proposal time. State can change between approval and execution.

**Severity thresholds compare rupees, not paise.** A ₹100 threshold evaluated against a paise value fires on every row. This bug has been fixed once already.

---

## The prompt-injection canary

The seed writes an instruction-shaped string into a bank-transaction `description`. The AI Controller must treat every field it reads as **data**, never as instruction. If an investigation ever returns a conclusion that echoes the canary, the tool layer is passing untrusted text into the prompt without framing — fix the tool layer, not the prompt.

---

## Conventions

Backend code is **ES modules**, so relative imports need explicit `.js` extensions:

```ts
import { ReconciliationService } from "./reconciliation.service.js";  // ✓
import { ReconciliationService } from "./reconciliation.service";     // ✗ fails at runtime
```

This rule is backend-only; the frontend uses standard Next.js resolution.

**Treat the API as frozen.** The frontend is built against the contract in [../docs/07-API-SPECIFICATION.md](../docs/07-API-SPECIFICATION.md); backend changes should be minimal, reviewed, and never made to accommodate a client convenience.
