import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// Vite 5 predates node:sqlite; load the Node 24 built-in without its resolver.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';

describe('D1 migration configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the documented D1 HTTP driver with the existing Actions secrets', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account');
    vi.stubEnv('D1_DATABASE_ID', 'test-db');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token');
    const { default: config } = await import('../../drizzle.d1.config');
    expect(config).toMatchObject({
      dialect: 'sqlite', driver: 'd1-http', out: './drizzle',
      dbCredentials: { accountId: 'test-account', databaseId: 'test-db', token: 'test-token' },
    });
  });

  it('fails before connecting when a production secret is missing', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
    await expect(import('../../drizzle.d1.config')).rejects.toThrow('CLOUDFLARE_ACCOUNT_ID');
  });

  it('routes CI through the pinned Drizzle Kit command rather than replaying SQL files', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['db:migrate:prod']).toBe('drizzle-kit migrate --config=drizzle.d1.config.ts');
    const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
    expect(workflow).toContain('run: pnpm run db:migrate:prod');
    expect(workflow).toContain('D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}');
    expect(workflow).not.toContain('for file in drizzle/*.sql');
    expect(workflow).not.toContain('wrangler d1 execute');
    expect(workflow).toContain('--prefix "$RUNNER_TEMP/wrangler" wrangler@4.133.0');
    expect(workflow).toContain('echo "$RUNNER_TEMP/wrangler/bin" >> "$GITHUB_PATH"');
  });
});

it('applies the checked-in migrations once and preserves data on rerun', async () => {
  // Drizzle Kit 0.31's d1-http driver uses this same sqlite-proxy migrator.
  // Execute its SQL in real, in-memory SQLite; no remote credentials/network.
  const sqlite = new DatabaseSync(':memory:');
  const db = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === 'run') {
      statement.run(...params);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    return { rows: statement.all(...params) as unknown as unknown[][] };
  });
  const apply = () => migrate(db, async queries => {
    sqlite.exec('BEGIN');
    try {
      for (const sql of queries) sqlite.exec(sql);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }, { migrationsFolder: './drizzle' });
  try {
    await apply();
    sqlite.exec("INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('no-model', 'New chat', 1, 1)");
    expect(sqlite.prepare("SELECT model FROM conversations WHERE id = 'no-model'").get()).toMatchObject({ model: '' });
    sqlite.exec("INSERT INTO mcp_servers (id, name, url, created_at) VALUES ('kept', 'MCP', 'https://example.com', 1)");
    const before = sqlite.prepare('SELECT * FROM __drizzle_migrations').all();
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    expect(before).toHaveLength(journal.entries.length);
    await apply();
    expect(sqlite.prepare('SELECT * FROM __drizzle_migrations').all()).toEqual(before);
    expect(sqlite.prepare("SELECT name FROM mcp_servers WHERE id = 'kept'").get()?.name).toBe('MCP');
  } finally {
    sqlite.close();
  }
});
