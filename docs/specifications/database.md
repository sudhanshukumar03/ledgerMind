# Database schema reference

[schema.prisma](../../backend/prisma/schema.prisma) is authoritative. This reference lists all 17 current models and their scalar fields, stored columns, types, nullability, attributes, and declared relationships. The offline documentation check compares the scalar catalogue with the schema.

## Storage conventions

- Internal identifiers use UUIDs; provider identifiers are separate strings.
- Money uses BigInt integer paise. APIs serialize BigInt as decimal strings and validate supported currency in services.
- DateTime storage follows each field's Prisma/database annotation; timestamp fields represent instants, while business-date fields retain their declared date type.
- Nullable relationships represent incomplete evidence and do not imply financial eligibility.
- Polymorphic source/target/entity references are not foreign keys to every possible table; service validation remains necessary.

## Enumerations

| Enum | Current values |
| --- | --- |
| Role | ADMIN, FINANCE, VIEWER |
| OrderStatus | CREATED, ATTEMPTED, PAID, FAILED, REFUNDED, CANCELLED |
| PaymentStatus | CREATED, AUTHORIZED, CAPTURED, FAILED, PARTIALLY_REFUNDED, REFUNDED |
| RefundStatus | CREATED, PROCESSING, PROCESSED, FAILED |
| SettlementStatus | CREATED, PROCESSED, FAILED |
| BankTransactionType | CREDIT, DEBIT |
| BankTransactionStatus | PENDING, POSTED, FAILED |
| WebhookProcessingStatus | PENDING, PROCESSING, PROCESSED, FAILED, IGNORED_DUPLICATE, IGNORED_STALE, UNSUPPORTED |
| ReconciliationRunStatus | IN_PROGRESS, COMPLETED, FAILED |
| MatchEntityType | ORDER, PAYMENT, REFUND, SETTLEMENT, BANK_TRANSACTION |
| MatchMethod | EXACT_ID, UTR, AMOUNT_TIME, METADATA |
| ExceptionType | PAYMENT_MISSING, ORDER_PAYMENT_MISMATCH, BANK_PAYMENT_MISMATCH, DUPLICATE_PAYMENT, REFUND_MISMATCH, REFUND_DELAY, SETTLEMENT_MISSING, SETTLEMENT_AMOUNT_MISMATCH, BANK_MISMATCH, UNKNOWN_EXCEPTION |
| Severity | CRITICAL, HIGH, MEDIUM, LOW |
| ExceptionStatus | OPEN, INVESTIGATING, RESOLVED, IGNORED |
| ImpactLevel | HIGH, MEDIUM, LOW |
| ActionType | REFUND, CREATE_PAYMENT_LINK, MARK_REVIEWED, ESCALATE |
| ActionStatus | PROPOSED, PENDING_APPROVAL, APPROVED, REJECTED, EXECUTING, OUTCOME_UNKNOWN, COMPLETED, FAILED |

## Current models

### Merchant (`merchants`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `name` | `name` | `String` | - |
| `email` | `email` | `String` | - |
| `razorpayAccountId` | `razorpay_account_id` | `String?` | `@map("razorpay_account_id")` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `users: User[]`.
- `orders: Order[]`.
- `payments: Payment[]`.
- `refunds: Refund[]`.
- `settlements: Settlement[]`.
- `bankTransactions: BankTransaction[]`.
- `reconciliationRuns: ReconciliationRun[]`.
- `exceptions: Exception[]`.
- `actions: Action[]`.
- `auditLogs: AuditLog[]`.

### User (`users`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `name` | `name` | `String` | - |
| `email` | `email` | `String` | `@unique` |
| `passwordHash` | `password_hash` | `String` | `@map("password_hash")` |
| `role` | `role` | `Role` | `@default(VIEWER)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `requestedActions: Action[]` — `@relation("ActionRequestedBy")`.
- `approvals: ActionApproval[]`.
- `approvedActions: Action[]` — `@relation("ActionApprovedBy")`.
- `auditLogs: AuditLog[]`.

Declared indexes/compound constraints:

- `@@index([merchantId])`.

### Order (`orders`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `orderId` | `order_id` | `String` | `@unique @map("order_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `amount` | `amount` | `BigInt` | - |
| `currency` | `currency` | `String` | `@default("INR") @db.VarChar(3)` |
| `customerId` | `customer_id` | `String?` | `@map("customer_id")` |
| `status` | `status` | `OrderStatus` | `@default(CREATED)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `payments: Payment[]`.

Declared indexes/compound constraints:

- `@@index([merchantId, createdAt])`.
- `@@index([merchantId, status])`.

### Payment (`payments`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `paymentId` | `payment_id` | `String` | `@unique @map("payment_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `orderId` | `order_id` | `String?` | `@map("order_id") @db.Uuid` |
| `amount` | `amount` | `BigInt` | - |
| `currency` | `currency` | `String` | `@default("INR") @db.VarChar(3)` |
| `method` | `method` | `String?` | - |
| `status` | `status` | `PaymentStatus` | `@default(CREATED)` |
| `providerOrderId` | `provider_order_id` | `String?` | `@map("provider_order_id")` |
| `capturedAt` | `captured_at` | `DateTime?` | `@map("captured_at") @db.Timestamptz(6)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `order: Order?` — `@relation(fields: [orderId], references: [id])`.
- `allocations: SettlementAllocation[]`.
- `refunds: Refund[]`.

Declared indexes/compound constraints:

- `@@index([merchantId, createdAt])`.
- `@@index([orderId])`.
- `@@index([merchantId, status])`.

### Refund (`refunds`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `refundId` | `refund_id` | `String` | `@unique @map("refund_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `paymentId` | `payment_id` | `String` | `@map("payment_id") @db.Uuid` |
| `amount` | `amount` | `BigInt` | - |
| `status` | `status` | `RefundStatus` | `@default(CREATED)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `processedAt` | `processed_at` | `DateTime?` | `@map("processed_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `payment: Payment` — `@relation(fields: [paymentId], references: [id])`.

Declared indexes/compound constraints:

- `@@index([paymentId])`.
- `@@index([merchantId, status])`.

### Settlement (`settlements`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `settlementId` | `settlement_id` | `String` | `@unique @map("settlement_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `amount` | `amount` | `BigInt` | - |
| `currency` | `currency` | `String` | `@default("INR") @db.VarChar(3)` |
| `settlementDate` | `settlement_date` | `DateTime` | `@map("settlement_date") @db.Date` |
| `status` | `status` | `SettlementStatus` | `@default(CREATED)` |
| `utr` | `utr` | `String?` | - |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `allocations: SettlementAllocation[]`.
- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `bankTransactions: BankTransaction[]`.

Declared indexes/compound constraints:

- `@@index([merchantId, settlementDate])`.
- `@@index([utr])`.

### BankTransaction (`bank_transactions`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `bankTxnId` | `bank_txn_id` | `String` | `@unique @map("bank_txn_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `utr` | `utr` | `String?` | - |
| `amount` | `amount` | `BigInt` | - |
| `currency` | `currency` | `String` | `@default("INR") @db.VarChar(3)` |
| `paymentId` | `payment_id` | `String?` | `@map("payment_id") @db.Uuid` |
| `refundId` | `refund_id` | `String?` | `@map("refund_id") @db.Uuid` |
| `transactionType` | `transaction_type` | `BankTransactionType` | `@map("transaction_type")` |
| `transactionDate` | `transaction_date` | `DateTime` | `@map("transaction_date") @db.Date` |
| `valueAt` | `value_at` | `DateTime?` | `@map("value_at") @db.Timestamptz(6)` |
| `description` | `description` | `String?` | - |
| `status` | `status` | `BankTransactionStatus` | `@default(POSTED)` |
| `settlementId` | `settlement_id` | `String?` | `@map("settlement_id") @db.Uuid` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `settlement: Settlement?` — `@relation(fields: [settlementId], references: [id])`.

Declared indexes/compound constraints:

- `@@index([merchantId, transactionDate])`.
- `@@index([utr])`.
- `@@index([settlementId])`.

### WebhookEvent (`webhook_events`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `eventId` | `event_id` | `String` | `@unique @map("event_id")` |
| `eventType` | `event_type` | `String` | `@map("event_type")` |
| `merchantId` | `merchant_id` | `String?` | `@map("merchant_id") @db.Uuid` |
| `payload` | `payload` | `Json` | - |
| `receivedAt` | `received_at` | `DateTime` | `@default(now()) @map("received_at") @db.Timestamptz(6)` |
| `signatureVerified` | `signature_verified` | `Boolean` | `@default(false) @map("signature_verified")` |
| `processingStatus` | `processing_status` | `WebhookProcessingStatus` | `@default(PENDING) @map("processing_status")` |
| `processingAttempts` | `processing_attempts` | `Int` | `@default(0) @map("processing_attempts")` |
| `claimToken` | `claim_token` | `String?` | `@map("claim_token")` |
| `leaseExpiresAt` | `lease_expires_at` | `DateTime?` | `@map("lease_expires_at") @db.Timestamptz(6)` |
| `nextAttemptAt` | `next_attempt_at` | `DateTime` | `@default(now()) @map("next_attempt_at") @db.Timestamptz(6)` |
| `processingError` | `processing_error` | `String?` | `@map("processing_error")` |
| `correlationId` | `correlation_id` | `String?` | `@map("correlation_id")` |

Declared indexes/compound constraints:

- `@@index([processingStatus])`.
- `@@index([eventType, receivedAt])`.

### ReconciliationRun (`reconciliation_runs`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `status` | `status` | `ReconciliationRunStatus` | `@default(IN_PROGRESS)` |
| `dateFrom` | `date_from` | `DateTime?` | `@map("date_from") @db.Date` |
| `dateTo` | `date_to` | `DateTime?` | `@map("date_to") @db.Date` |
| `startedAt` | `started_at` | `DateTime` | `@default(now()) @map("started_at") @db.Timestamptz(6)` |
| `finishedAt` | `finished_at` | `DateTime?` | `@map("finished_at") @db.Timestamptz(6)` |
| `capturedPayments` | `captured_payments` | `Int` | `@default(0) @map("captured_payments")` |
| `matchedPayments` | `matched_payments` | `Int` | `@default(0) @map("matched_payments")` |
| `capturedVolume` | `captured_volume` | `BigInt` | `@default(0) @map("captured_volume")` |
| `totalRecords` | `total_records` | `Int` | `@default(0) @map("total_records")` |
| `matchedCount` | `matched_count` | `Int` | `@default(0) @map("matched_count")` |
| `exceptionCount` | `exception_count` | `Int` | `@default(0) @map("exception_count")` |
| `resolvedCount` | `resolved_count` | `Int` | `@default(0) @map("resolved_count")` |
| `errorMessage` | `error_message` | `String?` | `@map("error_message")` |
| `correlationId` | `correlation_id` | `String?` | `@map("correlation_id")` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `matches: ReconciliationMatch[]`.
- `exceptions: Exception[]`.

Declared indexes/compound constraints:

- `@@index([merchantId, startedAt])`.

### ReconciliationMatch (`reconciliation_matches`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `runId` | `run_id` | `String` | `@map("run_id") @db.Uuid` |
| `sourceType` | `source_type` | `MatchEntityType` | `@map("source_type")` |
| `sourceId` | `source_id` | `String` | `@map("source_id") @db.Uuid` |
| `targetType` | `target_type` | `MatchEntityType` | `@map("target_type")` |
| `targetId` | `target_id` | `String` | `@map("target_id") @db.Uuid` |
| `matchScore` | `match_score` | `Int` | `@map("match_score")` |
| `matchMethod` | `match_method` | `MatchMethod` | `@map("match_method")` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `run: ReconciliationRun` — `@relation(fields: [runId], references: [id], onDelete: Cascade)`.

Declared indexes/compound constraints:

- `@@unique([runId, sourceType, sourceId, targetType, targetId], name: "run_pair_unique")`.
- `@@index([runId])`.
- `@@index([sourceType, sourceId])`.

### Exception (`exceptions`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `exceptionId` | `exception_id` | `String` | `@unique @map("exception_id")` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `runId` | `run_id` | `String?` | `@map("run_id") @db.Uuid` |
| `type` | `type` | `ExceptionType` | - |
| `severity` | `severity` | `Severity` | - |
| `status` | `status` | `ExceptionStatus` | `@default(OPEN)` |
| `dedupKey` | `dedup_key` | `String` | `@unique @map("dedup_key")` |
| `primaryEntityType` | `primary_entity_type` | `String?` | `@map("primary_entity_type")` |
| `primaryEntityId` | `primary_entity_id` | `String?` | `@map("primary_entity_id") @db.Uuid` |
| `expectedAmount` | `expected_amount` | `BigInt?` | `@map("expected_amount")` |
| `actualAmount` | `actual_amount` | `BigInt?` | `@map("actual_amount")` |
| `differenceAmount` | `difference_amount` | `BigInt?` | `@map("difference_amount")` |
| `financialImpact` | `financial_impact` | `BigInt` | `@default(0) @map("financial_impact")` |
| `customerImpact` | `customer_impact` | `ImpactLevel` | `@default(LOW) @map("customer_impact")` |
| `severityScore` | `severity_score` | `Int` | `@default(0) @map("severity_score")` |
| `occurrenceCount` | `occurrence_count` | `Int` | `@default(1) @map("occurrence_count")` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `lastSeenAt` | `last_seen_at` | `DateTime` | `@default(now()) @map("last_seen_at") @db.Timestamptz(6)` |
| `resolvedAt` | `resolved_at` | `DateTime?` | `@map("resolved_at") @db.Timestamptz(6)` |
| `resolutionNote` | `resolution_note` | `String?` | `@map("resolution_note")` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `run: ReconciliationRun?` — `@relation(fields: [runId], references: [id])`.
- `events: ExceptionEvent[]`.
- `aiAnalyses: AiAnalysis[]`.
- `actions: Action[]`.

Declared indexes/compound constraints:

- `@@index([merchantId, status, severity])`.
- `@@index([merchantId, createdAt])`.
- `@@index([type])`.

### ExceptionEvent (`exception_events`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `exceptionId` | `exception_id` | `String` | `@map("exception_id") @db.Uuid` |
| `eventType` | `event_type` | `String` | `@map("event_type")` |
| `entityType` | `entity_type` | `String` | `@map("entity_type")` |
| `entityId` | `entity_id` | `String?` | `@map("entity_id") @db.Uuid` |
| `snapshot` | `snapshot` | `Json` | - |
| `occurredAt` | `occurred_at` | `DateTime` | `@map("occurred_at") @db.Timestamptz(6)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `exception: Exception` — `@relation(fields: [exceptionId], references: [id], onDelete: Cascade)`.

Declared indexes/compound constraints:

- `@@unique([exceptionId, eventType, entityId], name: "exception_event_unique")`.
- `@@index([exceptionId, occurredAt])`.

### AiAnalysis (`ai_analyses`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `exceptionId` | `exception_id` | `String` | `@map("exception_id") @db.Uuid` |
| `summary` | `summary` | `String` | - |
| `likelyCause` | `likely_cause` | `String` | `@map("likely_cause")` |
| `confidence` | `confidence` | `Int` | - |
| `financialExposure` | `financial_exposure` | `BigInt` | `@map("financial_exposure")` |
| `customerImpact` | `customer_impact` | `String` | `@map("customer_impact")` |
| `recommendedAction` | `recommended_action` | `String` | `@map("recommended_action")` |
| `evidenceChain` | `evidence_chain` | `Json` | `@map("evidence_chain")` |
| `nextSteps` | `next_steps` | `Json` | `@map("next_steps")` |
| `model` | `model` | `String` | - |
| `promptVersion` | `prompt_version` | `String` | `@map("prompt_version")` |
| `toolCalls` | `tool_calls` | `Json?` | `@map("tool_calls")` |
| `latencyMs` | `latency_ms` | `Int?` | `@map("latency_ms")` |
| `isFallback` | `is_fallback` | `Boolean` | `@default(false) @map("is_fallback")` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `exception: Exception` — `@relation(fields: [exceptionId], references: [id], onDelete: Cascade)`.

Declared indexes/compound constraints:

- `@@index([exceptionId, createdAt])`.

### Action (`actions`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `exceptionId` | `exception_id` | `String` | `@map("exception_id") @db.Uuid` |
| `actionType` | `action_type` | `ActionType` | `@map("action_type")` |
| `status` | `status` | `ActionStatus` | `@default(PROPOSED)` |
| `parameters` | `parameters` | `Json` | - |
| `executionProtocol` | `execution_protocol` | `String?` | `@map("execution_protocol")` |
| `requiredApprovals` | `required_approvals` | `Int` | `@default(0) @map("required_approvals")` |
| `targetPaymentId` | `target_payment_id` | `String?` | `@map("target_payment_id") @db.Uuid` |
| `targetOrderId` | `target_order_id` | `String?` | `@map("target_order_id") @db.Uuid` |
| `reservedAmount` | `reserved_amount` | `BigInt` | `@default(0) @map("reserved_amount")` |
| `executionLeaseUntil` | `execution_lease_until` | `DateTime?` | `@map("execution_lease_until") @db.Timestamptz(6)` |
| `executionClaimToken` | `execution_claim_token` | `String?` | `@map("execution_claim_token") @db.Uuid` |
| `externalSubmittedAt` | `external_submitted_at` | `DateTime?` | `@map("external_submitted_at") @db.Timestamptz(6)` |
| `proposedByAi` | `proposed_by_ai` | `Boolean` | `@default(false) @map("proposed_by_ai")` |
| `requestedById` | `requested_by` | `String?` | `@map("requested_by") @db.Uuid` |
| `approvedById` | `approved_by` | `String?` | `@map("approved_by") @db.Uuid` |
| `approvalRequired` | `approval_required` | `Boolean` | `@default(true) @map("approval_required")` |
| `approvedAt` | `approved_at` | `DateTime?` | `@map("approved_at") @db.Timestamptz(6)` |
| `reviewReason` | `review_reason` | `String?` | `@map("review_reason")` |
| `policyDecision` | `policy_decision` | `Json?` | `@map("policy_decision")` |
| `idempotencyKey` | `idempotency_key` | `String` | `@unique @map("idempotency_key")` |
| `executionResult` | `execution_result` | `Json?` | `@map("execution_result")` |
| `failureReason` | `failure_reason` | `String?` | `@map("failure_reason")` |
| `executedAt` | `executed_at` | `DateTime?` | `@map("executed_at") @db.Timestamptz(6)` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `updated_at` | `DateTime` | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

Relations:

- `approvals: ActionApproval[]`.
- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `exception: Exception` — `@relation(fields: [exceptionId], references: [id])`.
- `requestedBy: User?` — `@relation("ActionRequestedBy", fields: [requestedById], references: [id])`.
- `approvedBy: User?` — `@relation("ActionApprovedBy", fields: [approvedById], references: [id])`.

Declared indexes/compound constraints:

- `@@index([merchantId, status])`.
- `@@index([merchantId, targetOrderId, actionType, status])`.
- `@@index([exceptionId])`.

### AuditLog (`audit_logs`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `merchantId` | `merchant_id` | `String` | `@map("merchant_id") @db.Uuid` |
| `userId` | `user_id` | `String?` | `@map("user_id") @db.Uuid` |
| `actorType` | `actor_type` | `String` | `@default("USER") @map("actor_type")` |
| `action` | `action` | `String` | - |
| `entityType` | `entity_type` | `String` | `@map("entity_type")` |
| `entityId` | `entity_id` | `String?` | `@map("entity_id") @db.Uuid` |
| `beforeState` | `before_state` | `Json?` | `@map("before_state")` |
| `afterState` | `after_state` | `Json?` | `@map("after_state")` |
| `reason` | `reason` | `String?` | - |
| `correlationId` | `correlation_id` | `String?` | `@map("correlation_id")` |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `merchant: Merchant` — `@relation(fields: [merchantId], references: [id], onDelete: Cascade)`.
- `user: User?` — `@relation(fields: [userId], references: [id])`.

Declared indexes/compound constraints:

- `@@index([entityType, entityId])`.
- `@@index([merchantId, createdAt])`.

### ActionApproval (`action_approvals`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `actionId` | `action_id` | `String` | `@map("action_id") @db.Uuid` |
| `userId` | `user_id` | `String` | `@map("user_id") @db.Uuid` |
| `reason` | `reason` | `String` | - |
| `createdAt` | `created_at` | `DateTime` | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

Relations:

- `action: Action` — `@relation(fields: [actionId], references: [id], onDelete: Cascade)`.
- `user: User` — `@relation(fields: [userId], references: [id])`.

Declared indexes/compound constraints:

- `@@unique([actionId, userId])`.

### SettlementAllocation (`settlement_allocations`)

| Prisma field | Stored column | Prisma type | Current attributes |
| --- | --- | --- | --- |
| `id` | `id` | `String` | `@id @default(uuid()) @db.Uuid` |
| `settlementId` | `settlement_id` | `String` | `@map("settlement_id") @db.Uuid` |
| `paymentId` | `payment_id` | `String` | `@map("payment_id") @db.Uuid` |
| `grossAmount` | `gross_amount` | `BigInt` | `@map("gross_amount")` |
| `refundAmount` | `refund_amount` | `BigInt` | `@default(0) @map("refund_amount")` |
| `feeAmount` | `fee_amount` | `BigInt` | `@default(0) @map("fee_amount")` |
| `taxAmount` | `tax_amount` | `BigInt` | `@default(0) @map("tax_amount")` |
| `adjustmentAmount` | `adjustment_amount` | `BigInt` | `@default(0) @map("adjustment_amount")` |

Relations:

- `settlement: Settlement` — `@relation(fields: [settlementId], references: [id], onDelete: Cascade)`.
- `payment: Payment` — `@relation(fields: [paymentId], references: [id])`.

Declared indexes/compound constraints:

- `@@unique([settlementId, paymentId])`.

## Financial and recovery meaning

| Model / fields | Domain meaning |
| --- | --- |
| SettlementAllocation | Explicit membership: gross minus refund/fees/tax plus signed adjustment equals net. Import validates ownership, currency, capture/refund capacity across non-FAILED batches, and net equality. Only valid PROCESSED batches contribute coverage. |
| Action.targetPaymentId / reservedAmount | Pending, approved, executing, and uncertain refund intents reserve capacity. CREATED/PROCESSING/PROCESSED refund rows also consume capacity; completed actions are not counted again after refund evidence replaces their reservation. |
| Action.targetOrderId | Protects order-level payment-link uniqueness across exception changes. Legacy rows also match stored parameters or parent identity. |
| Action.executionClaimToken / lease / externalSubmittedAt | Fences the owner and records the external uncertainty boundary. Recovery locks/re-reads current state; submission requires matching ownership and a live lease. |
| ActionApproval | One vote per action/user; services exclude the requester and enforce the required distinct count. |
| WebhookEvent | Durable dispatch intent plus signature diagnostics, claim token, expiry, attempts, and retry metadata. |
| ReconciliationRun | Durable work status and same-run coverage/volume snapshot. Starting/listing runs marks IN_PROGRESS rows older than five minutes FAILED; the schema does not provide a heartbeat or independent timeout worker. |
| Exception / ExceptionEvent | Current discrepancy facts plus lifecycle evidence; locked service transitions preserve current operator decisions. |
| AiAnalysis / AuditLog | Validated explanation and required decision/outcome evidence; transactional writes do not by themselves make logs tamper-evident. |

Refund action completion and webhook ingestion lock the same payment before deriving its processed-refund state. BankTransaction payment/refund references establish candidate evidence but still require direction, posting, amount, currency, and relationship validation.

## Schema changes and existing data

Changes were first verified on disposable databases. The configured local learning database was subsequently backed up, restored/rehearsed, and upgraded on 22 October 2026; legacy values were preserved as recorded in [verification](../operations/fix-verification.md).

That historical upgrade does not describe another database's state. Follow the [existing-data upgrade workflow](../operations/local-development.md#updating-an-existing-learning-database) before applying reviewed changes elsewhere. The retained SQL is a one-time upgrade for an inspected earlier schema, not a complete migration history.
