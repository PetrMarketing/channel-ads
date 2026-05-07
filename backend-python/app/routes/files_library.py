"""Эндпоинты для вкладки «Мои файлы»:
- Ваши файлы (вложения постов канала, до 50 шт)
- Генерации текста (ai_generations kind=text, до 50)
- Генерации фото (ai_generations kind=image, до 50)
"""
import json as _json
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, fetch_one, fetch_all
from ..middleware.auth import get_current_user

router = APIRouter()
MAX_LIMIT = 50


async def _get_owned_channel(tc: str, user_id: int) -> Optional[Dict[str, Any]]:
    return await fetch_one(
        "SELECT id, title FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tc, user_id,
    )


def _file_size_bytes(path: str) -> int:
    if not path:
        return 0
    real = path if os.path.isabs(path) else os.path.join("/app", path.lstrip("/"))
    try:
        return os.path.getsize(real) if os.path.exists(real) else 0
    except Exception:
        return 0


def _normalize_url(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    if p.startswith("/uploads/") or p.startswith("http"):
        return p
    base = os.path.basename(p)
    return f"/uploads/{base}" if base else None


@router.get("/{tc}/files")
async def list_user_files(
    tc: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Файлы из content_posts канала — вложения, которые пользователь
    добавлял в посты."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        """SELECT id, title, file_path, file_type, status, created_at
           FROM content_posts
           WHERE channel_id = $1 AND file_path IS NOT NULL AND file_path <> ''
           ORDER BY created_at DESC
           LIMIT $2""",
        channel["id"], MAX_LIMIT,
    )
    items = []
    for r in rows:
        url = _normalize_url(r.get("file_path"))
        items.append({
            "id": r["id"],
            "title": r.get("title") or "—",
            "file_url": url,
            "file_type": r.get("file_type") or "file",
            "status": r.get("status") or "draft",
            "size_bytes": _file_size_bytes(r.get("file_path") or ""),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"success": True, "items": items, "total": len(items), "limit": MAX_LIMIT}


@router.get("/{tc}/text-generations")
async def list_text_generations(
    tc: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Сгенерированные тексты (ai_generations kind='text')."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        """SELECT id, prompt, result_text, tokens_charged, metadata, created_at
           FROM ai_generations
           WHERE channel_id = $1 AND kind = 'text'
           ORDER BY created_at DESC
           LIMIT $2""",
        channel["id"], MAX_LIMIT,
    )
    items = []
    for r in rows:
        meta = r.get("metadata")
        if isinstance(meta, str):
            try: meta = _json.loads(meta)
            except Exception: meta = {}
        items.append({
            "id": r["id"],
            "prompt": r.get("prompt") or "",
            "text": r.get("result_text") or "",
            "tokens": int(r.get("tokens_charged") or 0),
            "metadata": meta or {},
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"success": True, "items": items, "total": len(items), "limit": MAX_LIMIT}


@router.get("/{tc}/image-generations")
async def list_image_generations(
    tc: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Сгенерированные картинки (ai_generations kind='image')."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        """SELECT id, prompt, result_file_path, tokens_charged, metadata, created_at
           FROM ai_generations
           WHERE channel_id = $1 AND kind = 'image'
           ORDER BY created_at DESC
           LIMIT $2""",
        channel["id"], MAX_LIMIT,
    )
    items = []
    for r in rows:
        meta = r.get("metadata")
        if isinstance(meta, str):
            try: meta = _json.loads(meta)
            except Exception: meta = {}
        url = _normalize_url(r.get("result_file_path"))
        items.append({
            "id": r["id"],
            "prompt": r.get("prompt") or "",
            "image_url": url,
            "tokens": int(r.get("tokens_charged") or 0),
            "metadata": meta or {},
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"success": True, "items": items, "total": len(items), "limit": MAX_LIMIT}


@router.delete("/{tc}/text-generations/{gen_id}")
async def delete_text_generation(
    tc: str, gen_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM ai_generations WHERE id = $1 AND channel_id = $2 AND user_id = $3 AND kind = 'text'",
        gen_id, channel["id"], user["id"],
    )
    return {"success": True}


@router.delete("/{tc}/image-generations/{gen_id}")
async def delete_image_generation(
    tc: str, gen_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    # Удаляем файл с диска
    row = await fetch_one(
        "SELECT result_file_path FROM ai_generations WHERE id = $1 AND channel_id = $2 AND user_id = $3 AND kind = 'image'",
        gen_id, channel["id"], user["id"],
    )
    if row and row.get("result_file_path"):
        fp = row["result_file_path"]
        real = fp if os.path.isabs(fp) else os.path.join("/app", fp.lstrip("/"))
        try:
            if os.path.exists(real):
                os.remove(real)
        except Exception as e:
            print(f"[FilesLib] file remove failed {real}: {e}")
    await execute(
        "DELETE FROM ai_generations WHERE id = $1 AND channel_id = $2 AND user_id = $3 AND kind = 'image'",
        gen_id, channel["id"], user["id"],
    )
    return {"success": True}
