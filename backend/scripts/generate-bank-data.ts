import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

const uid = (bucket: string, n: number) =>
  `${bucket.repeat(8)}-${bucket.repeat(4)}-4${bucket.repeat(3)}-8${bucket.repeat(3)}-${String(n).padStart(12, '0')}`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

async function main() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    console.error('No merchant found in database. Run seed first.');
    process.exit(1);
  }

  const exceptionCountBefore = await prisma.exception.count();

  // Create pay_DEMO002 - successful payment, no bank credit
  const demoOrderId = uid('8', 2);
  const demoPayId = uid('9', 2);
  const amt = 75000n; // ₹750

  await prisma.order.upsert({
    where: { orderId: 'order_DEMO002' },
    create: {
      id: demoOrderId,
      orderId: 'order_DEMO002',
      merchantId: merchant.id,
      amount: amt,
      customerId: 'cust_DEMO002',
      status: OrderStatus.PAID,
      createdAt: hoursAgo(2),
    },
    update: {},
  });

  await prisma.payment.upsert({
    where: { paymentId: 'pay_DEMO002' },
    create: {
      id: demoPayId,
      paymentId: 'pay_DEMO002',
      merchantId: merchant.id,
      orderId: demoOrderId,
      amount: amt,
      method: 'card',
      status: PaymentStatus.CAPTURED,
      capturedAt: hoursAgo(2),
      createdAt: hoursAgo(2),
    },
    update: {},
  });

  // Noise 1: Missing settlement (another one, ₹300)
  const noise1OrderId = uid('8', 11);
  await prisma.order.upsert({
    where: { orderId: 'order_NOISE001' },
    create: { id: noise1OrderId, orderId: 'order_NOISE001', merchantId: merchant.id, amount: 30000n, status: OrderStatus.PAID, createdAt: hoursAgo(75) }, 
    update: {}
  });
  await prisma.payment.upsert({
    where: { paymentId: 'pay_NOISE001' },
    create: { id: uid('9', 11), paymentId: 'pay_NOISE001', merchantId: merchant.id, orderId: noise1OrderId, amount: 30000n, method: 'upi', status: PaymentStatus.CAPTURED, capturedAt: hoursAgo(75), createdAt: hoursAgo(75) }, 
    update: {}
  });

  // Noise 2: Duplicate payment
  const noise2OrderId = uid('8', 12);
  await prisma.order.upsert({
    where: { orderId: 'order_NOISE002' },
    create: { id: noise2OrderId, orderId: 'order_NOISE002', merchantId: merchant.id, amount: 15000n, status: OrderStatus.PAID, createdAt: hoursAgo(10) }, 
    update: {}
  });
  await prisma.payment.upsert({
    where: { paymentId: 'pay_NOISE002A' },
    create: { id: uid('9', 12), paymentId: 'pay_NOISE002A', merchantId: merchant.id, orderId: noise2OrderId, amount: 15000n, method: 'card', status: PaymentStatus.CAPTURED, capturedAt: hoursAgo(10), createdAt: hoursAgo(10) }, 
    update: {}
  });
  await prisma.payment.upsert({
    where: { paymentId: 'pay_NOISE002B' },
    create: { id: uid('9', 13), paymentId: 'pay_NOISE002B', merchantId: merchant.id, orderId: noise2OrderId, amount: 15000n, method: 'card', status: PaymentStatus.CAPTURED, capturedAt: hoursAgo(10), createdAt: hoursAgo(10) }, 
    update: {}
  });

  const exceptionCountAfter = await prisma.exception.count();

  console.log(`✓ Data injected for ${merchant.name}`);
  console.log(`✓ Exceptions before: ${exceptionCountBefore}`);
  console.log(`✓ Exceptions after: ${exceptionCountAfter}`);

  if (exceptionCountBefore !== exceptionCountAfter) {
    console.error('❌ Exception count changed! Script must not create exceptions.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => {
  console.error("FATAL ERROR IN SCRIPT:");
  console.dir(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
