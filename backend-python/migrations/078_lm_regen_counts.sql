-- Лимит перегенераций в ИИ Оформлении для лид-магнита:
--   1) Выбор идей лид-магнита (lm_ideas_regen_count, max 2 переген)
--   2) Пост-закреп + текст лид-магнита (lm_content_regen_count, max 2 переген)
-- 0 = первая генерация, 1-2 = регены, после 2 — кнопка пропадает.

ALTER TABLE ai_design_sessions ADD COLUMN IF NOT EXISTS lm_ideas_regen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_design_sessions ADD COLUMN IF NOT EXISTS lm_content_regen_count INTEGER NOT NULL DEFAULT 0;
