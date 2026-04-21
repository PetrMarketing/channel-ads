-- ИИ Лендинги
CREATE TABLE IF NOT EXISTS ai_landings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    channel_id INTEGER REFERENCES channels(id),
    status TEXT DEFAULT 'draft',
    -- Данные опроса
    niche TEXT,
    product TEXT,
    target_audience TEXT,
    design_style TEXT,
    additional_info TEXT,
    -- Фотографии [{url, description}]
    photos JSONB DEFAULT '[]',
    -- Сгенерированные данные
    technical_spec TEXT,
    html_content TEXT,
    -- Публикация
    published BOOLEAN DEFAULT FALSE,
    slug TEXT UNIQUE,
    tokens_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
