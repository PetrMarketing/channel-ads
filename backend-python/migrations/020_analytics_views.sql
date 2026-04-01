-- Migration 020: Add views and posts columns to channel_analytics
ALTER TABLE channel_analytics ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE channel_analytics ADD COLUMN IF NOT EXISTS posts_count INTEGER DEFAULT 0;
