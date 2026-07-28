import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

let tempDirs = [];

function testEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'omniwall-app-'));
  tempDirs.push(dir);
  return {
    NODE_ENV: 'test',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'test-password-with-more-than-32-characters',
    DATABASE_PATH: join(dir, 'omniwall.sqlite'),
    SITE_NAME: 'OmniWall Test',
    TRUST_PROXY: true,
    RUN_SCHEDULED_ON_START: false
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
});
