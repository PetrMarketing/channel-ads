"""Раз в сутки чистит черновики постов старше 30 дней.

Удаляет content_posts со status='draft' и updated_at < NOW() - 30 days.
Файлы вложений уезжают вместе с записями (file_path/file_data в той же таблице).
Опубликованные/запланированные посты не трогаем.
"""
import asyncio
import os
from ..database import fetch_all, execute

_task = None
_INTERVAL_SEC = 60 * 60 * 24  # раз в сутки


async def _cleanup_once():
    # Сначала достаём пути к файлам, чтобы удалить их с диска
    rows = await fetch_all(
        """SELECT id, file_path FROM content_posts
           WHERE status = 'draft'
             AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '30 days'
           LIMIT 1000"""
    )
    if not rows:
        return 0

    # Удаляем файлы (молча, если уже нет)
    for r in rows:
        fp = r.get("file_path") or ""
        if fp:
            real = fp if os.path.isabs(fp) else os.path.join("/app", fp.lstrip("/"))
            try:
                if os.path.exists(real):
                    os.remove(real)
            except Exception as e:
                print(f"[DraftCleaner] file remove failed {real}: {e}")

    ids = [r["id"] for r in rows]
    await execute(
        "DELETE FROM content_posts WHERE id = ANY($1::int[])",
        ids,
    )
    return len(ids)


async def _runner():
    # Первая задержка маленькая — чтобы при рестарте сервис подобрал давние
    # черновики. Дальше по расписанию.
    await asyncio.sleep(60)
    while True:
        try:
            n = await _cleanup_once()
            if n > 0:
                print(f"[DraftCleaner] Удалено {n} черновиков старше 30 дней")
        except Exception as e:
            print(f"[DraftCleaner] error: {e}")
        await asyncio.sleep(_INTERVAL_SEC)


def start_draft_cleaner():
    global _task
    _task = asyncio.create_task(_runner())
    print("[DraftCleaner] Started (interval: 24h, TTL: 30 days)")


def stop_draft_cleaner():
    global _task
    if _task:
        _task.cancel()
        _task = None
