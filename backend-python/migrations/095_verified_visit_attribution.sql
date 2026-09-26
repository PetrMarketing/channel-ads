-- Evidence-based attribution for MAX advertising visits.
-- Existing rows remain unverified and are never backfilled heuristically.
ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS yclid TEXT,
    ADD COLUMN IF NOT EXISTS landing_url TEXT,
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS identity_source TEXT;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS attribution_status TEXT NOT NULL DEFAULT 'unattributed',
    ADD COLUMN IF NOT EXISTS attribution_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attribution_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_visits_verified_max_identity
    ON visits(channel_id, max_user_id, identity_verified_at, visited_at DESC)
    WHERE max_user_id IS NOT NULL AND identity_verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_attribution_status
    ON subscriptions(channel_id, attribution_status, subscribed_at DESC);

ALTER TABLE pending_conversions
    ADD COLUMN IF NOT EXISTS attribution_key TEXT;

-- Historical rows stay NULL, so duplicates accumulated by the old FIFO flow
-- neither block this migration nor get silently rewritten.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_conv_attribution_key
    ON pending_conversions(attribution_key)
    WHERE attribution_key IS NOT NULL;
