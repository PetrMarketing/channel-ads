-- Migration 004: Paid chats tables

CREATE TABLE IF NOT EXISTS paid_chat_payment_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credentials JSONB DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, provider)
);

CREATE TABLE IF NOT EXISTS paid_chat_plans (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL DEFAULT 'one_time',
    duration_days INTEGER DEFAULT 30,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'RUB',
    title TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paid_chats (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    platform TEXT DEFAULT 'telegram',
    title TEXT,
    username TEXT,
    join_link TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, chat_id)
);

CREATE TABLE IF NOT EXISTS paid_chat_members (
    id SERIAL PRIMARY KEY,
    paid_chat_id INTEGER REFERENCES paid_chats(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    telegram_id BIGINT,
    max_user_id TEXT,
    username TEXT,
    first_name TEXT,
    platform TEXT DEFAULT 'telegram',
    plan_id INTEGER REFERENCES paid_chat_plans(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active',
    amount_paid DECIMAL(10,2) DEFAULT 0,
    payment_id TEXT,
    starts_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    notified_3d BOOLEAN DEFAULT FALSE,
    notified_1d BOOLEAN DEFAULT FALSE,
    notified_expired BOOLEAN DEFAULT FALSE,
    invite_link TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paid_chat_notifications (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message_text TEXT NOT NULL DEFAULT '',
    is_active INTEGER DEFAULT 1,
    file_path TEXT,
    file_type TEXT,
    file_data BYTEA,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, event_type)
);

CREATE TABLE IF NOT EXISTS paid_chat_payments (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES paid_chat_plans(id) ON DELETE SET NULL,
    paid_chat_id INTEGER REFERENCES paid_chats(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    order_id TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'RUB',
    status TEXT DEFAULT 'pending',
    telegram_id BIGINT,
    max_user_id TEXT,
    username TEXT,
    first_name TEXT,
    platform TEXT DEFAULT 'telegram',
    provider_payment_id TEXT,
    gateway_response JSONB,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paid_chat_posts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT,
    message_text TEXT NOT NULL DEFAULT '',
    button_text TEXT DEFAULT 'Подробнее',
    chat_id INTEGER REFERENCES paid_chats(id) ON DELETE SET NULL,
    file_path TEXT,
    file_type TEXT,
    file_data BYTEA,
    attach_type TEXT,
    status TEXT DEFAULT 'draft',
    published_at TIMESTAMP,
    message_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
