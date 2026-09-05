import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const loginRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ledgermind.dev', password: 'demo1234' })
  });
  const { access_token } = await loginRes.json();

  const excs = await prisma.exception.findMany({
    where: { type: 'BANK_PAYMENT_MISMATCH' }
  });
  const exceptionId = excs[0].exceptionId;
  console.log('Investigating:', exceptionId);

  const result = await fetch(`http://127.0.0.1:3001/api/v1/ai/investigate/${exceptionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
  });
  console.log(await result.text());
}
main().catch(console.error).finally(() => prisma.$disconnect());
