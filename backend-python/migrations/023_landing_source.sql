-- Migration 023: Track landing source for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS source_landing TEXT;
ALTER TABLE landing_pages_v2 ADD COLUMN IF NOT EXISTS payments_count INTEGER DEFAULT 0;
ALTER TABLE landing_pages_v2 ADD COLUMN IF NOT EXISTS payments_amount DECIMAL(10,2) DEFAULT 0;
