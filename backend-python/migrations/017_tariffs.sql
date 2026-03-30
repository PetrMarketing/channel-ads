-- Migration 017: Tariffs table for dynamic pricing
CREATE TABLE IF NOT EXISTS tariffs (
    id SERIAL PRIMARY KEY,
    months INTEGER NOT NULL UNIQUE,
    label TEXT NOT NULL,
    price INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default tariffs
INSERT INTO tariffs (months, label, price) VALUES
    (1, '1 месяц', 490),
    (3, '3 месяца', 1290),
    (6, '6 месяцев', 2290),
    (12, '12 месяцев', 3990)
ON CONFLICT (months) DO NOTHING;
