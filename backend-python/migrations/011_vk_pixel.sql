-- Migration 011: VK Pixel support on tracking links
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS vk_pixel_id TEXT;
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS vk_goal_name TEXT;
