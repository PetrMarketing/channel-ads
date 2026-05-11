-- Уведомления (баннер-модалка для всех пользователей при заходе) и
-- админ-рассылки в личку через подключённые мессенджеры.

-- ============== Уведомления ==============
CREATE TABLE IF NOT EXISTS admin_notifications (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT,                 -- /uploads/... картинка/обложка
    button_text TEXT,
    button_url TEXT,                -- внешняя ссылка ИЛИ путь типа '/billing', '/achievements'
    audience TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'paid' | 'free' (на будущее)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_notifications_seen (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id INTEGER NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_unseen_user ON user_notifications_seen(user_id);

-- ============== Админ-рассылки по базе пользователей ==============
CREATE TABLE IF NOT EXISTS admin_broadcasts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message_text TEXT NOT NULL DEFAULT '',
    image_url TEXT,                 -- /uploads/... медиа
    media_type TEXT,                -- 'photo' | 'video' | 'document' | NULL
    button_text TEXT,
    button_url TEXT,
    audience TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'max' | 'telegram' | 'paid' | 'free'
    status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_sched ON admin_broadcasts(status, scheduled_at) WHERE status = 'scheduled';
