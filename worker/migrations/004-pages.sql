-- ── Migration 004: shared pages ──────────────────────────────────
-- Apply with:
--   npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/migrations/004-pages.sql
--
-- Stores admin-managed HTML pages accessible publicly at /p/:slug.

CREATE TABLE IF NOT EXISTS pages (
  id         TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug       TEXT    NOT NULL UNIQUE,
  title      TEXT    NOT NULL,
  folder     TEXT,
  content    TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_pages_slug   ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_folder ON pages(folder);
