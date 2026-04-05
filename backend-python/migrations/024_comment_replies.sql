-- Migration 024: Comment replies + notification setting
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS reply_to_name TEXT;

-- Notification toggle per channel (stored in comment_settings JSON, no migration needed)
