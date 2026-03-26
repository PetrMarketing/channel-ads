-- Migration 013: Add image columns to services module

-- Services: cover image
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- Specialists: photo (file_path for storage, file_data for recovery)
ALTER TABLE service_specialists ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE service_specialists ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE service_specialists ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- Settings: logo/cover image
ALTER TABLE service_settings ADD COLUMN IF NOT EXISTS cover_file_path TEXT;
ALTER TABLE service_settings ADD COLUMN IF NOT EXISTS cover_file_type TEXT;
ALTER TABLE service_settings ADD COLUMN IF NOT EXISTS cover_file_data BYTEA;
