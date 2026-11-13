// Usage:
//   node scripts/with-local-db.mjs <command...>   run a command against the local database
//   node scripts/with-local-db.mjs --serve        keep the local database running
import { spawn } from 'node:child_process';
import { startLocalDb } from './local-db.mjs';

const args = process.argv.slice(2);
const db = await startLocalDb();
const url = db.url('personal_apps');

if (args[0] === '--serve') {
  console.log(`Local database running. DATABASE_URL=${url}`);
  console.log('Press Ctrl+C to stop.');
  const stop = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  const child = spawn(args.join(' '), {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  child.on('exit', async (code) => {
    await db.stop();
    process.exit(code ?? 1);
  });
}
