
# Groq AI Controller Setup & Operations Guide

## 1. Overview

LedgerMind leverages the **Groq LPU™ Inference Engine** to power the **AI Finance Controller**. Groq provides ultra-low-latency structured reasoning and OpenAI-compatible function calling, enabling near-instant discrepancy investigations across large multi-entity ledgers.

---

## 2. Model Selection & Configuration

### Primary Model
- **Model Identifier**: `llama-3.3-70b-versatile`
- **Context Window**: 128k tokens
- **Inference Speed**: ~300–500 tokens/second
- **Interface**: OpenAI-compatible endpoint (`https://api.groq.com/openai/v1`) with native function calling

### Environment Configuration
The backend reads configuration from `backend/.env` (or the root `.env` for Docker):

```env
# Groq API Configuration
GROQ_API_KEY=gsk_your_api_key_here
AI_MODEL=llama-3.3-70b-versatile
```

Supported model overrides via `AI_MODEL`:
- `llama-3.3-70b-versatile` (Default & Recommended)
- `llama-3.1-8b-instant` (High speed, lower reasoning capacity)

---

## 3. Investigation & Tool-Calling Pipeline

When an operator investigates an exception, the AI Controller executes the following sequence:

```text
Exception Selected
       │
       ▼
AI Controller Invoked (NestJS AiService)
       │
       ▼
System Prompt & Safety Fences Injected
       │
       ▼
Groq API Call (Tool Calling: get_exception, get_payment, etc.)
       │
       ▼
Deterministic NestJS Services Execute Tools (Read-Only)
       │
       ▼
Tool Responses Returned to Groq Context
       │
       ▼
Structured JSON Synthesis (likely_cause, confidence, exposure, proposed_action)
       │
       ▼
Zod Schema Validation (AiAnalysisSchema)
       │
       ▼
Saved to Database & Rendered in Investigation Drawer
```

### Safety Invariants
1. **Read-Only Data Access**: The AI has zero write permissions to financial records or balances.
2. **Strict Multi-Tenant Scoping**: All tool executions inherit the authenticated `merchant_id` from the user session. The LLM cannot cross tenant boundaries.
3. **Structured Action Proposals**: Proposed resolutions (`REFUND`, `CREATE_PAYMENT_LINK`, `MARK_REVIEWED`) are stored as proposals and must pass the deterministic Policy Engine before human authorization.

---

## 4. Operational Verification

### 4.1 CLI API Connectivity Test
Verify that your Groq credentials and endpoint are operational:

```bash
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Respond with OK."}]
  }'
```

### 4.2 End-to-End Investigation Smoke Test
1. Start the services: `npm run dev:backend` and `npm run dev:frontend`.
2. Navigate to **Exceptions** ([http://localhost:3000/exceptions](http://localhost:3000/exceptions)).
3. Select an open exception to open the investigation drawer.
4. Click **Run Investigation**.
5. Observe the live tool execution chain, calculated financial exposure, and confidence rating rendered in under 2 seconds.

---

## 5. Failure Modes & Resilience

| Failure Scenario | System Behavior | Operator Action |
| :--- | :--- | :--- |
| **Invalid or Expired API Key** | Backend logs 401 error; returns structured 500 error payload with remediation message. | Verify `GROQ_API_KEY` in `backend/.env`. |
| **Groq Rate Limiting (429)** | Handled with exponential backoff retry in `AiService`. | Verify Groq organization rate tier or switch to fallback model. |
| **Malformed Tool Schema Output** | Validated via `zod` (`AiAnalysisSchema`). If parsing fails, fallbacks to safe defaults (`MANUAL_REVIEW`). | Review model output logs in `AiService`. |
| **Model Hallucination on Amounts** | Exposure amounts are recalculable deterministically via the Policy Engine; AI exposure numbers are never trusted blindly for mutations. | Invariant protected by design. |
