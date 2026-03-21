-- Migration 002: ALTER TABLE migrations
-- All ALTER TABLE and UPDATE statements for schema evolution

ALTER TABLE leads ADD COLUMN IF NOT EXISTS max_user_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
ALTER TABLE leads ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE funnel_progress ADD COLUMN IF NOT EXISTS max_user_id TEXT;
ALTER TABLE funnel_progress ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
ALTER TABLE funnel_progress ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_user_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS inline_buttons TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS inline_buttons TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS inline_buttons TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS delay_config TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS hide_title BOOLEAN DEFAULT false;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS automod BOOLEAN DEFAULT false;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS bg_image TEXT;
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS broadcast_type TEXT DEFAULT 'browser';
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS button_type TEXT DEFAULT 'link';
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS lm_button_text TEXT DEFAULT 'Получить бесплатно';
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS inline_buttons TEXT;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS attach_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT -1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight DECIMAL(10,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'fixed';
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS salary_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE specialists ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE products ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_specialist INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS cohort_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bundle_id INTEGER;
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS notified_7d BOOLEAN DEFAULT FALSE;
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS notified_1d BOOLEAN DEFAULT FALSE;
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS notified_expired BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_dialog_chat_id TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT FALSE;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS deep_link_code TEXT;
ALTER TABLE giveaway_participants ADD COLUMN IF NOT EXISTS max_user_id TEXT;
ALTER TABLE giveaway_participants ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'landing';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS join_link TEXT;

-- Billing schema alignment: DB may have plan_id (old schema) but code uses plan (text)
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT NOW();

-- billing_payments: ensure we have all columns code needs
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS channel_billing_id INTEGER;
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS gateway_response JSONB;

ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS erid TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS overlay_text TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS image_type TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS filter_rules TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS delay_type TEXT DEFAULT 'after_minutes';
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- Billing: per-user pricing
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 1;
ALTER TABLE channel_billing ADD COLUMN IF NOT EXISTS billing_months INTEGER DEFAULT 1;

-- Staff / team members table
CREATE TABLE IF NOT EXISTS channel_staff (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'editor',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

-- MAX file token caching (avoid re-uploading)
ALTER TABLE lead_magnets ADD COLUMN IF NOT EXISTS max_file_token TEXT;
ALTER TABLE funnel_steps ADD COLUMN IF NOT EXISTS max_file_token TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS max_file_token TEXT;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS max_file_token TEXT;
ALTER TABLE pin_posts ADD COLUMN IF NOT EXISTS max_file_token TEXT;

-- Giveaway image persistence for ephemeral FS
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- Track MAX user winner identity separately
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_id BIGINT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_username TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_first_name TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_max_user_id TEXT;

-- Giveaway columns: ensure both old (SQLite) and new names exist
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS message_text TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS prize TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS prizes TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS legal_text TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS legal_info TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_count INTEGER DEFAULT 1;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS prepared_image_path TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS drawn_at TIMESTAMP;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;
ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Change telegram_message_id from BIGINT to TEXT (MAX uses string message IDs)
ALTER TABLE giveaways ALTER COLUMN telegram_message_id TYPE TEXT USING telegram_message_id::TEXT;
ALTER TABLE posts ALTER COLUMN telegram_message_id TYPE TEXT USING telegram_message_id::TEXT;
ALTER TABLE pin_posts ALTER COLUMN telegram_message_id TYPE TEXT USING telegram_message_id::TEXT;

-- Migrate data from old columns to new columns (one-time, idempotent)
UPDATE giveaways SET message_text = description WHERE message_text IS NULL AND description IS NOT NULL;
UPDATE giveaways SET prizes = prize WHERE prizes IS NULL AND prize IS NOT NULL;
UPDATE giveaways SET legal_info = legal_text WHERE legal_info IS NULL AND legal_text IS NOT NULL;

-- billing_payments: columns referenced in webhook/code but missing from schema
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS channel_id INTEGER;
