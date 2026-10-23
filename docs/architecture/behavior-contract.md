# Behavior contract

This contract defines shared implementation rules. Use the [API](../specifications/api.md) for wire formats, [schema](../specifications/database.md) for storage, [PRD](../product/prd.md#actions-and-approval-defaults) for approval policy, and [verification record](../operations/fix-verification.md) for tested cases.

## Configuration and data

- Ordinary restarts preserve records. Seeding requires ALLOW_DEMO_RESET=true and an exact DEMO_RESET_DATABASE match.
- Database E2E cleanup requires `NODE_ENV=test`, `TEST_ALLOW_DATABASE_RESET=true`, and an explicit loopback database named `ledgermind_test` or, for example, `ledgermind_test_review1`. A suffix must contain only letters and digits. Guards run before fixtures import.
- Application/Compose payment execution defaults to disabled when no mode is configured. The tracked root .env.example explicitly selects simulation for learning. Simulation results are tagged; provider_test requires test credentials and rejects live keys.
- AI is optional. Disabled/unavailable AI returns an explicit auditable fallback without disabling deterministic operations.
- Proxy trust defaults to false. Configuration validates DATABASE_URL before application/Prisma imports; Prisma receives that selected URL explicitly. Redis clients are constructed after configuration loads.

## Money and evidence

Amounts are integer paise: INR 1 equals 100 paise. Storage uses BigInt, which serializes as decimal strings. JSON proposal amounts and nested action parameters may remain safe integer numbers. Action amounts must be positive safe integer JSON numbers. Settlement components follow their own rules: gross/refund/fee/tax may be zero, and an adjustment may be signed, but a component cannot be entirely zero. Financial comparisons and actions support INR only. Timestamps serialize to ISO.

Presentation preserves integer paise exactly, including large strings and AI proposal cards. Counts, percentages, and severity scores have explicit units and are not treated as money by substring guesses.

A relationship identifies candidate evidence; state, currency, amount, and time still require validation. Known conflicting references cannot be overridden by an equal amount. Posted CREDIT supports settlement receipt; an explicitly linked posted DEBIT supports refund evidence. Unallocated movements remain reviewable.

Resolve globally unique strong bank links before weak candidates. Weak candidates must be unique in both directions. One movement cannot satisfy unrelated checks. Multiple eligible credits for one failed payment produce summed exposure and complete evidence.

## Webhooks

Verify HMAC-SHA256 over the original request bytes. Only a complete 64-digit hexadecimal signature reaches constant-time comparison. Malformed signatures are rejected safely; malformed event metadata is preserved as unknown diagnostic input. Verified unsupported shapes remain UNSUPPORTED and cannot ingest financial facts.

Use the delivery/event ID or a body-hash fallback for deduplication. Invalid signatures cannot reserve a valid identity. Duplicates preserve original work.

Persist verified PENDING events before queue submission. A dispatcher repairs missing submission and retryable/expired work. Workers use owned expiring claims and atomically ingest source data with event completion. New entities require trusted merchant mapping or an existing scoped relationship. Deferred order links can be repaired later.

Delayed authorization/failure cannot erase capture/refund evidence. Refund CREATED, PROCESSED, and FAILED events are supported. Automatic dispatch and atomic worker claims share the 20-attempt ceiling, including queued retries. Authorized manual retry resets eligible exhausted work. A reconciliation failure after successful ingestion is retained separately on the processed event.

## Reconciliation

Sum legitimate partial captures and preserve capture history after refunds. Only related PROCESSED refunds reduce confirmed duplicate exposure. Pending, unrelated, or insufficient refunds cannot clear the discrepancy. Evaluate overdue collectible CREATED/ATTEMPTED orders and captures against cancelled/failed orders.

SettlementAllocation explicitly assigns capture/refund/fee/tax/adjustment membership:

```text
net settlement = sum(gross - refund - fee - tax + signed adjustment)
```

Only PROCESSED settlements with valid allocations contribute coverage. Per-payment gross coverage must equal captured amount. Import rejects gross/refund over-allocation across other non-FAILED batches; failed batches do not hold that allocation capacity. Later refund-only components may have zero gross, with allocated refund backed by processed evidence. Equal amounts never invent membership.

| Missing evidence | Environment setting | Default deadline |
| --- | --- | --- |
| Order payment | ORDER_PAYMENT_SLA_HOURS | 1 hour |
| Capture settlement | PAYMENT_SETTLEMENT_SLA_HOURS | 168 hours |
| Settlement bank receipt | SETTLEMENT_BANK_SLA_HOURS | 72 hours |
| Pending refund completion | REFUND_SLA_HOURS | 24 hours |
| Processed refund bank evidence | REFUND_BANK_SLA_HOURS | 72 hours |

Matching tolerances are separate from overdue deadlines. Date windows select anchors and retain explicit related evidence outside the window. Only successful complete evaluations can resolve detector-owned discrepancies in the evaluated scope; missing/failed reads cannot cause closure.

Runs persist before work and coalesce overlapping merchant requests. Financial writes, matches, exception facts, and successful completion commit together. Rollback preserves a separate FAILED run. When a new run is requested or run history is listed, any IN_PROGRESS run older than five minutes is marked FAILED. This is an age check on those requests, not a background expiry timer or heartbeat-based failure detector.

Exceptions retain stable deduplication keys and unique display IDs. Reconciliation locks/re-reads the current row before deriving lifecycle fields. Facts refresh, clearance resolves, true recurrence reopens/increments, and unchanged observations do not increment recurrence. Operator IGNORED decisions survive. Severity is bounded to the database Int range independently of monetary exposure.

## Metrics and actions

Coverage is `100 * matchedPayments / capturedPayments` from one completed run, or zero for a zero denominator. The stats API rounds it to two decimal places. Overall coverage uses the latest completed full run; a date-filtered run cannot replace it. This is payment-to-settlement coverage. Captured volume is all time, and active exceptions are OPEN/INVESTIGATING. `resolved_today` starts at midnight in the backend process's local timezone; it is not a merchant-timezone calculation.

An authenticated FINANCE/ADMIN submits action proposals. Validate merchant, relationship, captured/collectible state, INR, amount, and remaining capacity at proposal and execution. Authorization precedes idempotent replay; replay precedes consumed-balance validation. Canonical exception/type/parameters define identity, and a reason change creates a distinct action without bypassing capacity.

Monetary actions below 100,000 paise auto-approve after operator submission. From 100,000 through 5,000,000, one distinct ADMIN approval is required; above that, two. Requesters cannot approve themselves; each approver votes once. FINANCE/ADMIN may reject pending actions. Local review/escalation requires submission without monetary approval.

Active/completed links are protected by order across exception changes, including legacy rows. ADMIN may refresh unknown/completed link evidence through a read-only provider lookup. Confirmed cancelled/expired links become FAILED with retained evidence and ACTION_PAYMENT_LINK_INACTIVE audit. A replacement is a distinct explicit proposal subject to current balance and concurrent uniqueness checks. Unknown/active links remain protective.

### Execution and recovery

Proposal/review/audit persistence is transactional. APPROVED is durable execution intent. Recovery locks/re-reads the current action; each owner has a claim token and lease.

Execution claim validates the locked current parent. Monetary submission again locks/rechecks ownership, unexpired lease, and parent eligibility before committing externalSubmittedAt. A RESOLVED/IGNORED parent before submission produces known FAILED nonexecution with audit and zero provider calls. Changes after submission preserve outcome-recovery rules.

Unsubmitted recoverable work may resume; submitted/uncertain work becomes OUTCOME_UNKNOWN and retains reservations. It is never blindly reissued. Disabled mode rejects new monetary intents before reservation, and existing unsubmitted approved work fails as known nonexecution.

Refund capacity subtracts CREATED, PROCESSING, and PROCESSED refund rows, plus active action reservations. Pending refund rows therefore hold capacity even though only processed refunds reduce confirmed reconciliation exposure. Refund writers lock the same payment before inserting/summing processed refunds and deriving payment state. Completed refund actions cease being a second reservation once persisted refund evidence replaces them. ADMIN provider lookup requires provider_test mode; it verifies an existing operation without submitting another one. It is unavailable in simulation/disabled mode. A signed matching refund webhook can confirm uncertain work atomically.

Provider acceptance alone never resolves an exception. Completion of MARK_REVIEWED, ESCALATE, or CREATE_PAYMENT_LINK updates only current OPEN/INVESTIGATING parents. Later RESOLVED/IGNORED decisions and metadata survive, with required ACTION_PARENT_STATE_PRESERVED audit in the completion transaction. Required audit failure prevents completion persistence.

## AI and UI

Tools are merchant scoped and advisory. Validate names against the request allow-list and arguments at runtime, including JSON parsing, safe paise, enums, and bounded limits. Investigation includes refund/evidence discovery and stored snapshots.

Saved/fresh analyses expose deterministic exposure, tool results, fallback, latency, model, and integer confidence. Successful structured output requires nonempty summary and likely_cause plus supplied integer confidence 0-100. Empty/incomplete/non-stop output, invalid JSON, and empty objects use explicit fallback in normal and forced-final paths. Analysis/audit commit together; every chat response also requires audit persistence.

Browser chat sends at most 40 recent nonempty user/assistant turns, each at most 8,000 characters, within a 90 KB encoded JSON budget. Superseded responses are cancelled/ignored; investigation timeout stops loading and permits retry. A browser timeout does not prove a provider request stopped.

Read errors remain distinct from empty successful results. Search precedes server pagination, clearing status selects all, and payment methods use canonical lowercase values. Successful manual/SWR reads update freshness; invalid login retains inline feedback. Missing AI configuration is displayed as unavailable rather than an invented tool count.
