-- Migration 025: Lead magnet landing page fields for tracking links
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_image_url TEXT;
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_title TEXT;
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_description TEXT;
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_description_align TEXT DEFAULT 'left';
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_button_text TEXT DEFAULT 'Получить бесплатно';
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS lm_lead_magnet_id INTEGER;
