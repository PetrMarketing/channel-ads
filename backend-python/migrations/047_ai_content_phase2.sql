-- ИИ Контент Phase 2: фотобанк + история генерации изображений к постам

-- Photo bank — пользователь загружает референсные фото с описанием,
-- ИИ использует их для генерации иллюстраций к постам.
CREATE TABLE IF NOT EXISTS ai_content_photos (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_photos_channel ON ai_content_photos(channel_id);
CREATE INDEX IF NOT EXISTS idx_ai_content_photos_user ON ai_content_photos(user_id);

-- История сгенерированных картинок — поля в ai_content_session_posts.
ALTER TABLE ai_content_session_posts
    ADD COLUMN IF NOT EXISTS generated_image_url TEXT;
ALTER TABLE ai_content_session_posts
    ADD COLUMN IF NOT EXISTS generated_image_prompt TEXT;
ALTER TABLE ai_content_session_posts
    ADD COLUMN IF NOT EXISTS generated_image_mode TEXT;
ALTER TABLE ai_content_session_posts
    ADD COLUMN IF NOT EXISTS generated_image_format TEXT;
ALTER TABLE ai_content_session_posts
    ADD COLUMN IF NOT EXISTS generated_image_palette JSONB;
