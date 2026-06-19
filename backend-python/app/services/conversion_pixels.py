"""Server-side firing of Yandex Metrika and VK Pixel conversion goals.

Hybrid backup for the SubscribePage client-side firing: when the user closes the
tab before the polling loop detects subscription, the bot/webhook still triggers
the goal via these out-of-band measurement-protocol HTTP calls.

Exactly-once is enforced via the `subscriptions.goal_fired_at` column. Whichever
side (client poll fires `reachGoal`, server fires here) wins the race, the
other backs off:
  - Server flow: SELECT ... FOR UPDATE, check NULL, fire, set NOW().
  - Client flow: /track/check-subscription-by-visit returns server_fired=true
    if goal_fired_at IS NOT NULL, and the SubscribePage skips fireGoals() then.
"""
from __future__ import annotations

import asyncio
from typing import Optional
from urllib.parse import quote_plus

import aiohttp

from ..database import fetch_one, execute
from ..config import settings


_HTTP_TIMEOUT = aiohttp.ClientTimeout(total=5)
_DEFAULT_GOAL = "subscribe_channel"


def _build_ym_url(counter_id: str, goal_name: str, page_url: str,
                   ym_client_id: Optional[str]) -> str:
    """Build a Yandex Metrika measurement-protocol URL.

    Uses the documented image-pixel form:
      https://mc.yandex.ru/watch/{counter}?page-url=...&browser-info=...&ut=noindex
    The goal is encoded inside browser-info as `goal:{name}`. ym_client_id is
    threaded via `cid:` for attribution if available; missing cid still records
    the goal (just less precise attribution)."""
    bi_parts = ["ifr:0"]
    if ym_client_id:
        bi_parts.append(f"cid:{ym_client_id}")
    bi_parts.append("ti:0")
    bi_parts.append(f"goal:{goal_name}")
    browser_info = ":".join(bi_parts)
    return (
        f"https://mc.yandex.ru/watch/{quote_plus(str(counter_id))}"
        f"?page-url={quote_plus(page_url)}"
        f"&page-ref="
        f"&browser-info={quote_plus(browser_info)}"
        f"&ut=noindex"
    )


def _build_vk_url(pixel_id: str, goal_name: str) -> str:
    """Build a VK Pixel (top-fwz1.mail.ru) reachGoal URL."""
    return (
        f"https://top-fwz1.mail.ru/counter"
        f"?id={quote_plus(str(pixel_id))}"
        f"&type=reachGoal"
        f"&goal={quote_plus(goal_name)}"
        f"&js=na"
    )


async def _http_get(url: str, user_agent: Optional[str]) -> None:
    """Fire-and-forget GET. Errors swallowed; logged with [track] prefix."""
    headers = {}
    if user_agent:
        headers["User-Agent"] = user_agent
    try:
        async with aiohttp.ClientSession(timeout=_HTTP_TIMEOUT) as session:
            async with session.get(url, headers=headers, allow_redirects=False) as resp:
                # Drain a small amount so the connection cleanly closes.
                await resp.read()
                if resp.status >= 400:
                    print(f"[track] server-fire HTTP {resp.status} url={url[:200]}")
    except Exception as e:
        print(f"[track] server-fire HTTP error: {e} url={url[:200]}")


async def _http_get_status(url: str, user_agent: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    """GET that returns (status_code, error_message). Used by the per-pending
    pixel-firing flow so we can persist outcome to DB. status is None on
    network failure; error is None on success."""
    headers = {}
    if user_agent:
        headers["User-Agent"] = user_agent
    try:
        async with aiohttp.ClientSession(timeout=_HTTP_TIMEOUT) as session:
            async with session.get(url, headers=headers, allow_redirects=False) as resp:
                await resp.read()
                return resp.status, None
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"[:500]


async def fire_server_goals(subscription_id: int) -> None:
    """Idempotently fire YM + VK conversion goals for a subscription.

    Safe to call multiple times — the FOR UPDATE + goal_fired_at NULL check
    ensures a single firing. Skips if subscription has no visit_id.
    """
    if not subscription_id:
        return

    pool_conn = None
    try:
        from ..database import get_pool
        pool = await get_pool()

        # Lock the subscription row, atomically check goal_fired_at.
        async with pool.acquire() as conn:
            async with conn.transaction():
                sub = await conn.fetchrow(
                    """
                    SELECT id, channel_id, visit_id, goal_fired_at
                    FROM subscriptions
                    WHERE id = $1
                    FOR UPDATE
                    """,
                    subscription_id,
                )
                if not sub:
                    print(f"[track] server-fire skipped subscription={subscription_id} reason=not_found")
                    return
                if sub["goal_fired_at"] is not None:
                    print(f"[track] server-fire skipped subscription={subscription_id} reason=already_fired")
                    return
                if not sub["visit_id"]:
                    print(f"[track] server-fire skipped subscription={subscription_id} reason=no_visit_id")
                    return

                # Mark fired immediately so concurrent claims back off,
                # even if the HTTP calls below fail (we don't want infinite retries).
                await conn.execute(
                    "UPDATE subscriptions SET goal_fired_at = NOW() WHERE id = $1",
                    subscription_id,
                )

                visit_id = sub["visit_id"]

        # Resolve goal config from the visit + tracking_link + channel join.
        cfg = await fetch_one(
            """
            SELECT
                v.id          AS visit_id,
                v.user_agent  AS user_agent,
                v.ym_client_id AS ym_client_id,
                tl.short_code  AS short_code,
                tl.ym_counter_id AS link_ym_counter,
                tl.ym_goal_name  AS link_ym_goal,
                tl.vk_pixel_id   AS link_vk_pixel,
                tl.vk_goal_name  AS link_vk_goal,
                c.yandex_metrika_id AS channel_ym_counter,
                c.vk_pixel_id       AS channel_vk_pixel
            FROM visits v
            LEFT JOIN tracking_links tl ON tl.id = v.tracking_link_id
            LEFT JOIN channels c        ON c.id = v.channel_id
            WHERE v.id = $1
            """,
            visit_id,
        )
        if not cfg:
            print(f"[track] server-fire skipped subscription={subscription_id} reason=no_visit_row")
            return

        ym_counter = cfg.get("link_ym_counter") or cfg.get("channel_ym_counter")
        ym_goal = cfg.get("link_ym_goal") or _DEFAULT_GOAL
        vk_pixel = cfg.get("link_vk_pixel") or cfg.get("channel_vk_pixel")
        vk_goal = cfg.get("link_vk_goal") or _DEFAULT_GOAL

        if not ym_counter and not vk_pixel:
            print(f"[track] server-fire skipped subscription={subscription_id} reason=no_pixel_configured")
            return

        # Landing URL — best-effort reconstruction so YM has a sane page-url.
        short_code = cfg.get("short_code") or ""
        landing_url = f"{settings.APP_URL.rstrip('/')}/subscribe/{short_code}" if short_code else settings.APP_URL

        ym_client_id = cfg.get("ym_client_id")
        user_agent = cfg.get("user_agent")

        tasks = []
        if ym_counter:
            tasks.append(_http_get(
                _build_ym_url(ym_counter, ym_goal, landing_url, ym_client_id),
                user_agent,
            ))
        if vk_pixel:
            tasks.append(_http_get(_build_vk_url(vk_pixel, vk_goal), user_agent))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        print(
            f"[track] server-fired goals subscription={subscription_id} "
            f"ym={ym_counter or '-'} vk={vk_pixel or '-'} "
            f"goal_ym={ym_goal} goal_vk={vk_goal} cid={'y' if ym_client_id else 'n'}"
        )
    except Exception as e:
        print(f"[track] fire_server_goals fatal error subscription={subscription_id}: {e}")


async def fire_server_goals_safe(subscription_id: Optional[int]) -> None:
    """Wrapper that swallows None / errors — convenient for INSERT call sites."""
    if not subscription_id:
        return
    try:
        await fire_server_goals(subscription_id)
    except Exception as e:
        print(f"[track] fire_server_goals_safe error sub={subscription_id}: {e}")


async def _fire_goals_for_link(
    link_id: int,
    ym_client_id: Optional[str],
    page_url_stored: Optional[str],
    user_agent: Optional[str],
    log_prefix: str,
) -> dict:
    """Resolve YM/VK config for a link (link-level overrides channel-level)
    and fire reachGoal via the measurement protocol.

    Returns a dict with per-pixel outcome:
      {
        "ym_fired": bool, "ym_code": int|None, "ym_error": str|None,
        "vk_fired": bool, "vk_code": int|None, "vk_error": str|None,
      }
    Used by both pending-claim and orphan-claim flows so they can persist the
    per-pixel HTTP outcome on the pending_conversions row."""
    out = {
        "ym_fired": False, "ym_code": None, "ym_error": None,
        "vk_fired": False, "vk_code": None, "vk_error": None,
    }
    link = await fetch_one(
        """
        SELECT tl.short_code,
               tl.ym_counter_id, tl.ym_goal_name,
               tl.vk_pixel_id,   tl.vk_goal_name,
               c.yandex_metrika_id AS channel_ym_id,
               c.vk_pixel_id       AS channel_vk_pixel_id
        FROM tracking_links tl
        JOIN channels c ON c.id = tl.channel_id
        WHERE tl.id = $1
        """,
        link_id,
    )
    if not link:
        print(f"[track] {log_prefix} link {link_id} missing — skipping fire")
        return out

    counter_id = (link.get("ym_counter_id") or link.get("channel_ym_id") or "")
    counter_id = str(counter_id).strip() if counter_id else ""
    pixel_id = (link.get("vk_pixel_id") or link.get("channel_vk_pixel_id") or "")
    pixel_id = str(pixel_id).strip() if pixel_id else ""
    ym_goal = link.get("ym_goal_name") or _DEFAULT_GOAL
    vk_goal = link.get("vk_goal_name") or _DEFAULT_GOAL

    short_code = link.get("short_code") or ""
    page_url = page_url_stored or (
        f"{settings.APP_URL.rstrip('/')}/subscribe/{short_code}"
        if short_code else settings.APP_URL
    )

    if not counter_id and not pixel_id:
        print(f"[track] {log_prefix} no pixel configured for link {link_id}")
        return out

    # Fire concurrently and collect per-pixel outcomes.
    ym_task = None
    vk_task = None
    if counter_id:
        ym_task = asyncio.create_task(_http_get_status(
            _build_ym_url(counter_id, ym_goal, page_url, ym_client_id),
            user_agent,
        ))
    if pixel_id:
        vk_task = asyncio.create_task(_http_get_status(
            _build_vk_url(pixel_id, vk_goal), user_agent,
        ))

    if ym_task is not None:
        try:
            out["ym_code"], out["ym_error"] = await ym_task
            out["ym_fired"] = True
        except Exception as e:
            out["ym_error"] = f"{type(e).__name__}: {e}"[:500]
            out["ym_fired"] = True
    if vk_task is not None:
        try:
            out["vk_code"], out["vk_error"] = await vk_task
            out["vk_fired"] = True
        except Exception as e:
            out["vk_error"] = f"{type(e).__name__}: {e}"[:500]
            out["vk_fired"] = True

    print(
        f"[track] {log_prefix} fired ym={counter_id or '-'}({out['ym_code']}) "
        f"vk={pixel_id or '-'}({out['vk_code']}) cid={'y' if ym_client_id else 'n'}"
    )
    return out


async def _record_offline_conversion_for_subscription(
    subscription_id: int, channel_id: int, link_id: Optional[int],
    ym_client_id: Optional[str], visit_id: Optional[int] = None,
) -> None:
    """Записывает offline_conversion для подписки чтобы потом залить в YM API.
    Server-side fire через measurement-protocol фильтруется YM по IP датацентра,
    а offline conversions API принимает ClientId + Target + DateTime без
    привязки к IP — это РАБОТАЕТ. Уникальность по subscription_id защищает
    от дублей.
    """
    if not subscription_id or not channel_id or not ym_client_id:
        return
    try:
        # Резолвим goal_name + ym_counter_id (link > channel)
        link = None
        if link_id:
            link = await fetch_one(
                """SELECT tl.ym_counter_id AS tl_counter, tl.ym_goal_name AS tl_goal,
                          c.yandex_metrika_id AS c_counter
                   FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
                   WHERE tl.id = $1""", link_id,
            )
        if not link:
            link = await fetch_one(
                "SELECT yandex_metrika_id AS c_counter FROM channels WHERE id = $1",
                channel_id,
            )
        if not link:
            return
        counter_id = (link.get("tl_counter") or link.get("c_counter") or "")
        counter_id = str(counter_id).strip() if counter_id else ""
        if not counter_id:
            return  # нет YM-счётчика — некуда заливать
        goal_name = link.get("tl_goal") or _DEFAULT_GOAL
        await execute(
            """INSERT INTO offline_conversions
                 (subscription_id, channel_id, visit_id, ym_client_id, ym_counter_id, goal_name, conversion_time)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (subscription_id) DO NOTHING""",
            subscription_id, channel_id, visit_id,
            str(ym_client_id), counter_id, goal_name,
        )
        print(f"[track] offline conversion recorded sub={subscription_id} cid={ym_client_id} counter={counter_id} goal={goal_name}")
    except Exception as e:
        print(f"[track] offline conversion insert failed sub={subscription_id}: {e}")


async def _persist_pending_pixel_status(pending_id: int, outcome: dict) -> None:
    """Write per-pixel HTTP outcome onto the pending_conversions row so the
    user can audit every step (subscribed_at | ym_fired_at/code/error |
    vk_fired_at/code/error). Best-effort; logs but never raises."""
    if not pending_id:
        return
    try:
        await execute(
            """
            UPDATE pending_conversions
               SET ym_fired_at      = CASE WHEN $2::bool THEN NOW() ELSE ym_fired_at END,
                   ym_response_code = COALESCE($3, ym_response_code),
                   ym_error         = COALESCE($4, ym_error),
                   vk_fired_at      = CASE WHEN $5::bool THEN NOW() ELSE vk_fired_at END,
                   vk_response_code = COALESCE($6, vk_response_code),
                   vk_error         = COALESCE($7, vk_error)
             WHERE id = $1
            """,
            pending_id,
            bool(outcome.get("ym_fired")), outcome.get("ym_code"), outcome.get("ym_error"),
            bool(outcome.get("vk_fired")), outcome.get("vk_code"), outcome.get("vk_error"),
        )
    except Exception as e:
        print(f"[track] persist pixel status failed pending={pending_id}: {e}")


async def _record_orphan_subscription(
    channel_id: int, subscription_id: int
) -> None:
    """Insert an orphan_subscription with a 60s window. Called when a subscription
    arrives but no pending_conversion is waiting (race where sub came before click)."""
    from datetime import datetime, timedelta, timezone
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)
    try:
        await execute(
            """INSERT INTO orphan_subscriptions
               (channel_id, subscription_id, expires_at)
               VALUES ($1, $2, $3)""",
            channel_id, subscription_id, expires_at,
        )
        print(
            f"[track] orphan recorded sub={subscription_id} channel={channel_id} "
            f"expires=60s"
        )
    except Exception as e:
        print(f"[track] orphan insert failed channel={channel_id} sub={subscription_id}: {e}")


async def claim_and_fire_pending_for_channel(
    channel_id: int, subscription_id: int
) -> None:
    """Atomically claim the OLDEST unfired pending_conversion in this channel
    (within its 60s window) and fire YM/VK reachGoals via the measurement API.

    Guarantees:
      - 1 subscription = at most 1 fire (via FOR UPDATE SKIP LOCKED)
      - If no pending in window → records orphan_subscription (60s window) so a
        click that arrives shortly after can still attribute this subscription.
      - Excess clicks (more clicks than subs in window) → expire silently
    """
    if not channel_id or not subscription_id:
        return

    try:
        from ..database import get_pool
        pool = await get_pool()

        async with pool.acquire() as conn:
            async with conn.transaction():
                claimed = await conn.fetchrow(
                    """
                    UPDATE pending_conversions
                    SET fired_at = NOW(),
                        subscribed_at = NOW(),
                        subscription_id = $1
                    WHERE id = (
                        SELECT id FROM pending_conversions
                        WHERE channel_id = $2
                          AND fired_at IS NULL
                          AND expires_at > NOW()
                        ORDER BY created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, link_id, ym_client_id, page_url, user_agent
                    """,
                    subscription_id, channel_id,
                )
    except Exception as e:
        print(f"[track] claim pending failed channel={channel_id}: {type(e).__name__}: {e}")
        return

    if not claimed:
        # Symmetric pending: record orphan_subscription so a future click within
        # 60s can claim and fire goals retroactively.
        print(f"[track] no pending in channel {channel_id} — recording orphan (sub={subscription_id})")
        await _record_orphan_subscription(channel_id, subscription_id)
        return

    pending_id = claimed["id"]
    link_id = claimed["link_id"]
    ym_client_id = claimed.get("ym_client_id")
    page_url_stored = claimed.get("page_url") or ""
    user_agent = claimed.get("user_agent") or None

    outcome = await _fire_goals_for_link(
        link_id, ym_client_id, page_url_stored, user_agent,
        log_prefix=f"pending {pending_id} → (sub={subscription_id})",
    )
    await _persist_pending_pixel_status(pending_id, outcome)
    # Запасной канал атрибуции: оффлайн-конверсия в YM (через OAuth API).
    # Этот путь не фильтруется по IP, в отличие от mc.yandex.ru/watch fire.
    await _record_offline_conversion_for_subscription(
        subscription_id, channel_id, link_id, ym_client_id,
        visit_id=None,
    )


async def claim_orphan_for_pending(
    pending_id: int, channel_id: int, link_id: int,
    ym_client_id: Optional[str] = None,
    page_url: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Reverse-flow claim: a click just created pending_id; check if any
    orphan_subscription is waiting in this channel and, if so, atomically claim
    the oldest unfired one and fire YM/VK goals attributed to this link.

    Guarantees:
      - 1 orphan = 1 fire (via FOR UPDATE SKIP LOCKED)
      - Marks both orphan.fired_at and pending.fired_at to keep them paired and
        prevent the bot's later sub-arrival from double-firing this pending.
    """
    if not pending_id or not channel_id or not link_id:
        return

    try:
        from ..database import get_pool
        pool = await get_pool()

        async with pool.acquire() as conn:
            async with conn.transaction():
                claimed = await conn.fetchrow(
                    """
                    UPDATE orphan_subscriptions
                    SET fired_at = NOW(), pending_id = $1
                    WHERE id = (
                        SELECT id FROM orphan_subscriptions
                        WHERE channel_id = $2
                          AND fired_at IS NULL
                          AND expires_at > NOW()
                        ORDER BY created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, subscription_id
                    """,
                    pending_id, channel_id,
                )
                if claimed:
                    # Mark the pending as fired too — we just attributed it to this orphan.
                    await conn.execute(
                        """UPDATE pending_conversions
                           SET fired_at = NOW(),
                               subscribed_at = NOW(),
                               subscription_id = $1
                           WHERE id = $2 AND fired_at IS NULL""",
                        claimed["subscription_id"], pending_id,
                    )
    except Exception as e:
        print(f"[track] claim orphan failed channel={channel_id} pending={pending_id}: {type(e).__name__}: {e}")
        return

    if not claimed:
        return  # No orphan waiting — normal case, pending stays open for sub.

    orphan_id = claimed["id"]
    sub_id = claimed["subscription_id"]

    outcome = await _fire_goals_for_link(
        link_id, ym_client_id, page_url, user_agent,
        log_prefix=f"orphan {orphan_id} → (sub={sub_id}, pending={pending_id})",
    )
    await _persist_pending_pixel_status(pending_id, outcome)
    # Запасной канал — offline conversion в YM
    await _record_offline_conversion_for_subscription(
        sub_id, channel_id, link_id, ym_client_id,
        visit_id=None,
    )


async def claim_orphan_for_pending_safe(
    pending_id: Optional[int], channel_id: Optional[int], link_id: Optional[int],
    ym_client_id: Optional[str] = None,
    page_url: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Wrapper that swallows None / errors — convenient for click-flow call sites."""
    if not pending_id or not channel_id or not link_id:
        return
    try:
        await claim_orphan_for_pending(
            pending_id, channel_id, link_id,
            ym_client_id=ym_client_id, page_url=page_url, user_agent=user_agent,
        )
    except Exception as e:
        print(
            f"[track] claim_orphan_for_pending_safe error "
            f"channel={channel_id} pending={pending_id}: {e}"
        )


async def claim_pending_and_fire_safe(
    channel_id: Optional[int], subscription_id: Optional[int]
) -> None:
    """Wrapper that swallows None / errors — convenient for bot INSERT call sites."""
    if not channel_id or not subscription_id:
        return
    try:
        await claim_and_fire_pending_for_channel(channel_id, subscription_id)
    except Exception as e:
        print(
            f"[track] claim_pending_and_fire_safe error "
            f"channel={channel_id} sub={subscription_id}: {e}"
        )
