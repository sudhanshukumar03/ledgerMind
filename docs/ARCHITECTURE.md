# LedgerMind — Architecture & Design Flow

Every diagram in this document renders natively on GitHub. Read them in order: the first three establish *what the system is*, the middle four establish *how a transaction becomes a resolved exception*, and the last three cover the data model, the UI flow, and the trust boundaries.

**Contents**

1. [System Architecture](#1-system-architecture)
2. [Module Dependency Graph](#2-module-dependency-graph)
3. [Trust Boundaries & the AI Safety Line](#3-trust-boundaries--the-ai-safety-line)
4. [Webhook Ingestion Sequence](#4-webhook-ingestion-sequence)
5. [The Reconciliation Matching Ladder](#5-the-reconciliation-matching-ladder)
6. [Exception Classification](#6-exception-classification)
7. [AI Investigation → Policy → Approval → Execution](#7-ai-investigation--policy--approval--execution)
8. [Action Lifecycle State Machine](#8-action-lifecycle-state-machine)
9. [Payment State Machine](#9-payment-state-machine)
10. [Data Model](#10-data-model)
11. [Frontend Design Flow](#11-frontend-design-flow)
12. [Design System Reference](#12-design-system-reference)

---

## 1. System Architecture

A NestJS modular monolith with asynchronous work on BullMQ, a PostgreSQL system of record, and a Next.js client. Green is deterministic code, teal is the AI layer, amber is a control gate that a human or a policy must pass.

```mermaid
flowchart TB
    subgraph ext["External Systems — untrusted"]
        RZP["Razorpay API<br/>mocked behind an interface"]
        WHSRC["Razorpay Webhooks"]
        BANKFEED["Bank statement feed<br/>scripts/generate-bank-data.ts"]
        LLM["Gemini API<br/>function calling"]
    end

    subgraph client["Presentation — Vercel"]
        WEB["Next.js 14 App Router"]
        SWR["api-client.ts<br/>axios + JWT interceptor<br/>3s polling"]
        WEB --- SWR
    end

    subgraph apiL["Application — NestJS, base path /api/v1"]
        direction TB
        AUTH["Auth Module<br/>JWT · RBAC · 5-per-min login throttle"]
        WH["Webhook Module<br/>HMAC SHA256 on raw buffer<br/>replay + TTL + idempotency"]
        TXN["Transaction Module<br/>orders · payments · refunds<br/>settlements · bank transactions"]
        RECON["Reconciliation Engine<br/>match → score → classify"]
        EXC["Exception Module<br/>dedup · severity · timeline"]
        AI["AI Controller<br/>14 read-only merchant-scoped tools"]
        POL["Policy Engine<br/>limits · roles · risk"]
        ACT["Action Engine<br/>lifecycle + execution"]
        AUD["Audit Module<br/>correlation_id"]
        DASH["Dashboard Metrics"]
    end

    subgraph data["Data & Async"]
        PG[("PostgreSQL 16<br/>Prisma — system of record")]
        REDIS[("Redis")]
        QN["Queue: normalize"]
        QR["Queue: reconcile"]
        QE["Queue: execute"]
    end

    SWR -->|"Bearer JWT"| AUTH
    SWR --> TXN
    SWR --> EXC
    SWR --> AI
    SWR --> ACT
    SWR --> RECON
    SWR --> DASH

    WHSRC -->|"POST, rawBody"| WH
    BANKFEED --> PG
    AI <-->|"prompt + tool results"| LLM

    WH -->|"1. persist raw"| PG
    WH -->|"2. enqueue"| REDIS
    REDIS --> QN --> TXN
    TXN --> QR --> RECON
    RECON --> EXC
    EXC --> AI
    AI -.->|"proposal, never execution"| POL
    POL --> ACT
    ACT --> QE
    QE -->|"approved only"| RZP
    ACT --> AUD
    RZP -.->|"resulting webhook"| WHSRC

    AUTH --- PG
    TXN --- PG
    RECON --- PG
    EXC --- PG
    POL --- PG
    ACT --- PG
    AUD --- PG
    DASH --- PG

    classDef det fill:#ECFDF5,stroke:#15803D,stroke-width:2px,color:#0F172A
    classDef aic fill:#F0FDFA,stroke:#14B8A6,stroke-width:2px,color:#0F172A
    classDef gate fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#0F172A
    classDef untrusted fill:#FEF2F2,stroke:#B91C1C,stroke-width:2px,color:#0F172A
    class RECON,TXN,EXC det
    class AI aic
    class POL,ACT gate
    class RZP,WHSRC,BANKFEED,LLM untrusted
```

---

## 2. Module Dependency Graph

Nine modules, and the arrows only point one way through the money path. Nothing downstream of the Policy Engine can be reached from the AI module.

```mermaid
flowchart LR
    AUTH["Auth"] --> TXN["Transaction"]
    AUTH --> EXC["Exception"]
    AUTH --> ACT["Action"]
    AUTH --> AIM["AI"]
    WH["Webhook"] --> TXN
    TXN --> RECON["Reconciliation"]
    RECON --> EXC
    EXC --> AIM
    AIM --> POL["Policy"]
    POL --> ACT
    ACT --> AUD["Audit"]
    RECON --> AUD
    EXC --> AUD
    AIM --> AUD

    AIM -. "read-only queries" .-> TXN
    AIM -. "read-only queries" .-> EXC

    classDef aic fill:#F0FDFA,stroke:#14B8A6,stroke-width:2px,color:#0F172A
    classDef gate fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#0F172A
    class AIM aic
    class POL,ACT gate
```

---

## 3. Trust Boundaries & the AI Safety Line

This is the diagram to point at when someone asks "what stops the AI from issuing a refund?" The answer is that there is no edge from the AI zone to the execution zone. Not a disallowed edge — an absent one.

```mermaid
flowchart TB
    subgraph zoneU["ZONE 0 — Untrusted input"]
        U1["Webhook payloads"]
        U2["Bank descriptions<br/>contains a prompt-injection canary"]
        U3["Client requests"]
        U4["LLM output"]
    end

    subgraph zoneR["ZONE 1 — Read-only (AI may enter)"]
        R1["Query orders / payments / refunds"]
        R2["Query settlements / bank txns"]
        R3["Query exceptions + timeline"]
        R4["Compute nothing financial"]
    end

    subgraph zoneP["ZONE 2 — Proposal (AI may write here, and only here)"]
        P1["ai_analyses row<br/>root cause · confidence · tool_calls"]
        P2["actions row at status PROPOSED"]
    end

    subgraph zoneG["ZONE 3 — Control gates (no AI access)"]
        G1["Policy Engine evaluation"]
        G2["Human approval — ADMIN role"]
    end

    subgraph zoneX["ZONE 4 — Execution (no AI access)"]
        X1["Action Engine"]
        X2["Razorpay write calls"]
        X3["Financial state mutation"]
    end

    U1 -->|"HMAC verified<br/>before parse"| zoneR
    U3 -->|"JWT + RBAC<br/>merchantId from token"| zoneR
    U2 -->|"treated as data,<br/>never as instruction"| zoneR
    U4 -->|"schema-validated"| zoneP

    zoneR --> zoneP
    zoneP --> zoneG
    zoneG --> zoneX

    zoneR x--x zoneX
    zoneP x--x zoneX

    classDef untrusted fill:#FEF2F2,stroke:#B91C1C,stroke-width:2px,color:#0F172A
    classDef ro fill:#F0FDFA,stroke:#14B8A6,stroke-width:2px,color:#0F172A
    classDef gate fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#0F172A
    classDef exec fill:#ECFDF5,stroke:#15803D,stroke-width:3px,color:#0F172A
    class U1,U2,U3,U4 untrusted
    class R1,R2,R3,R4 ro
    class G1,G2 gate
    class X1,X2,X3 exec
```

---

## 4. Webhook Ingestion Sequence

The ordering here is deliberate and not negotiable: verify on the **unparsed buffer**, persist the raw event **before** any processing, return `200` **before** doing work. If the worker crashes, the event is already durable and replayable.

```mermaid
sequenceDiagram
    autonumber
    participant RZP as Razorpay
    participant WH as Webhook Controller
    participant DB as PostgreSQL
    participant Q as BullMQ
    participant W as Worker
    participant RC as Reconciliation Engine

    RZP->>WH: POST /api/v1/webhooks/razorpay (raw body)
    WH->>WH: HMAC SHA256 over the unparsed buffer
    alt signature invalid
        WH-->>RZP: 401 Unauthorized
    else timestamp older than TTL
        WH-->>RZP: 400 Stale event rejected
    else valid
        WH->>DB: INSERT webhook_events (event_id UNIQUE, correlation_id)
        alt event_id already exists
            DB-->>WH: unique violation
            WH-->>RZP: 200 OK (idempotent no-op)
        else new event
            WH->>Q: enqueue normalize job
            WH-->>RZP: 200 OK
            Q->>W: process
            W->>DB: normalize + updateMany to update financial state
            Note over W,DB: updateMany, not update — guards against<br/>concurrent webhook races on the same row
            W->>Q: enqueue reconcile job
            Q->>RC: reconcile affected records
            RC->>DB: write matches, or upsert exception on dedup_key
        end
    end
```

---

## 5. The Reconciliation Matching Ladder

Three levels, tried in order, most-certain first. The buildathon build stops at level 3 — fuzzy metadata matching was cut. Every level is pure integer arithmetic on paise.

```mermaid
flowchart TB
    START["Unreconciled record<br/>payment · settlement · bank txn"] --> L1

    L1{"LEVEL 1<br/>Exact ID match?<br/>order_id · payment_id · refund_id"}
    L1 -->|"match"| MATCHED["MATCHED<br/>confidence 1.00"]
    L1 -->|"no"| L2

    L2{"LEVEL 2<br/>UTR match?<br/>bank UTR ↔ settlement UTR"}
    L2 -->|"match"| MATCHED2["MATCHED<br/>confidence 0.95"]
    L2 -->|"no"| L3

    L3{"LEVEL 3<br/>Amount equal AND<br/>timestamps within window?"}
    L3 -->|"exactly one candidate"| MATCHED3["MATCHED<br/>confidence 0.80<br/>one-to-one binding enforced"]
    L3 -->|"several candidates"| AMBIG["Ambiguous —<br/>closest timestamp wins,<br/>rest stay unmatched"]
    L3 -->|"none"| UNMATCHED["UNMATCHED"]

    AMBIG --> MATCHED3
    UNMATCHED --> CLASSIFY["Classify as exception<br/>see diagram 6"]

    MATCHED --> SCORE
    MATCHED2 --> SCORE
    MATCHED3 --> SCORE
    SCORE["Score exposure<br/>abs difference in paise,<br/>severity thresholds in rupees"]
    SCORE --> DELTA{"Amounts identical?"}
    DELTA -->|"yes"| DONE["Reconciled ✓"]
    DELTA -->|"no"| CLASSIFY

    classDef ok fill:#ECFDF5,stroke:#15803D,stroke-width:2px,color:#0F172A
    classDef bad fill:#FEF2F2,stroke:#B91C1C,stroke-width:2px,color:#0F172A
    class MATCHED,MATCHED2,MATCHED3,DONE ok
    class UNMATCHED,CLASSIFY bad
```

> **Two bugs already fixed here, don't reintroduce them:** severity thresholds compare **rupees**, not paise (a ₹100 threshold against a paise value fires on everything); and settlement/bank matching is **one-to-one with time proximity**, so a single bank credit cannot satisfy three settlements at once.

---

## 6. Exception Classification

Ten types are modelled in the schema. Four detectors are active in the buildathon build — marked ✅ below — chosen because they carry the demo and cover the highest-frequency real-world mismatches.

```mermaid
flowchart TB
    IN["Unexplained record or delta"] --> Q1{"What is missing<br/>or disagreeing?"}

    Q1 -->|"Order exists, no payment"| E1["PAYMENT_MISSING"]
    Q1 -->|"Order amount ≠ payment amount"| E2["ORDER_PAYMENT_MISMATCH"]
    Q1 -->|"Gateway status ≠ bank reality"| E3["BANK_PAYMENT_MISMATCH ✅"]
    Q1 -->|"Two captures, one order"| E4["DUPLICATE_PAYMENT ✅"]
    Q1 -->|"Refund amount disagrees"| E5["REFUND_MISMATCH"]
    Q1 -->|"Refund past SLA, no debit"| E6["REFUND_DELAY"]
    Q1 -->|"Payments captured, no settlement"| E7["SETTLEMENT_MISSING ✅"]
    Q1 -->|"Settlement ≠ sum of payments"| E8["SETTLEMENT_AMOUNT_MISMATCH ✅"]
    Q1 -->|"Bank line matches nothing"| E9["BANK_MISMATCH"]
    Q1 -->|"None of the above"| E10["UNKNOWN_EXCEPTION"]

    E1 --> DEDUP
    E2 --> DEDUP
    E3 --> DEDUP
    E4 --> DEDUP
    E5 --> DEDUP
    E6 --> DEDUP
    E7 --> DEDUP
    E8 --> DEDUP
    E9 --> DEDUP
    E10 --> DEDUP

    DEDUP["Build deterministic dedup_key<br/>type + entity ids + period"]
    DEDUP --> UPSERT{"dedup_key<br/>already exists?"}
    UPSERT -->|"yes"| APPEND["Append exception_event —<br/>no duplicate exception"]
    UPSERT -->|"no"| CREATE["Create exception"]
    CREATE --> SEV["Severity from exposure in rupees<br/>CRITICAL · HIGH · MEDIUM · LOW"]
    SEV --> QUEUE["Surfaces in Needs Attention,<br/>sorted by severity"]

    classDef active fill:#F0FDFA,stroke:#14B8A6,stroke-width:2px,color:#0F172A
    class E3,E4,E7,E8 active
```

---

## 7. AI Investigation → Policy → Approval → Execution

The critical read of this diagram: the AI's last act is writing a **proposal row**. Everything after that happens in modules the AI cannot call.

```mermaid
sequenceDiagram
    autonumber
    actor OP as Operator · FINANCE
    participant UI as Next.js UI
    participant API as NestJS API
    participant AI as AI Controller
    participant T as Read-only tools · 14
    participant LLM as Gemini
    participant POL as Policy Engine
    actor ADM as Approver · ADMIN
    participant ACT as Action Engine
    participant RZP as Razorpay
    participant AUD as Audit Log

    OP->>UI: Open exception, click Investigate
    UI->>API: POST /exceptions/:id/investigate
    API->>AI: investigate(exceptionId, merchantId from JWT)

    loop tool-calling loop
        AI->>LLM: prompt + tool schemas (prompt_version pinned)
        LLM-->>AI: tool_call request
        AI->>T: execute — scoped to merchantId, read-only
        T-->>AI: rows
        Note over AI,T: Bank descriptions are passed as data.<br/>The injection canary is ignored.
    end

    LLM-->>AI: root cause + confidence + recommended action
    AI->>API: persist ai_analyses (tool_calls, prompt_version)
    AI->>AUD: log analysis, correlation_id
    API-->>UI: analysis payload
    UI-->>OP: Render analysis — never regenerate it client-side

    OP->>UI: Accept recommendation
    UI->>API: POST /actions (idempotency_key)
    API->>POL: evaluate(proposal, role, limits, exposure)

    alt policy blocks
        POL-->>API: BLOCKED with reason
        API->>AUD: log rejection
        API-->>UI: 403 with policy reason
    else policy allows
        POL-->>API: PENDING_APPROVAL
        API->>AUD: log proposal
        ADM->>UI: Review pending approval
        alt rejected
            ADM->>API: POST /actions/:id/reject
            API->>AUD: log rejection
        else approved
            ADM->>API: POST /actions/:id/approve
            API->>ACT: execute (APPROVED → EXECUTING)
            ACT->>ACT: re-validate amount against current state
            ACT->>RZP: refund / escalate / mark reviewed
            RZP-->>ACT: result
            ACT->>AUD: log execution, COMPLETED or FAILED
            RZP-->>API: resulting webhook
            API->>API: re-reconcile → exception auto-resolves
        end
    end
```

---

## 8. Action Lifecycle State Machine

No state is skippable. The `idempotency_key` unique constraint means a retried proposal cannot become a second action.

```mermaid
stateDiagram-v2
    [*] --> PROPOSED : AI or operator proposes
    PROPOSED --> PENDING_APPROVAL : Policy Engine allows
    PROPOSED --> REJECTED : Policy Engine blocks
    PENDING_APPROVAL --> APPROVED : ADMIN approves
    PENDING_APPROVAL --> REJECTED : approver rejects
    APPROVED --> EXECUTING : Action Engine picks up
    EXECUTING --> COMPLETED : provider confirms
    EXECUTING --> FAILED : provider error or validation failure
    FAILED --> PENDING_APPROVAL : re-proposed with a new idempotency_key
    COMPLETED --> [*]
    REJECTED --> [*]

    note right of PROPOSED
        MVP action types:
        REFUND, MARK_REVIEWED, ESCALATE
        CREATE_PAYMENT_LINK is in the
        full spec, cut from the 48h build
    end note

    note right of EXECUTING
        Amount is re-validated here
        against live state before any
        provider call is made.
    end note
```

---

## 9. Payment State Machine

The gateway's view of a payment. Exceptions arise precisely when the bank disagrees with the state shown here.

```mermaid
stateDiagram-v2
    [*] --> CREATED : order placed
    CREATED --> AUTHORIZED : customer authorizes
    CREATED --> FAILED : authorization declined
    AUTHORIZED --> CAPTURED : merchant captures
    AUTHORIZED --> FAILED : capture fails
    AUTHORIZED --> VOIDED : authorization released
    CAPTURED --> REFUNDED : full refund
    CAPTURED --> PARTIALLY_REFUNDED : partial refund
    PARTIALLY_REFUNDED --> REFUNDED : remainder refunded
    CAPTURED --> SETTLED : included in a settlement
    REFUNDED --> [*]
    SETTLED --> [*]
    VOIDED --> [*]
    FAILED --> [*]

    note right of FAILED
        The demo spine lives here:
        gateway says FAILED, the bank
        shows a ₹50,000 CREDIT under
        UTR-DEMO-001 → BANK_PAYMENT_MISMATCH
    end note
```

---

## 10. Data Model

All monetary columns are `BIGINT` paise. `merchant_id` is denormalized onto the hot tables so every query and every AI tool can be tenant-scoped with a single predicate.

```mermaid
erDiagram
    MERCHANT ||--o{ USER : employs
    MERCHANT ||--o{ ORDER : owns
    MERCHANT ||--o{ PAYMENT : owns
    MERCHANT ||--o{ REFUND : owns
    MERCHANT ||--o{ SETTLEMENT : owns
    MERCHANT ||--o{ BANK_TRANSACTION : owns
    MERCHANT ||--o{ EXCEPTION : owns
    MERCHANT ||--o{ ACTION : owns

    ORDER ||--o{ PAYMENT : "paid by"
    PAYMENT ||--o{ REFUND : "refunded by"
    SETTLEMENT ||--o{ PAYMENT : "settles"
    SETTLEMENT |o--o| BANK_TRANSACTION : "matched one-to-one via UTR"

    EXCEPTION ||--o{ EXCEPTION_EVENT : "timeline, sorted by occurred_at"
    EXCEPTION ||--o{ AI_ANALYSIS : "investigated by"
    EXCEPTION ||--o{ ACTION : "remediated by"
    ACTION ||--o{ AUDIT_LOG : "produces"
    AI_ANALYSIS ||--o{ AUDIT_LOG : "produces"

    RECONCILIATION_RUN ||--o{ EXCEPTION : "detects"
    WEBHOOK_EVENT ||--o{ AUDIT_LOG : "correlates via correlation_id"

    MERCHANT {
        uuid id PK
        string name
    }
    USER {
        uuid id PK
        uuid merchant_id FK
        string email
        enum role "ADMIN FINANCE VIEWER"
    }
    PAYMENT {
        uuid id PK
        uuid merchant_id FK "denormalized"
        string razorpay_payment_id UK
        bigint amount_paise
        enum status
        timestamp captured_at
    }
    BANK_TRANSACTION {
        uuid id PK
        uuid merchant_id FK "denormalized"
        string utr
        bigint amount_paise
        enum direction "CREDIT DEBIT"
        string description "untrusted text"
        timestamp value_date
    }
    EXCEPTION {
        uuid id PK
        uuid merchant_id FK "denormalized"
        enum type
        enum severity
        enum status
        bigint exposure_paise
        string dedup_key UK
    }
    AI_ANALYSIS {
        uuid id PK
        uuid exception_id FK
        text root_cause
        float confidence
        string prompt_version
        jsonb tool_calls
    }
    ACTION {
        uuid id PK
        uuid merchant_id FK "denormalized"
        enum action_type
        enum status
        bigint amount_paise
        string idempotency_key UK
        uuid approved_by FK
    }
    WEBHOOK_EVENT {
        uuid id PK
        string event_id UK "idempotency"
        jsonb raw_payload
        string correlation_id
        timestamp received_at
    }
    AUDIT_LOG {
        uuid id PK
        string actor
        string entity_type
        string action
        jsonb before_after
        string correlation_id
    }
```

---

## 11. Frontend Design Flow

Seven routes. The operator's path through them is a funnel: notice → triage → understand → act. The dashboard's only job is to make the next click obvious.

```mermaid
flowchart TB
    LOGIN["/login<br/>seeded credentials, 5-per-min throttle"] -->|"JWT to localStorage"| DASH

    DASH["/dashboard<br/>KPI row · Needs Attention · recent activity"]

    DASH -->|"Run Reconciliation"| RECON["/reconciliation<br/>run list + trigger, 3s polling"]
    RECON -->|"run completes,<br/>new exceptions"| DASH

    DASH -->|"click a queue row"| DETAIL
    DASH -->|"View all"| LIST["/exceptions<br/>filters: type · severity · status<br/>paginated, limit ≤ 100"]
    LIST --> DETAIL

    DETAIL["/exceptions/:id<br/>two-column: transaction graph left,<br/>AI analysis panel right, timeline below"]

    DETAIL -->|"Investigate"| AIRUN["AI analysis renders<br/>root cause · confidence · evidence"]
    AIRUN --> DETAIL
    DETAIL -->|"Propose action"| ACTIONS
    DETAIL -->|"Mark Reviewed / Escalate"| ACTIONS

    ACTIONS["/actions<br/>pending approvals, approve / reject"]
    ACTIONS -->|"ADMIN approves → executes"| DETAIL
    ACTIONS -->|"resulting webhook re-reconciles"| DASH

    DASH --> CHAT["/ai-controller<br/>chat with tool-call indicators"]
    CHAT -->|"cites an exception"| DETAIL

    classDef entry fill:#F0FDFA,stroke:#14B8A6,stroke-width:2px,color:#0F172A
    classDef gate fill:#FEF3C7,stroke:#B45309,stroke-width:2px,color:#0F172A
    class DASH entry
    class ACTIONS gate
```

### State handling every page owes you

Per [12-ERROR-HANDLING.md](12-ERROR-HANDLING.md) §5, each data surface needs four states, not one:

```mermaid
flowchart LR
    MOUNT["Route mounts"] --> FETCH["api-client request<br/>JWT interceptor attaches token"]
    FETCH --> LOADING["Loading —<br/>shadcn Skeleton matching<br/>the real layout"]
    LOADING --> R{"Response"}
    R -->|"200, rows"| DATA["Data"]
    R -->|"200, no rows"| EMPTY["Empty —<br/>'Nothing needs attention'<br/>is a success state, style it as one"]
    R -->|"401"| RELOGIN["Clear token,<br/>redirect to /login"]
    R -->|"4xx / 5xx"| ERR["Error — reason +<br/>retry affordance"]
    DATA -->|"3s poll"| FETCH

    classDef ok fill:#ECFDF5,stroke:#15803D,stroke-width:2px,color:#0F172A
    classDef bad fill:#FEF2F2,stroke:#B91C1C,stroke-width:2px,color:#0F172A
    class DATA,EMPTY ok
    class ERR,RELOGIN bad
```

---

## 12. Design System Reference

**"Refined Fintech Minimalism"** — a dense, quiet interface where colour is reserved for severity and nothing else. If everything is emphasized, the ₹50,000 exception looks the same as the ₹12 one.

| Token | Hex | Used for |
| --- | --- | --- |
| Background | `#F8FAFC` | App canvas |
| Surface | `#FFFFFF` | Cards, table surfaces, drawer |
| Primary accent | `#14B8A6` | Brand teal — primary actions, active nav, focus rings |
| Text primary | `#0F172A` | Headings, figures |
| Text secondary | `#475569` | Labels, metadata, table headers |
| Critical | `#B91C1C` | Critical severity, failures |
| Warning | `#B45309` | High severity, pending approval |
| Success | `#15803D` | Reconciled, completed, resolved |
| Info | `#1D4ED8` | Informational badges, in-progress runs |

> **Brand note:** the accent is **teal `#14B8A6`**, confirmed against the logo (padlock circle split into teal ledger bars and a blue circuit-brain, green check, wordmark "Ledger" in silver and "Mind" in teal on dark navy). Earlier drafts of the frontend README used `#1D4ED8` as the primary accent — that value is stale and demoted to an info colour here. The logo currently exists only as a dark-background raster lockup, so it cannot sit directly on the `#F8FAFC` canvas; use it in the dark sidebar or on a navy plate until a light-mode variant exists.

**Typography** — Inter or Manrope. Every numeric column uses `tabular-nums` so digits align vertically; misaligned money columns are unreadable at a glance.

**Layout** — persistent left sidebar plus topbar, dense tables with status badges, and a two-column detail view (graph left, AI panel right). Components come from shadcn/ui: `Card`, `Table`, `Badge`, `Button`, `Dialog`, `Input`, `DropdownMenu`, `Progress`, `Skeleton`. Charts are Recharts — an area chart for reconciliation rate over time, a bar chart for exception types by volume.

**Money formatting** — one shared utility, everywhere, no exceptions:

```ts
// lib/money.ts — the only place paise become rupees
export function formatPaise(paise: string): string {
  const n = BigInt(paise);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const rupees = abs / 100n;
  const fraction = abs % 100n;
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${fraction.toString().padStart(2, "0")}`;
}
```
