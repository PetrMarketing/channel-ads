-- Migration 044: Per-visit token for bot-routed conversion attribution.
-- The frontend SubscribePage routes the user through the bot using start=v_{visit_token}
-- so the bot can stamp telegram_id/max_user_id on the visit. The chat_member handler
-- then links the resulting subscription back to the visit, which lets
-- /track/check-subscription-by-visit succeed and the page fire YM/VK pixel goals.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_token TEXT;

-- Backfill existing rows with random tokens (idempotent — only updates NULLs).
-- Use substr(md5(...)) to avoid requiring pgcrypto extension.
UPDATE visits
   SET visit_token = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 16)
 WHERE visit_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_token ON visits(visit_token);
