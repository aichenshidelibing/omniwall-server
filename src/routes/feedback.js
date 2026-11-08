import { createHash } from 'node:crypto';

const TYPES = new Set(['bug', 'security', 'feature', 'other']);
const LIMITS = { type: 30, title: 200, content: 2000, contact: 200, token: 4096, userAgent: 500 };

function bodyOf(request) {
  return request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body) ? request.body : {};
}
function clientIp(request) { return request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'; }
function hashIp(ip, salt = '') { return createHash('sha256').update(`${salt}:${ip}`).digest('hex'); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function bounded(value, max) { const result = text(value); return result.length <= max ? result : null; }
function safeUserAgent(value) {
  // Keep only a bounded, printable representation; never persist control characters.
  return text(value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.userAgent);
}

export function registerFeedbackRoutes(app, { db, config = {} }) {
  if (!db) return;
  app.post('/api/feedback', async (request, reply) => {
    const body = bodyOf(request);
    const type = bounded(body.type, LIMITS.type);
    const title = bounded(body.title, LIMITS.title);
    const content = bounded(body.content, LIMITS.content);
    const contact = bounded(body.contact ?? '', LIMITS.contact);
    if (!type || !TYPES.has(type)) return reply.code(400).send({ ok: false, error: 'invalid_type' });
    if (!title || !content) return reply.code(400).send({ ok: false, error: 'title_and_content_required' });
    if (contact === null) return reply.code(400).send({ ok: false, error: 'contact_too_long' });
    const token = bounded(body['cf-turnstile-response'] || body.turnstileToken || body.captchaToken || '', LIMITS.token);
    if (token === null) return reply.code(400).send({ ok: false, error: 'captcha_token_too_long' });
    try {
      const verification = await (app.captchaVerifier || { verify: async () => ({ success: true }) }).verify(token, { ip: clientIp(request), action: 'feedback' });
      if (!verification?.success) return reply.code(403).send({ ok: false, error: 'captcha_failed' });
    } catch (error) {
      request.log.warn({ err: error }, 'feedback captcha verification failed');
      return reply.code(503).send({ ok: false, error: 'captcha_unavailable' });
    }
    const ipHash = hashIp(clientIp(request), config.ipHashSalt || 'omniwall');
    const rateWindow = Math.max(1, Number(config.feedbackRateWindowSeconds || 60));
    const rateMax = Math.max(1, Number(config.feedbackRateMax || 3));
    const recent = db.prepare("SELECT COUNT(*) AS count FROM feedback WHERE ip_hash = ? AND created_at >= datetime('now', ?)").get(ipHash, `-${rateWindow} seconds`).count;
    if (recent >= rateMax) return reply.code(429).send({ ok: false, error: 'rate_limited' });
    const severity = type === 'security' ? 4 : type === 'bug' ? 3 : 1;
    const result = db.prepare('INSERT INTO feedback (type,title,content,contact,ip_hash,user_agent,severity) VALUES (?,?,?,?,?,?,?)').run(type, title, content, contact, ipHash, safeUserAgent(request.headers['user-agent']), severity);
    return reply.code(201).send({ ok: true, id: result.lastInsertRowid });
  });
}
