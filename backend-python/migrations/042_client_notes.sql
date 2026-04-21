-- Заметки/диалог по клиентам (магазин + услуги)
CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    client_identifier TEXT NOT NULL,  -- имя или телефон клиента
    channel_type TEXT NOT NULL DEFAULT 'system',  -- system, whatsapp
    direction TEXT NOT NULL DEFAULT 'out',  -- in (входящее), out (исходящее), note (заметка)
    content TEXT NOT NULL,
    author_name TEXT,  -- имя отправителя
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_channel ON client_notes(channel_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_identifier);

-- Настройки WhatsApp интеграции
CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    api_url TEXT NOT NULL DEFAULT '',       -- URL API (Wazzup, GreenAPI, ChatAPI и т.д.)
    api_token TEXT NOT NULL DEFAULT '',     -- Токен/ключ API
    instance_id TEXT NOT NULL DEFAULT '',   -- ID инстанса
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id)
);
