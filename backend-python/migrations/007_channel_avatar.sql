-- Migration 007: Add avatar_url to channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS avatar_url TEXT;
