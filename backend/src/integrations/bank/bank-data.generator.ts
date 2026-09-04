/**
 * BankDataGenerator
 *
 * Generates synthetic bank transactions for offline reconciliation testing.
 * This is ADDITIVE — it does not delete existing records.
 *
 * Scenarios produced:
 *  ✓ Clean matched credits (settlement UTR + amount match) — should NOT cause exceptions
 *  ✓ Settlement amount mismatch (same UTR, different amount) → SETTLEMENT_AMOUNT_MISMATCH
 *  ✓ Bank credit with no settlement anchor            → BANK_MISMATCH
 *  ✓ Bank credit for a FAILED payment                 → BANK_PAYMENT_MISMATCH
 *  ✓ Refund PROCESSING >30h, no bank debit            → REFUND_DELAY
 *  ✓ Duplicate CAPTURED payments on one order         → DUPLICATE_PAYMENT
 *  ✓ Duplicate bank credit (same UTR twice)           → BANK_MISMATCH (double credit)
 *  ✓ Random noise (vendor debits, GST, salary)        — should NOT cause exceptions
 *
 * All amounts are BigInt paise. No floats anywhere.
 */

import {
  PrismaClient,
  BankTransactionType,
  BankTransactionStatus,
  PaymentStatus,
  RefundStatus,
  OrderStatus,
  SettlementStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const rupees = (r: number): bigint => BigInt(Math.round(r)) * 100n;

const daysAgo = (d: number): Date => {
  const x = new Date();
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - d);
  return x;
};

const hoursAgo = (h: number): Date => new Date(Date.now() - h * 3_600_000);

const uid = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randAmount = (): bigint => rupees(randInt(500, 25_000));

// ─── Public interface ─────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Override merchant. Falls back to DEMO_MERCHANT_ID env or first merchant in DB. */
  merchantId?: string;
  /** Clean matched settlement+bank pairs to produce (default 8). */
  cleanCount?: number;
  /** Random non-Razorpay noise transactions (default 6). */
  noiseCount?: number;
  /**
   * When true (default), the generator also creates the Orders / Payments / Refunds
   * that are prerequisites for the BANK_PAYMENT_MISMATCH, REFUND_DELAY, and
   * DUPLICATE_PAYMENT scenarios.
   */
  createPrerequisites?: boolean;
}

// ─── Generator class ──────────────────────────────────────────────────────────

export class BankDataGenerator {
  constructor(private readonly prisma: PrismaClient) {}

  async generate(opts: GenerateOptions = {}): Promise<void> {
    const merchantId = await this.resolveMerchantId(opts.merchantId);
    const cleanCount = opts.cleanCount ?? 8;
    const noiseCount = opts.noiseCount ?? 6;
    const createPrerequisites = opts.createPrerequisites ?? true;

    console.log(`\n🏦  BankDataGenerator`);
    console.log(`    merchant  : ${merchantId}`);
    console.log(`    clean     : ${cleanCount}`);
    console.log(`    noise     : ${noiseCount}`);
    console.log(`    prereqs   : ${createPrerequisites}\n`);

    await this.generateCleanPairs(merchantId, cleanCount);
    await this.generateSettlementAmountMismatch(merchantId);
    await this.generateBankCreditNoSettlement(merchantId);

    if (createPrerequisites) {
      await this.generateBankCreditForFailedPayment(merchantId);
      await this.generateRefundDelayScenario(merchantId);
      await this.generateDuplicatePaymentScenario(merchantId);
    }

    await this.generateDuplicateCredit(merchantId);
    await this.generateNoise(merchantId, noiseCount);

    const count = await this.prisma.bankTransaction.count({ where: { merchantId } });
    console.log(`\n✅  Done. Total bank_transactions for merchant: ${count}`);
    console.log('    POST /api/v1/reconciliation/run to trigger exception generation.\n');
  }

  // ─── Scenario 1 ──────────────────────────────────────────────────────────────
  // Clean settlement → bank credit pairs. Amount and UTR match exactly.
  // These MUST NOT produce exceptions — they validate engine discrimination.

  private async generateCleanPairs(merchantId: string, count: number): Promise<void> {
    console.log(`  [1] ${count}x clean matched pairs`);
    for (let i = 0; i < count; i++) {
      const amt = randAmount();
      const utr = `UTR-GEN-CLEAN-${uid('u')}`;
      const settlementId = uid('c');
      const when = hoursAgo(randInt(48, 120));

      await this.prisma.settlement.create({
        data: {
          id: settlementId,
          settlementId: uid('setl'),
          merchantId,
          amount: amt,
          settlementDate: daysAgo(randInt(1, 4)),
          status: SettlementStatus.PROCESSED,
          utr,
          createdAt: when,
        },
      });

      await this.prisma.bankTransaction.create({
        data: {
          bankTxnId: uid('bank'),
          merchantId,
          utr,
          amount: amt,
          transactionType: BankTransactionType.CREDIT,
          transactionDate: daysAgo(randInt(1, 4)),
          valueAt: new Date(when.getTime() + 15 * 60_000),
          description: `NEFT CR ${utr} RAZORPAY SETTLEMENT`,
          status: BankTransactionStatus.POSTED,
          settlementId,
        },
      });
    }
  }

  // ─── Scenario 2 ──────────────────────────────────────────────────────────────
  // Settlement records ₹15,000 but bank credited ₹14,600 (₹400 short).
  // Expected exception: SETTLEMENT_AMOUNT_MISMATCH

  private async generateSettlementAmountMismatch(merchantId: string): Promise<void> {
    console.log('  [2] settlement amount mismatch (₹15,000 vs ₹14,600)');
    const settlementAmt = rupees(15_000);
    const bankAmt = rupees(14_600); // ₹400 short
    const utr = `UTR-GEN-MISMATCH-${uid('u')}`;
    const settlementId = uid('c');

    await this.prisma.settlement.create({
      data: {
        id: settlementId,
        settlementId: uid('setl'),
        merchantId,
        amount: settlementAmt,
        settlementDate: daysAgo(2),
        status: SettlementStatus.PROCESSED,
        utr,
        createdAt: hoursAgo(50),
      },
    });

    await this.prisma.bankTransaction.create({
      data: {
        bankTxnId: uid('bank'),
        merchantId,
        utr,
        amount: bankAmt, // ← short
        transactionType: BankTransactionType.CREDIT,
        transactionDate: daysAgo(2),
        valueAt: hoursAgo(49),
        description: `NEFT CR ${utr} RAZORPAY SETTLEMENT`,
        status: BankTransactionStatus.POSTED,
        settlementId,
      },
    });
  }

  // ─── Scenario 3 ──────────────────────────────────────────────────────────────
  // Bank shows a credit with a UTR that has no matching settlement.
  // Expected exception: BANK_MISMATCH

  private async generateBankCreditNoSettlement(merchantId: string): Promise<void> {
    console.log('  [3] bank credit with no matching settlement');
    await this.prisma.bankTransaction.create({
      data: {
        bankTxnId: uid('bank'),
        merchantId,
        utr: `UTR-GEN-UNKNOWN-${uid('u')}`,
        amount: rupees(randInt(3_000, 20_000)),
        transactionType: BankTransactionType.CREDIT,
        transactionDate: daysAgo(1),
        valueAt: hoursAgo(20),
        description: 'NEFT CR UNKNOWN-UTR RAZORPAY',
        status: BankTransactionStatus.POSTED,
        // settlementId intentionally absent
      },
    });
  }

  // ─── Scenario 4 ──────────────────────────────────────────────────────────────
  // Payment status = FAILED, but bank received a credit for the same amount.
  // Expected exception: BANK_PAYMENT_MISMATCH

  private async generateBankCreditForFailedPayment(merchantId: string): Promise<void> {
    console.log('  [4] bank credit against a FAILED payment');
    const amt = rupees(randInt(5_000, 30_000));
    const utr = `UTR-GEN-FAILPAY-${uid('u')}`;
    const orderId = uid('ord');
    const paymentId = uid('pay');

    await this.prisma.order.create({
      data: {
        id: orderId,
        orderId: uid('order'),
        merchantId,
        amount: amt,
        customerId: `cust_gen_${uid('c')}`,
        status: OrderStatus.ATTEMPTED,
        createdAt: hoursAgo(6),
      },
    });

    await this.prisma.payment.create({
      data: {
        id: paymentId,
        paymentId: uid('pay_rz'),
        merchantId,
        orderId,
        amount: amt,
        method: 'netbanking',
        status: PaymentStatus.FAILED,
        createdAt: hoursAgo(6),
      },
    });

    // Bank got the money despite the gateway failure
    await this.prisma.bankTransaction.create({
      data: {
        bankTxnId: uid('bank'),
        merchantId,
        utr,
        amount: amt,
        transactionType: BankTransactionType.CREDIT,
        transactionDate: daysAgo(0),
        valueAt: hoursAgo(5),
        description: `NEFT CR ${utr} CUSTOMER PAYMENT`,
        status: BankTransactionStatus.POSTED,
      },
    });
  }

  // ─── Scenario 5 ──────────────────────────────────────────────────────────────
  // Refund raised 30+ hours ago, still PROCESSING. No bank debit issued.
  // Expected exception: REFUND_DELAY

  private async generateRefundDelayScenario(merchantId: string): Promise<void> {
    console.log('  [5] refund delay (PROCESSING >30h, no bank debit)');
    const amt = rupees(randInt(1_000, 8_000));
    const orderId = uid('ord');
    const paymentRowId = uid('pay');

    await this.prisma.order.create({
      data: {
        id: orderId,
        orderId: uid('order'),
        merchantId,
        amount: amt,
        customerId: `cust_gen_${uid('c')}`,
        status: OrderStatus.PAID,
        createdAt: hoursAgo(40),
      },
    });

    await this.prisma.payment.create({
      data: {
        id: paymentRowId,
        paymentId: uid('pay_rz'),
        merchantId,
        orderId,
        amount: amt,
        method: 'upi',
        status: PaymentStatus.CAPTURED,
        capturedAt: hoursAgo(40),
        createdAt: hoursAgo(40),
      },
    });

    await this.prisma.refund.create({
      data: {
        refundId: uid('rfnd_rz'),
        merchantId,
        paymentId: paymentRowId,
        amount: amt,
        status: RefundStatus.PROCESSING,
        createdAt: hoursAgo(30),
        // processedAt intentionally null
      },
    });
    // No bank debit — that's the mismatch
  }

  // ─── Scenario 6 ──────────────────────────────────────────────────────────────
  // Two CAPTURED payments on the same order.
  // Expected exception: DUPLICATE_PAYMENT

  private async generateDuplicatePaymentScenario(merchantId: string): Promise<void> {
    console.log('  [6] duplicate CAPTURED payments on same order');
    const amt = rupees(randInt(1_500, 6_000));
    const orderId = uid('ord');

    await this.prisma.order.create({
      data: {
        id: orderId,
        orderId: uid('order'),
        merchantId,
        amount: amt,
        customerId: `cust_gen_${uid('c')}`,
        status: OrderStatus.PAID,
        createdAt: hoursAgo(12),
      },
    });

    // createMany does not guarantee UUID uniqueness from uid(), so create sequentially
    await this.prisma.payment.create({
      data: {
        id: uid('pay'),
        paymentId: uid('pay_rz'),
        merchantId,
        orderId,
        amount: amt,
        method: 'upi',
        status: PaymentStatus.CAPTURED,
        capturedAt: hoursAgo(12),
        createdAt: hoursAgo(12),
      },
    });

    await this.prisma.payment.create({
      data: {
        id: uid('pay'),
        paymentId: uid('pay_rz'),
        merchantId,
        orderId,
        amount: amt,
        method: 'upi',
        status: PaymentStatus.CAPTURED,
        capturedAt: hoursAgo(11),
        createdAt: hoursAgo(11),
      },
    });
  }

  // ─── Scenario 7 ──────────────────────────────────────────────────────────────
  // Two bank CREDITs arrive with the same UTR and amount.
  // Expected exception: BANK_MISMATCH (double credit)

  private async generateDuplicateCredit(merchantId: string): Promise<void> {
    console.log('  [7] duplicate bank credit (same UTR × 2)');
    const amt = rupees(randInt(2_000, 10_000));
    const utr = `UTR-GEN-DUP-${uid('u')}`;
    const settlementId = uid('c');

    await this.prisma.settlement.create({
      data: {
        id: settlementId,
        settlementId: uid('setl'),
        merchantId,
        amount: amt,
        settlementDate: daysAgo(1),
        status: SettlementStatus.PROCESSED,
        utr,
        createdAt: hoursAgo(30),
      },
    });

    await this.prisma.bankTransaction.create({
      data: {
        bankTxnId: uid('bank'),
        merchantId,
        utr,
        amount: amt,
        transactionType: BankTransactionType.CREDIT,
        transactionDate: daysAgo(1),
        valueAt: hoursAgo(29),
        description: `NEFT CR ${utr} RAZORPAY`,
        status: BankTransactionStatus.POSTED,
        settlementId,
      },
    });

    // Second credit — same UTR, orphaned (no settlement link)
    await this.prisma.bankTransaction.create({
      data: {
        bankTxnId: uid('bank'),
        merchantId,
        utr,
        amount: amt,
        transactionType: BankTransactionType.CREDIT,
        transactionDate: daysAgo(1),
        valueAt: hoursAgo(28),
        description: `NEFT CR ${utr} RAZORPAY DUPLICATE`,
        status: BankTransactionStatus.POSTED,
      },
    });
  }

  // ─── Noise ────────────────────────────────────────────────────────────────────
  // Non-Razorpay transactions (salaries, GST, vendor invoices).
  // Should NOT trigger any reconciliation exceptions.

  private async generateNoise(merchantId: string, count: number): Promise<void> {
    console.log(`  [N] ${count}x random noise transactions`);
    const descs = [
      'NEFT DR GSTN TAX PAYMENT',
      'NEFT DR VENDOR PAYMENT OFFICE SUPPLIES',
      'IMPS CR REFUND FROM VENDOR',
      'NEFT DR SALARY TRANSFER BATCH',
      'IMPS CR MISCELLANEOUS CREDIT',
      'NEFT DR CLOUD INFRA PAYMENT',
      'NACH DR INSURANCE PREMIUM',
      'IMPS CR CUSTOMER ADVANCE',
    ];

    for (let i = 0; i < count; i++) {
      const isCredit = Math.random() > 0.4;
      await this.prisma.bankTransaction.create({
        data: {
          bankTxnId: uid('bank'),
          merchantId,
          utr: Math.random() > 0.5 ? `UTR-NOISE-${uid('u')}` : undefined,
          amount: randAmount(),
          transactionType: isCredit ? BankTransactionType.CREDIT : BankTransactionType.DEBIT,
          transactionDate: daysAgo(randInt(0, 5)),
          valueAt: hoursAgo(randInt(1, 100)),
          description: descs[i % descs.length],
          status: BankTransactionStatus.POSTED,
        },
      });
    }
  }

  // ─── Merchant resolver ────────────────────────────────────────────────────────

  private async resolveMerchantId(override?: string): Promise<string> {
    if (override) return override;

    const envId = process.env.DEMO_MERCHANT_ID;
    if (envId) return envId;

    const first = await this.prisma.merchant.findFirst({ select: { id: true } });
    if (!first) {
      throw new Error(
        'No merchant in database. Run `npx prisma db seed` first, or set DEMO_MERCHANT_ID.',
      );
    }
    return first.id;
  }
}
