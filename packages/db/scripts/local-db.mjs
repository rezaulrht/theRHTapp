// A real PostgreSQL server that runs from node_modules, for tests and local
// development. Production uses the DATABASE_URL the owner sets (Neon).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(here, '../.localdb');
const USER = 'postgres';
const PASSWORD = 'postgres';

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

  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise();
  await server.start();

  const client = server.getPgClient();
  await client.connect();
  for (const name of databases) {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  }
  await client.end();

  return {
    url: (database) => `postgresql://${USER}:${PASSWORD}@localhost:${port}/${database}`,
    stop: () => server.stop(),
  };
}
