-- Админ может переопределить заголовок и текст любого шага онбординга
-- по его step_id. Сами шаги (selector, placement, navigate) живут в
-- frontend-коде — править их можно только релизом.
CREATE TABLE IF NOT EXISTS onboarding_text_overrides (
    step_id TEXT PRIMARY KEY,
    title TEXT,
    text TEXT,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
