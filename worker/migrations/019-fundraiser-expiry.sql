ALTER TABLE fundraisers ADD COLUMN expiry_date TEXT;

-- Re-enable Geetha's fundraiser for one more week
UPDATE fundraisers SET active = 1, expiry_date = date('now', '+7 days') WHERE slug = 'geetha';
