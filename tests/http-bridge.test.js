import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { nodeRequestToWebRequest, sendWebResponse } from '../src/runtime/http-bridge.js';

function mockReq({ method = 'GET', url = '/docs?lang=en', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.originalUrl = url;
  req.url = url;
  req.headers = { host: 'example.test', ...headers };
  req.protocol = 'http';
  return req;
}

describe('http bridge', () => {
  it('creates a Web Request with full URL, method, headers, and body', async () => {
    const req = mockReq({
      method: 'POST',
      url: '/api/check-content',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-proto': 'https' },
      body: 'query=nature'
    });

    const webRequest = await nodeRequestToWebRequest(req, { trustProxy: true });

    expect(webRequest.url).toBe('https://example.test/api/check-content');
    expect(webRequest.method).toBe('POST');
    expect(webRequest.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(await webRequest.text()).toBe('query=nature');
  });

  it('sends status, headers, and body from a Web Response', async () => {
    const expressRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn()
    };
    const webResponse = new Response('hello', {
      status: 201,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-test': 'ok'
      }
    });

    await sendWebResponse(expressRes, webResponse);

    expect(expressRes.status).toHaveBeenCalledWith(201);
    expect(expressRes.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; charset=utf-8');
    expect(expressRes.setHeader).toHaveBeenCalledWith('x-test', 'ok');
    expect(expressRes.send.mock.calls[0][0].toString()).toBe('hello');
  });
});
