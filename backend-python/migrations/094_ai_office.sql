-- AI Office: onboarding, plans, metering, background jobs and automations.
CREATE TABLE IF NOT EXISTS ai_office_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL DEFAULT 'trial',
    status TEXT NOT NULL DEFAULT 'trial',
    onboarding_status TEXT NOT NULL DEFAULT 'not_started',
    demo_used BOOLEAN NOT NULL DEFAULT FALSE,
    monthly_limit INTEGER NOT NULL DEFAULT 0,
    tokens_remaining INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER NOT NULL DEFAULT 0,
    weekly_limit INTEGER NOT NULL DEFAULT 0,
    automation_limit INTEGER NOT NULL DEFAULT 0,
    concurrent_limit INTEGER NOT NULL DEFAULT 1,
    period_started_at TIMESTAMP,
    period_ends_at TIMESTAMP,
    notification_settings JSONB NOT NULL DEFAULT '{"max":true,"task_done":true,"needs_input":true,"errors":true,"limits":true}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_office_contexts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS ai_office_tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    agent_type TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER NOT NULL DEFAULT 1,
    reserved_tokens INTEGER NOT NULL DEFAULT 0,
    charged_tokens INTEGER NOT NULL DEFAULT 0,
    result_text TEXT,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_file_url TEXT,
    error_message TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    is_background BOOLEAN NOT NULL DEFAULT TRUE,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_office_task_idempotency
    ON ai_office_tasks(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_office_tasks_user ON ai_office_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_office_tasks_queue ON ai_office_tasks(status, created_at);

CREATE TABLE IF NOT EXISTS ai_office_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES ai_office_tasks(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_office_usage_user ON ai_office_usage(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_office_automations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL,
    automation_type TEXT NOT NULL,
    title TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    daily_action_limit INTEGER NOT NULL DEFAULT 20,
    actions_today INTEGER NOT NULL DEFAULT 0,
    actions_date DATE,
    last_event_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, channel_id, automation_type)
);

CREATE TABLE IF NOT EXISTS ai_office_plan_purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_order_id TEXT UNIQUE NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_office_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    credentials_encrypted TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    account_name TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_checked_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, channel_id, provider, label)
);
CREATE INDEX IF NOT EXISTS idx_ai_office_connections_user
    ON ai_office_connections(user_id, provider);
