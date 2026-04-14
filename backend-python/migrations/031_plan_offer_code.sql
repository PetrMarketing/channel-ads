-- Код предложения GetCourse переносится из настроек провайдера в тарифы
ALTER TABLE paid_chat_plans ADD COLUMN IF NOT EXISTS offer_code TEXT DEFAULT '';

-- Миграция существующих offer_code из GetCourse credentials в тарифы
UPDATE paid_chat_plans p
SET offer_code = COALESCE((
  SELECT s.credentials::json->>'offer_code'
  FROM paid_chat_payment_settings s
  WHERE s.channel_id = p.channel_id AND s.provider = 'getcourse' AND s.is_active = 1
  LIMIT 1
), '')
WHERE (p.offer_code = '' OR p.offer_code IS NULL)
  AND EXISTS (SELECT 1 FROM paid_chat_payment_settings s WHERE s.channel_id = p.channel_id AND s.provider = 'getcourse');
