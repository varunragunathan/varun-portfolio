-- Contribution pledges for generic fundraiser pages
CREATE TABLE IF NOT EXISTS fundraiser_contributions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT    NOT NULL,
  name     TEXT    NOT NULL,
  amount   REAL    NOT NULL,
  currency TEXT    NOT NULL DEFAULT 'INR',
  sent     INTEGER NOT NULL DEFAULT 0,
  note     TEXT,
  ts       INTEGER NOT NULL,
  country  TEXT
);

CREATE INDEX IF NOT EXISTS idx_fc_slug ON fundraiser_contributions(slug, ts DESC);

-- Set Geetha campaign deadline (surgery_date doubles as deadline for non-surgery fundraisers)
UPDATE fundraisers SET surgery_date = '2026-07-05' WHERE slug = 'geetha';
