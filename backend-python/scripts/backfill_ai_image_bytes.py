"""Подгружает bytes картинок с диска в content_posts.file_data для постов,
у которых file_path заполнен но file_data пуст.

Нужно после миграции 091 (или в любой момент) — гарантирует что даже
если файл на диске исчезнет (например пересоздали volume), картинка
восстановится из БД.

Запуск:
    docker-compose exec app python3 /app/backend-python/scripts/backfill_ai_image_bytes.py
"""
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend-python")

from app.database import init_database, fetch_all, execute  # noqa: E402


async def main():
    await init_database()
    rows = await fetch_all(
        """SELECT id, file_path FROM content_posts
           WHERE file_path IS NOT NULL AND file_path <> ''
             AND (file_data IS NULL OR length(file_data) = 0)
             AND status IN ('scheduled', 'draft', 'failed', 'published')
           LIMIT 5000"""
    )
    print(f"Found {len(rows)} posts to backfill bytes")
    ok = missing = errors = 0
    for r in rows:
        fp = r["file_path"]
        # Резолвим путь как ensure_file
        candidates = []
        if os.path.exists(fp):
            candidates.append(fp)
        elif fp.startswith("/uploads/"):
            candidates.append("/app" + fp)
        else:
            candidates.append(os.path.join("/app/uploads", os.path.basename(fp)))
        real = next((c for c in candidates if os.path.exists(c)), None)
        if not real:
            missing += 1
            print(f"  [{r['id']}] MISSING {fp}")
            continue
        try:
            with open(real, "rb") as f:
                data = f.read()
            await execute(
                "UPDATE content_posts SET file_data = $1 WHERE id = $2",
                data, r["id"],
            )
            ok += 1
        except Exception as e:
            errors += 1
            print(f"  [{r['id']}] ERROR: {e}")
    print(f"Done. ok={ok} missing={missing} errors={errors}")


if __name__ == "__main__":
    asyncio.run(main())
