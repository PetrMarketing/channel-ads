import os
import random
import secrets
import json as _json
import traceback

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

_GW_COLS = ("id, channel_id, title, message_text, image_path, image_type, attach_type, "
            "erid, legal_info, prizes, conditions, ends_at, winner_count, deep_link_code, "
            "status, telegram_message_id, participant_count, winner_id, winner_username, "
            "winner_first_name, winner_max_user_id, created_at, published_at, drawn_at")


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


async def _save_upload(file: UploadFile) -> tuple:
    """Save uploaded file, return (path, type, data)."""
    from ..services.file_storage import save_upload
    return await save_upload(file)


@router.get("/{tc}")
async def list_giveaways(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    giveaways = await fetch_all(f"SELECT {_GW_COLS} FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    return {"success": True, "giveaways": giveaways}


@router.post("/{tc}")
async def create_giveaway(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    content_type = request.headers.get("content-type", "")
    image_path = None
    image_type = None
    image_data = None
    attach_type = None

    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            title = form.get("title", "")
            message_text = form.get("message_text", "")
            erid = form.get("erid", "")
            legal_info = form.get("legal_info", "")
            prizes = form.get("prizes", "[]")
            conditions = form.get("conditions", '{"subscribe": true, "invite_friends": 0}')
            ends_at = form.get("ends_at") or None
            winner_count = form.get("winner_count", "1")
            attach_type = form.get("attach_type") or None
            image = form.get("image")
            if image and hasattr(image, "read"):
                image_path, image_type, image_data = await _save_upload(image)
        else:
            body = await request.json()
            title = body.get("title", "")
            message_text = body.get("message_text", "")
            erid = body.get("erid", "")
            legal_info = body.get("legal_info", "")
            prizes = body.get("prizes", "[]")
            if isinstance(prizes, list):
                prizes = _json.dumps(prizes, ensure_ascii=False)
            conditions = body.get("conditions", '{"subscribe": true, "invite_friends": 0}')
            if isinstance(conditions, dict):
                conditions = _json.dumps(conditions, ensure_ascii=False)
            ends_at = body.get("ends_at") or None
            winner_count = body.get("winner_count", "1")
            attach_type = body.get("attach_type") or None

        # Ensure prizes is a JSON string
        if isinstance(prizes, list):
            prizes = _json.dumps(prizes, ensure_ascii=False)
        elif isinstance(prizes, str):
            # Validate it's valid JSON
            try:
                _json.loads(prizes)
            except (ValueError, TypeError):
                prizes = _json.dumps([prizes], ensure_ascii=False) if prizes.strip() else "[]"

        # Ensure conditions is a JSON string
        if isinstance(conditions, dict):
            conditions = _json.dumps(conditions, ensure_ascii=False)
        elif isinstance(conditions, str):
            try:
                _json.loads(conditions)
            except (ValueError, TypeError):
                conditions = '{"subscribe": true, "invite_friends": 0}'

        # Parse ends_at if string
        if ends_at and isinstance(ends_at, str):
            from datetime import datetime
            try:
                ends_at = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                ends_at = None

        # Ensure winner_count is a valid int
        try:
            winner_count = int(winner_count) if winner_count else 1
        except (ValueError, TypeError):
            winner_count = 1
        if winner_count < 1:
            winner_count = 1

        deep_link_code = f"gw_{secrets.token_hex(6)}"
        gid = await execute_returning_id(
            """INSERT INTO giveaways (channel_id, title, message_text, image_path, image_type, attach_type, file_data,
               erid, legal_info, prizes, conditions, ends_at, winner_count, deep_link_code)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id""",
            channel["id"], title or "Розыгрыш", message_text or title or "Розыгрыш",
            image_path, image_type, attach_type, image_data,
            erid or None, legal_info or None, prizes, conditions, ends_at, winner_count, deep_link_code,
        )
        g = await fetch_one(f"SELECT {_GW_COLS} FROM giveaways WHERE id = $1", gid)
        return {"success": True, "giveaway": g}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Giveaways] create_giveaway ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Ошибка создания розыгрыша: {str(e)}")


@router.put("/{tc}/{giveaway_id}")
async def update_giveaway(tc: str, giveaway_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    content_type = request.headers.get("content-type", "")
    image_path = None
    image_type = None
    image_data = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        body = {}
        for key in ("title", "message_text", "erid", "legal_info", "prizes", "conditions", "ends_at", "winner_count", "attach_type"):
            val = form.get(key)
            if val is not None:
                body[key] = val
        image = form.get("image")
        if image and hasattr(image, "read"):
            image_path, image_type, image_data = await _save_upload(image)
    else:
        body = await request.json()

    # Normalize JSON fields
    if "prizes" in body:
        if isinstance(body["prizes"], list):
            body["prizes"] = _json.dumps(body["prizes"], ensure_ascii=False)
        elif isinstance(body["prizes"], str):
            try:
                _json.loads(body["prizes"])
            except (ValueError, TypeError):
                body["prizes"] = _json.dumps([body["prizes"]], ensure_ascii=False) if body["prizes"].strip() else "[]"
    if "conditions" in body:
        if isinstance(body["conditions"], dict):
            body["conditions"] = _json.dumps(body["conditions"], ensure_ascii=False)
        elif isinstance(body["conditions"], str):
            try:
                _json.loads(body["conditions"])
            except (ValueError, TypeError):
                body["conditions"] = '{"subscribe": true, "invite_friends": 0}'

    # Parse ends_at
    if "ends_at" in body and body["ends_at"] and isinstance(body["ends_at"], str):
        from datetime import datetime
        try:
            body["ends_at"] = datetime.fromisoformat(body["ends_at"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            body["ends_at"] = None

    # Convert winner_count to int
    if "winner_count" in body:
        try:
            body["winner_count"] = int(body["winner_count"])
        except (ValueError, TypeError):
            body["winner_count"] = 1

    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "erid", "legal_info", "prizes", "conditions", "ends_at", "winner_count", "attach_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key] if body[key] != "" else None)
            idx += 1
    if image_path:
        fields.append(f"image_path = ${idx}")
        params.append(image_path)
        idx += 1
        fields.append(f"image_type = ${idx}")
        params.append(image_type)
        idx += 1
        fields.append(f"file_data = ${idx}")
        params.append(image_data)
        idx += 1
    if not fields:
        return {"success": True}
    params.extend([giveaway_id, channel["id"]])
    await execute(f"UPDATE giveaways SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    g = await fetch_one(f"SELECT {_GW_COLS} FROM giveaways WHERE id = $1", giveaway_id)
    return {"success": True, "giveaway": g}


@router.delete("/{tc}/{giveaway_id}")
async def delete_giveaway(tc: str, giveaway_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM giveaways WHERE id = $1 AND channel_id = $2", giveaway_id, channel["id"])
    return {"success": True}


@router.post("/{tc}/{giveaway_id}/publish")
async def publish_giveaway(tc: str, giveaway_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    g = await fetch_one(
        f"SELECT {_GW_COLS}, file_data FROM giveaways WHERE id = $1 AND channel_id = $2",
        giveaway_id, channel["id"],
    )
    if not g:
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")

    # Idempotency: prevent double/triple publish
    if g.get("status") and g["status"] != "draft":
        raise HTTPException(status_code=400, detail="Розыгрыш уже опубликован")

    # Build post text
    msg_text = g.get("message_text") or ""
    if not msg_text:
        msg_text = f"<b>{g['title']}</b>"

    # Parse prizes
    prizes_text = ""
    try:
        prizes_list = _json.loads(g.get("prizes") or "[]")
        if isinstance(prizes_list, list) and prizes_list:
            prizes_text = "\n".join(f"🎁 {p}" for p in prizes_list if p)
    except (ValueError, TypeError):
        pass

    text = msg_text
    if prizes_text:
        text += f"\n\n<b>Призы:</b>\n{prizes_text}"
    if g.get("legal_info"):
        text += f"\n\n<i>{g['legal_info']}</i>"
    if g.get("erid"):
        text += f"\n\nERID: {g['erid']}"

    # Add participation link
    deep_link = g.get("deep_link_code")
    if not deep_link:
        deep_link = f"gw_{secrets.token_hex(6)}"
        await execute("UPDATE giveaways SET deep_link_code = $1 WHERE id = $2", deep_link, giveaway_id)

    from ..config import settings
    gw_buttons = None
    try:
        if channel.get("platform") == "max":
            from ..services.max_api import get_max_api
            max_api = get_max_api()
            if not max_api:
                raise HTTPException(status_code=500, detail="MAX бот не настроен")
            bot_link_id = ""
            try:
                me = await max_api.get_me()
                me_data = me.get("data", {})
                username = me_data.get("username", "")
                if username.startswith("id") and username.endswith("_bot"):
                    bot_link_id = username[2:-4]
                if not bot_link_id:
                    bot_link_id = str(me_data.get("user_id", ""))
                print(f"[Giveaways] MAX bot: username={username}, bot_link_id={bot_link_id}")
            except Exception as e:
                print(f"[Giveaways] MAX get_me failed: {e}")
            deep_url = f"https://max.ru/id{bot_link_id}_bot?start={deep_link}"
            # For MAX: use link button to redirect user to the bot
            text += "\n\n🎟 Нажмите кнопку ниже, чтобы участвовать:"
            gw_buttons = _json.dumps([{"type": "link", "text": "🎟 Участвовать", "url": deep_url}])
        else:
            bot_info_result = None
            try:
                import aiohttp
                url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
                async with aiohttp.ClientSession() as s:
                    async with s.get(url) as r:
                        bot_info_result = await r.json()
            except Exception:
                pass
            bot_username = bot_info_result.get("result", {}).get("username", "") if bot_info_result and bot_info_result.get("ok") else ""
            if bot_username:
                text += f'\n\n🎟 <a href="https://t.me/{bot_username}?start={deep_link}">Участвовать</a>'

        from ..services.messenger import send_to_channel
        image_path = g.get("image_path")
        if image_path:
            from ..services.file_storage import ensure_file, overlay_legal_text
            image_path = ensure_file(image_path, g.get("file_data"))
            # Overlay erid/legal text on the image before sending
            if image_path and os.path.isfile(image_path) and (g.get("erid") or g.get("legal_info")):
                try:
                    image_path = overlay_legal_text(image_path, g.get("erid", ""), g.get("legal_info", ""))
                except Exception as e:
                    print(f"[Giveaways] overlay_legal_text failed: {e}")
        if image_path and os.path.isfile(image_path):
            result = await send_to_channel(
                channel, text,
                file_path=image_path, file_type=g.get("image_type", "photo"),
                inline_buttons=gw_buttons,
                attach_type=g.get("attach_type"),
            )
        else:
            result = await send_to_channel(channel, text, inline_buttons=gw_buttons)
        msg_id = None
        if isinstance(result, dict):
            msg_id = result.get("message_id") or result.get("result", {}).get("message_id")

        await execute(
            "UPDATE giveaways SET status = 'active', published_at = NOW(), telegram_message_id = $1 WHERE id = $2",
            str(msg_id) if msg_id else None, giveaway_id,
        )
        return {"success": True, "messageId": msg_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Giveaways] publish_giveaway ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Ошибка публикации розыгрыша: {str(e)}")


@router.post("/{tc}/{giveaway_id}/draw")
async def draw_winner(tc: str, giveaway_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    g = await fetch_one(f"SELECT {_GW_COLS} FROM giveaways WHERE id = $1 AND channel_id = $2", giveaway_id, channel["id"])
    if not g:
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")

    try:
        participants = await fetch_all(
            "SELECT * FROM giveaway_participants WHERE giveaway_id = $1", giveaway_id
        )
        if not participants:
            raise HTTPException(status_code=400, detail="Нет участников")

        winner_count = g.get("winner_count") or 1
        winners = random.sample(participants, min(winner_count, len(participants)))

        # Save first winner for backward compat
        winner = winners[0]
        winner_tg_id = winner.get("telegram_id")
        winner_max_id = winner.get("max_user_id")
        await execute(
            """UPDATE giveaways SET status = 'finished', drawn_at = NOW(),
               winner_id = $1, winner_username = $2, winner_first_name = $3,
               winner_max_user_id = $4, participant_count = $5 WHERE id = $6""",
            winner_tg_id or 0, winner.get("username"), winner.get("first_name"),
            winner_max_id, len(participants), giveaway_id,
        )

        # Notify winners
        gw_title = g.get("title") or "Розыгрыш"
        for w in winners:
            try:
                win_name = w.get("first_name") or w.get("username") or ""
                notify_text = (
                    f"🎉 Поздравляем, {win_name}!\n\n"
                    f"Вы стали победителем розыгрыша «{gw_title}»! 🏆\n\n"
                    f"Организатор скоро свяжется с вами для вручения приза."
                )
                from ..services.messenger import send_to_user
                if w.get("platform") == "max" and w.get("max_user_id"):
                    await send_to_user(w["max_user_id"], "max", notify_text)
                elif w.get("telegram_id"):
                    await send_to_user(w["telegram_id"], "telegram", notify_text)
            except Exception as e:
                print(f"[Giveaways] notify winner failed: {e}")

        return {
            "success": True,
            "winners": [
                {
                    "telegram_id": w.get("telegram_id"),
                    "max_user_id": w.get("max_user_id"),
                    "username": w.get("username"),
                    "first_name": w.get("first_name"),
                }
                for w in winners
            ],
            "winner": {
                "telegram_id": winner_tg_id,
                "max_user_id": winner_max_id,
                "username": winner.get("username"),
                "first_name": winner.get("first_name"),
            },
            "participantsCount": len(participants),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Giveaways] draw_winner ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Ошибка определения победителя: {str(e)}")
