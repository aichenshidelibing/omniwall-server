CREATE TABLE IF NOT EXISTS image_cache (
  cache_key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  author TEXT,
  author_url TEXT,
  source_url TEXT,
  query TEXT,
  orientation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_cache_expires ON image_cache(expires_at);
CREATE TABLE IF NOT EXISTS daily_images (
  day TEXT NOT NULL,
  orientation TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  author TEXT,
  author_url TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, orientation)
);