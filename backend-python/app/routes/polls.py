"""Polls — опросы канала.

CRUD на полы и опции, прикрепление к посту — через content_posts.poll_id,
сама отрисовка inline-кнопок и обработка голосования живут в сервисе
content_post + bot webhook (callback poll_<poll_id>_<option_id>).
"""
from typing import Dict, Any, List
import json as _json

from fastapi import APIRouter, HTTPException, Depends, Request

from ..database import fetch_all, fetch_one, execute, get_pool
from ..middleware.auth import get_current_user


router = APIRouter()


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT id FROM channels WHERE tracking_code = $1 AND user_id = $2 AND deleted_at IS NULL",
        tc, user_id,
    )


async def _serialize_poll(poll_row: dict) -> dict:
    options = await fetch_all(
        "SELECT id, text, position FROM poll_options WHERE poll_id = $1 ORDER BY position, id",
        poll_row["id"],
    )
    # Подсчёт голосов одним запросом
    counts_rows = await fetch_all(
        "SELECT option_id, COUNT(*)::int AS cnt FROM poll_votes WHERE poll_id = $1 GROUP BY option_id",
        poll_row["id"],
    )
    counts = {r["option_id"]: r["cnt"] for r in counts_rows}
    total = sum(counts.values())
    options_out = []
    for o in options:
        cnt = counts.get(o["id"], 0)
        options_out.append({
            "id": o["id"],
            "text": o["text"],
            "position": o["position"],
            "votes": cnt,
            "percent": (round(cnt * 100 / total, 1) if total > 0 else 0.0),
        })
    return {
        **dict(poll_row),
        "options": options_out,
        "total_votes": total,
    }


@router.get("/{tc}")
async def list_polls(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    polls = await fetch_all(
        """SELECT id, channel_id, question, is_anonymous, allow_multiple, is_closed,
                  created_at, updated_at
           FROM polls WHERE channel_id = $1 ORDER BY created_at DESC""",
        channel["id"],
    )
    out = []
    for p in polls:
        out.append(await _serialize_poll(p))
    return {"success": True, "polls": out}


@router.get("/{tc}/{poll_id}")
async def get_poll(tc: str, poll_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    p = await fetch_one(
        """SELECT id, channel_id, question, is_anonymous, allow_multiple, is_closed,
                  created_at, updated_at FROM polls WHERE id = $1 AND channel_id = $2""",
        poll_id, channel["id"],
    )
    if not p:
        raise HTTPException(status_code=404, detail="Опрос не найден")
    return {"success": True, "poll": await _serialize_poll(p)}


@router.post("/{tc}")
async def create_poll(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    question = (body.get("question") or "").strip()
    options: List[str] = [str(o).strip() for o in (body.get("options") or []) if str(o or "").strip()]
    is_anonymous = bool(body.get("is_anonymous", True))
    allow_multiple = bool(body.get("allow_multiple", False))

    if not question:
        raise HTTPException(status_code=400, detail="Укажите вопрос")
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Опрос должен содержать минимум 2 варианта")
    if len(options) > 10:
        raise HTTPException(status_code=400, detail="Не более 10 вариантов")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO polls (channel_id, question, is_anonymous, allow_multiple, created_by)
                   VALUES ($1, $2, $3, $4, $5) RETURNING id""",
                channel["id"], question, is_anonymous, allow_multiple, user["id"],
            )
            poll_id = row["id"]
            for i, opt in enumerate(options):
                await conn.execute(
                    "INSERT INTO poll_options (poll_id, text, position) VALUES ($1, $2, $3)",
                    poll_id, opt, i,
                )

    p = await fetch_one(
        """SELECT id, channel_id, question, is_anonymous, allow_multiple, is_closed,
                  created_at, updated_at FROM polls WHERE id = $1""", poll_id,
    )
    return {"success": True, "poll": await _serialize_poll(p)}


@router.put("/{tc}/{poll_id}")
async def update_poll(tc: str, poll_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    p = await fetch_one("SELECT id FROM polls WHERE id = $1 AND channel_id = $2", poll_id, channel["id"])
    if not p:
        raise HTTPException(status_code=404, detail="Опрос не найден")

    body = await request.json()
    question = (body.get("question") or "").strip()
    options: List[str] = [str(o).strip() for o in (body.get("options") or []) if str(o or "").strip()]
    is_anonymous = bool(body.get("is_anonymous", True))
    allow_multiple = bool(body.get("allow_multiple", False))
    is_closed = bool(body.get("is_closed", False))

    if not question:
        raise HTTPException(status_code=400, detail="Укажите вопрос")

    has_votes = await fetch_one("SELECT 1 FROM poll_votes WHERE poll_id = $1 LIMIT 1", poll_id)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """UPDATE polls SET question = $1, is_anonymous = $2, allow_multiple = $3,
                                    is_closed = $4, updated_at = NOW()
                   WHERE id = $5""",
                question, is_anonymous, allow_multiple, is_closed, poll_id,
            )
            # Опции пересоздаём только если ещё нет голосов — иначе старые id ломаются
            if not has_votes and options:
                if len(options) < 2:
                    raise HTTPException(status_code=400, detail="Минимум 2 варианта")
                if len(options) > 10:
                    raise HTTPException(status_code=400, detail="Не более 10 вариантов")
                await conn.execute("DELETE FROM poll_options WHERE poll_id = $1", poll_id)
                for i, opt in enumerate(options):
                    await conn.execute(
                        "INSERT INTO poll_options (poll_id, text, position) VALUES ($1, $2, $3)",
                        poll_id, opt, i,
                    )

    p2 = await fetch_one(
        """SELECT id, channel_id, question, is_anonymous, allow_multiple, is_closed,
                  created_at, updated_at FROM polls WHERE id = $1""", poll_id,
    )
    return {"success": True, "poll": await _serialize_poll(p2)}


@router.delete("/{tc}/{poll_id}")
async def delete_poll(tc: str, poll_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    p = await fetch_one("SELECT id FROM polls WHERE id = $1 AND channel_id = $2", poll_id, channel["id"])
    if not p:
        raise HTTPException(status_code=404, detail="Опрос не найден")
    # Очистим привязки в постах
    await execute("UPDATE content_posts SET poll_id = NULL WHERE poll_id = $1", poll_id)
    await execute("DELETE FROM polls WHERE id = $1", poll_id)
    return {"success": True}


@router.get("/{tc}/{poll_id}/results")
async def poll_results(tc: str, poll_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Детальные результаты с голосовавшими (если опрос не анонимный)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    p = await fetch_one(
        """SELECT id, channel_id, question, is_anonymous, allow_multiple, is_closed,
                  created_at, updated_at FROM polls WHERE id = $1 AND channel_id = $2""",
        poll_id, channel["id"],
    )
    if not p:
        raise HTTPException(status_code=404, detail="Опрос не найден")

    summary = await _serialize_poll(p)
    voters = []
    if not p["is_anonymous"]:
        voters = await fetch_all(
            """SELECT v.option_id, o.text AS option_text,
                      v.voter_telegram_id, v.voter_max_user_id,
                      v.voter_username, v.voter_first_name, v.voted_at
               FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
               WHERE v.poll_id = $1 ORDER BY v.voted_at DESC""",
            poll_id,
        )
    return {"success": True, "poll": summary, "voters": voters}
