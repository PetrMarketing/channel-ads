-- Онлайн-филиал и юр. документы
ALTER TABLE service_branches ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE service_branches ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT DEFAULT '';
ALTER TABLE service_branches ADD COLUMN IF NOT EXISTS offer_url TEXT DEFAULT '';
