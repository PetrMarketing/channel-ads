-- Migration 050: orphan_subscriptions — обратное направление pending.
-- Если подписка пришла ДО клика (race condition), бот пишет orphan, который
-- 60с ждёт клика. Когда визит создаёт pending_conversion, мы атомарно claim'им
-- oldest unfired orphan по channel_id — и стреляем YM/VK. 1 orphan = 1 fire.
CREATE TABLE IF NOT EXISTS orphan_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    channel_id BIGINT NOT NULL,
    subscription_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    fired_at TIMESTAMPTZ,
    pending_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_orphan_subs_channel_unfired
    ON orphan_subscriptions(channel_id, created_at)
    WHERE fired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orphan_subs_subscription
    ON orphan_subscriptions(subscription_id);
