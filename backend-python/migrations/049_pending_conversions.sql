-- Migration 049: pending_conversions — атомарный FIFO claim, 60s окно.
-- Чистая механика конверсий: клик "Перейти в канал" создаёт pending,
-- бот ловит подписку и атомарно claim'ит старейший unfired pending в окне 60с,
-- стреляет YM/VK через Measurement API. 1 подписка = 1 цель.
CREATE TABLE IF NOT EXISTS pending_conversions (
    id BIGSERIAL PRIMARY KEY,
    link_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    visit_id BIGINT,                        -- nullable, для traceability
    ym_client_id TEXT,                      -- captured at click time
    page_url TEXT,                          -- для YM Measurement Protocol attribution
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,        -- created_at + 60s
    fired_at TIMESTAMPTZ,                   -- когда YM/VK цель стрельнула (NULL = ещё нет)
    subscription_id BIGINT                  -- linked sub once claimed
);
CREATE INDEX IF NOT EXISTS idx_pending_conv_channel ON pending_conversions(channel_id, fired_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_conv_visit ON pending_conversions(visit_id);
