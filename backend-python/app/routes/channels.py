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
    """Перепроверить уже известные каналы пользователя через актуальный API.

    Общий GET /chats удалён из MAX API. Новые каналы появляются в базе по
    webhook-событию bot_added, а этот маршрут теперь проверяет их состояние,
    вместо безуспешного сканирования всех чатов бота.
    """
    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        return {"success": False, "found": 0, "error": "MAX бот не настроен"}

    user_max_id = user.get("max_user_id")
    if not user_max_id:
        return {"success": True, "found": 0, "checked": 0,
                "diagnostics": [], "reason": "max_account_not_linked"}

    chats = await fetch_all(
        "SELECT * FROM channels WHERE user_id = $1 AND platform = 'max' AND max_chat_id IS NOT NULL",
        user["id"],
    )
    found = 0
    diagnostics = []
    for chat in chats:
        chat_id = str(chat.get("max_chat_id", ""))
        if not chat_id:
            continue
        try:
            chat_info = await max_api.get_chat(chat_id)
            membership = await max_api.get_membership(chat_id)
            is_admin = membership.get("success") and membership.get("data", {}).get("is_admin", False)
            if chat_info.get("success") and chat_info.get("data"):
                info = chat_info["data"]
                icon = info.get("icon") or {}
                avatar = icon.get("url") if isinstance(icon, dict) else None
                await execute(
                    "UPDATE channels SET title=COALESCE($1,title), avatar_url=COALESCE($2,avatar_url), max_connected=$3 WHERE id=$4",
                    info.get("title"), avatar, 1 if is_admin else 0, chat["id"],
                )
                found += 1 if is_admin else 0
                diagnostics.append({
                    "channel_id": chat["id"],
                    "title": info.get("title") or chat.get("title") or "MAX Channel",
                    "connected": bool(is_admin),
                    "reason": None if is_admin else "bot_not_admin",
                })
            else:
                diagnostics.append({"channel_id": chat["id"], "title": chat.get("title") or "MAX Channel",
                                    "connected": False, "reason": "channel_unavailable"})
        except Exception as exc:
            await execute("UPDATE channels SET max_connected=0 WHERE id=$1", chat["id"])
            diagnostics.append({"channel_id": chat["id"], "title": chat.get("title") or "MAX Channel",
                                "connected": False, "reason": "api_error"})
            print(f"[Channels] diagnostic failed channel={chat['id']}: {exc}")

    return {
        "success": True,
        "found": found,
        "checked": len(chats),
        "diagnostics": diagnostics,
        "reason": "no_known_channels" if not chats else None,
        "message": "Новые каналы подключаются автоматически после добавления бота администратором",
    }


@router.get("/trash")
async def list_trash(user: Dict[str, Any] = Depends(get_current_user)):
    """Корзина — каналы удалённые юзером, ещё не вычищенные кроном.
    Зарегистрирован ДО /{tracking_code} чтобы FastAPI не парсил «trash» как код."""
    rows = await fetch_all(
        """SELECT id, title, tracking_code, platform, deleted_at,
                  EXTRACT(EPOCH FROM (deleted_at + INTERVAL '30 days' - NOW()))::int AS seconds_until_purge
           FROM channels
           WHERE user_id = $1 AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC""",
        user["id"],
    )
    return {"success": True, "channels": [dict(r) for r in rows]}


@router.get("/")
async def list_channels(user: Dict[str, Any] = Depends(get_current_user)):
    # Own channels
    channels = await fetch_all(
        "SELECT * FROM channels WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", user["id"]
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


@router.get("/{tracking_code}/achievements")
async def get_channel_achievements(
    tracking_code: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Снимок достижений канала по событиям сезона."""
    channel = await get_channel_for_user(tracking_code, user["id"], "analytics")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    from ..services.achievements import get_summary
    data = await get_summary(channel["id"])
    return {"success": True, **data}


@router.get("/{tracking_code}/levels")
async def get_channel_levels(
    tracking_code: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Снимок уровней по 3 ИИ-навыкам для страницы /achievements."""
    channel = await get_channel_for_user(tracking_code, user["id"], "analytics")
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    from ..services.channel_levels import get_levels_summary
    data = await get_levels_summary(channel["id"])
    return {"success": True, **data}


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
    """Мягкое удаление канала — помечает deleted_at=NOW().
    Через 30 дней крон удалит физически вместе со всем контентом.
    До этого юзер может восстановить из «Корзины»."""
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2 AND deleted_at IS NULL",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "UPDATE channels SET deleted_at = NOW(), is_active = 0 WHERE id = $1",
        channel["id"],
    )
    return {"success": True, "deleted_at": "now", "restore_until_days": 30}


@router.post("/{tracking_code}/restore")
async def restore_channel(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Восстановить мягко-удалённый канал. Контент сохранён в БД, просто
    снимаем deleted_at — канал снова видим во всех list-запросах."""
    channel = await fetch_one(
        "SELECT id, deleted_at FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if channel.get("deleted_at") is None:
        raise HTTPException(status_code=400, detail="Канал не в корзине")
    await execute(
        "UPDATE channels SET deleted_at = NULL WHERE id = $1",
        channel["id"],
    )
    return {"success": True}


@router.delete("/{tracking_code}/purge")
async def purge_channel(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Окончательное удаление из корзины (или из активных при необходимости)
    — каскадное удаление всех связанных данных."""
    channel = await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user["id"],
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    cid = channel["id"]
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
