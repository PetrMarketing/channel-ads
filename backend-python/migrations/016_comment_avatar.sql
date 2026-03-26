-- Migration 016: Add user_avatar to post_comments
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS user_avatar TEXT;
