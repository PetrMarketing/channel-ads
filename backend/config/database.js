const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function initDatabase() {
    const dbPath = process.env.DB_PATH || './data/channel-ads.db';
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Создаём таблицы
    db.exec(`
        -- Пользователи (владельцы каналов)
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Каналы
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER UNIQUE,
            title TEXT,
            username TEXT,
            owner_id INTEGER REFERENCES users(id),
            yandex_metrika_id TEXT,
            vk_pixel_id TEXT,
            tracking_code TEXT UNIQUE,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Ссылки с UTM метками
        CREATE TABLE IF NOT EXISTS tracking_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER REFERENCES channels(id),
            name TEXT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            utm_content TEXT,
            utm_term TEXT,
            short_code TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Визиты (открытие Mini App)
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracking_link_id INTEGER REFERENCES tracking_links(id),
            channel_id INTEGER REFERENCES channels(id),
            telegram_id INTEGER,
            username TEXT,
            first_name TEXT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            utm_content TEXT,
            utm_term TEXT,
            ip_address TEXT,
            user_agent TEXT,
            visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Подписки на канал
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER REFERENCES channels(id),
            telegram_id INTEGER,
            username TEXT,
            first_name TEXT,
            visit_id INTEGER REFERENCES visits(id),
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(channel_id, telegram_id)
        );

        -- Индексы для быстрых запросов
        CREATE INDEX IF NOT EXISTS idx_visits_channel ON visits(channel_id);
        CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visited_at);
        CREATE INDEX IF NOT EXISTS idx_visits_utm ON visits(utm_source, utm_campaign);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_channel ON subscriptions(channel_id);
        CREATE INDEX IF NOT EXISTS idx_tracking_links_code ON tracking_links(short_code);
    `);

    console.log('Database initialized');
    return db;
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

module.exports = { initDatabase, getDb };
