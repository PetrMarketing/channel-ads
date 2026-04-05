-- Migration 022: Landing pages system

CREATE TABLE IF NOT EXISTS landing_pages_v2 (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    ym_counter_id TEXT,
    vk_pixel_id TEXT,
    ym_goal_register TEXT DEFAULT 'register',
    ym_goal_payment TEXT DEFAULT 'payment',
    views_count INTEGER DEFAULT 0,
    clicks_count INTEGER DEFAULT 0,
    registrations_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default landings
INSERT INTO landing_pages_v2 (slug, title) VALUES
    ('max-ads', 'Реклама в MAX'),
    ('max-content', 'Автоматизация контента в MAX'),
    ('max-comments', 'Комментарии через MAX')
ON CONFLICT (slug) DO NOTHING;
