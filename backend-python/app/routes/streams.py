"""Эфиры (live streams) — CRUD + публичный API для миниаппа."""
from typing import Dict, Any, Optional
from datetime import datetime
import secrets

from fastapi import APIRouter, HTTPException, Depends, Request

from ..config import settings
from ..database import fetch_all, fetch_one, execute, execute_returning_id
from ..middleware.auth import get_current_user


router = APIRouter()
public_router = APIRouter()
rtmp_router = APIRouter()  # для on_publish хуков nginx-rtmp, без auth


_ALLOWED_TYPES = {"vk", "kinescope", "rutube", "encoder", "youtube"}


def _gen_encoder_credentials():
    """Генерирует RTMP-ссылку и ключ для OBS-кодировщика."""
    import os as _os
    # STREAM_RTMP_HOST переопределяет — если nginx-rtmp на другом IP
    # или nginx-фронт не проксирует порт 1935. По умолчанию — APP_URL host.
    host = _os.getenv("STREAM_RTMP_HOST", "").strip()
    if not host:
        base = (settings.APP_URL or "").replace("https://", "").replace("http://", "").rstrip("/")
        host = base.split("/")[0] if base else "max.pkmarketing.ru"
    stream_url = f"rtmp://{host}/live"
    stream_key = secrets.token_urlsafe(24)
    return stream_url, stream_key


def _parse_dt(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        s = val.rstrip("Z")
        if "." in s:
            s = s.split(".")[0]
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(s, fmt)
            except (ValueError, TypeError):
                continue
    return None


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT id, title FROM channels WHERE tracking_code = $1 AND user_id = $2 AND deleted_at IS NULL",
        tc, user_id,
    )


def _serialize(row) -> dict:
    if not row:
        return None
    d = dict(row)
    if isinstance(d.get("starts_at"), datetime):
        d["starts_at"] = d["starts_at"].isoformat()
    if isinstance(d.get("ended_at"), datetime):
        d["ended_at"] = d["ended_at"].isoformat()
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    if isinstance(d.get("updated_at"), datetime):
        d["updated_at"] = d["updated_at"].isoformat()
    return d


# ============================================================
# Personal cabinet API
# ============================================================

@router.get("/{tc}")
async def list_streams(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        """SELECT id, channel_id, title, description, starts_at, ended_at,
                  bg_image_url, stream_type, embed_url, stream_url, stream_key,
                  status, created_at, updated_at
           FROM streams WHERE channel_id = $1 ORDER BY starts_at DESC""",
        channel["id"],
    )
    return {"success": True, "streams": [_serialize(r) for r in rows]}


@router.get("/{tc}/{stream_id}")
async def get_stream(tc: str, stream_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    row = await fetch_one(
        """SELECT id, channel_id, title, description, starts_at, ended_at,
                  bg_image_url, stream_type, embed_url, stream_url, stream_key,
                  status, created_at, updated_at
           FROM streams WHERE id = $1 AND channel_id = $2""",
        stream_id, channel["id"],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Эфир не найден")
    return {"success": True, "stream": _serialize(row)}


@router.post("/{tc}")
async def create_stream(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Укажите заголовок эфира")
    starts_at = _parse_dt(body.get("starts_at"))
    if not starts_at:
        raise HTTPException(status_code=400, detail="Укажите дату начала")
    stream_type = (body.get("stream_type") or "encoder").strip()
    if stream_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Неверный тип трансляции")

    stream_url = (body.get("stream_url") or "").strip()
    stream_key = (body.get("stream_key") or "").strip()
    # Для encoder автогенерируем RTMP-ссылку и ключ для OBS, если не переданы
    if stream_type == "encoder" and (not stream_url or not stream_key):
        gen_url, gen_key = _gen_encoder_credentials()
        if not stream_url:
            stream_url = gen_url
        if not stream_key:
            stream_key = gen_key

    sid = await execute_returning_id(
        """INSERT INTO streams (channel_id, title, description, starts_at, bg_image_url,
                                  stream_type, embed_url, stream_url, stream_key,
                                  status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$10) RETURNING id""",
        channel["id"], title, (body.get("description") or "").strip(),
        starts_at, (body.get("bg_image_url") or "").strip(),
        stream_type, (body.get("embed_url") or "").strip(),
        stream_url, stream_key,
        user["id"],
    )
    row = await fetch_one(
        "SELECT * FROM streams WHERE id = $1", sid,
    )
    return {"success": True, "stream": _serialize(row)}


@router.put("/{tc}/{stream_id}")
async def update_stream(tc: str, stream_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    existing = await fetch_one("SELECT id FROM streams WHERE id = $1 AND channel_id = $2", stream_id, channel["id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Эфир не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    mapping = {
        "title": "title", "description": "description",
        "bg_image_url": "bg_image_url", "embed_url": "embed_url",
        "stream_url": "stream_url", "stream_key": "stream_key",
    }
    for key, col in mapping.items():
        if key in body:
            fields.append(f"{col} = ${idx}"); params.append((body.get(key) or "").strip()); idx += 1
    if "starts_at" in body:
        dt = _parse_dt(body["starts_at"])
        if not dt:
            raise HTTPException(status_code=400, detail="Неверная дата начала")
        fields.append(f"starts_at = ${idx}"); params.append(dt); idx += 1
    if "stream_type" in body:
        st = (body["stream_type"] or "encoder").strip()
        if st not in _ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail="Неверный тип")
        fields.append(f"stream_type = ${idx}"); params.append(st); idx += 1
        # При переключении на encoder — если нет ключа, генерим
        if st == "encoder":
            cur = await fetch_one("SELECT stream_url, stream_key FROM streams WHERE id = $1", stream_id)
            if cur and not cur.get("stream_key"):
                gen_url, gen_key = _gen_encoder_credentials()
                fields.append(f"stream_url = ${idx}"); params.append(gen_url); idx += 1
                fields.append(f"stream_key = ${idx}"); params.append(gen_key); idx += 1
    if "status" in body:
        status = (body["status"] or "").strip()
        if status not in {"scheduled", "live", "finished"}:
            raise HTTPException(status_code=400, detail="Неверный статус")
        fields.append(f"status = ${idx}"); params.append(status); idx += 1
        if status == "finished":
            fields.append("ended_at = NOW()")
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(stream_id)
    await execute(f"UPDATE streams SET {', '.join(fields)} WHERE id = ${idx}", *params)
    row = await fetch_one("SELECT * FROM streams WHERE id = $1", stream_id)
    return {"success": True, "stream": _serialize(row)}


@router.post("/{tc}/{stream_id}/regenerate-key")
async def regenerate_key(tc: str, stream_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    s = await fetch_one("SELECT id FROM streams WHERE id = $1 AND channel_id = $2", stream_id, channel["id"])
    if not s:
        raise HTTPException(status_code=404, detail="Эфир не найден")
    gen_url, gen_key = _gen_encoder_credentials()
    await execute(
        "UPDATE streams SET stream_url = $1, stream_key = $2, updated_at = NOW() WHERE id = $3",
        gen_url, gen_key, stream_id,
    )
    return {"success": True, "stream_url": gen_url, "stream_key": gen_key}


@router.delete("/{tc}/{stream_id}")
async def delete_stream(tc: str, stream_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("UPDATE content_posts SET stream_id = NULL WHERE stream_id = $1", stream_id)
    await execute("DELETE FROM streams WHERE id = $1 AND channel_id = $2", stream_id, channel["id"])
    return {"success": True}


# ============================================================
# Public API for miniapp
# ============================================================

@rtmp_router.post("/rtmp-auth", include_in_schema=False)
async def rtmp_auth(request: Request):
    """Хук валидации RTMP-публикации от nginx-rtmp on_publish.
    nginx делает POST с form-data name=<stream_key>. Возвращаем 200
    если ключ известен — иначе 403."""
    from fastapi.responses import PlainTextResponse, Response
    form = await request.form()
    key = (form.get("name") or "").strip()
    if not key:
        return Response(status_code=403)
    s = await fetch_one(
        "SELECT id, channel_id FROM streams WHERE stream_key = $1 AND stream_type = 'encoder'",
        key,
    )
    if not s:
        print(f"[RTMP-auth] unknown key={key[:8]}…")
        return Response(status_code=403)
    # Помечаем эфир как live
    await execute("UPDATE streams SET status = 'live', updated_at = NOW() WHERE id = $1", s["id"])
    print(f"[RTMP-auth] stream {s['id']} → live")
    return PlainTextResponse("OK")


@rtmp_router.post("/rtmp-done", include_in_schema=False)
async def rtmp_done(request: Request):
    """Хук остановки трансляции — переводим эфир в finished."""
    from fastapi.responses import PlainTextResponse
    form = await request.form()
    key = (form.get("name") or "").strip()
    if key:
        s = await fetch_one("SELECT id FROM streams WHERE stream_key = $1", key)
        if s:
            await execute(
                "UPDATE streams SET status = 'finished', ended_at = NOW(), updated_at = NOW() WHERE id = $1",
                s["id"],
            )
            print(f"[RTMP-done] stream {s['id']} → finished")
    return PlainTextResponse("OK")


@public_router.get("/{stream_id}")
async def public_get_stream(stream_id: int):
    row = await fetch_one(
        """SELECT s.id, s.title, s.description, s.starts_at, s.ended_at,
                  s.bg_image_url, s.stream_type, s.embed_url, s.stream_url,
                  s.stream_key, s.status, c.title AS channel_title
           FROM streams s JOIN channels c ON c.id = s.channel_id
           WHERE s.id = $1""",
        stream_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Эфир не найден")
    data = _serialize(row)
    # Готовый URL воспроизведения для HLS-плеера в миниаппе
    # (key в HLS играет роль ID потока, не даёт права писать в RTMP)
    if data.get("stream_type") == "encoder" and data.get("stream_key"):
        data["playback_url"] = f"/hls/{data['stream_key']}.m3u8"
    return {"success": True, "stream": data}
