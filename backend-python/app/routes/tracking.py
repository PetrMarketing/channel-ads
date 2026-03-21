from fastapi import APIRouter, Request, HTTPException, Query
from typing import Optional

from ..middleware.auth import verify_telegram_webapp
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


@router.post("/miniapp-visit")
async def miniapp_visit(request: Request):
    """Record visit from MAX Mini App and return channel URL."""
    body = await request.json()
    code = body.get("code", "")

    link = await fetch_one("""
        SELECT tl.*, c.platform, c.username as channel_username,
               c.max_chat_id, c.join_link, c.title as channel_title
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE tl.short_code = $1
    """, code)

    if not link:
        return {"success": False, "channel_url": None}

    # Record click + visit
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    await execute("INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1,$2,$3)", link["id"], ip, ua)

    await execute_returning_id(
        """INSERT INTO visits (tracking_link_id, channel_id, ip_address, user_agent,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term, platform)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        link["id"], link["channel_id"], ip, ua,
        link.get("utm_source"), link.get("utm_medium"), link.get("utm_campaign"),
        link.get("utm_content"), link.get("utm_term"), link.get("platform", "max"),
    )

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

    return {"success": True, "channel_url": channel_url}


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
    link = await fetch_one("""
        SELECT tl.*, c.tracking_code, c.channel_id, c.title as channel_title, c.platform,
            c.username as channel_username, c.max_chat_id, c.yandex_metrika_id, c.vk_pixel_id,
            c.join_link
        FROM tracking_links tl
        JOIN channels c ON c.id = tl.channel_id
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

    visit_id = await execute_returning_id(
        """INSERT INTO visits (tracking_link_id, channel_id, telegram_id, username, first_name,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            ip_address, user_agent, platform, max_user_id, ym_client_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id""",
        link["id"], link["ch_id"], telegram_id, username, first_name,
        link.get("utm_source"), link.get("utm_medium"), link.get("utm_campaign"),
        link.get("utm_content"), link.get("utm_term"),
        body.get("ip_address"), body.get("user_agent"),
        platform, max_user_id, body.get("ym_client_id"),
    )

    # Increment clicks
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    await execute(
        "INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1, $2, $3)",
        link["id"], body.get("ip_address"), body.get("user_agent"),
    )

    return {"success": True, "visitId": visit_id, "channelId": link["ch_id"]}


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


@router.get("/check-subscription-by-visit")
async def check_subscription_by_visit(visit_id: int = Query(...)):
    visit = await fetch_one("SELECT * FROM visits WHERE id = $1", visit_id)
    if not visit:
        return {"success": True, "subscribed": False}

    # First try: direct match by visit_id (bot sets visit_id on subscription)
    sub = await fetch_one(
        "SELECT * FROM subscriptions WHERE visit_id = $1", visit_id
    )

    # Fallback: match by channel + user IDs from visit
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

    # Fallback: any recent subscription to same channel (within 10 min of visit)
    if not sub:
        sub = await fetch_one(
            """SELECT * FROM subscriptions
               WHERE channel_id = $1 AND subscribed_at > $2::timestamp - INTERVAL '1 minute'
               AND subscribed_at < $2::timestamp + INTERVAL '10 minutes'
               ORDER BY subscribed_at DESC LIMIT 1""",
            visit["channel_id"], visit["visited_at"],
        )

    return {"success": True, "subscribed": sub is not None, "subscription": sub}


