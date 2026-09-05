# System Design Concepts & Decisions

## 1. Architectural Philosophy

LedgerMind applies practical distributed-system principles to financial reconciliation without introducing unnecessary infrastructure.

The architecture is built around:

```text
Events
  ↓
Reliable Processing
  ↓
Deterministic Reconciliation
  ↓
Exception Management
  ↓
AI Investigation
  ↓
Policy
  ↓
Human Approval
  ↓
Controlled Action
  ↓
Audit
```

## 2. Event-Driven Architecture

LedgerMind is event-driven because financial systems change asynchronously.

Important events include:
- Razorpay webhooks
- Bank transaction ingestion
- Payment state changes
- Refund state changes
- Settlement updates
- Action results

Instead of tightly coupling every operation:

```text
Webhook → Reconciliation → AI → Action
```

the system uses asynchronous boundaries:

```text
Webhook
  ↓
Queue
  ↓
Worker
  ↓
Reconciliation
  ↓
Queue
  ↓
AI Investigation
```

### Benefits
- Loose coupling
- Better fault isolation
- Retry support
- Horizontal worker scaling
- Faster webhook acknowledgement

## 3. Asynchronous Processing

Long-running work should not block HTTP requests.

Examples:
- Reconciliation
- AI investigation
- Action execution
- Notifications

The request should enqueue work and return quickly.

```text
HTTP Request
     ↓
Persist
     ↓
Queue
     ↓
202 Accepted
```

The worker completes the operation asynchronously.

## 4. Idempotency

Financial systems must tolerate duplicate requests and events.

LedgerMind uses idempotency at multiple levels.

### Webhooks
```text
event_id UNIQUE
```

### Actions
```text
idempotency_key UNIQUE
```

### Reconciliation
Deterministic exception keys prevent duplicate exceptions.

The principle is:

> At-least-once delivery + idempotent processing is safer and more practical than assuming exactly-once delivery.

## 5. Exactly-Once vs At-Least-Once

Distributed systems cannot safely assume that a message is delivered exactly once.

LedgerMind therefore assumes:

> Messages may arrive more than once.

The system handles this through idempotent consumers.

Example:
```text
Webhook A
Webhook A again
Webhook A again
      ↓
Same event_id
      ↓
One logical state change
```

## 6. Transactional Boundaries

Financial state changes should be performed atomically where possible.

Example:
```text
BEGIN TRANSACTION

Update payment
Create state-change record
Create reconciliation trigger/outbox event

COMMIT
```

Either the transaction succeeds or the database rolls it back.

## 7. Transactional Outbox

A future production implementation should use the Transactional Outbox Pattern for critical event publication.

Problem:
```text
Database Update
      ↓
COMMIT
      ↓
Queue Publish
      ↓
FAIL
```

Now the database changed but the event was never published.

Outbox solution:
```text
BEGIN TRANSACTION

Update Financial State
Create Outbox Event

COMMIT
       ↓
Outbox Publisher
       ↓
Queue
```

The outbox event is persisted together with the financial state.

## 8. Eventual Consistency

LedgerMind intentionally accepts eventual consistency between external systems.

Example:
```text
Payment Captured
      ↓
Settlement later
      ↓
Bank credit later
```

At one moment, the records may disagree.

That does not necessarily mean the transaction is permanently incorrect.

The reconciliation engine therefore distinguishes between:
- Temporary absence
- Genuine mismatch

Time windows and state rules determine when an exception should be created.

## 9. Strong Consistency

Strong consistency is used inside critical database transactions.

For example:
```text
Approve Action
+
Update Action State
+
Write Audit Record
```

These changes should occur atomically.

## 10. Concurrency

Multiple events may arrive simultaneously.

Example:
```text
payment.captured
payment.failed
payment.captured
```

Potential race conditions must be handled through:
- Database transactions
- Unique constraints
- Valid state-transition checks
- Optimistic locking where required
- Row-level locking for critical operations

## 11. Race Condition Example

Two workers attempt to process the same payment.

```text
Worker A ──┐
           ├── Payment PAY-123
Worker B ──┘
```

Both must not independently create duplicate financial records.

The system uses:
```text
Unique payment_id
+
Idempotent processing
+
Transaction
```

to guarantee one logical payment record.

## 12. Database as Source of Truth

PostgreSQL is the authoritative internal source of truth.

Redis is not the financial source of truth.

AI is not the financial source of truth.

Frontend state is not the financial source of truth.

```text
PostgreSQL
     ↑
Domain Services
     ↑
API / Workers / Actions
```

## 13. Caching

Caching may be used for:
- Dashboard metrics
- Frequently accessed configuration
- Read-heavy queries

However:

> Never rely on stale cache data for irreversible financial decisions.

Financial actions must read authoritative state.

## 14. Queue-Based Scaling

Workers can scale horizontally.

```text
                 Redis
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       Worker 1 Worker 2 Worker 3
```

This allows more reconciliation or AI jobs to be processed concurrently.

## 15. Backpressure

If incoming events exceed processing capacity:

```text
Incoming Events
      ↓
Queue grows
      ↓
Workers process gradually
```

The queue acts as a buffer.

Monitoring should track:
- Queue depth
- Processing latency
- Failure rate
- Retry count

## 16. Retry Strategy

Transient failures should be retried.

Example:
```text
Attempt 1
   ↓
Wait
   ↓
Attempt 2
   ↓
Wait longer
   ↓
Attempt 3
```

Exponential backoff reduces pressure on failing dependencies.

Permanent failures move to failed/dead-letter handling.

## 17. Dead-Letter Queue

After maximum retries:

```text
Failed Job
    ↓
DLQ
    ↓
Operator
    ↓
Investigate
    ↓
Retry / Correct / Ignore
```

The system must retain enough context to understand why the job failed.

## 18. Circuit Breaker

For external services such as Razorpay or Groq, a circuit breaker can prevent cascading failures.

Conceptually:
```text
Healthy
  ↓
Failures increase
  ↓
OPEN
  ↓
Stop requests temporarily
  ↓
Recovery test
  ↓
CLOSED
```

This is more important at production scale than in the MVP.

## 19. Modular Monolith vs Microservices

LedgerMind intentionally uses a modular monolith.

```text
NestJS
 ├── AuthModule
 ├── WebhookModule
 ├── TransactionModule
 ├── ReconciliationModule
 ├── ExceptionModule
 ├── AIModule
 ├── PolicyModule
 ├── ActionModule
 └── AuditModule
```

### Why?

Microservices would introduce:
- Network communication
- Distributed transactions
- Service discovery
- More deployment complexity
- More observability requirements

The MVP does not need that overhead.

The module boundaries can later become service boundaries if scale requires it.

## 20. Kafka vs BullMQ

LedgerMind uses Redis + BullMQ for the MVP.

### Why not Kafka?

Kafka is excellent for:
- Very high event throughput
- Durable event streaming
- Long-lived event replay
- Large distributed architectures

But LedgerMind's MVP primarily needs:
- Background jobs
- Retries
- Delayed jobs
- Worker processing
- Dead-letter handling

BullMQ provides these capabilities with significantly less infrastructure.

### Future
Kafka could become appropriate if LedgerMind evolves into a large multi-service event platform.

## 21. CAP-Theorem Perspective

LedgerMind operates across multiple systems.

For external financial systems, immediate global consistency cannot be assumed.

Therefore the architecture favors:
- Availability
- Eventual Consistency
- Deterministic Reconciliation

while maintaining strong consistency inside critical local transactions.

## 22. Back-of-the-Envelope Scale

For an MVP:
- 1 merchant
- 1,000–10,000 transactions/day

A PostgreSQL + Redis architecture is more than sufficient.

At larger scale:
```text
Load Balancer
      ↓
Multiple API Instances
      ↓
Multiple Workers
      ↓
PostgreSQL
      +
Redis
```

Potential future additions:
- Read replicas
- Connection pooling
- Partitioning
- Kafka
- Object storage
- Dedicated analytics warehouse

These are deliberately not required for the buildathon MVP.

## 23. Financial Invariants

The system enforces rules such as:
- Refunds ≤ Captured Amount
- Refund requires captured payment
- Duplicate webhook ≠ duplicate state transition
- Unauthorized user ≠ executable action

These are enforced through application logic and database constraints.

## 24. Human-in-the-Loop

LedgerMind is designed around controlled automation.

```text
AI
 ↓
Recommendation
 ↓
Policy
 ↓
Approval
 ↓
Action
```

The higher the financial risk, the stronger the approval requirement.

## 25. Explainability

Every important AI recommendation should have an evidence chain.

Example:
```text
Evidence 1
Payment = FAILED

Evidence 2
Bank = ₹50,000 CREDIT

Evidence 3
UTR = matching reference

Conclusion
Payment state inconsistency likely exists.
```

This allows an operator to verify the AI's reasoning.

## 26. Auditability

Audit records provide a historical trail:
- WHO
- WHAT
- WHEN
- WHY
- BEFORE
- AFTER

Example:
```text
Actor: Finance Admin
Action: APPROVE_REFUND
Exception: EXC-1024
Amount: ₹50,000
Reason: Duplicate charge verified
Timestamp: ...
```

## 27. Security by Design

Security is not a separate feature.

It exists throughout the architecture:

```text
Authentication
      ↓
Authorization
      ↓
Merchant Isolation
      ↓
Policy
      ↓
Approval
      ↓
Execution
      ↓
Audit
```

## 28. What LedgerMind Intentionally Avoids

**Distributed Transactions / 2PC** — Too complex for the MVP.

**Microservices** — Unnecessary operational overhead.

**Kafka** — Not required for MVP workload.

**Blockchain** — No requirement for a blockchain-based financial ledger.

**AI-Controlled Money Movement** — Unsafe and unnecessary.

**Floating-Point Money** — Financial amounts use integer paise.

**Blind Retries** — Financial mutations require idempotency.

## 29. Core Design Principles

LedgerMind can be summarized by these principles:

**1. Deterministic First**
Financial truth comes from code and data.

**2. Event-Driven**
External changes are processed asynchronously.

**3. Idempotent**
Duplicate events must not create duplicate financial effects.

**4. Strong Where It Matters**
Critical local state changes use database transactions.

**5. Eventually Consistent Across Systems**
External financial systems naturally converge over time.

**6. AI-Assisted**
AI investigates and explains rather than becoming the source of truth.

**7. Human-Controlled**
Sensitive actions require policy and approval.

**8. Auditable**
Important decisions and state changes are traceable.

**9. Modular**
Clear boundaries make the system easier to evolve.

**10. Simple by Default**
Use the simplest architecture that reliably solves the problem.

## 30. Final Architecture Principle

> **Deterministic systems establish financial truth; event-driven infrastructure keeps that truth synchronized; AI investigates and explains discrepancies; policy controls actions; humans retain authority; and audit logs preserve the complete history.**