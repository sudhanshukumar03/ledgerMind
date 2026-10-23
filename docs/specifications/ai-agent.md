# AI Finance Controller specification

The AI Finance Controller explains deterministic financial evidence and returns action proposals. It does not authorize money movement, create Action rows, or call the Action Engine. Required analysis/chat audit persistence is handled by the application service.

## Current tool catalogue

AI_TOOLS in [ai.service.ts](../../backend/src/modules/ai/ai.service.ts) defines 16 functions: 13 discovery/advisory functions and three proposal functions. All are merchant scoped.

| Tool | Kind | Purpose |
| --- | --- | --- |
| get_transaction | Discovery | Retrieve a payment or order. |
| get_order | Discovery | Retrieve an order and payments. |
| get_payment | Discovery | Retrieve a payment, order, and refunds. |
| get_refund | Discovery | Retrieve a refund and payment. |
| get_settlement | Discovery | Retrieve a settlement, allocations, and linked bank entries. |
| find_related_transactions | Discovery | Resolve related payments/refunds. |
| get_exception | Discovery | Retrieve an exception, its timeline, and stored evidence. |
| get_customer_history | Discovery | Retrieve scoped customer orders/payments. |
| get_merchant_history | Discovery | Retrieve the authenticated merchant's recent exceptions/runs. |
| calculate_exposure | Discovery | Return deterministic stored exposure facts. |
| create_resolution_plan | Advisory | Return suggested next steps without executing them. |
| list_open_exceptions | Discovery | List OPEN exceptions with optional severity. |
| get_reconciliation_run | Discovery | Retrieve a merchant-scoped run. |
| request_refund | Proposal | Return a REFUND proposal and resolved references. |
| create_payment_link | Proposal | Return a CREATE_PAYMENT_LINK proposal. |
| mark_for_review | Proposal | Return a MARK_REVIEWED proposal. |

Operators submit proposal data through POST /actions. Refund payment references resolve to internal IDs; payment-link proposals may expose the provider order reference, which the Action Engine resolves and validates. Never assume every string ID is a UUID.

Proposal amounts are safe integer numbers in paise, rather than the decimal strings used for stored BigInt fields. The tools currently return requires_approval=true as a fixed advisory flag. It is not a calculated human-approval requirement: the Action Engine applies the actual zero/one/two-approver policy after operator submission. A proposal may also have exception_id=null when its exception reference cannot be resolved, so it cannot be submitted unchanged.

There are no aliases named propose_refund, propose_payment_link, propose_escalation, get_bank_transaction, get_exception_timeline, or search_exceptions. Additional capabilities must be implemented and validated explicitly.

## Investigation and chat

Investigation loads the scoped exception and stored evidence before model/tool rounds. The runtime validates each tool name against the request allow-list and parses/validates arguments inside the controlled error boundary. Required strings, severity, bounded limits, and safe positive paise are checked. Unknown/disallowed/malformed calls produce controlled tool errors.

The loop allows up to three normal rounds, then final synthesis if needed. If that synthesis request fails, the service retries it once without JSON mode. The 30-second client setting applies to an individual request, not the whole investigation; multiple rounds can take longer. A browser investigation timeout of 15 seconds clears UI loading and permits retry, without proving that an already submitted provider call stopped. No sub-two-second latency guarantee has been measured.

Metadata, descriptions, and financial snapshots are untrusted input. Prompt wording alone is not a security boundary; tool capabilities, merchant scope, and Action Engine authorization remain authoritative.

## Analysis output and audit

| Field / behavior | Contract |
| --- | --- |
| summary and likely_cause | Required nonempty trimmed strings for successful structured analysis. |
| confidence | Required integer from 0 through 100. |
| Financial exposure | Deterministic stored facts, returned as exact decimal paise. |
| Metadata | model, promptVersion, latencyMs, isFallback, toolCalls, and evidence trail. |
| Persistence | Analysis and required audit commit in one transaction. |
| Fallback | Explicit for disabled/unavailable provider, empty output, invalid JSON/fields, or explicitly incomplete final responses. |

Normal and forced-final paths use the same completion checks. Empty objects cannot silently become successful default analyses. Fresh and saved results expose the evidence trail, and exception detail orders saved analyses newest first.

Every chat response, including fallback and nonproposal turns, requires audit persistence; audit failure remains visible. Input accepts 1-40 user/assistant turns of 1-8,000 nonblank characters. Clients cannot supply trusted system/tool roles. The browser sends a bounded recent window within 90 KB encoded JSON.

## Model configuration

Application configuration defaults AI_ENABLED to false. Disabled AI or an absent GROQ_API_KEY keeps deterministic functions usable and returns an auditable unavailable result. Enable provider calls explicitly and provide a valid key.

The Groq endpoint is https://api.groq.com/openai/v1. AI_MODEL falls back to llama-3.3-70b-versatile in both application and Compose; choose an explicit model for consistent experiments. Account availability and latency need separate verification.

Investigation is available on demand; creating an exception does not automatically schedule it in every path. Connectivity probes and labeled quality evaluation are different exercises. See [setup](../operations/local-development.md#optional-groq-setup), [testing](../operations/testing.md#optional-provider-checks), and [completed evidence](../operations/fix-verification.md).
