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
