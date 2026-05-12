-- Сохраняем срок подписки на самом billing_payments чтобы webhook
-- не зависел от мутабельного channel_billing.billing_months.
-- Без этого: pay(12 мес) → billing_months=12 → pay(1 мес) → billing_months=1
-- → webhook первого платежа продлит на 1 месяц вместо 12 (или наоборот).
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS months INTEGER;
