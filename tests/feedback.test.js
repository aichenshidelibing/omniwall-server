import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerFeedbackRoutes } from '../src/routes/feedback.js';
import { createDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';

function setup(verifier = { verify: vi.fn().mockResolvedValue({ success: true }) }) {
  const db = createDatabase(':memory:'); migrate(db);
  const app = Fastify({ logger: false });
  app.decorate('captchaVerifier', verifier);
  registerFeedbackRoutes(app, { db, config: { feedbackRateMax: 2, feedbackRateWindowSeconds: 60, ipHashSalt: 'test' } });
  return { app, db, verifier };
}

describe('public feedback', () => {
  it('validates captcha and stores feedback', async () => {
    const { app, db, verifier } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/feedback', remoteAddress: '127.0.0.1', payload: { type: 'bug', title: ' Broken ', content: 'Details', turnstileToken: 'token' } });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true });
    expect(verifier.verify).toHaveBeenCalledWith('token', expect.objectContaining({ action: 'feedback' }));
    expect(db.prepare('SELECT title, status FROM feedback').get()).toEqual({ title: 'Broken', status: 'pending' });
    await app.close(); db.close();
  });
  it('rejects failed captcha and rate limits repeated submissions', async () => {
    const verifier = { verify: vi.fn().mockResolvedValue({ success: false }) };
    const first = setup(verifier); const rejected = await first.app.inject({ method: 'POST', url: '/api/feedback', payload: { type: 'other', title: 'x', content: 'y' } });
    expect(rejected.statusCode).toBe(403); await first.app.close(); first.db.close();
    const second = setup();
    const payload = { type: 'feature', title: 'x', content: 'y' };
    await second.app.inject({ method: 'POST', url: '/api/feedback', payload }); await second.app.inject({ method: 'POST', url: '/api/feedback', payload });
    expect((await second.app.inject({ method: 'POST', url: '/api/feedback', payload })).statusCode).toBe(429);
    await second.app.close(); second.db.close();
  });
  it('rejects oversized fields instead of truncating user input', async () => {
    const { app, db } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/feedback', payload: { type: 'bug', title: 'x'.repeat(201), content: 'details' } });
    expect(response.statusCode).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM feedback').get().count).toBe(0);
    await app.close(); db.close();
  });
  it('stores only a salted IP hash and sanitized bounded user agent', async () => {
    const { app, db } = setup();
    await app.inject({ method: 'POST', url: '/api/feedback', remoteAddress: '192.0.2.10', headers: { 'user-agent': 'Browser\u0000Name\n' }, payload: { type: 'other', title: 'x', content: 'y' } });
    const row = db.prepare('SELECT ip_hash, user_agent FROM feedback').get();
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.ip_hash).not.toContain('192.0.2.10');
    expect(row.user_agent).toBe('BrowserName');
    await app.close(); db.close();
  });
});
