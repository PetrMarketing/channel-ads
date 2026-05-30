-- Хранить причину failed-публикации, чтобы юзер видел понятную ошибку
-- (например «У бота недостаточно прав…») вместо просто статуса.

ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS last_error TEXT;
