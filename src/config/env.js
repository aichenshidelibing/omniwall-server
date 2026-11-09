import dotenv from 'dotenv';

dotenv.config();

function boolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integer(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function loadConfig(overrides = {}) {
  const raw = { ...process.env, ...overrides };
  return {
    nodeEnv: raw.NODE_ENV || 'development',
    host: raw.HOST || '0.0.0.0',
    port: integer(raw.PORT, 18080, { min: 1, max: 65535 }),
    https: boolean(raw.HTTPS, false),
    tlsKeyFile: raw.TLS_KEY_FILE || '',
    tlsCertFile: raw.TLS_CERT_FILE || '',
    databasePath: raw.DATABASE_PATH || './data/omniwall.sqlite',
    trustProxy: boolean(raw.TRUST_PROXY, false),
    logLevel: raw.LOG_LEVEL || 'info',
    captchaProvider: String(raw.CAPTCHA_PROVIDER || raw.CAP_PROVIDER || 'none').toLowerCase(),
    capServerUrl: raw.CAP_SERVER_URL || '',
    capVerifyPath: raw.CAP_VERIFY_PATH || '/verify',
    capSecret: raw.CAP_SECRET || raw.CAP_VERIFY_SECRET || '',
    capVerifyTimeoutMs: integer(raw.CAP_VERIFY_TIMEOUT_MS, 5000, { min: 1, max: 120000 }),
    turnstileSecret: raw.TURNSTILE_SECRET || '',
    turnstileSiteverifyUrl: raw.TURNSTILE_SITEVERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    siteName: raw.SITE_NAME || 'OmniWall',
    siteFavicon: raw.SITE_FAVICON || '',
    unsplashAccessKey: raw.UNSPLASH_ACCESS_KEY || '',
    pexelsApiKey: raw.PEXELS_API_KEY || '',
    pixabayApiKey: raw.PIXABAY_API_KEY || '',
    bingApiKey: raw.BING_API_KEY || '',
    bingApiUrl: raw.BING_API_URL || '',
    imageCacheTtlSeconds: integer(raw.IMAGE_CACHE_TTL_SECONDS, 900, { min: 1, max: 604800 }),
    imageRecentTtlSeconds: integer(raw.IMAGE_RECENT_TTL_SECONDS, 300, { min: 1, max: 604800 }),
    adminUsername: raw.ADMIN_USERNAME || '',
    adminPassword: raw.ADMIN_PASSWORD || '',
    adminPathDurationSeconds: integer(raw.ADMIN_PATH_DURATION_SECONDS, 86400, { min: 300, max: 31536000 }),
    adminAllowLegacyPath: boolean(raw.ADMIN_ALLOW_LEGACY_PATH, false),
    adminPathToken: raw.ADMIN_PATH_TOKEN || '',
    ipHashSalt: raw.IP_HASH_SALT || '',
    feedbackRateWindowSeconds: integer(raw.FEEDBACK_RATE_WINDOW_SECONDS, 60, { min: 1, max: 86400 }),
    feedbackRateMax: integer(raw.FEEDBACK_RATE_MAX, 3, { min: 1, max: 100 }),
    loginRateMax: integer(raw.LOGIN_RATE_MAX, 5, { min: 1, max: 100 }),
    loginRateWindowSeconds: integer(raw.LOGIN_RATE_WINDOW_SECONDS, 300, { min: 1, max: 86400 }),
    apiRateMax: integer(raw.API_RATE_MAX, 120, { min: 1, max: 10000 }),
    apiRateWindowSeconds: integer(raw.API_RATE_WINDOW_SECONDS, 60, { min: 1, max: 86400 }),
    apiKeyAbuseRateMax: integer(raw.API_KEY_ABUSE_RATE_MAX, 600, { min: 1, max: 100000 }),
    apiKeyAbuseRateWindowSeconds: integer(raw.API_KEY_ABUSE_RATE_WINDOW_SECONDS, 60, { min: 1, max: 86400 }),
    corsOrigins: String(raw.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
    notificationToken: raw.NOTIFICATION_TOKEN || '',
    notificationProviders: (() => {
      if (!raw.NOTIFICATION_PROVIDER || !raw.NOTIFICATION_CONFIG) return {};
      try { return { [String(raw.NOTIFICATION_PROVIDER).toLowerCase()]: JSON.parse(raw.NOTIFICATION_CONFIG) }; }
      catch { return {}; }
    })()
  };
}
