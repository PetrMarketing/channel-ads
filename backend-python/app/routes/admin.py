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
    return {
        "success": True,
        "users": users["c"] if users else 0,
        "channels": channels["c"] if channels else 0,
        "subscribers": subscribers["c"] if subscribers else 0,
        "activeBillings": active_billing["c"] if active_billing else 0,
        "leads": leads["c"] if leads else 0,
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
    return {"success": True, "pins": rows}


@router.get("/users/{user_id}/broadcasts")
async def user_broadcasts(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT b.*, c.title as channel_title FROM broadcasts b
           JOIN channels c ON c.id = b.channel_id WHERE c.user_id = $1
           ORDER BY b.created_at DESC""",
        user_id,
    )
    return {"success": True, "broadcasts": rows}


@router.get("/users/{user_id}/giveaways")
async def user_giveaways(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT g.*, c.title as channel_title FROM giveaways g
           JOIN channels c ON c.id = g.channel_id WHERE c.user_id = $1
           ORDER BY g.created_at DESC""",
        user_id,
    )
    return {"success": True, "giveaways": rows}


@router.get("/users/{user_id}/lead-magnets")
async def user_lead_magnets(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT lm.*, c.title as channel_title FROM lead_magnets lm
           JOIN channels c ON c.id = lm.channel_id WHERE c.user_id = $1
           ORDER BY lm.created_at DESC""",
        user_id,
    )
    return {"success": True, "leadMagnets": rows}


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


@router.get("/channels/{channel_id}/pins")
async def channel_pins(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM pin_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "pins": rows}


@router.get("/channels/{channel_id}/lead-magnets")
async def channel_lead_magnets(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM lead_magnets WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "leadMagnets": rows}


@router.get("/channels/{channel_id}/content")
async def channel_content(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM content_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "posts": rows}


@router.get("/channels/{channel_id}/giveaways")
async def channel_giveaways(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "giveaways": rows}


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
