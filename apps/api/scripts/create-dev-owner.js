// Creates the owner account for LOCAL development from DEV_OWNER_EMAIL and
// DEV_OWNER_PASSWORD in the root .env, so nobody has to type at a prompt.
// Never use this for the deployed app: run `pnpm --filter api setup:owner` there.
//   pnpm --filter api build && node apps/api/scripts/create-dev-owner.js
const { existsSync } = require('node:fs');
const path = require('node:path');

const rootEnv = path.resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { createPrismaClient } = require('@pa/db');
const { createOwner } = require('../dist/auth/owner');

async function main() {
  const { DATABASE_URL, DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD } = process.env;
  if (!DATABASE_URL || !DEV_OWNER_EMAIL || !DEV_OWNER_PASSWORD) {
    throw new Error('Set DATABASE_URL, DEV_OWNER_EMAIL and DEV_OWNER_PASSWORD in .env first');
  }
  if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL)) {
    throw new Error('This script only runs against a local database');
  }
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const existing = await prisma.user.findFirst();
    await createOwner(prisma, DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD, { resetPassword: Boolean(existing) });
    console.log(existing ? 'Local owner password reset.' : 'Local owner created.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
