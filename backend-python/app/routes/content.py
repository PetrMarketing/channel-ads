import json
import os
import secrets
import aiohttp
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings


def _parse_scheduled_at(val):
    """Convert scheduled_at string to datetime for asyncpg TIMESTAMP."""
    if not val or val == "":
        return None
    if isinstance(val, datetime):
        return val
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(val, fmt)
        except (ValueError, TypeError):
            continue
    return None
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

_POST_COLS = "id, channel_id, title, message_text, file_path, file_type, telegram_file_id, telegram_message_id, status, scheduled_at, published_at, ai_generated, inline_buttons, attach_type, created_at"


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


async def _save_upload(file) -> tuple:
    """Save uploaded file, return (path, type, data)."""
    from ..services.file_storage import save_upload
    return await save_upload(file)


@router.get("/{tc}")
async def list_posts(
    tc: str,
    status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    sql = f"SELECT {_POST_COLS} FROM content_posts WHERE channel_id = $1"
    params = [channel["id"]]
    idx = 2
    if status:
        sql += f" AND status = ${idx}"
        params.append(status)
        idx += 1
    if from_date:
        sql += f" AND (scheduled_at >= ${idx} OR created_at >= ${idx})"
        params.append(_parse_scheduled_at(from_date) or from_date)
        idx += 1
    if to_date:
        sql += f" AND (scheduled_at <= ${idx} OR created_at <= ${idx})"
        params.append(_parse_scheduled_at(to_date) or to_date)
        idx += 1
    sql += " ORDER BY COALESCE(scheduled_at, created_at) DESC"

    posts = await fetch_all(sql, *params)
    return {"success": True, "posts": posts}


@router.post("/{tc}")
async def create_post(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    content_type = request.headers.get("content-type", "")
    file_path = None
    file_type = None
    file_data = None

    attach_type = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        title = form.get("title")
        message_text = form.get("message_text", "")
        scheduled_at = form.get("scheduled_at")
        inline_buttons_raw = form.get("inline_buttons")
        inline_buttons = json.dumps(json.loads(inline_buttons_raw)) if inline_buttons_raw else None
        attach_type = form.get("attach_type") or None
        uploaded_file = form.get("file")
        if uploaded_file and hasattr(uploaded_file, "read"):
            file_path, file_type, file_data = await _save_upload(uploaded_file)
    else:
        body = await request.json()
        title = body.get("title")
        message_text = body.get("message_text", "")
        scheduled_at = body.get("scheduled_at")
        inline_buttons = json.dumps(body["inline_buttons"]) if body.get("inline_buttons") else None
        attach_type = body.get("attach_type") or None

    scheduled_dt = _parse_scheduled_at(scheduled_at)

    post_id = await execute_returning_id(
        """INSERT INTO content_posts (channel_id, title, message_text, scheduled_at, inline_buttons, status, file_path, file_type, file_data, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        channel["id"], title, message_text, scheduled_dt, inline_buttons,
        "scheduled" if scheduled_dt else "draft",
        file_path, file_type, file_data, attach_type,
    )
    post = await fetch_one(f"SELECT {_POST_COLS} FROM content_posts WHERE id = $1", post_id)
    return {"success": True, "post": post}


@router.put("/{tc}/{post_id}")
async def update_post(tc: str, post_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    content_type = request.headers.get("content-type", "")
    file_path = None
    file_type = None
    file_data = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        body = {}
        for key in ("title", "message_text", "scheduled_at", "status", "attach_type"):
            val = form.get(key)
            if val is not None:
                body[key] = val
        inline_buttons_raw = form.get("inline_buttons")
        if inline_buttons_raw is not None:
            body["inline_buttons"] = json.loads(inline_buttons_raw)
        uploaded_file = form.get("file")
        if uploaded_file and hasattr(uploaded_file, "read"):
            file_path, file_type, file_data = await _save_upload(uploaded_file)
    else:
        body = await request.json()

    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "scheduled_at", "status", "inline_buttons", "attach_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "inline_buttons" and val:
                val = json.dumps(val)
            if key == "scheduled_at":
                val = _parse_scheduled_at(val)
            params.append(val)
            idx += 1
    if file_path:
        fields.append(f"file_path = ${idx}")
        params.append(file_path)
        idx += 1
        fields.append(f"file_type = ${idx}")
        params.append(file_type)
        idx += 1
        fields.append(f"file_data = ${idx}")
        params.append(file_data)
        idx += 1
        # Reset cached platform file IDs so both platforms re-upload the new file
        fields.append("telegram_file_id = NULL")
        fields.append("max_file_token = NULL")
    if not fields:
        return {"success": True}
    params.extend([post_id, channel["id"]])
    await execute(f"UPDATE content_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    post = await fetch_one(f"SELECT {_POST_COLS} FROM content_posts WHERE id = $1", post_id)
    return {"success": True, "post": post}


@router.delete("/{tc}/{post_id}")
async def delete_post(tc: str, post_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM content_posts WHERE id = $1 AND channel_id = $2", post_id, channel["id"])
    return {"success": True}


@router.post("/{tc}/{post_id}/publish")
async def publish_post(tc: str, post_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    post = await fetch_one("SELECT * FROM content_posts WHERE id = $1 AND channel_id = $2", post_id, channel["id"])
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    # Restore file from DB if missing on disk
    from ..services.file_storage import ensure_file
    post_file_path = ensure_file(post.get("file_path"), post.get("file_data"))

    # Resolve comments buttons to deep links
    from .pins import _resolve_buttons
    resolved_buttons = post.get("inline_buttons")
    if resolved_buttons:
        resolved_buttons = await _resolve_buttons(resolved_buttons, channel, post_id=post_id, post_type="content")

    from ..services.messenger import send_to_channel, sanitize_html_for_telegram, html_to_max_markdown
    import traceback

    message_text = post.get("message_text", "")
    existing_msg_id = post.get("telegram_message_id")
    edited = False

    # If already published — try to edit existing message
    if existing_msg_id and post.get("status") == "published":
        try:
            if channel.get("platform") == "max":
                from ..services.max_api import get_max_api
                from ..services.messenger import build_max_inline_buttons, _extract_max_file_token
                max_api = get_max_api()
                if max_api:
                    max_text = html_to_max_markdown(message_text)
                    attachments = None
                    max_file_token = post.get("max_file_token")
                    _type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
                    if max_file_token:
                        attachments = [{"type": _type_map.get(post.get("file_type", "file"), "file"), "payload": {"token": max_file_token}}]
                    elif post_file_path:
                        upload_result = await max_api.upload_file(post_file_path, post.get("file_type") or "file")
                        if upload_result.get("success"):
                            token = _extract_max_file_token(upload_result.get("data", {}))
                            if token:
                                attachments = [{"type": _type_map.get(post.get("file_type", "file"), "file"), "payload": {"token": token}}]
                                await execute("UPDATE content_posts SET max_file_token = $1 WHERE id = $2", token, post_id)
                    max_buttons = build_max_inline_buttons(resolved_buttons)
                    result = await max_api.edit_message(existing_msg_id, max_text, attachments, max_buttons)
                    if result.get("success"):
                        edited = True
            else:
                import aiohttp
                from ..config import settings
                tg_text = sanitize_html_for_telegram(message_text)
                token = settings.TELEGRAM_BOT_TOKEN
                if token:
                    url = f"https://api.telegram.org/bot{token}/editMessageText"
                    payload = {"chat_id": channel["channel_id"], "message_id": int(existing_msg_id), "text": tg_text, "parse_mode": "HTML"}
                    async with aiohttp.ClientSession() as session:
                        resp = await session.post(url, json=payload)
                        data = await resp.json()
                        if data.get("ok"):
                            edited = True
        except Exception as e:
            print(f"[Content] Edit failed, will send new: {e}")
            traceback.print_exc()

    # If edit failed or new post — send new message
    msg_id = existing_msg_id
    if not edited:
        try:
            result = await send_to_channel(
                channel, message_text,
                file_path=post_file_path, file_type=post.get("file_type"),
                telegram_file_id=post.get("telegram_file_id"),
                inline_buttons=resolved_buttons,
                attach_type=post.get("attach_type"),
                max_file_token=post.get("max_file_token"),
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Ошибка отправки: {e}")
        msg_id = None
        if isinstance(result, dict):
            msg_id = result.get("message_id") or result.get("result", {}).get("message_id")
            if not msg_id:
                msg_data = result.get("message", {})
                msg_id = msg_data.get("body", {}).get("mid")

    msg_id_str = str(msg_id) if msg_id else None
    await execute(
        "UPDATE content_posts SET status = 'published', published_at = NOW(), telegram_message_id = $1 WHERE id = $2",
        msg_id_str, post_id,
    )
    return {"success": True, "messageId": msg_id_str, "edited": edited}


@router.post("/{tc}/generate-plan")
async def generate_plan(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")

    prompt = f"""Составь контент-план для Telegram-канала.
Ниша: {body.get('niche', '')}
Продукты/услуги: {body.get('products', '')}
Целевая аудитория: {body.get('target_audience', '')}
Цель: {body.get('goal', '')}
УТП: {body.get('utp', '')}
Боли ЦА: {body.get('pains', '')}

Создай план на 7 дней. Для каждого дня укажи: дату, время, тему, тип поста, краткое описание.
Ответь в формате JSON: {{ "days": [{{ "date": "...", "posts": [{{ "time": "...", "topic": "...", "type": "...", "description": "..." }}] }}] }}"""

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers) as resp:
            result = await resp.json()

    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")

    # Save plan
    plan_id = await execute_returning_id(
        """INSERT INTO content_plans (channel_id, goal, niche, products, target_audience, utp, pains, plan_json, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'generated') RETURNING id""",
        channel["id"], body.get("goal"), body.get("niche"), body.get("products"),
        body.get("target_audience"), body.get("utp"), body.get("pains"), content,
    )

    return {"success": True, "planId": plan_id, "plan": content}


@router.post("/{tc}/generate-posts")
async def generate_posts(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")

    topics = body.get("topics", [])
    tone_sample = body.get("tone_sample", "")
    posts = []

    for topic in topics[:10]:  # max 10
        prompt = f"""Напиши пост для Telegram-канала на тему: {topic.get('topic', '')}
Тип: {topic.get('type', 'информационный')}
Описание: {topic.get('description', '')}
{"Образец стиля: " + tone_sample if tone_sample else ""}
Ответь только текстом поста, без пояснений. Можно использовать HTML-теги: <b>, <i>, <u>, <a href>."""

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": "openai/gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers) as resp:
                result = await resp.json()

        text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        if text:
            sched_at = _parse_scheduled_at(topic.get("scheduled_at"))
            post_status = "scheduled" if sched_at else "draft"
            post_id = await execute_returning_id(
                """INSERT INTO content_posts (channel_id, title, message_text, ai_generated, scheduled_at, status)
                   VALUES ($1,$2,$3,1,$4,$5) RETURNING id""",
                channel["id"], topic.get("topic", ""), text, sched_at, post_status,
            )
            posts.append({"id": post_id, "title": topic.get("topic"), "text": text})

    return {"success": True, "posts": posts}


@router.post("/{tc}/generate")
async def generate_legacy(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Legacy template-based generation."""
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    template = body.get("template", "")
    variables = body.get("variables", {})
    text = template
    for k, v in variables.items():
        text = text.replace(f"{{{{{k}}}}}", str(v))

    post_id = await execute_returning_id(
        "INSERT INTO content_posts (channel_id, title, message_text, ai_generated, status) VALUES ($1,$2,$3,1,'draft') RETURNING id",
        channel["id"], body.get("title", "Generated"), text,
    )
    return {"success": True, "postId": post_id, "text": text}
