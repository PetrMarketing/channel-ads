-- Глобальные флаги видимости разделов сервиса
-- Используется для постепенного раскатывания фич и заглушек «Скоро появится»
CREATE TABLE IF NOT EXISTS feature_visibility (
    feature_key TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'visible',  -- visible | coming_soon | hidden
    coming_soon_message TEXT NOT NULL DEFAULT 'Этот раздел скоро появится',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by INTEGER
);

-- Сидим известные секции (включаем заглушку для polls/streams сразу)
INSERT INTO feature_visibility (feature_key, title, visibility, coming_soon_message)
VALUES
    ('content_polls',  'Опросы',  'coming_soon', 'Опросы скоро появятся'),
    ('content_streams','Эфиры',   'coming_soon', 'Эфиры скоро появятся')
ON CONFLICT (feature_key) DO NOTHING;
