import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional

from ..middleware.auth import verify_telegram_webapp
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..services.conversion_pixels import (
    fire_server_goals_safe,
    claim_pending_and_fire_safe,
    claim_orphan_for_pending_safe,
)

router = APIRouter()


def _new_visit_token() -> str:
    """Generate a short URL-safe visit token (~11 chars from 8 random bytes)."""
    return secrets.token_urlsafe(8)


@router.post("/miniapp-visit")
async def miniapp_visit(request: Request):
    """Record visit from MAX Mini App and return channel info + URL.

    Accepts max_user_id, init_data, ym_client_id and stores them on the visit
    so the resulting subscription can be properly attributed (full miniapp
    deep-link flow → server-side pixel firing).
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    code = body.get("code", "")
    max_user_id = body.get("max_user_id")
    ym_client_id = body.get("ym_client_id")
    init_data = body.get("init_data")  # raw MAX SDK init data (not yet verified)
    page_url = body.get("page_url") or ""

    link = await fetch_one("""
        SELECT tl.*, c.platform, c.username as channel_username,
               c.max_chat_id, c.join_link, c.title as channel_title,
               c.avatar_url as channel_avatar_url
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE tl.short_code = $1
    """, code)

    if not link:
        return {"success": False, "channel_url": None}
    if link.get("is_paused"):
        return {"success": False, "error": "Link paused"}

    # Record click
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    await execute("INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1,$2,$3)", link["id"], ip, ua)

    # Issue a per-visit token so the bot can attribute the resulting subscription
    visit_token = _new_visit_token()
    visit_id = None
    for _attempt in range(3):
        try:
            visit_id = await execute_returning_id(
                """INSERT INTO visits (tracking_link_id, channel_id, ip_address, user_agent,
                    utm_source, utm_medium, utm_campaign, utm_content, utm_term, platform,
                    max_user_id, ym_client_id, visit_token)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id""",
                link["id"], link["channel_id"], ip, ua,
                link.get("utm_source"), link.get("utm_medium"), link.get("utm_campaign"),
                link.get("utm_content"), link.get("utm_term"), link.get("platform", "max"),
                str(max_user_id) if max_user_id else None,
                str(ym_client_id) if ym_client_id else None,
                visit_token,
            )
            break
        except Exception as e:
            if "visit_token" in str(e).lower() and "unique" in str(e).lower():
                visit_token = _new_visit_token()
                continue
            print(f"[miniapp-visit] insert failed code={code}: {type(e).__name__}: {e}")
            raise

    # Build channel URL
    join_link = link.get("join_link")
    max_chat_id = link.get("max_chat_id")
    channel_username = link.get("channel_username")

    if join_link:
        channel_url = join_link
    elif max_chat_id:
        channel_url = max_chat_id if max_chat_id.startswith("http") else f"https://max.ru/chats/{max_chat_id}"
    elif channel_username:
        channel_url = f"https://max.ru/chats/{channel_username}"
    else:
        channel_url = None

    print(f"[miniapp-visit] code={code} visit={visit_id} max_user={max_user_id} cid={ym_client_id} url={channel_url}")

    return {
        "success": True,
        "visit_id": visit_id,
        "visit_token": visit_token,
        "channel_url": channel_url,
        "channel_title": link.get("channel_title"),
        "channel_avatar_url": link.get("channel_avatar_url"),
        "platform": link.get("platform", "max"),
    }


@router.post("/click/{short_code}")
async def record_click(short_code: str, request: Request):
    """Record a click for a tracking link (used by frontend GoRedirectPage)."""
    link = await fetch_one("SELECT id FROM tracking_links WHERE short_code = $1", short_code)
    if not link:
        return {"success": False}
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    await execute("INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1,$2,$3)", link["id"], ip, ua)
    return {"success": True}


@router.get("/info/{short_code}")
async def get_link_info(short_code: str):
    # NOTE: alias channel-level pixel columns so they don't overwrite link-level
    # overrides (tl.vk_pixel_id) when asyncpg Record is serialized to dict.
    link = await fetch_one("""
        SELECT tl.*, c.tracking_code, c.channel_id, c.title as channel_title, c.platform,
            c.username as channel_username, c.max_chat_id,
            c.yandex_metrika_id AS channel_ym_id,
            c.vk_pixel_id AS channel_vk_pixel_id,
            c.join_link, lm.code as lm_code
        FROM tracking_links tl
        JOIN channels c ON c.id = tl.channel_id
        LEFT JOIN lead_magnets lm ON lm.id = tl.lm_lead_magnet_id
        WHERE tl.short_code = $1
    """, short_code)
    if not link:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    if link.get("is_paused"):
        raise HTTPException(status_code=410, detail="Ссылка приостановлена")
    return {"success": True, "link": link}


@router.post("/visit")
async def create_visit(request: Request):
    body = await request.json()
    short_code = body.get("short_code")
    if not short_code:
        raise HTTPException(status_code=400, detail="short_code required")

    link = await fetch_one("""
        SELECT tl.*, c.id as ch_id, c.platform
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE tl.short_code = $1
    """, short_code)
    if not link:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    if link.get("is_paused"):
        raise HTTPException(status_code=410, detail="Ссылка приостановлена")

    # Parse Telegram or MAX user
    telegram_id = body.get("telegram_id")
    username = body.get("username")
    first_name = body.get("first_name")
    max_user_id = body.get("max_user_id")
    platform = "max" if max_user_id else link.get("platform", "telegram")

    init_data = body.get("init_data")
    if init_data:
        tg_user = verify_telegram_webapp(init_data)
        if tg_user:
            telegram_id = tg_user.get("id")
            username = tg_user.get("username")
            first_name = tg_user.get("first_name")

    # Issue a per-visit token so the bot can attribute the resulting subscription
    # back to this visit (used by /subscribe/{code} → bot deep link → chat_member).
    # Retry on the (extremely unlikely) collision against the unique index.
    visit_token = _new_visit_token()
    visit_id = None
    for _attempt in range(3):
        try:
            visit_id = await execute_returning_id(
                """INSERT INTO visits (tracking_link_id, channel_id, telegram_id, username, first_name,
                    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                    ip_address, user_agent, platform, max_user_id, ym_client_id, visit_token)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id""",
                link["id"], link["ch_id"], telegram_id, username, first_name,
                link.get("utm_source"), link.get("utm_medium"), link.get("utm_campaign"),
                link.get("utm_content"), link.get("utm_term"),
                body.get("ip_address"), body.get("user_agent"),
                platform, max_user_id, body.get("ym_client_id"), visit_token,
            )
            break
        except Exception as e:
            if "visit_token" in str(e).lower() and "unique" in str(e).lower():
                visit_token = _new_visit_token()
                continue
            raise

    # Increment clicks
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    await execute(
        "INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1, $2, $3)",
        link["id"], body.get("ip_address"), body.get("user_agent"),
    )

    return {
        "success": True,
        "visitId": visit_id,
        "channelId": link["ch_id"],
        "visitToken": visit_token,
    }


@router.post("/subscribe")
async def create_subscription(request: Request):
    body = await request.json()
    visit_id = body.get("visit_id")
    if not visit_id:
        raise HTTPException(status_code=400, detail="visit_id required")

    visit = await fetch_one("SELECT * FROM visits WHERE id = $1", visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    telegram_id = body.get("telegram_id") or visit.get("telegram_id")
    username = body.get("username") or visit.get("username")
    first_name = body.get("first_name") or visit.get("first_name")
    max_user_id = body.get("max_user_id") or visit.get("max_user_id")
    platform = visit.get("platform", "telegram")

    init_data = body.get("init_data")
    if init_data:
        tg_user = verify_telegram_webapp(init_data)
        if tg_user:
            telegram_id = tg_user.get("id")
            username = tg_user.get("username")
            first_name = tg_user.get("first_name")

    # Check for existing subscription to avoid duplicates
    existing_sub = None
    if telegram_id:
        existing_sub = await fetch_one(
            "SELECT id FROM subscriptions WHERE channel_id = $1 AND telegram_id = $2",
            visit["channel_id"], telegram_id,
        )
    elif max_user_id:
        existing_sub = await fetch_one(
            "SELECT id FROM subscriptions WHERE channel_id = $1 AND max_user_id = $2",
            visit["channel_id"], max_user_id,
        )

    sub_id = None
    if not existing_sub:
        sub_id = await execute_returning_id(
            """INSERT INTO subscriptions (channel_id, telegram_id, username, first_name, visit_id, platform, max_user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (channel_id, telegram_id) DO NOTHING
               RETURNING id""",
            visit["channel_id"], telegram_id, username, first_name, visit_id, platform, max_user_id,
        )

    # Server-side fallback YM/VK goal firing (idempotent).
    if sub_id and visit_id:
        await fire_server_goals_safe(sub_id)

    return {"success": True, "subscriptionId": sub_id}


@router.get("/check-subscription")
async def check_subscription(
    channel_id: int = Query(...),
    telegram_id: Optional[int] = Query(None),
    max_user_id: Optional[str] = Query(None),
):
    if telegram_id:
        sub = await fetch_one(
            "SELECT * FROM subscriptions WHERE channel_id = $1 AND telegram_id = $2",
            channel_id, telegram_id,
        )
    elif max_user_id:
        sub = await fetch_one(
            "SELECT * FROM subscriptions WHERE channel_id = $1 AND max_user_id = $2",
            channel_id, max_user_id,
        )
    else:
        return {"success": True, "subscribed": False}

    return {"success": True, "subscribed": sub is not None}


async def _heuristic_claim(visit: dict) -> Optional[dict]:
    """Atomically claim the oldest unattributed subscription in this channel
    that was created after the visit. SKIP LOCKED prevents two concurrent
    pollers from claiming the same subscription."""
    return await fetch_one(
        """
        UPDATE subscriptions
        SET visit_id = $1
        WHERE id = (
            SELECT id FROM subscriptions
            WHERE channel_id = $2
              AND visit_id IS NULL
              AND created_at >= $3
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, channel_id, telegram_id, max_user_id, visit_id, created_at
        """,
        visit["id"], visit["channel_id"], visit["created_at"],
    )


@router.post("/visit/{visit_id}/await-subscription")
async def await_subscription(visit_id: int, request: Request):
    """Called from SubscribePage on click 'Перейти в канал'.
    Creates a pending_conversion that will fire YM/VK goals if a real
    subscription arrives within 60 seconds."""
    try:
        body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    except Exception:
        body = {}
    ym_client_id = (body or {}).get("ym_client_id") or None
    page_url = (body or {}).get("page_url") or ""

    visit = await fetch_one("SELECT * FROM visits WHERE id=$1", visit_id)
    if not visit:
        return {"success": False}

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)
    user_agent_hdr = request.headers.get("user-agent", "")
    try:
        from ..database import execute_returning_id
        new_pending_id = await execute_returning_id(
            """INSERT INTO pending_conversions
               (link_id, channel_id, visit_id, ym_client_id, page_url, user_agent, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id""",
            visit["tracking_link_id"], visit["channel_id"], visit_id,
            ym_client_id, page_url,
            user_agent_hdr,
            expires_at,
        )
    except Exception as e:
        print(f"[pending] insert failed visit={visit_id}: {type(e).__name__}: {e}")
        return {"success": False}
    print(f"[pending] visit={visit_id} channel={visit['channel_id']} cid={ym_client_id} expires=60s pending={new_pending_id}")

    # Symmetric pending: try to claim an orphan_subscription that arrived
    # before this click. Fire-and-forget — must not block the click response.
    if new_pending_id and visit.get("channel_id") and visit.get("tracking_link_id"):
        try:
            import asyncio as _asyncio
            _asyncio.create_task(claim_orphan_for_pending_safe(
                new_pending_id, visit["channel_id"], visit["tracking_link_id"],
                ym_client_id=ym_client_id,
                page_url=page_url,
                user_agent=user_agent_hdr,
            ))
        except Exception as orphan_err:
            print(f"[track] orphan claim dispatch failed: {orphan_err}")

    return {"success": True, "expires_at": expires_at.isoformat()}


@router.post("/visit/{visit_id}/ym-client-id")
async def update_visit_ym_client_id(visit_id: int, request: Request):
    """Fire-and-forget endpoint called from SubscribePage once
    window.ym(...,'getClientID',cb) resolves. Stores the YM ClientID on the
    visit so the server-side goal fire can attribute properly."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    ym_client_id = (body or {}).get("ym_client_id")
    if not ym_client_id:
        return {"success": False}
    try:
        await execute(
            "UPDATE visits SET ym_client_id = $1 WHERE id = $2 AND (ym_client_id IS NULL OR ym_client_id = '')",
            str(ym_client_id), visit_id,
        )
    except Exception as e:
        print(f"[track] update ym_client_id failed visit={visit_id}: {e}")
        return {"success": False}
    return {"success": True}


async def _safe_query(label: str, coro):
    """Wrap a single DB lookup so polling never 500s — schema gaps on a deployment
    that hasn't run a migration yet shouldn't break the page."""
    try:
        return await coro
    except Exception as e:
        print(f"[track] {label} failed: {type(e).__name__}: {e}")
        return None


@router.get("/check-subscription-by-visit")
async def check_subscription_by_visit(visit_id: int = Query(...)):
    try:
        visit = await fetch_one("SELECT * FROM visits WHERE id = $1", visit_id)
    except Exception as e:
        print(f"[track] visit lookup failed visit_id={visit_id}: {type(e).__name__}: {e}")
        return {"success": True, "subscribed": False, "server_fired": False}
    if not visit:
        return {"success": True, "subscribed": False, "server_fired": False}

    sub = await _safe_query(
        "subscription by visit_id",
        fetch_one("SELECT * FROM subscriptions WHERE visit_id = $1", visit_id),
    )

    if not sub and visit.get("telegram_id"):
        sub = await _safe_query(
            "subscription by tg_id",
            fetch_one(
                "SELECT * FROM subscriptions WHERE channel_id = $1 AND telegram_id = $2",
                visit["channel_id"], visit["telegram_id"],
            ),
        )
    if not sub and visit.get("max_user_id"):
        sub = await _safe_query(
            "subscription by max_id",
            fetch_one(
                "SELECT * FROM subscriptions WHERE channel_id = $1 AND max_user_id = $2",
                visit["channel_id"], visit["max_user_id"],
            ),
        )

    # Старая (рабочая) механика: ЛЮБАЯ подписка в канале после открытия лендинга
    # триггерит конверсию на ВСЕХ открытых лендингах того же канала. Без
    # атомарного claim'а — несколько вкладок могут "увидеть" одну и ту же
    # подписку и стрельнуть цель. Метрика дедуплицирует по ClientID.
    if not sub:
        sub = await _safe_query(
            "any subscription in channel after visit",
            fetch_one(
                """SELECT * FROM subscriptions
                   WHERE channel_id = $1 AND created_at >= $2
                   ORDER BY created_at ASC LIMIT 1""",
                visit["channel_id"], visit["created_at"],
            ),
        )

    server_fired = bool(sub and sub.get("goal_fired_at") is not None)
    return {
        "success": True,
        "subscribed": sub is not None,
        "subscription": sub,
        "server_fired": server_fired,
    }


@router.get("/check-subscription-by-token")
async def check_subscription_by_token(token: str = Query(...)):
    """Token-keyed variant — same logic as check-subscription-by-visit but
    looks up the visit by its short visit_token. Useful if the SPA reloads
    and loses the visit_id but still has the token in the URL/state."""
    visit = await fetch_one("SELECT * FROM visits WHERE visit_token = $1", token)
    if not visit:
        return {"success": True, "subscribed": False}

    sub = await fetch_one(
        "SELECT * FROM subscriptions WHERE visit_id = $1", visit["id"]
    )
    if not sub and visit.get("telegram_id"):
        sub = await fetch_one(
            "SELECT * FROM subscriptions WHERE channel_id = $1 AND telegram_id = $2",
            visit["channel_id"], visit["telegram_id"],
        )
    if not sub and visit.get("max_user_id"):
        sub = await fetch_one(
            "SELECT * FROM subscriptions WHERE channel_id = $1 AND max_user_id = $2",
            visit["channel_id"], visit["max_user_id"],
        )

    server_fired = bool(sub and sub.get("goal_fired_at") is not None)
    return {
        "success": True,
        "subscribed": sub is not None,
        "subscription": sub,
        "server_fired": server_fired,
    }


