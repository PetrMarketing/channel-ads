import asyncio
import json
import os
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id


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

router = APIRouter()

# Columns to return in API responses (excludes file_data BYTEA)
_BC_COLS = "id, channel_id, title, message_text, file_path, file_type, telegram_file_id, target_type, target_lead_magnet_id, status, sent_count, failed_count, total_count, scheduled_at, started_at, completed_at, inline_buttons, attach_type, filter_rules, created_at"


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


async def _save_upload(file) -> tuple:
    """Save uploaded file, return (path, type, data)."""
    from ..services.file_storage import save_upload
    return await save_upload(file)


# NOTE: this route MUST be registered before /{tc} to avoid being shadowed
@router.get("/{tc}/lead-magnets")
async def list_lead_magnets(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    magnets = await fetch_all("SELECT id, channel_id, code, title, message_text, file_path, file_type, telegram_file_id, created_at FROM lead_magnets WHERE channel_id = $1", channel["id"])
    return {"success": True, "leadMagnets": magnets}


@router.get("/{tc}")
async def list_broadcasts(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    broadcasts = await fetch_all(
        f"SELECT {_BC_COLS} FROM broadcasts WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"]
    )
    return {"success": True, "broadcasts": broadcasts}


@router.post("/{tc}")
async def create_broadcast(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    content_type = request.headers.get("content-type", "")
    file_path = None
    file_type = None
    filter_rules = None

    file_data = None
    attach_type = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        title = form.get("title", "")
        message_text = form.get("message_text", "")
        target_type = form.get("target_type", "all_leads")
        target_lead_magnet_id = form.get("target_lead_magnet_id")
        if target_lead_magnet_id:
            target_lead_magnet_id = int(target_lead_magnet_id)
        scheduled_at = form.get("scheduled_at")
        inline_buttons_raw = form.get("inline_buttons")
        inline_buttons = json.dumps(json.loads(inline_buttons_raw)) if inline_buttons_raw else None
        filter_rules_raw = form.get("filter_rules")
        filter_rules = filter_rules_raw if filter_rules_raw else None
        attach_type = form.get("attach_type") or None
        uploaded_file = form.get("file")
        if uploaded_file and hasattr(uploaded_file, "read"):
            file_path, file_type, file_data = await _save_upload(uploaded_file)
    else:
        body = await request.json()
        title = body.get("title", "")
        message_text = body.get("message_text", "")
        target_type = body.get("target_type", "all_leads")
        target_lead_magnet_id = body.get("target_lead_magnet_id")
        if target_lead_magnet_id is not None:
            try:
                target_lead_magnet_id = int(target_lead_magnet_id)
            except (ValueError, TypeError):
                target_lead_magnet_id = None
        scheduled_at = body.get("scheduled_at") or None
        inline_buttons = json.dumps(body["inline_buttons"]) if body.get("inline_buttons") else None
        filter_rules_val = body.get("filter_rules")
        if isinstance(filter_rules_val, str):
            filter_rules = filter_rules_val
        elif filter_rules_val:
            filter_rules = json.dumps(filter_rules_val)
        attach_type = body.get("attach_type") or None

    scheduled_dt = _parse_scheduled_at(scheduled_at)
    status = "scheduled" if scheduled_dt else "draft"

    bc_id = await execute_returning_id(
        """INSERT INTO broadcasts (channel_id, title, message_text, target_type, target_lead_magnet_id, scheduled_at, inline_buttons, file_path, file_type, filter_rules, file_data, attach_type, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id""",
        int(channel["id"]), title or "Рассылка", message_text, target_type, target_lead_magnet_id,
        scheduled_dt, inline_buttons, file_path, file_type, filter_rules, file_data, attach_type, status,
    )
    bc = await fetch_one(f"SELECT {_BC_COLS} FROM broadcasts WHERE id = $1", bc_id)
    return {"success": True, "broadcast": bc}


@router.put("/{tc}/{bc_id}")
async def update_broadcast(tc: str, bc_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
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
        for key in ("title", "message_text", "target_type", "target_lead_magnet_id", "scheduled_at", "filter_rules", "attach_type"):
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
    for key in ("title", "message_text", "target_type", "target_lead_magnet_id", "scheduled_at", "inline_buttons", "filter_rules", "attach_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "inline_buttons" and val:
                val = json.dumps(val) if not isinstance(val, str) else val
            if key == "filter_rules" and val:
                val = json.dumps(val) if not isinstance(val, str) else val
            if key == "target_lead_magnet_id" and val is not None:
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    val = None
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
    # Auto-set status when scheduled_at changes
    if "scheduled_at" in body:
        parsed_sched = _parse_scheduled_at(body["scheduled_at"])
        if parsed_sched:
            fields.append(f"status = ${idx}")
            params.append("scheduled")
            idx += 1
        else:
            fields.append(f"status = ${idx}")
            params.append("draft")
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([bc_id, channel["id"]])
    await execute(f"UPDATE broadcasts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    bc = await fetch_one(f"SELECT {_BC_COLS} FROM broadcasts WHERE id = $1", bc_id)
    return {"success": True, "broadcast": bc}


@router.delete("/{tc}/{bc_id}")
async def delete_broadcast(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    return {"success": True}


@router.post("/{tc}/{bc_id}/send")
async def _count_recipients(channel_id: int, bc: dict) -> int:
    """Count how many recipients a broadcast will reach."""
    target_type = bc.get("target_type", "all_leads")
    if target_type == "all_subscribers":
        row = await fetch_one("SELECT COUNT(*) as cnt FROM subscriptions WHERE channel_id = $1", channel_id)
    elif target_type == "specific_lead_magnet" and bc.get("target_lead_magnet_id"):
        row = await fetch_one("SELECT COUNT(*) as cnt FROM leads WHERE lead_magnet_id = $1", bc["target_lead_magnet_id"])
    else:
        row = await fetch_one(
            "SELECT COUNT(*) as cnt FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)",
            channel_id,
        )
    return row["cnt"] if row else 0


@router.post("/{tc}/count-recipients")
async def count_recipients_with_filters(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Count recipients with filter rules applied."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    filter_rules = body.get("filter_rules", [])

    if filter_rules and isinstance(filter_rules, list) and len(filter_rules) > 0:
        base_query = "SELECT COUNT(*) as cnt FROM leads l WHERE l.lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)"
        query_params = [channel["id"]]
        idx = 2
        for rule in filter_rules:
            rule_type = rule.get("type") or rule.get("field")
            negate = rule.get("negate", False)
            value = rule.get("value", {})
            op_prefix = "NOT " if negate else ""
            if rule_type == "lead_magnet":
                lm_id = value.get("lead_magnet_id") if isinstance(value, dict) else value
                if lm_id:
                    base_query += f" AND l.lead_magnet_id {op_prefix}= ${idx}"
                    query_params.append(int(lm_id))
                    idx += 1
            elif rule_type == "registration_date":
                date_val = value.get("date") if isinstance(value, dict) else value
                direction = value.get("direction", "before") if isinstance(value, dict) else "before"
                if date_val:
                    if negate:
                        cmp = "<=" if direction == "after" else ">="
                    else:
                        cmp = ">=" if direction == "after" else "<="
                    base_query += f" AND l.claimed_at {cmp} ${idx}"
                    query_params.append(_parse_scheduled_at(date_val) or date_val)
                    idx += 1
            elif rule_type == "platform":
                plat_val = value if isinstance(value, str) else (value.get("platform") if isinstance(value, dict) else None)
                if plat_val:
                    base_query += f" AND l.platform {'!=' if negate else '='} ${idx}"
                    query_params.append(plat_val)
                    idx += 1
        row = await fetch_one(base_query, *query_params)
    else:
        row = await fetch_one(
            "SELECT COUNT(*) as cnt FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)",
            channel["id"],
        )
    return {"success": True, "count": row["cnt"] if row else 0}


@router.get("/{tc}/{bc_id}/recipients-count")
async def recipients_count(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Get count of recipients for a broadcast without sending."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    count = await _count_recipients(channel["id"], bc)
    return {"success": True, "count": count}


@router.get("/{tc}/total-recipients")
async def total_recipients(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Get total leads count for channel (default recipient pool)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    row = await fetch_one(
        "SELECT COUNT(*) as cnt FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)",
        channel["id"],
    )
    subs = await fetch_one("SELECT COUNT(*) as cnt FROM subscriptions WHERE channel_id = $1", channel["id"])
    return {"success": True, "leads": row["cnt"] if row else 0, "subscribers": subs["cnt"] if subs else 0}


@router.post("/{tc}/{bc_id}/send")
async def send_broadcast(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if bc.get("status") in ("sending", "completed"):
        raise HTTPException(status_code=400, detail="Рассылка уже отправляется или завершена")

    # Mark as sending (with status check to prevent race condition)
    await execute(
        "UPDATE broadcasts SET status = 'sending', started_at = NOW() WHERE id = $1 AND status NOT IN ('sending', 'completed')",
        bc_id,
    )

    # Determine recipients
    filter_rules_raw = bc.get("filter_rules")
    filter_rules = None
    if filter_rules_raw:
        try:
            filter_rules = json.loads(filter_rules_raw) if isinstance(filter_rules_raw, str) else filter_rules_raw
        except (json.JSONDecodeError, TypeError):
            filter_rules = None

    if filter_rules and isinstance(filter_rules, (dict, list)):
        # Apply filter rules to narrow recipients
        base_query = "SELECT l.* FROM leads l WHERE l.lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)"
        query_params = [channel["id"]]
        idx = 2

        # Support both frontend format {type, negate, value} and legacy {field, operator, value}
        if isinstance(filter_rules, list):
            for rule in filter_rules:
                rule_type = rule.get("type") or rule.get("field")
                negate = rule.get("negate", False)
                value = rule.get("value", {})
                op_prefix = "NOT " if negate else ""

                if rule_type == "lead_magnet":
                    lm_id = value.get("lead_magnet_id") if isinstance(value, dict) else value
                    if lm_id:
                        base_query += f" AND l.lead_magnet_id {op_prefix}= ${idx}"
                        query_params.append(int(lm_id))
                        idx += 1
                elif rule_type == "registration_date":
                    if isinstance(value, dict):
                        date_val = value.get("date")
                        direction = value.get("direction", "before")
                    else:
                        date_val = value
                        direction = rule.get("operator", "before")
                    if date_val:
                        if negate:
                            # Negate: flip direction
                            cmp = "<=" if direction == "after" else ">="
                        else:
                            cmp = ">=" if direction == "after" else "<="
                        base_query += f" AND l.claimed_at {cmp} ${idx}"
                        query_params.append(_parse_scheduled_at(date_val) or date_val)
                        idx += 1
                elif rule_type == "platform":
                    plat_val = value if isinstance(value, str) else (value.get("platform") if isinstance(value, dict) else None)
                    if plat_val:
                        if negate:
                            base_query += f" AND l.platform != ${idx}"
                        else:
                            base_query += f" AND l.platform = ${idx}"
                        query_params.append(plat_val)
                        idx += 1
                elif rule_type == "giveaway_participant":
                    gw_id = value.get("giveaway_id") if isinstance(value, dict) else None
                    gp_filter = ""
                    if gw_id:
                        gp_filter = f" AND gp.giveaway_id = ${idx}"
                        query_params.append(int(gw_id))
                        idx += 1
                    sub = (
                        f"(SELECT 1 FROM giveaway_participants gp "
                        f"WHERE (gp.telegram_id = l.telegram_id OR gp.max_user_id = l.max_user_id){gp_filter})"
                    )
                    if negate:
                        base_query += f" AND NOT EXISTS {sub}"
                    else:
                        base_query += f" AND EXISTS {sub}"
        elif isinstance(filter_rules, dict):
            if filter_rules.get("platform"):
                base_query += f" AND l.platform = ${idx}"
                query_params.append(filter_rules["platform"])
                idx += 1
            if filter_rules.get("lead_magnet_id"):
                base_query += f" AND l.lead_magnet_id = ${idx}"
                query_params.append(int(filter_rules["lead_magnet_id"]))
                idx += 1
            if filter_rules.get("claimed_after"):
                base_query += f" AND l.claimed_at >= ${idx}"
                query_params.append(_parse_scheduled_at(filter_rules["claimed_after"]) or filter_rules["claimed_after"])
                idx += 1
            if filter_rules.get("claimed_before"):
                base_query += f" AND l.claimed_at <= ${idx}"
                query_params.append(_parse_scheduled_at(filter_rules["claimed_before"]) or filter_rules["claimed_before"])
                idx += 1

        leads = await fetch_all(base_query, *query_params)
    elif bc.get("target_type") == "all_leads":
        leads = await fetch_all(
            "SELECT * FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)",
            channel["id"],
        )
    else:
        leads = await fetch_all("SELECT * FROM leads WHERE lead_magnet_id = $1", bc.get("target_lead_magnet_id"))

    # Restore file from DB if missing on disk
    from ..services.file_storage import ensure_file
    bc_file_path = ensure_file(bc.get("file_path"), bc.get("file_data"))

    # Send in background
    async def _do_send():
        from ..services.messenger import send_to_user
        sent = 0
        failed = 0
        # Cache file IDs after first successful send to avoid re-uploading
        cached_tg_file_id = bc.get("telegram_file_id")
        cached_max_token = bc.get("max_file_token")
        for lead in leads:
            try:
                uid = lead.get("telegram_id") or lead.get("max_user_id")
                plat = lead.get("platform", "telegram")
                if uid:
                    result = await send_to_user(
                        user_id=uid, platform=plat,
                        text=bc.get("message_text", ""),
                        file_path=bc_file_path, file_type=bc.get("file_type"),
                        telegram_file_id=cached_tg_file_id,
                        inline_buttons=bc.get("inline_buttons"),
                        attach_type=bc.get("attach_type"),
                        max_file_token=cached_max_token,
                    )
                    sent += 1
                    # Record recipient for edit/delete tracking
                    msg_id = None
                    if isinstance(result, dict):
                        msg_id = (result.get("result", {}).get("message_id")
                                  or result.get("data", {}).get("body", {}).get("mid"))
                    try:
                        await execute(
                            "INSERT INTO broadcast_recipients (broadcast_id, lead_id, telegram_id, max_user_id, platform, message_id) VALUES ($1,$2,$3,$4,$5,$6)",
                            bc_id, lead.get("id"), lead.get("telegram_id"), lead.get("max_user_id"), plat, str(msg_id) if msg_id else None,
                        )
                    except Exception:
                        pass
                    # Extract and cache file IDs from first successful send
                    if isinstance(result, dict) and bc_file_path:
                        if plat == "telegram" and not cached_tg_file_id:
                            r = result.get("result", {})
                            for key in ("document", "photo", "video", "audio", "voice", "video_note"):
                                obj = r.get(key)
                                if obj:
                                    fid = obj.get("file_id") if isinstance(obj, dict) else (obj[-1].get("file_id") if isinstance(obj, list) and obj else None)
                                    if fid:
                                        cached_tg_file_id = fid
                                        break
                        elif plat == "max" and not cached_max_token:
                            body = result.get("data", result) if isinstance(result, dict) else {}
                            for att in (body.get("body", {}).get("attachments") or body.get("attachments") or []):
                                tok = att.get("payload", {}).get("token")
                                if tok:
                                    cached_max_token = tok
                                    break
                else:
                    failed += 1
                await asyncio.sleep(0.05)
            except Exception:
                failed += 1
        # Persist cached file IDs for future sends
        if cached_tg_file_id and cached_tg_file_id != bc.get("telegram_file_id"):
            await execute("UPDATE broadcasts SET telegram_file_id = $1 WHERE id = $2", cached_tg_file_id, bc_id)
        if cached_max_token and cached_max_token != bc.get("max_file_token"):
            await execute("UPDATE broadcasts SET max_file_token = $1 WHERE id = $2", cached_max_token, bc_id)
        await execute(
            "UPDATE broadcasts SET status = 'completed', completed_at = NOW(), sent_count = $1, failed_count = $2, total_count = $3 WHERE id = $4",
            sent, failed, len(leads), bc_id,
        )

    asyncio.create_task(_do_send())
    return {"success": True, "total": len(leads)}


@router.get("/{tc}/{bc_id}/status")
async def broadcast_status(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one(f"SELECT {_BC_COLS} FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    return {"success": True, "broadcast": bc}


@router.post("/{tc}/{bc_id}/send-test")
async def send_test(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Send broadcast to the current user for preview."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    uid = user.get("telegram_id") or user.get("max_user_id")
    platform = "max" if user.get("max_user_id") and not user.get("telegram_id") else "telegram"
    if not uid:
        raise HTTPException(status_code=400, detail="У вас не привязан мессенджер")

    bc_file_path = bc.get("file_path")
    if bc_file_path and not os.path.exists(bc_file_path):
        from ..services.file_storage import ensure_file
        bc_file_path = ensure_file(bc_file_path, bc.get("file_data"))

    from ..services.messenger import send_to_user
    await send_to_user(
        user_id=uid, platform=platform,
        text=bc.get("message_text", ""),
        file_path=bc_file_path, file_type=bc.get("file_type"),
        inline_buttons=bc.get("inline_buttons"),
        attach_type=bc.get("attach_type"),
    )
    return {"success": True}


@router.get("/{tc}/{bc_id}/stats")
async def broadcast_stats(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Get broadcast delivery statistics."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one(f"SELECT {_BC_COLS} FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    recipients = await fetch_all(
        "SELECT status, COUNT(*) as count FROM broadcast_recipients WHERE broadcast_id = $1 GROUP BY status", bc_id
    )
    stats = {r["status"]: r["count"] for r in recipients}

    return {
        "success": True,
        "stats": {
            "sent": bc.get("sent_count", 0),
            "failed": bc.get("failed_count", 0),
            "total": bc.get("total_count", 0),
            "delivered": stats.get("sent", 0),
        },
    }


@router.post("/{tc}/{bc_id}/copy")
async def copy_broadcast(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Duplicate broadcast as a new draft."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    new_id = await execute_returning_id(
        """INSERT INTO broadcasts (channel_id, title, message_text, target_audience, scheduled_at,
           file_path, file_type, file_data, inline_buttons, attach_type, status)
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, 'draft') RETURNING id""",
        channel["id"], f"Копия: {bc.get('title', '')}", bc.get("message_text", ""),
        bc.get("target_audience", "all"),
        bc.get("file_path"), bc.get("file_type"), bc.get("file_data"),
        bc.get("inline_buttons"), bc.get("attach_type"),
    )
    return {"success": True, "id": new_id}


@router.post("/{tc}/{bc_id}/copy-to/{target_tc}")
async def copy_to_channel(tc: str, bc_id: int, target_tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Copy broadcast to another channel as draft."""
    channel = await _get_owned_channel(tc, user["id"])
    target = await _get_owned_channel(target_tc, user["id"])
    if not channel or not target:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    new_id = await execute_returning_id(
        """INSERT INTO broadcasts (channel_id, title, message_text, target_audience,
           file_path, file_type, file_data, inline_buttons, attach_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING id""",
        target["id"], bc.get("title", ""), bc.get("message_text", ""),
        bc.get("target_audience", "all"),
        bc.get("file_path"), bc.get("file_type"), bc.get("file_data"),
        bc.get("inline_buttons"), bc.get("attach_type"),
    )
    return {"success": True, "id": new_id}


@router.post("/{tc}/{bc_id}/edit-sent")
async def edit_sent_messages(tc: str, bc_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Edit all sent messages for a broadcast."""
    import aiohttp as _aiohttp

    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    body = await request.json()
    new_text = body.get("message_text", "").strip()
    if not new_text:
        raise HTTPException(status_code=400, detail="Текст сообщения обязателен")

    recipients = await fetch_all(
        "SELECT * FROM broadcast_recipients WHERE broadcast_id = $1 AND message_id IS NOT NULL", bc_id
    )

    edited = 0
    failed = 0

    for r in recipients:
        msg_id = r.get("message_id")
        if not msg_id:
            continue
        try:
            platform = r.get("platform", "telegram")
            if platform == "telegram":
                chat_id = r.get("telegram_id")
                if not chat_id:
                    failed += 1
                    continue
                token = settings.TELEGRAM_BOT_TOKEN
                url = f"https://api.telegram.org/bot{token}/editMessageText"
                async with _aiohttp.ClientSession() as session:
                    async with session.post(url, json={
                        "chat_id": int(chat_id),
                        "message_id": int(msg_id),
                        "text": new_text,
                        "parse_mode": "HTML",
                    }) as resp:
                        if resp.status == 200:
                            edited += 1
                        else:
                            failed += 1
            elif platform == "max":
                from ..services.max_api import get_max_api
                max_api = get_max_api()
                if not max_api:
                    failed += 1
                    continue
                result = await max_api._request("PUT", f"messages?message_id={msg_id}", json={"text": new_text})
                if result.get("success"):
                    edited += 1
                else:
                    failed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"[edit-sent] Error editing message {msg_id}: {e}")
            failed += 1

    # Update broadcast message_text in DB
    await execute("UPDATE broadcasts SET message_text = $1 WHERE id = $2", new_text, bc_id)

    return {"success": True, "edited": edited, "failed": failed}


@router.post("/{tc}/{bc_id}/delete-sent")
async def delete_sent_messages(tc: str, bc_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Delete all sent messages for a broadcast."""
    import aiohttp as _aiohttp

    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    bc = await fetch_one("SELECT * FROM broadcasts WHERE id = $1 AND channel_id = $2", bc_id, channel["id"])
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")

    recipients = await fetch_all(
        "SELECT * FROM broadcast_recipients WHERE broadcast_id = $1 AND message_id IS NOT NULL", bc_id
    )

    deleted = 0
    failed = 0

    for r in recipients:
        msg_id = r.get("message_id")
        if not msg_id:
            continue
        try:
            platform = r.get("platform", "telegram")
            if platform == "telegram":
                chat_id = r.get("telegram_id")
                if not chat_id:
                    failed += 1
                    continue
                token = settings.TELEGRAM_BOT_TOKEN
                url = f"https://api.telegram.org/bot{token}/deleteMessage"
                async with _aiohttp.ClientSession() as session:
                    async with session.post(url, json={
                        "chat_id": int(chat_id),
                        "message_id": int(msg_id),
                    }) as resp:
                        if resp.status == 200:
                            deleted += 1
                        else:
                            failed += 1
            elif platform == "max":
                from ..services.max_api import get_max_api
                max_api = get_max_api()
                if not max_api:
                    failed += 1
                    continue
                result = await max_api._request("DELETE", f"messages?message_id={msg_id}")
                if result.get("success"):
                    deleted += 1
                else:
                    failed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"[delete-sent] Error deleting message {msg_id}: {e}")
            failed += 1

    return {"success": True, "deleted": deleted, "failed": failed}
