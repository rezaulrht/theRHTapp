// Creates the app's single account, or resets its password.
//   pnpm --filter api setup:owner
//   pnpm --filter api setup:owner --reset-password
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createPrismaClient } from '@pa/db';
import { loadEnv } from '../env';
import { createOwner } from './owner';

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    muted = hidden;
  });
}

async function main(): Promise<void> {
  const rootEnv = path.resolve(__dirname, '../../../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const env = loadEnv();
  const resetPassword = process.argv.includes('--reset-password');

  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const email = resetPassword ? '' : await ask('Email: ');
    const password = await ask(resetPassword ? 'New password: ' : 'Password: ', true);
    const again = await ask('Repeat password: ', true);
    if (password !== again) throw new Error('The two passwords do not match');
    await createOwner(prisma, email, password, { resetPassword });
    console.log(resetPassword ? 'Password changed. All devices were logged out.' : 'Owner account created.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
