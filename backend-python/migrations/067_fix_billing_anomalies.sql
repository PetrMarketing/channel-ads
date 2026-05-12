-- ONE-TIME ОЧИСТКА: трогает ТОЛЬКО очевидно битые записи.
--
-- ЧТО НЕ ТРОГАЕМ:
-- 1. Каналы из admin_action_log (billing_adjust/channel_status_change) —
--    админ уже правил вручную.
-- 2. plan='paid' с ХОТЯ БЫ ОДНИМ paid-платежом — реальные клиенты,
--    даже если у них expires-дата раздулась от багов (пусть лучше переплата
--    в их пользу, чем мы их «обидим» сокращением). Если жалоб не будет —
--    оставим как есть. По жалобам — админ правит руками через UI.
--
-- ЧТО ТРОГАЕМ:
-- 1. plan='paid' БЕЗ paid-платежей (явный мусор от багов / удалённых записей):
--      expires_at = created_at, status = 'expired'
-- 2. plan='trial' с раздутым сроком:
--      expires_at = created_at + 2 дня (стандартный триал)
-- 3. Затрагиваем только: expires_at > NOW() + 60 дней (очевидное переполнение).

DO $$
DECLARE
  affected INTEGER;
BEGIN
  WITH paid_summary AS (
    SELECT
      bp.channel_billing_id,
      COUNT(*) AS paid_count
    FROM billing_payments bp
    WHERE bp.status = 'paid'
    GROUP BY bp.channel_billing_id
  ),
  admin_touched AS (
    SELECT DISTINCT target_id FROM admin_action_log
    WHERE target_type = 'channel'
      AND action IN ('billing_adjust', 'channel_status_change')
  )
  UPDATE channel_billing cb
  SET
    expires_at = CASE
      WHEN cb.plan = 'paid' THEN cb.created_at  -- мусорный paid без платежей
      ELSE cb.created_at + INTERVAL '2 days'    -- trial default
    END,
    status = 'expired'
  FROM (
    SELECT id, channel_id FROM channel_billing
  ) base
  LEFT JOIN paid_summary ps ON ps.channel_billing_id = base.id
  WHERE cb.id = base.id
    AND cb.expires_at > NOW() + INTERVAL '60 days'
    AND COALESCE(ps.paid_count, 0) = 0       -- НЕТ paid-платежей
    AND cb.channel_id NOT IN (SELECT target_id FROM admin_touched);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[migration 067] Откатили expires_at у % каналов (только без paid-платежей)', affected;
END $$;
