import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';

const config = {
  siteName: 'Test Wall',
  imageCacheTtlSeconds: 60,
  imageRecentTtlSeconds: 60,
  unsplashAccessKey: 'test-key',
  pexelsApiKey: '',
  pixabayApiKey: '',
  bingApiKey: '',
  feedbackRateMax: 3,
  feedbackRateWindowSeconds: 60,
  ipHashSalt: 'test',
  adminUsername: 'admin',
  adminPassword: 'password'
};

describe('app integration', () => {
  it('registers random route with database-backed cache and mocked fetch', async () => {
    const db = createDatabase(':memory:');
    migrate(db);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { urls: { regular: 'https://images.test/one.jpg' }, alt_description: 'Test image', user: { name: 'Tester' }, links: { html: 'https://images.test' } }
    ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = buildApp({ config, db, logger: false, captchaVerifier: { verify: vi.fn().mockResolvedValue({ success: true }) } });
    const response = await app.inject({ method: 'GET', url: '/api/random?source=unsplash&query=test&info=true' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, url: 'https://images.test/one.jpg', source: 'unsplash' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const cached = await app.inject({ method: 'GET', url: '/api/random?source=unsplash&query=test&info=true' });
    expect(cached.statusCode).toBe(200);
    expect(JSON.parse(cached.body).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.close();
    fetchMock.mockRestore();
  });

  it('allows same-origin preflight and preserves browser resource CSP', async () => {
    const db = createDatabase(':memory:');
    migrate(db);
    const app = buildApp({ config, db, logger: false });
    const response = await app.inject({ method: 'OPTIONS', url: '/api/random', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    await app.close();
  });

  it('rejects notification requests when the configured token is empty', async () => {
    const db = createDatabase(':memory:');
    migrate(db);
    const app = buildApp({ config: { ...config, notificationToken: '' }, db, logger: false });
    const response = await app.inject({ method: 'POST', url: '/notifications/test', headers: { authorization: 'Bearer ' }, payload: { text: 'test' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('keeps migrations idempotent', () => {
    const db = createDatabase(':memory:');
    migrate(db);
    const firstRun = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
    migrate(db);
    const secondRun = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
    expect(secondRun).toEqual(firstRun);
    expect(new Set(secondRun.map(({ version }) => version)).size).toBe(secondRun.length);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name);
    expect(tables).toEqual(expect.arrayContaining([
      'schema_migrations',
      'feedback',
      'image_cache',
      'daily_images',
      'recent_images',
      'image_cache_pool'
    ]));
    db.close();
  });
});
