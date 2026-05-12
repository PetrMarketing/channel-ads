-- ONE-TIME ОЧИСТКА: пересчитывает expires_at для paid-каналов
-- по фактической истории paid-платежей.
--
-- ЛОГИКА:
--   expires_at = MAX(created_at, first_paid_at) + Σ(payment.months) × 30 дней
--
-- ИСТОЧНИК months:
--   1) billing_payments.months (новое поле, добавлено миграцией 066)
--   2) fallback на channel_billing.billing_months
--   3) fallback на 1 (минимум)
--
-- ЧТО НЕ ТРОГАЕМ:
--   - Каналы из admin_action_log (billing_adjust/channel_status_change) —
--     админ уже правил вручную.
--   - plan != 'paid' (триалы/прочее).
--   - paid-каналы без paid-платежей в БД (нечего считать).
--   - paid-каналы где новое значение БОЛЬШЕ текущего (не уменьшаем
--     случайно у клиентов где была ОПЛАЧЕНА годовая, а billing_months=1).
--
-- РЕЗУЛЬТАТЫ:
--   - Создаём backup-таблицу channel_billing_backup_067 с (channel_id,
--     old_expires_at, old_status, new_expires_at, new_status, changed_at)
--   - В консоль NOTICE с числом затронутых строк.
--
-- ОТКАТ (если что-то пойдёт не так):
--   UPDATE channel_billing cb SET expires_at = b.old_expires_at, status = b.old_status
--   FROM channel_billing_backup_067 b WHERE cb.id = b.billing_id;

CREATE TABLE IF NOT EXISTS channel_billing_backup_067 (
    id SERIAL PRIMARY KEY,
    billing_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    channel_title TEXT,
    old_expires_at TIMESTAMP,
    old_status TEXT,
    new_expires_at TIMESTAMP,
    new_status TEXT,
    paid_count INTEGER,
    total_months INTEGER,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  affected INTEGER;
BEGIN
  WITH paid_summary AS (
    SELECT
      bp.channel_billing_id,
      COUNT(*) AS paid_count,
      SUM(COALESCE(bp.months, cb.billing_months, 1)) AS total_months,
      MIN(bp.created_at) AS first_paid_at
    FROM billing_payments bp
    JOIN channel_billing cb ON cb.id = bp.channel_billing_id
    WHERE bp.status = 'paid'
    GROUP BY bp.channel_billing_id
  ),
  admin_touched AS (
    SELECT DISTINCT target_id FROM admin_action_log
    WHERE target_type = 'channel'
      AND action IN ('billing_adjust', 'channel_status_change')
  ),
  candidates AS (
    SELECT
      cb.id AS billing_id,
      cb.channel_id,
      c.title AS channel_title,
      cb.expires_at AS old_expires_at,
      cb.status AS old_status,
      ps.paid_count,
      ps.total_months,
      (GREATEST(cb.created_at, ps.first_paid_at) + (ps.total_months * INTERVAL '30 days')) AS new_expires_at
    FROM channel_billing cb
    JOIN channels c ON c.id = cb.channel_id
    JOIN paid_summary ps ON ps.channel_billing_id = cb.id
    WHERE cb.plan = 'paid'
      AND cb.channel_id NOT IN (SELECT target_id FROM admin_touched)
      AND cb.expires_at > (
        GREATEST(cb.created_at, ps.first_paid_at) + (ps.total_months * INTERVAL '30 days')
      )
  )
  INSERT INTO channel_billing_backup_067
    (billing_id, channel_id, channel_title, old_expires_at, old_status,
     new_expires_at, new_status, paid_count, total_months)
  SELECT
    billing_id, channel_id, channel_title, old_expires_at, old_status,
    new_expires_at,
    CASE WHEN new_expires_at > NOW() THEN 'active' ELSE 'expired' END,
    paid_count, total_months
  FROM candidates;

  -- Применяем фикс по бэкап-таблице (источник правды на этом шаге)
  UPDATE channel_billing cb
  SET expires_at = b.new_expires_at,
      status = b.new_status,
      billing_months = LEAST(b.total_months, 12)  -- не больше 12 для актуального состояния
  FROM channel_billing_backup_067 b
  WHERE cb.id = b.billing_id
    AND cb.expires_at = b.old_expires_at;  -- защита от повторного запуска

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[migration 067] Откатили expires_at у % paid-каналов. Бэкап в channel_billing_backup_067', affected;
END $$;
