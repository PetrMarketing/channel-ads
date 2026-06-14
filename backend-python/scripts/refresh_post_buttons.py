"""Bulk-refresh inline-кнопок во всех опубликованных постах:
обновляет счётчики «Комментарии (N)» и «Пройти опрос (N голосов)»
без затрагивания самих комментариев / голосов / медиа.

Запуск:
    docker-compose exec app python3 -m backend-python.scripts.refresh_post_buttons
ИЛИ из контейнера:
    python3 /app/backend-python/scripts/refresh_post_buttons.py
ИЛИ с фильтром (только comments или только polls):
    python3 /app/backend-python/scripts/refresh_post_buttons.py --type=comments
"""
import asyncio
import sys
import os

# Делаем backend-python корнем пакета app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import init_database, fetch_all  # noqa: E402
from app.services.max_api import init_max_api  # noqa: E402
from app.services.post_button_refresh import refresh_post_buttons  # noqa: E402


async def main():
    filter_type = None
    for arg in sys.argv[1:]:
        if arg.startswith("--type="):
            filter_type = arg.split("=", 1)[1]  # comments | poll | both

    await init_database()
    init_max_api()  # без него edit_message молча провалится

    # Кандидаты — все опубликованные посты с inline_buttons
    posts = await fetch_all("""
        SELECT id, inline_buttons FROM content_posts
        WHERE status = 'published'
          AND telegram_message_id IS NOT NULL
          AND inline_buttons IS NOT NULL
    """)
    pins = await fetch_all("""
        SELECT id, inline_buttons FROM pin_posts
        WHERE status = 'pinned'
          AND telegram_message_id IS NOT NULL
          AND inline_buttons IS NOT NULL
    """)

    targets = []
    for p in posts:
        ib = p.get("inline_buttons") or ""
        if _wants(ib, filter_type):
            targets.append(("content", p["id"]))
    for p in pins:
        ib = p.get("inline_buttons") or ""
        if _wants(ib, filter_type):
            targets.append(("pin", p["id"]))

    print(f"Refreshing {len(targets)} posts (filter={filter_type or 'all'})")
    success = failed = 0
    for post_type, post_id in targets:
        try:
            await refresh_post_buttons(post_type, post_id)
            success += 1
        except Exception as e:
            print(f"[{post_type}/{post_id}] failed: {e}")
            failed += 1
        await asyncio.sleep(0.15)  # rate-limit для MAX API

    print(f"Done. success={success} failed={failed}")


def _wants(inline_buttons: str, filter_type: str | None) -> bool:
    if filter_type == "comments":
        return '"type":"comments"' in inline_buttons or '"type": "comments"' in inline_buttons
    if filter_type == "poll":
        return '"type":"poll"' in inline_buttons or '"type": "poll"' in inline_buttons
    return ('"type":"comments"' in inline_buttons
            or '"type": "comments"' in inline_buttons
            or '"type":"poll"' in inline_buttons
            or '"type": "poll"' in inline_buttons)


if __name__ == "__main__":
    asyncio.run(main())
