import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';
import fs from 'node:fs';

export async function startServer() {
  const config = loadConfig();
  const db = createDatabase(config.databasePath);
  migrate(db);
  const app = buildApp({ config, db });
  const close = async (signal) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  const listenOptions = { host: config.host, port: config.port };
  if (config.https) {
    listenOptions.https = { key: fs.readFileSync(config.tlsKeyFile), cert: fs.readFileSync(config.tlsCertFile) };
  }
  await app.listen(listenOptions);
  if (app.adminEntrypoint?.token) app.log.info({ adminPath: '/admin/[one-time-token]', expiresAt: app.adminEntrypoint.expiresAt }, 'admin entrypoint ready');
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
