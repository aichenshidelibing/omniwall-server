import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const ADMIN_CONFIG_FIELDS = {
  unsplashAccessKey: { env: 'UNSPLASH_ACCESS_KEY', label: 'Unsplash access key', secret: true },
  pexelsApiKey: { env: 'PEXELS_API_KEY', label: 'Pexels API key', secret: true },
  pixabayApiKey: { env: 'PIXABAY_API_KEY', label: 'Pixabay API key', secret: true },
  bingApiKey: { env: 'BING_API_KEY', label: 'Bing API key', secret: true },
  bingApiUrl: { env: 'BING_API_URL', label: 'Bing API URL', secret: false, url: true },
  capServerUrl: { env: 'CAP_SERVER_URL', label: 'CAP server URL', secret: false, url: true },
  capVerifyPath: { env: 'CAP_VERIFY_PATH', label: 'CAP verify path', secret: false },
  capSecret: { env: 'CAP_SECRET', label: 'CAP secret', secret: true },
  turnstileSecret: { env: 'TURNSTILE_SECRET', label: 'Turnstile secret', secret: true }
};
const PREFIX = 'enc:v1:';
function keyOf(root) { return createHash('sha256').update(String(root || '')).digest(); }
export function encryptConfig(value, root) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyOf(root), iv); const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]); return PREFIX + [iv, cipher.getAuthTag(), body].map(x => x.toString('base64url')).join('.'); }
export function decryptConfig(value, root) { if (!String(value).startsWith(PREFIX)) return String(value); try { const [, data] = String(value).split(PREFIX); const [iv, tag, body] = data.split('.').map(x => Buffer.from(x, 'base64url')); const decipher = createDecipheriv('aes-256-gcm', keyOf(root), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'); } catch { return ''; } }
export function createAdminConfigRepository(db, { env = process.env, encryptionRoot = '' } = {}) {
  const get = key => { const field = ADMIN_CONFIG_FIELDS[key]; if (!field) return null; const envValue = env[field.env]; if (envValue !== undefined && envValue !== '') return { value: String(envValue), source: 'environment' }; let row; try { row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`admin.${key}`); } catch { row = null; } return row ? { value: decryptConfig(row.value, encryptionRoot), source: 'database' } : { value: '', source: 'unset' }; };
  return { get, metadata() { return Object.fromEntries(Object.entries(ADMIN_CONFIG_FIELDS).map(([key, field]) => { const current = get(key); return [key, { label: field.label, secret: field.secret, source: current.source, configured: Boolean(current.value) }]; })); }, save(values) { const stmt = db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP"); const tx = db.transaction(() => { for (const [key, value] of Object.entries(values)) { const field = ADMIN_CONFIG_FIELDS[key]; if (!field || env[field.env]) continue; stmt.run(`admin.${key}`, encryptConfig(value, encryptionRoot)); } }); tx(); } };
}
