-- Add Gemini API key columns alongside the existing OpenAI columns.
-- Nullable — NULL means no Gemini key stored for that user.
ALTER TABLE user_encrypted_keys ADD COLUMN gemini_blob TEXT;
ALTER TABLE user_encrypted_keys ADD COLUMN gemini_hint TEXT;
