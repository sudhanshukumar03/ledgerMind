# Product requirements

LedgerMind helps an operator understand why financial records disagree and decide what to do next. It is a learning project built around synthetic data, explicit simulation, and optional provider tests.

## Problem context

An order, payment, refund, settlement, and bank movement can describe different stages of the same financial event. Comparing individual rows is insufficient when captures split, settlements batch several payments, refunds arrive later, or events are duplicated and reordered.

The learning goal is to connect those records without inventing relationships, explain the remaining discrepancy, and retain the evidence behind a controlled resolution.

## Scope and status

The implemented application includes deterministic reconciliation, exception lifecycle, signed webhook processing, merchant-scoped queries, optional AI investigation/chat, governed actions, and an audit console. Current interfaces are defined by the [API](../specifications/api.md) and [database](../specifications/database.md) references. Tested cases are recorded in [verification](../operations/fix-verification.md).

Self-registration, SSO, policy settings, notifications, WebSockets, full transaction graphs, and automatic investigation in every path are outside the implemented scope.

## Functional targets

| Capability | Required behavior |
| --- | --- |
| Ingestion | Persist verified events and recoverable dispatch intent; preserve original work on duplicates; handle delayed and missing relationships. |
| Reconciliation | Evaluate complete related order/capture/refund/batch/bank evidence with explicit deadlines and INR units. |
| Exceptions | Maintain current facts, nonnegative exposure, evidence, operator decisions, clearance, and genuine recurrence. |
| Investigation | Provide scoped facts and optional AI explanations with confidence, evidence, latency, and explicit fallback metadata. |
| Actions | Validate related eligible targets, current balances, approval requirements, durable ownership, and recoverable external outcomes. |
| Console | Distinguish loading, failure, empty results, stale responses, and actual mutation outcomes. |
| Audit | Persist required AI and action decisions atomically with the associated local result. |

## Actions and approval defaults

FINANCE and ADMIN can submit actions. VIEWER cannot submit financial or local action mutations. Monetary actions include REFUND and CREATE_PAYMENT_LINK; both use the implemented thresholds below.

| Monetary amount in paise | Equivalent | Required approval |
| --- | --- | --- |
| 1-99,999 | Below INR 1,000 | Policy auto-approval after authorized operator submission. |
| 100,000-5,000,000 | INR 1,000-INR 50,000 inclusive | One ADMIN distinct from the requester. |
| Above 5,000,000 | Above INR 50,000 | Two distinct ADMINs, both distinct from the requester. |

An approver can vote once. FINANCE and ADMIN may reject pending requests. MARK_REVIEWED and ESCALATE are local actions and require authorized operator submission without monetary approval. For example, a 100,000-paise monetary request needs one ADMIN who is not the requester; a 5,000,001-paise request needs two different ADMINs.

Amounts must be positive safe integer paise. Refunds require related captured evidence and available capacity; links require a related collectible order and remaining collection amount. Current parent eligibility is checked before execution and again at monetary submission. Unknown outcomes remain protected until verified; a new idempotency key is not safe recovery.

## Requirements matrix

| ID | Requirement | Reference |
| --- | --- | --- |
| FR-1 | Authenticate seeded users and derive merchant/role scope on the server. | [Security](../specifications/security.md#authentication-and-roles) |
| FR-2 | Validate original webhook bytes, persist dispatch intent, and recover bounded owned processing. | [Webhook contract](../architecture/behavior-contract.md#webhooks) |
| FR-3 | Reconcile complete related evidence, explicit batches, overdue states, and unexplained bank movements. | [Reconciliation](../architecture/overview.md#deterministic-reconciliation) |
| FR-4 | Preserve exception lifecycle and same-run metrics under repeated or competing work. | [Lifecycle contract](../architecture/behavior-contract.md#reconciliation) |
| FR-5 | Keep AI tools advisory and validate output before required analysis/audit persistence. | [AI specification](../specifications/ai-agent.md) |
| FR-6 | Enforce target eligibility, capacity, distinct approvals, and durable execution recovery. | [Action API](../specifications/api.md#actions-and-approvals) |
| FR-7 | Show scoped data, actionable errors, accurate units, and actual action status. | [Console workflows](#console-workflows) |
| NFR-1 | Keep money as integer paise and timestamps as ISO-serialized UTC instants. | [Storage conventions](../specifications/database.md#storage-conventions) |
| NFR-2 | Preserve records on ordinary restarts and guard destructive fixture/test operations. | [Local setup](../operations/local-development.md) |
| NFR-3 | Verify rollback, races, leases, and recovery using real isolated PostgreSQL/Redis where needed. | [Testing](../operations/testing.md) |
| NFR-4 | Keep secrets out of source, logs, and browser configuration. | [Secrets handling](../specifications/security.md#secrets-and-data-handling) |

Broad append-only enforcement, complete change-history coverage, universal correlation, managed encryption, and production availability are future design topics; existing audit tables or infrastructure choices alone do not establish them.

## Console workflows

1. Initialize disposable learning data and sign in as ADMIN, FINANCE, or VIEWER. Registration is informational.
2. As FINANCE or ADMIN, run reconciliation. All three roles can inspect the resulting exceptions and their linked evidence.
3. Request AI investigation if configured. Review evidence and fallback metadata; treat the answer as advice.
4. As FINANCE or ADMIN, select an eligible payment/order and submit an explicit proposal. Review the actual policy result and required approvals.
5. Have the required distinct ADMINs approve, or let FINANCE/ADMIN reject. If an operation becomes OUTCOME_UNKNOWN, an ADMIN can verify the existing provider operation through recovery when the backend is in provider_test mode.
6. Reconcile resulting financial evidence before considering the discrepancy cleared.

Exception search is server-side. The UI defaults to OPEN only when no status key exists; clearing status selects all. New entity selection must discard stale responses. Timeout must stop loading and allow retry. Details and action results must preserve exact paise, evidence provenance, and current status.

## Benchmark exercises

The following are unverified targets: persist/acknowledge webhooks within 200 ms, reconcile 1,000 representative records within two seconds, and load a local dashboard within one second. Record hardware, data distribution, queue depth, errors, and provider latency before comparing results. These targets are not an availability or throughput SLA.

## Acceptance

For each exercise, explain the invariant, demonstrate the failure, implement the correction, and verify relevant normal, boundary, duplicate, concurrent, delayed, and recovery cases. The [behavior contract](../architecture/behavior-contract.md) defines shared rules, and the [verification record](../operations/fix-verification.md) records completed evidence.
