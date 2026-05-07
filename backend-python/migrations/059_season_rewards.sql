-- История наград победителям сезонов гонки каналов.
-- Хранит запись о каждой выданной награде + ссылку на сезон + канал.
-- UNIQUE гарантирует, что за один сезон награду выдадим только один раз.
CREATE TABLE IF NOT EXISTS season_rewards (
    id SERIAL PRIMARY KEY,
    season_key TEXT NOT NULL,           -- "spring_2026" и т.п.
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_earned INTEGER NOT NULL DEFAULT 0,
    tokens_granted INTEGER NOT NULL DEFAULT 0,
    days_granted INTEGER NOT NULL DEFAULT 0,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (season_key)
);

CREATE INDEX IF NOT EXISTS idx_season_rewards_user ON season_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_season_rewards_channel ON season_rewards(channel_id);
