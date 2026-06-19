-- Добавляем колонки менеджера в shop_settings и service_branches.
-- На dev они появились вручную, поэтому миграция не была создана —
-- на проде сейчас падает: column "manager_user_id" of relation
-- "shop_settings" does not exist.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS manager_user_id INTEGER;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS manager_contact_url TEXT DEFAULT '';

ALTER TABLE service_branches ADD COLUMN IF NOT EXISTS manager_user_id INTEGER;
ALTER TABLE service_branches ADD COLUMN IF NOT EXISTS manager_contact_url TEXT DEFAULT '';
