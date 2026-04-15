-- Универсальная таблица настроек оплаты для всех разделов
CREATE TABLE IF NOT EXISTS payment_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    section TEXT NOT NULL,  -- 'paid_chats', 'services', 'shop'
    provider TEXT NOT NULL,
    credentials JSONB DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, section, provider)
);

-- Миграция из paid_chat_payment_settings
INSERT INTO payment_settings (channel_id, section, provider, credentials, is_active, created_at)
SELECT channel_id, 'paid_chats', provider, credentials, is_active, created_at
FROM paid_chat_payment_settings
ON CONFLICT DO NOTHING;

-- Дополнительные колонки для оплаты заказов магазина
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

-- Дополнительные колонки для оплаты записей
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS payment_order_id TEXT;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Напоминания о записи
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS notified_24h BOOLEAN DEFAULT FALSE;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS notified_2h BOOLEAN DEFAULT FALSE;
