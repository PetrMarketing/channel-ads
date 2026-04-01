-- Migration 018: VK ORD (маркировка рекламы) tables

CREATE TABLE IF NOT EXISTS ord_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    api_token TEXT NOT NULL,
    sandbox BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id)
);

CREATE TABLE IF NOT EXISTS ord_persons (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    inn TEXT NOT NULL,
    role TEXT DEFAULT 'advertiser',
    person_type TEXT DEFAULT 'juridical',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, external_id)
);

CREATE TABLE IF NOT EXISTS ord_contracts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    client_external_id TEXT,
    contractor_external_id TEXT,
    date TEXT,
    serial TEXT,
    amount TEXT,
    subject_type TEXT DEFAULT 'distribution',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, external_id)
);

CREATE TABLE IF NOT EXISTS ord_pads (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    person_external_id TEXT,
    name TEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, external_id)
);

CREATE TABLE IF NOT EXISTS ord_creatives (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    contract_external_id TEXT,
    erid TEXT,
    form TEXT,
    brand TEXT,
    texts TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, external_id)
);
