-- ONE-TIME ОЧИСТКА: откатывает channel_billing.expires_at на корректное
-- значение для записей, попорченных багами до фикса idempotency (commit
-- bd7c9ad) и race-condition билинг_months (commit 3cf4738).
--
-- ПРАВИЛА (всё через один UPDATE с CTE):
-- 1. Каналы, для которых в admin_action_log есть billing_adjust /
--    channel_status_change — НЕ ТРОГАЕМ (админ уже правил вручную).
-- 2. Для plan='paid':
--    - Если есть хоть один `billing_payments.status='paid'`:
--      expires_at = first_paid_at + Σ(months) × 30 дней
--    - Если нет paid-платежей: expires_at = created_at (просрочен)
-- 3. Для plan='trial':
--    - expires_at = created_at + 2 дня (стандартный триал)
-- 4. Затрагиваем ТОЛЬКО подозрительные:
--    - expires_at > NOW() + 60 дней (очевидное переполнение)
--    - ИЛИ plan='paid' с зазором >40 дней но без paid-платежей
-- 5. status пересчитываем: 'active' если expires > now(), иначе 'expired'.

DO $$
DECLARE
  affected INTEGER;
BEGIN
  WITH paid_summary AS (
    SELECT
      bp.channel_billing_id,
      SUM(COALESCE(bp.months, 1)) AS total_months,
      MIN(bp.created_at) AS first_paid_at
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
      WHEN cb.plan = 'paid' AND ps.total_months IS NOT NULL THEN
        GREATEST(cb.created_at, ps.first_paid_at) + (ps.total_months * INTERVAL '30 days')
      WHEN cb.plan = 'paid' THEN
        cb.created_at
      ELSE
        cb.created_at + INTERVAL '2 days'
    END,
    status = CASE
      WHEN cb.plan = 'paid' AND ps.total_months IS NOT NULL
        AND GREATEST(cb.created_at, ps.first_paid_at) + (ps.total_months * INTERVAL '30 days') > NOW()
        THEN 'active'
      WHEN cb.plan = 'trial' AND (cb.created_at + INTERVAL '2 days') > NOW()
        THEN 'active'
      ELSE 'expired'
    END
  FROM (
    SELECT id, channel_id FROM channel_billing
  ) base
  LEFT JOIN paid_summary ps ON ps.channel_billing_id = base.id
  WHERE cb.id = base.id
    AND (
      cb.expires_at > NOW() + INTERVAL '60 days'
      OR (
        cb.plan = 'paid'
        AND cb.expires_at - cb.created_at > INTERVAL '40 days'
        AND ps.total_months IS NULL
      )
    )
    AND cb.channel_id NOT IN (SELECT target_id FROM admin_touched);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[migration 067] Откатили expires_at у % каналов', affected;
END $$;
