-- ── varun-portfolio-auth D1 schema ───────────────────────────────
-- Apply with:
--   npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/schema.sql
-- For local dev:
--   npx wrangler d1 execute varun-portfolio-auth --local --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id                        TEXT PRIMARY KEY,
  email                     TEXT UNIQUE NOT NULL,
  created_at                INTEGER NOT NULL,
  nickname                  TEXT,
  frozen_until              INTEGER,
  recovery_rate_limit_until INTEGER
);

CREATE TABLE IF NOT EXISTS passkey_creds (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  public_key         TEXT NOT NULL,
  sign_count         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  last_used_at       INTEGER,
  nickname           TEXT,
  transport          TEXT,
  authenticator_type TEXT,
  is_synced          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  token_hash     TEXT UNIQUE NOT NULL,
  device_name    TEXT,
  user_agent     TEXT,
  ip             TEXT,
  created_at     INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  trusted        INTEGER NOT NULL DEFAULT 0,
  expires_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  code_hash  TEXT NOT NULL,
  code_salt  TEXT NOT NULL,
  position   INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  used_at    INTEGER,
  generation INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  device_name TEXT,
  metadata    TEXT,
  created_at  INTEGER NOT NULL
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_passkey_creds_user_id    ON passkey_creds(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id         ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash      ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at      ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id   ON recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id  ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created  ON security_events(created_at);
