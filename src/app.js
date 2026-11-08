import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptchaVerifier } from './captcha/verify.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerRandomRoutes } from './routes/random.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerSecurity } from './security.js';

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
  registerSecurity(app, { db, config });
  const publicRoot = join(fileURLToPath(new URL('..', import.meta.url)), 'public');
  app.register(fastifyStatic, { root: publicRoot });
  const page = async (_request, reply) => reply.sendFile('index.html', publicRoot);
  app.get('/', page);
  for (const path of ['/admin', '/docs', '/feedback', '/url-builder', '/featured', '/explore', '/daily']) app.get(path, page);
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/healthz', async () => ({ status: 'ok' }));
  registerRandomRoutes(app, { config, db });
  registerAdminRoutes(app, { db, config });
  registerNotificationRoutes(app, { config, db });
  registerFeedbackRoutes(app, { db, config });
  app.addHook('onClose', async () => db?.close());
  return app;
}
