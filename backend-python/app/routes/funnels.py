import json
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

_LM_COLS = "id, channel_id, code, title, message_text, file_path, file_type, telegram_file_id, created_at"
_STEP_COLS = "id, channel_id, lead_magnet_id, step_number, delay_minutes, message_text, file_path, file_type, telegram_file_id, is_active, inline_buttons, attach_type, delay_type, delay_config, created_at"


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "funnels")


async def _save_upload(file) -> tuple:
    """Save uploaded file, return (path, type, data)."""
    from ..services.file_storage import save_upload
    return await save_upload(file)


@router.get("/{tc}")
async def list_funnels(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    magnets = await fetch_all(f"SELECT {_LM_COLS} FROM lead_magnets WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    result = []
    for lm in magnets:
        steps = await fetch_all(
            f"SELECT {_STEP_COLS} FROM funnel_steps WHERE lead_magnet_id = $1 ORDER BY step_number", lm["id"]
        )
        lm_dict = dict(lm)
        lm_dict["steps"] = steps
        result.append(lm_dict)
    return {"success": True, "funnels": result}


@router.post("/{tc}/{lm_id}/steps")
async def create_step(tc: str, lm_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    lm = await fetch_one(f"SELECT {_LM_COLS} FROM lead_magnets WHERE id = $1 AND channel_id = $2", lm_id, channel["id"])
    if not lm:
        raise HTTPException(status_code=404, detail="Лид-магнит не найден")

    content_type = request.headers.get("content-type", "")
    file_path = None
    file_type = None
    file_data = None
    delay_type = "after_minutes"
    delay_config = None

    attach_type = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        delay_minutes = int(form.get("delay_minutes", 60))
        message_text = form.get("message_text", "")
        inline_buttons_raw = form.get("inline_buttons")
        inline_buttons = json.dumps(json.loads(inline_buttons_raw)) if inline_buttons_raw else None
        delay_type = form.get("delay_type", "after_minutes")
        delay_config_raw = form.get("delay_config")
        delay_config = delay_config_raw if delay_config_raw else None
        attach_type = form.get("attach_type") or None
        uploaded_file = form.get("file")
        if uploaded_file and hasattr(uploaded_file, "read"):
            file_path, file_type, file_data = await _save_upload(uploaded_file)
    else:
        body = await request.json()
        delay_minutes = body.get("delay_minutes", 60)
        message_text = body.get("message_text", "")
        inline_buttons = json.dumps(body["inline_buttons"]) if body.get("inline_buttons") else None
        delay_type = body.get("delay_type", "after_minutes")
        delay_config = json.dumps(body["delay_config"]) if body.get("delay_config") else None
        attach_type = body.get("attach_type") or None

    # Get next step number
    last = await fetch_one("SELECT MAX(step_number) as max_num FROM funnel_steps WHERE lead_magnet_id = $1", lm_id)
    step_number = (last["max_num"] or 0) + 1 if last else 1

    step_id = await execute_returning_id(
        """INSERT INTO funnel_steps (channel_id, lead_magnet_id, step_number, delay_minutes, message_text, inline_buttons, file_path, file_type, delay_type, delay_config, file_data, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id""",
        channel["id"], lm_id, step_number, delay_minutes, message_text, inline_buttons,
        file_path, file_type, delay_type, delay_config, file_data, attach_type,
    )
    step = await fetch_one(f"SELECT {_STEP_COLS} FROM funnel_steps WHERE id = $1", step_id)
    return {"success": True, "step": step}


@router.put("/{tc}/{lm_id}/steps/{step_id}")
async def update_step(tc: str, lm_id: int, step_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
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
        for key in ("delay_minutes", "message_text", "is_active", "delay_type", "delay_config", "attach_type"):
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
    for key in ("delay_minutes", "message_text", "is_active", "inline_buttons", "delay_type", "delay_config", "attach_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "inline_buttons" and val:
                val = json.dumps(val)
            if key == "delay_config" and isinstance(val, dict):
                val = json.dumps(val)
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
    if not fields:
        return {"success": True}
    params.extend([step_id, lm_id])
    await execute(f"UPDATE funnel_steps SET {', '.join(fields)} WHERE id = ${idx} AND lead_magnet_id = ${idx+1}", *params)
    step = await fetch_one(f"SELECT {_STEP_COLS} FROM funnel_steps WHERE id = $1", step_id)
    return {"success": True, "step": step}


@router.delete("/{tc}/{lm_id}/steps/{step_id}")
async def delete_step(tc: str, lm_id: int, step_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    step = await fetch_one(f"SELECT {_STEP_COLS} FROM funnel_steps WHERE id = $1 AND lead_magnet_id = $2", step_id, lm_id)
    if not step:
        raise HTTPException(status_code=404, detail="Шаг не найден")

    await execute("DELETE FROM funnel_steps WHERE id = $1", step_id)

    # Renumber remaining steps
    remaining = await fetch_all(
        "SELECT id FROM funnel_steps WHERE lead_magnet_id = $1 ORDER BY step_number", lm_id
    )
    for i, s in enumerate(remaining, 1):
        await execute("UPDATE funnel_steps SET step_number = $1 WHERE id = $2", i, s["id"])

    return {"success": True}


@router.post("/{tc}/{lm_id}/steps/{step_id}/copy")
async def copy_step(tc: str, lm_id: int, step_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Duplicate a funnel step."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    step = await fetch_one("SELECT * FROM funnel_steps WHERE id = $1 AND lead_magnet_id = $2", step_id, lm_id)
    if not step:
        raise HTTPException(status_code=404, detail="Шаг не найден")

    max_num = await fetch_one("SELECT MAX(step_number) as m FROM funnel_steps WHERE lead_magnet_id = $1", lm_id)
    new_num = (max_num["m"] or 0) + 1

    new_id = await execute_returning_id(
        """INSERT INTO funnel_steps (lead_magnet_id, channel_id, step_number, delay_minutes, message_text,
           file_path, file_type, file_data, inline_buttons, attach_type, delay_config)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id""",
        lm_id, channel["id"], new_num, step.get("delay_minutes", 0),
        step.get("message_text", ""),
        step.get("file_path"), step.get("file_type"), step.get("file_data"),
        step.get("inline_buttons"), step.get("attach_type"), step.get("delay_config"),
    )
    return {"success": True, "id": new_id}
