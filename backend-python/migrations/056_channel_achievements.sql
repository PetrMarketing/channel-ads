-- Достижения канала. Ачивки делятся на 4 уровня (tier):
-- bronze (+1 очко канала), silver (+3), gold (+5), platinum (+10).
-- Каждый сезон сбрасывается прогресс (period_count → 0), но уже выданные
-- achievements остаются в истории с пометкой сезона.
--
-- Сезоны: spring (1 марта), summer (1 июня), autumn (1 сентября), winter (1 декабря).
-- Формат season_key: "{season}_{year}" — например, "spring_2026".

CREATE TABLE IF NOT EXISTS channel_achievement_progress (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    code TEXT NOT NULL,           -- код события: ai_text, ai_image, link_create, ...
    season_key TEXT NOT NULL,     -- "spring_2026" и т.п.
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, code, season_key)
);

CREATE INDEX IF NOT EXISTS idx_chach_progress_channel ON channel_achievement_progress(channel_id);

-- Полученные ачивки (история).
CREATE TABLE IF NOT EXISTS channel_achievements (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    season_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at TIMESTAMPTZ,      -- когда фронт показал модалку (NULL = новая, ждёт показа)
    UNIQUE (channel_id, code, tier, season_key)
);

CREATE INDEX IF NOT EXISTS idx_chach_channel ON channel_achievements(channel_id);
CREATE INDEX IF NOT EXISTS idx_chach_unnotified ON channel_achievements(notified_at) WHERE notified_at IS NULL;
