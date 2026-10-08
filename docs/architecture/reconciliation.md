# Reconciliation Logic

## 1. Purpose

The reconciliation engine is the financial correctness core of LedgerMind.

It deterministically compares records across:

- Orders
- Payments
- Refunds
- Settlements
- Bank Transactions

The engine produces:

1. Matches
2. Mismatches
3. Missing records
4. Duplicate records
5. Exceptions

AI is not involved in the financial matching decision.

---

## 2. Reconciliation Pipeline

```text
Collect Records
      ↓
Normalize
      ↓
Partition by Merchant
      ↓
Generate Candidates
      ↓
Apply Matching Rules
      ↓
Calculate Match Score
      ↓
Accept / Review / Reject
      ↓
Check Financial Invariants
      ↓
Generate Exceptions
      ↓
Calculate Severity
      ↓
Persist Results
```

## 3. Matching Hierarchy

Matching follows a strict hierarchy.

### Level 1 — Exact Identifier

Highest confidence.

Examples:
- `payment.order_id → order.id`
- `refund.payment_id → payment.id`
- `bank.utr → settlement.utr`

### Level 2 — UTR / External Reference

Used primarily for settlement-to-bank matching.

```text
Settlement UTR
       =
Bank Transaction UTR
```

### Level 3 — Amount + Time Window

Candidate records may be matched when:
- Amount is equal
- Transaction dates are compatible
- Time difference is within configured tolerance

Example:
```text
Settlement: ₹10,000
Bank Credit: ₹10,000

Settlement Date: 10:30
Bank Date:       10:42

Δt = 12 minutes
```

### Level 4 — Metadata Similarity

Lowest-confidence matching.

Possible signals:
- Customer reference
- Invoice number
- Description
- External reference
- Merchant metadata

Fuzzy matching must never silently override stronger conflicting evidence.

## 4. Match Scoring

The scoring model should produce a normalized score from 0–100.

Example:

| Evidence                       | Score |
|--------------------------------|-------|
| Exact external relationship    | 40    |
| Exact UTR                      | 30    |
| Exact amount                   | 20    |
| Time proximity                 | 10    |
| Metadata similarity            | Additional supporting signal |

The final score must be capped at 100.

## 5. Match Classification

| Score   | Classification | Action              |
|---------|---------------|---------------------|
| 90–100  | Strong        | Automatically accept|
| 75–89   | Probable      | Accept with review flag |
| 50–74   | Weak          | Manual review       |
| <50     | Unmatched     | Generate exception  |

Thresholds are configurable.

## 6. Order → Payment Reconciliation

For every order:
1. Find payments referencing the order.
2. Determine successful payment attempts.
3. Compare expected and actual amount.
4. Detect duplicates.

### Missing Payment
```text
Order = ₹1,000
Payment = none
```
Generate: `PAYMENT_MISSING`

### Amount Mismatch
```text
Order = ₹1,000
Payment = ₹900
```
Generate: `ORDER_PAYMENT_MISMATCH`

### Duplicate Payment
```text
Order = ₹2,000

Payment A = ₹2,000
Payment B = ₹2,000
```
Generate: `DUPLICATE_PAYMENT`

## 7. Payment → Settlement Reconciliation

Captured payments should eventually become eligible for settlement.

```text
Captured Payment
       ↓
Settlement
```

If a payment remains eligible but no settlement is found beyond the configured settlement window:

`SETTLEMENT_MISSING`

## 8. Settlement → Bank Reconciliation

The settlement should correspond to a bank credit.

Preferred matching:
```text
Settlement UTR
       =
Bank UTR
```

Secondary matching:
```text
Amount + Date/Time + Reference
```

Mismatch example:
```text
Settlement = ₹10,000
Bank Credit = ₹9,800
```
Generate: `SETTLEMENT_AMOUNT_MISMATCH`

## 9. Refund → Bank Reconciliation

A processed refund should have corresponding financial evidence.

The engine verifies:
- Refund amount
- Refund state
- Related payment
- Bank debit where applicable
- Timing

If the refund remains processing beyond the configured threshold:

`REFUND_DELAY`

## 10. Exception Categories

| Exception                   | Meaning                                     |
|-----------------------------|---------------------------------------------|
| PAYMENT_MISSING             | Expected payment not found                  |
| ORDER_PAYMENT_MISMATCH      | Order/payment amounts differ                |
| BANK_PAYMENT_MISMATCH       | Bank contradicts payment state              |
| DUPLICATE_PAYMENT           | Multiple successful payments detected       |
| REFUND_MISMATCH             | Refund evidence is inconsistent             |
| REFUND_DELAY                | Refund exceeds expected processing time     |
| SETTLEMENT_MISSING          | Captured funds not represented in settlement|
| SETTLEMENT_AMOUNT_MISMATCH  | Settlement amount differs from expected     |
| BANK_MISMATCH               | Bank and settlement evidence conflict       |
| UNKNOWN_EXCEPTION           | Unclassified inconsistency                  |

## 11. Severity

Severity should consider:
- Financial exposure
- Customer impact
- Age
- Recurrence
- Operational urgency

Example conceptual score:
```text
Severity Score =
    Financial Impact
  + Customer Impact
  + Age
  + Recurrence
  + Evidence Uncertainty
```

Recommended mapping:

| Score | Severity |
|-------|----------|
| ≥200  | CRITICAL |
| ≥100  | HIGH     |
| ≥50   | MEDIUM   |
| <50   | LOW      |

The actual coefficients must remain configurable.

## 12. Exception Deduplication

The same underlying mismatch should not generate endless duplicate exceptions.

A stable deduplication key should consider:
```text
merchant
+ exception type
+ primary entity
+ relevant comparison
```

Example:
```text
merchant_1
+
PAYMENT_MISSING
+
order_123
```

If the exception already exists and remains valid, update it instead of creating another copy.

## 13. Automatic Resolution

A previously open exception may automatically resolve when reconciliation later confirms consistency.

Example:
```text
SETTLEMENT_MISSING
        ↓
Settlement arrives
        ↓
Reconciliation
        ↓
Settlement matched
        ↓
Exception RESOLVED
```

Automatic resolution must be recorded in the audit trail.

## 14. Idempotency

Running reconciliation twice against the same data should produce the same logical result.

```text
Run A
 ↓
Matches + Exceptions

Run B
 ↓
Same data
 ↓
Same logical Matches + Exceptions
```

Database constraints and deterministic identifiers prevent duplication.

## 15. Performance Strategy

For the MVP:
- Index external IDs
- Index UTR
- Index merchant/date
- Filter candidate sets before scoring
- Avoid O(N²) comparisons where possible
- Process merchants independently
- Process large jobs asynchronously

Example:
```text
1,000 records
      ↓
Indexed candidate lookup
      ↓
Small candidate sets
      ↓
Deterministic scoring
```

## 16. Configuration

The reconciliation engine should externalize:
- Match thresholds
- Time windows
- Amount tolerances
- Refund delay threshold
- Settlement delay threshold
- Severity weights
- Maximum candidate count

Configuration belongs in environment/configuration storage, not hard-coded business logic.

## 17. Fundamental Rule

> **Reconciliation determines what is true. AI explains why it may be true.**

This separation is the foundation of LedgerMind's financial reliability.
