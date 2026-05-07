-- Track which users have claimed which subscription bonuses (idempotency).
-- Bonus configurations live in code (app/services/subscription_bonuses.py).
CREATE TABLE IF NOT EXISTS user_subscription_bonuses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bonus_key TEXT NOT NULL,
    tokens_granted INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, bonus_key)
);

CREATE INDEX IF NOT EXISTS idx_user_subscription_bonuses_user ON user_subscription_bonuses(user_id);
