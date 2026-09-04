# Problem Statement

## Context

Modern payment platforms such as Razorpay generate a wide variety of financial records for every transaction. A single customer purchase can be represented across five distinct entities:

- **Order** – the merchant’s intent to collect a specified amount.
- **Payment** – the customer’s actual payment attempt and its outcome.
- **Refund** – money returned to the customer after a successful payment.
- **Settlement** – the transfer of funds from the payment gateway to the merchant’s account.
- **Bank Transaction** – the authoritative record from the merchant’s bank statement.

These records are created by different systems, updated asynchronously, and stored in separate repositories. They often contain divergent representations of the same underlying financial event.

## The Core Problem

Fragmented financial data leads to reconciliation gaps that are difficult to detect and resolve manually. The system must continuously reconcile these records, identify inconsistencies, explain what occurred, determine which discrepancies require action, and guide an operator to a clear resolution.

## Why This Matters

- **Merchant Trust** – Accurate reconciliation ensures merchants receive the correct funds on time.
- **Operational Efficiency** – Manual reconciliation is slow, error‑prone, and expensive.
- **Risk Mitigation** – Unnoticed mismatches can cause revenue leakage or compliance issues.
- **Scalability** – As transaction volumes grow, manual processes break down completely.

## Pain Points

1. **Data Volume** – High‑volume merchants process thousands of transactions daily, making manual checks impossible.
2. **Event Timing** – Webhooks, settlement files, and bank feeds arrive at different times, causing temporary or permanent mismatches.
3. **Schema Differences** – Each source uses its own identifiers, statuses, and data formats.
4. **Partial Failures** – For example, a payment may be marked `failed` in the gateway while the bank shows a successful credit.
5. **Lack of Explainability** – Operators need to know *why* a discrepancy exists, not just that one was detected.
6. **Compliance & Audit** – Every action must be traceable and follow defined policies.

## Example Scenarios

| Scenario                         | Expected            | Actual                  | Issue                         |
|----------------------------------|---------------------|-------------------------|-------------------------------|
| Payment missing                  | Order = ₹1,000      | Payment = MISSING       | `PAYMENT_MISSING`             |
| Bank credit for failed payment   | Payment = FAILED    | Bank = ₹5,000 CREDIT    | `BANK_PAYMENT_MISMATCH`       |
| Settlement discrepancy           | Payment = ₹10,000   | Settlement = ₹9,800     | `SETTLEMENT_AMOUNT_MISMATCH`  |
| Duplicate payment                | Order = ₹2,000      | Payments = ₹2,000 × 2   | `DUPLICATE_PAYMENT`           |
| Refund stuck                     | Refund = ₹3,000     | Refund state = processing| `REFUND_DELAY`               |
| Settlement missing               | Payment captured    | Settlement = MISSING    | `SETTLEMENT_MISSING`          |

## Our Solution – LedgerMind

LedgerMind is an **AI‑powered financial controller** built on top of a **deterministic reconciliation engine**. The deterministic engine performs the heavy lifting: matching records, computing differences, and flagging exceptions. The AI layer then adds intelligence:

- **Investigates** exceptions by gathering related transactions and context.
- **Explains** the likely root cause in natural language with a confidence score.
- **Prioritizes** exceptions based on financial impact, customer impact, and urgency.
- **Recommends** next actions (e.g., refund, verify, escalate) with appropriate guardrails.
- **Requires human approval** for sensitive actions, maintaining control and compliance.

This separation ensures accuracy, explainability, and auditability—qualities essential for financial operations.
