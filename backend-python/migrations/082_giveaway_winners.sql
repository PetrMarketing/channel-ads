-- Все победители розыгрыша (а не один winner_* в giveaways)
CREATE TABLE IF NOT EXISTS giveaway_winners (
    id SERIAL PRIMARY KEY,
    giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
    participant_id INTEGER,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    username TEXT,
    first_name TEXT,
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway
    ON giveaway_winners (giveaway_id, created_at);

-- Бэкфилл: переносим единственного winner_* из giveaways в giveaway_winners
-- для уже завершённых розыгрышей, у которых ещё нет записей
INSERT INTO giveaway_winners (giveaway_id, telegram_id, max_user_id, platform, username, first_name, notified, created_at)
SELECT g.id,
       NULLIF(g.winner_id, 0),
       g.winner_max_user_id,
       CASE WHEN g.winner_max_user_id IS NOT NULL AND g.winner_max_user_id <> '' THEN 'max' ELSE 'telegram' END,
       g.winner_username,
       g.winner_first_name,
       TRUE,
       COALESCE(g.drawn_at, g.created_at)
FROM giveaways g
WHERE g.status = 'finished'
  AND (g.winner_first_name IS NOT NULL OR g.winner_id IS NOT NULL OR g.winner_max_user_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM giveaway_winners gw WHERE gw.giveaway_id = g.id);
