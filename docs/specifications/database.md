# Database Schema

## 1. Database Design

LedgerMind uses **PostgreSQL** as its primary relational database and **Prisma** as the ORM.

The database is designed around:

- Strong relational integrity
- ACID transactions
- Explicit foreign keys
- Unique constraints
- Indexed operational queries
- Append-only audit records
- Integer-based monetary values

### Global Conventions

- Primary keys: UUID
- Monetary values: integer paise
- Currency: INR for MVP
- Timestamps: UTC
- External provider IDs: strings
- Flexible external payloads: JSONB

---

## 2. Entity Relationship Overview

```text
Merchant
 ├── Users
 ├── Orders
 │    └── Payments
 │         └── Refunds
 └── Settlements
       └── Bank Transactions

Reconciliation Run
 ├── Matches
 └── Exceptions
       ├── Exception Events
       ├── AI Analyses
       └── Actions
              └── Audit Logs

Webhook Events
      │
      ▼
Event Processing
      │
      ▼
Financial Entities
```

## 3. merchants

Stores merchant-level configuration and ownership.

| Column              | Type         | Description                  |
|---------------------|--------------|------------------------------|
| id                  | UUID PK      | Internal merchant ID         |
| name                | VARCHAR      | Merchant name                |
| email               | VARCHAR      | Merchant contact email       |
| razorpay_account_id | VARCHAR      | External Razorpay account ID |
| created_at          | TIMESTAMPTZ  | Creation timestamp           |
| updated_at          | TIMESTAMPTZ  | Last update                  |

## 4. users

Represents merchant operators.

| Column        | Type           | Description       |
|---------------|----------------|-------------------|
| id            | UUID PK        | User ID           |
| merchant_id   | UUID FK        | Owning merchant   |
| name          | VARCHAR        | User name         |
| email         | VARCHAR UNIQUE | Login email       |
| password_hash | VARCHAR        | Password hash     |
| role          | ENUM           | ADMIN, FINANCE, VIEWER |
| created_at    | TIMESTAMPTZ    | Creation timestamp|
| updated_at    | TIMESTAMPTZ    | Last update       |

## 5. orders

Represents the merchant's intent to collect money.

| Column      | Type           | Description                |
|-------------|----------------|----------------------------|
| id          | UUID PK        | Internal ID                |
| order_id    | VARCHAR UNIQUE | Razorpay order ID          |
| merchant_id | UUID FK        | Merchant                   |
| amount      | BIGINT         | Expected amount in paise   |
| currency    | VARCHAR(3)     | INR                        |
| customer_id | VARCHAR        | External customer reference|
| status      | ENUM           | Order state                |
| created_at  | TIMESTAMPTZ    | Creation timestamp         |
| updated_at  | TIMESTAMPTZ    | Last update                |

## 6. payments

Represents an individual payment attempt.

| Column      | Type           | Description             |
|-------------|----------------|-------------------------|
| id          | UUID PK        | Internal ID             |
| payment_id  | VARCHAR UNIQUE | Razorpay payment ID     |
| order_id    | UUID FK        | Related order           |
| amount      | BIGINT         | Payment amount in paise |
| method      | VARCHAR        | Payment method          |
| status      | ENUM           | Payment state           |
| captured_at | TIMESTAMPTZ    | Capture timestamp       |
| created_at  | TIMESTAMPTZ    | Creation timestamp      |
| updated_at  | TIMESTAMPTZ    | Last update             |

## 7. refunds

Represents money returned against a payment.

| Column       | Type           | Description            |
|--------------|----------------|------------------------|
| id           | UUID PK        | Internal ID            |
| refund_id    | VARCHAR UNIQUE | Razorpay refund ID     |
| payment_id   | UUID FK        | Related payment        |
| amount       | BIGINT         | Refund amount in paise |
| status       | ENUM           | Refund state           |
| created_at   | TIMESTAMPTZ    | Creation timestamp     |
| processed_at | TIMESTAMPTZ    | Processing completion  |

## 8. settlements

Represents gateway-to-merchant fund transfers.

| Column          | Type           | Description        |
|-----------------|----------------|--------------------|
| id              | UUID PK        | Internal ID        |
| settlement_id   | VARCHAR UNIQUE | External settlement ID |
| merchant_id     | UUID FK        | Merchant           |
| amount          | BIGINT         | Settlement amount  |
| settlement_date | DATE           | Settlement date    |
| status          | ENUM           | Settlement state   |
| utr             | VARCHAR        | Bank reference     |
| created_at      | TIMESTAMPTZ    | Creation timestamp |

## 9. bank_transactions

Represents transactions imported from the merchant's bank.

| Column           | Type           | Description            |
|------------------|----------------|------------------------|
| id               | UUID PK        | Internal ID            |
| bank_txn_id      | VARCHAR UNIQUE | Bank transaction ID    |
| utr              | VARCHAR        | UTR                    |
| amount           | BIGINT         | Amount in paise        |
| transaction_type | ENUM           | CREDIT, DEBIT          |
| transaction_date | DATE           | Transaction date       |
| description      | TEXT           | Bank description       |
| status           | ENUM           | Bank transaction state |
| settlement_id    | UUID FK NULL   | Matched settlement     |
| created_at       | TIMESTAMPTZ    | Creation timestamp     |

## 10. webhook_events

Stores every received webhook before asynchronous processing.

| Column              | Type           | Description              |
|---------------------|----------------|--------------------------|
| id                  | UUID PK        | Internal ID              |
| event_id            | VARCHAR UNIQUE | Provider event identifier|
| event_type          | VARCHAR        | Event type               |
| payload             | JSONB          | Raw payload              |
| received_at         | TIMESTAMPTZ    | Receive time             |
| signature_verified  | BOOLEAN        | Signature status         |
| processing_status   | ENUM           | Processing state         |
| processing_attempts | INTEGER        | Retry count              |
| processing_error    | TEXT NULL      | Last error               |

## 11. reconciliation_runs

Represents one deterministic reconciliation execution.

| Column          | Type           | Description           |
|-----------------|----------------|-----------------------|
| id              | UUID PK        | Run ID                |
| merchant_id     | UUID FK        | Merchant              |
| status          | ENUM           | IN_PROGRESS, COMPLETED, FAILED |
| started_at      | TIMESTAMPTZ    | Start time            |
| finished_at     | TIMESTAMPTZ NULL | Completion time     |
| total_records   | INTEGER        | Records evaluated     |
| matched_count   | INTEGER        | Successful matches    |
| exception_count | INTEGER        | Exceptions generated  |
| error_message   | TEXT NULL      | Failure reason        |

## 12. reconciliation_matches

Stores deterministic matching decisions.

| Column       | Type        | Description         |
|--------------|-------------|---------------------|
| id           | UUID PK     | Match ID            |
| run_id       | UUID FK     | Reconciliation run  |
| source_type  | ENUM        | Source entity        |
| source_id    | UUID        | Source record        |
| target_type  | ENUM        | Target entity        |
| target_id    | UUID        | Target record        |
| match_score  | INTEGER     | Score from 0–100     |
| match_method | ENUM        | Matching strategy    |
| created_at   | TIMESTAMPTZ | Creation timestamp   |

## 13. exceptions

Represents a reconciliation discrepancy.

| Column            | Type            | Description              |
|-------------------|-----------------|--------------------------|
| id                | UUID PK         | Internal ID              |
| exception_id      | VARCHAR UNIQUE  | Human-readable ID        |
| merchant_id       | UUID FK         | Merchant                 |
| run_id            | UUID FK         | Source reconciliation run |
| type              | ENUM            | Exception category       |
| severity          | ENUM            | CRITICAL, HIGH, MEDIUM, LOW |
| status            | ENUM            | OPEN, INVESTIGATING, RESOLVED, IGNORED |
| expected_amount   | BIGINT NULL     | Expected value           |
| actual_amount     | BIGINT NULL     | Actual value             |
| difference_amount | BIGINT NULL     | Difference               |
| financial_impact  | BIGINT          | Estimated exposure       |
| customer_impact   | ENUM            | HIGH, MEDIUM, LOW        |
| created_at        | TIMESTAMPTZ     | Creation timestamp       |
| updated_at        | TIMESTAMPTZ     | Last update              |
| resolved_at       | TIMESTAMPTZ NULL| Resolution time          |

## 14. exception_events

Stores evidence associated with an exception.

| Column       | Type        | Description         |
|--------------|-------------|---------------------|
| id           | UUID PK     | Event ID            |
| exception_id | UUID FK     | Exception           |
| event_type   | VARCHAR     | Evidence event      |
| entity_type  | VARCHAR     | Related entity      |
| entity_id    | UUID        | Related entity      |
| snapshot     | JSONB       | Evidence snapshot   |
| created_at   | TIMESTAMPTZ | Event timestamp     |

## 15. ai_analyses

Stores AI investigation results separately from the exception itself.

| Column             | Type        | Description           |
|--------------------|-------------|-----------------------|
| id                 | UUID PK     | Analysis ID           |
| exception_id       | UUID FK     | Exception             |
| summary            | TEXT        | Investigation summary |
| likely_cause       | TEXT        | Probable root cause   |
| confidence         | INTEGER     | 0–100                 |
| financial_exposure | BIGINT      | Estimated exposure    |
| customer_impact    | VARCHAR     | Impact assessment     |
| recommended_action | TEXT        | Recommendation        |
| evidence_chain     | JSONB       | Supporting evidence   |
| next_steps         | JSONB       | Resolution steps      |
| model              | VARCHAR     | Model identifier      |
| created_at         | TIMESTAMPTZ | Analysis timestamp    |

## 16. actions

Stores proposed and executed financial actions.

| Column           | Type            | Description             |
|------------------|-----------------|-------------------------|
| id               | UUID PK         | Action ID               |
| exception_id     | UUID FK         | Related exception       |
| action_type      | ENUM            | Action category         |
| status           | ENUM            | Action lifecycle state  |
| parameters       | JSONB           | Action parameters       |
| requested_by     | UUID FK         | Requesting user         |
| approved_by      | UUID FK NULL    | Approving user          |
| approval_required| BOOLEAN         | Approval requirement    |
| approved_at      | TIMESTAMPTZ NULL| Approval timestamp      |
| idempotency_key  | VARCHAR UNIQUE  | Execution key           |
| execution_result | JSONB NULL      | Provider result         |
| failure_reason   | TEXT NULL       | Failure information     |
| created_at       | TIMESTAMPTZ     | Creation timestamp      |
| updated_at       | TIMESTAMPTZ     | Last update             |

## 17. audit_logs

Append-only record of important state changes.

| Column      | Type           | Description      |
|-------------|----------------|------------------|
| id          | UUID PK        | Audit ID         |
| merchant_id | UUID FK        | Merchant         |
| user_id     | UUID FK NULL   | Actor            |
| action      | VARCHAR        | Action performed |
| entity_type | VARCHAR        | Entity category  |
| entity_id   | UUID           | Entity ID        |
| before_state| JSONB          | Previous state   |
| after_state | JSONB          | New state        |
| reason      | TEXT           | Reason           |
| created_at  | TIMESTAMPTZ    | Audit timestamp  |

## 18. Relationships

```text
Merchant
 ├── Users
 ├── Orders
 │    └── Payments
 │         └── Refunds
 └── Settlements
       └── Bank Transactions

Reconciliation Run
 ├── Matches
 └── Exceptions
       ├── Exception Events
       ├── AI Analyses
       └── Actions

Users
 ├── Actions
 └── Audit Logs
```

## 19. Important Constraints

### Unique Constraints
- `orders.order_id`
- `payments.payment_id`
- `refunds.refund_id`
- `settlements.settlement_id`
- `bank_transactions.bank_txn_id`
- `webhook_events.event_id`
- `exceptions.exception_id`
- `actions.idempotency_key`

### Referential Integrity
Foreign keys must be enforced at the database level.

### Monetary Integrity
All monetary fields use integer paise.

No floating-point arithmetic is permitted for financial calculations.

## 20. Indexing Strategy

Important indexes include:

- `orders.merchant_id`
- `payments.order_id`
- `refunds.payment_id`
- `settlements.merchant_id`
- `settlements.utr`
- `bank_transactions.utr`
- `bank_transactions.transaction_date`
- `exceptions.merchant_id`
- `exceptions.status`
- `exceptions.severity`
- `exceptions.created_at`
- `actions.status`
- `audit_logs.entity_id`

Indexes should be added based on actual query patterns and measured performance.

## 21. Data Integrity Principle

The database is treated as the authoritative internal source of truth.

External events may arrive:
- late
- duplicated
- out of order
- with inconsistent states

LedgerMind therefore stores the original event, processes it idempotently, and reconciles the resulting financial state deterministically.