import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

# Columns to return in API responses (excludes file_data BYTEA)
_LM_COLS = "id, channel_id, code, title, message_text, file_path, file_type, telegram_file_id, attach_type, subscribers_only, created_at"
_PIN_COLS = "id, channel_id, title, message_text, status, telegram_message_id, lead_magnet_id, inline_buttons, file_path, file_type, button_type, lm_button_text, attach_type, created_at, published_at"


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


async def _save_upload(file: UploadFile) -> tuple:
    """Save uploaded file, return (path, type, data)."""
    from ..services.file_storage import save_upload
    return await save_upload(file)


# --- Lead magnets ---

@router.get("/{tc}/lead-magnets")
async def list_lead_magnets(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    magnets = await fetch_all(f"SELECT {_LM_COLS} FROM lead_magnets WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    return {"success": True, "leadMagnets": magnets}


@router.post("/{tc}/lead-magnets")
async def create_lead_magnet(
    tc: str,
    title: str = Form(...),
    message_text: str = Form(""),
    attach_type: Optional[str] = Form(None),
    subscribers_only: Optional[str] = Form("false"),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    code = secrets.token_hex(6)
    file_path = None
    file_type = None
    file_data = None
    if file and file.filename:
        file_path, file_type, file_data = await _save_upload(file)

    subs_only = subscribers_only in ("true", "1", "on", True)
    lm_id = await execute_returning_id(
        """INSERT INTO lead_magnets (channel_id, code, title, message_text, file_path, file_type, file_data, attach_type, subscribers_only)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        int(channel["id"]), code, title, message_text or "", file_path, file_type, file_data,
        attach_type or None, subs_only,
    )
    magnet = await fetch_one(f"SELECT {_LM_COLS} FROM lead_magnets WHERE id = $1", lm_id)
    return {"success": True, "leadMagnet": magnet}


@router.put("/{tc}/lead-magnets/{lm_id}")
async def update_lead_magnet(
    tc: str,
    lm_id: int,
    title: str = Form(...),
    message_text: str = Form(""),
    attach_type: Optional[str] = Form(None),
    subscribers_only: Optional[str] = Form("false"),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    existing = await fetch_one("SELECT id FROM lead_magnets WHERE id = $1 AND channel_id = $2", lm_id, channel["id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Лид-магнит не найден")

    subs_only = subscribers_only in ("true", "1", "on", True)
    if file and file.filename:
        file_path, file_type, file_data = await _save_upload(file)
        await execute(
            "UPDATE lead_magnets SET title=$1, message_text=$2, file_path=$3, file_type=$4, file_data=$5, attach_type=$6, subscribers_only=$7, telegram_file_id=NULL, max_file_token=NULL WHERE id=$8",
            title, message_text or "", file_path, file_type, file_data, attach_type or None, subs_only, lm_id,
        )
    else:
        await execute(
            "UPDATE lead_magnets SET title=$1, message_text=$2, attach_type=$3, subscribers_only=$4 WHERE id=$5",
            title, message_text or "", attach_type or None, subs_only, lm_id,
        )

    magnet = await fetch_one(f"SELECT {_LM_COLS} FROM lead_magnets WHERE id = $1", lm_id)
    return {"success": True, "leadMagnet": magnet}


@router.delete("/{tc}/lead-magnets/{lm_id}")
async def delete_lead_magnet(tc: str, lm_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    existing = await fetch_one("SELECT id FROM lead_magnets WHERE id = $1 AND channel_id = $2", lm_id, channel["id"])
    if not existing:
        raise HTTPException(status_code=404, detail="Лид-магнит не найден")

    await execute("DELETE FROM lead_magnets WHERE id = $1 AND channel_id = $2", lm_id, channel["id"])
    return {"success": True}


# --- Pin posts ---

@router.get("/{tc}")
async def list_pins(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    pins = await fetch_all(f"""
        SELECT {', '.join('pp.' + c.strip() for c in _PIN_COLS.split(','))}, lm.title as lm_title, lm.code as lm_code
        FROM pin_posts pp
        LEFT JOIN lead_magnets lm ON lm.id = pp.lead_magnet_id
        WHERE pp.channel_id = $1 ORDER BY pp.created_at DESC
    """, channel["id"])
    return {"success": True, "pins": pins}


@router.post("/{tc}")
async def create_pin_json(tc: str, request_body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    title = request_body.get("title", "")
    message_text = request_body.get("message_text", "")
    lead_magnet_id = request_body.get("lead_magnet_id")
    inline_buttons = request_body.get("inline_buttons")
    attach_type = request_body.get("attach_type") or None

    if not title:
        raise HTTPException(status_code=400, detail="Название обязательно")

    import json
    if lead_magnet_id is not None:
        try:
            lead_magnet_id = int(lead_magnet_id)
        except (ValueError, TypeError):
            lead_magnet_id = None

    pin_id = await execute_returning_id(
        """INSERT INTO pin_posts (channel_id, title, message_text, lead_magnet_id, inline_buttons, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
        channel["id"], title, message_text, lead_magnet_id,
        json.dumps(inline_buttons) if inline_buttons else None, attach_type,
    )
    pin = await fetch_one(f"SELECT {_PIN_COLS} FROM pin_posts WHERE id = $1", pin_id)
    return {"success": True, "pin": pin}


@router.post("/{tc}/upload")
async def create_pin_upload(
    tc: str,
    title: str = Form(...),
    message_text: str = Form(""),
    lead_magnet_id: Optional[str] = Form(None),
    inline_buttons: Optional[str] = Form(None),
    attach_type: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    if not title:
        raise HTTPException(status_code=400, detail="Название обязательно")

    import json
    lm_id = None
    if lead_magnet_id and lead_magnet_id.strip():
        try:
            lm_id = int(lead_magnet_id)
        except (ValueError, TypeError):
            lm_id = None

    parsed_buttons = None
    if inline_buttons and inline_buttons.strip():
        try:
            parsed_buttons = json.dumps(json.loads(inline_buttons))
        except Exception:
            parsed_buttons = None

    file_path = None
    file_type = None
    file_data = None
    if file and file.filename:
        file_path, file_type, file_data = await _save_upload(file)

    pin_id = await execute_returning_id(
        """INSERT INTO pin_posts (channel_id, title, message_text, lead_magnet_id, inline_buttons, file_path, file_type, file_data, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        channel["id"], title, message_text, lm_id, parsed_buttons, file_path, file_type, file_data,
        attach_type or None,
    )
    pin = await fetch_one(f"SELECT {_PIN_COLS} FROM pin_posts WHERE id = $1", pin_id)
    return {"success": True, "pin": pin}


@router.put("/{tc}/{pin_id}")
async def update_pin(tc: str, pin_id: int, body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    import json
    fields = []
    params = []
    idx = 1
    for key in ("title", "message_text", "lead_magnet_id", "inline_buttons", "attach_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "inline_buttons" and val:
                val = json.dumps(val)
            if key == "lead_magnet_id" and val is not None:
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    val = None
            params.append(val)
            idx += 1
    # Handle file removal
    if body.get("remove_file"):
        fields.append(f"file_path = ${idx}")
        params.append(None)
        idx += 1
        fields.append(f"file_type = ${idx}")
        params.append(None)
        idx += 1
        fields.append(f"file_data = ${idx}")
        params.append(None)
        idx += 1
        fields.append(f"max_file_token = ${idx}")
        params.append(None)
        idx += 1

    if not fields:
        return {"success": True}
    params.extend([pin_id, channel["id"]])
    await execute(f"UPDATE pin_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    pin = await fetch_one(f"SELECT {_PIN_COLS} FROM pin_posts WHERE id = $1", pin_id)
    return {"success": True, "pin": pin}


@router.post("/{tc}/{pin_id}/upload")
async def update_pin_upload(
    tc: str, pin_id: int,
    title: str = Form(...),
    message_text: str = Form(""),
    lead_magnet_id: Optional[str] = Form(None),
    inline_buttons: Optional[str] = Form(None),
    attach_type: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    import json
    lm_id = None
    if lead_magnet_id and lead_magnet_id.strip():
        try:
            lm_id = int(lead_magnet_id)
        except (ValueError, TypeError):
            lm_id = None

    parsed_buttons = None
    if inline_buttons and inline_buttons.strip():
        try:
            parsed_buttons = json.dumps(json.loads(inline_buttons))
        except Exception:
            parsed_buttons = None

    file_path = None
    file_type = None
    file_data = None
    if file and file.filename:
        file_path, file_type, file_data = await _save_upload(file)

    update_fields = "title=$1, message_text=$2, lead_magnet_id=$3, inline_buttons=$4, attach_type=$5"
    params = [title, message_text, lm_id, parsed_buttons, attach_type or None]
    if file_path:
        # Reset cached file token so platform re-uploads the new file
        update_fields += ", file_path=$6, file_type=$7, file_data=$8, max_file_token=NULL"
        params.extend([file_path, file_type, file_data])
        params.extend([pin_id, channel["id"]])
        where_idx = 9
    else:
        params.extend([pin_id, channel["id"]])
        where_idx = 6

    await execute(
        f"UPDATE pin_posts SET {update_fields} WHERE id = ${where_idx} AND channel_id = ${where_idx+1}",
        *params,
    )
    pin = await fetch_one(f"SELECT {_PIN_COLS} FROM pin_posts WHERE id = $1", pin_id)
    return {"success": True, "pin": pin}


@router.delete("/{tc}/{pin_id}")
async def delete_pin(tc: str, pin_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM pin_posts WHERE id = $1 AND channel_id = $2", pin_id, channel["id"])
    return {"success": True}


@router.post("/{tc}/send-preview")
async def send_preview(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Send a message preview to the user (owner) via bot."""
    content_type = request.headers.get("content-type", "")
    uploaded_file_path = None
    uploaded_file_type = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        message_text = form.get("message_text", "")
        entity_type = form.get("entity_type", "")
        entity_id = form.get("entity_id")
        upload = form.get("file")
        if upload and hasattr(upload, 'filename') and upload.filename:
            from ..services.file_storage import save_upload
            uploaded_file_path, uploaded_file_type, _ = await save_upload(upload)
    else:
        body = await request.json()
        message_text = body.get("message_text", "")
        entity_type = body.get("entity_type", "")
        entity_id = body.get("entity_id")

    if not message_text.strip():
        raise HTTPException(status_code=400, detail="Текст пустой")

    # Use uploaded file if provided, otherwise load from DB
    file_path = uploaded_file_path
    file_type = uploaded_file_type
    max_file_token = None

    if entity_id and entity_type == "pin":
        pin = await fetch_one("SELECT * FROM pin_posts WHERE id = $1", int(entity_id))
        if pin:
            message_text = pin.get("message_text") or message_text
            if not file_path:
                file_path = pin.get("file_path")
                file_type = pin.get("file_type")
                max_file_token = pin.get("max_file_token")
                from ..services.file_storage import ensure_file
                file_path = ensure_file(file_path, pin.get("file_data"))

    elif entity_id and entity_type == "lead_magnet":
        lm = await fetch_one("SELECT * FROM lead_magnets WHERE id = $1", int(entity_id))
        if lm:
            message_text = lm.get("message_text") or message_text
            if not file_path:
                file_path = lm.get("file_path")
                file_type = lm.get("file_type")
                max_file_token = lm.get("max_file_token")
                from ..services.file_storage import ensure_file
                file_path = ensure_file(file_path, lm.get("file_data"))

    elif entity_id and entity_type == "content":
        post = await fetch_one("SELECT * FROM content_posts WHERE id = $1", int(entity_id))
        if post:
            message_text = post.get("message_text") or message_text
            if not file_path:
                file_path = post.get("file_path")
                file_type = post.get("file_type")
                max_file_token = post.get("max_file_token")
                from ..services.file_storage import ensure_file
                file_path = ensure_file(file_path, post.get("file_data"))

    elif entity_id and entity_type == "giveaway":
        gw = await fetch_one("SELECT * FROM giveaways WHERE id = $1", int(entity_id))
        if gw:
            message_text = gw.get("message_text") or message_text
            if not file_path and gw.get("image_path"):
                file_path = gw["image_path"]
                file_type = "photo"
                import os
                if not os.path.exists(file_path):
                    file_path = None

    # Send to user via bot
    from ..services.messenger import sanitize_html_for_telegram, html_to_max_markdown

    # Try MAX first
    if user.get("max_user_id"):
        from ..services.max_api import get_max_api
        max_api = get_max_api()
        if max_api:
            max_text = html_to_max_markdown(message_text)
            attachments = None
            if max_file_token:
                _type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
                attachments = [{"type": _type_map.get(file_type, "file"), "payload": {"token": max_file_token}}]
            elif file_path:
                upload_result = await max_api.upload_file(file_path, file_type or "file")
                if upload_result.get("success"):
                    from ..services.messenger import _extract_max_file_token
                    token = _extract_max_file_token(upload_result.get("data", {}))
                    if token:
                        _type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}
                        attachments = [{"type": _type_map.get(file_type, "file"), "payload": {"token": token}}]
            result = await max_api.send_direct_message(str(user["max_user_id"]), max_text, attachments=attachments)
            if result.get("success"):
                return {"success": True, "platform": "max"}

    # Fallback to Telegram
    if user.get("telegram_id"):
        from ..services.messenger import send_telegram_message, send_telegram_photo
        tg_text = sanitize_html_for_telegram(message_text)
        try:
            if file_path and file_type == "photo":
                await send_telegram_photo(user["telegram_id"], file_path, caption=tg_text)
            else:
                await send_telegram_message(user["telegram_id"], tg_text)
            return {"success": True, "platform": "telegram"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка отправки: {e}")

    raise HTTPException(status_code=400, detail="Нет привязанного мессенджера для отправки")


@router.post("/{tc}/{pin_id}/publish")
async def publish_pin(tc: str, pin_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    pin = await fetch_one("SELECT * FROM pin_posts WHERE id = $1 AND channel_id = $2", pin_id, channel["id"])
    if not pin:
        raise HTTPException(status_code=404, detail="Пин не найден")

    message_text = pin.get("message_text") or ""
    if not message_text.strip():
        raise HTTPException(status_code=400, detail="Текст сообщения не может быть пустым")

    # Restore file from DB if missing on disk (Render ephemeral filesystem)
    from ..services.file_storage import ensure_file
    file_path = ensure_file(pin.get("file_path"), pin.get("file_data"))

    # Resolve lead_magnet buttons to deep links
    inline_buttons = pin.get("inline_buttons")
    if inline_buttons:
        inline_buttons = await _resolve_buttons(inline_buttons, channel, post_id=pin_id, post_type="pin")

    from ..services.messenger import send_to_channel, sanitize_html_for_telegram, html_to_max_markdown
    import traceback

    existing_msg_id = pin.get("telegram_message_id")
    edited = False

    # If already published — try to edit existing message
    if existing_msg_id and pin.get("status") == "published":
        try:
            if channel.get("platform") == "max":
                from ..services.max_api import get_max_api
                from ..services.messenger import build_max_inline_buttons, _extract_max_file_token
                max_api = get_max_api()
                if max_api:
                    max_text = html_to_max_markdown(message_text)
                    attachments = None
                    max_file_token = pin.get("max_file_token")
                    _max_type_map = {"photo": "image", "video": "video", "audio": "audio", "voice": "audio"}

                    if max_file_token:
                        send_type = pin.get("file_type") or "file"
                        attachments = [{"type": _max_type_map.get(send_type, "file"), "payload": {"token": max_file_token}}]
                    elif file_path:
                        upload_result = await max_api.upload_file(file_path, pin.get("file_type") or "file")
                        if upload_result.get("success"):
                            token = _extract_max_file_token(upload_result.get("data", {}))
                            if token:
                                send_type = pin.get("file_type") or "file"
                                attachments = [{"type": _max_type_map.get(send_type, "file"), "payload": {"token": token}}]
                                await execute("UPDATE pin_posts SET max_file_token = $1 WHERE id = $2", token, pin_id)

                    max_buttons = build_max_inline_buttons(inline_buttons)
                    result = await max_api.edit_message(existing_msg_id, max_text, attachments, max_buttons)
                    if result.get("success"):
                        edited = True
            else:
                # Telegram edit
                import aiohttp
                tg_text = sanitize_html_for_telegram(message_text)
                token = settings.TELEGRAM_BOT_TOKEN
                if token:
                    url = f"https://api.telegram.org/bot{token}/editMessageText"
                    payload = {
                        "chat_id": channel["channel_id"],
                        "message_id": int(existing_msg_id),
                        "text": tg_text,
                        "parse_mode": "HTML",
                    }
                    async with aiohttp.ClientSession() as session:
                        resp = await session.post(url, json=payload)
                        data = await resp.json()
                        if data.get("ok"):
                            edited = True
        except Exception as e:
            print(f"[Publish] Edit failed, will send new: {e}")
            traceback.print_exc()

    # If edit failed or new post — send new message
    msg_id = existing_msg_id
    if not edited:
        try:
            result = await send_to_channel(
                channel, message_text,
                file_path=file_path, file_type=pin.get("file_type"),
                telegram_file_id=pin.get("telegram_file_id"), inline_buttons=inline_buttons,
                attach_type=pin.get("attach_type"),
                max_file_token=pin.get("max_file_token"),
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

    msg_id_str = str(msg_id) if msg_id is not None else None

    await execute(
        "UPDATE pin_posts SET status = 'published', published_at = NOW(), telegram_message_id = $1 WHERE id = $2",
        msg_id_str, pin_id,
    )

    return {"success": True, "messageId": msg_id_str, "edited": edited}


_cached_tg_bot_username: str | None = None
_cached_max_bot_link_id: str | None = None


async def _get_tg_bot_username() -> str:
    global _cached_tg_bot_username
    if _cached_tg_bot_username is not None:
        return _cached_tg_bot_username
    import aiohttp
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return ""
    try:
        url = f"https://api.telegram.org/bot{token}/getMe"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                data = await resp.json()
                _cached_tg_bot_username = data.get("result", {}).get("username", "")
    except Exception:
        return ""
    return _cached_tg_bot_username or ""


async def _get_max_bot_link_id() -> str:
    global _cached_max_bot_link_id
    if _cached_max_bot_link_id is not None:
        return _cached_max_bot_link_id
    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        return ""
    try:
        me = await max_api.get_me()
        username = me.get("data", {}).get("username", "")
        if username.startswith("id") and username.endswith("_bot"):
            _cached_max_bot_link_id = username[2:-4]
        if not _cached_max_bot_link_id:
            _cached_max_bot_link_id = str(me.get("data", {}).get("user_id", ""))
    except Exception:
        return ""
    return _cached_max_bot_link_id or ""


async def _resolve_buttons(inline_buttons_json, channel, post_id=None, post_type="pin"):
    """Convert lead_magnet/comments buttons to deep-link URL buttons."""
    import json as _json
    try:
        buttons = _json.loads(inline_buttons_json) if isinstance(inline_buttons_json, str) else inline_buttons_json
        if not isinstance(buttons, list):
            return inline_buttons_json
    except Exception:
        return inline_buttons_json

    resolved = []
    is_max = channel.get("platform") == "max"
    for btn in buttons:
        btn_type = btn.get("type", "url")
        if btn_type == "lead_magnet" and btn.get("lead_magnet_id"):
            lm = await fetch_one("SELECT code FROM lead_magnets WHERE id = $1", int(btn["lead_magnet_id"]))
            if lm:
                if is_max:
                    bot_link_id = await _get_max_bot_link_id()
                    deep_url = f"https://max.ru/id{bot_link_id}_bot?start=lm_{lm['code']}"
                    resolved.append({
                        "text": btn.get("text", "Получить"),
                        "type": "link",
                        "url": deep_url,
                    })
                else:
                    bot_username = await _get_tg_bot_username()
                    deep_url = f"https://t.me/{bot_username}?start=lm_{lm['code']}" if bot_username else ""
                    if deep_url:
                        resolved.append({"text": btn.get("text", "Получить"), "type": "url", "url": deep_url})
        elif btn_type == "comments" and post_id:
            if is_max:
                bot_link_id = await _get_max_bot_link_id()
                deep_url = f"https://max.ru/id{bot_link_id}_bot?startapp=comments_{post_type}_{post_id}"
                resolved.append({"text": btn.get("text", "Комментарии"), "type": "link", "url": deep_url})
            else:
                bot_username = await _get_tg_bot_username()
                deep_url = f"https://t.me/{bot_username}?start=comments_{post_type}_{post_id}" if bot_username else ""
                if deep_url:
                    resolved.append({"text": btn.get("text", "Комментарии"), "type": "url", "url": deep_url})
        elif btn.get("url"):
            resolved.append(btn)

    return _json.dumps(resolved) if resolved else None


@router.post("/{tc}/{pin_id}/unpin")
async def unpin_post(tc: str, pin_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    pin = await fetch_one("SELECT * FROM pin_posts WHERE id = $1 AND channel_id = $2", pin_id, channel["id"])
    if not pin:
        raise HTTPException(status_code=404, detail="Пин не найден")

    if channel.get("platform") != "max":
        # Unpin in Telegram
        if pin.get("telegram_message_id"):
            import aiohttp
            token = settings.TELEGRAM_BOT_TOKEN
            if token:
                url = f"https://api.telegram.org/bot{token}/unpinChatMessage"
                async with aiohttp.ClientSession() as session:
                    await session.post(url, json={"chat_id": channel["channel_id"], "message_id": int(pin["telegram_message_id"])})
    # MAX doesn't have unpin API — just reset status

    await execute("UPDATE pin_posts SET status = 'draft' WHERE id = $1", pin_id)
    return {"success": True}


@router.get("/{tc}/{pin_id}/leads")
async def get_pin_leads(tc: str, pin_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    pin = await fetch_one("SELECT * FROM pin_posts WHERE id = $1 AND channel_id = $2", pin_id, channel["id"])
    if not pin or not pin.get("lead_magnet_id"):
        return {"success": True, "leads": []}

    leads = await fetch_all(
        "SELECT * FROM leads WHERE lead_magnet_id = $1 ORDER BY claimed_at DESC",
        pin["lead_magnet_id"],
    )
    return {"success": True, "leads": leads}
