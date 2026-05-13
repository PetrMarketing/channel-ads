-- Блог сервиса: статьи, категории, статистика просмотров и переходов в сервис.

CREATE TABLE IF NOT EXISTS blog_categories (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_articles (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,                            -- краткое описание для списка/мета
    meta_title TEXT,                         -- SEO title (если пусто — берём title)
    meta_description TEXT,                   -- SEO description
    cover_image_url TEXT,                    -- обложка для карточки и OG-image
    body TEXT NOT NULL DEFAULT '',           -- HTML тело статьи
    tags TEXT[] DEFAULT '{}',                -- ключевые слова
    status TEXT NOT NULL DEFAULT 'draft',    -- draft | published | archived
    views_count INTEGER NOT NULL DEFAULT 0,  -- общее число просмотров
    clicks_count INTEGER NOT NULL DEFAULT 0, -- клики по CTA в сервис
    published_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_articles_status_pub
    ON blog_articles(status, published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_articles_category
    ON blog_articles(category_id, published_at DESC) WHERE status = 'published';

-- Уникальные просмотры (1 visitor — 1 article — 1 день)
CREATE TABLE IF NOT EXISTS blog_views (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,               -- cookie/uuid в куке
    visited_on DATE NOT NULL DEFAULT CURRENT_DATE,
    referrer TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (article_id, visitor_id, visited_on)
);
CREATE INDEX IF NOT EXISTS idx_blog_views_article
    ON blog_views(article_id, created_at DESC);

-- Клики по CTA "Попробовать" из статьи
CREATE TABLE IF NOT EXISTS blog_cta_clicks (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
    visitor_id TEXT,
    target TEXT,                            -- куда перешли (login/promo/...)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_cta_article
    ON blog_cta_clicks(article_id, created_at DESC);

-- Источник регистрации из блога — связываем с users чтобы видеть конверсию
ALTER TABLE users ADD COLUMN IF NOT EXISTS blog_referrer_slug TEXT;

-- Стартовые категории
INSERT INTO blog_categories (slug, name, sort_order) VALUES
  ('kanaly-max',          'Каналы MAX',          1),
  ('reklama-kanalov-max', 'Реклама каналов MAX', 2),
  ('ai-dlya-max',         'ИИ для MAX',          3),
  ('zarabotok-na-max',    'Заработок на MAX',    4),
  ('obnovleniya',         'Обновления',          5),
  ('keysy',               'Кейсы',               6)
ON CONFLICT (slug) DO NOTHING;
