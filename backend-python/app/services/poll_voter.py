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

    # Идентифицируем юзера. Ищем существующий голос по ОБОИМ полям
    # (max_user_id и telegram_id::text) — чтобы один и тот же 4747468,
    # пришедший в разных полях с разных устройств, считался одним
    # пользователем.
    voter_key = None
    if voter_max_user_id is not None:
        voter_key = str(voter_max_user_id)
    elif voter_telegram_id is not None:
        voter_key = str(voter_telegram_id)
    else:
        return "Не удалось определить пользователя"

    existing = await fetch_all(
        """SELECT id, option_id FROM poll_votes
           WHERE poll_id = $1
             AND (voter_max_user_id = $2
                  OR (voter_telegram_id IS NOT NULL AND voter_telegram_id::text = $2))""",
        poll_id, voter_key,
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
            "SELECT id FROM content_posts WHERE poll_id = $1 AND status = 'published' AND telegram_message_id IS NOT NULL",
            poll_id,
        )
        print(f"[poll_voter] refresh poll_id={poll_id}: found {len(posts)} posts")
        if not posts:
            return
        from .post_button_refresh import refresh_post_buttons
        for post in posts:
            await refresh_post_buttons("content", post["id"])
    except Exception as e:
        print(f"[poll_voter] _refresh_poll_buttons_in_posts: {e}")


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
