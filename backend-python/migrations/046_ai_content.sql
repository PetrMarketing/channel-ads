-- ИИ Контент: сессии генерации контент-плана и сгенерированные посты
CREATE TABLE IF NOT EXISTS ai_content_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    -- Brief
    topic TEXT,
    goal_sales SMALLINT DEFAULT 0,
    goal_warmup SMALLINT DEFAULT 0,
    goal_activity SMALLINT DEFAULT 0,
    -- Style source
    style_source TEXT,
    style_text TEXT,
    style_file_path TEXT,
    -- Products
    products JSONB,
    -- Schedule
    posts_count SMALLINT DEFAULT 30,
    first_post_time TEXT,
    second_post_time TEXT,
    start_date DATE,
    -- Status
    status TEXT DEFAULT 'draft',
    tokens_charged INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_sessions_channel ON ai_content_sessions(channel_id);
CREATE INDEX IF NOT EXISTS idx_ai_content_sessions_user ON ai_content_sessions(user_id);

CREATE TABLE IF NOT EXISTS ai_content_session_posts (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES ai_content_sessions(id) ON DELETE CASCADE,
    sort_order SMALLINT NOT NULL,
    title TEXT,
    message_text TEXT,
    cta TEXT,
    goal_type TEXT,
    rubric TEXT,
    scheduled_at TIMESTAMPTZ,
    inline_buttons JSONB,
    attach_type TEXT,
    file_path TEXT,
    file_type TEXT,
    file_data BYTEA,
    published_post_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_posts_session ON ai_content_session_posts(session_id);
