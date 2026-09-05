# Product Requirements Document (PRD)

## 1. Product Overview

**LedgerMind** (AI Finance Controller) is an event-driven payment reconciliation and exception resolution system designed for merchants using payment gateways like Razorpay. It provides a unified view of financial transactions, automatically detects discrepancies, and uses AI to assist in investigation and resolution.

## 2. Goals

- Reduce time to identify and resolve reconciliation exceptions from days to minutes.
- Provide clear explanations and actionable recommendations for every discrepancy.
- Maintain a complete audit trail for compliance.
- Seamlessly integrate with existing Razorpay APIs and bank data sources.
- Offer a user-friendly dashboard for financial operations teams.

## 3. User Personas

- **Finance Manager**: Needs a high-level view of reconciliation health, exceptions, and team workload.
- **Accountant/Reconciliation Specialist**: Investigates specific exceptions, needs detailed transaction timelines and AI suggestions.
- **Business Owner**: Wants to know overall financial health, settlement trends, and risk exposure.
- **Developer/Admin**: Configures integrations, policies, and monitors system health.

## 4. Functional Requirements

### 4.1 Data Ingestion
- Receive webhooks from Razorpay for payment, refund, settlement events.
- Ingest bank transaction data (synthetic or real) via file upload or API.
- Normalize all incoming data into a canonical transaction format.

### 4.2 Reconciliation
- Match transactions across Orders, Payments, Refunds, Settlements, and Bank records.
- Use multiple matching levels: exact IDs, UTR, amount, timestamp, metadata.
- Produce a reconciliation run with matched and unmatched records.
- Generate exceptions for unmatched or mismatched records.

### 4.3 Exception Management
- Categorize exceptions (e.g., PAYMENT_MISSING, SETTLEMENT_AMOUNT_MISMATCH).
- Assign severity based on financial impact, customer impact, age, confidence, and recurrence.
- Provide a queue for operators to view and filter exceptions.

### 4.4 AI Investigation
- For each exception, the AI agent can:
  - Gather related transactions.
  - Compute financial exposure.
  - Provide likely root cause with confidence score.
  - Recommend next steps.
- Expose natural language query interface for ad-hoc analysis.

### 4.5 Action Engine
- Support actions: request refund, create payment link, mark as reviewed, escalate.
- Implement policy engine with approval thresholds.
- Log all actions with before/after state.

**Approval thresholds (authoritative — reference this table rather than duplicating numbers elsewhere):**

| Refund amount        | Approval required            |
|-----------------------|-------------------------------|
| < ₹1,000               | Auto-approved                |
| ₹1,000 – ₹50,000       | Single human approval         |
| > ₹50,000               | Dual approval (two approvers) |

These thresholds are enforced by the Policy Engine (see `05-SYSTEM-ARCHITECTURE.md` Layer 6 and `AGENTS.md`) and are configurable via `AUTO_APPROVE_BELOW_AMOUNT` in `.env`. Non-refund actions (`create_payment_link`, `mark_reviewed`, `escalate`) do not carry a financial exposure and are auto-approved regardless of amount, unless a merchant-specific policy overrides this.

### 4.6 Dashboard
- Display KPIs: total volume, reconciled %, open exceptions, exception trends.
- Exception queue with filters by type, severity, status.
- Detailed exception view with transaction graph, AI analysis, and action buttons.
- AI chat interface for natural language queries.

## 5. Non-Functional Requirements

- **Performance**: Reconciliation of 10,000 transactions should complete in under 5 seconds.
- **Scalability**: System should handle 100+ webhooks per second with horizontal scaling.
- **Reliability**: 99.9% uptime; webhook processing must not lose events.
- **Security**: All data encrypted in transit and at rest; role-based access; webhook signature verification.
- **Auditability**: Every state change logged with user and reason.

## 6. Out of Scope (for MVP)

- Real bank integrations (simulated only).
- Full accounting system.
- Multi-currency support (assume INR).
- Machine learning model training (use pre-trained LLM).

## 7. Technology Stack

| Layer                 | Technology                                             | Why                                            |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| **Frontend**          | Next.js + TypeScript                                    | Fast dashboard development + strong ecosystem  |
| **UI**                | Tailwind CSS + shadcn/ui                                 | Clean fintech-style interface                  |
| **Charts**            | Recharts                                                 | Payment/reconciliation analytics               |
| **Backend**           | Node.js + TypeScript                                     | Same language across the stack                 |
| **API framework**     | NestJS                                                   | Structured architecture for a serious backend  |
| **Database**          | PostgreSQL                                               | Reliable relational model for financial data   |
| **ORM**               | Prisma                                                   | Type-safe DB access                            |
| **Cache / queues**    | Redis + BullMQ                                            | Webhook/event processing and background jobs   |
| **Payments**          | Razorpay Test APIs                                        | Core payment integration                       |
| **Webhooks**          | Razorpay Webhooks                                          | Real-time payment-event ingestion              |
| **AI**                | Groq API API                                          | Finance-controller reasoning + tool calling    |
| **Agent framework**   | Your own tool-calling layer initially                       | More control and easier to explain to judges   |
| **Authentication**    | JWT                                                          | Stateless merchant authentication              |
| **Validation**        | Zod                                                        | Runtime/API validation                         |
| **Testing**           | Jest + Supertest + Playwright                                | Backend + end-to-end testing                   |
| **Containerization**  | Docker + Docker Compose                                      | Reproducible local environment                 |
| **Deployment**        | Vercel (frontend) + Render/Railway/Fly.io (backend/DB)         | Simple buildathon deployment                   |
| **Version control**   | Git + GitHub                                                 | Source control + collaboration                 |

## 8. Success Metrics

- 95% of exceptions correctly categorized.
- AI root-cause accuracy > 85% on synthetic test cases.
- Average exception resolution time reduced by 70%.
- User satisfaction score ≥ 4.5/5 for the AI explanations.
