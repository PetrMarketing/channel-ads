"""
Universal payment webhook router.

Routes webhook callbacks from all payment providers to the correct
fulfillment handler based on the order_id prefix:
  pc_ -> paid_chats
  sh_ -> shop
  sv_ -> services
"""

import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request

from ..database import fetch_one, fetch_all, execute
from ..services.payment_gateway import get_section_from_order_id

router = APIRouter()


# ─────────────────────────────────────────────
# Credential lookup
# ─────────────────────────────────────────────

async def _get_credentials(order_id: str, provider: str):
    """Get credentials for the section determined by order_id prefix."""
    section = get_section_from_order_id(order_id)
    if not section:
        return None, None
    # AI tokens use global Tinkoff settings
    if section == "ai_tokens":
        from ..config import settings as app_settings
        return {"credentials": {"terminal_key": app_settings.TINKOFF_TERMINAL_KEY, "password": app_settings.TINKOFF_PASSWORD}}, section
    # Extract channel_id from order_id (format: prefix_channelid_hex)
    parts = order_id.split('_')
    if len(parts) < 3:
        return None, None
    try:
        channel_id = int(parts[1])
    except ValueError:
        return None, None
    row = await fetch_one(
        "SELECT credentials FROM payment_settings WHERE channel_id = $1 AND section = $2 AND provider = $3 AND is_active = 1",
        channel_id, section, provider)
    if not row:
        # Fallback to old table for paid_chats backward compatibility
        if section == 'paid_chats':
            row = await fetch_one(
                "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = $2 AND is_active = 1",
                channel_id, provider)
    return row, section


def _parse_creds(row):
    """Extract credentials dict from a DB row."""
    if not row:
        return {}
    creds = row.get("credentials", {})
    if isinstance(creds, str):
        creds = json.loads(creds)
    return creds


# ─────────────────────────────────────────────
# Fulfillment dispatcher
# ─────────────────────────────────────────────

async def _fulfill(order_id: str, section: str, gateway_response: dict):
    """Route fulfillment to correct handler."""
    if section == 'paid_chats':
        from .paid_chat_payments import _fulfill_payment
        await _fulfill_payment(order_id, gateway_response)
    elif section == 'shop':
        await _fulfill_shop(order_id, gateway_response)
    elif section == 'services':
        await _fulfill_service(order_id, gateway_response)
    elif section == 'ai_tokens':
        from .billing import fulfill_ai_tokens
        await fulfill_ai_tokens(order_id)


async def _fulfill_shop(order_id, gateway_response):
    """Mark shop order as paid, notify customer and manager."""
    order = await fetch_one("SELECT * FROM shop_orders WHERE payment_order_id = $1", order_id)
    if not order or order.get('payment_status') == 'paid':
        return
    await execute(
        "UPDATE shop_orders SET payment_status = 'paid', status = 'confirmed' WHERE id = $1",
        order['id'])
    # Notify
    try:
        from ..services.messenger import send_to_user
        items = await fetch_all("SELECT product_name, quantity, price FROM shop_order_items WHERE order_id = $1", order['id'])
        lines = [f"<b>Заказ {order['order_number']} оплачен!</b>\n"]
        for it in items:
            lines.append(f"  {it['product_name']} x{it['quantity']}")
        lines.append(f"\nИтого: <b>{float(order['total']):.0f} RUB</b>")
        # Notify manager
        shop_s = await fetch_one("SELECT manager_user_id FROM shop_settings WHERE channel_id = $1", order['channel_id'])
        if shop_s and shop_s.get('manager_user_id'):
            mgr = await fetch_one("SELECT max_user_id, telegram_id FROM users WHERE id = $1", shop_s['manager_user_id'])
            if mgr:
                text = "\n".join(lines) + f"\n\nКлиент: {order.get('client_name','')} {order.get('client_phone','')}"
                if mgr.get('max_user_id'):
                    await send_to_user(mgr['max_user_id'], 'max', text)
                elif mgr.get('telegram_id'):
                    await send_to_user(int(mgr['telegram_id']), 'telegram', text)
    except Exception as e:
        print(f"[Payment] Shop fulfill notification error: {e}")


async def _fulfill_service(order_id, gateway_response):
    """Mark service booking as paid, notify client."""
    booking = await fetch_one("SELECT * FROM service_bookings WHERE payment_order_id = $1", order_id)
    if not booking or booking.get('payment_status') == 'paid':
        return
    await execute(
        "UPDATE service_bookings SET payment_status = 'paid', paid_at = NOW() WHERE id = $1",
        booking['id'])
    try:
        from ..services.messenger import send_to_user
        specialist = await fetch_one("SELECT name FROM service_specialists WHERE id = $1", booking.get('specialist_id'))
        service = await fetch_one("SELECT name FROM services WHERE id = $1", booking.get('service_id'))
        text = f"<b>Оплата подтверждена!</b>\n\n{service.get('name','') if service else ''} у {specialist.get('name','') if specialist else ''}\n{booking.get('booking_date')} в {booking.get('start_time')}"
        uid = booking.get('client_max_user_id') or booking.get('client_telegram_id')
        platform = 'max' if booking.get('client_max_user_id') else 'telegram'
        if uid:
            if platform == 'telegram':
                uid = int(uid)
            await send_to_user(uid, platform, text)
    except Exception as e:
        print(f"[Payment] Service fulfill notification error: {e}")


async def _mark_failed(order_id: str, section: str, body: dict):
    """Mark payment as failed in the appropriate table."""
    if section == 'paid_chats':
        await execute(
            "UPDATE paid_chat_payments SET status = 'failed', gateway_response = $1 WHERE order_id = $2",
            json.dumps(body), order_id)
    elif section == 'shop':
        await execute(
            "UPDATE shop_orders SET payment_status = 'failed' WHERE payment_order_id = $1",
            order_id)
    elif section == 'services':
        await execute(
            "UPDATE service_bookings SET payment_status = 'failed' WHERE payment_order_id = $1",
            order_id)


# ─────────────────────────────────────────────
# Webhooks
# ─────────────────────────────────────────────

@router.post("/tinkoff")
async def webhook_tinkoff(request: Request):
    """Tinkoff payment notification."""
    body = await request.json()
    order_id = body.get("OrderId", "")
    status = body.get("Status", "")
    token = body.get("Token", "")

    section = get_section_from_order_id(order_id)
    if not section:
        return {"success": True}

    # For paid_chats with pc_ prefix, delegate to original handler for backward compat
    if section == 'paid_chats' and order_id.startswith("pc_"):
        from .paid_chat_payments import webhook_tinkoff as _orig
        return await _orig(request)

    row, section = await _get_credentials(order_id, 'tinkoff')
    if not row:
        return {"success": True}

    # Verify token
    creds = _parse_creds(row)
    password = creds.get("password", "")
    check_params = {k: v for k, v in body.items() if k not in ("Token", "Receipt", "DATA")}
    check_params["Password"] = password
    sorted_keys = sorted(check_params.keys())
    parts = []
    for k in sorted_keys:
        v = check_params[k]
        parts.append("true" if v is True else "false" if v is False else str(v))
    expected = hashlib.sha256("".join(parts).encode()).hexdigest()
    if token != expected:
        raise HTTPException(status_code=400, detail="Invalid token")

    if status == "CONFIRMED":
        await _fulfill(order_id, section, body)
    elif status in ("REJECTED", "CANCELED"):
        await _mark_failed(order_id, section, body)

    return {"success": True}


@router.post("/yoomoney")
async def webhook_yoomoney(request: Request):
    """YooKassa (YooMoney) payment notification."""
    body = await request.json()
    event = body.get("event", "")
    obj = body.get("object", {})
    metadata = obj.get("metadata", {})
    order_id = metadata.get("order_id", "")

    section = get_section_from_order_id(order_id)
    if not section:
        return {"success": True}

    if section == 'paid_chats' and order_id.startswith("pc_"):
        from .paid_chat_payments import webhook_yoomoney as _orig
        return await _orig(request)

    if event == "payment.succeeded":
        await _fulfill(order_id, section, body)
    elif event == "payment.canceled":
        await _mark_failed(order_id, section, body)

    return {"success": True}


@router.post("/prodamus")
async def webhook_prodamus(request: Request):
    """Prodamus payment notification."""
    body = await request.json()
    order_id = body.get("order_id") or body.get("order_num", "")
    status = body.get("payment_status", "")

    section = get_section_from_order_id(order_id)
    if not section:
        return {"success": True}

    if section == 'paid_chats' and order_id.startswith("pc_"):
        from .paid_chat_payments import webhook_prodamus as _orig
        return await _orig(request)

    row, section = await _get_credentials(order_id, 'prodamus')

    # Verify signature if api_key is set
    if row:
        creds = _parse_creds(row)
        api_key = creds.get("api_key", "")
        if api_key:
            sig = body.get("signature", "")
            check_body = {k: v for k, v in body.items() if k != "signature"}
            sorted_body = dict(sorted(check_body.items()))
            sign_str = json.dumps(sorted_body, ensure_ascii=False, separators=(",", ":"))
            expected = hmac.new(api_key.encode(), sign_str.encode(), hashlib.sha256).hexdigest()
            if sig != expected:
                raise HTTPException(status_code=400, detail="Invalid signature")

    if status == "success":
        await _fulfill(order_id, section, body)
    elif status in ("fail", "rejected"):
        await _mark_failed(order_id, section, body)

    return {"success": True}


@router.post("/robokassa")
async def webhook_robokassa(request: Request):
    """Robokassa result URL (server notification)."""
    try:
        body = await request.json()
    except Exception:
        body = dict(await request.form())

    out_sum = body.get("OutSum", "")
    inv_id = body.get("InvId", "")
    sig = body.get("SignatureValue", "")
    order_id = body.get("Shp_order_id", "")

    section = get_section_from_order_id(order_id)
    if not section:
        return "OK"

    if section == 'paid_chats' and order_id.startswith("pc_"):
        from .paid_chat_payments import webhook_robokassa as _orig
        return await _orig(request)

    row, section = await _get_credentials(order_id, 'robokassa')

    # Verify signature: MD5(OutSum:InvId:Password#2:Shp_order_id=value)
    if row:
        creds = _parse_creds(row)
        password2 = creds.get("password2", "")
        sign_str = f"{out_sum}:{inv_id}:{password2}:Shp_order_id={order_id}"
        expected = hashlib.md5(sign_str.encode()).hexdigest().upper()
        if sig.upper() != expected:
            raise HTTPException(status_code=400, detail="Invalid signature")

    await _fulfill(order_id, section, dict(body))
    return f"OK{inv_id}"


@router.post("/getcourse/{tc}")
async def webhook_getcourse(tc: str, request: Request):
    """GetCourse payment webhook. TC = channel tracking code."""
    try:
        body = await request.json()
    except Exception:
        body = dict(await request.form())

    action = body.get("action", "")
    payment_id = body.get("payment_id") or body.get("id") or ""
    status = body.get("payment", {}).get("status") or body.get("status", "")

    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        return {"status": "error", "message": "channel not found"}

    # GetCourse is only supported for paid_chats section, delegate to original handler
    from .paid_chat_payments import webhook_getcourse as _orig
    return await _orig(tc, request)
