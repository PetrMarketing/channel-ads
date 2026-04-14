import json
import os
import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from typing import Dict, Any, Optional

from ..config import settings
from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from .pins import _get_max_bot_link_id, _get_tg_bot_username

router = APIRouter()


async def _create_unique_invite_link(chat_id: str, platform: str, member_name: str = "") -> Optional[str]:
    """Generate a single-use invite link for a specific user."""
    if platform == "telegram":
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            return None
        url = f"{settings.TELEGRAM_API_URL}/bot{token}/createChatInviteLink"
        payload = {
            "chat_id": chat_id,
            "member_limit": 1,
            "name": f"paid-{member_name[:20]}" if member_name else "paid-member",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                result = await resp.json()
                if result.get("ok"):
                    return result["result"]["invite_link"]
                print(f"[PaidChats] Failed to create TG invite link: {result}")
        return None
    elif platform == "max":
        # Get the actual chat invite URL
        from ..services.max_api import get_max_api
        max_api = get_max_api()
        target_url = None
        if max_api:
            target_url = await max_api.get_invite_link(chat_id)
        if not target_url:
            from ..database import fetch_one as _f
            bc = await _f("SELECT join_link FROM bot_chats WHERE chat_id = $1", str(chat_id))
            if bc and bc.get("join_link"):
                target_url = bc["join_link"]
        if not target_url:
            # Try chat info
            if max_api:
                ci = await max_api.get_chat(str(chat_id))
                if ci.get("success") and ci.get("data", {}).get("link"):
                    target_url = ci["data"]["link"]
        if not target_url:
            return None
        # Create one-time token wrapping the real URL
        import secrets as _s
        token = _s.token_urlsafe(24)
        from ..database import execute_returning_id as _eri
        await _eri(
            "INSERT INTO paid_chat_invite_tokens (token, target_url) VALUES ($1, $2) RETURNING id",
            token, target_url,
        )
        return f"{settings.APP_URL}/join/{token}"
    return None


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "paid_chats")


async def _require_active_billing(channel_id: int):
    """Raise 403 if the channel does not have an active billing subscription."""
    billing = await fetch_one(
        "SELECT id, status, expires_at FROM channel_billing WHERE channel_id = $1 AND status = 'active' AND expires_at > NOW()",
        channel_id,
    )
    if not billing:
        raise HTTPException(status_code=403, detail="Для работы с платными чатами необходима активная подписка канала")


# ─────────────────────────────────────────────
# Payment Settings (acquiring / payment gateway)
# ─────────────────────────────────────────────

@router.get("/{tc}/payment-settings")
async def list_payment_settings(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        "SELECT id, channel_id, provider, credentials, is_active, created_at FROM paid_chat_payment_settings WHERE channel_id = $1 ORDER BY created_at",
        channel["id"],
    )
    # Mask credentials — show only which fields are filled, not values
    masked = []
    for r in rows:
        r = dict(r)
        creds = r.get("credentials", {})
        if isinstance(creds, str):
            try:
                creds = json.loads(creds)
            except Exception:
                creds = {}
        r["credentials"] = {k: ("***" + v[-4:] if isinstance(v, str) and len(v) > 4 else "***") for k, v in creds.items()} if isinstance(creds, dict) else {}
        masked.append(r)
    return {"success": True, "settings": masked}


@router.post("/{tc}/payment-settings")
async def save_payment_settings(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    body = await request.json()
    provider = body.get("provider", "")
    if provider not in ("yoomoney", "prodamus", "tinkoff", "robokassa", "getcourse"):
        raise HTTPException(status_code=400, detail="Неподдерживаемая платёжная система")
    new_creds = body.get("credentials", {})
    is_active = body.get("is_active", 1)

    # Merge with existing credentials — empty values keep old ones
    existing = await fetch_one(
        "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = $2",
        channel["id"], provider)
    if existing:
        old_creds = existing.get("credentials", {})
        if isinstance(old_creds, str):
            try: old_creds = json.loads(old_creds)
            except: old_creds = {}
        for k, v in new_creds.items():
            if v:  # Only update non-empty values
                old_creds[k] = v
        new_creds = old_creds

    credentials = json.dumps(new_creds, ensure_ascii=False)

    sid = await execute_returning_id(
        """INSERT INTO paid_chat_payment_settings (channel_id, provider, credentials, is_active)
           VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (channel_id, provider) DO UPDATE
             SET credentials = $3::jsonb, is_active = $4
           RETURNING id""",
        channel["id"], provider, credentials, is_active,
    )

    # Test payment: create a 10 RUB test order to verify credentials
    test_result = None
    if is_active:
        try:
            from .paid_chat_payments import (
                _init_tinkoff_payment, _init_yoomoney_payment,
                _init_prodamus_payment, _init_robokassa_payment, _init_getcourse_payment,
            )
            creds_dict = body.get("credentials", {})
            test_order_id = f"test_{channel['id']}_{int(__import__('time').time())}"
            test_desc = "Тестовый платёж (проверка подключения)"

            if provider == "tinkoff":
                test_url = await _init_tinkoff_payment(creds_dict, test_order_id, 10, test_desc, "", "")
            elif provider == "yoomoney":
                test_url = await _init_yoomoney_payment(creds_dict, test_order_id, 10, test_desc, "", "")
            elif provider == "prodamus":
                test_url = await _init_prodamus_payment(creds_dict, test_order_id, 10, test_desc, "", "", "")
            elif provider == "robokassa":
                test_url = await _init_robokassa_payment(creds_dict, test_order_id, 10, test_desc, "", "")
            elif provider == "getcourse":
                test_url = await _init_getcourse_payment(creds_dict, test_order_id, 10, test_desc, "Тест", "", "test@test.ru")
            else:
                test_url = None

            if test_url:
                test_result = {"success": True, "test_payment_url": test_url, "message": "Тестовый платёж на 10 ₽ создан. Перейдите по ссылке для проверки."}
            else:
                test_result = {"success": True, "message": "Настройки сохранены (тест недоступен для этого провайдера)"}
        except Exception as e:
            test_result = {"success": False, "message": f"Ошибка подключения: {e}"}

    return {"success": True, "id": sid, "test": test_result}


@router.delete("/{tc}/payment-settings/{setting_id}")
async def delete_payment_settings(tc: str, setting_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM paid_chat_payment_settings WHERE id = $1 AND channel_id = $2",
        setting_id, channel["id"],
    )
    return {"success": True}


# ─────────────────────────────────────────────
# Plans (pricing)
# ─────────────────────────────────────────────

@router.get("/{tc}/plans")
async def list_plans(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    plans = await fetch_all(
        "SELECT * FROM paid_chat_plans WHERE channel_id = $1 ORDER BY sort_order, created_at",
        channel["id"],
    )
    return {"success": True, "plans": plans}


@router.post("/{tc}/plans")
async def create_plan(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    body = await request.json()
    plan_type = body.get("plan_type", "one_time")
    if plan_type not in ("one_time", "recurring"):
        raise HTTPException(status_code=400, detail="Тип плана: one_time или recurring")
    pid = await execute_returning_id(
        """INSERT INTO paid_chat_plans (channel_id, plan_type, duration_days, price, currency, title, description, is_active, sort_order, offer_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        channel["id"],
        plan_type,
        body.get("duration_days", 30),
        body.get("price", 0),
        body.get("currency", "RUB"),
        body.get("title", ""),
        body.get("description", ""),
        body.get("is_active", 1),
        body.get("sort_order", 0),
        body.get("offer_code", ""),
    )
    plan = await fetch_one("SELECT * FROM paid_chat_plans WHERE id = $1", pid)
    return {"success": True, "plan": plan}


@router.put("/{tc}/plans/{plan_id}")
async def update_plan(tc: str, plan_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("plan_type", "duration_days", "price", "currency", "title", "description", "is_active", "sort_order", "offer_code"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([plan_id, channel["id"]])
    await execute(
        f"UPDATE paid_chat_plans SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
        *params,
    )
    plan = await fetch_one("SELECT * FROM paid_chat_plans WHERE id = $1", plan_id)
    return {"success": True, "plan": plan}


@router.delete("/{tc}/plans/{plan_id}")
async def delete_plan(tc: str, plan_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM paid_chat_plans WHERE id = $1 AND channel_id = $2",
        plan_id, channel["id"],
    )
    return {"success": True}


# ─────────────────────────────────────────────
# Chats (connected paid chats/groups)
# ─────────────────────────────────────────────

@router.get("/{tc}/chats")
async def list_chats(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    chats = await fetch_all(
        "SELECT * FROM paid_chats WHERE channel_id = $1 ORDER BY created_at",
        channel["id"],
    )
    # add member counts
    for c in chats:
        cnt = await fetch_one(
            "SELECT COUNT(*) as count FROM paid_chat_members WHERE paid_chat_id = $1 AND status = 'active'",
            c["id"],
        )
        c["active_members"] = cnt["count"] if cnt else 0
    return {"success": True, "chats": chats}


@router.get("/{tc}/available-chats")
async def list_available_chats(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """List bot_chats that can be added as paid chats (not already added)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    chats = await fetch_all(
        """SELECT bc.* FROM bot_chats bc
           WHERE bc.user_id = $1
           AND bc.chat_id NOT IN (SELECT chat_id FROM paid_chats WHERE channel_id = $2)
           ORDER BY bc.created_at DESC""",
        user["id"], channel["id"],
    )
    return {"success": True, "chats": chats}


@router.post("/{tc}/chats")
async def create_chat(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    # Check that payment settings exist
    ps = await fetch_one(
        "SELECT id FROM paid_chat_payment_settings WHERE channel_id = $1 AND is_active = 1 LIMIT 1",
        channel["id"],
    )
    if not ps:
        raise HTTPException(status_code=400, detail="Сначала настройте платёжную систему в разделе «Оплата»")
    body = await request.json()
    chat_id = body.get("chat_id", "").strip()
    if not chat_id:
        raise HTTPException(status_code=400, detail="ID чата обязателен")
    cid = await execute_returning_id(
        """INSERT INTO paid_chats (channel_id, chat_id, platform, title, username, join_link, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (channel_id, chat_id) DO UPDATE
             SET title = $4, username = $5, join_link = $6, is_active = $7
           RETURNING id""",
        channel["id"],
        chat_id,
        body.get("platform", channel.get("platform", "telegram")),
        body.get("title", ""),
        body.get("username", ""),
        body.get("join_link", ""),
        body.get("is_active", 1),
    )
    chat = await fetch_one("SELECT * FROM paid_chats WHERE id = $1", cid)
    return {"success": True, "chat": chat}


@router.put("/{tc}/chats/{chat_id}")
async def update_chat(tc: str, chat_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "username", "join_link", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([chat_id, channel["id"]])
    await execute(
        f"UPDATE paid_chats SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
        *params,
    )
    chat = await fetch_one("SELECT * FROM paid_chats WHERE id = $1", chat_id)
    return {"success": True, "chat": chat}


@router.delete("/{tc}/chats/{chat_id}")
async def delete_chat(tc: str, chat_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM paid_chats WHERE id = $1 AND channel_id = $2",
        chat_id, channel["id"],
    )
    return {"success": True}


# ─────────────────────────────────────────────
# Members
# ─────────────────────────────────────────────

@router.get("/{tc}/members")
async def list_members(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    chat_filter = request.query_params.get("chat_id")
    status_filter = request.query_params.get("status")

    # Existing members
    query = """
        SELECT m.*, m.invite_link, pc.title as chat_title, p.title as plan_title, p.plan_type, p.price
        FROM paid_chat_members m
        LEFT JOIN paid_chats pc ON pc.id = m.paid_chat_id
        LEFT JOIN paid_chat_plans p ON p.id = m.plan_id
        WHERE m.channel_id = $1
    """
    params = [channel["id"]]
    idx = 2
    if chat_filter:
        query += f" AND m.paid_chat_id = ${idx}"
        params.append(int(chat_filter))
        idx += 1
    if status_filter and status_filter != "pending":
        query += f" AND m.status = ${idx}"
        params.append(status_filter)
        idx += 1
    query += " ORDER BY m.created_at DESC"
    members = list(await fetch_all(query, *params))

    # Also include pending payments (users who started payment but didn't complete)
    if not status_filter or status_filter == "pending":
        pq = """
            SELECT pp.id as payment_id, pp.paid_chat_id, pp.channel_id, pp.plan_id,
                   pp.telegram_id, pp.max_user_id, pp.username, pp.first_name, pp.platform,
                   pp.amount, pp.created_at,
                   pc.title as chat_title, p.title as plan_title, p.plan_type, p.price
            FROM paid_chat_payments pp
            LEFT JOIN paid_chats pc ON pc.id = pp.paid_chat_id
            LEFT JOIN paid_chat_plans p ON p.id = pp.plan_id
            WHERE pp.channel_id = $1 AND pp.status = 'pending'
        """
        pp_params = [channel["id"]]
        pp_idx = 2
        if chat_filter:
            pq += f" AND pp.paid_chat_id = ${pp_idx}"
            pp_params.append(int(chat_filter))
            pp_idx += 1
        pq += " ORDER BY pp.created_at DESC"
        pending = await fetch_all(pq, *pp_params)

        # Convert pending payments to member-like dicts
        for pp in pending:
            members.append({
                "id": f"pay_{pp['payment_id']}",
                "payment_id": pp["payment_id"],
                "paid_chat_id": pp["paid_chat_id"],
                "channel_id": pp["channel_id"],
                "plan_id": pp["plan_id"],
                "telegram_id": pp.get("telegram_id"),
                "max_user_id": pp.get("max_user_id"),
                "username": pp.get("username"),
                "first_name": pp.get("first_name"),
                "platform": pp.get("platform"),
                "status": "pending",
                "amount_paid": None,
                "expires_at": None,
                "invite_link": None,
                "chat_title": pp.get("chat_title"),
                "plan_title": pp.get("plan_title"),
                "plan_type": pp.get("plan_type"),
                "price": pp.get("price"),
                "created_at": pp.get("created_at"),
            })

    return {"success": True, "members": members}


@router.post("/{tc}/members")
async def add_member(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    body = await request.json()

    paid_chat_id = body.get("paid_chat_id")
    platform = body.get("platform", "telegram")
    telegram_id = body.get("telegram_id")
    max_user_id = body.get("max_user_id")
    first_name = body.get("first_name", "")
    username = body.get("username", "")

    # Get the chat to generate a unique invite link
    chat = await fetch_one("SELECT * FROM paid_chats WHERE id = $1 AND channel_id = $2", paid_chat_id, channel["id"])
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")

    # Generate unique single-use invite link
    invite_link = await _create_unique_invite_link(
        chat["chat_id"], chat.get("platform", platform), first_name or username
    )

    mid = await execute_returning_id(
        """INSERT INTO paid_chat_members
             (paid_chat_id, channel_id, telegram_id, max_user_id, username, first_name, platform,
              plan_id, status, amount_paid, starts_at, expires_at, invite_link)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id""",
        paid_chat_id,
        channel["id"],
        telegram_id,
        max_user_id,
        username,
        first_name,
        platform,
        body.get("plan_id"),
        body.get("status", "active"),
        body.get("amount_paid", 0),
        body.get("starts_at"),
        body.get("expires_at"),
        invite_link,
    )

    # Send after_subscribe notification with invite link
    await _send_after_subscribe(channel["id"], chat, body, invite_link, platform, telegram_id, max_user_id)

    return {"success": True, "id": mid, "invite_link": invite_link}


async def _send_after_subscribe(channel_id, chat, body, invite_link, platform, telegram_id, max_user_id):
    """Send the after_subscribe notification with the unique invite link."""
    from ..services.messenger import send_to_user
    from ..services.file_storage import ensure_file

    chat_title = chat.get("title", "платный чат")

    # Get custom notification text + optional image
    notif = await fetch_one(
        "SELECT message_text, file_path, file_type, file_data FROM paid_chat_notifications WHERE channel_id = $1 AND event_type = 'after_subscribe' AND is_active = 1",
        channel_id,
    )
    if notif and notif.get("message_text"):
        message = notif["message_text"]
    else:
        message = f"Спасибо за подписку на «{chat_title}»!"

    if invite_link:
        message += f"\n\nВаша персональная ссылка для вступления (одноразовая):\n{invite_link}"
    else:
        message += "\n\n⚠️ Не удалось создать ссылку-приглашение. Обратитесь к администратору."

    file_path = ensure_file(notif.get("file_path"), notif.get("file_data")) if notif else None
    file_type = notif.get("file_type") if notif else None

    user_id = int(telegram_id) if platform == "telegram" and telegram_id else max_user_id
    if not user_id:
        return

    try:
        await send_to_user(
            user_id, platform, message,
            file_path=file_path, file_type=file_type,
        )
    except Exception as e:
        print(f"[PaidChats] Failed to send after_subscribe notification: {e}")


@router.put("/{tc}/members/{member_id}")
async def update_member(tc: str, member_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("status", "plan_id", "expires_at", "amount_paid"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([member_id, channel["id"]])
    await execute(
        f"UPDATE paid_chat_members SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
        *params,
    )
    return {"success": True}


@router.post("/{tc}/members/mark-paid/{payment_id}")
async def mark_payment_as_paid(tc: str, payment_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Manually mark a pending payment as paid: create member, send invite link."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    payment = await fetch_one(
        "SELECT * FROM paid_chat_payments WHERE id = $1 AND channel_id = $2",
        payment_id, channel["id"],
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    if payment["status"] == "paid":
        raise HTTPException(status_code=400, detail="Платёж уже подтверждён")

    # Use _fulfill_payment logic
    from .paid_chat_payments import _fulfill_payment
    await _fulfill_payment(payment["order_id"], {"source": "manual_confirm"})

    return {"success": True}


@router.delete("/{tc}/members/{member_id}")
async def remove_member(tc: str, member_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM paid_chat_members WHERE id = $1 AND channel_id = $2",
        member_id, channel["id"],
    )
    return {"success": True}


# ─────────────────────────────────────────────
# Notifications (paid chat specific)
# ─────────────────────────────────────────────

NOTIFICATION_EVENTS = [
    "before_subscribe",
    "after_subscribe",
    "3_days_before_expiry",
    "1_day_before_expiry",
]


@router.get("/{tc}/notifications")
async def list_notifications(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    notifs = await fetch_all(
        "SELECT * FROM paid_chat_notifications WHERE channel_id = $1 ORDER BY created_at",
        channel["id"],
    )
    return {"success": True, "notifications": notifs, "event_types": NOTIFICATION_EVENTS}


@router.post("/{tc}/notifications")
async def save_notification(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    body = await request.json()
    event_type = body.get("event_type", "")
    if event_type not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=400, detail=f"Неизвестный тип: {event_type}")
    nid = await execute_returning_id(
        """INSERT INTO paid_chat_notifications (channel_id, event_type, message_text, is_active)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (channel_id, event_type) DO UPDATE
             SET message_text = $3, is_active = $4
           RETURNING id""",
        channel["id"],
        event_type,
        body.get("message_text", ""),
        body.get("is_active", 1),
    )
    return {"success": True, "id": nid}


@router.post("/{tc}/notifications-upload")
async def save_notification_upload(
    tc: str,
    event_type: str = Form(...),
    message_text: str = Form(""),
    is_active: int = Form(1),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Save notification with optional image attachment."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    if event_type not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=400, detail=f"Неизвестный тип: {event_type}")

    file_path = file_type = file_data = None
    if file and file.filename:
        from ..services.file_storage import save_upload
        file_path, file_type, file_data = await save_upload(file)

    if file_path:
        nid = await execute_returning_id(
            """INSERT INTO paid_chat_notifications (channel_id, event_type, message_text, is_active, file_path, file_type, file_data)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (channel_id, event_type) DO UPDATE
                 SET message_text = $3, is_active = $4, file_path = $5, file_type = $6, file_data = $7
               RETURNING id""",
            channel["id"], event_type, message_text, is_active, file_path, file_type, file_data,
        )
    else:
        nid = await execute_returning_id(
            """INSERT INTO paid_chat_notifications (channel_id, event_type, message_text, is_active)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (channel_id, event_type) DO UPDATE
                 SET message_text = $3, is_active = $4
               RETURNING id""",
            channel["id"], event_type, message_text, is_active,
        )
    return {"success": True, "id": nid}


@router.delete("/{tc}/notifications/{notif_id}/image")
async def delete_notification_image(tc: str, notif_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "UPDATE paid_chat_notifications SET file_path = NULL, file_type = NULL, file_data = NULL WHERE id = $1 AND channel_id = $2",
        notif_id, channel["id"],
    )
    return {"success": True}


@router.delete("/{tc}/notifications/{notif_id}")
async def delete_notification(tc: str, notif_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "DELETE FROM paid_chat_notifications WHERE id = $1 AND channel_id = $2",
        notif_id, channel["id"],
    )
    return {"success": True}


# ─────────────────────────────────────────────
# Paid chat posts CRUD
# ─────────────────────────────────────────────

@router.get("/{tc}/posts")
async def list_posts(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        "SELECT p.*, c.title as chat_title FROM paid_chat_posts p "
        "LEFT JOIN paid_chats c ON c.id = p.chat_id "
        "WHERE p.channel_id = $1 ORDER BY p.created_at DESC",
        channel["id"],
    )
    return {"success": True, "posts": [dict(r) for r in rows]}


@router.post("/{tc}/posts")
async def create_post(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    body = await request.json()
    post_id = await execute_returning_id(
        "INSERT INTO paid_chat_posts (channel_id, title, message_text, button_text, chat_id) "
        "VALUES ($1, $2, $3, $4, $5) RETURNING id",
        channel["id"], body.get("title", ""), body.get("message_text", ""),
        body.get("button_text", "Подробнее"), body.get("chat_id") or None,
    )
    return {"success": True, "id": post_id}


@router.post("/{tc}/posts-upload")
async def create_post_upload(
    tc: str,
    title: str = Form(""),
    message_text: str = Form(""),
    button_text: str = Form("Подробнее"),
    chat_id: Optional[str] = Form(None),
    attach_type: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    file_path = file_type = file_data = None
    if file and file.filename:
        from ..services.file_storage import save_upload
        file_path, file_type, file_data = await save_upload(file)
    post_id = await execute_returning_id(
        "INSERT INTO paid_chat_posts (channel_id, title, message_text, button_text, chat_id, file_path, file_type, file_data, attach_type) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        channel["id"], title, message_text, button_text,
        int(chat_id) if chat_id else None,
        file_path, file_type, file_data, attach_type,
    )
    return {"success": True, "id": post_id}


@router.put("/{tc}/posts/{post_id}")
async def update_post(tc: str, post_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    await execute(
        "UPDATE paid_chat_posts SET title=$1, message_text=$2, button_text=$3, chat_id=$4 "
        "WHERE id=$5 AND channel_id=$6",
        body.get("title", ""), body.get("message_text", ""),
        body.get("button_text", "Подробнее"), body.get("chat_id") or None,
        post_id, channel["id"],
    )
    return {"success": True}


@router.put("/{tc}/posts-upload/{post_id}")
async def update_post_upload(
    tc: str, post_id: int,
    title: str = Form(""),
    message_text: str = Form(""),
    button_text: str = Form("Подробнее"),
    chat_id: Optional[str] = Form(None),
    attach_type: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    file_path = file_type = file_data = None
    if file and file.filename:
        from ..services.file_storage import save_upload
        file_path, file_type, file_data = await save_upload(file)
        await execute(
            "UPDATE paid_chat_posts SET title=$1, message_text=$2, button_text=$3, chat_id=$4, "
            "file_path=$5, file_type=$6, file_data=$7, attach_type=$8 WHERE id=$9 AND channel_id=$10",
            title, message_text, button_text, int(chat_id) if chat_id else None,
            file_path, file_type, file_data, attach_type, post_id, channel["id"],
        )
    else:
        await execute(
            "UPDATE paid_chat_posts SET title=$1, message_text=$2, button_text=$3, chat_id=$4, "
            "attach_type=$5 WHERE id=$6 AND channel_id=$7",
            title, message_text, button_text, int(chat_id) if chat_id else None,
            attach_type, post_id, channel["id"],
        )
    return {"success": True}


@router.delete("/{tc}/posts/{post_id}")
async def delete_post(tc: str, post_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM paid_chat_posts WHERE id = $1 AND channel_id = $2", post_id, channel["id"])
    return {"success": True}


@router.post("/{tc}/posts/{post_id}/publish")
async def publish_saved_post(tc: str, post_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Publish a saved post to channel."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])
    post = await fetch_one(
        "SELECT * FROM paid_chat_posts WHERE id = $1 AND channel_id = $2", post_id, channel["id"]
    )
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    result = await _do_publish_post(
        channel, tc, post["message_text"], post.get("button_text") or "Подробнее",
        post.get("file_path"), post.get("file_type"), post.get("attach_type"),
        file_data=post.get("file_data"),
    )
    await execute(
        "UPDATE paid_chat_posts SET status='published', published_at=NOW(), message_id=$1 WHERE id=$2",
        result.get("message_id"), post_id,
    )
    return result


# ─────────────────────────────────────────────
# Publish post to channel (legacy direct publish)
# ─────────────────────────────────────────────

@router.post("/{tc}/publish-post")
async def publish_post_json(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Publish a post (JSON, no file) — kept for backwards compat."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])

    body = await request.json()
    return await _do_publish_post(channel, tc, body.get("text", ""), body.get("button_text", "Подробнее"), None, None)


@router.post("/{tc}/publish-post-upload")
async def publish_post_upload(
    tc: str,
    text: str = Form(""),
    button_text: str = Form("Подробнее"),
    attach_type: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Publish a post with optional file attachment."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await _require_active_billing(channel["id"])

    file_path = file_type = None
    if file and file.filename:
        from ..services.file_storage import save_upload
        file_path, file_type, _ = await save_upload(file)

    return await _do_publish_post(channel, tc, text, button_text, file_path, file_type, attach_type)


async def _do_publish_post(channel, tc, text, button_text, file_path=None, file_type=None, attach_type=None, file_data=None):
    """Core publish logic — build deep-link button and send via send_to_channel."""
    text = (text or "").strip()
    button_text = (button_text or "Подробнее").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст поста обязателен")

    platform = channel.get("platform", "telegram")

    # Build deep-link URL button (same approach as lead magnets)
    if platform == "max":
        bot_link_id = await _get_max_bot_link_id()
        deep_url = f"https://max.ru/id{bot_link_id}_bot?start=paid_{tc}"
        inline_buttons = json.dumps([{"text": button_text, "type": "link", "url": deep_url}])
    else:
        bot_username = await _get_tg_bot_username()
        if not bot_username:
            raise HTTPException(status_code=500, detail="Не удалось получить username Telegram бота")
        deep_url = f"https://t.me/{bot_username}?start=paid_{tc}"
        inline_buttons = json.dumps([{"text": button_text, "type": "url", "url": deep_url}])

    from ..services.messenger import send_to_channel
    import traceback
    try:
        # Restore file from DB bytes if missing on ephemeral FS
        if file_path and file_data and not os.path.exists(file_path):
            from ..services.file_storage import ensure_file
            file_path = ensure_file(file_path, file_data)
        result = await send_to_channel(
            channel, text,
            file_path=file_path, file_type=file_type,
            inline_buttons=inline_buttons,
            attach_type=attach_type,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Ошибка отправки: {e}")

    msg_id = None
    if isinstance(result, dict):
        msg_id = result.get("message_id") or result.get("result", {}).get("message_id")
        if not msg_id:
            msg_data = result.get("message", {})
            msg_id = msg_data.get("body", {}).get("mid")

    return {"success": True, "message_id": str(msg_id) if msg_id else None}


# ─────────────────────────────────────────────
# Setup status (for guiding users through steps)
# ─────────────────────────────────────────────

@router.get("/{tc}/setup-status")
async def setup_status(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    ps = await fetch_one(
        "SELECT COUNT(*) as count FROM paid_chat_payment_settings WHERE channel_id = $1 AND is_active = 1",
        channel["id"],
    )
    plans = await fetch_one(
        "SELECT COUNT(*) as count FROM paid_chat_plans WHERE channel_id = $1 AND is_active = 1",
        channel["id"],
    )
    chats = await fetch_one(
        "SELECT COUNT(*) as count FROM paid_chats WHERE channel_id = $1 AND is_active = 1",
        channel["id"],
    )
    notifs = await fetch_one(
        "SELECT COUNT(*) as count FROM paid_chat_notifications WHERE channel_id = $1 AND is_active = 1",
        channel["id"],
    )
    has_payment = (ps["count"] if ps else 0) > 0
    has_plans = (plans["count"] if plans else 0) > 0
    has_chats = (chats["count"] if chats else 0) > 0
    has_notifs = (notifs["count"] if notifs else 0) > 0
    return {
        "success": True,
        "has_payment": has_payment,
        "has_plans": has_plans,
        "has_chats": has_chats,
        "has_notifs": has_notifs,
    }
