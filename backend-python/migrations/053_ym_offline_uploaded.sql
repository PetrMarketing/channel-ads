-- Track which pending_conversions have been uploaded to YM via Offline
-- Conversions API. Server-side mc.yandex.ru/watch fires get filtered as bot
-- traffic, so this offline path is the actual source of truth.
ALTER TABLE pending_conversions
  ADD COLUMN IF NOT EXISTS ym_offline_uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pending_conv_ym_offline_pending
  ON pending_conversions (subscribed_at)
  WHERE ym_offline_uploaded_at IS NULL;
