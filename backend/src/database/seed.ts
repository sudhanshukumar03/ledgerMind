import { PrismaClient, OrderStatus, PaymentStatus, SettlementStatus, BankTransactionType, BankTransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding LedgerMind database...');

  // 1. Create demo merchant
  // We use findFirst + create because email is not marked as @unique on Merchant
  let merchant = await prisma.merchant.findFirst({
    where: { email: 'demo@ledgermind.com' },
  });

  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        name: 'Demo Store',
        email: 'demo@ledgermind.com',
        razorpayAccountId: 'acc_demo',
      },
    });
  }

  // 2. Create admin user
  const hashedPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@ledgermind.com' },
    update: {},
    create: {
      email: 'admin@ledgermind.com',
      name: 'Admin',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      merchantId: merchant.id,
    },
  });

  // 3. Create synthetic data: one clean transaction + one mismatch
  const order1 = await prisma.order.create({
    data: {
      orderId: 'ORD-DEMO-001',
      merchantId: merchant.id,
      amount: BigInt(50000),
      currency: 'INR',
      customerId: 'CUST-001',
      status: OrderStatus.PAID,
    },
  });

  await prisma.payment.create({
    data: {
      paymentId: 'PAY-DEMO-001',
      merchantId: merchant.id,
      orderId: order1.id,
      amount: BigInt(50000),
      status: PaymentStatus.CAPTURED,
      capturedAt: new Date(),
    },
  });

  const settlement1 = await prisma.settlement.create({
    data: {
      settlementId: 'STL-DEMO-001',
      merchantId: merchant.id,
      amount: BigInt(50000),
      settlementDate: new Date(),
      status: SettlementStatus.PROCESSED,
      utr: 'UTR-DEMO-001',
    },
  });

  await prisma.bankTransaction.create({
    data: {
      bankTxnId: 'BT-DEMO-001',
      merchantId: merchant.id,
      utr: 'UTR-DEMO-001',
      amount: BigInt(50000),
      transactionType: BankTransactionType.CREDIT,
      transactionDate: new Date(),
      status: BankTransactionStatus.POSTED,
      settlementId: settlement1.id,
    },
  });

  // Mismatch: order paid but no payment captured
  const order2 = await prisma.order.create({
    data: {
      orderId: 'ORD-DEMO-002',
      merchantId: merchant.id,
      amount: BigInt(20000),
      currency: 'INR',
      customerId: 'CUST-002',
      status: OrderStatus.PAID,
    },
  });

  // No payment for order2 → will generate PAYMENT_MISSING exception
  console.log(`✅ Created order ${order2.orderId} without payment to trigger PAYMENT_MISSING`);

  // Mismatch: payment failed but bank shows credit
  const order3 = await prisma.order.create({
    data: {
      orderId: 'ORD-DEMO-003',
      merchantId: merchant.id,
      amount: BigInt(50000),
      currency: 'INR',
      customerId: 'CUST-003',
      status: OrderStatus.ATTEMPTED,
    },
  });

  await prisma.payment.create({
    data: {
      paymentId: 'PAY-DEMO-003',
      merchantId: merchant.id,
      orderId: order3.id,
      amount: BigInt(50000),
      status: PaymentStatus.FAILED,
    },
  });

  await prisma.bankTransaction.create({
    data: {
      bankTxnId: 'BT-DEMO-003',
      merchantId: merchant.id,
      utr: 'UTR-DEMO-003',
      amount: BigInt(50000),
      transactionType: BankTransactionType.CREDIT,
      transactionDate: new Date(),
      status: BankTransactionStatus.POSTED,
    },
  });

  console.log('🌱 Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
