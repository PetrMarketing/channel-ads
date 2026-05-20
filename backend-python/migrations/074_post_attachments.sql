-- До 10 файлов-вложений к посту (раньше был только один file_path).
-- file_path остаётся как «главный» (для совместимости со старым кодом и
-- одиночными вложениями), attachment_paths — полный массив.

ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS attachment_paths TEXT[];
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS attachment_tokens TEXT[];
