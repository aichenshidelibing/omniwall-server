import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../src/env.js';

describe('server env', () => {
  it('uses safe proxy and request size defaults', () => {
    const env = loadServerEnv({ TRUST_PROXY: '', MAX_REQUEST_BODY_BYTES: '' });

    expect(env.TRUST_PROXY).toBe(false);
    expect(env.MAX_REQUEST_BODY_BYTES).toBe(1024 * 1024);
  });

  it('parses integer env values strictly', () => {
    const env = loadServerEnv({ PORT: '3000abc', SCHEDULE_INTERVAL_SECONDS: '900.5', MAX_REQUEST_BODY_BYTES: '2048' });

    expect(env.PORT).toBe(3000);
    expect(env.SCHEDULE_INTERVAL_SECONDS).toBe(900);
    expect(env.MAX_REQUEST_BODY_BYTES).toBe(2048);
  });
});
