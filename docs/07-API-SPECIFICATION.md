# API Specification

## 1. API Overview

LedgerMind exposes a REST API through the NestJS backend.

### Base Path

```text
/api/v1
```

### General Rules

- Request/response format: JSON
- Amounts: integer paise
- Timestamps: UTC ISO-8601
- Authentication: JWT
- Authorization: RBAC + Policy Engine where applicable

## 2. Authentication

### POST /auth/register

Creates a merchant and initial administrator account.

### POST /auth/login

Authenticates a user.

**Request**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response**
```json
{
  "access_token": "jwt-token",
  "user": {
    "id": "uuid",
    "name": "Finance Admin",
    "role": "ADMIN"
  }
}
```

## 3. Webhooks

### POST /webhooks/razorpay

Receives Razorpay webhook events.

Authentication is performed using the Razorpay webhook signature rather than JWT.

**Required Header**
- `X-Razorpay-Signature`

**Processing**

```text
Receive Request
      ↓
Read Raw Body
      ↓
Verify HMAC SHA256
      ↓
Persist Event
      ↓
Return 200
      ↓
Process Asynchronously
```

**Responses**

Success:
```json
{
  "status": "accepted"
}
```

Invalid Signature:
```json
{
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Webhook signature verification failed"
  }
}
```

## 4. Transactions

### GET /transactions

Returns paginated financial records.

**Query Parameters**

| Parameter | Description                               |
|-----------|-------------------------------------------|
| type      | order, payment, refund, settlement, bank  |
| status    | Entity-specific status                    |
| from      | Start date                                |
| to        | End date                                  |
| page      | Page number                               |
| limit     | Page size                                 |

**Response**
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### GET /transactions/:id

Returns a transaction and its related financial records.

```json
{
  "id": "uuid",
  "type": "payment",
  "external_id": "pay_123",
  "amount": 500000,
  "currency": "INR",
  "status": "CAPTURED",
  "related": {
    "order": {},
    "refunds": [],
    "settlement": {},
    "bank_transaction": {}
  }
}
```

## 5. Reconciliation

### GET /reconciliation/runs

Returns reconciliation runs.

### POST /reconciliation/runs

Starts a reconciliation run.

**Request**
```json
{
  "date_from": "2026-09-01",
  "date_to": "2026-09-03"
}
```

**Response**
```json
{
  "run_id": "uuid",
  "status": "IN_PROGRESS"
}
```

The run is asynchronous.

### GET /reconciliation/runs/:id

Returns reconciliation run details.

```json
{
  "id": "uuid",
  "status": "COMPLETED",
  "total_records": 1000,
  "matched_count": 982,
  "exception_count": 18,
  "started_at": "2026-09-03T10:00:00Z",
  "finished_at": "2026-09-03T10:00:01Z"
}
```

## 6. Exceptions

### GET /exceptions

Returns a filtered exception queue.

**Query Parameters**

| Parameter | Description                    |
|-----------|--------------------------------|
| type      | Exception type                 |
| severity  | CRITICAL, HIGH, MEDIUM, LOW    |
| status    | Exception status               |
| from      | Start date                     |
| to        | End date                       |
| page      | Page                           |
| limit     | Page size                      |

### GET /exceptions/:id

Returns complete exception information.

```json
{
  "exception_id": "EXC-1024",
  "type": "BANK_PAYMENT_MISMATCH",
  "severity": "HIGH",
  "status": "OPEN",
  "expected_amount": 500000,
  "actual_amount": 500000,
  "difference_amount": 0,
  "financial_impact": 500000,
  "customer_impact": "HIGH",
  "transactions": {},
  "ai_analysis": {}
}
```

### GET /exceptions/:id/timeline

Returns chronological evidence.

```json
{
  "events": [
    {
      "event_type": "payment.failed",
      "timestamp": "2026-09-03T10:00:00Z",
      "entity_type": "payment",
      "entity_id": "uuid"
    },
    {
      "event_type": "bank.credit",
      "timestamp": "2026-09-03T10:02:00Z",
      "entity_type": "bank_transaction",
      "entity_id": "uuid"
    }
  ]
}
```

## 7. AI Investigation

### POST /exceptions/:id/investigate

Starts an AI investigation.

**Response**
```json
{
  "analysis_id": "uuid",
  "status": "QUEUED"
}
```

AI processing may happen asynchronously.

### GET /exceptions/:id/ai-analysis

Returns the latest AI investigation.

```json
{
  "summary": "Bank credit exists despite failed payment state.",
  "likely_cause": "Payment state inconsistency.",
  "confidence": 94,
  "financial_exposure": 500000,
  "customer_impact": "HIGH",
  "recommended_action": "Verify the bank credit before resolution.",
  "evidence_chain": [],
  "next_steps": []
}
```

## 8. AI Command Center

### POST /ai/chat

Processes natural-language finance queries.

**Request**
```json
{
  "message": "Show me high-value unresolved payment mismatches."
}
```

**Response**
```json
{
  "message": "I found 7 high-value unresolved payment mismatches.",
  "results": [],
  "suggested_actions": []
}
```

The AI may retrieve data through read-only internal tools.

## 9. Actions

### POST /actions

Creates an action proposal.

```json
{
  "exception_id": "uuid",
  "action_type": "REFUND",
  "parameters": {
    "amount": 500000,
    "reason": "Duplicate payment"
  }
}
```

**Response**
```json
{
  "id": "uuid",
  "status": "PENDING_APPROVAL",
  "approval_required": true
}
```

### GET /actions

Returns actions.

Query:
```
/actions?status=PENDING_APPROVAL
```

### POST /actions/:id/approve

Approves an eligible action.

```json
{
  "reason": "Verified against bank statement."
}
```

### POST /actions/:id/reject

Rejects an action.

```json
{
  "reason": "Insufficient evidence."
}
```

## 10. Dashboard

### GET /dashboard/metrics

Returns operational metrics.

```json
{
  "total_transaction_volume": 248000000,
  "reconciliation_rate": 98.4,
  "open_exceptions": 42,
  "critical_exceptions": 3,
  "pending_approvals": 5
}
```

## 11. Error Contract

All API errors follow the same structure.

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Exception was not found.",
    "request_id": "req_123"
  }
}
```

### Common Error Codes

| Code                | Meaning                                |
|---------------------|----------------------------------------|
| UNAUTHORIZED        | Authentication required                |
| FORBIDDEN           | Insufficient permissions               |
| VALIDATION_ERROR    | Invalid request                        |
| RESOURCE_NOT_FOUND  | Resource unavailable                   |
| INVALID_SIGNATURE   | Webhook signature failed               |
| POLICY_DENIED       | Action violates policy                 |
| ACTION_CONFLICT     | Action cannot be performed in current state |
| INTERNAL_ERROR      | Unexpected server error                |

## 12. Idempotency

Financial mutation endpoints should support idempotency.

Example:
```
Idempotency-Key: refund-exc-1024-v1
```

Repeated requests with the same key must not create duplicate financial actions.

## 13. Rate Limiting

Suggested MVP limits:
- Standard API: 100 requests/minute/user
- AI endpoints: configurable lower limit
- Webhooks: higher provider-compatible limit

Rate limits should be configurable through environment variables.

## 14. API Design Principle

The API separates:

```text
READ
 ↓
INVESTIGATE
 ↓
PROPOSE
 ↓
APPROVE
 ↓
EXECUTE
```

No single endpoint should allow an AI-generated instruction to bypass validation, policy, approval, or audit controls.
