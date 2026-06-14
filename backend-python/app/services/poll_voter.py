"""Обработка клика по inline-кнопке опроса (общая для MAX и Telegram).

Возвращает короткое текстовое сообщение для answerCallbackQuery / toast.
"""
from ..database import fetch_one, execute, fetch_all


async def handle_poll_vote(
    poll_id: int,
    option_id: int,
    voter_telegram_id=None,
    voter_max_user_id=None,
    voter_username: str = "",
    voter_first_name: str = "",
) -> str:
    poll = await fetch_one(
        "SELECT id, channel_id, allow_multiple, is_closed FROM polls WHERE id = $1",
        poll_id,
    )
    if not poll:
        return "Опрос не найден"
    if poll["is_closed"]:
        return "Опрос закрыт"
    option = await fetch_one(
        "SELECT id FROM poll_options WHERE id = $1 AND poll_id = $2",
        option_id, poll_id,
    )
    if not option:
        return "Вариант не найден"

    # Проверяем, голосовал ли уже
    voter_clause = []
    voter_params = []
    if voter_telegram_id is not None:
        voter_clause.append("voter_telegram_id = $1")
        voter_params.append(int(voter_telegram_id))
    elif voter_max_user_id is not None:
        voter_clause.append("voter_max_user_id = $1")
        voter_params.append(str(voter_max_user_id))
    else:
        return "Не удалось определить пользователя"

    existing = await fetch_all(
        f"SELECT id, option_id FROM poll_votes WHERE poll_id = $2 AND {voter_clause[0]}",
        voter_params[0], poll_id,
    )

    if not poll["allow_multiple"]:
        # Single-choice — заменяем существующий голос
        if existing:
            same_opt = next((v for v in existing if v["option_id"] == option_id), None)
            if same_opt:
                # Уже проголосовал за этот вариант — отменяем
                await execute("DELETE FROM poll_votes WHERE id = $1", same_opt["id"])
                msg = "Голос отозван"
            else:
                # Заменяем
                for v in existing:
                    await execute("DELETE FROM poll_votes WHERE id = $1", v["id"])
                await _insert_vote(poll_id, option_id, voter_telegram_id, voter_max_user_id, voter_username, voter_first_name)
                msg = "Голос изменён"
        else:
            await _insert_vote(poll_id, option_id, voter_telegram_id, voter_max_user_id, voter_username, voter_first_name)
            msg = "Голос принят ✓"
    else:
        # Multi-choice — toggle на конкретную опцию
        same_opt = next((v for v in existing if v["option_id"] == option_id), None)
        if same_opt:
            await execute("DELETE FROM poll_votes WHERE id = $1", same_opt["id"])
            msg = "Вариант снят"
        else:
            await _insert_vote(poll_id, option_id, voter_telegram_id, voter_max_user_id, voter_username, voter_first_name)
            msg = "Вариант добавлен ✓"

    # Считаем процент по выбранной опции для UX
    totals = await fetch_one(
        "SELECT COUNT(*)::int AS cnt FROM poll_votes WHERE poll_id = $1", poll_id,
    )
    opt_cnt = await fetch_one(
        "SELECT COUNT(*)::int AS cnt FROM poll_votes WHERE poll_id = $1 AND option_id = $2",
        poll_id, option_id,
    )
    total = totals["cnt"] if totals else 0
    cnt = opt_cnt["cnt"] if opt_cnt else 0
    pct = round(cnt * 100 / total, 0) if total > 0 else 0

    # Обновляем кнопку «Пройти опрос (N голосов)» во всех опубликованных постах
    # с этим опросом. Делаем fire-and-forget чтобы не блокировать ответ юзеру.
    import asyncio
    asyncio.create_task(_refresh_poll_buttons_in_posts(poll_id))

    return f"{msg} · {int(pct)}% ({cnt}/{total})"


async def _refresh_poll_buttons_in_posts(poll_id: int):
    """Находит все опубликованные посты с этим poll_id и обновляет в канале
    их inline-кнопки (актуальный счётчик голосов)."""
    try:
        posts = await fetch_all(
            """SELECT cp.id, cp.message_text, cp.inline_buttons, cp.attach_type,
                      cp.telegram_message_id, cp.channel_id,
                      c.platform, c.channel_id as ch_channel_id, c.max_chat_id, c.tracking_code
               FROM content_posts cp
               JOIN channels c ON c.id = cp.channel_id
               WHERE cp.poll_id = $1 AND cp.status = 'published'
                 AND cp.telegram_message_id IS NOT NULL""",
            poll_id,
        )
        print(f"[poll_voter] refresh poll_id={poll_id}: found {len(posts)} posts")
        if not posts:
            return
        from ..routes.pins import _resolve_buttons
        for post in posts:
            try:
                channel = {
                    "id": post["channel_id"],
                    "platform": post["platform"],
                    "channel_id": post["ch_channel_id"],
                    "max_chat_id": post["max_chat_id"],
                    "tracking_code": post["tracking_code"],
                }
                resolved = await _resolve_buttons(
                    post["inline_buttons"], channel,
                    post_id=post["id"], post_type="content",
                )
                if post["platform"] == "max":
                    r = await _edit_max_message_buttons(channel, post["telegram_message_id"],
                                                    post["message_text"], resolved)
                    print(f"[poll_voter] edit MAX msg {post['telegram_message_id']}: {r}")
                else:
                    await _edit_telegram_message_buttons(channel, post["telegram_message_id"],
                                                          resolved)
                    print(f"[poll_voter] edit TG msg {post['telegram_message_id']} done")
            except Exception as e:
                print(f"[poll_voter] refresh post {post['id']} failed: {e}")
    except Exception as e:
        print(f"[poll_voter] _refresh_poll_buttons_in_posts: {e}")


async def _edit_max_message_buttons(channel, message_id, text, inline_buttons_json):
    from .max_api import get_max_api
    from .messenger import build_max_inline_buttons, html_to_max_markdown
    max_api = get_max_api()
    if not max_api:
        return {"success": False, "error": "no max_api"}
    max_buttons = build_max_inline_buttons(inline_buttons_json)
    max_text = html_to_max_markdown(text or "")
    return await max_api.edit_message(str(message_id), max_text, buttons=max_buttons)


async def _edit_telegram_message_buttons(channel, message_id, inline_buttons_json):
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


async def _insert_vote(poll_id, option_id, tg_id, max_uid, username, first_name):
    await execute(
        """INSERT INTO poll_votes (poll_id, option_id, voter_telegram_id, voter_max_user_id,
                                    voter_username, voter_first_name)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        poll_id, option_id,
        int(tg_id) if tg_id else None,
        str(max_uid) if max_uid else None,
        username or "", first_name or "",
    )
