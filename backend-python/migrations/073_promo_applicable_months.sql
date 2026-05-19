-- Привязка промокода к сроку подписки.
-- NULL = действует на все сроки. Иначе массив из {1, 3, 6, 12}.

ALTER TABLE billing_promocodes ADD COLUMN IF NOT EXISTS applicable_months INTEGER[];
