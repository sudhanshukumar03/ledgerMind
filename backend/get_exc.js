import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const loginRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ledgermind.dev', password: 'demo1234' })
  });
  const { access_token } = await loginRes.json();

  const result = await fetch('http://127.0.0.1:3001/api/v1/reconciliation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
  });
  console.log(await result.text());

  const excs = await prisma.exception.findMany({
    where: { type: 'BANK_PAYMENT_MISMATCH' }
  });
  console.log('Exceptions:', excs.map(e => e.exceptionId));
}
main().catch(console.error).finally(() => prisma.$disconnect());
