import { timingSafeEqual } from 'node:crypto';
import { createNotificationService } from '../notifications/service.js';

function bearerMatches(header, token) {
  if (!token || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function registerNotificationRoutes(app, { config = {}, db } = {}) {
  const service = createNotificationService({ providers: config.notificationProviders || {}, logger: app.log });
  app.decorate('notificationService', service);
  app.get('/api/admin/notifications', { preHandler: app.adminRequireSession }, async () => ({ notifications: db.prepare('SELECT provider,config,enabled,updated_at FROM notification_configs ORDER BY provider').all().map(r=>({...r,config: JSON.parse(r.config)})) }));
  app.put('/api/admin/notifications/:provider', { preHandler: [app.adminRequireSession, app.adminRequireCsrf] }, async request => { const b=request.body||{}; db.prepare('INSERT INTO notification_configs(provider,config,enabled) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET config=excluded.config,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP').run(request.params.provider,JSON.stringify(b.config||{}),b.enabled===false?0:1); return {ok:true}; });
  app.post('/api/admin/notifications/:provider/test', { preHandler: [app.adminRequireSession, app.adminRequireCsrf] }, async (request, reply) => { try { return {ok:true,result:await service.send(request.params.provider,request.body?.message||{text:'OmniWall notification test'})}; } catch(error) { return reply.code(error.status||502).send({error:error.code,message:error.message}); } });
  app.post('/notifications/:provider', { preHandler: async (request, reply) => {
    if (!bearerMatches(request.headers.authorization, config.notificationToken)) return reply.code(401).send({ error: 'authentication_required' });
  } }, async (request, reply) => {
    try { return await service.send(request.params.provider, request.body || {}); }
    catch (error) { return reply.code(error.status || (error.code === 'CONFIG' ? 400 : 502)).send({ error: error.code, message: error.message, retryAfterMs: error.retryAfterMs }); }
  });
}
