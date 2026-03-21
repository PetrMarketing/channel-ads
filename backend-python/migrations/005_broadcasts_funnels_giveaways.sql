-- Migration 005: broadcast recipients, funnel step recipients, giveaway invites

-- Track per-recipient message IDs for broadcasts (edit/delete sent, stats)
CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id SERIAL PRIMARY KEY,
    broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE CASCADE,
    lead_id INTEGER,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    message_id TEXT,
    status TEXT DEFAULT 'sent',
    sent_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);

-- Track per-recipient message IDs for funnel steps (edit/delete sent, stats)
CREATE TABLE IF NOT EXISTS funnel_step_recipients (
    id SERIAL PRIMARY KEY,
    step_id INTEGER REFERENCES funnel_steps(id) ON DELETE CASCADE,
    lead_id INTEGER,
    telegram_id BIGINT,
    max_user_id TEXT,
    platform TEXT DEFAULT 'telegram',
    message_id TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funnel_step_recipients_step ON funnel_step_recipients(step_id);

-- Giveaway invite tracking
ALTER TABLE giveaway_participants ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE giveaway_participants ADD COLUMN IF NOT EXISTS invited_by_id INTEGER;
ALTER TABLE giveaway_participants ADD COLUMN IF NOT EXISTS invited_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_giveaway_participants_invite_code ON giveaway_participants(invite_code);
