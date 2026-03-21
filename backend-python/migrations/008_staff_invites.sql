CREATE TABLE IF NOT EXISTS staff_invites (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    invited_by INTEGER REFERENCES users(id),
    role TEXT DEFAULT 'editor',
    token TEXT UNIQUE NOT NULL,
    accepted BOOLEAN DEFAULT FALSE,
    accepted_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);
