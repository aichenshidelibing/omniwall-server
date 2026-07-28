function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function requestProtocol(req, trustProxy) {
  if (trustProxy && req.headers['x-forwarded-proto']) {
    return String(req.headers['x-forwarded-proto']).split(',')[0].trim();
  }
  return req.protocol || 'http';
}

export async function nodeRequestToWebRequest(req, options = {}) {
  const trustProxy = options.trustProxy ?? true;
  const protocol = requestProtocol(req, trustProxy);
  const host = req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.originalUrl || req.url || '/'}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
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
    const body = await collectRequestBody(req);
    init.body = body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

export async function sendWebResponse(expressRes, webResponse) {
  expressRes.status(webResponse.status);

  const getSetCookie = typeof webResponse.headers.getSetCookie === 'function'
    ? webResponse.headers.getSetCookie.bind(webResponse.headers)
    : null;
  const setCookies = getSetCookie ? getSetCookie() : [];

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      expressRes.setHeader(key, value);
    }
  });

  if (setCookies.length) {
    expressRes.setHeader('set-cookie', setCookies);
  } else {
    const setCookie = webResponse.headers.get('set-cookie');
    if (setCookie) expressRes.setHeader('set-cookie', setCookie);
  }

  const body = Buffer.from(await webResponse.arrayBuffer());
  expressRes.send(body);
}
