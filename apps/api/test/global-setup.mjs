// Starts a throwaway PostgreSQL server for the test run and applies migrations.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalDb } from '@pa/db/local-db';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPackage = path.resolve(here, '../../../packages/db');

export default async function globalSetup() {
  const db = await startLocalDb({
    port: 54330,
    dataDir: path.join(dbPackage, '.localdb-test'),
    databases: ['pa_test'],
  });
  const url = db.url('pa_test');

  execSync('pnpm exec prisma migrate deploy', {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  globalThis.__PA_TEST_DB__ = db;
}
