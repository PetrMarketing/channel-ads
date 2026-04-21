-- Чат поддержки
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ai',        -- ai, escalated, closed
    escalated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    role TEXT NOT NULL,       -- user, ai, admin
    content TEXT NOT NULL,
    admin_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
