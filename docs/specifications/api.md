# API reference

The backend base path is **/api/v1**. Requests and responses use JSON. Protected routes require an `Authorization: Bearer <JWT>` header; merchant and actor identity come from authentication rather than caller-supplied scope.

Public application routes are POST /auth/login, POST /webhooks/razorpay, and GET /health. Health is liveness, not database/Redis readiness. Swagger may also be exposed at /api when enabled. Registration, SSO, token refresh, and an Idempotency-Key request header are not implemented.

## Wire conventions

| Value | Contract |
| --- | --- |
| Stored BigInt monetary fields | Decimal strings containing integer paise. JSON proposal amounts and nested action parameters may remain safe integer numbers; do not assume every monetary response value is a string. |
| Action amount | Positive safe integer JSON number in paise; INR only. Settlement component amounts have separate zero/signed rules below. |
| Timestamp | ISO-serialized instant. |
| Record identity | Internal UUID, except exception reads also resolve EXC display IDs; supported discovery/proposal paths may explicitly resolve provider references. |
| Pagination | Integer page >=1, limit 1-100, and bounded calculated offset. |
| Success status | GET defaults to 200; Nest POST defaults to 201 unless explicitly overridden. Webhook acknowledgement is explicitly 200. |

Invalid IDs, enums, dates/ranges, and amounts produce client errors through DTO/domain validation. Swagger response annotations alone do not override runtime HTTP status. Clients must read returned action/reconciliation status rather than treating HTTP success as financial completion.

## Route catalogue

Routes below are relative to /api/v1. All protected operations remain merchant scoped, including ADMIN operations.

| Method | Route | Access |
| --- | --- | --- |
| GET | /actions | Authenticated |
| GET | /ai/config | Authenticated |
| GET | /audit | Authenticated |
| GET | /bank-transactions | Authenticated |
| GET | /bank-transactions/:id | Authenticated |
| GET | /dashboard/metrics | Authenticated |
| GET | /exceptions | Authenticated |
| GET | /exceptions/:id | Authenticated |
| GET | /exceptions/:id/timeline | Authenticated |
| GET | /health | Public |
| GET | /orders | Authenticated |
| GET | /orders/:id | Authenticated |
| GET | /payments | Authenticated |
| GET | /payments/:id | Authenticated |
| GET | /reconciliation/runs | Authenticated |
| GET | /reconciliation/stats | Authenticated |
| GET | /refunds | Authenticated |
| GET | /refunds/:id | Authenticated |
| GET | /settlements | Authenticated |
| GET | /settlements/:id | Authenticated |
| GET | /transactions | Authenticated |
| GET | /transactions/:id | Authenticated |
| GET | /webhooks/events | Authenticated |
| POST | /actions | FINANCE or ADMIN |
| POST | /actions/:id/approve | ADMIN; service enforces merchant and review rules |
| POST | /actions/:id/recover | ADMIN; service enforces merchant and review rules |
| POST | /actions/:id/reject | FINANCE or ADMIN |
| POST | /ai/chat | Authenticated |
| POST | /ai/investigate/:id | Authenticated |
| POST | /auth/login | Public |
| POST | /reconciliation/run | FINANCE or ADMIN |
| POST | /settlements/:id/allocations | FINANCE or ADMIN |
| POST | /webhooks/events/:id/retry | FINANCE or ADMIN |
| POST | /webhooks/razorpay | Public |

## Authentication and lists

POST /auth/login accepts email and password. It returns access_token and user with id, email, name, role, and merchantId. Password hashes are not returned. Bad credentials remain an inline login error in the console.

| Collection | Response envelope |
| --- | --- |
| Orders, payments, refunds, settlements, bank-transactions, exceptions, webhook events | data, total, page, limit. |
| Generic transactions | data and pagination containing total, page, limit. |
| Actions | Bounded bare array; page/limit default to 1/100. |
| Audit | Bare array; limit defaults to 50 and is capped at 100. |
| Reconciliation runs | Latest 20 runs as a bare array. |

Payments support status, canonical method, search, from, and to. Settlements support status, ID/UTR search, from, and to. Exceptions support status, severity, type, and server-side search before pagination. Omitting status means all at API level; the UI chooses OPEN only when its URL has no status key.

Generic transactions accept type order/payment/refund/settlement/bank, default to payment, and validate the corresponding status and date bounds. Their date filter uses createdAt for every type, including settlement and bank. This differs from the dedicated settlements list, which filters settlementDate. Scoped detail reads return a detail object or 404; generic transaction details are not identical to the dedicated endpoint's record shape. Exception details expose latest-first aiAnalyses and eligiblePayments with internal id, paymentId, and remainingAmount. These are display hints; execution revalidates capacity. Timeline resolves display IDs and orders events by occurredAt.

Date bounds are inclusive instants. The shared parser does not expand a date-only to value to the end of that day. For an exact reporting interval, supply explicit timestamps with a timezone offset rather than assuming a whole-day range.

## Webhook and recovery contract

Send original JSON bytes with X-Razorpay-Signature and preferably X-Razorpay-Event-Id. A legacy root event_id is also supported; otherwise a body hash supplies stable identity.

| Acknowledgement body | Meaning |
| --- | --- |
| status=accepted | Verified event is durably stored; queue recovery can repair immediate dispatch failure. |
| status=ignored, reason=duplicate_event | Original work is preserved; this is not a new processing attempt. |
| status=rejected, reason=invalid_signature | Diagnostic input is retained without financial ingestion. |
| status=rejected, reason=stale_webhook | Clearly ancient event is retained as stale rather than queued. |

A persistence failure is not an accepted event. HTTP 200 is the receiver's acknowledgement convention, so clients must inspect the body. Accepted does not mean worker completion, provider settlement, or exception clearance.

New entity ingestion requires a unique trusted merchant razorpayAccountId matching payload.account_id or a supported existing scoped relationship. Malformed metadata remains unknown diagnostic evidence. Verified unsupported shapes become UNSUPPORTED.

Automatic worker claims and dispatch share a 20-attempt ceiling. POST /webhooks/events/:id/retry allows FINANCE/ADMIN to reset/requeue eligible FAILED or expired work; it does not authorize processing invalid signatures or unrelated merchant events.

## Reconciliation and metrics

POST /reconciliation/run accepts optional dateFrom/dateTo with from <= to. A new synchronous run returns status=COMPLETED, runId, recordsProcessed, and exception counts after completion. Overlapping merchant work returns status=IN_PROGRESS, coalesced=true, and the existing runId. Failure retains a durable FAILED run.

Reconciliation anchors use createdAt for orders/payments/refunds, settlementDate for settlements, and transactionDate for bank movements. They then expand through related evidence. A payment's capture timestamp is not its date-window anchor, and the window does not discard linked evidence outside it.

Run history exposes status, timing, counts, capturedPayments, matchedPayments, and capturedVolume. Starting a run or listing history marks IN_PROGRESS runs older than five minutes as FAILED; this is not a background timeout. Coverage uses numerator/denominator from the same completed run, with zero for an empty denominator. Overall stats round the percentage to two decimals, use the latest completed full run, and expose snapshot_at. A date-filtered run cannot replace that overall snapshot.

Current total_transaction_volume is all-time captured volume, including refunded capture history. open_exceptions and critical_exceptions include OPEN/INVESTIGATING. resolved_today counts resolutions since midnight in the backend process's local timezone, rather than a per-merchant timezone; grouped severity/type counts use active exceptions.

## Settlement membership import

POST /settlements/:id/allocations atomically replaces explicit membership and its audit. FINANCE/ADMIN supplies 1-500 distinct captured merchant payments. Values use safe integer paise: refund/fee/tax are nonnegative; adjustment may be signed.

```json
{
  "allocations": [
    {
      "payment_id": "22222222-2222-4222-8222-222222222222",
      "gross_amount": 10000,
      "refund_amount": 0,
      "fee_amount": 200,
      "tax_amount": 36,
      "adjustment_amount": 0
    }
  ]
}
```

The net sum must equal the settlement amount. Cross-batch capacity checks count allocations in other non-FAILED settlements; a failed batch does not hold gross/refund allocation capacity. Later zero-gross refund components are allowed without allocating the capture again; refund allocations must be backed by processed evidence across those non-failed batches. Coverage is stricter: only valid PROCESSED settlements contribute. An all-zero component is rejected. Response fields are settlementId, allocatedPayments, and netAmount. Example UUIDs are placeholders, not usable records.

## Actions and approvals

POST /actions accepts an exception_id UUID, an action_type, and parameters. Types are REFUND, CREATE_PAYMENT_LINK, MARK_REVIEWED, and ESCALATE.

```json
{
  "exception_id": "11111111-1111-4111-8111-111111111111",
  "action_type": "REFUND",
  "parameters": {
    "payment_id": "22222222-2222-4222-8222-222222222222",
    "amount": 10000,
    "reason": "Verified duplicate capture"
  }
}
```

Refunds require a related captured payment; an ORDER-anchored duplicate requires explicit payment selection. Links require a related collectible order and remaining collection amount. The service resolves supported order references and protects the order against another active/unknown link across exception changes, including legacy rows. Disabled mode rejects new monetary intent before reservation.

Canonical exception/type/parameters determine the server idempotency key. Authorized replay returns the existing action before consumed-balance checks. A changed reason creates a distinct action and cannot bypass shared capacity. Capacity subtracts CREATED, PROCESSING, and PROCESSED refund rows plus active action reservations. Pending refund rows hold capacity; they do not yet prove that reconciliation exposure has cleared. These calculations and final refund-state updates use the shared payment-row lock.

The [approval table](../product/prd.md#actions-and-approval-defaults) applies to REFUND and CREATE_PAYMENT_LINK. Below 100,000 paise, policy auto-approval follows operator submission. Through 5,000,000 paise, one distinct ADMIN is required; above it, two. Requesters cannot approve themselves or vote twice. Approval/rejection requires a nonblank reason. FINANCE/ADMIN may reject; only ADMIN approves. The first of two votes leaves PENDING_APPROVAL.

### Execution eligibility

The current parent is locked/revalidated at execution claim. Monetary submission again checks current parent, claim token, and unexpired lease before recording externalSubmittedAt. A terminal parent before submission causes known FAILED nonexecution with audit. Already-submitted work retains uncertain-outcome recovery rules.

Responses expose actual status, including OUTCOME_UNKNOWN, and execution_mode/simulated metadata where applicable. Provider acceptance does not resolve the exception. Completion updates only current OPEN/INVESTIGATING parents; later RESOLVED/IGNORED metadata survives with ACTION_PARENT_STATE_PRESERVED audit.

### Provider verification

POST /actions/:id/recover requires ADMIN, provider_id, and a backend running in provider_test mode. The provider lookup is unavailable in simulation/disabled mode. It reads an existing test operation and verifies identity, target, amount, INR, and applicable provider evidence. It never submits another financial operation. Unknown outcomes retain protection until verified.

A COMPLETED CREATE_PAYMENT_LINK can also be refreshed. The supplied ID must match its stored provider ID. Confirmed cancelled/expired links become FAILED with retained evidence/creation timestamp and ACTION_PAYMENT_LINK_INACTIVE audit. A distinct replacement proposal may then pass current balance/uniqueness guards. Confirmed active links remain COMPLETED and protective.

## AI

| Route | Contract |
| --- | --- |
| POST /ai/chat | 1-40 nonblank user/assistant turns, each <=8,000 characters; server owns system/tool roles. |
| POST /ai/investigate/:id | Scoped UUID/EXC ID; returns the saved validated analysis and evidence metadata. |
| GET /ai/config | Configured model and tool count for authenticated users. |

Chat responses include message, tool_calls, tool_calls_made, suggested_actions, proposals, isFallback, and latencyMs. Every response requires audit persistence. Browser chat additionally limits encoded JSON to 90 KB.

Investigation responses expose summary, likelyCause/likely_cause, confidence, financialExposure, recommendedAction, evidenceChain, nextSteps, toolCalls, isFallback, latencyMs, model, and createdAt. Exposure is a decimal paise string; confidence is an integer 0-100. Analysis and audit commit together.

A successful structured analysis requires nonempty summary and likely_cause plus supplied confidence. Empty objects, malformed/incomplete output, or explicitly incomplete final responses use a controlled fallback. Disabled/unavailable AI remains auditable. Browser investigation timeout is 15 seconds and permits retry without proving provider cancellation.

See the [AI specification](ai-agent.md) for the 16 advisory/proposal tools and the [behavior contract](../architecture/behavior-contract.md) for shared invariants.
