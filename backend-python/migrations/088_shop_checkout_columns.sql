-- shop_orders / shop_promotions / shop_delivery_methods — добавляем
-- все колонки которые трогает /checkout endpoint. На dev добавлялось
-- руками, на проде падает на каждой второй.

-- shop_orders
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS user_identifier TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_max_user_id TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_telegram_id TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_method_id INTEGER;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS promo_id INTEGER;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS payment_order_id TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- shop_promotions
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS promo_type TEXT DEFAULT 'percent';
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;

-- shop_delivery_methods
ALTER TABLE shop_delivery_methods ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE shop_delivery_methods ADD COLUMN IF NOT EXISTS free_from NUMERIC(10,2);
