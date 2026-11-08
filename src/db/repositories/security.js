import { createHash } from 'node:crypto';

export function hashIp(ip, salt = '') { return createHash('sha256').update(`${salt}:${ip}`).digest('hex'); }

export function createSecurityRepository(db) {
  return {
    audit(event, data = {}) {
      db.prepare('INSERT INTO security_audit (event, ip_hash, username, metadata) VALUES (?, ?, ?, ?)').run(event, data.ipHash || '', data.username || '', JSON.stringify(data.metadata || {}));
    },
    allowRate(key, limit, windowSeconds) {
      const now = Math.floor(Date.now() / 1000);
      const row = db.prepare('SELECT count, window_started FROM rate_limits WHERE key = ?').get(key);
      if (!row || now - row.window_started >= windowSeconds) {
        db.prepare('INSERT INTO rate_limits (key,count,window_started) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_started=excluded.window_started').run(key, now);
        return true;
      }
      if (row.count >= limit) return false;
      db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(key);
      return true;
    }
  };
}
