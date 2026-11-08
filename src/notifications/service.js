import crypto from 'node:crypto';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (value) => typeof value === 'string' ? value.replace(/(token|secret|key|authorization|api[_-]?key)(["'\s:=]+)[^,\s"']+/gi, '$1$2[REDACTED]') : value;

export class NotificationError extends Error {
  constructor(message, { code = 'UNKNOWN', retryable = false, status, retryAfterMs, provider } = {}) {
    super(message); this.name = 'NotificationError';
    Object.assign(this, { code, retryable, status, retryAfterMs, provider });
  }
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export function classifyError(error, context = {}) {
  if (error instanceof NotificationError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') return new NotificationError('Notification request timed out', { code: 'TIMEOUT', retryable: true, provider: context.provider });
  return new NotificationError(error?.message || 'Notification failed', { code: 'NETWORK', retryable: true, provider: context.provider });
}

async function request(url, options, { timeoutMs = 10000, provider } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) throw new NotificationError(`HTTP ${response.status}`, { code: response.status === 429 ? 'RATE_LIMIT' : 'HTTP', retryable: response.status === 429 || response.status >= 500, status: response.status, retryAfterMs: parseRetryAfter(response.headers.get('retry-after')), provider });
    return body;
  } catch (error) { throw classifyError(error, { provider }); } finally { clearTimeout(timer); }
}

function jsonHeaders(config) { return { 'content-type': 'application/json', ...(config.headers || {}) }; }

export function createTelegram(config) {
  return { validateConfig() { if (!config.token || !config.chatId) throw new Error('Telegram token and chatId are required'); }, async send(message) {
    this.validateConfig(); const payload = { chat_id: config.chatId, text: message.text ?? String(message), ...(config.parseMode ? { parse_mode: config.parseMode } : {}) };
    const result = await request(`https://api.telegram.org/bot${encodeURIComponent(config.token)}/sendMessage`, { method: 'POST', headers: jsonHeaders(config), body: JSON.stringify(payload) }, { ...config, provider: 'telegram' });
    if (result?.ok === false) throw new NotificationError(result.description || 'Telegram API error', { code: 'PROVIDER', retryable: false, provider: 'telegram' }); return result;
  }, classifyError };
}

export function createWebhook(config, provider = 'webhook') {
  return { validateConfig() { if (!config.url) throw new Error(`${provider} url is required`); }, async send(message) { this.validateConfig(); return request(config.url, { method: 'POST', headers: jsonHeaders(config), body: JSON.stringify(config.payload ? config.payload(message) : message) }, { ...config, provider }); }, classifyError };
}

export function signDingTalk(timestamp, secret) { return crypto.createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64'); }
export function createDingTalk(config) { return createWebhook({ ...config, url: (() => { const ts = Date.now(); return `${config.url}${config.url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${encodeURIComponent(signDingTalk(ts, config.secret))}`; })(), payload: (m) => ({ msgtype: 'text', text: { content: m.text ?? String(m) } }) }, 'dingtalk'); }
export function createLark(config) { return createWebhook({ ...config, payload: (m) => ({ msg_type: 'text', content: JSON.stringify({ text: m.text ?? String(m) }) }) }, 'lark'); }
export function createResend(config) { return createWebhook({ ...config, headers: { authorization: `Bearer ${config.apiKey}`, ...(config.headers || {}) }, url: config.url || 'https://api.resend.com/emails', payload: (m) => ({ from: config.from, to: config.to, subject: m.subject || 'Notification', text: m.text ?? String(m) }) }, 'resend'); }
export function createSendGrid(config) { return createWebhook({ ...config, headers: { authorization: `Bearer ${config.apiKey}`, ...(config.headers || {}) }, url: config.url || 'https://api.sendgrid.com/v3/mail/send', payload: (m) => ({ personalizations: [{ to: [{ email: config.to }] }], from: { email: config.from }, subject: m.subject || 'Notification', content: [{ type: 'text/plain', value: m.text ?? String(m) }] }) }, 'sendgrid'); }

export function createNotificationService({ providers = {}, logger = console, retries = 3, baseDelayMs = 250 } = {}) {
  const factories = { telegram: createTelegram, lark: createLark, dingtalk: createDingTalk, resend: createResend, sendgrid: createSendGrid, webhook: (c) => createWebhook(c) };
  return { async send(provider, message) { const config = providers[provider]; const factory = factories[provider]; if (!factory) throw new NotificationError(`Unknown provider: ${provider}`, { code: 'CONFIG' }); const client = factory(config || {}); client.validateConfig(); for (let attempt = 0; ; attempt++) { try { return await client.send(message); } catch (raw) { const error = client.classifyError(raw, { provider }); logger.warn?.({ provider, attempt, error: redact(error.message), code: error.code }, 'notification failed'); if (!error.retryable || attempt >= retries) throw error; await sleep(error.retryAfterMs ?? baseDelayMs * (2 ** attempt)); } } }, classifyError };
}
