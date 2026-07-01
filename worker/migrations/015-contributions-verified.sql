-- Add verified flag to fundraiser_contributions (mirrors pledges table pattern)
ALTER TABLE fundraiser_contributions ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_fc_verified ON fundraiser_contributions(slug, verified, ts DESC);
