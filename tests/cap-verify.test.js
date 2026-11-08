import { describe, expect, it, vi } from 'vitest';
import { createCapVerifier } from '../src/cap/verify.js';

describe('CAP verifier', () => {
  it('posts token and secret to configured endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const verifier = createCapVerifier({ serverUrl: 'https://cap.example.test/', verifyPath: 'check', secret: 'secret', fetchImpl });
    await expect(verifier.verify('token', { ip: '127.0.0.1' })).resolves.toMatchObject({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://cap.example.test/check', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-cap-secret': 'secret' }) }));
  });

  it('returns false for missing token without a request', async () => {
    const fetchImpl = vi.fn();
    await expect(createCapVerifier({ serverUrl: 'https://cap.test', fetchImpl }).verify('')).resolves.toEqual({ success: false, reason: 'missing-token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports HTTP and timeout failures', async () => {
    const http = createCapVerifier({ serverUrl: 'https://cap.test', fetchImpl: vi.fn().mockResolvedValue(new Response('bad', { status: 503 })) });
    await expect(http.verify('x')).rejects.toMatchObject({ code: 'CAP_HTTP_ERROR', statusCode: 503 });
    const timeoutFetch = vi.fn((_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))));
    const timeout = createCapVerifier({ serverUrl: 'https://cap.test', timeoutMs: 5, fetchImpl: timeoutFetch });
    await expect(timeout.verify('x')).rejects.toMatchObject({ code: 'CAP_TIMEOUT' });
  });
});
