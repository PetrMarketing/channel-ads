-- Параметры товаров (атрибуты): Цвет, Размер, Память и т.д.
CREATE TABLE IF NOT EXISTS shop_attributes (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Значения параметров: Красный, Синий / S, M, L / 64GB, 128GB
CREATE TABLE IF NOT EXISTS shop_attribute_values (
    id SERIAL PRIMARY KEY,
    attribute_id INTEGER REFERENCES shop_attributes(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    color_hex TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0
);

-- Привязка значений параметров к товару
CREATE TABLE IF NOT EXISTS shop_product_attribute_values (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES shop_products(id) ON DELETE CASCADE,
    attribute_value_id INTEGER REFERENCES shop_attribute_values(id) ON DELETE CASCADE,
    UNIQUE(product_id, attribute_value_id)
);

-- Варианты: изображение + привязка к значениям
ALTER TABLE shop_product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE shop_product_variants ADD COLUMN IF NOT EXISTS attribute_values JSONB DEFAULT '[]';
