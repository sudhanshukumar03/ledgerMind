# Architecture guide

LedgerMind is a NestJS modular monolith with a Next.js console, PostgreSQL as the system of record, and Redis/BullMQ for queued work. AI provides optional advice; deterministic services retain financial authority.

For example, a failed gateway payment with a linked bank credit should become an exception for investigation. An AI explanation can help an operator understand it, but only the backend can validate and execute a submitted action. That separation guides the components below.

Read the [behavior contract](behavior-contract.md) for shared rules and [diagrams](diagrams.md) for the corresponding flows. The [API](../specifications/api.md) and [schema](../specifications/database.md) describe current interfaces and storage.

## Components

| Component | Responsibility |
| --- | --- |
| Next.js console | Scoped queries, investigation, proposal submission, review, recovery feedback, and audit views. |
| Auth and guards | JWT authentication, role checks, and authenticated merchant/actor context. |
| InfrastructureModule | Validated runtime Redis configuration and managed connection shutdown. |
| WebhooksService | Signature-aware persistence, duplicate preservation, dispatch intent, and retry management. |
| WebhookProcessor | Owned expiring claims, trusted entity ingestion, and monotonic source updates. |
| ReconciliationService | Merchant-coordinated evidence evaluation, matches, exceptions, and run snapshots. |
| PolicyService / ActionsService | Approval requirements, related-target validation, reservations, execution ownership, and outcome recovery. |
| AiService | Scoped evidence tools, validated advisory output, and transactional analysis/audit persistence. |
| Prisma/PostgreSQL | Financial ledgers, allocations, approvals, durable work states, evidence, and audit records. |

## Boundaries

AI tools do not call the Action Engine. FINANCE/ADMIN explicitly submits a proposal; backend policy and domain services determine eligibility and approval requirements.

A local database transaction cannot roll back an external provider request. The Action Engine therefore records ownership and submission state, preserves unknown outcomes, and verifies existing operations instead of blindly resubmitting them.

Financial writers coordinate through merchant and payment locks. Refund capacity includes CREATED/PROCESSING/PROCESSED refund rows and active/uncertain action reservations. Completion replaces an action reservation with persisted refund evidence rather than counting both. For a 10,000-paise capture with a 2,000-paise processing refund and 3,000 paise reserved by another action, at most 5,000 paise remains available.

Webhook, reconciliation, and ai-investigation queues are registered. Some HTTP reconciliation/investigation work runs synchronously. Queue registration does not imply automatic investigation in every path.

## Data and frontend

Internal UUIDs and provider references are separate identifiers. SettlementAllocation describes explicit batch membership; ActionApproval records distinct votes. Polymorphic match/timeline/audit references need service validation because they are not foreign keys to every possible entity table.

The browser defaults to /api. Next.js rewrites to the server-only API_UPSTREAM_URL, whose default is http://localhost:3001/api/v1. Public browser configuration is embedded at build time. The frontend uses custom React/Tailwind components, CSS variable tokens, SWR, and manual requests where appropriate.

The audit page is /audit; registration is informational. See the [product scope](../product/prd.md#scope-and-status) for features outside the current implementation.

## Deterministic reconciliation

### Run lifecycle and scope

A short transaction serializes merchant run starts, reuses an existing IN_PROGRESS run, or creates a durable new run. Financial evaluation then takes a merchant advisory lock shared with ingestion/allocation writers. Completion commits with its financial writes; rollback leaves a separately persisted FAILED run. Starting a run or listing run history marks IN_PROGRESS rows older than five minutes as FAILED. There is no background run-expiry timer or heartbeat.

Date bounds select anchors using createdAt for orders/payments/refunds, settlementDate for settlements, and transactionDate for bank movements. Explicit relationships then expand that selection. Complete merchant evidence is evaluated before filtering affected matches/exceptions to the resulting scope. A scoped run cannot resolve unrelated discrepancies.

### Detector rules

| Comparison | Implemented evidence rule |
| --- | --- |
| Order/capture | Sum valid captures across splits, retain refunded capture history, and evaluate overdue collectible orders. |
| Duplicate capture | Compare captured total less related PROCESSED refunds with the order amount. |
| Payment/settlement | Require explicit valid allocations in PROCESSED batches, exact gross coverage, and validated net components. |
| Settlement/bank | Require eligible posted credit, compatible references/currency, and an unconsumed unique match. |
| Refund | Evaluate failed/overdue pending refunds and missing explicitly linked posted debits after the relevant deadline. |
| Failed payment/bank | Use explicitly linked posted credits and sum all eligible credit evidence. |
| Unallocated bank | Retain unexplained or ambiguous posted movements as review exceptions. |

Strong globally unique references are resolved before weak candidates. Weak matches must be unique in both directions and cannot override a known conflict. Equal amounts alone never establish settlement membership or an unrelated payment link.

### Persistence

Stable deduplication keys retain detector identity; display IDs use UUID entropy. Facts and evidence refresh on observation. A locked current exception row supplies lifecycle fields, preserving newer operator decisions. Cleared evaluated discrepancies resolve; renewed discrepancies reopen and increment recurrence; unchanged repeated observations do not. IGNORED stays ignored.

Severity is bounded independently of BigInt money. Run capturedPayments, matchedPayments, and capturedVolume preserve the same evaluated snapshot. Overall coverage uses the latest completed full run.

## Financial and processing states

| Entity | State behavior |
| --- | --- |
| Order | A failed attempt does not erase PAID/REFUNDED evidence; multiple valid captures can satisfy one order. |
| Payment | Direct capture is supported. Delayed authorization/failure cannot regress captured/refunded states; processed refunds derive partial/full refund state while retaining capturedAt. |
| Refund | Direct PROCESSED evidence is supported; a delayed failure cannot erase it. Failed refunds do not consume confirmed refunded capacity. |
| Settlement/bank | Only valid PROCESSED allocations and eligible POSTED bank movements satisfy the corresponding comparisons. |
| Webhook | Persisted PENDING intent moves through owned PROCESSING to PROCESSED, FAILED, or UNSUPPORTED; stale/invalid deliveries remain diagnostics. |
| Action | PENDING_APPROVAL/APPROVED work moves through EXECUTING to COMPLETED, known FAILED, or OUTCOME_UNKNOWN. |
| Exception | OPEN/INVESTIGATING reflect active work; financial clearance resolves; operator IGNORED decisions survive reconciliation and late completion. |

Unsubmitted interrupted actions may return to APPROVED. Submitted interrupted actions become OUTCOME_UNKNOWN and retain protection. Confirmed cancelled/expired payment links are recorded as inactive FAILED actions with retained provider evidence, allowing a separately validated replacement.

## Design concepts and learning exercises

| Concept | Why it matters here |
| --- | --- |
| Integer units | Exact paise avoids float rounding; counts and severity have different units. |
| Relationship before amount | Identity establishes which records may be compared, then state/currency/amount/time establish validity. |
| Durable intent | Persisted work survives queue submission gaps and process restarts. |
| Lease plus claim token | Expiry allows recovery; fencing prevents a stale owner from submitting or overwriting a replacement. |
| Transactional audit | A required audit failure rolls back the local decision rather than creating a false success. |
| Shared capacity | Locks serialize all refund writers for one payment, not merely one action. |
| Outcome uncertainty | External acceptance and local persistence can fail independently; verification is safer than resubmission. |
| Complete evidence | Scope, batches, deadlines, and unused bank movements prevent misleading local matches. |
| Request ownership | A response belongs to the entity/request that initiated it; stale responses cannot replace current UI state. |
| Measured evidence | A passing mock, schema field, or diagram establishes only what that check actually exercises. |

A lease is a time-limited claim to work. Its claim token identifies the current owner, so a worker that resumes late cannot act as a replacement owner. A reservation sets aside refundable capacity while an action is pending. Idempotent replay returns an existing action for the same canonical request instead of creating another one.

Use [testing](../operations/testing.md) to explore these properties and [TODO.md](../../TODO.md) for optional next exercises.
