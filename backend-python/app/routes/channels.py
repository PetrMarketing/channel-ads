from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import math
import aiohttp

from ..middleware.auth import get_current_user, get_channel_for_user
from ..database import fetch_one, fetch_all, execute
from ..config import settings

router = APIRouter()


def mask_channel(ch: dict) -> dict:
    """Hide sensitive fields from channel data."""
    if ch and ch.get("ym_oauth_token"):
        ch = dict(ch)
        ch["ym_oauth_token"] = "***"
    return ch


async def enrich_with_billing(ch: dict) -> dict:
    """Add billing_active and billing_days_left to channel dict."""
    ch = dict(ch)
    billing = await fetch_one(
        "SELECT status, expires_at FROM channel_billing WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1",
        ch["id"],
    )
    if billing and billing.get("expires_at"):
        expires_at = billing["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            now = datetime.utcnow()
        else:
            now = datetime.now(timezone.utc)
        days_left = max(0, math.ceil((expires_at - now).total_seconds() / 86400))
        ch["billing_active"] = billing["status"] == "active" and days_left > 0
        ch["billing_days_left"] = days_left
        ch["billing_status"] = billing["status"]
        ch["expires_at"] = billing["expires_at"].isoformat() if hasattr(billing["expires_at"], "isoformat") else str(billing["expires_at"])
    else:
        ch["billing_active"] = False
        ch["billing_days_left"] = 0
        ch["billing_status"] = None
        ch["expires_at"] = None
    return ch


@router.get("/unclaimed/list")
async def list_unclaimed(user: Dict[str, Any] = Depends(get_current_user)):
    channels = await fetch_all(
        "SELECT * FROM channels WHERE owner_id = $1 AND user_id IS NULL", user["id"]
    )
    return {"success": True, "channels": [mask_channel(c) for c in channels]}


@router.post("/scan")
async def scan_channels(user: Dict[str, Any] = Depends(get_current_user)):
    """Scan MAX bot chats to find channels owned by this user where bot is admin."""
    import secrets as _secrets
    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        return {"success": True, "found": 0}

    user_max_id = user.get("max_user_id")
    if not user_max_id:
        return {"success": True, "found": 0}

    result = await max_api.get_chats()
    if not result.get("success"):
        return {"success": True, "found": 0}

    chats = result.get("data", {}).get("chats", []) if isinstance(result.get("data"), dict) else (result.get("data") or [])
    found = 0
    for chat in chats:
        chat_type = chat.get("type", "")
        if chat_type != "channel":
            continue
        chat_id = str(chat.get("chat_id", ""))
        if not chat_id:
            continue

        # Already exists in DB? Update avatar if missing
        existing = await fetch_one("SELECT id, user_id, avatar_url FROM channels WHERE max_chat_id = $1", chat_id)
        if existing:
            if not existing.get("avatar_url"):
                # Fetch avatar from detailed chat info
                try:
                    chat_detail = await max_api.get_chat(chat_id)
                    if chat_detail.get("success") and chat_detail.get("data"):
                        _icon = chat_detail["data"].get("icon", {})
                        _av = _icon.get("url") if isinstance(_icon, dict) else None
                        if _av:
                            await execute("UPDATE channels SET avatar_url = $1 WHERE id = $2", _av, existing["id"])
                except Exception:
                    pass
            continue

        # Check channel ownership — only add if current user is the owner
        owner_id = chat.get("owner_id")
        if not owner_id:
            try:
                chat_info = await max_api.get_chat(chat_id)
                if chat_info.get("success") and chat_info.get("data"):
                    owner_id = chat_info["data"].get("owner_id")
            except Exception:
                pass

        if str(owner_id) != str(user_max_id):
            continue

        # Check if bot is admin
        try:
            membership = await max_api.get_membership(chat_id)
            is_admin = membership.get("success") and membership.get("data", {}).get("is_admin", False)
        except Exception:
            is_admin = False
        if not is_admin:
            continue

        title = chat.get("title", "MAX Channel")
        link = chat.get("link")
        _icon = chat.get("icon", {})
        avatar = _icon.get("url") if isinstance(_icon, dict) else None
        tracking_code = _secrets.token_hex(8)

        # Double-check (race condition)
        exists = await fetch_one("SELECT id FROM channels WHERE max_chat_id = $1", chat_id)
        if exists:
            continue

        await execute("""
            INSERT INTO channels (channel_id, title, username, max_chat_id, max_connected, tracking_code, platform, is_active, user_id, owner_id, join_link, avatar_url)
            VALUES ($1, $2, $3, $4, 1, $5, 'max', 1, $6, $7, $8, $9)
        """, int(chat_id) if chat_id.lstrip('-').isdigit() else 0, title, link, chat_id, tracking_code, user["id"], user["id"], link, avatar)

        # Activate trial
        new_ch = await fetch_one("SELECT id FROM channels WHERE max_chat_id = $1", chat_id)
        if new_ch:
            await execute("""
                INSERT INTO channel_billing (channel_id, plan, status, started_at, expires_at)
                VALUES ($1, 'trial', 'active', NOW(), NOW() + INTERVAL '2 days')
                ON CONFLICT DO NOTHING
            """, new_ch["id"])
            await execute("UPDATE channels SET trial_used = TRUE WHERE id = $1", new_ch["id"])

        found += 1
        print(f"[Scan] Found channel: {title} ({chat_id}), owner={owner_id}, bound to user {user['id']}")

    return {"success": True, "found": found}


@router.get("/")
async def list_channels(user: Dict[str, Any] = Depends(get_current_user)):
    # Own channels
    channels = await fetch_all(
        "SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC", user["id"]
    )
    enriched = [await enrich_with_billing(mask_channel(c)) for c in channels]

    # Channels where user is staff
    staff_channels = await fetch_all(
        """SELECT c.*, cs.role as staff_role,
                  u.first_name as owner_first_name, u.username as owner_username
           FROM channel_staff cs
           JOIN channels c ON c.id = cs.channel_id
           JOIN users u ON u.id = c.user_id
           WHERE cs.user_id = $1
           ORDER BY cs.created_at DESC""",
        user["id"],
    )
    for sc in staff_channels:
        ch = await enrich_with_billing(mask_channel(dict(sc)))
        owner_name = sc.get("owner_first_name") or sc.get("owner_username") or ""
        ch["owner_name"] = owner_name
        ch["staff_role"] = sc.get("staff_role")
        ch["is_staff"] = True
        enriched.append(ch)

    return {"success": True, "channels": enriched}


@router.get("/{tracking_code}")
async def get_channel(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await get_channel_for_user(tracking_code, user["id"], "analytics")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    enriched = await enrich_with_billing(mask_channel(channel))
    return {"success": True, "channel": enriched}


@router.put("/{tracking_code}")
async def update_channel(tracking_code: str, request_body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await get_channel_for_user(tracking_code, user["id"], "content")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    fields = []
    params = []
    idx = 1
    for key in ("title", "yandex_metrika_id", "vk_pixel_id", "ym_oauth_token", "join_link", "privacy_policy_url", "offer_url"):
        if key in request_body:
            fields.append(f"{key} = ${idx}")
            params.append(request_body[key])
            idx += 1

    if not fields:
        return {"success": True}

    params.append(channel["id"])
    await execute(f"UPDATE channels SET {', '.join(fields)} WHERE id = ${idx}", *params)
    updated = await fetch_one("SELECT * FROM channels WHERE id = $1", channel["id"])
    return {"success": True, "channel": mask_channel(updated)}


@router.get("/{tracking_code}/stats")
async def get_channel_stats(
    tracking_code: str,
    days: int = Query(30),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await get_channel_for_user(tracking_code, user["id"], "analytics")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    cid = channel["id"]

    # Total visits & subscriptions
    total_visits = await fetch_one("SELECT COUNT(*) as count FROM visits WHERE channel_id = $1", cid)
    total_subs = await fetch_one("SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1", cid)

    # Daily stats
    daily = await fetch_all(f"""
        SELECT d.date::TEXT as date, d.visits,
            COALESCE((SELECT COUNT(*) FROM subscriptions WHERE channel_id = $1 AND DATE(subscribed_at) = d.date), 0) as subscriptions
        FROM (
            SELECT DATE(visited_at) as date, COUNT(*) as visits
            FROM visits WHERE channel_id = $1 AND visited_at >= NOW() - INTERVAL '{days} days'
            GROUP BY DATE(visited_at)
        ) d ORDER BY d.date
    """, cid)

    # UTM breakdown
    utm_stats = await fetch_all("""
        SELECT utm_source, utm_campaign, COUNT(*) as visits,
            (SELECT COUNT(*) FROM subscriptions s
             JOIN visits v2 ON v2.id = s.visit_id
             WHERE v2.utm_source = v.utm_source AND v2.utm_campaign = v.utm_campaign AND v2.channel_id = $1
            ) as subscriptions
        FROM visits v WHERE v.channel_id = $1 AND v.utm_source IS NOT NULL
        GROUP BY utm_source, utm_campaign ORDER BY visits DESC LIMIT 20
    """, cid)

    # Platform breakdown
    platform_stats = await fetch_all("""
        SELECT platform, COUNT(*) as visits FROM visits WHERE channel_id = $1 GROUP BY platform
    """, cid)

    return {
        "success": True,
        "totalVisits": total_visits["count"] if total_visits else 0,
        "totalSubscriptions": total_subs["count"] if total_subs else 0,
        "daily": daily,
        "utmStats": utm_stats,
        "platformStats": platform_stats,
    }


@router.get("/{tracking_code}/subscribers")
async def get_subscribers(
    tracking_code: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await get_channel_for_user(tracking_code, user["id"], "analytics")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    offset = (page - 1) * limit
    subs = await fetch_all(
        "SELECT * FROM subscriptions WHERE channel_id = $1 ORDER BY subscribed_at DESC LIMIT $2 OFFSET $3",
        channel["id"], limit, offset,
    )
    total = await fetch_one("SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1", channel["id"])
    return {
        "success": True,
        "subscribers": subs,
        "total": total["count"] if total else 0,
        "page": page,
        "limit": limit,
    }


@router.post("/{tracking_code}/claim")
async def claim_channel(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND owner_id = $2 AND user_id IS NULL",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден или уже привязан")

    await execute("UPDATE channels SET user_id = $1 WHERE id = $2", user["id"], channel["id"])
    return {"success": True}


@router.delete("/{tracking_code}")
async def delete_channel(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a channel and all associated data."""
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    cid = channel["id"]
    # Delete dependent data in correct order (respecting FK constraints)
    await execute("DELETE FROM offline_conversions WHERE channel_id = $1", cid)
    await execute("DELETE FROM subscriptions WHERE channel_id = $1", cid)
    await execute("DELETE FROM visits WHERE channel_id = $1", cid)
    await execute("DELETE FROM clicks WHERE link_id IN (SELECT id FROM tracking_links WHERE channel_id = $1)", cid)
    await execute("DELETE FROM tracking_links WHERE channel_id = $1", cid)
    await execute("DELETE FROM funnel_progress WHERE lead_id IN (SELECT id FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1))", cid)
    await execute("DELETE FROM funnel_steps WHERE channel_id = $1", cid)
    await execute("DELETE FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)", cid)
    await execute("DELETE FROM pin_posts WHERE channel_id = $1", cid)
    await execute("DELETE FROM lead_magnets WHERE channel_id = $1", cid)
    await execute("DELETE FROM broadcasts WHERE channel_id = $1", cid)
    await execute("DELETE FROM content_posts WHERE channel_id = $1", cid)
    await execute("DELETE FROM channel_modules WHERE channel_id = $1", cid)
    await execute("DELETE FROM channel_billing WHERE channel_id = $1", cid)
    await execute("DELETE FROM channels WHERE id = $1", cid)
    return {"success": True}


async def _fetch_invite_link_for_channel(channel: dict) -> Optional[str]:
    """Fetch invite link from Telegram/MAX API for a channel."""
    platform = channel.get("platform", "telegram")

    if platform == "telegram":
        channel_id = channel.get("channel_id")
        if not channel_id:
            return None
        try:
            tg_base = f"{settings.TELEGRAM_API_URL}/bot{settings.TELEGRAM_BOT_TOKEN}"
            async with aiohttp.ClientSession() as session:
                # Try createChatInviteLink first (non-destructive)
                async with session.post(f"{tg_base}/createChatInviteLink", json={"chat_id": int(channel_id), "name": "channel-ads"}) as resp:
                    data = await resp.json()
                    if data.get("ok") and data.get("result", {}).get("invite_link"):
                        return data["result"]["invite_link"]
                # Fallback: exportChatInviteLink
                async with session.post(f"{tg_base}/exportChatInviteLink", json={"chat_id": int(channel_id)}) as resp:
                    data = await resp.json()
                    if data.get("ok") and data.get("result"):
                        return data["result"]
        except Exception as e:
            print(f"[Channels] TG invite link fetch error: {e}")
        return None

    elif platform == "max":
        max_chat_id = channel.get("max_chat_id")
        if not max_chat_id:
            return None
        try:
            from ..services.max_api import get_max_api
            max_api = get_max_api()
            if max_api:
                chat_info = await max_api.get_chat(max_chat_id)
                if chat_info.get("success") and chat_info.get("data"):
                    link = chat_info["data"].get("link")
                    if link and ("http" in link or "/" in link):
                        return link
        except Exception as e:
            print(f"[Channels] MAX invite link fetch error: {e}")
        return None

    return None


@router.post("/{tracking_code}/refresh-invite-link")
async def refresh_invite_link(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch fresh invite link from Telegram/MAX API and save it."""
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    link = await _fetch_invite_link_for_channel(channel)
    if not link:
        # For public TG channels, build from username
        if channel.get("platform") == "telegram" and channel.get("username"):
            link = f"https://t.me/{channel['username']}"
        elif channel.get("platform") == "max" and channel.get("max_chat_id"):
            link = f"https://max.ru/chats/{channel['max_chat_id']}"

    if link:
        await execute("UPDATE channels SET join_link = $1 WHERE id = $2", link, channel["id"])
        return {"success": True, "join_link": link}

    raise HTTPException(status_code=400, detail="Не удалось получить инвайт-ссылку. Убедитесь, что бот является администратором канала.")
