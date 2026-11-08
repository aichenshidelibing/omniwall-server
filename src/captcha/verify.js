export class CaptchaVerifyError extends Error {
  constructor(message, { code = 'CAPTCHA_VERIFY_ERROR', statusCode, cause } = {}) {
    super(message, { cause });
    this.name = 'CaptchaVerifyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isSuccess(body) {
  return body === true || Boolean(body && typeof body === 'object' && (body.success === true || body.valid === true || body.verified === true || body.ok === true));
}

function createHttpVerifier({ name, url, timeoutMs = 5000, fetchImpl = globalThis.fetch, request }) {
  if (!url) throw new Error(`${name} verify URL is required`);
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const timeout = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  return {
    provider: name.toLowerCase(),
    url,
    async verify(token, context = {}) {
      if (!token || typeof token !== 'string') return { success: false, reason: 'missing-token' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchImpl(url, { ...request(token, context), signal: controller.signal });
        const text = await response.text();
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!response.ok) throw new CaptchaVerifyError(`${name} verify endpoint returned HTTP ${response.status}`, { code: `${name.toUpperCase()}_HTTP_ERROR`, statusCode: response.status });
        return { success: isSuccess(body), response: body };
      } catch (error) {
        if (error instanceof CaptchaVerifyError) throw error;
        if (error?.name === 'AbortError') throw new CaptchaVerifyError(`${name} verify request timed out after ${timeout}ms`, { code: `${name.toUpperCase()}_TIMEOUT`, cause: error });
        throw new CaptchaVerifyError(`${name} verify request failed`, { code: `${name.toUpperCase()}_NETWORK_ERROR`, cause: error });
      } finally { clearTimeout(timer); }
    }
  };
}

export function createNoneVerifier() {
  return { provider: 'none', async verify() { return { success: true, provider: 'none' }; } };
}

export function createTurnstileVerifier({ secret, siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify', ...options } = {}) {
  if (!secret) throw new Error('TURNSTILE_SECRET is required to create a Turnstile verifier');
  return createHttpVerifier({
    ...options, name: 'Turnstile', url: siteverifyUrl,
    request: (token, context) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ secret, response: token, ...(context.ip ? { remoteip: context.ip } : {}) }) })
  });
}

export function createCaptchaVerifier(config = {}) {
  const provider = String(config.provider || 'none').toLowerCase();
  if (provider === 'none') return createNoneVerifier();
  if (provider === 'cap') {
    return createHttpVerifier({
      name: 'CAP', url: `${String(config.serverUrl).replace(/\/$/, '')}/${String(config.verifyPath || '/verify').replace(/^\//, '')}`,
      timeoutMs: config.timeoutMs, fetchImpl: config.fetchImpl,
      request: (token, context) => ({ method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...(config.secret ? { 'x-cap-secret': config.secret } : {}) }, body: JSON.stringify({ token, ...context }) })
    });
  }
  if (provider === 'turnstile') return createTurnstileVerifier({ secret: config.secret || config.turnstileSecret, siteverifyUrl: config.siteverifyUrl || config.turnstileSiteverifyUrl, timeoutMs: config.timeoutMs, fetchImpl: config.fetchImpl });
  throw new Error(`Unsupported captcha provider: ${provider}`);
}
