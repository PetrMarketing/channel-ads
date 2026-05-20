-- Если бот добавлен в канал админом ДО того как владелец залогинился
-- в сервисе — запоминаем его max_user_id здесь. При первой авторизации
-- этого max_user_id — каналы автоматически привязываются к новому
-- account (см. find_or_create_max_user).

ALTER TABLE channels ADD COLUMN IF NOT EXISTS pending_owner_max_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_channels_pending_owner ON channels(pending_owner_max_user_id) WHERE pending_owner_max_user_id IS NOT NULL;
