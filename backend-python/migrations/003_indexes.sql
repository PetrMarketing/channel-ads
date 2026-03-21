-- Migration 003: Indexes and constraints

CREATE INDEX IF NOT EXISTS idx_visits_channel ON visits(channel_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_utm ON visits(utm_source, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_subscriptions_channel ON subscriptions(channel_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_code ON tracking_links(short_code);
CREATE INDEX IF NOT EXISTS idx_channels_platform ON channels(platform);
CREATE INDEX IF NOT EXISTS idx_visits_platform ON visits(platform);
CREATE INDEX IF NOT EXISTS idx_subscriptions_platform ON subscriptions(platform);
CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON clicks(clicked_at);
CREATE INDEX IF NOT EXISTS idx_oc_channel ON offline_conversions(channel_id);
CREATE INDEX IF NOT EXISTS idx_oc_uploaded ON offline_conversions(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_lead_magnets_channel ON lead_magnets(channel_id);
CREATE INDEX IF NOT EXISTS idx_bot_message_log_user ON bot_message_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_message_log_channel ON bot_message_log(channel_id);

-- UNIQUE index for MAX subscriptions (channel_id, max_user_id) where telegram_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_max_unique ON subscriptions (channel_id, max_user_id) WHERE max_user_id IS NOT NULL AND telegram_id IS NULL;

-- UNIQUE index for MAX leads (lead_magnet_id, max_user_id) where telegram_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_max_unique ON leads (lead_magnet_id, max_user_id) WHERE max_user_id IS NOT NULL AND telegram_id IS NULL;

-- UNIQUE index for MAX giveaway participants
CREATE UNIQUE INDEX IF NOT EXISTS idx_giveaway_participants_max_unique ON giveaway_participants (giveaway_id, max_user_id) WHERE max_user_id IS NOT NULL AND telegram_id IS NULL;

-- Add missing unique constraints safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channel_billing_channel_id_key')
    THEN ALTER TABLE channel_billing ADD CONSTRAINT channel_billing_channel_id_key UNIQUE (channel_id);
    END IF;
END $$;
