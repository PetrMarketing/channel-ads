-- Меняем тип telegram_message_id с BIGINT на TEXT в content_posts
-- MAX-каналы используют строковые mid (например mid.ffffbdad3bf43234...),
-- которые не помещаются в BIGINT
ALTER TABLE content_posts ALTER COLUMN telegram_message_id TYPE TEXT USING telegram_message_id::TEXT;
