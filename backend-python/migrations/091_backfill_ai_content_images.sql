-- Бэкфилл картинок для запланированных постов из ИИ Контента.
--
-- Проблема: до фикса _convert_to_content_post не переносил generated_image_url
-- из ai_content_session_posts в content_posts.file_path — посты в статусе
-- 'scheduled' публиковались без картинки.
--
-- Здесь только file_path проставляем; file_data (bytes) заливается отдельным
-- скриптом scripts/backfill_ai_image_bytes.py — так как SQL не умеет читать
-- файлы с диска. Без file_data пост тоже опубликуется — ensure_file теперь
-- умеет резолвить /uploads/xxx → /app/uploads/xxx.

UPDATE content_posts cp
SET file_path = acsp.generated_image_url,
    file_type = 'photo',
    attach_type = 'photo',
    telegram_file_id = NULL,   -- сброс кэшей чтобы платформа заново загрузила
    max_file_token = NULL
FROM ai_content_session_posts acsp
WHERE acsp.published_post_id = cp.id
  AND acsp.generated_image_url IS NOT NULL
  AND acsp.generated_image_url <> ''
  AND (cp.file_path IS NULL OR cp.file_path = '')
  AND cp.status IN ('scheduled', 'draft', 'failed');

-- Не логируем количество — обычно UPDATE в миграции нет NOTICE'а.
-- Проверить сколько задело: SELECT COUNT(*) FROM content_posts cp
-- JOIN ai_content_session_posts acsp ON acsp.published_post_id=cp.id
-- WHERE cp.status='scheduled' AND cp.file_path=acsp.generated_image_url;
