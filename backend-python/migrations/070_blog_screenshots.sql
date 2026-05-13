-- Библиотека переиспользуемых скриншотов для статей блога.
-- В body статьи скриншоты вставляются как:
--   <img data-screenshot-slug="my-slug" src="..." alt="..." />
-- При выдаче статьи src/alt обновляются актуальными значениями из таблицы
-- blog_screenshots — поэтому при замене файла обновляется во всех статьях.

CREATE TABLE IF NOT EXISTS blog_screenshots (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,                -- стабильный идентификатор (e.g. "create-channel-step-1")
    title TEXT NOT NULL,                      -- что на скриншоте (для админа)
    description TEXT,                         -- развёрнутое пояснение
    file_url TEXT NOT NULL,                   -- /uploads/screenshots/...
    alt_text TEXT,                            -- alt для img (для SEO/доступности)
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_screenshots_slug ON blog_screenshots(slug);
