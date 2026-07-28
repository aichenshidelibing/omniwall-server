import express from 'express';
import worker from './worker.mjs';
import { createD1Database } from './db/d1-sqlite.js';
import { loadServerEnv } from './env.js';
import { createExecutionContext } from './runtime/execution-context.js';
import { nodeRequestToWebRequest, RequestBodyTooLargeError, sendWebResponse } from './runtime/http-bridge.js';

function drainWaitUntil(ctx, logger = console) {
  setImmediate(() => {
    ctx.runWaitUntil().catch((error) => {
      logger.error('waitUntil drain failed:', error);
    });
  });
}

export function createApp(options = {}) {
  const serverEnv = loadServerEnv(options.env || {});
  const db = options.db || createD1Database(serverEnv.DATABASE_PATH);
  const activeWorker = options.worker || worker;
  const logger = options.logger || console;
  const workerEnv = {
    ...serverEnv,
    DB: db
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Boolean(serverEnv.TRUST_PROXY));
  app.locals.workerEnv = workerEnv;
  app.locals.worker = activeWorker;

  app.all('*', async (req, res, next) => {
    const ctx = createExecutionContext(logger);
    try {
      const webRequest = await nodeRequestToWebRequest(req, {
        trustProxy: Boolean(serverEnv.TRUST_PROXY),
        maxBodyBytes: serverEnv.MAX_REQUEST_BODY_BYTES
      });
      const webResponse = await activeWorker.fetch(webRequest, workerEnv, ctx);
      await sendWebResponse(res, webResponse);
      drainWaitUntil(ctx, logger);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        res.status(413).type('text/plain').send('Request body too large');
        return;
      }
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('OmniWall server error:', error);
    res.status(500).type('text/plain').send('OmniWall server error');
  });

  return app;
}
