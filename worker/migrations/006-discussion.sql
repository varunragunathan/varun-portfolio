-- ── Discussion board ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discussion_topics (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  comment_count INTEGER NOT NULL DEFAULT 0,
  pinned        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discussion_comments (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES discussion_topics(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES discussion_comments(id),
  depth      INTEGER NOT NULL DEFAULT 0,
  author_id  TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_disc_comments_topic  ON discussion_comments(topic_id);
CREATE INDEX IF NOT EXISTS idx_disc_comments_parent ON discussion_comments(parent_id);
