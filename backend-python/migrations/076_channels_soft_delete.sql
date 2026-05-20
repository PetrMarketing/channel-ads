-- Мягкое удаление каналов. Юзер удаляет → SET deleted_at=NOW().
-- Через 30 дней крон физически удаляет (cascade на content/pins/etc).
-- Все list-запросы фильтруют WHERE deleted_at IS NULL.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_channels_deleted_at ON channels(deleted_at) WHERE deleted_at IS NOT NULL;
