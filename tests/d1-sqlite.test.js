import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createD1Database } from '../src/db/d1-sqlite.js';

let tempDirs = [];

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'omniwall-d1-'));
  tempDirs.push(dir);
  return join(dir, 'test.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('D1 SQLite adapter', () => {
  it('runs D1-style prepare/bind/run/all/first calls', async () => {
    const db = createD1Database(tempDbPath());

    await db.prepare('CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
    const insert = await db
      .prepare('INSERT INTO config (key, value) VALUES (?, ?)')
      .bind('site', 'OmniWall')
      .run();

    expect(insert.success).toBe(true);
    expect(insert.meta.changes).toBe(1);

    const first = await db.prepare('SELECT value FROM config WHERE key = ?').bind('site').first();
    expect(first).toEqual({ value: 'OmniWall' });

    const scalar = await db.prepare('SELECT value FROM config WHERE key = ?').bind('site').first('value');
    expect(scalar).toBe('OmniWall');

    const all = await db.prepare('SELECT key, value FROM config ORDER BY key').all();
    expect(all.success).toBe(true);
    expect(all.results).toEqual([{ key: 'site', value: 'OmniWall' }]);
  });

  it('executes batch statements in order', async () => {
    const db = createD1Database(tempDbPath());

    const results = await db.batch([
      db.prepare('CREATE TABLE quota (source TEXT PRIMARY KEY, used INTEGER DEFAULT 0)'),
      db.prepare('INSERT INTO quota (source, used) VALUES (?, ?)').bind('bing', 1),
      db.prepare('UPDATE quota SET used = used + ? WHERE source = ?').bind(2, 'bing')
    ]);

    expect(results).toHaveLength(3);
    expect(results[1].success).toBe(true);
    const row = await db.prepare('SELECT used FROM quota WHERE source = ?').bind('bing').first();
    expect(row.used).toBe(3);
  });

  it('supports INSERT OR REPLACE and datetime SQL used by OmniWall', async () => {
    const db = createD1Database(tempDbPath());

    await db.prepare('CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime(\'now\')))').run();
    await db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').bind('cache_ttl', '18000').run();
    await db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').bind('cache_ttl', '3600').run();

    const row = await db.prepare('SELECT value, updated_at FROM config WHERE key = ?').bind('cache_ttl').first();
    expect(row.value).toBe('3600');
    expect(typeof row.updated_at).toBe('string');
  });
});
