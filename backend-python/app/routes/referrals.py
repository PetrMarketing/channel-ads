"""Referral system: links, signups, earnings, balance."""
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

COMMISSION_TIERS = {
    1: 10,   # 1 month = 10%
    3: 20,   # 3 months = 20%
    6: 30,   # 6 months = 30%
    12: 50,  # 12 months = 50%
}


def _gen_code(length=8):
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(length))


# ─── Dashboard ───

@router.get("/dashboard")
async def referral_dashboard(user: Dict = Depends(get_current_user)):
    user_id = user["id"]

    # Total signups
    total_signups = await fetch_one(
        "SELECT COUNT(*) as cnt FROM referral_signups WHERE referrer_user_id = $1", user_id
    )
    # Total earned
    total_earned = await fetch_one(
        "SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_earnings WHERE referrer_user_id = $1", user_id
    )
    # Balance
    balance = user.get("referral_balance") or 0

    # Conversion: signups / total link clicks (approximate from signups)
    links = await fetch_all("SELECT id FROM referral_links WHERE user_id = $1", user_id)
    link_ids = [l["id"] for l in links]
    total_referred = total_signups["cnt"] if total_signups else 0

    return {
        "success": True,
        "total_invited": total_referred,
        "total_earned": float(total_earned["total"]) if total_earned else 0,
        "balance": float(balance),
        "commission_tiers": COMMISSION_TIERS,
    }


# ─── Links ───

@router.get("/links")
async def list_links(user: Dict = Depends(get_current_user)):
    links = await fetch_all(
        "SELECT * FROM referral_links WHERE user_id = $1 ORDER BY created_at", user["id"]
    )
    result = []
    for link in links:
        signups = await fetch_one(
            "SELECT COUNT(*) as cnt FROM referral_signups WHERE referral_link_id = $1", link["id"]
        )
        earned = await fetch_one(
            "SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_earnings WHERE referrer_user_id = $1",
            user["id"],
        )
        result.append({
            **link,
            "signups": signups["cnt"] if signups else 0,
            "earned": float(earned["total"]) if earned else 0,
        })
    return {"success": True, "links": result}


@router.post("/links")
async def create_link(request: Request, user: Dict = Depends(get_current_user)):
    body = await request.json()
    name = body.get("name", "")
    code = _gen_code()
    link_id = await execute_returning_id(
        "INSERT INTO referral_links (user_id, code, name) VALUES ($1, $2, $3) RETURNING id",
        user["id"], code, name,
    )
    return {"success": True, "id": link_id, "code": code}


@router.delete("/links/{link_id}")
async def delete_link(link_id: int, user: Dict = Depends(get_current_user)):
    await execute("DELETE FROM referral_links WHERE id = $1 AND user_id = $2", link_id, user["id"])
    return {"success": True}


# ─── Earnings history ───

@router.get("/earnings")
async def list_earnings(user: Dict = Depends(get_current_user)):
    rows = await fetch_all(
        """SELECT re.*, u.first_name as referred_name, u.username as referred_username
           FROM referral_earnings re
           LEFT JOIN users u ON u.id = re.referred_user_id
           WHERE re.referrer_user_id = $1
           ORDER BY re.created_at DESC LIMIT 100""",
        user["id"],
    )
    return {"success": True, "earnings": rows}


# ─── Use balance to pay for channel subscription ───

@router.post("/use-balance")
async def use_balance(request: Request, user: Dict = Depends(get_current_user)):
    body = await request.json()
    tracking_code = body.get("tracking_code")
    months = body.get("months", 1)

    if not tracking_code:
        raise HTTPException(400, "tracking_code обязателен")

    # Get tariff price
    from .billing import get_duration_options
    durations = await get_duration_options()
    if months not in durations:
        raise HTTPException(400, "Неверный срок")

    price = durations[months]["price"]
    balance = float(user.get("referral_balance") or 0)

    if balance < price:
        raise HTTPException(400, f"Недостаточно средств. Нужно {price} ₽, доступно {balance} ₽")

    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(404, "Канал не найден")

    # Deduct balance
    await execute(
        "UPDATE users SET referral_balance = referral_balance - $1 WHERE id = $2",
        price, user["id"],
    )

    # Activate/extend billing
    from datetime import datetime, timedelta
    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel["id"])
    now = datetime.utcnow()
    if billing and billing.get("expires_at") and billing["expires_at"] > now:
        new_expires = billing["expires_at"] + timedelta(days=months * 30)
    else:
        new_expires = now + timedelta(days=months * 30)

    if billing:
        await execute(
            "UPDATE channel_billing SET status = 'active', expires_at = $1, plan = 'paid', billing_months = $2 WHERE channel_id = $3",
            new_expires, months, channel["id"],
        )
    else:
        await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, max_users, billing_months, status, expires_at) VALUES ($1, 'paid', 1, $2, 'active', $3) RETURNING id",
            channel["id"], months, new_expires,
        )

    return {"success": True, "new_balance": balance - price, "expires_at": new_expires.isoformat()}


# ─── Process referral commission (called from billing webhook) ───

async def process_referral_commission(referred_user_id: int, payment_amount: float, months: int):
    """Award commission to referrer when referred user pays."""
    signup = await fetch_one(
        "SELECT referrer_user_id FROM referral_signups WHERE referred_user_id = $1", referred_user_id
    )
    if not signup:
        return

    referrer_id = signup["referrer_user_id"]
    commission_pct = COMMISSION_TIERS.get(months, 10)
    commission = round(payment_amount * commission_pct / 100, 2)

    await execute_returning_id(
        """INSERT INTO referral_earnings (referrer_user_id, referred_user_id, amount, commission_percent, commission_amount)
           VALUES ($1, $2, $3, $4, $5) RETURNING id""",
        referrer_id, referred_user_id, payment_amount, commission_pct, commission,
    )

    await execute(
        "UPDATE users SET referral_balance = COALESCE(referral_balance, 0) + $1 WHERE id = $2",
        commission, referrer_id,
    )
    print(f"[Referral] User {referrer_id} earned {commission} RUB ({commission_pct}%) from user {referred_user_id}")


# ─── Register referral signup ───

@router.post("/register")
async def register_referral_endpoint(request: Request, user: Dict = Depends(get_current_user)):
    body = await request.json()
    ref_code = body.get("ref_code", "")
    if ref_code:
        await register_referral(user["id"], ref_code)
    return {"success": True}


async def register_referral(referred_user_id: int, ref_code: str):
    """Register a new user as referred by the ref_code owner."""
    link = await fetch_one("SELECT * FROM referral_links WHERE code = $1", ref_code)
    if not link:
        return
    if link["user_id"] == referred_user_id:
        return  # Can't refer yourself

    existing = await fetch_one("SELECT id FROM referral_signups WHERE referred_user_id = $1", referred_user_id)
    if existing:
        return  # Already referred

    await execute_returning_id(
        "INSERT INTO referral_signups (referral_link_id, referrer_user_id, referred_user_id) VALUES ($1, $2, $3) RETURNING id",
        link["id"], link["user_id"], referred_user_id,
    )
    await execute("UPDATE users SET referred_by = $1 WHERE id = $2", link["user_id"], referred_user_id)
    print(f"[Referral] User {referred_user_id} registered via ref code {ref_code} (referrer: {link['user_id']})")
