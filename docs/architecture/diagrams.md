# Architecture diagrams

These diagrams summarize implemented flows and their boundaries. The [behavior contract](behavior-contract.md) defines the rules, the [architecture guide](overview.md) explains the design, and the [verification record](../operations/fix-verification.md) records tested cases. Mermaid structure is checked offline; rendered layout still needs a compatible viewer.

## System architecture

```mermaid
flowchart LR
    UI[Next.js console] --> API[NestJS API and JWT/RBAC]
    API --> DB[(PostgreSQL)]
    PROVIDER[Signed provider event] --> WH[Webhook persistence]
    WH --> DB
    WH --> QUEUE[BullMQ / Redis]
    SWEEP[Durable dispatch recovery] --> QUEUE
    DB --> SWEEP
    QUEUE --> WORKER[Owned ingestion worker]
    WORKER --> DB
    WORKER --> RECON[Deterministic reconciliation]
    RECON --> DB
    API --> AI[Optional AI advice]
    AI --> TOOLS[Scoped evidence / proposal tools]
    TOOLS --> DB
    API --> ACTION[Policy and Action Engine]
    ACTION --> DB
    ACTION --> GATEWAY[Explicit simulation / provider test]
```

The AI tools have no execution edge to the Action Engine. Operator submission supplies the separate authorized request.

## Webhook ingestion

```mermaid
sequenceDiagram
    participant P as Provider
    participant H as HTTP receiver
    participant D as PostgreSQL
    participant Q as Redis queue
    participant W as Worker
    P->>H: Original bytes and signature
    H->>H: Validate signature
    H->>D: Store diagnostic or verified event / preserve duplicate
    alt Invalid delivery
        H-->>P: HTTP 200 rejected body
    else Existing verified delivery
        H-->>P: HTTP 200 duplicate body, no new dispatch
    else Ancient verified event
        H->>D: Retain stale status
        H-->>P: HTTP 200 stale rejection body
    else New eligible verified delivery
        H->>Q: Attempt dispatch
        H-->>P: HTTP 200 accepted body
        Note over D,Q: Persisted intent repairs dispatch gaps
        Q->>W: Deliver job
        W->>D: Claim token / lease / attempts below 20
        W->>D: Atomic ingestion and event completion
    end
```

A database failure is not an accepted delivery. Queue failure after durable persistence is recoverable. Acceptance does not imply successful processing or reconciliation.

## Reconciliation evidence

```mermaid
flowchart TD
    RUN[Persist or coalesce merchant run] --> LOCK[Acquire merchant financial lock]
    LOCK --> SCOPE[Load evidence and expand date anchors]
    SCOPE --> ORDER[Orders and captured/refunded history]
    ORDER --> BATCH[Explicit processed settlement allocations]
    BATCH --> BANK[Eligible posted bank evidence]
    BANK --> STRONG[Resolve unique strong references]
    STRONG --> WEAK[Validate unique weak candidates]
    WEAK --> FACTS[Compute discrepancies and current evidence]
    FACTS --> LIFE[Lock current exception lifecycle]
    LIFE --> COMMIT[Commit matches / facts / completed snapshot]
    LOCK -->|Failure| FAIL[Persist FAILED run outside rollback]
```

Amounts, currency, state, deadlines, allocation conservation, and reference compatibility are checked after relationships are resolved. Only the evaluated scope may be cleared.

## Proposal, approval, and execution

```mermaid
sequenceDiagram
    participant O as Requesting operator
    participant R as Distinct ADMIN reviewers
    participant AI as AI Controller
    participant A as Action Engine
    participant D as PostgreSQL
    participant P as Provider or simulator
    O->>AI: Investigate scoped exception
    AI-->>O: Evidence / analysis / proposal
    O->>A: Submit explicit proposal
    A->>D: Validate target / reserve / audit
    opt Monetary amount requires human approval
        R->>A: One or two distinct approvals, excluding requester
        A->>D: Persist votes and required approval count
    end
    A->>D: Claim ownership and validate current parent
    A->>D: Commit submission boundary after revalidation
    A->>P: Authorized operation
    P-->>A: Result or uncertain response
    A->>D: Persist result / audit / recovery state
    Note over A,D: Reconciliation confirms financial clearance separately
```

This sequence shows monetary actions. Small eligible amounts use policy auto-approval after operator submission; larger amounts require the distinct reviewers shown above. Local MARK_REVIEWED/ESCALATE actions do not call a provider. If the parent becomes terminal before monetary submission, execution records known nonexecution. A late result after submission preserves current terminal parent decisions.

## Action states

```mermaid
stateDiagram-v2
    [*] --> PENDING_APPROVAL: Required human review
    [*] --> APPROVED: Eligible policy auto-approval
    PENDING_APPROVAL --> PENDING_APPROVAL: First of two votes
    PENDING_APPROVAL --> APPROVED: Required distinct votes
    PENDING_APPROVAL --> REJECTED: Authorized rejection
    APPROVED --> EXECUTING: Owned claim
    EXECUTING --> APPROVED: Recoverable unsubmitted interruption
    EXECUTING --> FAILED: Confirmed nonexecution or failure
    EXECUTING --> COMPLETED: Persisted outcome and audit
    EXECUTING --> OUTCOME_UNKNOWN: Submitted outcome uncertain
    OUTCOME_UNKNOWN --> COMPLETED: Verified success
    OUTCOME_UNKNOWN --> FAILED: Verified failure or inactive link
    COMPLETED --> FAILED: Payment link verified cancelled or expired
```

The final transition applies only to confirmed inactive payment links and retains provider evidence. Unknown financial outcomes are protected and cannot be automatically resubmitted.

ADMIN provider verification requires provider_test mode; the lookup is unavailable in simulation/disabled mode. A FAILED result on that final link transition means the provider confirmed an inactive link, not that the original creation never succeeded.

## Payment evidence states

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> AUTHORIZED
    CREATED --> CAPTURED: Direct capture evidence
    AUTHORIZED --> CAPTURED
    CREATED --> FAILED
    FAILED --> AUTHORIZED: Later authorization evidence
    FAILED --> CAPTURED: Later capture evidence
    CAPTURED --> PARTIALLY_REFUNDED: Processed refund below capture
    PARTIALLY_REFUNDED --> REFUNDED: Processed total reaches capture
    CAPTURED --> REFUNDED: Full processed refund
```

These are selected transitions implemented by ingestion and refund writers, not a complete provider state graph. The ingester retains AUTHORIZED when a later payment.failed event arrives, so no AUTHORIZED-to-FAILED edge is shown. Later valid authorization/capture evidence can replace a previously FAILED state. Delayed authorization/failure cannot erase captured/refunded evidence. Capture history remains relevant after refund. Settlement membership is a relationship rather than an additional PaymentStatus.

## Data model

Selected current relations and columns are shown below. The [database reference](../specifications/database.md) lists all 17 models. Polymorphic match/timeline/audit references remain service-validated links.

```mermaid
erDiagram
    MERCHANT ||--o{ USER : owns
    MERCHANT ||--o{ ORDER : owns
    MERCHANT ||--o{ PAYMENT : owns
    MERCHANT ||--o{ REFUND : owns
    MERCHANT ||--o{ SETTLEMENT : owns
    MERCHANT ||--o{ BANK_TRANSACTION : owns
    MERCHANT ||--o{ RECONCILIATION_RUN : owns
    MERCHANT ||--o{ EXCEPTION : owns
    MERCHANT ||--o{ ACTION : owns
    MERCHANT ||--o{ AUDIT_LOG : owns
    PAYMENT }o--o| ORDER : optional_order
    PAYMENT ||--o{ REFUND : has
    BANK_TRANSACTION }o--o| SETTLEMENT : optional_link
    EXCEPTION }o--o| RECONCILIATION_RUN : optional_source_run
    RECONCILIATION_RUN ||--o{ RECONCILIATION_MATCH : records
    EXCEPTION ||--o{ EXCEPTION_EVENT : has
    EXCEPTION ||--o{ AI_ANALYSIS : has
    EXCEPTION ||--o{ ACTION : has
    ACTION }o--o| USER : requested_by
    ACTION }o--o| USER : approved_by
    AUDIT_LOG }o--o| USER : optional_actor
    MERCHANT {
        uuid id PK
        string name
    }
    USER {
        uuid id PK
        uuid merchant_id FK
        string email UK
        enum role
    }
    ORDER {
        uuid id PK
        string order_id UK
        bigint amount
        string currency
    }
    PAYMENT {
        uuid id PK
        uuid merchant_id FK
        uuid order_id FK "nullable"
        string payment_id UK
        bigint amount
        enum status
    }
    REFUND {
        uuid id PK
        uuid payment_id FK
        bigint amount
        enum status
    }
    SETTLEMENT {
        uuid id PK
        string settlement_id UK
        bigint amount
        date settlement_date
    }
    BANK_TRANSACTION {
        uuid id PK
        uuid settlement_id FK "nullable"
        string bank_txn_id UK
        bigint amount
        enum transaction_type
        date transaction_date
        timestamp value_at "nullable"
    }
    RECONCILIATION_RUN {
        uuid id PK
        enum status
        int matched_count
        int exception_count
    }
    RECONCILIATION_MATCH {
        uuid id PK
        uuid run_id FK
        uuid source_id "polymorphic reference"
        uuid target_id "polymorphic reference"
        int match_score
    }
    EXCEPTION {
        uuid id PK
        string exception_id UK
        string dedup_key UK
        bigint financial_impact
        enum status
    }
    EXCEPTION_EVENT {
        uuid id PK
        uuid exception_id FK
        jsonb snapshot
        timestamp occurred_at
    }
    AI_ANALYSIS {
        uuid id PK
        uuid exception_id FK
        string likely_cause
        int confidence
        jsonb tool_calls
        boolean is_fallback
    }
    ACTION {
        uuid id PK
        uuid exception_id FK
        uuid requested_by FK "nullable"
        uuid approved_by FK "nullable"
        jsonb parameters
        string idempotency_key UK
    }
    WEBHOOK_EVENT {
        uuid id PK
        string event_id UK
        uuid merchant_id "nullable scalar"
        jsonb payload
        string correlation_id
    }
    AUDIT_LOG {
        uuid id PK
        uuid merchant_id FK
        string actor_type
        string entity_type
        uuid entity_id "nullable polymorphic reference"
        jsonb before_state
        jsonb after_state
        string correlation_id
    }
```

## Browser request lifecycle

```mermaid
stateDiagram-v2
    [*] --> Loading
    Loading --> Ready: Current request succeeds
    Loading --> Empty: Current request succeeds with no rows
    Loading --> Error: Current request fails or times out
    Error --> Loading: Retry
    Ready --> Loading: Entity or query changes
    Empty --> Loading: Entity or query changes
    Loading --> Loading: Superseded response ignored
```

Freshness follows successful manual/SWR requests. Investigation timeout allows retry. Mutation controls reflect the current entity and actual action status. Frontend error handling is described in [testing and troubleshooting](../operations/testing.md#error-handling-and-troubleshooting).

## Frontend implementation references

The current theme sources are [tokens.ts](../../frontend/lib/tokens.ts) and [globals.css](../../frontend/app/globals.css). Components are custom React/Tailwind; charts use Recharts. Integer-paise formatting is shared through [utils.ts](../../frontend/lib/utils.ts) and Amount components. Counts, ratios, severity, and money retain separate display semantics.

Browser routes include the dashboard at / and audit at /audit. See the [product scope](../product/prd.md#scope-and-status) for current limits.
