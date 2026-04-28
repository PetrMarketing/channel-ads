-- Migration 045: Track when YM/VK conversion goals have been fired for a subscription.
-- Used by the server-side fallback (services/conversion_pixels.py) to ensure
-- exactly-once firing across the client-side polling path and the server-side
-- bot/webhook subscription-creation paths.
-- NULL = "not fired yet, free to fire" (existing rows stay NULL — we do NOT
-- backfill so historical subs can still be claimed by the next race winner).

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS goal_fired_at TIMESTAMP NULL;
