-- Migration 015: Analytics snapshots and comments

CREATE TABLE IF NOT EXISTS channel_analytics (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    subscribers_count INTEGER DEFAULT 0,
    views_24h INTEGER DEFAULT 0,
    views_48h INTEGER DEFAULT 0,
    views_72h INTEGER DEFAULT 0,
    avg_views_per_post NUMERIC(10,2) DEFAULT 0,
    reactions_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    engagement_rate NUMERIC(6,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_channel_analytics_channel_date
    ON channel_analytics(channel_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS post_comments (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    post_type TEXT DEFAULT 'content',
    post_id INTEGER NOT NULL,
    max_user_id TEXT,
    user_name TEXT,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_type, post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_channel ON post_comments(channel_id, created_at DESC);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS comment_settings JSONB DEFAULT '{}';
