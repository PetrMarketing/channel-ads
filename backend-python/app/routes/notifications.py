import json
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


# --- Templates ---

@router.get("/{tc}/templates")
async def list_templates(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    templates = await fetch_all(
        "SELECT * FROM notification_templates WHERE channel_id = $1 ORDER BY event_type", channel["id"]
    )
    return {"success": True, "templates": templates}


@router.post("/{tc}/templates")
async def create_template(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    tid = await execute_returning_id(
        """INSERT INTO notification_templates (channel_id, event_type, template_text, send_via, delay_minutes, is_active)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
        channel["id"], body.get("event_type", ""), body.get("template_text", ""),
        body.get("send_via", "bot"), body.get("delay_minutes", 0), body.get("is_active", 1),
    )
    return {"success": True, "templateId": tid}


@router.put("/{tc}/templates/{tmpl_id}")
async def update_template(tc: str, tmpl_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("event_type", "template_text", "send_via", "delay_minutes", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([tmpl_id, channel["id"]])
    await execute(f"UPDATE notification_templates SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/templates/{tmpl_id}")
async def delete_template(tc: str, tmpl_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM notification_templates WHERE id = $1 AND channel_id = $2", tmpl_id, channel["id"])
    return {"success": True}


# --- Notification Log ---

@router.get("/{tc}/log")
async def list_log(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    log = await fetch_all(
        "SELECT * FROM notification_log WHERE channel_id = $1 ORDER BY sent_at DESC LIMIT 200",
        channel["id"],
    )
    return {"success": True, "log": log}


@router.get("/{tc}/stats")
async def notification_stats(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    total = await fetch_one("SELECT COUNT(*) as count FROM notification_log WHERE channel_id = $1", channel["id"])
    sent = await fetch_one("SELECT COUNT(*) as count FROM notification_log WHERE channel_id = $1 AND status = 'sent'", channel["id"])
    failed = await fetch_one("SELECT COUNT(*) as count FROM notification_log WHERE channel_id = $1 AND status = 'failed'", channel["id"])
    return {
        "success": True,
        "total": total["count"] if total else 0,
        "sent": sent["count"] if sent else 0,
        "failed": failed["count"] if failed else 0,
    }


# --- Send notification ---

@router.post("/{tc}/send")
async def send_notification(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    client_id = body.get("client_id")
    message_text = body.get("message_text", "")

    client = await fetch_one("SELECT * FROM clients WHERE id = $1", client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    from ..services.messenger import send_to_user
    try:
        uid = client.get("telegram_id") or client.get("max_user_id")
        plat = client.get("platform", "telegram")
        if uid:
            await send_to_user(user_id=uid, platform=plat, text=message_text)
        await execute(
            "INSERT INTO notification_log (channel_id, client_id, event_type, message_text, status) VALUES ($1,$2,'manual',$3,'sent')",
            channel["id"], client_id, message_text,
        )
        return {"success": True}
    except Exception as e:
        await execute(
            "INSERT INTO notification_log (channel_id, client_id, event_type, message_text, status, error) VALUES ($1,$2,'manual',$3,'failed',$4)",
            channel["id"], client_id, message_text, str(e),
        )
        return {"success": False, "error": str(e)}


@router.post("/{tc}/send-bulk")
async def send_bulk_notification(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    client_ids = body.get("client_ids", [])
    message_text = body.get("message_text", "")
    sent = 0
    failed = 0

    from ..services.messenger import send_to_user
    import asyncio

    for cid in client_ids:
        client = await fetch_one("SELECT * FROM clients WHERE id = $1", cid)
        if not client:
            continue
        try:
            uid = client.get("telegram_id") or client.get("max_user_id")
            plat = client.get("platform", "telegram")
            if uid:
                await send_to_user(user_id=uid, platform=plat, text=message_text)
                sent += 1
            await asyncio.sleep(0.05)
        except Exception:
            failed += 1

    return {"success": True, "sent": sent, "failed": failed}
