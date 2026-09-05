import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const ex = await prisma.exception.findFirst({
    where: { financialImpact: 5000000 }
  });
  console.log(ex);
}
main().finally(() => prisma.$disconnect());
