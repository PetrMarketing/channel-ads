-- Migration 014: Add subscribers_only flag to lead_magnets
ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS subscribers_only BOOLEAN DEFAULT FALSE;
