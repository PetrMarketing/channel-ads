-- Промокоды для тарифа (раздел «Подписки»).
-- Админ создаёт/деактивирует через /admin/promocodes, юзер вводит на /billing.
-- При успешной оплате с промо: применяется скидка к сумме + (опц.) начисляются
-- бонусные ИИ-токены.

CREATE TABLE IF NOT EXISTS billing_promocodes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,             -- например 'SUMMER10'
    description TEXT,
    discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    bonus_ai_tokens INTEGER NOT NULL DEFAULT 0,  -- начисляется при успешной оплате
    max_uses INTEGER,                       -- NULL = безлимит
    used_count INTEGER NOT NULL DEFAULT 0,
    valid_until TIMESTAMPTZ,                -- NULL = бессрочно
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_promocodes_code ON billing_promocodes(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_billing_promocodes_active ON billing_promocodes(is_active);

-- Привязка промокода к платежу — для аудита и подсчёта использований
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS promo_bonus_tokens INTEGER DEFAULT 0;
