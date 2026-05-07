-- История ИИ-генераций (одиночных, не из ИИ Контента) — для вкладки
-- "Мои файлы". Решает orphan-проблему: пользователь закрыл модалку до
-- того как картинка вернулась — она всё равно сохранена и доступна.
CREATE TABLE IF NOT EXISTS ai_generations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
    prompt TEXT,
    result_text TEXT,                -- для kind='text'
    result_file_path TEXT,           -- для kind='image': '/uploads/ai_post_img_*.png'
    tokens_charged INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,                  -- format, refs_count, has_file, use_channel_style и пр.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aigen_channel_kind_created
    ON ai_generations(channel_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aigen_user_kind_created
    ON ai_generations(user_id, kind, created_at DESC);
