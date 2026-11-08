import { hashIp, createSecurityRepository } from './db/repositories/security.js';

function clientIp(request) { return request.ip || 'unknown'; }

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'";

export function registerSecurity(app, { db, config = {} }) {
  const security = createSecurityRepository(db);
  app.decorate('security', security);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', CSP);
    const origin = request.headers.origin;
    const allowed = config.corsOrigins || [];
    // Same-origin requests and deployments without CORS configuration must remain usable.
    // Only reject an explicitly cross-origin request when an allow-list is configured.
    const crossOrigin = Boolean(origin) && !allowed.includes(origin);
    if (origin && !crossOrigin) reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      if (crossOrigin && allowed.length) return reply.code(403).send({ error: 'origin_not_allowed' });
      if (origin) reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS').header('Access-Control-Allow-Headers', 'content-type,authorization,x-api-key,x-csrf-token').header('Access-Control-Max-Age', '600');
      return reply.code(204).send();
    }
    if (crossOrigin && allowed.length) return reply.code(403).send({ error: 'origin_not_allowed' });
    const limit = Number(config.apiRateMax || 120);
    const window = Number(config.apiRateWindowSeconds || 60);
    if (request.url.startsWith('/api/') && !security.allowRate(`api:${hashIp(clientIp(request), config.ipHashSalt || '')}`, limit, window)) return reply.code(429).send({ error: 'rate_limited' });
  });
}
