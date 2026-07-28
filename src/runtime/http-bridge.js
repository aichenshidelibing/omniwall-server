import { Readable } from 'node:stream';

export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Request body exceeds ${maxBytes} byte limit`);
    this.name = 'RequestBodyTooLargeError';
    this.statusCode = 413;
    this.maxBytes = maxBytes;
  }
}

function collectRequestBody(req, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return Promise.reject(new RequestBodyTooLargeError(maxBytes));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      req.resume?.();
      reject(error);
    }

    function onData(chunk) {
      if (settled) return;
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        fail(new RequestBodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(buffer);
    }

    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    }

    function onError(error) {
      fail(error);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

function requestProtocol(req, trustProxy) {
  if (trustProxy && req.headers['x-forwarded-proto']) {
    return String(req.headers['x-forwarded-proto']).split(',')[0].trim() || 'http';
  }
  return req.socket?.encrypted || req.secure ? 'https' : 'http';
}

export async function nodeRequestToWebRequest(req, options = {}) {
  const trustProxy = options.trustProxy ?? false;
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const protocol = requestProtocol(req, trustProxy);
  const host = req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.originalUrl || req.url || '/'}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();
    if (!trustProxy && (lowerKey.startsWith('x-forwarded-') || lowerKey === 'cf-connecting-ip')) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const init = {
    method: req.method,
    headers
  };

  if (!['GET', 'HEAD'].includes(String(req.method).toUpperCase())) {
    const body = await collectRequestBody(req, { maxBytes: maxBodyBytes });
    init.body = body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

function setResponseHeaders(expressRes, headers) {
  const getSetCookie = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie.bind(headers)
    : null;
  const setCookies = getSetCookie ? getSetCookie() : [];

  headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      expressRes.setHeader(key, value);
    }
  });

  if (setCookies.length) {
    expressRes.setHeader('set-cookie', setCookies);
  } else {
    const setCookie = headers.get('set-cookie');
    if (setCookie) expressRes.setHeader('set-cookie', setCookie);
  }
}

function canStreamToExpress(expressRes, webResponse) {
  return webResponse.body && typeof Readable.fromWeb === 'function' && typeof expressRes.write === 'function' && typeof expressRes.end === 'function';
}

export async function sendWebResponse(expressRes, webResponse) {
  expressRes.status(webResponse.status);
  setResponseHeaders(expressRes, webResponse.headers);

  if (canStreamToExpress(expressRes, webResponse)) {
    await new Promise((resolve, reject) => {
      const nodeStream = Readable.fromWeb(webResponse.body);
      nodeStream.on('error', reject);
      expressRes.on?.('error', reject);
      expressRes.on?.('finish', resolve);
      nodeStream.pipe(expressRes);
    });
    return;
  }

  const body = Buffer.from(await webResponse.arrayBuffer());
  expressRes.send(body);
}
