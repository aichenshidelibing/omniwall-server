ALTER TABLE feedback ADD COLUMN ip_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN severity INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_feedback_ip_created ON feedback(ip_hash, created_at DESC);
