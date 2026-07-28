import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { nodeRequestToWebRequest, RequestBodyTooLargeError, sendWebResponse } from '../src/runtime/http-bridge.js';

function mockReq({ method = 'GET', url = '/docs?lang=en', headers = {}, body = '', ip, socket, connection } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.originalUrl = url;
  req.url = url;
  req.headers = { host: 'example.test', ...headers };
  req.protocol = 'http';
  req.ip = ip;
  req.socket = { encrypted: false, remoteAddress: '203.0.113.9', ...socket };
  req.connection = connection;
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

  it('ignores spoofed forwarded headers by default and passes req.ip to the Worker', async () => {
    const req = mockReq({
      ip: '203.0.113.25',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.10',
        'cf-connecting-ip': '198.51.100.11'
      }
    });

    const webRequest = await nodeRequestToWebRequest(req);

    expect(webRequest.url).toBe('http://example.test/docs?lang=en');
    expect(webRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(webRequest.headers.get('cf-connecting-ip')).toBe('203.0.113.25');
  });

  it('uses the direct socket address as trusted client IP when req.ip is unavailable', async () => {
    const req = mockReq({ socket: { remoteAddress: '2001:db8::7' } });

    const webRequest = await nodeRequestToWebRequest(req);

    expect(webRequest.headers.get('cf-connecting-ip')).toBe('2001:db8::7');
  });

  it('keeps forwarded IP and proto headers when proxy trust is enabled', async () => {
    const req = mockReq({
      ip: '203.0.113.25',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.10',
        'cf-connecting-ip': '198.51.100.11'
      }
    });

    const webRequest = await nodeRequestToWebRequest(req, { trustProxy: true });

    expect(webRequest.url).toBe('https://example.test/docs?lang=en');
    expect(webRequest.headers.get('x-forwarded-for')).toBe('198.51.100.10');
    expect(webRequest.headers.get('cf-connecting-ip')).toBe('198.51.100.11');
  });

  it('rejects request bodies over the configured cap', async () => {
    const req = mockReq({ method: 'POST', body: '123456' });

    await expect(nodeRequestToWebRequest(req, { maxBodyBytes: 5 })).rejects.toBeInstanceOf(RequestBodyTooLargeError);
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

  it('forwards multiple Set-Cookie headers to Express', async () => {
    const expressRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn()
    };
    const headers = new Headers({ 'content-type': 'text/plain' });
    headers.append('Set-Cookie', 'session=abc; HttpOnly; Path=/');
    headers.append('Set-Cookie', 'prefs=dark; Path=/');
    const webResponse = new Response('ok', { headers });

    await sendWebResponse(expressRes, webResponse);

    expect(expressRes.setHeader).toHaveBeenCalledWith('set-cookie', [
      'session=abc; HttpOnly; Path=/',
      'prefs=dark; Path=/'
    ]);
  });

  it('streams Web Response bodies to Express when possible', async () => {
    const chunks = [];
    const expressRes = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    expressRes.status = vi.fn().mockReturnThis();
    expressRes.setHeader = vi.fn();
    const webResponse = new Response(Readable.toWeb(Readable.from(['streamed'])));

    await sendWebResponse(expressRes, webResponse);

    expect(expressRes.status).toHaveBeenCalledWith(200);
    expect(Buffer.concat(chunks).toString()).toBe('streamed');
  });
});
