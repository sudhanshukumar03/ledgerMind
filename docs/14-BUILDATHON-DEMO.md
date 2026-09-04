# Buildathon Demo Script

## 1. Demo Objective

The LedgerMind demonstration should communicate one simple idea:

> **Detect → Explain → Resolve**

The demo should prove that LedgerMind can detect a financial inconsistency, investigate it with AI, obtain human approval, execute a controlled action, and reconcile the resulting state.

---

## 2. Demo Story

A customer attempts a ₹50,000 payment.

The payment gateway reports:

```text
PAYMENT = FAILED
```

However, the merchant's bank statement contains:

```text
BANK = ₹50,000 CREDIT
```

This creates a financial inconsistency.

LedgerMind detects it automatically.

## 3. Pre-Demo Setup

Ensure:
- Frontend running
- Backend running
- PostgreSQL running
- Redis running
- BullMQ workers running
- Demo merchant seeded
- Synthetic transactions seeded
- AI configured
- Razorpay mock/test integration available

## 4. Scene 1 — Healthy Dashboard

Open the LedgerMind dashboard.

Show:
- Transaction volume
- Reconciliation rate
- Open exceptions
- Critical exceptions
- Pending approvals

**Talking point:**

> "Most financial records reconcile automatically. The system focuses human attention only where the underlying systems disagree."

## 5. Scene 2 — Inject the Discrepancy

Create:

```text
Order
Amount: ₹50,000
Status: ATTEMPTED
```

Payment:
```text
Payment
Amount: ₹50,000
Status: FAILED
```

Bank transaction:
```text
Bank
Amount: ₹50,000 CREDIT
UTR: UTR-DEMO-001
```

No corresponding successful payment exists.

## 6. Scene 3 — Automatic Reconciliation

Trigger reconciliation.

Show:
```text
Reconciliation
      ↓
Payment = FAILED
      ↓
Bank = CREDIT
      ↓
Mismatch detected
      ↓
BANK_PAYMENT_MISMATCH
```

Dashboard should update with a new exception.

## 7. Scene 4 — Exception Investigation

Open the exception.

Display:
```text
ORDER
 ₹50,000
    │
    ▼
PAYMENT
 FAILED
    │
    │ contradiction
    ▼
BANK
 ₹50,000 CREDIT
    │
    ▼
SETTLEMENT
 MISSING
```

Also show:
- Severity
- Financial exposure
- Customer impact
- Timeline

## 8. Scene 5 — AI Investigation

Click: **Investigate with AI**

The AI gathers:
- Order
- Payment
- Bank transaction
- Settlement
- Timeline

Expected result:
```text
Summary:
Bank credit exists for a payment marked failed.

Likely cause:
A payment-state inconsistency between the gateway
and bank-side financial evidence.

Confidence:
High

Financial exposure:
₹50,000

Recommended action:
Verify the bank transaction and determine whether
the customer was charged before taking corrective action.
```

**Important talking point:**

> "The AI did not guess the financial state. It investigated evidence produced by the deterministic system."

## 9. Scene 6 — AI Command Center

Open AI chat.

Query:
```text
Show me all high-value unresolved payment mismatches.
```

Then:
```text
Investigate EXC-1001.
```

Then:
```text
What evidence supports your conclusion?
```

Show that the AI returns evidence-backed reasoning.

## 10. Scene 7 — Action Proposal

Select: **Take Action**

The system displays:
- Action: `REFUND / REVIEW / ESCALATE`
- Amount: ₹50,000
- Reason: Bank-side credit conflicts with failed payment state.
- Approval: Required

## 11. Scene 8 — Policy Engine

Explain:
```text
Action Proposal
      ↓
Policy Engine
      ↓
Amount threshold
      +
User role
      +
Action type
      ↓
Approval required
```

The AI cannot bypass this step.

## 12. Scene 9 — Human Approval

Open Approvals.

Show:
- Exception
- AI recommendation
- Evidence
- Financial exposure
- Policy result
- Requested action

Approve the action.

## 13. Scene 10 — Action Execution

Action Engine executes the approved action through the configured Razorpay integration or mock.

Show:
```text
PENDING_APPROVAL
       ↓
APPROVED
       ↓
EXECUTING
       ↓
COMPLETED
```

Audit log is created.

## 14. Scene 11 — Event Loop

Simulate the resulting webhook.

```text
Action
  ↓
External System
  ↓
Webhook
  ↓
Event Queue
  ↓
Worker
  ↓
State Update
  ↓
Reconciliation
```

The system reconciles again.

## 15. Scene 12 — Resolution

Show:
```text
Exception
OPEN
  ↓
Reconciliation
  ↓
Mismatch no longer exists
  ↓
RESOLVED
```

Dashboard:
```text
Open Exceptions ↓
```

## 16. Final Architecture Explanation

End the demo with:

```text
             LedgerMind
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 Deterministic          AI Controller
 Reconciliation         Investigation
        │                   │
        └─────────┬─────────┘
                  ▼
             Policy Engine
                  ▼
            Human Approval
                  ▼
             Action Engine
                  ▼
               Audit
```

## 17. Final Pitch

> "LedgerMind does not replace the finance operator. It replaces the manual investigation around reconciliation."

> "The deterministic engine establishes what happened. The AI explains why it happened. The policy engine controls what can happen next. And the human remains in control of sensitive financial actions."

## 18. Demo Fallback

If external APIs fail:
- Use mock Razorpay responses.
- Use seeded bank data.
- Use deterministic AI fallback responses.
- Keep the reconciliation engine fully operational.

The core demonstration must not depend on live third-party behavior.

## 19. Demo Success Criteria

The demo succeeds if judges can clearly see:
- A real reconciliation discrepancy
- Automatic exception generation
- Evidence-based AI investigation
- Explainable recommendation
- Policy enforcement
- Human approval
- Controlled action execution
- Audit trail
- Automatic resolution

The audience should understand the full loop within a few minutes.