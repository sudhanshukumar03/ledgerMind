# Payment State Machine

## 1. Purpose

LedgerMind uses explicit state machines to prevent invalid financial transitions.

State transitions are deterministic and validated by the backend.

The AI cannot directly change financial states.

---

## 2. Order State Machine

```text
             ┌──────────────┐
             │   CREATED    │
             └──────┬───────┘
                    │ payment attempt
                    ▼
             ┌──────────────┐
             │   ATTEMPTED  │
             └───┬──────┬───┘
                 │      │
       success   │      │ failure
                 ▼      ▼
          ┌─────────┐  ┌────────┐
          │  PAID   │  │ FAILED │
          └────┬────┘  └────────┘
               │
               │ full refund
               ▼
          ┌──────────┐
          │ REFUNDED │
          └──────────┘
```

Cancellation:
```text
CREATED → CANCELLED
```

## 3. Payment State Machine

```text
CREATED
   │
   ▼
AUTHORIZED
   │
   ▼
CAPTURED
   │
   ├───────────────┐
   │               │
   ▼               ▼
PARTIALLY_REFUNDED  REFUNDED
```

Failure can occur before capture:
```text
CREATED ──────▶ FAILED
AUTHORIZED ───▶ FAILED
```

## 4. Refund State Machine

```text
CREATED
   │
   ▼
PROCESSING
   │
   ├───────────────┐
   ▼               ▼
PROCESSED        FAILED
```

## 5. Settlement State Machine

```text
CREATED
   │
   ▼
PROCESSED
```

Failure:
```text
CREATED → FAILED
```

## 6. Bank Transaction State Machine

```text
PENDING
   │
   ▼
POSTED
```

Failure:
```text
PENDING → FAILED
```

## 7. Transition Rules

| Entity     | Event                  | From                   | To                    |
|------------|------------------------|------------------------|-----------------------|
| Order      | order.created          | —                      | CREATED               |
| Order      | payment attempted      | CREATED                | ATTEMPTED             |
| Order      | payment captured       | ATTEMPTED              | PAID                  |
| Order      | payment failed         | ATTEMPTED              | FAILED                |
| Payment    | payment.created        | —                      | CREATED               |
| Payment    | authorized             | CREATED                | AUTHORIZED            |
| Payment    | captured               | AUTHORIZED             | CAPTURED              |
| Payment    | failed                 | CREATED/AUTHORIZED     | FAILED                |
| Payment    | partial refund         | CAPTURED               | PARTIALLY_REFUNDED    |
| Payment    | full refund            | CAPTURED/PARTIALLY_REFUNDED | REFUNDED         |
| Refund     | created                | —                      | CREATED               |
| Refund     | processing             | CREATED                | PROCESSING            |
| Refund     | processed              | PROCESSING             | PROCESSED             |
| Refund     | failed                 | PROCESSING             | FAILED                |
| Settlement | created                | —                      | CREATED               |
| Settlement | processed              | CREATED                | PROCESSED             |
| Settlement | failed                 | CREATED                | FAILED                |

## 8. Financial Invariants

### Invariant 1
A payment cannot be refunded unless it has been captured.

### Invariant 2
Total refunds cannot exceed captured amount.
```text
Σ refunds ≤ captured amount
```

### Invariant 3
A settlement cannot represent more funds than the underlying eligible transactions allow.

### Invariant 4
A bank settlement match requires sufficient evidence such as:
- UTR
- Amount
- Date/time
- Reference metadata

### Invariant 5
A webhook cannot apply the same logical state transition twice.

## 9. Out-of-Order Events

Events may arrive in an unexpected sequence.

Example:
```text
payment.captured
        ↓
payment.authorized
```

The worker must not blindly apply the second event.

Instead:
1. Load current state.
2. Check whether transition is valid.
3. Ignore stale events where appropriate.
4. Record the event for auditability.
5. Trigger reconciliation when state uncertainty exists.

## 10. Idempotency

Webhook events are uniquely identified.

```text
event_id
   ↓
Unique Database Constraint
   ↓
Duplicate?
 ┌───────┴───────┐
 YES             NO
  │               │
Ignore          Process
```

## 11. State Transition Responsibility

Only backend domain services may change financial states.

```text
Frontend ──X──▶ Database
AI ────────X──▶ Database

Frontend ──▶ API ──▶ Domain Service ──▶ Database
AI Proposal ─▶ Policy ─▶ Action Engine ─▶ Database
```

## 12. Reconciliation Implications

State inconsistencies are themselves reconciliation signals.

Examples:
```text
Payment = FAILED
Bank = CREDIT
```

Possible exception:
```text
BANK_PAYMENT_MISMATCH
```

Another example:
```text
Payment = CAPTURED
Settlement = MISSING
```

Possible exception:
```text
SETTLEMENT_MISSING
```

The state machine therefore provides the expected financial lifecycle against which reconciliation operates.
