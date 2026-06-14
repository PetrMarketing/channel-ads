-- Опросы: создаются один раз, прикрепляются к постам как inline-кнопки
CREATE TABLE IF NOT EXISTS polls (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_channel ON polls (channel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_options (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options (poll_id, position);

CREATE TABLE IF NOT EXISTS poll_votes (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    voter_telegram_id BIGINT,
    voter_max_user_id TEXT,
    voter_username TEXT,
    voter_first_name TEXT,
    voted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Уникальность голоса: для single-choice опроса один юзер = один голос (через application-level check)
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes (poll_id, option_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_voter_tg
    ON poll_votes (poll_id, voter_telegram_id) WHERE voter_telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poll_votes_voter_max
    ON poll_votes (poll_id, voter_max_user_id) WHERE voter_max_user_id IS NOT NULL;

-- Связка пост ↔ опрос (один пост = один опрос максимум)
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS poll_id INTEGER REFERENCES polls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_poll ON content_posts (poll_id) WHERE poll_id IS NOT NULL;
