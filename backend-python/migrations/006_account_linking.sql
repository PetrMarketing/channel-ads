CREATE TABLE IF NOT EXISTS account_link_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    target_platform TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '5 minutes',
    used BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_link_codes_code ON account_link_codes(code);
