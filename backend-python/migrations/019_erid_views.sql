-- Migration 019: ERID field for posts/giveaways + view tracking

ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS erid TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS erid TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS erid TEXT;

-- Track views per post for ORD reporting
CREATE TABLE IF NOT EXISTS post_views (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    post_type TEXT NOT NULL,  -- 'content', 'pin', 'giveaway'
    post_id INTEGER NOT NULL,
    message_id TEXT,          -- telegram_message_id in channel
    views_count INTEGER DEFAULT 0,
    checked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, post_type, post_id)
);
