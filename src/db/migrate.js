import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => /^\d+-.+\.sql$/.test(file)).sort();
  for (const file of files) {
    const version = Number(file.match(/^(\d+)/)[1]);
    if (applied.has(version)) continue;
    const apply = db.transaction(() => {
      db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    });
    apply();
  }
}
