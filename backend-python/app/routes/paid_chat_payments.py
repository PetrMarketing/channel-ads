"""
Public payment flow for paid chats.

End-user flow:
1. GET  /api/paid-chat-pay/{tc}/info       — channel info, plans, chats
2. POST /api/paid-chat-pay/{tc}/create     — initiate payment, get redirect URL
3. POST /api/paid-chat-pay/webhook/{prov}  — provider webhook → auto-add member
4. GET  /api/paid-chat-pay/status/{order}  — poll payment status
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode

import aiohttp
from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

async def _get_channel_by_tc(tc: str):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1", tc)


async def _get_active_provider(channel_id: int):
    """Return first active payment provider + credentials for a channel."""
    row = await fetch_one(
        "SELECT * FROM paid_chat_payment_settings WHERE channel_id = $1 AND is_active = 1 ORDER BY created_at LIMIT 1",
        channel_id,
    )
    return row


def _generate_order_id(channel_id: int) -> str:
    short = uuid.uuid4().hex[:8]
    return f"pc_{channel_id}_{short}"


async def _fulfill_payment(order_id: str, gateway_response: dict = None):
    """After confirmed payment: create member, send invite link, send notification."""
    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment or payment["status"] == "paid":
        return  # already processed or not found

    # Mark paid
    await execute(
        "UPDATE paid_chat_payments SET status = 'paid', paid_at = NOW(), gateway_response = $1 WHERE id = $2",
        json.dumps(gateway_response or {}, ensure_ascii=False), payment["id"],
    )

    plan = await fetch_one("SELECT * FROM paid_chat_plans WHERE id = $1", payment["plan_id"])
    chat = await fetch_one("SELECT * FROM paid_chats WHERE id = $1", payment["paid_chat_id"])
    if not plan or not chat:
        print(f"[PaidChatPay] fulfill: plan or chat not found for order {order_id}")
        return

    # Calculate expiry
    expires_at = None
    if plan["plan_type"] == "recurring":
        expires_at = datetime.utcnow() + timedelta(days=plan["duration_days"])

    # Generate unique invite link
    from .paid_chats import _create_unique_invite_link
    member_name = payment.get("first_name") or payment.get("username") or ""
    invite_link = await _create_unique_invite_link(
        chat["chat_id"], chat.get("platform", payment.get("platform", "telegram")), member_name
    )

    # Create member
    mid = await execute_returning_id(
        """INSERT INTO paid_chat_members
             (paid_chat_id, channel_id, telegram_id, max_user_id, username, first_name, platform,
              plan_id, status, amount_paid, starts_at, expires_at, invite_link, payment_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,NOW(),$10,$11,$12) RETURNING id""",
        payment["paid_chat_id"],
        payment["channel_id"],
        payment.get("telegram_id"),
        payment.get("max_user_id"),
        payment.get("username", ""),
        payment.get("first_name", ""),
        payment.get("platform", "telegram"),
        payment["plan_id"],
        float(payment["amount"]),
        expires_at,
        invite_link,
        order_id,
    )

    # Send after_subscribe notification
    from .paid_chats import _send_after_subscribe
    body = {
        "telegram_id": payment.get("telegram_id"),
        "max_user_id": payment.get("max_user_id"),
    }
    await _send_after_subscribe(
        payment["channel_id"], chat, body, invite_link,
        payment.get("platform", "telegram"),
        payment.get("telegram_id"),
        payment.get("max_user_id"),
    )
    print(f"[PaidChatPay] Fulfilled order {order_id}, member_id={mid}")


# ─────────────────────────────────────────────
# Provider: payment initiation
# ─────────────────────────────────────────────

async def _init_tinkoff_payment(creds: dict, order_id: str, amount_rub: float, description: str, phone: str = "", email: str = "") -> str:
    """Init Tinkoff payment, return PaymentURL."""
    terminal_key = creds.get("terminal_key", "")
    password = creds.get("password", "")
    amount_kopeks = int(amount_rub * 100)

    init_params = {
        "TerminalKey": terminal_key,
        "Amount": amount_kopeks,
        "OrderId": order_id,
        "Description": description[:250],
        "NotificationURL": f"{settings.APP_URL}/api/paid-chat-pay/webhook/tinkoff",
        "SuccessURL": f"{settings.APP_URL}/payment-success?redirect=/paid-chat-pay/success/{order_id}",
        "FailURL": f"{settings.APP_URL}/paid-chat-pay/fail/{order_id}",
    }
    # Customer data (not included in token signature)
    data = {}
    if phone:
        data["Phone"] = phone
    if email:
        data["Email"] = email
    if data:
        init_params["DATA"] = data

    # Generate token
    d = dict(init_params)
    d["Password"] = password
    exclude_keys = {"Token", "Receipt", "DATA"}
    sorted_keys = sorted(k for k in d.keys() if k not in exclude_keys)
    parts = []
    for k in sorted_keys:
        v = d[k]
        if isinstance(v, bool):
            parts.append("true" if v else "false")
        else:
            parts.append(str(v))
    token = hashlib.sha256("".join(parts).encode()).hexdigest()
    init_params["Token"] = token

    async with aiohttp.ClientSession() as session:
        async with session.post("https://securepay.tinkoff.ru/v2/Init", json=init_params) as resp:
            result = await resp.json()

    if not result.get("Success"):
        raise HTTPException(status_code=502, detail=result.get("Message", "Tinkoff payment init failed"))

    return result["PaymentURL"]


async def _init_yoomoney_payment(creds: dict, order_id: str, amount_rub: float, description: str, phone: str = "", email: str = "") -> str:
    """Init YooKassa (YooMoney) payment, return confirmation URL."""
    shop_id = creds.get("shop_id", "")
    secret_key = creds.get("secret_key", "")

    payload = {
        "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": f"{settings.APP_URL}/payment-success?redirect=/paid-chat-pay/success/{order_id}",
        },
        "capture": True,
        "description": description[:128],
        "metadata": {"order_id": order_id},
    }
    if phone or email:
        receipt = {"customer": {}, "items": [{"description": description[:128], "quantity": "1", "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"}, "vat_code": 1}]}
        if phone:
            receipt["customer"]["phone"] = phone
        if email:
            receipt["customer"]["email"] = email
        payload["receipt"] = receipt

    headers = {
        "Content-Type": "application/json",
        "Idempotence-Key": order_id,
    }

    async with aiohttp.ClientSession() as session:
        auth = aiohttp.BasicAuth(shop_id, secret_key)
        async with session.post("https://api.yookassa.ru/v3/payments", json=payload, headers=headers, auth=auth) as resp:
            result = await resp.json()

    if resp.status >= 400:
        detail = result.get("description", result.get("message", "YooKassa payment init failed"))
        raise HTTPException(status_code=502, detail=detail)

    # Save provider payment ID
    provider_id = result.get("id", "")
    if provider_id:
        await execute(
            "UPDATE paid_chat_payments SET provider_payment_id = $1 WHERE order_id = $2",
            provider_id, order_id,
        )

    confirmation_url = result.get("confirmation", {}).get("confirmation_url", "")
    if not confirmation_url:
        raise HTTPException(status_code=502, detail="YooKassa: no confirmation URL")
    return confirmation_url


async def _init_prodamus_payment(creds: dict, order_id: str, amount_rub: float, description: str, customer_name: str = "", customer_phone: str = "", customer_email: str = "") -> str:
    """Build Prodamus payment URL."""
    shop_url = creds.get("shop_url", "").rstrip("/")

    params = {
        "order_id": order_id,
        "products[0][name]": description[:128],
        "products[0][price]": f"{amount_rub:.2f}",
        "products[0][quantity]": "1",
        "do": "pay",
        "urlReturn": f"{settings.APP_URL}/paid-chat-pay/fail/{order_id}",
        "urlSuccess": f"{settings.APP_URL}/payment-success?redirect=/paid-chat-pay/success/{order_id}",
        "urlNotification": f"{settings.APP_URL}/api/paid-chat-pay/webhook/prodamus",
    }
    if customer_name:
        params["customer_extra"] = customer_name
    if customer_phone:
        params["customer_phone"] = customer_phone
    if customer_email:
        params["customer_email"] = customer_email

    # Prodamus: send via POST to API and get payment link back
    api_key = creds.get("api_key", "")

    # Try API method first (POST to /link with secret in header)
    if api_key:
        try:
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Bearer {api_key}",
            }
            params["do"] = "link"  # return link instead of redirect
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{shop_url}/", data=params, headers=headers) as resp:
                    result_text = await resp.text()
                    print(f"[Prodamus] API response: status={resp.status} body={result_text[:300]}")
                    if resp.status == 200 and result_text.startswith("http"):
                        return result_text.strip()
        except Exception as e:
            print(f"[Prodamus] API error: {e}")

    # Fallback: build URL without signature
    params["do"] = "pay"
    from urllib.parse import quote
    query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    return f"{shop_url}/?{query}"


async def _init_robokassa_payment(creds: dict, order_id: str, amount_rub: float, description: str, phone: str = "", email: str = "") -> str:
    """Build Robokassa payment URL."""
    merchant_login = creds.get("merchant_login", "")
    password1 = creds.get("password1", "")

    # Signature: MD5(MerchantLogin:OutSum:InvId:Password#1)
    out_sum = f"{amount_rub:.2f}"
    # InvId must be numeric; use hash of order_id
    inv_id = str(abs(hash(order_id)) % 2147483647)
    sign_str = f"{merchant_login}:{out_sum}:{inv_id}:{password1}"
    signature = hashlib.md5(sign_str.encode()).hexdigest()

    # Store inv_id for webhook matching
    await execute(
        "UPDATE paid_chat_payments SET provider_payment_id = $1 WHERE order_id = $2",
        inv_id, order_id,
    )

    params = {
        "MerchantLogin": merchant_login,
        "OutSum": out_sum,
        "InvId": inv_id,
        "Description": description[:100],
        "SignatureValue": signature,
        "Shp_order_id": order_id,
    }
    if email:
        params["Email"] = email

    return f"https://auth.robokassa.ru/Merchant/Index.aspx?{urlencode(params)}"


async def _init_getcourse_payment(creds: dict, order_id: str, amount_rub: float, description: str, customer_name: str = "", customer_phone: str = "", customer_email: str = "") -> str:
    """Create GetCourse deal via API and return payment link."""
    import base64

    account = creds.get("account", "") or creds.get("account_name", "")
    secret_key = creds.get("secret_key", "")
    offer_code = creds.get("offer_code", "")

    if not account or not secret_key:
        raise HTTPException(status_code=400, detail="GetCourse: не указан аккаунт или секретный ключ")

    if not customer_email:
        raise HTTPException(status_code=400, detail="GetCourse: email обязателен для создания заказа")

    params = {
        "user": {
            "email": customer_email,
            "phone": customer_phone,
            "first_name": customer_name,
        },
        "system": {
            "refresh_if_exists": 1,
            "return_payment_link": 1,
        },
        "deal": {
            "deal_cost": str(int(amount_rub) if amount_rub == int(amount_rub) else amount_rub),
            "deal_status": "new",
            "deal_is_paid": "no",
            "deal_currency": "RUB",
            "deal_comment": f"order_id: {order_id}",
        },
    }
    if offer_code:
        params["deal"]["offer_code"] = offer_code
    else:
        params["deal"]["product_title"] = description

    params_b64 = base64.b64encode(json.dumps(params, ensure_ascii=False).encode()).decode()

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"https://{account}.getcourse.ru/pl/api/deals",
            data={"action": "add", "key": secret_key, "params": params_b64},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ) as resp:
            result = await resp.json()

    if not result.get("success"):
        error_msg = result.get("error_message") or result.get("result", {}).get("error_message") or "Unknown error"
        raise HTTPException(status_code=502, detail=f"GetCourse API error: {error_msg}")

    deal_result = result.get("result", {})
    payment_link = deal_result.get("payment_link", "")
    deal_id = deal_result.get("deal_id")

    if deal_id:
        await execute(
            "UPDATE paid_chat_payments SET provider_payment_id = $1 WHERE order_id = $2",
            str(deal_id), order_id,
        )

    if not payment_link:
        # Fallback: link to account page
        payment_link = f"https://{account}.getcourse.ru"

    return payment_link


# ─────────────────────────────────────────────
# Public endpoints
# ─────────────────────────────────────────────

@router.get("/{tc}/info")
async def get_payment_info(tc: str):
    """Public: get channel info, active plans, active chats."""
    channel = await _get_channel_by_tc(tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    plans = await fetch_all(
        "SELECT id, plan_type, duration_days, price, currency, title, description FROM paid_chat_plans WHERE channel_id = $1 AND is_active = 1 ORDER BY sort_order, price",
        channel["id"],
    )
    chats = await fetch_all(
        "SELECT id, title, username, platform FROM paid_chats WHERE channel_id = $1 AND is_active = 1 ORDER BY created_at",
        channel["id"],
    )

    # Get before_subscribe notification text
    notif = await fetch_one(
        "SELECT message_text FROM paid_chat_notifications WHERE channel_id = $1 AND event_type = 'before_subscribe' AND is_active = 1",
        channel["id"],
    )

    return {
        "success": True,
        "channel": {
            "title": channel.get("title", ""),
            "username": channel.get("username", ""),
            "platform": channel.get("platform", "telegram"),
        },
        "plans": plans,
        "chats": chats,
        "description": notif["message_text"] if notif else "",
        "privacy_policy_url": channel.get("privacy_policy_url", ""),
    }


@router.post("/{tc}/create")
async def create_payment(tc: str, request: Request):
    """Public: initiate payment for a paid chat plan.

    Body:
      plan_id: int
      paid_chat_id: int
      platform: "telegram" | "max"
      telegram_id?: int
      max_user_id?: str
      username?: str
      first_name?: str
    """
    channel = await _get_channel_by_tc(tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    plan_id = body.get("plan_id")
    paid_chat_id = body.get("paid_chat_id")
    platform = body.get("platform", "telegram")
    telegram_id = body.get("telegram_id")
    max_user_id = body.get("max_user_id")
    username = body.get("username", "")
    first_name = body.get("first_name", "")

    if not plan_id or not paid_chat_id:
        raise HTTPException(status_code=400, detail="plan_id и paid_chat_id обязательны")

    # Validate plan & chat belong to channel
    plan = await fetch_one(
        "SELECT * FROM paid_chat_plans WHERE id = $1 AND channel_id = $2 AND is_active = 1",
        plan_id, channel["id"],
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Тариф не найден")

    chat = await fetch_one(
        "SELECT * FROM paid_chats WHERE id = $1 AND channel_id = $2 AND is_active = 1",
        paid_chat_id, channel["id"],
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")

    # Check if user already has active membership
    existing_member = None
    if telegram_id:
        existing_member = await fetch_one(
            "SELECT * FROM paid_chat_members WHERE paid_chat_id = $1 AND telegram_id = $2 AND status = 'active'",
            paid_chat_id, int(telegram_id),
        )
    elif max_user_id:
        existing_member = await fetch_one(
            "SELECT * FROM paid_chat_members WHERE paid_chat_id = $1 AND max_user_id = $2 AND status = 'active'",
            paid_chat_id, str(max_user_id),
        )
    if existing_member:
        raise HTTPException(status_code=400, detail="У вас уже есть активная подписка на этот чат")

    # Get payment provider
    provider_row = await _get_active_provider(channel["id"])
    if not provider_row:
        raise HTTPException(status_code=400, detail="Платёжная система не настроена")

    provider = provider_row["provider"]
    creds = provider_row["credentials"]
    if isinstance(creds, str):
        creds = json.loads(creds)

    amount = float(plan["price"])
    order_id = _generate_order_id(channel["id"])
    description = f"{plan.get('title') or 'Подписка'} — {chat.get('title') or 'чат'}"

    # Save payment record
    await execute_returning_id(
        """INSERT INTO paid_chat_payments
             (channel_id, plan_id, paid_chat_id, provider, order_id, amount, currency,
              telegram_id, max_user_id, username, first_name, platform)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id""",
        channel["id"], plan_id, paid_chat_id, provider, order_id, amount,
        plan.get("currency", "RUB"),
        int(telegram_id) if telegram_id else None,
        str(max_user_id) if max_user_id else None,
        username, first_name, platform,
    )

    # Init payment with provider
    customer_name = first_name or username or ""
    customer_phone = body.get("phone", "")
    customer_email = body.get("email", "")
    if provider == "tinkoff":
        payment_url = await _init_tinkoff_payment(creds, order_id, amount, description, customer_phone, customer_email)
    elif provider == "yoomoney":
        payment_url = await _init_yoomoney_payment(creds, order_id, amount, description, customer_phone, customer_email)
    elif provider == "prodamus":
        payment_url = await _init_prodamus_payment(creds, order_id, amount, description, customer_name, customer_phone, customer_email)
    elif provider == "robokassa":
        payment_url = await _init_robokassa_payment(creds, order_id, amount, description, customer_phone, customer_email)
    elif provider == "getcourse":
        payment_url = await _init_getcourse_payment(creds, order_id, amount, description, customer_name, customer_phone, customer_email)
    else:
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый провайдер: {provider}")

    return {
        "success": True,
        "payment_url": payment_url,
        "order_id": order_id,
    }


@router.post("/confirm/{order_id}")
async def confirm_payment_from_redirect(order_id: str, request: Request):
    """Called when user returns from payment page with success status.
    Fulfills payment if not already done (fallback for missing webhooks)."""
    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment:
        return {"success": False, "error": "Платёж не найден"}
    if payment["status"] == "paid":
        return {"success": True, "already_paid": True}
    # Fulfill — trust the redirect (webhook may arrive later and will be ignored since status=paid)
    await _fulfill_payment(order_id, {"source": "redirect_confirm"})
    return {"success": True}


@router.get("/status/{order_id}")
async def get_payment_status(order_id: str):
    """Public: check payment status (for polling)."""
    payment = await fetch_one(
        "SELECT id, status, paid_at FROM paid_chat_payments WHERE order_id = $1",
        order_id,
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    return {
        "success": True,
        "status": payment["status"],
        "paid": payment["status"] == "paid",
    }


# ─────────────────────────────────────────────
# Webhooks
# ─────────────────────────────────────────────

@router.post("/webhook/tinkoff")
async def webhook_tinkoff(request: Request):
    """Tinkoff payment notification."""
    body = await request.json()
    order_id = body.get("OrderId", "")
    status = body.get("Status", "")
    token = body.get("Token", "")

    if not order_id.startswith("pc_"):
        return {"success": True}  # not a paid-chat payment

    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment:
        return {"success": True}

    # Verify token using channel's Tinkoff credentials
    provider_row = await fetch_one(
        "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = 'tinkoff' AND is_active = 1",
        payment["channel_id"],
    )
    if provider_row:
        creds = provider_row["credentials"]
        if isinstance(creds, str):
            creds = json.loads(creds)
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
        await _fulfill_payment(order_id, body)
    elif status in ("REJECTED", "CANCELED"):
        await execute(
            "UPDATE paid_chat_payments SET status = 'failed', gateway_response = $1 WHERE order_id = $2",
            json.dumps(body), order_id,
        )

    return {"success": True}


@router.post("/webhook/yoomoney")
async def webhook_yoomoney(request: Request):
    """YooKassa (YooMoney) payment notification."""
    body = await request.json()
    event = body.get("event", "")
    obj = body.get("object", {})
    metadata = obj.get("metadata", {})
    order_id = metadata.get("order_id", "")

    if not order_id.startswith("pc_"):
        return {"success": True}

    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment:
        return {"success": True}

    if event == "payment.succeeded":
        await _fulfill_payment(order_id, body)
    elif event == "payment.canceled":
        await execute(
            "UPDATE paid_chat_payments SET status = 'failed', gateway_response = $1 WHERE order_id = $2",
            json.dumps(body), order_id,
        )

    return {"success": True}


@router.post("/webhook/prodamus")
async def webhook_prodamus(request: Request):
    """Prodamus payment notification."""
    body = await request.json()
    order_id = body.get("order_id") or body.get("order_num", "")
    status = body.get("payment_status", "")

    if not order_id.startswith("pc_"):
        return {"success": True}

    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment:
        return {"success": True}

    # Verify signature if api_key is set
    provider_row = await fetch_one(
        "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = 'prodamus' AND is_active = 1",
        payment["channel_id"],
    )
    if provider_row:
        creds = provider_row["credentials"]
        if isinstance(creds, str):
            creds = json.loads(creds)
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
        await _fulfill_payment(order_id, body)
    elif status in ("fail", "rejected"):
        await execute(
            "UPDATE paid_chat_payments SET status = 'failed', gateway_response = $1 WHERE order_id = $2",
            json.dumps(body), order_id,
        )

    return {"success": True}


@router.post("/webhook/robokassa")
async def webhook_robokassa(request: Request):
    """Robokassa result URL (server notification)."""
    # Robokassa sends POST with form data
    try:
        body = await request.json()
    except Exception:
        body = dict(await request.form())

    out_sum = body.get("OutSum", "")
    inv_id = body.get("InvId", "")
    sig = body.get("SignatureValue", "")
    order_id = body.get("Shp_order_id", "")

    if not order_id.startswith("pc_"):
        return "OK"

    payment = await fetch_one("SELECT * FROM paid_chat_payments WHERE order_id = $1", order_id)
    if not payment:
        return "OK"

    # Verify signature: MD5(OutSum:InvId:Password#2:Shp_order_id=value)
    provider_row = await fetch_one(
        "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = 'robokassa' AND is_active = 1",
        payment["channel_id"],
    )
    if provider_row:
        creds = provider_row["credentials"]
        if isinstance(creds, str):
            creds = json.loads(creds)
        password2 = creds.get("password2", "")
        sign_str = f"{out_sum}:{inv_id}:{password2}:Shp_order_id={order_id}"
        expected = hashlib.md5(sign_str.encode()).hexdigest().upper()
        if sig.upper() != expected:
            raise HTTPException(status_code=400, detail="Invalid signature")

    await _fulfill_payment(order_id, dict(body))
    return f"OK{inv_id}"


@router.post("/webhook/getcourse/{tc}")
async def webhook_getcourse(tc: str, request: Request):
    """GetCourse payment webhook. TC = channel tracking code."""
    try:
        body = await request.json()
    except Exception:
        body = dict(await request.form())

    action = body.get("action", "")
    payment_id = body.get("payment_id") or body.get("id") or ""
    email = body.get("user", {}).get("email") or body.get("email", "")
    amount = body.get("payment", {}).get("amount") or body.get("amount", 0)
    status = body.get("payment", {}).get("status") or body.get("status", "")

    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        return {"status": "error", "message": "channel not found"}

    # Verify secret if configured
    provider_row = await fetch_one(
        "SELECT credentials FROM paid_chat_payment_settings WHERE channel_id = $1 AND provider = 'getcourse' AND is_active = 1",
        channel["id"],
    )
    if provider_row:
        creds = provider_row["credentials"]
        if isinstance(creds, str):
            creds = json.loads(creds)
        secret_key = creds.get("secret_key", "")
        # GetCourse sends X-Gc-Api-Key header
        request_key = request.headers.get("x-gc-api-key") or request.headers.get("X-Gc-Api-Key") or ""
        if secret_key and request_key != secret_key:
            raise HTTPException(status_code=403, detail="Invalid API key")

    if action == "payment_completed" or status in ("accepted", "paid", "completed"):
        # Try to find existing payment created by bot (by provider_payment_id = deal_id)
        existing = None
        if payment_id:
            existing = await fetch_one(
                "SELECT * FROM paid_chat_payments WHERE provider_payment_id = $1 AND provider = 'getcourse' AND status != 'paid'",
                str(payment_id),
            )
        # Also try by email match (bot stores max_user_id but GetCourse sends email)
        if not existing and email:
            existing = await fetch_one(
                "SELECT * FROM paid_chat_payments WHERE channel_id = $1 AND provider = 'getcourse' AND status != 'paid' AND first_name = $2 ORDER BY created_at DESC LIMIT 1",
                channel["id"], email,
            )

        if existing:
            # Payment was created by bot — fulfill it
            await _fulfill_payment(existing["order_id"], body)
        else:
            # Payment came from GetCourse directly (not via bot) — create new record
            order_id = f"gc_{tc}_{payment_id}"
            plan = await fetch_one("SELECT * FROM paid_chat_plans WHERE channel_id = $1 AND is_active = 1 ORDER BY sort_order LIMIT 1", channel["id"])
            paid_chat = await fetch_one("SELECT * FROM paid_chats WHERE channel_id = $1 AND is_active = 1 LIMIT 1", channel["id"])

            await execute(
                """INSERT INTO paid_chat_payments (channel_id, plan_id, paid_chat_id, provider, order_id, amount, currency, status, username, first_name, platform, provider_payment_id, gateway_response, paid_at)
                   VALUES ($1, $2, $3, 'getcourse', $4, $5, 'RUB', 'paid', $6, $7, 'max', $8, $9, NOW())
                   ON CONFLICT(order_id) DO NOTHING""",
                channel["id"],
                plan["id"] if plan else None,
                paid_chat["id"] if paid_chat else None,
                order_id,
                float(amount) if amount else 0,
                email, email,
                str(payment_id),
                json.dumps(body),
            )
            await _fulfill_payment(order_id, body)

    return {"status": "ok"}
