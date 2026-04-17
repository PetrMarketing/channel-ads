"""
Shared payment gateway service.

Provides unified init functions for all 5 payment providers
(Tinkoff, YooMoney, Prodamus, Robokassa, GetCourse) with configurable
webhook/success/fail URLs, plus helpers for order ID generation and
provider lookup.
"""

import hashlib
import json
import secrets
from urllib.parse import urlencode, quote

import aiohttp
from fastapi import HTTPException

from ..database import fetch_one, execute


# ─────────────────────────────────────────────
# Section → allowed providers mapping
# ─────────────────────────────────────────────

SECTION_PROVIDERS = {
    "paid_chats": ["tinkoff", "yoomoney", "robokassa", "prodamus", "getcourse"],
    "services": ["tinkoff", "yoomoney", "robokassa", "prodamus"],
    "shop": ["tinkoff", "yoomoney", "robokassa", "prodamus"],
}


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

async def get_active_provider(channel_id: int, section: str):
    """Return active payment_settings row for given channel + section."""
    return await fetch_one(
        "SELECT * FROM payment_settings WHERE channel_id = $1 AND section = $2 AND is_active = 1 ORDER BY created_at LIMIT 1",
        channel_id, section,
    )


def generate_order_id(section: str, channel_id: int) -> str:
    """Generate a unique order ID with section prefix."""
    prefix = {"paid_chats": "pc", "services": "sv", "shop": "sh"}.get(section, "xx")
    return f"{prefix}_{channel_id}_{secrets.token_hex(4)}"


def get_section_from_order_id(order_id: str) -> str:
    """Extract section name from order ID prefix."""
    if order_id.startswith("pc_"):
        return "paid_chats"
    if order_id.startswith("sh_"):
        return "shop"
    if order_id.startswith("sv_"):
        return "services"
    if order_id.startswith("ait_"):
        return "ai_tokens"
    return ""


# ─────────────────────────────────────────────
# Provider init functions
# ─────────────────────────────────────────────

async def init_tinkoff_payment(
    creds: dict,
    order_id: str,
    amount_rub: float,
    description: str,
    webhook_url: str,
    success_url: str,
    fail_url: str,
    phone: str = "",
    email: str = "",
) -> str:
    """Init Tinkoff payment, return PaymentURL."""
    terminal_key = creds.get("terminal_key", "")
    password = creds.get("password", "")
    amount_kopeks = int(amount_rub * 100)

    init_params = {
        "TerminalKey": terminal_key,
        "Amount": amount_kopeks,
        "OrderId": order_id,
        "Description": description[:250],
        "NotificationURL": webhook_url,
        "SuccessURL": success_url,
        "FailURL": fail_url,
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


async def init_yoomoney_payment(
    creds: dict,
    order_id: str,
    amount_rub: float,
    description: str,
    webhook_url: str,
    success_url: str,
    fail_url: str,
    phone: str = "",
    email: str = "",
) -> str:
    """Init YooKassa (YooMoney) payment, return confirmation URL."""
    shop_id = creds.get("shop_id", "")
    secret_key = creds.get("secret_key", "")

    payload = {
        "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": success_url,
        },
        "capture": True,
        "description": description[:128],
        "metadata": {"order_id": order_id},
    }
    if phone or email:
        receipt = {
            "customer": {},
            "items": [
                {
                    "description": description[:128],
                    "quantity": "1",
                    "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
                    "vat_code": 1,
                }
            ],
        }
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
        async with session.post(
            "https://api.yookassa.ru/v3/payments", json=payload, headers=headers, auth=auth
        ) as resp:
            result = await resp.json()
            resp_status = resp.status

    if resp_status >= 400:
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


async def init_prodamus_payment(
    creds: dict,
    order_id: str,
    amount_rub: float,
    description: str,
    webhook_url: str,
    success_url: str,
    fail_url: str,
    customer_name: str = "",
    customer_phone: str = "",
    customer_email: str = "",
) -> str:
    """Build Prodamus payment URL."""
    shop_url = creds.get("shop_url", "").rstrip("/")

    params = {
        "order_id": order_id,
        "products[0][name]": description[:128],
        "products[0][price]": f"{amount_rub:.2f}",
        "products[0][quantity]": "1",
        "do": "pay",
        "urlReturn": fail_url,
        "urlSuccess": success_url,
        "urlNotification": webhook_url,
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
    query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    return f"{shop_url}/?{query}"


async def init_robokassa_payment(
    creds: dict,
    order_id: str,
    amount_rub: float,
    description: str,
    webhook_url: str,
    success_url: str,
    fail_url: str,
    phone: str = "",
    email: str = "",
) -> str:
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


async def init_getcourse_payment(
    creds: dict,
    order_id: str,
    amount_rub: float,
    description: str,
    webhook_url: str,
    success_url: str,
    fail_url: str,
    customer_name: str = "",
    customer_phone: str = "",
    customer_email: str = "",
) -> str:
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
# Unified dispatcher
# ─────────────────────────────────────────────

async def init_payment(
    section: str,
    provider: str,
    creds: dict,
    order_id: str,
    amount: float,
    description: str,
    app_url: str,
    **kwargs,
) -> str:
    """Dispatch to correct provider. Returns payment URL.

    Builds section-agnostic webhook/success/fail URLs from app_url,
    then delegates to the appropriate provider init function.
    """
    webhook_base = f"{app_url}/api/payments/webhook"
    success_url = f"{app_url}/payment/success/{order_id}"
    fail_url = f"{app_url}/payment/fail/{order_id}"

    if provider == "tinkoff":
        return await init_tinkoff_payment(
            creds, order_id, amount, description,
            f"{webhook_base}/tinkoff", success_url, fail_url,
            kwargs.get("phone", ""), kwargs.get("email", ""),
        )
    elif provider == "yoomoney":
        return await init_yoomoney_payment(
            creds, order_id, amount, description,
            f"{webhook_base}/yoomoney", success_url, fail_url,
            kwargs.get("phone", ""), kwargs.get("email", ""),
        )
    elif provider == "prodamus":
        return await init_prodamus_payment(
            creds, order_id, amount, description,
            f"{webhook_base}/prodamus", success_url, fail_url,
            kwargs.get("customer_name", ""), kwargs.get("customer_phone", ""), kwargs.get("customer_email", ""),
        )
    elif provider == "robokassa":
        return await init_robokassa_payment(
            creds, order_id, amount, description,
            f"{webhook_base}/robokassa", success_url, fail_url,
            kwargs.get("phone", ""), kwargs.get("email", ""),
        )
    elif provider == "getcourse":
        return await init_getcourse_payment(
            creds, order_id, amount, description,
            f"{webhook_base}/getcourse", success_url, fail_url,
            kwargs.get("customer_name", ""), kwargs.get("customer_phone", ""), kwargs.get("customer_email", ""),
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown payment provider: {provider}")
