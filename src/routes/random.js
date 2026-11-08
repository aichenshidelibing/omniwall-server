import { fetchRandomImage } from '../services/image-service.js';

const jsonRequested = (request, q) => String(q.info || '').toLowerCase() === 'true' || request.headers.accept?.includes('application/json');
const params = (q, request) => ({ query: String(q.query || 'wallpaper'), source: String(q.source || 'random'), orientation: String(q.orientation || ''), preset: String(q.preset || ''), reload: String(q.reload || '').toLowerCase() === 'true' || String(request.headers['cache-control'] || '').toLowerCase().includes('no-cache'), noStore: String(q.noStore || '').toLowerCase() === 'true' || String(request.headers['cache-control'] || '').toLowerCase().includes('no-store') });

async function imageResponse(request, reply, { config, db, daily = false, internal = false }) {
  const q = request.query || {};
  const result = await fetchRandomImage({ config: { ...config, logger: request.log }, db, ...params(q, request), daily, internal });
  reply.header('Cache-Control', daily ? 'public, max-age=3600' : 'no-store');
  if (!result.ok) return reply.code(result.status || 503).send({ ok: false, error: result.error });
  if (jsonRequested(request, q)) return { ...result.image, ok: true, ...(result.cached !== undefined ? { cached: result.cached } : {}) };
  return reply.redirect(result.image.url);
}

export async function registerRandomRoutes(app, { config, db }) {
  app.get('/api/random', (request, reply) => imageResponse(request, reply, { config, db }));
  app.get('/random', (request, reply) => imageResponse(request, reply, { config, db }));
  app.get('/api/daily', (request, reply) => imageResponse(request, reply, { config, db, daily: true }));
  app.get('/api/bg', (request, reply) => imageResponse(request, reply, { config, db, internal: true }));
}
