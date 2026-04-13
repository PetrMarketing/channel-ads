-- Интернет-магазин
-- Настройки магазина
CREATE TABLE IF NOT EXISTS shop_settings (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE UNIQUE,
    shop_name TEXT DEFAULT 'Магазин',
    primary_color TEXT DEFAULT '#4F46E5',
    banner_url TEXT,
    welcome_text TEXT DEFAULT '',
    currency TEXT DEFAULT 'RUB',
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    require_phone INTEGER DEFAULT 1,
    require_email INTEGER DEFAULT 0,
    require_address INTEGER DEFAULT 1,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Категории товаров
CREATE TABLE IF NOT EXISTS shop_categories (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES shop_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_categories_channel ON shop_categories(channel_id);

-- Товары
CREATE TABLE IF NOT EXISTS shop_products (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES shop_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    images JSONB DEFAULT '[]',
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    compare_at_price DECIMAL(10,2),
    sku TEXT,
    stock INTEGER DEFAULT -1,
    is_hit INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_products_channel ON shop_products(channel_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON shop_products(category_id);

-- Варианты товаров (размер, цвет)
CREATE TABLE IF NOT EXISTS shop_product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES shop_products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    price DECIMAL(10,2),
    stock INTEGER DEFAULT -1,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

-- Способы доставки
CREATE TABLE IF NOT EXISTS shop_delivery_methods (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    free_from DECIMAL(10,2),
    estimated_days TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Акции и промокоды
CREATE TABLE IF NOT EXISTS shop_promotions (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    promo_type TEXT DEFAULT 'percent',
    code TEXT,
    discount_value DECIMAL(10,2) DEFAULT 0,
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    starts_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Заказы
CREATE TABLE IF NOT EXISTS shop_orders (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    client_address TEXT,
    client_max_user_id TEXT,
    client_telegram_id TEXT,
    delivery_method_id INTEGER REFERENCES shop_delivery_methods(id) ON DELETE SET NULL,
    delivery_price DECIMAL(10,2) DEFAULT 0,
    promo_id INTEGER REFERENCES shop_promotions(id) ON DELETE SET NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'new',
    payment_status TEXT DEFAULT 'unpaid',
    payment_provider TEXT,
    payment_order_id TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_channel ON shop_orders(channel_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);

-- Позиции заказа
CREATE TABLE IF NOT EXISTS shop_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES shop_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES shop_products(id) ON DELETE SET NULL,
    variant_id INTEGER REFERENCES shop_product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT,
    price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
);

-- Корзина (сохраняется между сессиями)
CREATE TABLE IF NOT EXISTS shop_carts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_identifier TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, user_identifier)
);

-- Позиции корзины
CREATE TABLE IF NOT EXISTS shop_cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INTEGER REFERENCES shop_carts(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES shop_products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES shop_product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_shop_cart_items_cart ON shop_cart_items(cart_id);

-- Визиты в магазин (для воронки клиентов)
CREATE TABLE IF NOT EXISTS shop_visits (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_identifier TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, user_identifier)
);
