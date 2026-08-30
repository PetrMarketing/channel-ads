-- Проектный ИИ Агент: бриф, источники, результаты и журнал этапов.
CREATE TABLE IF NOT EXISTS ai_agent_projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft',
    current_stage TEXT NOT NULL DEFAULT 'brief',
    brief_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    progress INTEGER NOT NULL DEFAULT 0,
    price_tokens INTEGER NOT NULL DEFAULT 3990,
    tokens_charged INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_one_active_project
    ON ai_agent_projects(channel_id)
    WHERE status IN ('draft', 'queued', 'running', 'awaiting_approval');
CREATE INDEX IF NOT EXISTS idx_ai_agent_projects_user
    ON ai_agent_projects(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_agent_sources (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES ai_agent_projects(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    title TEXT,
    source_url TEXT,
    file_name TEXT,
    file_path TEXT,
    mime_type TEXT,
    file_size BIGINT,
    extracted_text TEXT,
    parsed_data JSONB,
    status TEXT NOT NULL DEFAULT 'ready',
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sources_project ON ai_agent_sources(project_id, id);

CREATE TABLE IF NOT EXISTS ai_agent_deliverables (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES ai_agent_projects(id) ON DELETE CASCADE,
    deliverable_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_text TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, deliverable_type)
);

CREATE TABLE IF NOT EXISTS ai_agent_activity_log (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES ai_agent_projects(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_log_project ON ai_agent_activity_log(project_id, id);
