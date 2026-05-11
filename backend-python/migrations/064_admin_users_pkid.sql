-- Связь админа с обычным юзером сервиса по PKid (users.id).
-- Используется для "Отправить себе" в рассылках и для импер-логина в будущем.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS user_pkid INTEGER REFERENCES users(id) ON DELETE SET NULL;
