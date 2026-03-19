import hashlib
import json
from datetime import datetime, timedelta

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()
public_router = APIRouter()

# --- Pricing model: fixed price per duration, per user, with channel discount ---
DURATION_OPTIONS = {
    1:  {"months": 1,  "label": "1 месяц",    "price": 490},
    3:  {"months": 3,  "label": "3 месяца",   "price": 1290},
    6:  {"months": 6,  "label": "6 месяцев",  "price": 2290},
    12: {"months": 12, "label": "12 месяцев", "price": 4990},
}
CHANNEL_DISCOUNT_PERCENT = 10  # 10% скидка за каждый дополнительный канал

STAFF_ROLES = {
    "advertiser": {
        "name": "Рекламодатель",
        "description": "Только трекинг-ссылки",
        "permissions": ["links"],
    },
    "editor": {
        "name": "Редактор",
        "description": "Публикации, закрепы, лид-магниты, розыгрыши",
        "permissions": ["content", "pins", "lead_magnets", "giveaways", "broadcasts"],
    },
    "admin": {
        "name": "Администратор",
        "description": "Доступ ко всем инструментам",
        "permissions": ["all"],
    },
}


def calculate_price(users: int, months: int, channels: int = 1) -> dict:
    """Calculate total price for N users for M months with channel discount."""
    duration = DURATION_OPTIONS.get(months)
    if not duration:
        raise ValueError(f"Invalid duration: {months}")
    base_price = duration["price"]  # fixed price per user for this duration
    # Channel discount: 10% for each additional channel (max 90%)
    extra_channels = max(0, channels - 1)
    channel_discount_pct = min(extra_channels * CHANNEL_DISCOUNT_PERCENT, 90)
    price_per_user = round(base_price * (1 - channel_discount_pct / 100))
    total = price_per_user * users
    return {
        "users": users,
        "months": months,
        "channels": channels,
        "base_price": base_price,
        "channel_discount_percent": channel_discount_pct,
        "price_per_user": price_per_user,
        "total": total,
        "label": duration["label"],
    }


def generate_tinkoff_token(params: dict) -> str:
    """Generate Tinkoff payment token: sort keys, concat values (incl Password), SHA-256.

    Per Tinkoff spec: exclude Receipt, DATA, Token keys; convert booleans to 'true'/'false'.
    """
    d = dict(params)
    d["Password"] = settings.TINKOFF_PASSWORD
    # Exclude non-primitive / special keys
    exclude_keys = {"Token", "Receipt", "DATA"}
    sorted_keys = sorted(k for k in d.keys() if k not in exclude_keys)
    parts = []
    for k in sorted_keys:
        v = d[k]
        if isinstance(v, bool):
            parts.append("true" if v else "false")
        else:
            parts.append(str(v))
    concat = "".join(parts)
    return hashlib.sha256(concat.encode()).hexdigest()


# --- Public routes ---

@public_router.get("/plans")
async def get_plans():
    return {
        "success": True,
        "durations": DURATION_OPTIONS,
        "channel_discount_percent": CHANNEL_DISCOUNT_PERCENT,
        "roles": STAFF_ROLES,
    }


@public_router.post("/webhook/tinkoff")
async def tinkoff_webhook(request: Request):
    body = await request.json()
    order_id = body.get("OrderId", "")
    status = body.get("Status", "")
    token = body.get("Token", "")

    # Verify token
    check_params = {k: v for k, v in body.items() if k not in ("Token", "Receipt", "DATA")}
    expected_token = generate_tinkoff_token(check_params)
    if token != expected_token:
        raise HTTPException(status_code=400, detail="Invalid token")

    # Find payment
    payment = await fetch_one(
        "SELECT * FROM billing_payments WHERE payment_id = $1", order_id
    )
    if not payment:
        payment = await fetch_one(
            "SELECT * FROM billing_payments WHERE provider_payment_id = $1", order_id
        )
    if not payment:
        return {"success": True}

    if status == "CONFIRMED":
        # For multi-channel payments, update ALL payment records with the same payment_id
        all_payments = await fetch_all(
            "SELECT * FROM billing_payments WHERE payment_id = $1", order_id
        )
        if not all_payments:
            all_payments = [payment]
        for pay in all_payments:
            await execute(
                "UPDATE billing_payments SET status = 'paid', gateway_response = $1 WHERE id = $2",
                json.dumps(body), pay["id"],
            )
            billing_ref = pay.get("channel_billing_id") or pay.get("channel_id")
            billing = None
            if pay.get("channel_billing_id"):
                billing = await fetch_one("SELECT * FROM channel_billing WHERE id = $1", billing_ref)
            if not billing and pay.get("channel_id"):
                billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", pay["channel_id"])
            if billing:
                months = billing.get("billing_months") or 1
                current_expires = billing.get("expires_at")
                base = current_expires if current_expires and current_expires > datetime.utcnow() else datetime.utcnow()
                new_expires = base + timedelta(days=30 * months)
                await execute(
                    """UPDATE channel_billing SET status = 'active', expires_at = $1,
                       notified_7d = FALSE, notified_1d = FALSE, notified_expired = FALSE
                       WHERE id = $2""",
                    new_expires, billing["id"],
                )
    elif status == "REJECTED" or status == "CANCELED":
        all_payments = await fetch_all(
            "SELECT * FROM billing_payments WHERE payment_id = $1", order_id
        )
        if not all_payments:
            all_payments = [payment]
        for pay in all_payments:
            await execute(
                "UPDATE billing_payments SET status = 'failed', gateway_response = $1 WHERE id = $2",
                json.dumps(body), pay["id"],
            )

    return {"success": True}


# --- Protected routes ---
# NOTE: fixed-path routes MUST be registered before parameterized /{tracking_code}/... routes

@router.get("/plans")
async def get_plans_protected(user=Depends(get_current_user)):
    """Get pricing info."""
    channels = await fetch_all("SELECT id FROM channels WHERE user_id = $1", user["id"])
    channel_count = len(channels) if channels else 1
    return {
        "success": True,
        "durations": {str(k): v for k, v in DURATION_OPTIONS.items()},
        "channel_discount_percent": CHANNEL_DISCOUNT_PERCENT,
        "channel_count": channel_count,
        "roles": STAFF_ROLES,
    }


@router.get("/overview")
async def billing_overview(user=Depends(get_current_user)):
    from datetime import timezone
    import math
    channels = await fetch_all("SELECT * FROM channels WHERE user_id = $1", user["id"])
    result = []
    for ch in channels:
        billing = await fetch_one(
            "SELECT * FROM channel_billing WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1",
            ch["id"],
        )
        ch_with_billing = dict(ch)
        ch_with_billing["billing"] = billing
        if billing and billing.get("expires_at"):
            expires_at = billing["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                now = datetime.utcnow()
            else:
                now = datetime.now(timezone.utc)
            days_left = max(0, math.ceil((expires_at - now).total_seconds() / 86400))
            ch_with_billing["billing_status"] = billing["status"]
            ch_with_billing["billing_active"] = billing["status"] == "active" and days_left > 0
            ch_with_billing["billing_days_left"] = days_left
            ch_with_billing["expires_at"] = billing["expires_at"].isoformat() if hasattr(billing["expires_at"], "isoformat") else str(billing["expires_at"])
            ch_with_billing["max_users"] = billing.get("max_users", 1)
        else:
            ch_with_billing["billing_status"] = None
            ch_with_billing["billing_active"] = False
            ch_with_billing["billing_days_left"] = 0
            ch_with_billing["expires_at"] = None
            ch_with_billing["max_users"] = 1
        result.append(ch_with_billing)
    return {"success": True, "overview": result, "channels": result}


@router.post("/calculate")
async def calculate(request: Request, user=Depends(get_current_user)):
    """Calculate price for given users and duration."""
    body = await request.json()
    users = max(1, int(body.get("users", 1)))
    months = int(body.get("months", 1))
    if months not in DURATION_OPTIONS:
        raise HTTPException(status_code=400, detail="Неверный срок подписки")
    channels = await fetch_all("SELECT id FROM channels WHERE user_id = $1", user["id"])
    channel_count = len(channels) if channels else 1
    price = calculate_price(users, months, channel_count)
    return {"success": True, **price}


@router.post("/pay-multi")
async def create_multi_payment(request: Request, user=Depends(get_current_user)):
    """Create a single payment for multiple channels with per-channel user counts."""
    body = await request.json()
    months = int(body.get("months", 1))
    channel_configs = body.get("channels", [])

    if months not in DURATION_OPTIONS:
        raise HTTPException(status_code=400, detail="Неверный срок подписки")
    if not channel_configs:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один канал")

    resolved = []
    for cfg in channel_configs:
        tc = cfg.get("tracking_code")
        ch_users = max(1, int(cfg.get("users", 1)))
        channel = await fetch_one(
            "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
            tc, user["id"],
        )
        if not channel:
            raise HTTPException(status_code=404, detail=f"Канал {tc} не найден")
        resolved.append({"channel": channel, "users": ch_users, "tracking_code": tc})

    selected_count = len(resolved)
    base_price = DURATION_OPTIONS[months]["price"]
    extra_channels = max(0, selected_count - 1)
    channel_discount_pct = min(extra_channels * CHANNEL_DISCOUNT_PERCENT, 90)
    price_per_user = round(base_price * (1 - channel_discount_pct / 100))

    total_users = sum(r["users"] for r in resolved)
    total = price_per_user * total_users
    amount_kopeks = total * 100

    billing_ids = []
    channel_amounts = []
    for r in resolved:
        ch = r["channel"]
        ch_amount = price_per_user * r["users"]
        billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", ch["id"])
        if not billing:
            billing_id = await execute_returning_id(
                "INSERT INTO channel_billing (channel_id, plan, max_users, billing_months) VALUES ($1, $2, $3, $4) RETURNING id",
                ch["id"], "paid", r["users"], months,
            )
        else:
            billing_id = billing["id"]
            await execute(
                "UPDATE channel_billing SET plan = $1, max_users = $2, billing_months = $3 WHERE id = $4",
                "paid", r["users"], months, billing_id,
            )
        billing_ids.append(billing_id)
        channel_amounts.append(ch_amount)

    payment_ids = []
    for bid, ch_amount in zip(billing_ids, channel_amounts):
        pid = await execute_returning_id(
            "INSERT INTO billing_payments (channel_billing_id, amount) VALUES ($1, $2) RETURNING id",
            bid, ch_amount,
        )
        payment_ids.append(pid)

    order_id = f"multi_{payment_ids[0]}"
    for pid in payment_ids:
        await execute("UPDATE billing_payments SET payment_id = $1 WHERE id = $2", order_id, pid)

    duration_label = DURATION_OPTIONS[months]["label"]
    channel_titles = ", ".join(r["channel"].get("title", "") for r in resolved)
    description = f"Подписка {duration_label}, {total_users} польз. — {channel_titles}"
    if len(description) > 250:
        description = description[:247] + "..."

    init_params = {
        "TerminalKey": settings.TINKOFF_TERMINAL_KEY,
        "Amount": amount_kopeks,
        "OrderId": order_id,
        "Description": description,
    }
    init_params["Token"] = generate_tinkoff_token(init_params)

    async with aiohttp.ClientSession() as session:
        async with session.post("https://securepay.tinkoff.ru/v2/Init", json=init_params) as resp:
            result = await resp.json()

    if not result.get("Success"):
        raise HTTPException(status_code=502, detail=result.get("Message", "Payment init failed"))

    return {
        "success": True,
        "paymentUrl": result.get("PaymentURL"),
        "payment_url": result.get("PaymentURL"),
        "paymentId": order_id,
    }


@router.get("/{tracking_code}/status")
async def get_billing_status(tracking_code: str, user=Depends(get_current_user)):
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    billing = await fetch_one(
        "SELECT * FROM channel_billing WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1",
        channel["id"],
    )

    is_active = False
    days_left = 0
    if billing and billing.get("expires_at"):
        from datetime import timezone
        import math
        expires_at = billing["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            now = datetime.utcnow()
        else:
            now = datetime.now(timezone.utc)
        days_left = max(0, math.ceil((expires_at - now).total_seconds() / 86400))
        is_active = billing["status"] == "active" and days_left > 0

    # Count staff
    staff_count = 0
    if billing:
        row = await fetch_one(
            "SELECT COUNT(*) as cnt FROM channel_staff WHERE channel_id = $1",
            channel["id"],
        )
        staff_count = row["cnt"] if row else 0

    return {
        "success": True,
        "billing": billing,
        "is_active": is_active,
        "days_left": days_left,
        "staff_count": staff_count,
        "max_users": billing.get("max_users", 1) if billing else 1,
    }


@router.post("/{tracking_code}/pay")
async def create_payment(tracking_code: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    users = max(1, int(body.get("users", 1)))
    months = int(body.get("months", 1))

    if months not in DURATION_OPTIONS:
        raise HTTPException(status_code=400, detail="Неверный срок подписки")

    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    # Count user's channels for discount
    all_channels = await fetch_all("SELECT id FROM channels WHERE user_id = $1", user["id"])
    channel_count = len(all_channels) if all_channels else 1
    price_info = calculate_price(users, months, channel_count)
    amount_kopeks = price_info["total"] * 100

    # Ensure billing record
    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel["id"])
    if not billing:
        billing_id = await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, max_users, billing_months) VALUES ($1, $2, $3, $4) RETURNING id",
            channel["id"], "paid", users, months,
        )
    else:
        billing_id = billing["id"]
        await execute(
            "UPDATE channel_billing SET plan = $1, max_users = $2, billing_months = $3 WHERE id = $4",
            "paid", users, months, billing_id,
        )

    # Create payment record
    payment_id = await execute_returning_id(
        "INSERT INTO billing_payments (channel_billing_id, amount) VALUES ($1, $2) RETURNING id",
        billing_id, price_info["total"],
    )

    order_id = f"ch{channel['id']}_p{payment_id}"
    await execute("UPDATE billing_payments SET payment_id = $1 WHERE id = $2", order_id, payment_id)

    duration_label = DURATION_OPTIONS[months]["label"]
    # Call Tinkoff Init
    init_params = {
        "TerminalKey": settings.TINKOFF_TERMINAL_KEY,
        "Amount": amount_kopeks,
        "OrderId": order_id,
        "Description": f"Подписка {duration_label}, {users} польз. — {channel.get('title', '')}",
    }
    init_params["Token"] = generate_tinkoff_token(init_params)

    async with aiohttp.ClientSession() as session:
        async with session.post("https://securepay.tinkoff.ru/v2/Init", json=init_params) as resp:
            result = await resp.json()

    if not result.get("Success"):
        raise HTTPException(status_code=502, detail=result.get("Message", "Payment init failed"))

    return {
        "success": True,
        "paymentUrl": result.get("PaymentURL"),
        "payment_url": result.get("PaymentURL"),
        "paymentId": order_id,
    }


@router.get("/{tracking_code}/payment-status/{payment_id}")
async def get_payment_status(tracking_code: str, payment_id: str, user=Depends(get_current_user)):
    payment = await fetch_one("SELECT * FROM billing_payments WHERE payment_id = $1", payment_id)
    if not payment:
        payment = await fetch_one("SELECT * FROM billing_payments WHERE provider_payment_id = $1", payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    return {"success": True, "payment": payment}


@router.get("/{tracking_code}/payments")
async def list_payments(tracking_code: str, user=Depends(get_current_user)):
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel["id"])
    if not billing:
        return {"success": True, "payments": []}

    payments = await fetch_all(
        "SELECT * FROM billing_payments WHERE channel_billing_id = $1 ORDER BY created_at DESC",
        billing["id"],
    )
    return {"success": True, "payments": payments}


# --- Staff management ---

@router.get("/{tracking_code}/staff")
async def list_staff(tracking_code: str, user=Depends(get_current_user)):
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    staff = await fetch_all(
        """SELECT cs.id, cs.user_id, cs.role, cs.created_at,
                  u.telegram_id, u.max_user_id, u.first_name, u.last_name, u.username
           FROM channel_staff cs
           JOIN users u ON u.id = cs.user_id
           WHERE cs.channel_id = $1
           ORDER BY cs.created_at""",
        channel["id"],
    )
    return {"success": True, "staff": staff, "roles": STAFF_ROLES}


@router.post("/{tracking_code}/staff")
async def add_staff(tracking_code: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    # Check max_users limit
    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel["id"])
    max_users = billing.get("max_users", 1) if billing else 1
    current_count = await fetch_one(
        "SELECT COUNT(*) as cnt FROM channel_staff WHERE channel_id = $1", channel["id"]
    )
    current = current_count["cnt"] if current_count else 0
    if current + 1 >= max_users:  # +1 because owner counts as 1
        raise HTTPException(
            status_code=400,
            detail=f"Лимит пользователей ({max_users}). Увеличьте количество пользователей в подписке."
        )

    role = body.get("role", "editor")
    if role not in STAFF_ROLES:
        raise HTTPException(status_code=400, detail="Неизвестная роль")

    # Find target user by telegram_id, max_user_id, or username
    identifier = body.get("identifier", "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Укажите Telegram ID, MAX ID или username")

    target_user = None
    # Try numeric ID first (telegram_id)
    if identifier.isdigit():
        target_user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
        if not target_user:
            target_user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    else:
        # Try username (strip @)
        uname = identifier.lstrip("@")
        target_user = await fetch_one("SELECT * FROM users WHERE username = $1", uname)

    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден. Он должен сначала войти в систему.")

    if target_user["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Вы являетесь владельцем канала")

    # Check if already added
    existing = await fetch_one(
        "SELECT * FROM channel_staff WHERE channel_id = $1 AND user_id = $2",
        channel["id"], target_user["id"],
    )
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже добавлен")

    staff_id = await execute_returning_id(
        "INSERT INTO channel_staff (channel_id, user_id, role) VALUES ($1, $2, $3) RETURNING id",
        channel["id"], target_user["id"], role,
    )

    return {"success": True, "staff_id": staff_id}


@router.put("/{tracking_code}/staff/{staff_id}")
async def update_staff_role(tracking_code: str, staff_id: int, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    role = body.get("role")
    if role not in STAFF_ROLES:
        raise HTTPException(status_code=400, detail="Неизвестная роль")

    await execute(
        "UPDATE channel_staff SET role = $1 WHERE id = $2 AND channel_id = $3",
        role, staff_id, channel["id"],
    )
    return {"success": True}


@router.delete("/{tracking_code}/staff/{staff_id}")
async def remove_staff(tracking_code: str, staff_id: int, user=Depends(get_current_user)):
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    await execute("DELETE FROM channel_staff WHERE id = $1 AND channel_id = $2", staff_id, channel["id"])
    return {"success": True}
