-- ИИ-Помощник: история задач юзера (распознавание + выполнение).
-- Каждая задача проходит этапы:
--   raw → parsed (ждёт подтверждения) → executing → done / failed / cancelled
CREATE TABLE IF NOT EXISTS ai_assistant_tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    raw_query TEXT NOT NULL,
    plan_json JSONB,         -- результат парсинга: [{tool, args, est_tokens}, ...]
    confirm_summary TEXT,    -- человекочитаемое описание плана для подтверждения
    status TEXT NOT NULL DEFAULT 'parsed',
       -- parsed | confirmed | executing | done | failed | cancelled
    steps_results JSONB DEFAULT '[]'::jsonb,  -- [{step, status, output, error}]
    tokens_used INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_user_recent
    ON ai_assistant_tasks (user_id, created_at DESC);
