-- ИИ Контент: запоминаем последнюю использованную палитру в сессии,
-- чтобы при следующей генерации иллюстрации палитра подставилась автоматически.
ALTER TABLE ai_content_sessions
    ADD COLUMN IF NOT EXISTS last_image_palette JSONB;
