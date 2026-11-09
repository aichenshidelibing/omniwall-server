import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';

const config = { adminUsername: 'admin', adminPassword: 'password', ipHashSalt: 'test' };

function appSetup() {
  const db = createDatabase(':memory:');
  migrate(db);
  const app = buildApp({ config, db, logger: false, captchaVerifier: { verify: vi.fn() } });
  return { app, db };
}

describe('security hardening', () => {
  it('does not persist admin entrypoint token in plaintext', () => {
    const { app, db } = appSetup();
    const row = db.prepare('SELECT path_token, path_token_hash FROM admin_entrypoints').get();
    expect(row.path_token).toBeNull();
    expect(row.path_token_hash).toHaveLength(64);
    return app.close();
  });

  it('removes unauthenticated API-key scopes oracle', async () => {
    const { app } = appSetup();
    const response = await app.inject({ method: 'POST', url: '/api/admin/api-keys/verify', payload: { key: 'anything' } });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
