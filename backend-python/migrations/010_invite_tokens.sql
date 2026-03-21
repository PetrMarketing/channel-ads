-- Migration 010: One-time invite tokens for paid chats
CREATE TABLE IF NOT EXISTS paid_chat_invite_tokens (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES paid_chat_members(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    target_url TEXT NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON paid_chat_invite_tokens(token);
