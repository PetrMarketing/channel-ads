-- Прогресс уровней навыков по каналу. 3 навыка: 'landing' / 'text' / 'image'.
-- current_level: 1..5. period_count — сколько сделано в рамках ТЕКУЩЕГО уровня
-- (после левел-апа сбрасывается в 0). total_count — нарастающий итог за всё время.
CREATE TABLE IF NOT EXISTS channel_skill_progress (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    skill_type TEXT NOT NULL CHECK (skill_type IN ('landing', 'text', 'image')),
    current_level INTEGER NOT NULL DEFAULT 1,
    period_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    last_level_up_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, skill_type)
);

CREATE INDEX IF NOT EXISTS idx_channel_skill_progress_channel ON channel_skill_progress(channel_id);
