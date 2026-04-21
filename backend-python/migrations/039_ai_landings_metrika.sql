-- Добавляем счётчики аналитики и счётчик правок для ИИ лендингов
ALTER TABLE ai_landings ADD COLUMN IF NOT EXISTS regen_count INTEGER DEFAULT 0;
ALTER TABLE ai_landings ADD COLUMN IF NOT EXISTS ym_counter_id TEXT DEFAULT '';
ALTER TABLE ai_landings ADD COLUMN IF NOT EXISTS ym_goal_name TEXT DEFAULT 'subscribe_channel';
ALTER TABLE ai_landings ADD COLUMN IF NOT EXISTS vk_pixel_id TEXT DEFAULT '';
ALTER TABLE ai_landings ADD COLUMN IF NOT EXISTS vk_goal_name TEXT DEFAULT 'subscribe_channel';
