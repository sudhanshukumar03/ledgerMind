-- Reviewed upgrade from the pre-correction learning schema.
-- Rehearse against a restored backup before applying; never reset existing records.
-- AlterEnum
ALTER TYPE "ActionStatus" ADD VALUE 'OUTCOME_UNKNOWN';

-- AlterEnum
ALTER TYPE "WebhookProcessingStatus" ADD VALUE 'UNSUPPORTED';

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "execution_claim_token" UUID,
ADD COLUMN     "execution_lease_until" TIMESTAMPTZ(6),
ADD COLUMN     "execution_protocol" TEXT,
ADD COLUMN     "external_submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "required_approvals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserved_amount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "target_order_id" UUID,
ADD COLUMN     "target_payment_id" UUID;

-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN     "payment_id" UUID,
ADD COLUMN     "refund_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "provider_order_id" TEXT;

-- AlterTable
ALTER TABLE "reconciliation_runs" ADD COLUMN     "captured_payments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "captured_volume" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "matched_payments" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "claim_token" TEXT,
ADD COLUMN     "lease_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "action_approvals" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_allocations" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "gross_amount" BIGINT NOT NULL,
    "refund_amount" BIGINT NOT NULL DEFAULT 0,
    "fee_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "adjustment_amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "settlement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "action_approvals_action_id_user_id_key" ON "action_approvals"("action_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_allocations_settlement_id_payment_id_key" ON "settlement_allocations"("settlement_id", "payment_id");

-- CreateIndex
CREATE INDEX "actions_merchant_id_target_order_id_action_type_status_idx" ON "actions"("merchant_id", "target_order_id", "action_type", "status");

-- AddForeignKey
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_approvals" ADD CONSTRAINT "action_approvals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
