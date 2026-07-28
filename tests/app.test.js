import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

let tempDirs = [];

function testEnv(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omniwall-app-'));
  tempDirs.push(dir);
  return {
    NODE_ENV: 'test',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'test-password-with-more-than-32-characters',
    DATABASE_PATH: join(dir, 'omniwall.sqlite'),
    SITE_NAME: 'OmniWall Test',
    TRUST_PROXY: false,
    RUN_SCHEDULED_ON_START: false,
    ...overrides
  };
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('OmniWall server app', () => {
  it('serves the docs page through the Worker fetch handler', async () => {
    const app = createApp({ env: testEnv() });

    const response = await request(app).get('/docs').expect(200);

    expect(response.text).toContain('OmniWall Test');
    expect(response.text).toMatch(/文档|Docs/);
  });

  it('initializes the SQLite-backed D1 schema through /api/d1/init', async () => {
    const env = testEnv();
    const app = createApp({ env });

    const response = await request(app)
      .get('/api/d1/init')
      .set('Authorization', `Bearer ${env.ADMIN_PASSWORD}`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.tables).toContain('config');
    expect(response.body.tables).toContain('image_cache');
    expect(response.body.tables).toContain('feedback');
  });

  it('returns the public error page when ADMIN_PASSWORD is missing', async () => {
    const env = testEnv();
    env.ADMIN_PASSWORD = '';
    const app = createApp({ env });

    const response = await request(app).get('/docs').expect(500);

    expect(response.text).toContain('ADMIN_PASSWORD');
  });

  it('does not wait for waitUntil tasks before sending a response', async () => {
    const app = createApp({
      env: testEnv(),
      worker: {
        async fetch(_request, _env, ctx) {
          ctx.waitUntil(new Promise((resolve) => setTimeout(resolve, 250)));
          return new Response('fast');
        }
      }
    });

    const start = Date.now();
    const response = await request(app).get('/wait').expect(200);

    expect(response.text).toBe('fast');
    expect(Date.now() - start).toBeLessThan(150);
  });

  it('returns 413 when request body exceeds configured cap', async () => {
    const app = createApp({
      env: testEnv({ MAX_REQUEST_BODY_BYTES: 5 }),
      worker: {
        async fetch() {
          return new Response('should not run');
        }
      }
    });

    const response = await request(app).post('/too-large').send('123456').expect(413);

    expect(response.text).toContain('Request body too large');
  });
});
