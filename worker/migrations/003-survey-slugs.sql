-- ── Migration 003: survey short URL slugs ────────────────────────
-- Apply with:
--   npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/migrations/003-survey-slugs.sql
--
-- Adds a unique `slug` column to surveys for short URLs (/s/:slug).
-- Existing rows get NULL slugs — they'll be auto-assigned on next edit.

ALTER TABLE surveys ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_slug ON surveys(slug);
