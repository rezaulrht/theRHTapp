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
 * On Windows, when a server's parent process is killed outright (a terminal
 * closed, a tool stopping it), its worker processes can live on, holding the
 * port and shared memory so no new server can start. They are recognisable as
 * embedded-postgres workers whose parent no longer exists. A running server's
 * workers always have a live parent, so this never touches one.
 */
function stopOrphanedWorkers() {
  if (process.platform !== 'win32') return;
  const script = [
    "$all = Get-CimInstance Win32_Process -Filter \"name='postgres.exe'\"",
    '$alive = @{}; Get-Process | ForEach-Object { $alive[[int]$_.Id] = $true }',
    "$all | Where-Object { ([string]$_.CommandLine) -like '*embedded-postgres*' -and -not $alive.ContainsKey([int]$_.ParentProcessId) }" +
      ' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join('; ');
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
  } catch {
    // Best effort: if this fails, the start below reports the real problem.
  }
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
    // UTF-8 from the start, whatever the machine's own code page is.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (line) => log.push(String(line)),
    onError: (line) => log.push(String(line)),
  });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise();
  // A run that was killed can leave its server, or just its workers, behind.
  stopServerFor(dataDir);
  stopOrphanedWorkers();
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
    const found = await client.query(
      'SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1',
      [name],
    );
    const encoding = found.rows[0]?.encoding;
    if (encoding === 'UTF8') continue;
    if (encoding) {
      // On Windows a database inherits the system code page unless told
      // otherwise, and then cannot store ৳ or Bangla text. Production is
      // UTF-8, so a local database must be too. This one only ever holds
      // local test data, so it is rebuilt.
      console.warn(`Local database "${name}" was ${encoding}; recreating it as UTF8. Run migrations again.`);
      await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await client.query(
      `CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
    );
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
