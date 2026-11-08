CREATE TABLE IF NOT EXISTS image_cache_pool (
  cache_key TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  author TEXT,
  author_url TEXT,
  source_url TEXT,
  query TEXT,
  orientation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (cache_key, url)
);
CREATE INDEX IF NOT EXISTS idx_image_cache_pool_expiry ON image_cache_pool(expires_at);
CREATE INDEX IF NOT EXISTS idx_image_cache_pool_key ON image_cache_pool(cache_key, created_at);
