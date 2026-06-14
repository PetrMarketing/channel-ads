-- Дедуп уведомлений и логирование попыток кика неоплативших юзеров из платного чата
CREATE TABLE IF NOT EXISTS paid_chat_kick_log (
    id SERIAL PRIMARY KEY,
    paid_chat_id INTEGER NOT NULL REFERENCES paid_chats(id) ON DELETE CASCADE,
    max_user_id TEXT NOT NULL,
    last_notified_at TIMESTAMP,
    last_kick_attempt_at TIMESTAMP,
    kick_attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paid_chat_kick_log_unique
    ON paid_chat_kick_log (paid_chat_id, max_user_id);

CREATE INDEX IF NOT EXISTS idx_paid_chat_kick_log_recent
    ON paid_chat_kick_log (last_notified_at DESC);
