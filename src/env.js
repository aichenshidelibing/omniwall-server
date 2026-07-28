import dotenv from 'dotenv';

dotenv.config();

function boolFromEnv(value, defaultValue) {
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intFromEnv(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function loadServerEnv(overrides = {}) {
  const raw = { ...process.env, ...overrides };
  return {
    ...raw,
    HOST: raw.HOST || '0.0.0.0',
    PORT: intFromEnv(raw.PORT, 3000),
    DATABASE_PATH: raw.DATABASE_PATH || './data/omniwall.sqlite',
    TRUST_PROXY: boolFromEnv(raw.TRUST_PROXY, true),
    SCHEDULE_INTERVAL_SECONDS: intFromEnv(raw.SCHEDULE_INTERVAL_SECONDS, 900),
    RUN_SCHEDULED_ON_START: boolFromEnv(raw.RUN_SCHEDULED_ON_START, true),
    ADMIN_USERNAME: raw.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: raw.ADMIN_PASSWORD || '',
    SITE_NAME: raw.SITE_NAME || 'OmniWall',
    SITE_FAVICON: raw.SITE_FAVICON || ''
  };
}

export function assertRequiredServerEnv(env) {
  const missing = [];
  if (!env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    throw new Error(`Missing required environment variable: ${missing.join(', ')}`);
  }
}
