"""Перерисовка inline-кнопок уже опубликованного поста в канале —
используется для счётчиков опросов и комментариев."""
from typing import Optional

from ..database import fetch_all, fetch_one


async def refresh_post_buttons(post_type: str, post_id: int) -> None:
    """Заново рендерит inline-кнопки для одного поста в канале.
    Не трогает текст/файлы — только attachments с кнопками."""
    try:
        if post_type == "content":
            post = await fetch_one(
                """SELECT cp.id, cp.message_text, cp.inline_buttons,
                          cp.telegram_message_id, cp.channel_id,
                          c.platform, c.channel_id as ch_channel_id,
                          c.max_chat_id, c.tracking_code
                   FROM content_posts cp
                   JOIN channels c ON c.id = cp.channel_id
                   WHERE cp.id = $1 AND cp.status = 'published'
                     AND cp.telegram_message_id IS NOT NULL""",
                int(post_id),
            )
        elif post_type == "pin":
            post = await fetch_one(
                """SELECT pp.id, pp.message_text, pp.inline_buttons,
                          pp.telegram_message_id, pp.channel_id,
                          c.platform, c.channel_id as ch_channel_id,
                          c.max_chat_id, c.tracking_code
                   FROM pin_posts pp
                   JOIN channels c ON c.id = pp.channel_id
                   WHERE pp.id = $1 AND pp.status = 'pinned'
                     AND pp.telegram_message_id IS NOT NULL""",
                int(post_id),
            )
        else:
            return
        if not post:
            return

        from ..routes.pins import _resolve_buttons
        channel = {
            "id": post["channel_id"],
            "platform": post["platform"],
            "channel_id": post["ch_channel_id"],
            "max_chat_id": post["max_chat_id"],
            "tracking_code": post["tracking_code"],
        }
        resolved = await _resolve_buttons(
            post["inline_buttons"], channel,
            post_id=post["id"], post_type=post_type,
        )
        if post["platform"] == "max":
            await _edit_max(post["telegram_message_id"], post["message_text"], resolved)
        else:
            await _edit_tg(channel, post["telegram_message_id"], resolved)
    except Exception as e:
        print(f"[post_button_refresh] {post_type}/{post_id}: {e}")


async def _edit_max(message_id, text, inline_buttons_json):
    from .max_api import get_max_api
    from .messenger import build_max_inline_buttons, html_to_max_markdown
    max_api = get_max_api()
    if not max_api:
        return
    max_buttons = build_max_inline_buttons(inline_buttons_json)
    max_text = html_to_max_markdown(text or "")
    r = await max_api.edit_message(str(message_id), max_text, buttons=max_buttons)
    print(f"[post_button_refresh] edit MAX msg {message_id}: {r.get('success', False)}")


async def _edit_tg(channel, message_id, inline_buttons_json):
    import aiohttp
    from ..config import settings
    from .messenger import build_reply_markup
    token = settings.TELEGRAM_BOT_TOKEN
    if not token or not channel.get("channel_id"):
        return
    reply_markup = build_reply_markup(inline_buttons_json) or {}
    url = f"{settings.TELEGRAM_API_URL}/bot{token}/editMessageReplyMarkup"
    payload = {
        "chat_id": channel["channel_id"],
        "message_id": int(message_id),
        "reply_markup": reply_markup,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as resp:
            await resp.json()
    print(f"[post_button_refresh] edit TG msg {message_id}: done")
