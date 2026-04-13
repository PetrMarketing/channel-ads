-- Ссылка на политику конфиденциальности (общая для платных чатов и услуг)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT DEFAULT '';
