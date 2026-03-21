-- Migration 009: Track chats where bot is added (separate from channels)
CREATE TABLE IF NOT EXISTS bot_chats (
    id SERIAL PRIMARY KEY,
    chat_id TEXT UNIQUE NOT NULL,
    title TEXT,
    platform TEXT DEFAULT 'max',
    user_id INTEGER REFERENCES users(id),
    is_admin BOOLEAN DEFAULT FALSE,
    join_link TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_chats_user ON bot_chats(user_id);
