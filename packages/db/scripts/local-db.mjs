// A real PostgreSQL server that runs from node_modules, for tests and local
// development. Production uses the DATABASE_URL the owner sets (Neon).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(here, '../.localdb');
const USER = 'postgres';
const PASSWORD = 'postgres';

/**
 * PostgreSQL writes the command it was started with to postmaster.opts; its
 * first token is the path to the server binary, and pg_ctl sits beside it.
 * @param {string} dataDir
 * @returns {string | null}
 */
function findPgCtl(dataDir) {
  const optsFile = path.join(dataDir, 'postmaster.opts');
  if (!existsSync(optsFile)) return null;
  const match = readFileSync(optsFile, 'utf8').match(/^"?([^"\n]*?postgres(?:\.exe)?)"?\s/);
  if (!match?.[1]) return null;
  const pgCtl = path.join(path.dirname(match[1]), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  return existsSync(pgCtl) ? pgCtl : null;
}

/**
 * Shuts down whatever server is using `dataDir`, if any. Uses pg_ctl so the
 * whole server stops: killing only the parent process leaves its workers
 * holding the port on Windows.
 * @param {string} dataDir
 */
function stopServerFor(dataDir) {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pgCtl = findPgCtl(dataDir);
  if (pgCtl) {
    try {
      execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '20'], { stdio: 'ignore' });
    } catch {
      // No server was running; only a stale pid file is left.
    }
  }
  rmSync(pidFile, { force: true });
}

/**
 * Starts the server, creating its data folder and the named databases on
 * first use.
 * @param {{ port?: number, dataDir?: string, databases?: string[] }} [options]
 * @returns {Promise<{ url: (database: string) => string, stop: () => Promise<void> }>}
 */
export async function startLocalDb(options = {}) {
  const port = options.port ?? 54329;
  const dataDir = options.dataDir ?? DEFAULT_DIR;
  const databases = options.databases ?? ['personal_apps'];

  const log = [];
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port,
    persistent: true,
    onLog: (line) => log.push(String(line)),
    onError: (line) => log.push(String(line)),
  });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise();
  // A run that was killed can leave its server behind.
  stopServerFor(dataDir);
  try {
    await server.start();
  } catch (error) {
    throw new Error(
      `Local PostgreSQL did not start on port ${port}. Is something else using it?\n${log.slice(-10).join('\n')}`,
      { cause: error },
    );
  }

  const client = server.getPgClient();
  await client.connect();
  for (const name of databases) {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  }
  await client.end();

  return {
    url: (database) => `postgresql://${USER}:${PASSWORD}@localhost:${port}/${database}`,
    stop: async () => {
      stopServerFor(dataDir);
      try {
        await server.stop();
      } catch {
        // pg_ctl has already stopped it.
      }
    },
  };
}
