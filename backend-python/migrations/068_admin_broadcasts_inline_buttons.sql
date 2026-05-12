-- inline_buttons (JSON) для рассылок — массив объектов как у обычного поста
-- из ButtonBuilder. Старые поля button_text / button_url остаются как fallback.
ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS inline_buttons TEXT;
