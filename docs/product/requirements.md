# System Requirements

## 1. Functional Requirements

### FR-1: Data Ingestion

- **FR-1.1** – The system must accept Razorpay webhooks via HTTP POST at `/webhooks/razorpay`.
- **FR-1.2** – Webhook payloads must be verified using Razorpay’s HMAC SHA256 signature before processing.
- **FR-1.3** – Raw webhook events must be stored with metadata (received timestamp, signature verification status, processing status).
- **FR-1.4** – Bank transaction data may be ingested from CSV files or a mock API.
- **FR-1.5** – All ingested data must be normalized into a canonical transaction schema with validated fields.

### FR-2: Reconciliation

- **FR-2.1** – The system must match records using multiple criteria in hierarchical order: exact IDs, UTR, amount within time window, and metadata similarity.
- **FR-2.2** – A deterministic scoring function must compute a match score (0–100) for each candidate pair.
- **FR-2.3** – Reconciliation runs may be triggered manually or automatically after new events arrive.
- **FR-2.4** – Each run must produce a set of matched records and a set of exception records.

### FR-3: Exception Management

- **FR-3.1** – Exceptions must be classified into predefined categories (e.g., `PAYMENT_MISSING`, `SETTLEMENT_AMOUNT_MISMATCH`).
- **FR-3.2** – Severity must be automatically assigned (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) based on configurable rules.
- **FR-3.3** – Exceptions must maintain an associated timeline of related events (webhook, bank transaction, etc.).
- **FR-3.4** – Operators must be able to filter exceptions by type, severity, status, and date range.

### FR-4: AI Finance Controller

- **FR-4.1** – The AI must be able to investigate an exception by calling internal tools (read‑only).
- **FR-4.2** – AI output must include: `summary`, `likely_cause`, `confidence`, `financial_exposure`, `customer_impact`, `recommended_action`, `evidence_chain`, and `next_steps`.
- **FR-4.3** – The AI must support natural language queries about transactions, settlements, and exception trends.
- **FR-4.4** – AI‑proposed actions must be validated by the Policy Engine before execution.

### FR-5: Action Engine

- **FR-5.1** – Supported action types: `REFUND`, `CREATE_PAYMENT_LINK`, `MARK_REVIEWED`, `ESCALATE`.
- **FR-5.2** – Each action must require appropriate approval based on amount thresholds and user role.
- **FR-5.3** – All actions must be logged in an audit trail with actor, reason, and before/after state.

### FR-6: Dashboard

- **FR-6.1** – Display key metrics: Total Transaction Volume, Reconciliation Rate, Open Exceptions, Critical Exceptions, Pending Approvals.
- **FR-6.2** – Provide an exception queue with pagination, sorting, and filtering.
- **FR-6.3** – Show a transaction investigation view with related records, AI analysis, and action buttons.
- **FR-6.4** – Include an AI chat interface for natural language queries.

## 2. Non‑Functional Requirements

### NFR-1: Performance

- **NFR-1.1** – Webhook endpoint must acknowledge requests within 200 ms (persistence only; processing happens asynchronously).
- **NFR-1.2** – Reconciliation of 1,000 transactions must complete in under 2 seconds.
- **NFR-1.3** – Dashboard initial load must be under 1 second.

### NFR-2: Reliability

- **NFR-2.1** – Webhook events must be persisted before acknowledgment; no data loss is acceptable.
- **NFR-2.2** – Failed jobs must be retried with exponential backoff and eventually moved to a dead‑letter queue after maximum attempts.

### NFR-3: Security

- **NFR-3.1** – All API endpoints (except webhooks) require JWT authentication.
- **NFR-3.2** – Webhook signature verification is mandatory.
- **NFR-3.3** – Sensitive data (customer IDs, UTRs) must be encrypted at rest.
- **NFR-3.4** – Role‑based access control (Admin, Finance, Viewer) must be enforced.

### NFR-4: Auditability

- **NFR-4.1** – Every state change in core financial entities must be versioned or logged.
- **NFR-4.2** – Audit logs must be immutable (append‑only).

### NFR-5: Maintainability

- **NFR-5.1** – Codebase must follow modular architecture (NestJS modules, Prisma schema, clear service boundaries).
- **NFR-5.2** – All configuration values must be externalized via environment variables.

## 3. Data Requirements

- Amounts are stored as integers (paise) to avoid floating‑point errors.
- All timestamps are in UTC (ISO‑8601).
- External IDs (order_id, payment_id, etc.) are strings as provided by Razorpay.
- Currency is assumed to be INR for the MVP.
