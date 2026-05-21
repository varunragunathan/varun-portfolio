-- ── Interview sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_sessions (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL,
  theme           TEXT    NOT NULL,
  avatar_id       TEXT    NOT NULL DEFAULT 'hooty',
  duration_target INTEGER NOT NULL DEFAULT 1800,
  duration_actual INTEGER,
  model           TEXT    NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL    NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at        INTEGER
);

CREATE TABLE IF NOT EXISTS interview_messages (
  id          TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL REFERENCES interview_sessions(id),
  role        TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Encrypted API keys per user (E2E — server only stores the blob)
CREATE TABLE IF NOT EXISTS user_encrypted_keys (
  user_id        TEXT    PRIMARY KEY,
  encrypted_blob TEXT    NOT NULL,
  key_hint       TEXT,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_messages_session_id ON interview_messages(session_id);
