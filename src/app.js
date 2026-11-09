import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptchaVerifier } from './captcha/verify.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerRandomRoutes } from './routes/random.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { createAdminConfigRepository } from './db/repositories/admin-config.js';
import { registerSecurity } from './security.js';
import { randomBytes, createHash } from 'node:crypto';

export function buildApp({ config, db, logger = true, captchaVerifier, capVerifier } = {}) {
  const app = Fastify({ logger, trustProxy: config?.trustProxy ?? false });
  const verifier = captchaVerifier || capVerifier || createCaptchaVerifier({
    provider: config?.captchaProvider || 'none', serverUrl: config?.capServerUrl,
    verifyPath: config?.capVerifyPath, secret: config?.capSecret,
    timeoutMs: config?.capVerifyTimeoutMs, turnstileSecret: config?.turnstileSecret,
    siteverifyUrl: config?.turnstileSiteverifyUrl
  });
  app.decorate('captchaVerifier', verifier);
  app.decorate('capVerifier', verifier);
  app.decorate('adminConfig', createAdminConfigRepository(db, { env: process.env, encryptionRoot: config?.adminPassword }));
  // Database-backed admin settings must be loaded before creating/rotating the entrypoint.
  for (const [key, item] of Object.entries(app.adminConfig.metadata())) {
    if (item.source === 'database') {
      const value = app.adminConfig.get(key).value;
      if (value) config[key] = value;
    }
  }
  const entrypointDuration = () => Number(config.adminPathDurationSeconds || 86400);
  const now = Math.floor(Date.now() / 1000);
  let entry = db.prepare('SELECT * FROM admin_entrypoints WHERE id=1').get();
  if (!entry || entry.expires_at <= now) {
    const token = config?.adminPathToken || randomBytes(48).toString('base64url');
    const expiresAt = now + entrypointDuration();
    db.prepare('INSERT INTO admin_entrypoints(id,path_token_hash,created_at,expires_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET path_token_hash=excluded.path_token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at').run(createHash('sha256').update(token).digest('hex'), now, expiresAt);
    entry = { path_token: token, created_at: now, expires_at: expiresAt };
  }
  app.decorate('adminEntrypoint', { get token() { return entry.path_token; }, get expiresAt() { return entry.expires_at; }, rotate() { const token=randomBytes(48).toString('base64url'); const createdAt=Math.floor(Date.now()/1000), expiresAt=createdAt+entrypointDuration(); db.prepare('UPDATE admin_entrypoints SET path_token_hash=?,created_at=?,expires_at=? WHERE id=1').run(createHash('sha256').update(token).digest('hex'),createdAt,expiresAt); entry={path_token:token,created_at:createdAt,expires_at:expiresAt}; return entry; } });
  registerSecurity(app, { db, config });
  const publicRoot = join(fileURLToPath(new URL('..', import.meta.url)), 'public');
  app.register(fastifyStatic, { root: publicRoot });
  const page = async (_request, reply) => reply.sendFile('index.html', publicRoot);
  app.get('/', page);
  app.get('/admin', async (request, reply) => { if (config.adminAllowLegacyPath) return page(request, reply); return reply.code(404).send({ error: 'not_found' }); });
  app.get('/admin/:token', async (request, reply) => { const row=db.prepare('SELECT path_token_hash,expires_at FROM admin_entrypoints WHERE id=1').get(); if (!row || row.expires_at <= Math.floor(Date.now()/1000) || createHash('sha256').update(String(request.params.token)).digest('hex') !== row.path_token_hash) return reply.code(404).send({ error: 'not_found' }); return page(request, reply); });
  for (const path of ['/docs', '/feedback', '/url-builder', '/featured', '/explore', '/daily']) app.get(path, page);
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/healthz', async () => ({ status: 'ok' }));
  registerRandomRoutes(app, { config, db });
  registerAdminRoutes(app, { db, config });
  registerNotificationRoutes(app, { config, db });
  registerFeedbackRoutes(app, { db, config });
  app.addHook('onClose', async () => db?.close());
  return app;
}
