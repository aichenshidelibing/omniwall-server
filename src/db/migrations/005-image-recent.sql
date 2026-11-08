CREATE TABLE IF NOT EXISTS recent_images (
  url TEXT PRIMARY KEY,
  source TEXT,
  query TEXT,
  mode TEXT NOT NULL DEFAULT 'random',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recent_images_expiry ON recent_images(expires_at);
