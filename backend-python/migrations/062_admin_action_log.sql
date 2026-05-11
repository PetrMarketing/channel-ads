-- Лог действий админов для аудита: кто, когда, что менял у кого, причина.
-- Используется для отображения в админке вкладки "Лог действий" и в
-- профиле пользователя (история ручных корректировок).
CREATE TABLE IF NOT EXISTS admin_action_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_username TEXT,                  -- кэш на случай удаления админа
    action TEXT NOT NULL,                 -- 'tokens_adjust' | 'billing_adjust' | 'channel_freeze' | ...
    target_type TEXT,                     -- 'user' | 'channel' | 'broadcast' | ...
    target_id INTEGER,
    payload JSONB,                        -- {before, after, delta, reason, ...}
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aal_created ON admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_admin ON admin_action_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_target ON admin_action_log(target_type, target_id, created_at DESC);
