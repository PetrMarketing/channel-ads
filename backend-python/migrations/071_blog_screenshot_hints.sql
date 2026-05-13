-- Человекочитаемые описания для скриншот-слугов: что должно быть
-- на скриншоте. Генерируются ИИ-разом по контексту статей,
-- показываются в админке («Нужны скрины») вместо технического slug.

CREATE TABLE IF NOT EXISTS blog_screenshot_hints (
    slug TEXT PRIMARY KEY,
    description_ru TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
