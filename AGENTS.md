# AI Agents Specification

This project uses an AI orchestration layer to enhance the deterministic reconciliation engine. The primary AI agent is the **AI Finance Controller**, which operates as an intelligent assistant for financial operations.

## Agent Roles

### 1. AI Finance Controller (Orchestrator)
- **Purpose**: Investigate exceptions, explain discrepancies, recommend actions, and answer natural-language queries.
- **Input**: Structured exception data, transaction details, customer/merchant context.
- **Output**: Human-readable analysis, prioritized recommendations, and function calls to execute approved actions.
- **Tools** (via function calling, implemented as a NestJS service):
  - `get_transaction(transaction_id)`
  - `get_order(order_id)`
  - `get_payment(payment_id)`
  - `get_refund(refund_id)`
  - `get_settlement(settlement_id)`
  - `find_related_transactions(transaction_id)`
  - `get_exception(exception_id)`
  - `get_customer_history(customer_id)`
  - `get_merchant_history(merchant_id)`
  - `calculate_exposure(exception_id)`
  - `create_resolution_plan(exception_id)`
  - `request_refund(payment_id, amount, reason)`
  - `create_payment_link(order_id, amount)`
  - `mark_for_review(exception_id)`

### 2. Policy Engine Agent (Deterministic, not LLM)
- **Purpose**: Enforce business rules for actions (e.g., refund amount limits, approval requirements).
- **Input**: Proposed action from AI, current user role, exception severity.
- **Output**: `allowed` or `denied`, with required approval level.
- **Implementation**: NestJS guard/service integrated with the Action Engine.

### 3. Audit Agent (Logging)
- **Purpose**: Record every AI decision, recommendation, and executed action.
- **Implementation**: Part of the core system, not a separate AI. Uses Prisma to write to `audit_logs`.

## Interaction Flow

```
Exception created
      │
      ▼
AI Finance Controller invoked (get_exception, get_transaction, ...)
      │
      ▼
AI gathers evidence via tools (read-only)
      │
      ▼
AI produces analysis: likely_cause, confidence, exposure, recommended_action
      │
      ▼
AI proposes an action (e.g. request_refund) — not executed yet
      │
      ▼
Policy Engine Agent evaluates: allowed / denied + approval level required
      │
      ▼
Human approver reviews AI recommendation + policy result
      │
      ▼
Action Engine executes (calls Razorpay API) if approved
      │
      ▼
Audit Agent logs actor, reason, before/after state
```

_(Note: expand this into a sequence diagram once the NestJS module boundaries are finalized — see `docs/05-SYSTEM-ARCHITECTURE.md` for the component diagram this flow maps to.)_

## Model Selection

- Primary model: **Google Gemini 3.6 Flash** (or higher), with function calling enabled.
- The tool definitions are provided as Function Declarations to the Gemini API.
- The backend parses the function call requests and executes the corresponding NestJS service methods.
- Responses are formatted as JSON for the frontend.

## Evaluation

The AI agent's performance is evaluated on:
- Accuracy of root-cause identification (against labeled synthetic data)
- Quality of explanations (clarity, relevance)
- Safety of recommendations (no risky actions without approval)
- Response time (target < 2 seconds for simple queries)
