-- Гарантия что commission за один и тот же платёж нельзя начислить дважды.
-- Поле payment_id уже было в referral_earnings, добавляем UNIQUE индекс.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_earnings_payment
    ON referral_earnings(payment_id) WHERE payment_id IS NOT NULL;
