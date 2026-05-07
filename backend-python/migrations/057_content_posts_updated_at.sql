-- Добавляем updated_at в content_posts чтобы DraftCleaner мог считать
-- TTL не от created_at, а от последнего изменения.
-- Триггером не апдейтим (минимум магии) — обновляем явно из app кода.
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Старым строкам подставим created_at чтобы старые черновики не удалились
-- сразу первой же чисткой.
UPDATE content_posts SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_posts_status_updated ON content_posts(status, updated_at) WHERE status = 'draft';
