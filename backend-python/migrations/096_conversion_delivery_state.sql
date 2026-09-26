-- Durable, auditable conversion delivery state.
-- A confirmed subscription, a delivery attempt, transport acceptance and
-- accounting by the destination are deliberately separate facts.
ALTER TABLE pending_conversions
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_delivery_status TEXT NOT NULL DEFAULT 'not_queued',
    ADD COLUMN IF NOT EXISTS ym_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ym_attempt_token TEXT,
    ADD COLUMN IF NOT EXISTS ym_attempt_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_transport_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_accounting_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ym_last_error TEXT,
    ADD COLUMN IF NOT EXISTS vk_delivery_status TEXT NOT NULL DEFAULT 'not_queued',
    ADD COLUMN IF NOT EXISTS vk_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vk_attempt_token TEXT,
    ADD COLUMN IF NOT EXISTS vk_attempt_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vk_lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vk_next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vk_transport_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vk_accounting_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vk_last_error TEXT;

CREATE TABLE IF NOT EXISTS conversion_delivery_attempts (
    id BIGSERIAL PRIMARY KEY,
    pending_conversion_id BIGINT NOT NULL REFERENCES pending_conversions(id) ON DELETE CASCADE,
    destination TEXT NOT NULL,
    attempt_no INT NOT NULL,
    attempt_token TEXT NOT NULL UNIQUE,
    delivery_mode TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    transport_status TEXT,
    response_code INT,
    error TEXT,
    UNIQUE (pending_conversion_id, destination, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_pending_conversion_vk_due
    ON pending_conversions(vk_delivery_status, vk_next_attempt_at, vk_lease_expires_at)
    WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_conversion_ym_due
    ON pending_conversions(ym_delivery_status, ym_next_attempt_at, ym_lease_expires_at)
    WHERE subscription_id IS NOT NULL;

-- Preserve truthful facts from old rows without treating historical
-- fired_at/HTTP 200 values as proof that Yandex accounted for a goal.
UPDATE pending_conversions
   SET confirmed_at = COALESCE(confirmed_at, subscribed_at)
 WHERE subscription_id IS NOT NULL AND subscribed_at IS NOT NULL;
