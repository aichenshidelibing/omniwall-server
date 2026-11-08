import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('config', () => {
  it('applies safe defaults', () => {
    const config = loadConfig({ PORT: '', TRUST_PROXY: '' });
    expect(config.port).toBe(18080);
    expect(config.trustProxy).toBe(false);
  });

  it('rejects malformed integers', () => {
    const config = loadConfig({ PORT: '3000abc' });
    expect(config.port).toBe(18080);
  });
});
