-- shop_settings: добавляем недостающие колонки которые были на dev
-- руками, но миграции на проде нет. UPDATE/INSERT в save_settings
-- падает потому что обновляет ВСЕ поля одним SET — даже если юзер
-- меняет только manager_contact_url, запрос включает banners=...
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS banners JSONB DEFAULT '[]'::jsonb;

-- Безопасности ради добавляю остальные поля из save_settings, если
-- какие-то ещё отсутствуют на проде:
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT 'Магазин';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#4F46E5';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS welcome_text TEXT DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RUB';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS require_phone INTEGER DEFAULT 1;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS require_email INTEGER DEFAULT 0;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS require_address INTEGER DEFAULT 1;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
