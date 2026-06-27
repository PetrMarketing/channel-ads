-- Сидим флаг видимости для ИИ Помощника, чтобы он управлялся из
-- админки /admin/visibility. По умолчанию visible.
INSERT INTO feature_visibility (feature_key, title, visibility, coming_soon_message)
VALUES ('ai_assistant', 'ИИ Помощник', 'visible', 'ИИ Помощник скоро появится')
ON CONFLICT (feature_key) DO NOTHING;
