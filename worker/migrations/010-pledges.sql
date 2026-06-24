-- Donation pledges for /kamalesh fundraiser page
CREATE TABLE IF NOT EXISTS pledges (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL,
  amount   REAL    NOT NULL,          -- in stated currency
  currency TEXT    NOT NULL,          -- 'USD' or 'CAD'
  sent     INTEGER NOT NULL DEFAULT 0, -- 1 = donor says they already sent it
  note     TEXT,
  ts       INTEGER NOT NULL,          -- Unix epoch seconds
  verified INTEGER NOT NULL DEFAULT 0, -- 1 = admin confirmed receipt
  country  TEXT                        -- CF-IPCountry at submit time
);

CREATE INDEX IF NOT EXISTS idx_pledges_verified ON pledges(verified, ts);
