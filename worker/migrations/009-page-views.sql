-- Page view tracking for public fundraiser / landing pages
CREATE TABLE IF NOT EXISTS page_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page       TEXT    NOT NULL,
  ts         INTEGER NOT NULL,  -- Unix epoch seconds
  country    TEXT,              -- CF-IPCountry header (e.g. "US", "CA", "IN")
  referrer   TEXT               -- Origin of the referrer header, or null
);

CREATE INDEX IF NOT EXISTS idx_page_views_page_ts ON page_views(page, ts);
