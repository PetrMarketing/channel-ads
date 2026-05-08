-- Расширяем награды сезона на топ-3 (1м/2м/3м места).
-- Каждое место — отдельная запись, UNIQUE (season_key, place).
ALTER TABLE season_rewards ADD COLUMN IF NOT EXISTS place INTEGER NOT NULL DEFAULT 1;

-- Меняем уникальный индекс с (season_key) на (season_key, place)
ALTER TABLE season_rewards DROP CONSTRAINT IF EXISTS season_rewards_season_key_key;
ALTER TABLE season_rewards ADD CONSTRAINT season_rewards_season_place_key UNIQUE (season_key, place);
