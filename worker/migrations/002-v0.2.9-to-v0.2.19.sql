-- ── Migration 002: v0.2.8 → v0.2.19 ─────────────────────────────
-- Apply with:
--   npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/migrations/002-v0.2.9-to-v0.2.19.sql
--
-- Safe to run once against a prod DB that was last migrated at v0.2.8.
-- All three statements use CREATE TABLE IF NOT EXISTS — idempotent.
--
-- Changes included:
--   v0.2.9  — endpoint_logs table (request volume tracking for admin dashboard)
--   v0.2.14 — trusted_devices table (persistent device trust to skip sign-in prompt)
--   v0.2.19 — feedback table (anonymous feedback widget submissions)


-- ── v0.2.9: Endpoint request log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS endpoint_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  status     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_endpoint_logs_created_at ON endpoint_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_path       ON endpoint_logs(path, method);


-- ── v0.2.14: Trusted devices ─────────────────────────────────────
-- Persistent device trust: set when user chooses "Trust this device".
-- A valid trust record lets the user skip the trust prompt on subsequent
-- sign-ins from the same browser/device.
CREATE TABLE IF NOT EXISTS trusted_devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  token_hash   TEXT UNIQUE NOT NULL,
  device_name  TEXT,
  user_agent   TEXT,
  fingerprint  TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id    ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token_hash ON trusted_devices(token_hash);


-- ── v0.2.19: Feedback ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT    PRIMARY KEY,
  message     TEXT    NOT NULL,
  page        TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
