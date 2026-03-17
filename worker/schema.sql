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

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_passkey_creds_user_id    ON passkey_creds(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id         ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash      ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at      ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id   ON recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id  ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created  ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id    ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_id    ON chat_messages(conversation_id);

-- ── TOTP ──────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN totp_secret  TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;

-- ── User tiers ────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'pending',
  note        TEXT,
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS allowed_models (
  id       TEXT PRIMARY KEY,
  model_id TEXT NOT NULL UNIQUE,
  label    TEXT NOT NULL,
  tier     TEXT NOT NULL DEFAULT 'pro',
  enabled  INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user_id ON upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status  ON upgrade_requests(status);

-- ── Student tier ───────────────────────────────────────────────────
ALTER TABLE upgrade_requests ADD COLUMN tier TEXT NOT NULL DEFAULT 'pro';

-- ── WhatsApp backup auth ────────────────────────────────────────────
ALTER TABLE users ADD COLUMN phone_number   TEXT;
ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;

-- ── Endpoint request log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS endpoint_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  status     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_endpoint_logs_created_at ON endpoint_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_path       ON endpoint_logs(path, method);

-- Seed default models
INSERT OR IGNORE INTO allowed_models (id, model_id, label, tier, enabled, added_at) VALUES
  ('model-llama-70b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B Fast', 'pro', 1, 0),
  ('model-llama-8b',  '@cf/meta/llama-3.1-8b-instruct',           'Llama 3.1 8B',        'pro', 1, 0),
  ('model-claude',    'claude-sonnet-4-6',                         'Claude Sonnet 4.6',   'pro', 0, 0);
