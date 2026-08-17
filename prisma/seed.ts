import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Creates (or updates) the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD
 * in your .env. Run with: npm run db:seed
 */
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'SyncPost Admin';

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env before seeding.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name, role: 'ADMIN', isActive: true },
    update: { passwordHash, name, role: 'ADMIN', isActive: true },
  });

  console.log(`Admin ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
