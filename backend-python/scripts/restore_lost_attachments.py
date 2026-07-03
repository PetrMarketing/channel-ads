"""Восстанавливает потерянные картинки в MAX-каналах после бага
post_button_refresh (edit без attachments затирал файл).

Идёт по всем published постам (content_posts + pin_posts) MAX-каналов,
у которых есть file_path/max_file_token и telegram_message_id.
Вызывает edit_message с корректными attachments+buttons.

Если cached max_file_token уже невалиден (MAX инвалидирует со временем) —
заново загружает файл из file_path/file_data и делает retry.

Запуск после deploy:
    docker-compose exec app python3 /app/backend-python/scripts/restore_lost_attachments.py
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, "/app/backend-python")

from app.database import init_database, fetch_all, execute  # noqa: E402
from app.services.max_api import get_max_api  # noqa: E402
from app.services.messenger import (  # noqa: E402
    build_max_inline_buttons, html_to_max_markdown, _extract_max_file_token,
)
from app.services.file_storage import ensure_file  # noqa: E402


_TYPE_MAP = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}


async def _resolve_buttons_for(post_type: str, post_row: dict, channel_row: dict):
    """Резолвит inline_buttons в готовые кнопки MAX-а (deep-links и т.п.)."""
    from app.routes.pins import _resolve_buttons
    channel = {
        "id": channel_row["id"],
        "platform": channel_row["platform"],
        "channel_id": channel_row["channel_id"],
        "max_chat_id": channel_row["max_chat_id"],
        "tracking_code": channel_row["tracking_code"],
    }
    return await _resolve_buttons(
        post_row.get("inline_buttons"), channel,
        post_id=post_row["id"], post_type=post_type,
    )


async def _restore_one(max_api, post_type: str, post: dict, channel: dict) -> str:
    """Возвращает 'ok' / 'skipped' / 'no_file' / 'edit_failed'."""
    msg_id = post.get("telegram_message_id")
    if not msg_id:
        return "skipped"

    file_type = post.get("file_type") or "file"
    max_file_token = post.get("max_file_token")

    # Резолвим кнопки
    resolved = await _resolve_buttons_for(post_type, post, channel)
    max_buttons = build_max_inline_buttons(resolved)
    max_text = html_to_max_markdown(post.get("message_text") or "")

    # Собираем attachments из cached токена
    attachments = None
    if max_file_token:
        att_type = _TYPE_MAP.get(file_type, "file")
        attachments = [{"type": att_type, "payload": {"token": max_file_token}}]

    # Первая попытка — с cached
    if attachments:
        r = await max_api.edit_message(str(msg_id), max_text, attachments=attachments, buttons=max_buttons)
        if r.get("success"):
            return "ok"
        err = str(r.get("error") or "").lower()
        if not ("attach" in err or "token" in err or "invalid" in err or "not found" in err):
            print(f"    edit failed non-token: {r.get('error')}")
            return "edit_failed"
        # Cached token невалиден — падаем в reupload
        print(f"    cached token invalid, reuploading...")

    # Reupload из файла
    upload_path = ensure_file(post.get("file_path"), post.get("file_data"))
    if not upload_path and post.get("file_data"):
        ext = os.path.splitext(post.get("file_path") or "")[1]
        if not ext:
            ext = ".jpg" if file_type == "photo" else ".mp4" if file_type == "video" else ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            raw = post["file_data"]
            if not isinstance(raw, (bytes, bytearray, memoryview)):
                raw = bytes(raw)
            tmp.write(raw)
            upload_path = tmp.name

    if not upload_path:
        return "no_file"

    upload_result = await max_api.upload_file(upload_path, file_type)
    if not upload_result.get("success"):
        print(f"    upload failed: {upload_result.get('error')}")
        return "edit_failed"

    new_token = _extract_max_file_token(upload_result.get("data", {}))
    if not new_token:
        return "edit_failed"

    table = "content_posts" if post_type == "content" else "pin_posts"
    await execute(f"UPDATE {table} SET max_file_token = $1 WHERE id = $2", new_token, post["id"])

    att_type = _TYPE_MAP.get(file_type, "file")
    attachments = [{"type": att_type, "payload": {"token": new_token}}]
    r = await max_api.edit_message(str(msg_id), max_text, attachments=attachments, buttons=max_buttons)
    if r.get("success"):
        return "ok"
    print(f"    edit after reupload failed: {r.get('error')}")
    return "edit_failed"


async def main():
    await init_database()
    max_api = get_max_api()
    if not max_api:
        print("MAX API not configured — check MAX_BOT_TOKEN env")
        return

    stats = {"ok": 0, "skipped": 0, "no_file": 0, "edit_failed": 0}

    # 1. Content posts
    print("=== content_posts ===")
    content_rows = await fetch_all(
        """SELECT cp.id, cp.message_text, cp.inline_buttons,
                  cp.telegram_message_id, cp.file_path, cp.file_data,
                  cp.file_type, cp.max_file_token,
                  c.id as ch_id, c.platform, c.channel_id, c.max_chat_id, c.tracking_code
           FROM content_posts cp
           JOIN channels c ON c.id = cp.channel_id
           WHERE cp.status = 'published'
             AND cp.telegram_message_id IS NOT NULL
             AND c.platform = 'max'
             AND (cp.file_path IS NOT NULL OR cp.max_file_token IS NOT NULL
                  OR cp.file_data IS NOT NULL)
           ORDER BY cp.id DESC LIMIT 5000"""
    )
    print(f"  found {len(content_rows)} candidates")
    for row in content_rows:
        d = dict(row)
        channel = {"id": d["ch_id"], "platform": d["platform"], "channel_id": d["channel_id"],
                   "max_chat_id": d["max_chat_id"], "tracking_code": d["tracking_code"]}
        try:
            r = await _restore_one(max_api, "content", d, channel)
            stats[r] = stats.get(r, 0) + 1
            print(f"  content #{d['id']} → {r}")
        except Exception as e:
            print(f"  content #{d['id']} ERROR: {e}")
            stats["edit_failed"] += 1
        await asyncio.sleep(0.15)  # rate limit

    # 2. Pin posts
    print("=== pin_posts ===")
    pin_rows = await fetch_all(
        """SELECT pp.id, pp.message_text, pp.inline_buttons,
                  pp.telegram_message_id, pp.file_path, pp.file_data,
                  pp.file_type, pp.max_file_token,
                  c.id as ch_id, c.platform, c.channel_id, c.max_chat_id, c.tracking_code
           FROM pin_posts pp
           JOIN channels c ON c.id = pp.channel_id
           WHERE pp.status = 'pinned'
             AND pp.telegram_message_id IS NOT NULL
             AND c.platform = 'max'
             AND (pp.file_path IS NOT NULL OR pp.max_file_token IS NOT NULL
                  OR pp.file_data IS NOT NULL)
           ORDER BY pp.id DESC LIMIT 5000"""
    )
    print(f"  found {len(pin_rows)} candidates")
    for row in pin_rows:
        d = dict(row)
        channel = {"id": d["ch_id"], "platform": d["platform"], "channel_id": d["channel_id"],
                   "max_chat_id": d["max_chat_id"], "tracking_code": d["tracking_code"]}
        try:
            r = await _restore_one(max_api, "pin", d, channel)
            stats[r] = stats.get(r, 0) + 1
            print(f"  pin #{d['id']} → {r}")
        except Exception as e:
            print(f"  pin #{d['id']} ERROR: {e}")
            stats["edit_failed"] += 1
        await asyncio.sleep(0.15)

    print("\n=== SUMMARY ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
