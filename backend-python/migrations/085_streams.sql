-- Эфиры/трансляции (готовятся → идут → завершены)
CREATE TABLE IF NOT EXISTS streams (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    starts_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    bg_image_url TEXT DEFAULT '',  -- если пусто → чёрный фон
    stream_type TEXT NOT NULL DEFAULT 'browser',  -- vk | kinescope | rutube | browser | encoder | youtube
    embed_url TEXT DEFAULT '',     -- iframe URL для встраивания плеера
    stream_url TEXT DEFAULT '',    -- публичная ссылка на трансляцию (если нет embed)
    stream_key TEXT DEFAULT '',    -- ключ потока для OBS (для encoder/rtmp типов)
    status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | live | finished
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streams_channel ON streams (channel_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams (status, starts_at);

-- Привязка пост ↔ эфир (один пост — один эфир)
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS stream_id INTEGER REFERENCES streams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_stream ON content_posts (stream_id) WHERE stream_id IS NOT NULL;
