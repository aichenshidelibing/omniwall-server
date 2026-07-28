import { createApp } from './app.js';
import { assertRequiredServerEnv, loadServerEnv } from './env.js';
import { startScheduler } from './jobs/scheduler.js';

const env = loadServerEnv();
assertRequiredServerEnv(env);

const app = createApp({ env });
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`OmniWall server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`SQLite database: ${env.DATABASE_PATH}`);
});

const stopScheduler = startScheduler(app.locals.worker, app.locals.workerEnv, {
  intervalSeconds: env.SCHEDULE_INTERVAL_SECONDS,
  runOnStart: env.RUN_SCHEDULED_ON_START
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down OmniWall server...`);
  stopScheduler();
  server.close(() => {
    app.locals.workerEnv.DB?.close?.();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
