# LedgerMind Documentation

Welcome to the LedgerMind architecture, design, and operations documentation suite.

---

## 🏛️ Architecture
Core system design, topology, and matching models.

- **[System Architecture](architecture/overview.md)** — Module boundaries, BullMQ worker queues, and deployment topology.
- **[Architecture Diagrams](architecture/diagrams.md)** — Flowcharts, sequence diagrams, and transaction lifecycles.
- **[Reconciliation Engine](architecture/reconciliation.md)** — The 3-way matching ladder, multi-criteria heuristics, and exposure scoring.
- **[Payment State Machines](architecture/state-machines.md)** — Formal state transition rules for payments, orders, and settlements.
- **[Design Concepts](architecture/design-concepts.md)** — Idempotency invariants, integer minor-unit math, and fault isolation principles.

---

## 📋 Specifications
Formal contracts, interfaces, and safety guarantees.

- **[API Specification](specifications/api.md)** — REST API contracts, request/response schemas, and error codes.
- **[Database Schema](specifications/database.md)** — Prisma schema models, indexing strategies, and tenant partitioning.
- **[AI Agent Specification](specifications/ai-agent.md)** — AI Finance Controller tools, system prompt versioning, and policy engine fences.
- **[Security & Multi-Tenancy](specifications/security.md)** — JWT authentication, RBAC authorization, and tenant isolation guards.

---

## 🎯 Product & Requirements
Problem framing, business requirements, and operational workflows.

- **[Problem Statement](product/problem.md)** — Background on financial reconciliation challenges and manual investigation costs.
- **[Product Requirements (PRD)](product/prd.md)** — Core features, persona definitions, and acceptance criteria.
- **[Requirements Matrix](product/requirements.md)** — Functional and non-functional requirements breakdown.
- **[User Flows](product/user-flows.md)** — Finance operator and controller triage journeys.

---

## ⚙️ Operations & Guides
Operational runbooks, quality assurance, and runtime troubleshooting.

- **[Testing & QA Plan](operations/testing.md)** — Unit test coverage, integration tests, and Playwright verification.
- **[Error Handling Taxonomy](operations/error-handling.md)** — Backend exception taxonomy and UI fault states.
- **[Groq AI Setup](operations/groq-setup.md)** — Groq LLaMA-3.3-70b configuration, latency metrics, and API verification.
