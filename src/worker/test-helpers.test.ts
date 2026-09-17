import { describe, it, expect } from 'vitest';
import { createMockDB } from './test-helpers';

describe('createMockDB (D1 test helper)', () => {
  it('raw() returns column-order arrays for explicit SELECT lists', async () => {
    const db = createMockDB();
    db._addData('user_facts', {
      id: 'f1',
      content: 'hello',
      category: 'pref',
      source: 'explicit',
      created_at: 1,
      updated_at: 2,
    });

    const rows = await db
      .prepare('select "id", "content", "category" from "user_facts" order by "user_facts"."updated_at" desc')
      .raw();

    expect(rows).toEqual([['f1', 'hello', 'pref']]);
  });

  it('raw() returns full row objects for SELECT *', async () => {
    const db = createMockDB();
    db._addData('mcp_servers', { id: 's1', name: 'n', url: 'u' });

    const rows = await db.prepare('SELECT * FROM mcp_servers').all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].id).toBe('s1');
  });

  it('first() honors WHERE id = ?', async () => {
    const db = createMockDB();
    db._addData('mcp_servers', { id: 'a', name: 'A', url: 'u' });
    db._addData('mcp_servers', { id: 'b', name: 'B', url: 'u' });

    const hit = await db.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind('b').first();
    expect(hit).not.toBeNull();
    expect(hit?.name).toBe('B');

    const miss = await db.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind('zzz').first();
    expect(miss).toBeNull();
  });

  it('supports AND/OR conditions and comparison operators', async () => {
    const db = createMockDB();
    db._addData('oauth_states', {
      id: 'st1',
      server_id: 's1',
      state: 'abc',
      code_verifier: 'v',
      created_at: 1,
      expires_at: 1000,
    });
    db._addData('oauth_states', {
      id: 'st2',
      server_id: 's1',
      state: 'abc',
      code_verifier: 'v',
      created_at: 1,
      expires_at: 10,
    });

    const valid = await db
      .prepare('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?')
      .bind('abc', 500)
      .first();
    expect(valid?.id).toBe('st1');
  });

  it('UPDATE with WHERE only touches matching rows', async () => {
    const db = createMockDB();
    db._addData('api_endpoints', { id: 'e1', is_default: 1 });
    db._addData('api_endpoints', { id: 'e2', is_default: 1 });

    await db
      .prepare('UPDATE api_endpoints SET is_default = ? WHERE id != ?')
      .bind(0, 'e2')
      .run();

    const rows = db._getData('api_endpoints');
    expect(rows.find((r: any) => r.id === 'e1')?.is_default).toBe(0);
    expect(rows.find((r: any) => r.id === 'e2')?.is_default).toBe(1);
  });

  it('DELETE with WHERE removes only matching rows', async () => {
    const db = createMockDB();
    db._addData('oauth_states', { id: 'keep', state: 'x' });
    db._addData('oauth_states', { id: 'drop', state: 'y' });

    await db.prepare('DELETE FROM oauth_states WHERE id = ?').bind('drop').run();
    const rows = db._getData('oauth_states');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('keep');
  });

  it('INSERT applies schema defaults for omitted columns', async () => {
    const db = createMockDB();
    await db
      .prepare('INSERT INTO mcp_servers (id, name, url, created_at) VALUES (?, ?, ?, ?)')
      .bind('s9', 'Nine', 'http://x', 123)
      .run();

    const rows = db._getData('mcp_servers');
    expect(rows[0].enabled).toBe(1);
    expect(rows[0].oauth_enabled).toBe(0);
    expect(rows[0].tools_json).toBe('[]');
  });

  it('bind values with Date objects are normalized to epoch millis', async () => {
    const db = createMockDB();
    const now = new Date('2024-01-01T00:00:00Z');
    await db
      .prepare('INSERT INTO user_facts (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind('f2', 'c', now, now)
      .run();

    expect(db._getData('user_facts')[0].created_at).toBe(now.getTime());
  });
});
