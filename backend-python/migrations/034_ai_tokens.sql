-- ИИ Токены
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_tokens INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_token_purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tokens INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_provider TEXT,
    payment_order_id TEXT,
    payment_status TEXT DEFAULT 'pending',
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_token_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tokens_used INTEGER NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
