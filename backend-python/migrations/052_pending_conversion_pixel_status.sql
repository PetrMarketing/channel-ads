-- Migration 052: per-row pixel-firing status on pending_conversions.
-- Adds explicit columns so the user can see, for every click → subscription,
-- exactly when the bot detected the sub, when YM/VK pixels were fired, and
-- the HTTP response (or error) for each.
ALTER TABLE pending_conversions
  ADD COLUMN IF NOT EXISTS subscribed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ym_fired_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ym_response_code INT,
  ADD COLUMN IF NOT EXISTS ym_error         TEXT,
  ADD COLUMN IF NOT EXISTS vk_fired_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vk_response_code INT,
  ADD COLUMN IF NOT EXISTS vk_error         TEXT;
