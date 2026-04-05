import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query

from ..middleware.admin_auth import (
    get_current_admin, require_superadmin,
    create_admin_jwt, verify_password, hash_password,
)
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


# ---------------------------------------------------------------------------
# Ensure default superadmin exists (called from lifespan)
# ---------------------------------------------------------------------------

async def ensure_default_admin():
    existing = await fetch_one("SELECT id FROM admin_users LIMIT 1")
    if not existing:
        pw = hash_password("admin123")
        await execute_returning_id(
            "INSERT INTO admin_users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id",
            "admin", pw, "Суперадмин", "superadmin",
        )
        print("Default admin created: admin / admin123")


# ===========================
# Auth
# ===========================

@router.post("/auth/login")
async def admin_login(request: Request):
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Введите логин и пароль")
    admin = await fetch_one("SELECT * FROM admin_users WHERE username = $1 AND is_active = 1", username)
    if not admin or not verify_password(password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    await execute("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", admin["id"])
    token = create_admin_jwt(admin["id"])
    return {
        "success": True,
        "token": token,
        "admin": {"id": admin["id"], "username": admin["username"], "display_name": admin["display_name"], "role": admin["role"]},
    }


@router.get("/auth/me")
async def admin_me(admin: Dict = Depends(get_current_admin)):
    return {
        "success": True,
        "admin": {"id": admin["id"], "username": admin["username"], "display_name": admin["display_name"], "role": admin["role"]},
    }


# ===========================
# Dashboard
# ===========================

@router.get("/dashboard/stats")
async def dashboard_stats(admin: Dict = Depends(get_current_admin)):
    users = await fetch_one("SELECT COUNT(*) as c FROM users")
    channels = await fetch_one("SELECT COUNT(*) as c FROM channels")
    subscribers = await fetch_one("SELECT COUNT(*) as c FROM subscriptions")
    active_billing = await fetch_one("SELECT COUNT(*) as c FROM channel_billing WHERE status = 'active' AND expires_at > NOW()")
    leads = await fetch_one("SELECT COUNT(*) as c FROM leads")
    try:
        pins = await fetch_one("SELECT COUNT(*) as c FROM pin_posts")
        broadcasts = await fetch_one("SELECT COUNT(*) as c FROM broadcasts")
        giveaways = await fetch_one("SELECT COUNT(*) as c FROM giveaways")
        lead_magnets = await fetch_one("SELECT COUNT(*) as c FROM lead_magnets")
    except Exception:
        pins = broadcasts = giveaways = lead_magnets = {"c": 0}
    return {
        "success": True,
        "users": users["c"] if users else 0,
        "channels": channels["c"] if channels else 0,
        "subscribers": subscribers["c"] if subscribers else 0,
        "activeBillings": active_billing["c"] if active_billing else 0,
        "leads": leads["c"] if leads else 0,
        "pins": pins["c"] if pins else 0,
        "broadcasts": broadcasts["c"] if broadcasts else 0,
        "giveaways": giveaways["c"] if giveaways else 0,
        "leadMagnets": lead_magnets["c"] if lead_magnets else 0,
    }


# ===========================
# Users (app administrators)
# ===========================

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    offset = (page - 1) * limit
    if search:
        like = f"%{search}%"
        total = await fetch_one(
            "SELECT COUNT(*) as c FROM users WHERE username ILIKE $1 OR first_name ILIKE $1 OR CAST(telegram_id AS TEXT) LIKE $1",
            like,
        )
        rows = await fetch_all(
            """SELECT u.*, (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channel_count
               FROM users u
               WHERE u.username ILIKE $1 OR u.first_name ILIKE $1 OR CAST(u.telegram_id AS TEXT) LIKE $1
               ORDER BY u.created_at DESC LIMIT $2 OFFSET $3""",
            like, limit, offset,
        )
    else:
        total = await fetch_one("SELECT COUNT(*) as c FROM users")
        rows = await fetch_all(
            """SELECT u.*, (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channel_count
               FROM users u ORDER BY u.created_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
    return {"success": True, "users": rows, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.get("/users/{user_id}")
async def get_user(user_id: int, admin: Dict = Depends(get_current_admin)):
    user = await fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    channels = await fetch_all(
        """SELECT c.*, cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users
           FROM channels c LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.user_id = $1 ORDER BY c.created_at DESC""",
        user_id,
    )
    staff = await fetch_all(
        """SELECT cs.*, c.title as channel_title, c.id as channel_id
           FROM channel_staff cs JOIN channels c ON c.id = cs.channel_id
           WHERE cs.user_id = $1""",
        user_id,
    )
    return {"success": True, "user": user, "channels": channels, "staff": staff}


@router.get("/users/{user_id}/channels")
async def user_channels(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT c.*, cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users,
                  (SELECT COUNT(*) FROM channel_staff WHERE channel_id = c.id) as staff_count
           FROM channels c LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.user_id = $1 ORDER BY c.created_at DESC""",
        user_id,
    )
    return {"success": True, "channels": rows}


@router.get("/users/{user_id}/pins")
async def user_pins(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT pp.*, c.title as channel_title FROM pin_posts pp
           JOIN channels c ON c.id = pp.channel_id WHERE c.user_id = $1
           ORDER BY pp.created_at DESC""",
        user_id,
    )
    return {"success": True, "pins": _strip_binary(rows)}


@router.get("/users/{user_id}/broadcasts")
async def user_broadcasts(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT b.*, c.title as channel_title FROM broadcasts b
           JOIN channels c ON c.id = b.channel_id WHERE c.user_id = $1
           ORDER BY b.created_at DESC""",
        user_id,
    )
    return {"success": True, "broadcasts": _strip_binary(rows)}


@router.get("/users/{user_id}/giveaways")
async def user_giveaways(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT g.*, c.title as channel_title FROM giveaways g
           JOIN channels c ON c.id = g.channel_id WHERE c.user_id = $1
           ORDER BY g.created_at DESC""",
        user_id,
    )
    return {"success": True, "giveaways": _strip_binary(rows)}


@router.get("/users/{user_id}/lead-magnets")
async def user_lead_magnets(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT lm.*, c.title as channel_title FROM lead_magnets lm
           JOIN channels c ON c.id = lm.channel_id WHERE c.user_id = $1
           ORDER BY lm.created_at DESC""",
        user_id,
    )
    return {"success": True, "leadMagnets": _strip_binary(rows)}


@router.put("/users/{user_id}/extend-tariff")
async def extend_tariff(user_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    channel_id = body.get("channel_id")
    months = int(body.get("months", 1))
    if not channel_id:
        raise HTTPException(status_code=400, detail="channel_id обязателен")

    channel = await fetch_one("SELECT * FROM channels WHERE id = $1 AND user_id = $2", channel_id, user_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel_id)
    if not billing:
        new_expires = datetime.utcnow() + timedelta(days=30 * months)
        await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, status, expires_at, max_users) VALUES ($1,'paid','active',$2,1) RETURNING id",
            channel_id, new_expires,
        )
    else:
        base = billing["expires_at"] if billing["expires_at"] and billing["expires_at"] > datetime.utcnow() else datetime.utcnow()
        new_expires = base + timedelta(days=30 * months)
        await execute(
            "UPDATE channel_billing SET status = 'active', expires_at = $1 WHERE channel_id = $2",
            new_expires, channel_id,
        )
    return {"success": True, "expires_at": new_expires.isoformat()}


@router.delete("/users/{user_id}/pins/{pin_id}")
async def delete_user_pin(user_id: int, pin_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM pin_posts WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        pin_id, user_id,
    )
    return {"success": True}


@router.put("/users/{user_id}/pins/{pin_id}")
async def edit_user_pin(user_id: int, pin_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "button_type", "lm_button_text"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([pin_id, user_id])
    await execute(
        f"UPDATE pin_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id IN (SELECT id FROM channels WHERE user_id = ${idx+1})",
        *params,
    )
    return {"success": True}


@router.delete("/users/{user_id}/broadcasts/{broadcast_id}")
async def delete_user_broadcast(user_id: int, broadcast_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM broadcasts WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        broadcast_id, user_id,
    )
    return {"success": True}


@router.delete("/users/{user_id}/giveaways/{giveaway_id}")
async def delete_user_giveaway(user_id: int, giveaway_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM giveaways WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        giveaway_id, user_id,
    )
    return {"success": True}


@router.put("/users/{user_id}/giveaways/{giveaway_id}")
async def edit_user_giveaway(user_id: int, giveaway_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "prizes", "conditions", "legal_info", "status", "winner_count"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([giveaway_id, user_id])
    await execute(
        f"UPDATE giveaways SET {', '.join(fields)} WHERE id = ${idx} AND channel_id IN (SELECT id FROM channels WHERE user_id = ${idx+1})",
        *params,
    )
    return {"success": True}


@router.delete("/users/{user_id}/lead-magnets/{lm_id}")
async def delete_user_lead_magnet(user_id: int, lm_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM lead_magnets WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        lm_id, user_id,
    )
    return {"success": True}


# ===========================
# Channels
# ===========================

@router.get("/channels")
async def list_channels(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    platform: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    offset = (page - 1) * limit
    conditions = []
    params = []
    idx = 1

    if search:
        conditions.append(f"(c.title ILIKE ${idx} OR c.username ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1
    if platform:
        conditions.append(f"c.platform = ${idx}")
        params.append(platform)
        idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = await fetch_one(f"SELECT COUNT(*) as c FROM channels c {where}", *params)
    params.extend([limit, offset])
    rows = await fetch_all(
        f"""SELECT c.*, u.username as owner_username, u.first_name as owner_name,
                   cb.status as billing_status, cb.expires_at as billing_expires
            FROM channels c
            LEFT JOIN users u ON u.id = c.user_id
            LEFT JOIN channel_billing cb ON cb.channel_id = c.id
            {where} ORDER BY c.created_at DESC LIMIT ${idx} OFFSET ${idx+1}""",
        *params,
    )
    return {"success": True, "channels": rows, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.get("/channels/{channel_id}")
async def get_channel(channel_id: int, admin: Dict = Depends(get_current_admin)):
    ch = await fetch_one(
        """SELECT c.*, u.username as owner_username, u.first_name as owner_name, u.id as owner_id,
                  cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users
           FROM channels c LEFT JOIN users u ON u.id = c.user_id
           LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.id = $1""",
        channel_id,
    )
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")

    staff = await fetch_all(
        """SELECT cs.*, u.username, u.first_name, u.telegram_id
           FROM channel_staff cs JOIN users u ON u.id = cs.user_id
           WHERE cs.channel_id = $1""",
        channel_id,
    )
    return {"success": True, "channel": ch, "staff": staff}


def _strip_binary(rows):
    """Remove binary fields (file_data etc.) from query results for JSON serialization."""
    clean = []
    for row in rows:
        clean.append({k: v for k, v in row.items() if not isinstance(v, (bytes, bytearray, memoryview))})
    return clean


@router.get("/channels/{channel_id}/pins")
async def channel_pins(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM pin_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "pins": _strip_binary(rows)}


@router.get("/channels/{channel_id}/lead-magnets")
async def channel_lead_magnets(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM lead_magnets WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "leadMagnets": _strip_binary(rows)}


@router.get("/channels/{channel_id}/content")
async def channel_content(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM content_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "posts": _strip_binary(rows)}


@router.get("/channels/{channel_id}/giveaways")
async def channel_giveaways(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "giveaways": _strip_binary(rows)}


@router.get("/channels/{channel_id}/links")
async def channel_links(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM tracking_links WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "links": rows}


@router.put("/channels/{channel_id}/links/{link_id}")
async def edit_channel_link(channel_id: int, link_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "is_paused"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([link_id, channel_id])
    await execute(
        f"UPDATE tracking_links SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
        *params,
    )
    return {"success": True}


@router.delete("/channels/{channel_id}/links/{link_id}")
async def delete_channel_link(channel_id: int, link_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM tracking_links WHERE id = $1 AND channel_id = $2", link_id, channel_id)
    return {"success": True}


@router.get("/channels/{channel_id}/broadcasts")
async def channel_broadcasts(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM broadcasts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "broadcasts": _strip_binary(rows)}


@router.get("/channels/{channel_id}/comments")
async def channel_comments(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        rows = await fetch_all("SELECT * FROM comments WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100", channel_id)
    except Exception:
        rows = []
    return {"success": True, "comments": rows}


@router.get("/channels/{channel_id}/paid-chats")
async def channel_paid_chats(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        chats = await fetch_all("SELECT * FROM paid_chats WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
        members = await fetch_all(
            """SELECT pcm.*, pc.title as chat_title FROM paid_chat_members pcm
               JOIN paid_chats pc ON pc.id = pcm.paid_chat_id
               WHERE pc.channel_id = $1 ORDER BY pcm.joined_at DESC LIMIT 100""",
            channel_id,
        )
        posts = await fetch_all(
            """SELECT pcp.*, pc.title as chat_title FROM paid_chat_posts pcp
               JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               WHERE pc.channel_id = $1 ORDER BY pcp.created_at DESC LIMIT 100""",
            channel_id,
        )
    except Exception:
        chats, members, posts = [], [], []

    # Payment settings
    try:
        payment_settings = await fetch_all(
            "SELECT * FROM paid_chat_payment_settings WHERE channel_id = $1",
            channel_id,
        )
    except Exception:
        payment_settings = []

    # Plans
    try:
        plans = await fetch_all(
            "SELECT * FROM paid_chat_plans WHERE channel_id = $1 ORDER BY sort_order, created_at",
            channel_id,
        )
    except Exception:
        plans = []

    # Payments (recent 100)
    try:
        payments = await fetch_all(
            """SELECT pcp.*, pc.title as chat_title, pp.title as plan_title
               FROM paid_chat_payments pcp
               LEFT JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               LEFT JOIN paid_chat_plans pp ON pp.id = pcp.plan_id
               WHERE pcp.channel_id = $1 ORDER BY pcp.created_at DESC LIMIT 100""",
            channel_id,
        )
    except Exception:
        payments = []

    return {
        "success": True,
        "chats": _strip_binary(chats),
        "members": _strip_binary(members),
        "posts": _strip_binary(posts),
        "payment_settings": payment_settings,
        "plans": plans,
        "payments": _strip_binary(payments),
    }


@router.get("/channels/{channel_id}/funnels")
async def channel_funnels(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        rows = await fetch_all("SELECT * FROM funnel_steps WHERE channel_id = $1 ORDER BY step_order", channel_id)
    except Exception:
        rows = []
    return {"success": True, "funnels": rows}


@router.get("/channels/{channel_id}/subscribers")
async def channel_subscribers(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT s.*, u.username, u.first_name FROM subscriptions s
           LEFT JOIN users u ON u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id
           WHERE s.channel_id = $1 ORDER BY s.subscribed_at DESC LIMIT 200""",
        channel_id,
    )
    return {"success": True, "subscribers": rows}


# ─── Channel content CRUD (admin editing) ───

@router.put("/channels/{channel_id}/pins/{item_id}")
async def edit_channel_pin(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "erid"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE pin_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/pins/{item_id}")
async def delete_channel_pin(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM pin_posts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/content/{item_id}")
async def edit_channel_content(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "scheduled_at", "erid"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE content_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/content/{item_id}")
async def delete_channel_content(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM content_posts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/broadcasts/{item_id}")
async def edit_channel_broadcast(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE broadcasts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/broadcasts/{item_id}")
async def delete_channel_broadcast(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM broadcasts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/giveaways/{item_id}")
async def edit_channel_giveaway(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "erid", "legal_info"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE giveaways SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/giveaways/{item_id}")
async def delete_channel_giveaway(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM giveaways WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/lead-magnets/{item_id}")
async def edit_channel_lm(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "name", "message_text"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE lead_magnets SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/lead-magnets/{item_id}")
async def delete_channel_lm(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM lead_magnets WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.get("/channels/{channel_id}/logs")
async def channel_logs(channel_id: int, admin: Dict = Depends(get_current_admin)):
    """Activity log for channel: visits, clicks, subscriptions."""
    logs = []

    # Visits
    try:
        visits = await fetch_all(
            """SELECT v.id, v.ip_address, v.user_agent, v.platform, v.visited_at as created_at,
                      v.username, v.first_name, tl.name as link_name, tl.short_code
               FROM visits v LEFT JOIN tracking_links tl ON tl.id = v.tracking_link_id
               WHERE v.channel_id = $1 ORDER BY v.visited_at DESC LIMIT 200""",
            channel_id,
        )
        for v in visits:
            logs.append({**v, "type": "visit", "text": f"Визит: {v.get('first_name') or v.get('username') or v.get('ip_address') or '—'} → {v.get('link_name') or v.get('short_code') or '—'}"})
    except Exception:
        pass

    # Subscriptions
    try:
        subs = await fetch_all(
            """SELECT s.id, s.telegram_id, s.max_user_id, s.username, s.first_name,
                      s.platform, s.subscribed_at as created_at
               FROM subscriptions s WHERE s.channel_id = $1 ORDER BY s.subscribed_at DESC LIMIT 200""",
            channel_id,
        )
        for s in subs:
            logs.append({**s, "type": "subscription", "text": f"Подписка: {s.get('first_name') or s.get('username') or s.get('telegram_id') or s.get('max_user_id') or '—'}"})
    except Exception:
        pass

    # Pins
    try:
        pins = await fetch_all(
            "SELECT id, title, status, published_at, created_at FROM pin_posts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for p in pins:
            dt = p.get("published_at") or p.get("created_at")
            logs.append({"type": "pin", "text": f"Закреп: {p.get('title') or '—'} [{p.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Broadcasts
    try:
        broads = await fetch_all(
            "SELECT id, title, status, sent_at, created_at FROM broadcasts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for b in broads:
            dt = b.get("sent_at") or b.get("created_at")
            logs.append({"type": "broadcast", "text": f"Рассылка: {b.get('title') or '—'} [{b.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Content posts
    try:
        posts = await fetch_all(
            "SELECT id, title, status, published_at, created_at FROM content_posts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for p in posts:
            dt = p.get("published_at") or p.get("created_at")
            logs.append({"type": "post", "text": f"Публикация: {p.get('title') or '—'} [{p.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Giveaways
    try:
        gives = await fetch_all(
            "SELECT id, title, status, created_at FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 50",
            channel_id,
        )
        for g in gives:
            logs.append({"type": "giveaway", "text": f"Розыгрыш: {g.get('title') or '—'} [{g.get('status')}]", "created_at": g.get("created_at")})
    except Exception:
        pass

    # Lead magnets delivered (leads)
    try:
        leads = await fetch_all(
            """SELECT l.id, l.created_at, lm.title as lm_title, l.username, l.first_name
               FROM leads l LEFT JOIN lead_magnets lm ON lm.id = l.lead_magnet_id
               WHERE l.channel_id = $1 ORDER BY l.created_at DESC LIMIT 100""",
            channel_id,
        )
        for l in leads:
            name = l.get("first_name") or l.get("username") or "—"
            logs.append({"type": "lead", "text": f"Лид-магнит: {l.get('lm_title') or '—'} → {name}", "created_at": l.get("created_at")})
    except Exception:
        pass

    # Sort by date desc
    logs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"success": True, "logs": logs[:500]}


# ===========================
# Subscribers
# ===========================

@router.get("/subscribers")
async def list_subscribers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    offset = (page - 1) * limit
    if search:
        like = f"%{search}%"
        total = await fetch_one(
            """SELECT COUNT(*) as c FROM subscriptions s
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               WHERE CAST(s.telegram_id AS TEXT) LIKE $1 OR s.max_user_id ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1""",
            like,
        )
        rows = await fetch_all(
            """SELECT s.*, c.title as channel_title, c.platform,
                      u.username, u.first_name
               FROM subscriptions s
               JOIN channels c ON c.id = s.channel_id
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               WHERE CAST(s.telegram_id AS TEXT) LIKE $1 OR s.max_user_id ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1
               ORDER BY s.subscribed_at DESC LIMIT $2 OFFSET $3""",
            like, limit, offset,
        )
    else:
        total = await fetch_one("SELECT COUNT(*) as c FROM subscriptions")
        rows = await fetch_all(
            """SELECT s.*, c.title as channel_title, c.platform,
                      u.username, u.first_name
               FROM subscriptions s
               JOIN channels c ON c.id = s.channel_id
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               ORDER BY s.subscribed_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
    return {"success": True, "subscribers": rows, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.get("/subscribers/{identifier}")
async def get_subscriber(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE username = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    subs = await fetch_all(
        """SELECT s.*, c.title as channel_title, c.platform
           FROM subscriptions s JOIN channels c ON c.id = s.channel_id
           WHERE s.telegram_id = $1 OR s.max_user_id = $2
           ORDER BY s.subscribed_at DESC""",
        user.get("telegram_id"), user.get("max_user_id"),
    )
    return {"success": True, "user": user, "subscriptions": subs}


@router.get("/subscribers/{identifier}/channels")
async def subscriber_channels(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    channels = await fetch_all(
        """SELECT DISTINCT c.*, s.subscribed_at
           FROM subscriptions s JOIN channels c ON c.id = s.channel_id
           WHERE s.telegram_id = $1 OR s.max_user_id = $2
           ORDER BY s.subscribed_at DESC""",
        user.get("telegram_id"), user.get("max_user_id"),
    )
    return {"success": True, "channels": channels}


@router.get("/subscribers/{identifier}/dialog")
async def subscriber_dialog(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    messages = await fetch_all(
        "SELECT * FROM bot_message_log WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500",
        user["id"],
    )
    return {"success": True, "messages": messages}


@router.delete("/subscribers/{identifier}/dialog/{message_id}")
async def delete_dialog_message(identifier: str, message_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM bot_message_log WHERE id = $1", message_id)
    return {"success": True}


# ===========================
# Admin panel admins (superadmin only)
# ===========================

@router.get("/admins")
async def list_admins(admin: Dict = Depends(require_superadmin)):
    rows = await fetch_all("SELECT id, username, display_name, role, is_active, last_login_at, created_at FROM admin_users ORDER BY created_at")
    return {"success": True, "admins": rows}


@router.post("/admins")
async def create_admin(request: Request, admin: Dict = Depends(require_superadmin)):
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    display_name = body.get("display_name", "")
    role = body.get("role", "admin")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username и password обязательны")
    if role not in ("superadmin", "admin", "viewer"):
        raise HTTPException(status_code=400, detail="Неизвестная роль")
    existing = await fetch_one("SELECT id FROM admin_users WHERE username = $1", username)
    if existing:
        raise HTTPException(status_code=400, detail="Username уже занят")
    pw_hash = hash_password(password)
    aid = await execute_returning_id(
        "INSERT INTO admin_users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id",
        username, pw_hash, display_name, role,
    )
    return {"success": True, "adminId": aid}


@router.put("/admins/{admin_id}")
async def update_admin(admin_id: int, request: Request, admin: Dict = Depends(require_superadmin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("display_name", "role", "is_active"):
        if key in body:
            if key == "role" and body[key] not in ("superadmin", "admin", "viewer"):
                raise HTTPException(status_code=400, detail="Неизвестная роль")
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "password" in body and body["password"]:
        fields.append(f"password_hash = ${idx}")
        params.append(hash_password(body["password"]))
        idx += 1
    if not fields:
        return {"success": True}
    params.append(admin_id)
    await execute(f"UPDATE admin_users SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: int, admin: Dict = Depends(require_superadmin)):
    if admin_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    await execute("DELETE FROM admin_users WHERE id = $1", admin_id)
    return {"success": True}


# ===========================
# Tariffs
# ===========================

@router.get("/tariffs")
async def list_tariffs(admin: Dict = Depends(get_current_admin)):
    tariffs = await fetch_all("SELECT * FROM tariffs ORDER BY months ASC")
    return {"success": True, "tariffs": tariffs}


@router.put("/tariffs/{tariff_id}")
async def update_tariff(tariff_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    price = body.get("price")
    label = body.get("label")
    is_active = body.get("is_active")

    if price is not None and (not isinstance(price, (int, float)) or price < 0):
        raise HTTPException(status_code=400, detail="Некорректная цена")

    fields = []
    params = []
    idx = 1
    if price is not None:
        fields.append(f"price = ${idx}")
        params.append(int(price))
        idx += 1
    if label is not None:
        fields.append(f"label = ${idx}")
        params.append(label)
        idx += 1
    if is_active is not None:
        fields.append(f"is_active = ${idx}")
        params.append(bool(is_active))
        idx += 1

    if not fields:
        return {"success": True}

    fields.append(f"updated_at = NOW()")
    params.append(tariff_id)
    await execute(f"UPDATE tariffs SET {', '.join(fields)} WHERE id = ${idx}", *params)
    tariff = await fetch_one("SELECT * FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True, "tariff": tariff}


@router.post("/tariffs")
async def create_tariff(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    months = body.get("months")
    label = body.get("label")
    price = body.get("price")

    if not months or not label or price is None:
        raise HTTPException(status_code=400, detail="months, label и price обязательны")

    tariff_id = await execute_returning_id(
        "INSERT INTO tariffs (months, label, price) VALUES ($1, $2, $3) RETURNING id",
        int(months), label, int(price),
    )
    tariff = await fetch_one("SELECT * FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True, "tariff": tariff}


@router.delete("/tariffs/{tariff_id}")
async def delete_tariff(tariff_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True}


# ===========================
# Finance
# ===========================

@router.get("/finance")
async def finance_overview(
    admin: Dict = Depends(get_current_admin),
    period: str = "30d",
):
    """Get all payments for the given period."""
    days = {"7d": 7, "14d": 14, "30d": 30, "90d": 90, "365d": 365}.get(period, 30)

    # Billing payments (service subscriptions)
    billing = await fetch_all(
        """SELECT bp.id, bp.amount, bp.currency, bp.status, bp.payment_id, bp.created_at,
                  cb.channel_id, c.title as channel_title, u.username as user_username, u.first_name as user_name
           FROM billing_payments bp
           LEFT JOIN channel_billing cb ON cb.id = bp.channel_billing_id
           LEFT JOIN channels c ON c.id = cb.channel_id
           LEFT JOIN users u ON u.id = c.user_id
           WHERE bp.created_at > NOW() - INTERVAL '%s days'
           ORDER BY bp.created_at DESC""" % days,
    )

    # Paid chat payments
    try:
        paid_chat = await fetch_all(
            """SELECT pcp.id, pcp.amount, pcp.currency, pcp.status, pcp.payment_id, pcp.created_at,
                      pc.title as chat_title, c.title as channel_title
               FROM paid_chat_payments pcp
               LEFT JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               LEFT JOIN channels c ON c.id = pc.channel_id
               WHERE pcp.created_at > NOW() - INTERVAL '%s days'
               ORDER BY pcp.created_at DESC""" % days,
        )
    except Exception:
        paid_chat = []

    # Totals
    total_billing = sum(float(p.get("amount", 0)) for p in billing if p.get("status") == "paid")
    total_paid_chat = sum(float(p.get("amount", 0)) for p in paid_chat if p.get("status") in ("paid", "success", "completed"))
    pending_billing = sum(float(p.get("amount", 0)) for p in billing if p.get("status") == "pending")

    return {
        "success": True,
        "billing_payments": billing,
        "paid_chat_payments": paid_chat,
        "totals": {
            "billing": total_billing,
            "paid_chat": total_paid_chat,
            "total": total_billing + total_paid_chat,
            "pending": pending_billing,
        },
        "period": period,
    }


# ===========================
# Landing Pages
# ===========================

@router.get("/landings")
async def list_landings(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM landing_pages_v2 ORDER BY created_at")
    return {"success": True, "landings": rows}


@router.put("/landings/{landing_id}")
async def update_landing(landing_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "slug", "is_active", "ym_counter_id", "vk_pixel_id", "ym_goal_register", "ym_goal_payment"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(landing_id)
    await execute(f"UPDATE landing_pages_v2 SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@router.post("/landings")
async def create_landing(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    lid = await execute_returning_id(
        "INSERT INTO landing_pages_v2 (slug, title) VALUES ($1, $2) RETURNING id",
        body.get("slug", ""), body.get("title", ""),
    )
    return {"success": True, "id": lid}


@router.delete("/landings/{landing_id}")
async def delete_landing(landing_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM landing_pages_v2 WHERE id = $1", landing_id)
    return {"success": True}


@router.post("/landings/{landing_id}/track")
async def track_landing_event(landing_id: int, request: Request):
    """Public: track view/click on landing."""
    body = await request.json()
    event = body.get("event", "view")
    if event == "view":
        await execute("UPDATE landing_pages_v2 SET views_count = views_count + 1 WHERE id = $1", landing_id)
    elif event == "click":
        await execute("UPDATE landing_pages_v2 SET clicks_count = clicks_count + 1 WHERE id = $1", landing_id)
    elif event == "register":
        await execute("UPDATE landing_pages_v2 SET registrations_count = registrations_count + 1 WHERE id = $1", landing_id)
    return {"success": True}
