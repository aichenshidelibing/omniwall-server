import { createHash, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { configuredSources } from '../services/image-service.js';

function parseJson(value, fallback = {}) { try { return JSON.parse(value); } catch { return fallback; } }
function newApiKey() { return `owk_${randomBytes(24).toString('base64url')}`; }
function totp(secret, counter) {
  const key = Buffer.from(secret, 'base64'); const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(b).digest(); const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
import { hashIp } from '../db/repositories/security.js';
import { ADMIN_CONFIG_FIELDS } from '../db/repositories/admin-config.js';

const SESSION_TTL = 24 * 60 * 60;
const ENTRYPOINT_DURATION_MIN = 300;
const ENTRYPOINT_DURATION_MAX = 31536000;
function validEntrypointDuration(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= ENTRYPOINT_DURATION_MIN && n <= ENTRYPOINT_DURATION_MAX;
}
const COOKIE = 'ow_admin_sid';
const csrfHeader = 'x-csrf-token';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function parseCookie(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim().split('=')) .filter(([k,v]) => k && v).map(([k,v]) => [k, decodeURIComponent(v)]));
}
function passwordMatches(password, expected) {
  if (!expected) return false;
  if (expected.startsWith('scrypt$')) {
    const [, salt, encoded] = expected.split('$');
    try { return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(encoded, 'hex')); } catch { return false; }
  }
  return password.length === expected.length && timingSafeEqual(Buffer.from(password), Buffer.from(expected));
}
function jsonBody(request) { return request.body && typeof request.body === 'object' ? request.body : {}; }
function setCookie(reply, value, maxAge) { reply.header('set-cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/admin; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }

export function registerAdminRoutes(app, { db, config }) {
  const username = config.adminUsername;
  const password = config.adminPassword;
  const security = app.security;
  const ip = request => request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const requireSession = (request, reply, done) => {
    const sid = parseCookie(request.headers.cookie)[COOKIE];
    const row = sid && db.prepare('SELECT * FROM admin_sessions WHERE id_hash = ? AND expires_at > ?').get(hash(sid), Math.floor(Date.now() / 1000));
    if (!row) return reply.code(401).send({ error: 'authentication_required' });
    request.adminSession = row;
    done();
  };
  const requireCsrf = (request, reply, done) => {
    const token = request.headers[csrfHeader] || jsonBody(request).csrf;
    if (!token || token !== request.adminSession.csrf_token) return reply.code(403).send({ error: 'csrf_failed' });
    done();
  };
  app.decorate('adminRequireSession', requireSession);
  app.decorate('adminRequireCsrf', requireCsrf);
  app.post('/api/admin/login', async (request, reply) => {
    const body = jsonBody(request);
    const ipHash = hashIp(ip(request), config.ipHashSalt || '');
    if (!security.allowRate(`login:${ipHash}`, Number(config.loginRateMax || 5), Number(config.loginRateWindowSeconds || 300))) return reply.code(429).send({ error: 'rate_limited' });
    const valid = typeof body.username === 'string' && typeof body.password === 'string' && body.username === username && passwordMatches(body.password, password);
    if (!valid) { security.audit('admin_login_failed', { ipHash, username: String(body.username || '').slice(0, 100) }); return reply.code(401).send({ error: 'invalid_credentials' }); }
    security.audit('admin_login_success', { ipHash, username });
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Math.floor(Date.now() / 1000));
    const sid = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO admin_sessions (id_hash, username, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(hash(sid), username, csrf, Math.floor(Date.now() / 1000) + SESSION_TTL);
    setCookie(reply, sid, SESSION_TTL);
    return { ok: true, username, csrfToken: csrf, expiresIn: SESSION_TTL };
  });
  app.post('/api/admin/logout', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => {
    db.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').run(hash(parseCookie(request.headers.cookie)[COOKIE]));
    setCookie(reply, '', 0);
    return { ok: true };
  });
  app.get('/api/admin/session', { preHandler: requireSession }, async request => ({ authenticated: true, username: request.adminSession.username, csrfToken: request.adminSession.csrf_token, expiresAt: request.adminSession.expires_at }));
  app.get('/api/admin/settings', { preHandler: requireSession }, async () => ({ settings: Object.fromEntries(db.prepare('SELECT key, value FROM settings ORDER BY key').all().map(r => [r.key, JSON.parse(r.value)])), config: app.adminConfig.metadata() }));
  app.get('/api/admin/entrypoint', { preHandler: requireSession }, async () => ({ path: `/admin/${app.adminEntrypoint.token}`, expiresAt: app.adminEntrypoint.expiresAt }));
  app.post('/api/admin/entrypoint/rotate', { preHandler: [requireSession, requireCsrf] }, async () => { const next=app.adminEntrypoint.rotate(); return { path: `/admin/${next.path_token}`, expiresAt: next.expires_at }; });
  app.get('/api/admin/config', { preHandler: requireSession }, async () => ({ config: app.adminConfig.metadata() }));
  app.put('/api/admin/config', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => {
    const values = jsonBody(request).config;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return reply.code(400).send({ error: 'config_object_required' });
    for (const [key, value] of Object.entries(values)) {
      const field = ADMIN_CONFIG_FIELDS[key];
      if (!field || typeof value !== 'string' || value.length > 10000) return reply.code(400).send({ error: 'invalid_config_value', field: key });
      if (field.url && value && !/^https?:\/\//i.test(value) && key !== 'capVerifyPath') return reply.code(400).send({ error: 'invalid_config_url', field: key });
    }
    try { app.adminConfig.save(values); } catch { return reply.code(500).send({ error: 'config_save_failed' }); }
    return { ok: true, config: app.adminConfig.metadata() };
  });
  app.put('/api/admin/settings', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => {
    const settings = jsonBody(request).settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return reply.code(400).send({ error: 'settings_object_required' });
    if (Object.hasOwn(settings, 'adminPathDurationSeconds') && !validEntrypointDuration(settings.adminPathDurationSeconds)) return reply.code(400).send({ error: 'invalid_admin_path_duration', min: ENTRYPOINT_DURATION_MIN, max: ENTRYPOINT_DURATION_MAX });
    const save = db.transaction(() => { const stmt = db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP"); for (const [key, value] of Object.entries(settings)) { if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(key)) throw new Error('invalid_setting_key'); stmt.run(key, JSON.stringify(value)); } });
    try { save(); if (Object.hasOwn(settings, 'adminPathDurationSeconds')) config.adminPathDurationSeconds = Number(settings.adminPathDurationSeconds); } catch (error) { return reply.code(400).send({ error: error.message }); }
    return { ok: true };
  });
  app.get('/api/admin/feedback', { preHandler: requireSession }, async request => {
    const status = request.query?.status;
    const rows = status ? db.prepare('SELECT * FROM feedback WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status) : db.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200').all();
    return { feedback: rows };
  });
  app.get('/api/admin/api-keys', { preHandler: requireSession }, async () => ({ apiKeys: db.prepare('SELECT id,name,key_prefix,scopes,enabled,unlimited,rate_limit,last_used_at,expires_at,created_at FROM api_keys ORDER BY created_at DESC').all().map(r => ({ ...r, scopes: parseJson(r.scopes, []), unlimited: Boolean(r.unlimited) })) }));
  app.post('/api/admin/api-keys', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const body=jsonBody(request); if(!body.name || String(body.name).length>100) return reply.code(400).send({error:'invalid_name'}); const key=`owk_${randomBytes(48).toString('base64url')}`; const unlimited=body.unlimited ? 1 : 0; const rateLimit=body.rateLimit == null ? null : Number(body.rateLimit); if(rateLimit !== null && (!Number.isSafeInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000000)) return reply.code(400).send({error:'invalid_rate_limit'}); const result=db.prepare('INSERT INTO api_keys(name,key_prefix,key_hash,scopes,expires_at,unlimited,rate_limit) VALUES(?,?,?,?,?,?,?)').run(String(body.name),key.slice(0,16),hash(key),JSON.stringify(Array.isArray(body.scopes)?body.scopes:['admin']),body.expiresAt||null,unlimited,rateLimit); return { ok:true, id:result.lastInsertRowid, key }; });
  app.patch('/api/admin/api-keys/:id', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const body=jsonBody(request); const fields=[]; const values=[]; if(body.enabled !== undefined){fields.push('enabled=?');values.push(body.enabled?1:0);} if(body.unlimited !== undefined){fields.push('unlimited=?');values.push(body.unlimited?1:0);} if(body.rateLimit !== undefined){const n=body.rateLimit==null?null:Number(body.rateLimit);if(n!==null&&(!Number.isSafeInteger(n)||n<1||n>1000000))return reply.code(400).send({error:'invalid_rate_limit'});fields.push('rate_limit=?');values.push(n);} if(!fields.length)return reply.code(400).send({error:'no_changes'}); values.push(Number(request.params.id)); const r=db.prepare(`UPDATE api_keys SET ${fields.join(',')} WHERE id=?`).run(...values); if(!r.changes)return reply.code(404).send({error:'api_key_not_found'}); return {ok:true}; });
  app.delete('/api/admin/api-keys/:id', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const r=db.prepare('DELETE FROM api_keys WHERE id=?').run(Number(request.params.id)); if(!r.changes)return reply.code(404).send({error:'api_key_not_found'}); return {ok:true}; });
  // Deliberately no unauthenticated API-key verification endpoint: it would disclose scopes.
  app.get('/api/admin/presets', { preHandler: requireSession }, async () => ({ presets: db.prepare('SELECT * FROM presets ORDER BY name').all().map(r=>({...r,config:parseJson(r.config)})) }));
  app.post('/api/admin/presets', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const b=jsonBody(request); if(!b.name)return reply.code(400).send({error:'name_required'}); try { const r=db.prepare('INSERT INTO presets(name,config) VALUES(?,?)').run(String(b.name).slice(0,100),JSON.stringify(b.config||{})); return {ok:true,id:r.lastInsertRowid}; } catch { return reply.code(409).send({error:'preset_exists'}); } });
  app.put('/api/admin/presets/:id', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const r=db.prepare('UPDATE presets SET name=?,config=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(jsonBody(request).name||'').slice(0,100),JSON.stringify(jsonBody(request).config||{}),Number(request.params.id)); if(!r.changes)return reply.code(404).send({error:'preset_not_found'}); return {ok:true}; });
  app.delete('/api/admin/presets/:id', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => { const r=db.prepare('DELETE FROM presets WHERE id=?').run(Number(request.params.id)); if(!r.changes)return reply.code(404).send({error:'preset_not_found'}); return {ok:true}; });
  app.get('/api/admin/sources/health', { preHandler: requireSession }, async () => ({ sources: configuredSources(config).map(source => ({source,configured:true})) }));
  app.post('/api/admin/cache/clear', { preHandler: [requireSession, requireCsrf] }, async () => { const tables=['image_cache','image_cache_pool','recent_images','daily_images']; let cleared=0; for(const t of tables) cleared+=db.prepare(`DELETE FROM ${t}`).run().changes; return {ok:true,cleared}; });
  app.post('/api/admin/totp/setup', { preHandler: [requireSession, requireCsrf] }, async request => { const secret=randomBytes(20).toString('base64'); db.prepare('INSERT INTO totp_secrets(username,secret,enabled) VALUES(?,?,0) ON CONFLICT(username) DO UPDATE SET secret=excluded.secret,enabled=0').run(request.adminSession.username,secret); return {secret,otpauth:`otpauth://totp/OmniWall:${encodeURIComponent(request.adminSession.username)}?secret=${Buffer.from(secret,'base64').toString('base64')}&issuer=OmniWall`}; });
  app.post('/api/admin/totp/verify', { preHandler: requireSession }, async (request, reply) => { const row=db.prepare('SELECT * FROM totp_secrets WHERE username=?').get(request.adminSession.username); const code=String(jsonBody(request).code||''); if(!row || ![0,-1,1].some(offset=>totp(row.secret,Math.floor(Date.now()/30000)+offset)===code))return reply.code(401).send({error:'invalid_totp'}); db.prepare('UPDATE totp_secrets SET enabled=1 WHERE username=?').run(request.adminSession.username); return {ok:true}; });
  app.patch('/api/admin/feedback/:id', { preHandler: [requireSession, requireCsrf] }, async (request, reply) => {
    const { status, adminNote = '' } = jsonBody(request);
    if (!['pending','in_progress','resolved','closed'].includes(status)) return reply.code(400).send({ error: 'invalid_status' });
    const result = db.prepare("UPDATE feedback SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, String(adminNote).slice(0, 5000), Number(request.params.id));
    if (!result.changes) return reply.code(404).send({ error: 'feedback_not_found' });
    return { ok: true };
  });
}
