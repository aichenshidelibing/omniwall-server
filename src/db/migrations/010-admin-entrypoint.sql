CREATE TABLE IF NOT EXISTS admin_entrypoints (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  path_token_hash TEXT NOT NULL,
  path_token TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
