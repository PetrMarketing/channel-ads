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
    return f"{msg} · {int(pct)}% ({cnt}/{total})"


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
