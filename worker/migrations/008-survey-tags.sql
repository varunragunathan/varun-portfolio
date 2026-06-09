-- Add free-form tags to survey responses.
-- Stored as a JSON array of strings (e.g. '["positive","detailed"]').
ALTER TABLE survey_sessions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
