"""Feature visibility — глобальные флаги «показать/coming_soon/hidden» для разделов сервиса.

GET /api/feature-visibility — публичный, отдаёт карту всех флагов
PUT /api/admin/feature-visibility/{key} — admin only, меняет статус
"""
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request

from ..database import fetch_all, fetch_one, execute
from ..middleware.admin_auth import get_current_admin


public_router = APIRouter()
admin_router = APIRouter()


_ALLOWED_STATUSES = {"visible", "coming_soon", "hidden"}


@public_router.get("/")
async def list_visibility():
    """Карта всех разделов и их статусов. Открыто для всех (UI читает чтобы рендерить заглушки)."""
    rows = await fetch_all(
        "SELECT feature_key, title, visibility, coming_soon_message FROM feature_visibility ORDER BY feature_key"
    )
    return {"success": True, "items": rows}


@admin_router.get("/")
async def admin_list(admin: Dict[str, Any] = Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT feature_key, title, visibility, coming_soon_message, updated_at FROM feature_visibility ORDER BY feature_key"
    )
    return {"success": True, "items": rows}


@admin_router.put("/{key}")
async def admin_upsert(key: str, request: Request, admin: Dict[str, Any] = Depends(get_current_admin)):
    body = await request.json()
    visibility = (body.get("visibility") or "visible").strip()
    if visibility not in _ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"visibility должен быть одним из {_ALLOWED_STATUSES}")
    title = (body.get("title") or "").strip()
    msg = (body.get("coming_soon_message") or "Этот раздел скоро появится").strip()

    existing = await fetch_one("SELECT feature_key FROM feature_visibility WHERE feature_key = $1", key)
    if existing:
        await execute(
            """UPDATE feature_visibility
               SET visibility = $1,
                   title = CASE WHEN $2 = '' THEN title ELSE $2 END,
                   coming_soon_message = $3,
                   updated_at = NOW(),
                   updated_by = $4
               WHERE feature_key = $5""",
            visibility, title, msg, admin["id"], key,
        )
    else:
        await execute(
            """INSERT INTO feature_visibility (feature_key, title, visibility, coming_soon_message, updated_by)
               VALUES ($1, $2, $3, $4, $5)""",
            key, title or key, visibility, msg, admin["id"],
        )
    return {"success": True}


@admin_router.delete("/{key}")
async def admin_delete(key: str, admin: Dict[str, Any] = Depends(get_current_admin)):
    await execute("DELETE FROM feature_visibility WHERE feature_key = $1", key)
    return {"success": True}
