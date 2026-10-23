# Historical code audit - 21 October 2026

This document preserves the pre-fix findings used to learn and plan repairs. **It is not the current open-bug list.** Current closure and test evidence are in the [verification record](fix-verification.md); optional remaining work is in [TODO.md](../../TODO.md).

## Scope and correction

The audit covered backend services, financial actions, reconciliation, webhook processing, AI/tool boundaries, API validation, frontend behavior, schema, fixtures, configuration, Docker, and test quality. Evidence included source review, controlled in-memory reproductions, isolated PostgreSQL cases, and browser observations with synthetic API responses. Provider calls were stubbed and the normal learning database was not used for audit mutations.

There were 58 tracked findings: 38 original findings, eight valid follow-up findings, and twelve expanded-review findings. Historical priorities were 26 P1 and 32 P2. Stable IDs run from 01 to 59 because **44 was withdrawn**: a default search incorrectly omitted the existing audit route. Git, filesystem, and browser checks confirmed that the page existed; no route repair was needed.

Descriptions and line references below refer to the dated pre-fix snapshot. Words such as "current" inside retained discovery details describe that snapshot. The repairs and later R/Q cases are documented separately; source files have changed since discovery.

## Complete historical inventory

| ID | Priority | Finding |
| --- | --- | --- |
| 01 | P1 | Container restart destructively reseeds business/audit data. |
| 02 | P1 | Missing credentials select successful simulated financial operations. |
| 03 | P1 | Duplicate delivery can suppress the original webhook work. |
| 04 | P1 | Failed/stalled webhook work cannot be reclaimed correctly. |
| 05 | P1 | Event persistence and queue submission have an unrecoverable gap. |
| 06 | P1 | Webhooks do not create unknown financial entities. |
| 07 | P1 | Delayed events regress financial states; refund lifecycle handlers are incomplete. |
| 08 | P1 | Exception IDs collide across runs/merchants; concurrent deduplication races. |
| 09 | P1 | Exception facts, resolution, and reopening are not maintained correctly. |
| 10 | P1 | Settlement matching incorrectly assumes one payment per settlement. |
| 11 | P1 | Bank matching accepts ineligible evidence and reuses unrelated credits. |
| 12 | P1 | Missing-settlement/bank exceptions are raised before evidence is overdue. |
| 13 | P1 | Order/payment eligibility misses unpaid orders and refunded capture history. |
| 14 | P1 | Valid split captures become duplicates and can create negative exposure. |
| 15 | P1 | Date-scoped runs discard related evidence outside the selected window. |
| 16 | P1 | Unrelated/tiny pending refunds prematurely resolve exceptions. |
| 17 | P1 | External success can become a local FAILED action without recovery. |
| 18 | P1 | Concurrent refund actions exceed shared payment capacity. |
| 19 | P1 | Intended approval thresholds, distinct approvers, and maker/checker rules are absent. |
| 20 | P1 | Permissive proxy trust permits caller-controlled rate-limit identity. |
| 21 | P2 | Cross-currency amounts can be compared as equivalent. |
| 22 | P2 | Refund-evidence and unexplained/duplicate bank detection are incomplete. |
| 23 | P2 | Validation of IDs, amounts, pagination, enums, and date ranges is inconsistent. |
| 24 | P2 | Generic transaction serialization destroys Date values. |
| 25 | P2 | Frontend pages calculate incompatible reconciliation percentages. |
| 26 | P2 | Investigation timeout can leave the UI permanently loading. |
| 27 | P2 | Entity switching permits stale analysis/details to overwrite current evidence. |
| 28 | P2 | Duplicate-refund drawer does not provide the required payment target. |
| 29 | P2 | Exception search covers one page; clearing status restores OPEN. |
| 30 | P2 | Payment-method filter casing differs from stored methods. |
| 31 | P2 | Unbounded chat history/input eventually exceeds backend limits. |
| 32 | P2 | Malformed tool argument JSON escapes controlled error handling. |
| 33 | P2 | Investigation tools/evidence/responses omit required facts and trails. |
| 34 | P2 | Redis options can be captured before environment configuration loads. |
| 35 | P2 | Runs lack observable progress/durable failure and coordinated execution. |
| 36 | P2 | E2E cleanup lacks enforced database isolation. |
| 37 | P2 | Required AI auditing/fallback attribution is incomplete or unreliable. |
| 38 | P2 | Fractional AI confidence passes validation but fails Int persistence. |
| 39 | P1 | Audit failures strand approved actions before execution/recovery. |
| 40 | P1 | Uncaptured/failed payments pass refund eligibility checks. |
| 41 | P1 | Simulated provider IDs collide and distinct refund records collapse. |
| 42 | P1 | Payment links ignore order eligibility and outstanding collection balance. |
| 43 | P2 | Amount loses precision when exact paise strings pass through Number. |
| 45 | P2 | Dashboard displays successful completion after a failed run request. |
| 46 | P2 | FINANCE cannot reach its permitted rejection control. |
| 47 | P2 | Bad login credentials force navigation that resets feedback. |
| 48 | P1 | Failed/unprocessed settlements can satisfy payment settlement coverage. |
| 49 | P1 | Amount/date fallback accepts explicitly conflicting bank references. |
| 50 | P2 | BankDataGenerator supplies invalid internal UUIDs and fails in PostgreSQL. |
| 51 | P2 | Standalone lockfiles/install settings disagree with manifests and Docker setup. |
| 52 | P2 | Failed financial/audit reads are presented as successful empty collections. |
| 53 | P2 | Generic evidence formatting turns record counts into currency. |
| 54 | P2 | Hex alpha suffixes appended to CSS variable tokens produce invalid colors. |
| 55 | P2 | Browser action test can pass without finding a row or attempting the action. |
| 56 | P2 | Dashboard labels current counts/volume as all-time or reconciled/auto-resolved facts. |
| 57 | P2 | Default frontend API proxy omits the backend's /v1 prefix. |
| 58 | P2 | Valid large amounts overflow the severity Int column and roll back reconciliation. |
| 59 | P2 | Healthy manual-fetch pages can permanently show Reconnecting. |

## Original 38-finding audit

The initial pass reported 20 P1 and 18 P2 findings. The following details preserve the observed trigger, missing rule, and original repair direction.

### 01. Backend container restart deletes persistent business and audit data

**Source-confirmed.** [docker-compose.yml:66](../../docker-compose.yml), [docker-entrypoint.sh:22](../../backend/docker-entrypoint.sh), [seed.ts:58](../../backend/prisma/seed.ts).

The production-mode backend service hardcodes `SEED_DATABASE: "true"`. Every container start runs a seed that unconditionally deletes audit logs, actions, exceptions, payments, orders, merchants, and other tables. Persistent PostgreSQL volumes do not protect these records from the seed. Seed errors are also swallowed after deletion may have begun.

**Fix:** make destructive demo initialization an explicit, separate command/profile; default it off; reject destructive seeding against a production database.

### 02. Missing gateway credentials produce successful simulated financial actions

**Reproduced.** [razorpay.client.ts:36](../../backend/src/integrations/razorpay/razorpay.client.ts), [actions.service.ts:520](../../backend/src/modules/actions/actions.service.ts).

With both Razorpay credentials absent, `createRefund('pay_live_example', 1000)` returns a simulated refund with `status: 'processed'`. The caller persists a refund and can resolve the exception despite no money moving. Simulation is selected by missing credentials or ID patterns, with no production-mode prohibition. Payment links have the same fallback.

**Fix:** require an explicit simulation setting, prohibit it for production execution, and fail closed when credentials are missing.

### 03. Duplicate webhook delivery can discard the original queued event

**Reproduced.** [webhooks.service.ts:53](../../backend/src/modules/webhooks/webhooks.service.ts), [webhook.processor.ts:38](../../backend/src/workers/webhook.processor.ts).

A valid duplicate arriving while the original row is `PENDING` changes that row to `IGNORED_DUPLICATE`. The original queued job subsequently skips it because the worker accepts only `PENDING`. Reproduction: zero worker claims after the duplicate, with the original row left `IGNORED_DUPLICATE`.

**Fix:** deduplicate delivery attempts without changing the original event's processing state; retain its queued work.

### 04. Webhook retries and stalled-job recovery cannot reclaim failed work

**Reproduced for FAILED; source-confirmed for PROCESSING.** [webhook.processor.ts:38](../../backend/src/workers/webhook.processor.ts), [webhook.processor.ts:93](../../backend/src/workers/webhook.processor.ts).

The first transient processing failure writes `FAILED` and throws so BullMQ can retry. On retry, the worker immediately skips that same `FAILED` row and returns success. A worker crash after claiming the row similarly strands it in `PROCESSING`, which a replacement job also skips. Reproduction: handler attempted once across two job executions.

**Fix:** implement retryable failure states and a claim/lease mechanism that safely reclaims stalled processing without running financial work twice.

### 05. Persisting a webhook and enqueueing it are not recoverable as one delivery

**Source-confirmed.** [webhooks.controller.ts:47](../../backend/src/modules/webhooks/webhooks.controller.ts), [webhooks.controller.ts:85](../../backend/src/modules/webhooks/webhooks.controller.ts).

The database insert happens before the queue add. A Redis failure or process crash between them leaves a stored event with no job. A provider retry is then considered a duplicate and is not enqueued. There is no pending-event dispatcher/outbox or recovery sweep.

**Fix:** persist an outbox record with the event, dispatch it durably, and make queue submission itself idempotent.

### 06. Webhooks cannot ingest new financial entities

**Reproduced.** [webhook.processor.ts:116](../../backend/src/workers/webhook.processor.ts), [webhook.processor.ts:159](../../backend/src/workers/webhook.processor.ts).

All handlers use `updateMany`; none creates an unknown payment, order, refund, or settlement. An event for an unseen payment updates zero rows and is still marked `PROCESSED` with no merchant. The repository has synthetic seed/generator writers, but no production ingestion path that fills this gap. Out-of-order payment/order delivery cannot be repaired by these handlers.

**Fix:** normalize payloads into validated upserts, resolve merchant ownership from trusted account context, and reconcile deferred relationships when their parent arrives.

### 07. Webhook state updates regress terminal states and omit refund failure handling

**Reproduced for state regression; source-confirmed for missing handlers.** [webhook.processor.ts:116](../../backend/src/workers/webhook.processor.ts), [webhook.processor.ts:147](../../backend/src/workers/webhook.processor.ts).

Handlers overwrite status without checking the current state or event chronology. A delayed `payment.authorized` changes `CAPTURED` back to `AUTHORIZED`; a delayed failure can also overwrite a capture. There are no `refund.created`/`refund.failed` handlers, and processed refunds do not update the parent payment's refunded state. Failed refunds can remain counted as reserved/processing indefinitely.

**Fix:** define valid state transitions, retain source event time, and implement the full supported refund/payment lifecycle with aggregate refund totals.

### 08. Human-readable exception IDs collide across runs and merchants

**Reproduced.** [reconciliation.service.ts:196](../../backend/src/modules/reconciliation/reconciliation.service.ts), [schema.prisma:383](../../backend/prisma/schema.prisma).

Each run restarts its counter at one and uses only a second-resolution timestamp. Two runs producing their first new exception in the same second generate the same globally unique `exceptionId`. Reproduction with fixed time: both merchants generated `EXC-20261021120000-001`. PostgreSQL's unique constraint will reject one transaction. Concurrent runs can also race on the find-then-create `dedupKey` path.

**Fix:** use a database sequence or sufficiently unique identifier, and handle concurrent deduplication atomically.

### 09. Reconciliation does not maintain the exception lifecycle or refresh monetary facts

**Reproduced.** [reconciliation.service.ts:183](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.md](../architecture/overview.md#persistence).

Existing rows only receive severity, timestamps, and occurrence updates. A corrected `PAYMENT_MISSING` stays `OPEN`; a resolved mismatch that recurs stays `RESOLVED`. Changing the expected amount from 1,000 to 2,000 paise leaves stored exposure and expected amount at 1,000. No pass resolves exceptions that disappeared from the current full evidence set.

**Fix:** refresh financial fields and evidence; reopen genuinely recurring discrepancies; resolve cleared ones within a well-defined run scope; audit those transitions.

### 10. Payment-to-settlement matching assumes one settlement per payment

**Reproduced; contradicts the batch settlement scenario described in README.** [reconciliation.service.ts:380](../../backend/src/modules/reconciliation/reconciliation.service.ts).

Matching requires one settlement's amount to equal one payment and then removes that settlement from availability. A 1,000-paise batch containing 400- and 600-paise payments produces two `SETTLEMENT_MISSING` exceptions. Fees and refunds/net adjustments are not represented in the calculation.

**Fix:** model settlement membership and adjustments, reconcile batch totals, and distinguish individual payment inclusion from batch-to-bank matching.

### 11. Bank matching accepts ineligible evidence and can reuse unrelated credits

**Reproduced for failed debit acceptance; source-confirmed for credit reuse.** [reconciliation.service.ts:426](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.service.ts:534](../../backend/src/modules/reconciliation/reconciliation.service.ts).

A `DEBIT` with status `FAILED` and matching UTR is accepted as a bank settlement with score 100. Neither UTR nor fallback matching requires a posted credit. The failed-payment checker matches any equal-amount unlinked credit without a time/reference constraint or a consumed-candidate set; one old credit can support multiple false exceptions. Settlement matches also do not populate the bank row's `settlementId`, so its link is not reliable evidence of availability.

**Fix:** require eligible financial states/direction, use event-date/reference constraints, and share authoritative candidate consumption across checks.

### 12. Newly captured payments are immediately classified as overdue settlements

**Reproduced.** [reconciliation.service.ts:380](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.md](../architecture/overview.md#detector-rules).

The seven-day constant only filters candidate matches. It does not defer missing-settlement exceptions until that window expires. A payment captured now with no settlement immediately produces `SETTLEMENT_MISSING`; unmatched settlements likewise become bank exceptions without checking whether bank clearing is due.

**Fix:** separate matching tolerance from settlement/clearing due dates and flag missing evidence only after the applicable SLA.

### 13. Order/payment state selection misses unpaid orders and mislabels refunded captures

**Reproduced.** [reconciliation.service.ts:298](../../backend/src/modules/reconciliation/reconciliation.service.ts).

Only orders already marked `PAID` are checked, so overdue `CREATED`/`ATTEMPTED` orders with no successful payment are invisible. Only payments currently marked `CAPTURED` count as successful, so a paid order with a `REFUNDED` or `PARTIALLY_REFUNDED` payment is treated as having no payment at all. Reproductions produced no exception for the unpaid order and a false `PAYMENT_MISSING` for a refunded capture.

**Fix:** define order eligibility and due dates explicitly, preserve capture history, and reconcile refunds separately from original payment existence.

### 14. Multiple captures are always duplicates and can create negative exposure

**Reproduced.** [reconciliation.service.ts:319](../../backend/src/modules/reconciliation/reconciliation.service.ts).

Two captures of 300 and 400 paise for a 1,000-paise order are labeled `DUPLICATE_PAYMENT` with financial impact `-300`. Two legitimate partial captures totaling the order amount are also labeled duplicates. Payment count is used without checking aggregate successful value or capture identity.

**Fix:** distinguish split/partial payments, duplicate captures, underpayment, and overpayment; derive nonnegative exposure from the actual discrepancy.

### 15. Date-scoped reconciliation removes related evidence outside the selected window

**Reproduced.** [reconciliation.service.ts:100](../../backend/src/modules/reconciliation/reconciliation.service.ts).

The same `createdAt` window independently filters orders, payments, refunds, settlements, and bank rows. An order on day one with a valid payment on day two becomes `PAYMENT_MISSING` when day one is selected. Settlement and bank dates also have their own business date fields, which are ignored by this query filter.

**Fix:** select the run's anchor entities by business date, then load their related evidence across the appropriate settlement/refund tolerances.

### 16. An unrelated or tiny pending refund can resolve an exception

**Reproduced.** [actions.service.ts:485](../../backend/src/modules/actions/actions.service.ts), [actions.service.ts:422](../../backend/src/modules/actions/actions.service.ts).

The selected payment must belong to the merchant, but need not belong to the exception's order/payment. After the provider accepts a refund, the parent exception is unconditionally marked `RESOLVED`, regardless of amount or provider status. Reproduction: a one-paise refund on another order, returned as pending, resolved the selected order's exception.

**Fix:** validate the action target against the exception evidence and resolve only when subsequent deterministic reconciliation confirms the discrepancy is cleared.

### 17. External money movement can succeed while the local action is recorded as failed

**Reproduced.** [actions.service.ts:520](../../backend/src/modules/actions/actions.service.ts), [actions.service.ts:398](../../backend/src/modules/actions/actions.service.ts), [razorpay.client.ts:53](../../backend/src/integrations/razorpay/razorpay.client.ts).

The gateway call precedes refund persistence and the completion transaction. A database failure after gateway success falls through to `ActionStatus.FAILED`, even though money has moved. There is no durable submitted/unknown-outcome state, provider operation reference reserved before submission, or gateway idempotency/recovery flow. Changing request parameters or reason creates a new action key, allowing a new attempt against an unresolved external outcome.

**Fix:** persist durable execution intent, use provider-supported idempotency/reference recovery, and reconcile uncertain outcomes before permitting another money movement.

### 18. Concurrent actions bypass the remaining-refundable-balance check

**Reproduced.** [actions.service.ts:502](../../backend/src/modules/actions/actions.service.ts).

Two distinct actions can read the same refund sum before either inserts its refund. With a 1,000-paise payment, two concurrent 600-paise refunds both passed the application check and called the mocked gateway, totaling 1,200. Action-level state claims protect one action, not the shared payment. The live provider may enforce its own cap; the application still lacks the promised invariant.

**Fix:** reserve refundable balance atomically per payment and account for in-flight or uncertain provider executions.

### 19. Documented approval levels and maker/checker separation are not implemented

**Documented gap; source-confirmed.** [policy.service.ts:6](../../backend/src/modules/actions/policy.service.ts), [actions.service.ts:250](../../backend/src/modules/actions/actions.service.ts), [prd.md](../product/prd.md#actions-and-approval-defaults), [schema.prisma:486](../../backend/prisma/schema.prisma).

The PRD requires two approvers above INR 50,000. Policy returns only a Boolean and the schema stores only one approver; one ADMIN approval executes any amount. The requesting ADMIN can approve their own request. The default auto-approval threshold is 1,000 **paise** (INR 10), whereas the PRD says INR 1,000, and equality is auto-approved despite the documented strict lower bound.

**Fix:** agree on the authoritative limits and units, represent approval levels and distinct approvers, enforce maker/checker rules, and execute only after all required approvals.

### 20. Default production proxy trust lets callers choose their rate-limit identity

**Reproduced with the Express request IP resolver.** [main.ts:24](../../backend/src/main.ts), [throttler.config.ts:49](../../backend/src/common/throttler/throttler.config.ts).

With no `TRUST_PROXY`, production defaults to Boolean `true`, which trusts the full forwarded chain. A supplied `X-Forwarded-For: 203.0.113.99` becomes the rate-limit IP. The comment describes a bounded hop count, but the code trusts all hops. This is exploitable when the app is reachable directly, as exposed by the Compose port, or when the ingress preserves a caller-controlled chain.

**Fix:** trust only the actual proxy hops/subnets and ensure ingress rewrites or strips untrusted forwarding headers.

### 21. Cross-currency amounts are treated as equivalent

**Reproduced.** [reconciliation.service.ts:302](../../backend/src/modules/reconciliation/reconciliation.service.ts).

A 1,000-minor-unit INR order and a 1,000-minor-unit USD payment match with no exception. The schema supports currency, but order matching and refund validation do not enforce it; payment links always use INR in the integration.

**Fix:** validate a supported single-currency invariant or carry currency through all matching and action checks; never compare minor units across currencies directly.

### 22. Refund-evidence reconciliation and unmatched-bank detection are incomplete

**Documented gap; source-confirmed.** [reconciliation.service.ts:114](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.service.ts:496](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.md](../architecture/overview.md#detector-rules).

Refund checking only detects old `PROCESSING` rows. There is no rule that emits `REFUND_MISMATCH`, verifies refund totals against payments, or checks bank debit evidence. Unmatched bank credits/debits and duplicate bank credits have no general exception pass after settlement matching. The synthetic generator includes such scenarios, but generating them is not detection logic.

**Fix:** implement refund amount/state/evidence invariants and a final pass for unexplained or duplicate bank movements.

### 23. Validation protections are inconsistent across API paths

**Source-confirmed.** [query-exceptions.dto.ts:28](../../backend/src/modules/exceptions/dto/query-exceptions.dto.ts), [audit.controller.ts:12](../../backend/src/modules/audit/audit.controller.ts), [transactions.service.ts:17](../../backend/src/modules/transactions/transactions.service.ts), [actions.service.ts:95](../../backend/src/modules/actions/actions.service.ts).

The new bounded pagination helper is not used by exceptions, audit, or generic transaction queries. Exceptions have no maximum page size; audit accepts arbitrarily large or negative `take`; generic transaction pages can overflow their computed offset. Generic `status` and action-list status are not enum-validated, and UUID-backed path/body IDs are usually only strings, turning invalid client inputs into Prisma errors/500s. Refund amounts accept digit strings and unsafe JavaScript integers without the safe-integer validation now used by payment links. Date ranges do not reject `from > to`.

**Fix:** share validated pagination/range/UUID DTOs across all endpoints and validate action-specific parameters, amount types, and enum filters at the service boundary.

### 24. Generic transaction serialization destroys timestamps

**Reproduced.** [transactions.service.ts:160](../../backend/src/modules/transactions/transactions.service.ts).

`serializeBigInt` recursively treats every object as a plain record. A JavaScript `Date` has no enumerable fields, so `createdAt` and nested dates become `{}`. Reproduction: `/transactions` service output had `createdAt: {}`.

**Fix:** preserve Date instances or serialize them to ISO strings before the generic object branch.

### 25. Frontend pages calculate incompatible reconciliation percentages

**Source-confirmed.** [dashboard page:89](../../frontend/app/(dashboard)/page.tsx), [reconciliation page:19](../../frontend/app/(dashboard)/reconciliation/page.tsx), [reconciliation.service.ts:626](../../backend/src/modules/reconciliation/reconciliation.service.ts).

The dashboard ignores backend `reconciliation_rate` and divides match pairs by all entity records. The reconciliation page divides match pairs by match pairs plus exceptions. The backend measures payment-to-settlement coverage from the latest full run. One fully matched order/payment/settlement/bank chain produces three pairs for four entities: the dashboard can display 75% while the other views display 100%.

**Fix:** define and return explicit, consistently scoped metrics; display them directly instead of inventing client-side denominators.

### 26. AI investigation timeout leaves the UI permanently loading

**Reproduced using the actual transpiled hook.** [useAiInvestigation.ts:33](../../frontend/hooks/useAiInvestigation.ts), [api-client.ts:113](../../frontend/lib/api-client.ts).

The AbortController signal is never passed to Axios. After 15 seconds, only the local signal becomes aborted; the network request continues. When it eventually succeeds, both `setData` and `setLoading(false)` are skipped. Reproduction ended with `loading: true`, `error: null`, and no analysis. Error paths also do not reliably clear the timeout.

**Fix:** pass the signal to transport, clean timers in `finally`, and finish the current request's loading/error state on timeout or cancellation.

### 27. Switching exceptions or drawer rows can show stale evidence

**Source-confirmed.** [useAiInvestigation.ts:8](../../frontend/hooks/useAiInvestigation.ts), [ExceptionDrawer.tsx:71](../../frontend/components/exceptions/ExceptionDrawer.tsx), [TransactionDrawer.tsx:61](../../frontend/components/transactions/TransactionDrawer.tsx).

The investigation hook initializes analysis once and does not reset/abort when `exceptionId` changes. `AiChatThread` does not call its reset function. Drawer fetch effects also lack an abort or request-identity check, so request A can finish after switching to B and replace B's details with A's. The exception drawer retains its prior `exc` while the next request loads.

**Fix:** scope data and requests to entity identity, reset on identity changes, and ignore results from superseded requests.

### 28. The duplicate-payment drawer's refund button cannot supply a valid payment target

**Source-confirmed.** [ExceptionDrawer.tsx:83](../../frontend/components/exceptions/ExceptionDrawer.tsx), [ExceptionDrawer.tsx:219](../../frontend/components/exceptions/ExceptionDrawer.tsx), [actions.service.ts:74](../../backend/src/modules/actions/actions.service.ts).

The button sends exception ID, amount, and reason, with no `payment_id`. Duplicate-payment exceptions are anchored to an `ORDER`. `createAction` infers a payment only for `PAYMENT` exceptions, so this normal UI action fails with the missing-payment error. The execution handler's later order fallback is unreachable through successful proposal validation and would arbitrarily select the first payment.

**Fix:** show the relevant captures and explicitly select the duplicate payment and refundable amount before proposing the refund.

### 29. Exception search covers one page, and clearing status restores OPEN

**Source-confirmed.** [exceptions page:25](../../frontend/app/(dashboard)/exceptions/page.tsx), [exceptions page:38](../../frontend/app/(dashboard)/exceptions/page.tsx), [exceptions page:62](../../frontend/app/(dashboard)/exceptions/page.tsx).

Search is a client-side filter on the currently fetched 20 rows; it is not sent to the API or included in the SWR fetch key. A valid exception on another page appears absent. Clearing/toggling off a status deletes the URL parameter, but the reader defaults a missing parameter back to `OPEN`, preventing the intended unfiltered status state.

**Fix:** implement server-side search with pagination/counts and distinguish the default filter from an explicit all-statuses selection.

### 30. Payment method filters use incompatible casing

**Source-confirmed against included seed data.** [transactions page:17](../../frontend/app/(dashboard)/transactions/page.tsx), [payments.service.ts:23](../../backend/src/modules/payments/payments.service.ts), [seed.ts:113](../../backend/prisma/seed.ts).

The UI sends `UPI`, `CARD`, and `NETBANKING`; seeded records use `upi`, `card`, and `netbanking`. The backend performs a case-sensitive exact equality, so selecting a populated method produces an empty table.

**Fix:** normalize methods on ingestion and filtering, or map display labels to canonical lowercase values.

### 31. AI chat stops accepting messages after the history limit is reached

**Source-confirmed.** [ai-controller page:248](../../frontend/app/(dashboard)/ai-controller/page.tsx), [ai.service.ts:507](../../backend/src/modules/ai/ai.service.ts).

The client sends the full, continually growing message list, including its greeting. The backend rejects histories over 40 messages; no client pruning or summarization exists. At approximately the 21st user turn, normal chat becomes a persistent 400 until cleared. The catch message incorrectly blames backend/API-key availability. An over-8,000-character user message is similarly allowed by the input and rejected later.

**Fix:** enforce request limits in the UI, bound or summarize history, and show validation errors accurately.

### 32. Malformed model tool arguments escape error handling

**Reproduced with a stubbed model response.** [ai.service.ts:600](../../backend/src/modules/ai/ai.service.ts).

`JSON.parse(tc.function.arguments)` runs outside the tool execution try/catch. A malformed argument string throws `SyntaxError` and aborts the entire chat/investigation instead of producing a tool error or safe fallback. The tool-name restriction is also only sent to the model, rather than enforced against returned calls before dispatch.

**Fix:** parse and validate arguments inside the controlled error boundary, enforce the per-request tool allow-list, and return recoverable tool errors.

### 33. Investigation evidence is unavailable or omitted from the response

**Source-confirmed.** [ai.service.ts:399](../../backend/src/modules/ai/ai.service.ts), [ai.service.ts:443](../../backend/src/modules/ai/ai.service.ts), [AiChatThread.tsx:76](../../frontend/components/ai/AiChatThread.tsx).

The investigation allow-list excludes `get_refund`, despite refund-based exceptions. Its `get_exception` tool returns event metadata without snapshots, and the initial prompt does not include the fetched snapshots, leaving some refund evidence inaccessible. Tool calls are saved to the database but not returned as `toolCalls` in the fresh investigation response, so the frontend's evidence tool list is empty until a later reload. Exception detail loads `aiAnalyses` without ordering, while components take element zero as the current analysis.

**Fix:** expose the read-only tools/evidence required by each exception type, return the recorded tool trail, and order saved analyses by newest first.

### 34. Redis configuration can be captured before .env is loaded

**Source-confirmed for .env-only startup.** [app.module.ts:30](../../backend/src/app.module.ts), [webhooks.module.ts:10](../../backend/src/modules/webhooks/webhooks.module.ts), [workers.module.ts:15](../../backend/src/workers/workers.module.ts).

Redis connections/options are created at module evaluation time. Child-module imports execute before the root `ConfigModule.forRoot`, and the root throttler instance is also constructed before that call. With Redis settings supplied only through `.env`, these objects capture default host/port/password instead. Docker-exported environment variables avoid this particular path.

**Fix:** construct Redis/Bull/throttler providers through asynchronous configuration factories after validated configuration is loaded.

### 35. Reconciliation run state is neither observable nor durably failed

**Source-confirmed; documented gap.** [reconciliation.service.ts:122](../../backend/src/modules/reconciliation/reconciliation.service.ts), [reconciliation.controller.ts:20](../../backend/src/modules/reconciliation/reconciliation.controller.ts), [webhook.processor.ts:66](../../backend/src/workers/webhook.processor.ts).

The run's creation and completion share one transaction. `IN_PROGRESS` is not visible externally before completion; on failure, creation rolls back, and there is no persisted `FAILED` row. The controller executes the full reconciliation synchronously even though a reconciliation worker exists, and every processed webhook triggers another full-merchant run. Nested linear candidate scans and per-record transaction writes increase contention, timeout risk, and repeated work as data grows. Frontend polling for in-progress/failed runs cannot work as described.

**Fix:** create a durable run before processing, enqueue bounded work, update run status in success/failure handlers, and serialize/coalesce merchant runs with indexed candidate lookup.

### 36. E2E test setup can erase whichever database DATABASE_URL points to

**Source-confirmed; not executed.** [security.e2e-spec.ts:49](../../backend/test/security.e2e-spec.ts), [webhooks.e2e-spec.ts:44](../../backend/test/webhooks.e2e-spec.ts).

The suites import the normal application/configuration and execute unscoped `deleteMany` cleanup. There is no hard check for a dedicated test database or isolated schema. Running the documented test command with a developer's normal `.env` can clear real local business data, and the webhook suite now clears the entire webhook audit table.

**Fix:** require an isolated disposable database/schema with an explicit test-environment guard before application initialization or cleanup; scope test-owned fixture cleanup.

### 37. The AI audit requirement is not reliably enforced

**Source-confirmed; documented gap against AGENTS.md.** [ai.service.ts:466](../../backend/src/modules/ai/ai.service.ts), [ai.service.ts:693](../../backend/src/modules/ai/ai.service.ts).

Ordinary chat decisions with no structured proposal are not logged. `writeAiAudit` swallows persistence failures and still returns successful advice/proposals, so the required record can be absent. Investigation analysis and audit inserts are not one atomic or durably retried unit. Provider-unavailable investigations are saved with normal analysis defaults rather than marking the schema's `isFallback` field.

**Fix:** define the audit event for every AI decision, persist it atomically or via a durable outbox/retry path, and explicitly tag fallback analyses.

### 38. AI confidence validation permits values the database rejects

**Source-confirmed from schema mismatch.** [ai.service.ts:8](../../backend/src/modules/ai/ai.service.ts), [ai.service.ts:415](../../backend/src/modules/ai/ai.service.ts), [schema.prisma:454](../../backend/prisma/schema.prisma).

The output schema accepts any number from 0 through 100, but Prisma stores `confidence` as `Int`. A valid model response such as `confidence: 82.5` passes Zod and then fails the database insert. Parsing fallback logic does not protect this persistence failure.

**Fix:** require an integer confidence or explicitly normalize validated confidence to an integer before saving, with a regression test for fractional output.

## Follow-up findings

Eight additional findings remained after withdrawing 44. The correction itself is retained below for audit transparency.

### 39. Audit failure can strand an approved action before execution

**Reproduced.** [Creation audit](../../backend/src/modules/actions/actions.service.ts), [replay return](../../backend/src/modules/actions/actions.service.ts), [approval audit](../../backend/src/modules/actions/actions.service.ts).

The service creates an APPROVED auto-approved action, then separately inserts ACTION_PROPOSED, then executes. If the audit insert fails, the action remains APPROVED and execution never starts. An identical retry returns that existing row immediately without repairing the missing audit or scheduling execution. There is no public execute/recovery endpoint or dispatcher to resume it. Human approval has the same boundary: its state update commits before the approval audit and execution, and another approval attempt rejects the now-APPROVED action.

**Observed:** first submission threw `audit unavailable`; the identical retry returned APPROVED; gateway calls stayed **0**. This differs from original finding 17: here the failure occurs before external submission, leaving authorized work unexecuted.

**Repair:** commit the authorized transition, required audit, and durable execution intent together. Recover committed execution intent with an idempotent claim/dispatcher. Do not blindly execute an existing action whose external outcome is uncertain.

**Verify:** inject audit failures during proposal and approval, then retry/recover. A rollback must leave a request safely retryable, or a committed intent must resume exactly the intended operation with its audit evidence.

### 40. Refunds can execute for a payment that was never captured

**Reproduced.** [Proposal validation](../../backend/src/modules/actions/actions.service.ts), [execution validation](../../backend/src/modules/actions/actions.service.ts).

Refund validation checks ownership, positive amount, and the amount of existing refunds. It does not require established capture evidence or even reject CREATED, AUTHORIZED, or FAILED payment state. The stored payment amount represents an attempt's requested amount too; it is not proof that this amount was captured.

**Observed:** a FAILED payment for 1,000 paise accepted a 100-paise refund, called the stub gateway once, and completed the action. A live gateway may reject this; simulation currently turns the missing domain validation into a successful-looking result. This is separate from original finding 16's unrelated-target and premature-resolution defects.

**Repair:** validate captured financial capacity at proposal and execution. Reject uncaptured attempts; preserve genuine capture history through partial/full refund states. Combine this with payment-wide reservations from original finding 18.

**Verify:** CREATED/AUTHORIZED/FAILED without capture cannot call the provider. An evidenced captured payment supports only its remaining refundable capacity, including partial/uncertain submissions.

### 41. Simulated provider IDs collide within the same millisecond

**Reproduced with a fixed clock tick.** [Refund ID](../../backend/src/integrations/razorpay/razorpay.client.ts), [link ID](../../backend/src/integrations/razorpay/razorpay.client.ts), [refund upsert](../../backend/src/modules/actions/actions.service.ts).

Both simulated ID generators use only Date.now(). Two distinct requests in one millisecond therefore get the same ID within each operation type. Refund persistence uses this ID as the unique upsert key with an empty update. A second refund can appear successful while its record is silently replaced by the first operation's existing row.

**Observed:** distinct refund calls for different payments returned the same `rfnd_sim_1792584000000`; two actual refund-handler calls produced only **one** stored refund row in the in-memory unique-key substitute. Distinct link requests also returned the same link ID. This is separate from original finding 08's exception ID generator.

**Repair:** give each distinct simulated operation a collision-resistant ID, and store/reuse it under a stable logical operation identity when replaying that same operation. Verify existing upsert data matches the intended payment and amount rather than silently adopting an unrelated operation.

**Verify:** freeze the clock and submit distinct requests; each must retain its own record. Replay one operation and require its original result without a second refund.

### 42. Payment links ignore order eligibility and remaining collection amount

**Reproduced.** [Payment-link execution](../../backend/src/modules/actions/actions.service.ts).

The handler checks a positive safe-integer amount and merchant-owned order lookup. It does not verify that collection remains due, compare the requested amount with the outstanding order balance, or relate that order to the exception. Approval alone does not establish that collecting this amount is valid. The order could also become paid between proposal and approval.

**Observed:** a PAID order with amount **1,000 paise** generated a link for **5,000 paise** and changed the selected exception to INVESTIGATING. No customer charge was performed by the probe.

**Repair:** validate exception/order relation and collectible outstanding balance from complete captures. Recheck eligibility at execution; reject or explicitly model a new obligation rather than using an already-paid/cancelled order for another collection.

**Verify:** paid/cancelled orders, unrelated same-merchant orders, over-balance amounts, valid partial-payment balance, and an order paid while approval was pending.

### 43. The shared Amount component rounds exact paise strings

**Reproduced by rendering the actual component.** [Conversion](../../frontend/components/ui/Amount.tsx), [exact formatter](../../frontend/lib/utils.ts).

Amount converts a string through Number before converting to BigInt. Values above JavaScript's exact integer range lose precision even though PostgreSQL BigInt and the string response can represent them. The exact formatter is already capable of formatting the string correctly, but the component damages the value first. This is a display defect, separate from original finding 23's unsafe mutation inputs.

**Observed:** input `9007199254740993` paise formatted directly ends in **.93**, while Amount rendered **.92**. Small demo amounts will conceal this defect.

**Repair:** parse decimal strings directly with BigInt. For number inputs require finite safe integers; do not silently floor fractional financial input. Preserve BigInt through formatting.

**Verify:** values around Number.MAX_SAFE_INTEGER, the PostgreSQL BigInt range, negative differences, zero, invalid strings, and unsafe/fractional numbers.

### 44. Withdrawn: Audit Trail page was incorrectly reported missing

**Withdrawn after actual browser and Git verification.** The [audit page](../../frontend/app/(dashboard)/audit/page.tsx) exists, is tracked, and returned HTTP 200. The backend audit module is present too. The earlier default rg search skipped directories named audit because of an ignore rule, which was incorrectly interpreted as missing source.

No missing-route repair is required. This item is excluded from active counts. Future repository inventories must include tracked files and inspect ignored paths with rg --no-ignore; verify an allegedly missing route in the browser before publishing the finding.

### 45. Dashboard reports completion after a failed reconciliation request

**Source-confirmed.** [Request handler](../../frontend/app/(dashboard)/page.tsx), [toast selection](../../frontend/app/(dashboard)/page.tsx).

Run Now sets the toast visible before making the request. The finally block sets running=false for success and failure alike; there is no catch/error outcome. The visible toast treats every non-running state as a green success with 'Reconciliation run completed.' A network failure or VIEWER's 403 can therefore produce a completion message and an unhandled rejected handler promise.

**Repair:** represent idle/running/success/error separately, catch request failures, and show successful completion only after a successful run response. Gate Run Now by authorized role for usability while retaining backend checks.

**Verify:** successful response, 403, validation error, network failure, and a refresh failure following a successful run; distinguish run failure from a failure to refresh the view.

### 46. FINANCE cannot reach the rejection control it is authorized to use

**Source-confirmed.** [ADMIN-only review entry](../../frontend/app/(dashboard)/actions/page.tsx), [role calculation](../../frontend/app/(dashboard)/actions/page.tsx), [backend rejection](../../backend/src/modules/actions/actions.service.ts), [modal rejection](../../frontend/components/approvals/ActionModal.tsx).

The backend permits ADMIN and FINANCE to reject pending actions. The Actions table only exposes Review Action when canApprove is true, and canApprove is ADMIN-only. The rejection button is inside that modal, so FINANCE cannot reach its supported rejection operation through the console.

**Repair:** separate canReview/canReject from canApprove. Permit FINANCE to inspect/reject eligible requests while keeping approval ADMIN-only and VIEWER read-only.

**Verify:** role-by-operation checks in both API and browser: ADMIN approve/reject, FINANCE reject but no approve, VIEWER neither. Include pending and already-processed states.

### 47. Incorrect login credentials trigger a full login-page navigation

**Reproduced using the actual Axios interceptor.** [Global 401 handler](../../frontend/lib/api-client.ts), [login request](../../frontend/lib/api-client.ts), [inline error handling](../../frontend/app/(auth)/login/page.tsx).

The global response interceptor redirects to /login on every 401, including POST /auth/login. A wrong password should leave the login form in place with its error. Instead, assigning window.location.href reloads the page and resets the form/error state. The local catch cannot preserve its feedback through a full navigation.

**Observed:** one mocked incorrect-password response caused **one forced login navigation**. The probe intercepted location assignment; it did not run a browser navigation.

**Repair:** treat authentication-endpoint failures separately. Redirect for expired protected sessions and preserve local validation feedback for login attempts.

**Verify:** bad credentials stay on the form and display the server error; an expired protected request clears its session and redirects once.

## Additional findings

The expanded review added the following twelve findings with PostgreSQL/browser evidence where noted.

### 48. Invalid settlement states satisfy payment coverage

**Reproduced in the actual matching function.** [Payment/settlement selection](../../backend/src/modules/reconciliation/reconciliation.service.ts) considers every settlement regardless of status; the bank stage also iterates every settlement. A CAPTURED 1,000-paise payment and a FAILED 1,000-paise settlement produced one match and no missing-settlement exception.

This is separate from 11's bank-entry eligibility. Reject failed settlement evidence and distinguish not-yet-processed batches from completed settlement coverage. Test CREATED, FAILED, and PROCESSED with otherwise identical amounts/dates.

### 49. Weak matching overrides a known reference conflict

**Reproduced in the actual matching function.** [Fallback branch](../../backend/src/modules/reconciliation/reconciliation.service.ts) searches equal-amount nearby bank entries when no exact UTR matches, without excluding a bank row that has a different known UTR or incompatible stored settlement link. KNOWN-A versus KNOWN-B was accepted as AMOUNT_TIME with no exception.

Preserve explicit conflicting evidence; use fallback only for genuinely absent/compatible references. Test missing references separately from contradictory references, including explicit bank settlement links. This differs from 11's direction/state/reuse checks.

### 50. The larger bank generator cannot write its internal IDs

**Reproduced against isolated PostgreSQL: P2023.** [uid helper](../../backend/src/integrations/bank/bank-data.generator.ts) returns a prefix plus twelve hex characters, such as c_..., and passes it into primary IDs and relationship fields declared @db.Uuid. The first clean settlement insertion fails.

Use randomUUID for internal UUID columns and separate prefixed identifiers for provider/reference columns. Exercise every generated scenario against PostgreSQL. The package alias currently invokes a different small injector; this finding concerns the exported BankDataGenerator class, not a claim that both generators share this failure.

### 51. Separate install paths are not reproducible

**Manifest/lock contract check and source-confirmed Docker configuration.** [Frontend manifest](../../frontend/package.json) requires next ^16.4.0, while its standalone [lockfile](../../package-lock.json) locks 16.3.4. The backend standalone lock also has sprintf-js 1.0.3 against ^1.1.3. The [frontend Dockerfile](../../frontend/Dockerfile) installs from the standalone frontend context with npm ci, so a successful root-workspace install does not validate that path.

The [backend Dockerfile](../../backend/Dockerfile) runs npm install before copying backend/.npmrc, although the current NestJS/nestjs-zod peer mismatch relies on legacy-peer-deps. Align the chosen lockfile/workspace strategy and copy required install configuration before dependency installation.

An isolated offline npm ci dry run stopped with ENOTCACHED; no successful clean install or complete Docker build is claimed. The incompatible pinned versions and copy order are independently visible in repository files. Test both isolated build contexts after repairing them.

### 52. Read failures become reassuring empty results

**Actual browser reproduction with a synthetic HTTP 500.** [Transactions fetch effects](../../frontend/app/(dashboard)/transactions/page.tsx) catch errors by clearing rows/counts, and the UI then says No payments found. The [exceptions page](../../frontend/app/(dashboard)/exceptions/page.tsx) ignores SWR errors with empty fallbackData; the [audit page](../../frontend/app/(dashboard)/audit/page.tsx) similarly clears logs on failure. An outage is indistinguishable from no financial evidence.

Track loading/success/empty/error explicitly, retain stale data with a visible stale/error label where appropriate, and offer retry. Verify failures separately from successful empty responses on each collection. This is a read-state issue, separate from 45's mutation completion message.

### 53. Record counts are displayed as monetary values

**Reproduced.** [Money-key heuristic](../../frontend/lib/humanize.ts) treats any integer field whose name contains total as paise. formatValue('totalRecords', 400) returns INR 4.00. Reconciliation-run results and nested audit/tool evidence contain these count fields.

Use explicit field/unit metadata or a precise money-field allow-list. Verify counts, durations, IDs, totals, and monetary fields independently; preserve exact money parsing from finding 43.

### 54. CSS variable colors are combined with hex-only alpha syntax

**Actual browser reproduction.** [Tokens](../../frontend/lib/tokens.ts) are var(...) expressions; [Header](../../frontend/components/layout/Header.tsx) constructs var(--surface)E6. Similar suffixes appear in badges and cards. These expressions do not become valid alpha colors when substituted. The browser computed the header background as rgba(0, 0, 0, 0), despite a nontransparent surface token.

Use explicit alpha tokens, valid color-mix/RGB-channel expressions, or opacity on a dedicated background element. Verify computed styles in both themes rather than relying on the presence of an inline style string.

### 55. The browser action test can silently skip its purpose

**Source-confirmed.** [Exceptions E2E](../../frontend/e2e/exceptions.spec.ts) swallows the missing-row timeout and puts detail/action assertions inside if(firstRow.isVisible()). With no generated exceptions, the test completes after login/navigation without opening details or clicking an action. Even when it clicks, it does not assert that an action was persisted or reached the expected state.

Create a controlled exception fixture, require its presence, perform the operation unconditionally, and assert its actual outcome. A missing fixture should fail or explicitly skip with a reason, never count as a successful action test. The existing browser suite was not executed against the user's normal backend.

### 56. Dashboard labels assert facts its inputs do not establish

**Actual browser reproduction with contract-shaped fixtures.** [Dashboard](../../frontend/app/(dashboard)/page.tsx) calls total CAPTURED volume reconciled, calls every resolved_today record auto-resolved, and labels open_exceptions as Total Exceptions (All Time). Current CAPTURED volume is also labeled all-time total volume. These scopes differ from the API's [documented metrics](../architecture/behavior-contract.md#metrics-and-actions).

With zero backend coverage, the recap still claimed INR 1,000 reconciled. A current OPEN count of one was shown under an all-time exception label while all-status groups totaled five. Display the actual defined scopes or return dedicated aggregates/provenance. This is separate from 25's percentage denominators.

### 57. The default API proxy targets the wrong backend prefix

**Reproduced configuration evaluation.** [Next rewrite](../../frontend/next.config.js) defaults to htttp://localhost:3001/api/:path*, while [main.ts](../../backend/src/main.ts) exposes /api/v1. With the variable absent, frontend /api/health therefore targets backend /api/health instead of /api/v1/health.

The normal Axios fallback calls the backend directly and can hide this dormant proxy defect. Define separate browser API and upstream proxy settings, use the correct prefix, and test the proxied path as well as direct calls. A relative public base must not accidentally become the proxy's upstream destination.

### 58. Severity calculation can exceed its storage type

**Reproduced against isolated PostgreSQL.** [Score/persistence](../../backend/src/modules/reconciliation/reconciliation.service.ts) converts the money difference into an unbounded score, then writes it to an Int severityScore. An eligible order of 600000000000 paise fits PostgreSQL BigInt, but its calculated score 3000000065 does not fit signed INT4. Reconciliation failed with an integer conversion error and persisted zero runs because of the existing transaction lifecycle gap (35).

Define the score's supported range, clamp/normalize it deliberately or choose a compatible storage type, and validate the monetary domain independently. Test valid large BigInt amounts as well as ordinary demo values; do not silently reject valid money solely because a derived score overflows.

### 59. Successful manual fetches do not update the displayed connection state

**Actual browser reproduction.** [LiveIndicator](../../frontend/components/ui/LiveIndicator.tsx) shows Reconnecting until the SWR context records a success, but the transactions page uses manual Axios/effect fetching and never updates that context. Entering Transactions directly in a fresh session loaded a valid payment list while still showing Reconnecting. Audit uses a similar manual-fetch path.

Derive freshness/connectivity from the actual page's request state, or make every relevant successful fetch update a well-defined shared observation. One unrelated SWR success should also not certify freshness of every financial surface. Verify direct entry, navigation, success, stale data, and failed refreshes.

## Discovery evidence and limits

The original unit baseline was 101 tests. Controlled defect probes and selected real PostgreSQL/browser observations exposed behavior outside that baseline. A historical probe passing meant the recorded bad behavior was reproduced; it did not mean the application was healthy.

The old audit wrappers were retired. Use [maintained regression commands](testing.md) for corrected invariants and the [per-finding closure matrix](fix-verification.md#per-finding-closure) for current evidence. In particular, real PostgreSQL tests cover constraints/rollback/races, browser fixtures cover observable UI requests/outcomes, and packaging checks cover startup/proxy/restart preservation.

Financial eligibility/capacity, durable execution/delivery, complete matching evidence, exact units, and truthful UI state drove the [implementation phases](fix-verification.md#implementation-phases). Simulation and synthetic resets remain useful learning features; their original defects concerned implicit or destructive behavior rather than a requirement to remove those features.
