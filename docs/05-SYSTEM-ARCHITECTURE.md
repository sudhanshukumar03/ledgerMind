# System Architecture

## 1. Overview

LedgerMind is an AI-powered financial controller built around a **deterministic reconciliation engine** and an **AI investigation layer**.

The architecture is designed around five principles:

1. **Deterministic financial processing**
2. **Event-driven asynchronous processing**
3. **Human-controlled financial actions**
4. **Strong auditability**
5. **AI-assisted investigation rather than AI-controlled money movement**

The system is implemented as a **modular monolith** for the MVP. NestJS modules provide clear service boundaries without introducing the operational complexity of microservices.

---

## 2. High-Level Architecture

```text
                         ┌──────────────────────────┐
                         │      Razorpay APIs       │
                         └────────────┬─────────────┘
                                      │
                                      │ Webhooks / API
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LedgerMind Backend                        │
│                            NestJS                                │
│                                                                 │
│  ┌─────────────────┐       ┌─────────────────────────────────┐  │
│  │ Webhook Module  │──────▶│        Event Processing         │  │
│  └─────────────────┘       │       BullMQ + Redis             │  │
│                             └───────────────┬─────────────────┘  │
│                                             │                    │
│                                             ▼                    │
│                             ┌───────────────────────────────┐    │
│                             │     Normalization Layer       │    │
│                             └───────────────┬───────────────┘    │
│                                             │                    │
│                                             ▼                    │
│                             ┌───────────────────────────────┐    │
│                             │   Reconciliation Engine       │    │
│                             │                               │    │
│                             │ Match → Score → Classify      │    │
│                             └───────────────┬───────────────┘    │
│                                             │                    │
│                          ┌──────────────────┴─────────────────┐  │
│                          ▼                                    ▼  │
│               ┌───────────────────┐                ┌────────────┐│
│               │ Exception Manager │                │ AI Engine  ││
│               └─────────┬─────────┘                └─────┬──────┘│
│                         │                                │       │
│                         │                                ▼       │
│                         │                       Read-only Tools  │
│                         │                                │       │
│                         ▼                                ▼       │
│               ┌───────────────────┐             ┌──────────────┐│
│               │   Policy Engine   │◀────────────│ AI Proposal  ││
│               └─────────┬─────────┘             └──────────────┘│
│                         │                                        │
│                         ▼                                        │
│               ┌───────────────────┐                             │
│               │   Action Engine   │                             │
│               └─────────┬─────────┘                             │
│                         │                                        │
│                         ▼                                        │
│               ┌───────────────────┐                             │
│               │   Audit Service   │                             │
│               └───────────────────┘                             │
│                                                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                ┌───────────────┴────────────────┐
                ▼                                ▼
       ┌─────────────────┐              ┌─────────────────┐
       │   PostgreSQL    │              │ Redis + BullMQ  │
       │   Prisma ORM    │              │ Job Processing  │
       └─────────────────┘              └─────────────────┘


                         ┌──────────────────────┐
                         │    Next.js UI        │
                         │  Finance Control     │
                         │      Center          │
                         └──────────┬───────────┘
                                    │
                                    │ REST API / WebSocket
                                    ▼
                         ┌──────────────────────┐
                         │   NestJS Backend     │
                         └──────────────────────┘
```

## 3. Architectural Layers

### 3.1 Presentation Layer

**Technology:**
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts

**Responsibilities:**
- Dashboard
- Exception queue
- Transaction investigation
- AI Command Center
- Approval queue
- Reconciliation run history
- Audit information

The frontend does not contain financial business logic. Financial decisions and validations remain on the backend.

### 3.2 API Layer

NestJS controllers expose REST endpoints for:
- Authentication
- Transactions
- Reconciliation
- Exceptions
- AI investigation
- AI chat
- Actions
- Approvals
- Dashboard metrics
- Webhooks

Controllers are intentionally thin. They validate input and delegate business logic to services.

### 3.3 Event Ingestion Layer

The ingestion layer receives:
- Razorpay webhooks
- Bank transaction CSV files
- Mock bank API data
- Future payment-provider integrations

Webhook processing follows:

```text
Receive
   ↓
Verify Signature
   ↓
Persist Raw Event
   ↓
Acknowledge
   ↓
Queue Job
   ↓
Process Asynchronously
```

This prevents slow downstream processing from delaying webhook acknowledgement.

### 3.4 Normalization Layer

Different financial sources use different schemas.

The normalization layer converts them into a canonical internal representation.

```text
Razorpay Payment
        │
        ▼
Canonical Payment
        ▲
        │
Bank Transaction ──▶ Canonical Bank Transaction
```

Normalization ensures the reconciliation engine does not depend on provider-specific payload structures.

### 3.5 Reconciliation Engine

The reconciliation engine is completely deterministic.

**Responsibilities:**
- Candidate discovery
- Record matching
- Match scoring
- Amount comparison
- State comparison
- Duplicate detection
- Exception generation
- Severity classification

The AI model is never responsible for calculating financial differences.

### 3.6 Exception Management

Exceptions represent reconciliation failures that require attention.

Each exception contains:
- Type
- Severity
- Status
- Financial exposure
- Customer impact
- Related transactions
- Evidence timeline
- AI analysis
- Resolution actions

Example lifecycle:

```text
OPEN
 │
 ▼
INVESTIGATING
 │
 ├───────────────┐
 ▼               ▼
RESOLVED       IGNORED
```

### 3.7 AI Finance Controller

The AI layer operates above deterministic financial data.

**It can:**
- Investigate exceptions
- Retrieve related records
- Analyze timelines
- Explain discrepancies
- Estimate likely causes
- Prioritize issues
- Recommend next steps
- Answer natural-language questions

**The AI cannot directly:**
- Modify payment states
- Modify settlement amounts
- Delete financial records
- Execute refunds
- Bypass policy rules

AI-generated actions become proposals that must pass through the Policy Engine.

### 3.8 Policy Engine

The Policy Engine determines whether a proposed financial action is:
- Allowed
- Rejected
- Auto-approved
- Requires approval
- Requires dual approval

```text
AI proposes refund
        ↓
Policy Engine
        │
        ├── Allowed + Auto Approval
        │
        ├── Allowed + Human Approval
        │
        └── Rejected
```

### 3.9 Action Engine

The Action Engine is the only layer responsible for executing financial actions.

**Supported MVP actions:**
- `REFUND`
- `CREATE_PAYMENT_LINK`
- `MARK_REVIEWED`
- `ESCALATE`

Every action has a lifecycle:

```text
PROPOSED
   ↓
PENDING_APPROVAL
   ↓
APPROVED
   ↓
EXECUTING
   ↓
COMPLETED
```

Failure:

```text
EXECUTING
    ↓
FAILED
```

## 4. Asynchronous Processing

Redis + BullMQ handles background work.

**Primary queues:**

| Queue                | Purpose                           |
|----------------------|-----------------------------------|
| webhook-processing   | Process incoming webhook events   |
| reconciliation       | Execute reconciliation jobs       |
| ai-investigation     | Run AI investigations             |
| action-execution     | Execute approved actions          |
| notifications        | Deliver operator notifications    |

**Benefits:**
- Non-blocking APIs
- Retry support
- Exponential backoff
- Dead-letter handling
- Horizontal worker scaling

## 5. Core Event Flow

```text
Razorpay Webhook
       ↓
Signature Verification
       ↓
Raw Event Persistence
       ↓
BullMQ Queue
       ↓
Webhook Worker
       ↓
Normalize Event
       ↓
Update Financial State
       ↓
Trigger Reconciliation
       ↓
Match Records
       ↓
Create Exception
       ↓
AI Investigation
       ↓
Operator Review
       ↓
Policy Validation
       ↓
Approval
       ↓
Action Execution
       ↓
Audit Log
       ↓
New Webhook / Reconciliation
```

## 6. Technology Stack

| Layer             | Technology                 |
|-------------------|----------------------------|
| Frontend          | Next.js + TypeScript       |
| UI                | Tailwind CSS + shadcn/ui   |
| Backend           | NestJS                     |
| ORM               | Prisma                     |
| Database          | PostgreSQL                 |
| Queue             | BullMQ                     |
| Message Broker    | Redis                      |
| AI                | Groq API API          |
| Validation        | Zod / NestJS DTO validation|
| Authentication    | JWT                        |
| Testing           | Jest + Supertest + Playwright |
| Containerization  | Docker                     |

## 7. Deployment Model

### MVP

```text
Vercel
  │
  ▼
Next.js
  │
  ▼
NestJS API
  │
  ├── PostgreSQL
  ├── Redis
  └── BullMQ Workers
```

The MVP intentionally avoids unnecessary distributed infrastructure.

## 8. Key Architectural Decisions

**Decision 1 — Deterministic First**
Financial matching, calculations, state transitions, and policy decisions are implemented using deterministic code.

**Decision 2 — AI Second**
AI provides investigation and reasoning on top of trusted system data.

**Decision 3 — Human-in-the-Loop**
Sensitive financial actions require appropriate approval.

**Decision 4 — Event-Driven Processing**
External events are persisted and processed asynchronously.

**Decision 5 — Modular Monolith**
NestJS modules provide strong boundaries while keeping deployment simple.

**Decision 6 — Audit Everything**
Financial state changes and operator actions are recorded in an append-only audit trail.

## 9. Architectural Goal

LedgerMind follows the principle:

> **Machines reconcile. AI investigates. Policies control. Humans approve.**

This separation provides a system that is intelligent without sacrificing financial correctness, control, or auditability.
