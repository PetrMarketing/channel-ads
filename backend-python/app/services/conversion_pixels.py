"""Durable delivery of confirmed subscription conversion goals.

Yandex goals are delivered only by the documented browser ``reachGoal`` API.
The server coordinates attempts but never manufactures ``/watch`` requests.
VK keeps its existing server transport. Confirmation of a subscription,
queueing, an attempt, transport acceptance and accounting by the destination
are separate facts.

An expired lease has an unknown outcome. Retrying it may duplicate a goal;
neither transport supports an idempotency key, so exactly-once is not claimed.
"""
from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

import aiohttp

from ..database import fetch_one, get_pool


_HTTP_TIMEOUT = aiohttp.ClientTimeout(total=5)
_DEFAULT_GOAL = "subscribe_channel"
_MAX_ATTEMPTS = 3
_LEASE_SECONDS = 20
_RETRY_SECONDS = (5, 30, 120)
_worker_task: Optional[asyncio.Task] = None


def _build_vk_url(pixel_id: str, goal_name: str) -> str:
    return (
        "https://top-fwz1.mail.ru/counter"
        f"?id={quote_plus(str(pixel_id))}"
        "&type=reachGoal"
        f"&goal={quote_plus(goal_name)}"
        "&js=na"
    )


async def _http_get_status(url: str, user_agent: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    headers = {"User-Agent": user_agent} if user_agent else {}
    try:
        async with aiohttp.ClientSession(timeout=_HTTP_TIMEOUT) as session:
            async with session.get(url, headers=headers, allow_redirects=False) as response:
                await response.read()
                return response.status, None
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"[:500]


def _retry_delay(attempt_no: int) -> int:
    return _RETRY_SECONDS[min(max(attempt_no - 1, 0), len(_RETRY_SECONDS) - 1)]


async def _ensure_delivery_for_subscription(subscription_id: int) -> Optional[dict]:
    """Persist confirmation and queue configured destinations idempotently."""
    source = await fetch_one(
        """
        SELECT s.id AS subscription_id, s.channel_id, s.visit_id,
               v.tracking_link_id AS link_id, v.ym_client_id, v.landing_url,
               v.user_agent, tl.ym_counter_id, tl.vk_pixel_id
          FROM subscriptions s
          JOIN visits v ON v.id = s.visit_id
          JOIN tracking_links tl ON tl.id = v.tracking_link_id
         WHERE s.id = $1
        """,
        subscription_id,
    )
    if not source:
        print(f"[conversion] subscription={subscription_id} has no attributed visit")
        return None

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO pending_conversions
                (link_id, channel_id, visit_id, ym_client_id, page_url, user_agent,
                 expires_at, attribution_key, subscription_id, subscribed_at, confirmed_at,
                 ym_delivery_status, ym_next_attempt_at,
                 vk_delivery_status, vk_next_attempt_at)
            VALUES ($1,$2,$3::bigint,$4,$5,$6,NOW() + INTERVAL '7 days',
                    'visit:' || ($3::bigint)::text,$7,NOW(),NOW(),
                    CASE WHEN $8::text IS NULL OR BTRIM($8::text) = '' THEN 'not_configured' ELSE 'queued' END,
                    CASE WHEN $8::text IS NULL OR BTRIM($8::text) = '' THEN NULL ELSE NOW() END,
                    CASE WHEN $9::text IS NULL OR BTRIM($9::text) = '' THEN 'not_configured' ELSE 'queued' END,
                    CASE WHEN $9::text IS NULL OR BTRIM($9::text) = '' THEN NULL ELSE NOW() END)
            ON CONFLICT (attribution_key) WHERE attribution_key IS NOT NULL DO UPDATE
               SET subscription_id = COALESCE(pending_conversions.subscription_id, EXCLUDED.subscription_id),
                   subscribed_at = COALESCE(pending_conversions.subscribed_at, EXCLUDED.subscribed_at),
                   confirmed_at = COALESCE(pending_conversions.confirmed_at, EXCLUDED.confirmed_at),
                   ym_client_id = COALESCE(NULLIF(pending_conversions.ym_client_id, ''), EXCLUDED.ym_client_id),
                   ym_delivery_status = CASE
                       WHEN pending_conversions.ym_delivery_status = 'not_queued'
                            AND EXCLUDED.ym_delivery_status = 'queued' THEN 'queued'
                       ELSE pending_conversions.ym_delivery_status END,
                   ym_next_attempt_at = CASE
                       WHEN pending_conversions.ym_delivery_status = 'not_queued'
                            AND EXCLUDED.ym_delivery_status = 'queued' THEN NOW()
                       ELSE pending_conversions.ym_next_attempt_at END,
                   vk_delivery_status = CASE
                       WHEN pending_conversions.vk_delivery_status = 'not_queued'
                            AND EXCLUDED.vk_delivery_status = 'queued' THEN 'queued'
                       ELSE pending_conversions.vk_delivery_status END,
                   vk_next_attempt_at = CASE
                       WHEN pending_conversions.vk_delivery_status = 'not_queued'
                            AND EXCLUDED.vk_delivery_status = 'queued' THEN NOW()
                       ELSE pending_conversions.vk_next_attempt_at END
            RETURNING *
            """,
            source["link_id"], source["channel_id"], source["visit_id"],
            source.get("ym_client_id"), source.get("landing_url"), source.get("user_agent"),
            subscription_id, source.get("ym_counter_id"), source.get("vk_pixel_id"),
        )
    return dict(row) if row else None


async def _claim_vk(pending_id: Optional[int] = None) -> Optional[dict]:
    token = secrets.token_urlsafe(24)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                UPDATE pending_conversions pc
                   SET vk_delivery_status = 'attempting',
                       vk_attempt_count = vk_attempt_count + 1,
                       vk_attempt_token = $1,
                       vk_attempt_started_at = NOW(),
                       vk_lease_expires_at = NOW() + ($2 * INTERVAL '1 second'),
                       vk_last_error = NULL
                 WHERE pc.id = (
                    SELECT p.id FROM pending_conversions p
                    JOIN tracking_links tl ON tl.id = p.link_id
                    WHERE ($3::bigint IS NULL OR p.id = $3)
                      AND p.subscription_id IS NOT NULL
                      AND NULLIF(BTRIM(tl.vk_pixel_id::text), '') IS NOT NULL
                      AND p.vk_attempt_count < $4
                      AND p.vk_delivery_status IN ('queued','retry_scheduled')
                      AND COALESCE(p.vk_next_attempt_at, NOW()) <= NOW()
                    ORDER BY p.confirmed_at NULLS LAST, p.id
                    LIMIT 1 FOR UPDATE OF p SKIP LOCKED
                 )
                RETURNING pc.id, pc.link_id, pc.user_agent, pc.vk_attempt_count
                """,
                token, _LEASE_SECONDS, pending_id, _MAX_ATTEMPTS,
            )
            if not row:
                return None
            link = await conn.fetchrow(
                "SELECT vk_pixel_id, vk_goal_name FROM tracking_links WHERE id = $1",
                row["link_id"],
            )
            await conn.execute(
                """INSERT INTO conversion_delivery_attempts
                       (pending_conversion_id,destination,attempt_no,attempt_token,delivery_mode)
                     VALUES ($1,'vk',$2,$3,'server_http')""",
                row["id"], row["vk_attempt_count"], token,
            )
    return {
        "pending_id": row["id"], "attempt_no": row["vk_attempt_count"],
        "attempt_token": token, "user_agent": row.get("user_agent"),
        "pixel_id": str(link["vk_pixel_id"]),
        "goal_name": link.get("vk_goal_name") or _DEFAULT_GOAL,
    }


async def _finish_vk(claim: dict, response_code: Optional[int], error: Optional[str]) -> None:
    accepted = response_code is not None and 200 <= response_code < 300 and not error
    exhausted = claim["attempt_no"] >= _MAX_ATTEMPTS
    status = "transport_accepted" if accepted else ("failed_exhausted" if exhausted else "retry_scheduled")
    transport_status = "accepted" if accepted else ("network_error" if response_code is None else "http_error")
    message = error or (None if accepted else f"HTTP {response_code}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """UPDATE conversion_delivery_attempts
                      SET finished_at=NOW(),transport_status=$2,response_code=$3,error=$4
                    WHERE attempt_token=$1""",
                claim["attempt_token"], transport_status, response_code, message,
            )
            await conn.execute(
                """UPDATE pending_conversions
                      SET vk_delivery_status=$2,vk_response_code=$3,vk_last_error=$4,vk_error=$4,
                          vk_transport_accepted_at=CASE WHEN $5 THEN NOW() ELSE vk_transport_accepted_at END,
                          vk_fired_at=CASE WHEN $5 THEN NOW() ELSE vk_fired_at END,
                          vk_next_attempt_at=CASE WHEN $2='retry_scheduled'
                              THEN NOW() + ($6 * INTERVAL '1 second') ELSE NULL END,
                          vk_lease_expires_at=NULL
                    WHERE id=$1 AND vk_attempt_token=$7""",
                claim["pending_id"], status, response_code, message, accepted,
                _retry_delay(claim["attempt_no"]), claim["attempt_token"],
            )


async def _deliver_one_vk(pending_id: Optional[int] = None) -> bool:
    claim = await _claim_vk(pending_id)
    if not claim:
        return False
    code, error = await _http_get_status(
        _build_vk_url(claim["pixel_id"], claim["goal_name"]), claim.get("user_agent"),
    )
    await _finish_vk(claim, code, error)
    return True


async def fire_server_goals(subscription_id: int) -> None:
    """Queue confirmed delivery and try VK once; never fire Yandex server-side."""
    if not subscription_id:
        return
    pending = await _ensure_delivery_for_subscription(subscription_id)
    if pending:
        await _deliver_one_vk(pending["id"])


async def fire_server_goals_safe(subscription_id: Optional[int]) -> None:
    if not subscription_id:
        return
    try:
        await fire_server_goals(subscription_id)
    except Exception as exc:
        print(f"[conversion] queue failed subscription={subscription_id}: {type(exc).__name__}: {exc}")


async def claim_yandex_browser_delivery(visit_id: int, visit_token: str) -> dict:
    """Lease one documented browser reachGoal attempt for this exact visit."""
    token = secrets.token_urlsafe(24)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                """SELECT p.*,tl.ym_counter_id,tl.ym_goal_name
                     FROM pending_conversions p
                     JOIN visits v ON v.id=p.visit_id
                     JOIN tracking_links tl ON tl.id=p.link_id
                    WHERE p.visit_id=$1 AND v.visit_token=$2 FOR UPDATE OF p""",
                visit_id, visit_token,
            )
            if not current:
                return {"claimed": False, "status": "not_found"}
            now = datetime.now(timezone.utc)
            status = current["ym_delivery_status"]
            eligible = (
                current["subscription_id"] is not None
                and current.get("ym_counter_id")
                and current["ym_attempt_count"] < _MAX_ATTEMPTS
                and (
                    status == "queued"
                    or (status == "retry_scheduled" and (
                        current["ym_next_attempt_at"] is None or current["ym_next_attempt_at"] <= now
                    ))
                    or (status == "attempting" and current["ym_lease_expires_at"] is not None
                        and current["ym_lease_expires_at"] <= now)
                )
            )
            if not eligible:
                return {"claimed": False, "status": status,
                        "attempt_count": current["ym_attempt_count"],
                        "accounting_confirmed": current["ym_accounting_confirmed_at"] is not None}
            if status == "attempting" and current.get("ym_attempt_token"):
                await conn.execute(
                    """UPDATE conversion_delivery_attempts
                          SET finished_at=COALESCE(finished_at,NOW()),
                              transport_status=COALESCE(transport_status,'outcome_unknown'),
                              error=COALESCE(error,'browser lease expired before acknowledgement')
                        WHERE attempt_token=$1""",
                    current["ym_attempt_token"],
                )
            attempt_no = current["ym_attempt_count"] + 1
            await conn.execute(
                """UPDATE pending_conversions
                      SET ym_delivery_status='attempting',ym_attempt_count=$2,
                          ym_attempt_token=$3,ym_attempt_started_at=NOW(),
                          ym_lease_expires_at=NOW() + ($4 * INTERVAL '1 second'),ym_last_error=NULL
                    WHERE id=$1""",
                current["id"], attempt_no, token, _LEASE_SECONDS,
            )
            await conn.execute(
                """INSERT INTO conversion_delivery_attempts
                       (pending_conversion_id,destination,attempt_no,attempt_token,delivery_mode)
                     VALUES ($1,'yandex',$2,$3,'browser_reach_goal')""",
                current["id"], attempt_no, token,
            )
            return {"claimed": True, "attempt_token": token, "attempt_no": attempt_no,
                    "counter_id": str(current["ym_counter_id"]),
                    "goal_name": current.get("ym_goal_name") or _DEFAULT_GOAL,
                    "lease_seconds": _LEASE_SECONDS}


async def finish_yandex_browser_delivery(
    visit_id: int, visit_token: str, attempt_token: str,
    outcome: str, error: Optional[str] = None,
) -> dict:
    """Persist callback/timeout. A callback is transport, not accounting proof."""
    accepted = outcome == "transport_accepted"
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """SELECT p.id,p.ym_attempt_count,p.ym_attempt_token
                     FROM pending_conversions p JOIN visits v ON v.id=p.visit_id
                    WHERE p.visit_id=$1 AND v.visit_token=$2 FOR UPDATE OF p""",
                visit_id, visit_token,
            )
            if not row:
                return {"success": False, "status": "not_found"}
            await conn.execute(
                """UPDATE conversion_delivery_attempts
                      SET finished_at=NOW(),transport_status=$2,error=$3
                    WHERE attempt_token=$1""",
                attempt_token, "accepted" if accepted else "outcome_unknown",
                (error or None)[:500] if error else None,
            )
            if row["ym_attempt_token"] != attempt_token:
                return {"success": False, "status": "stale_attempt"}
            exhausted = row["ym_attempt_count"] >= _MAX_ATTEMPTS
            status = "transport_accepted" if accepted else (
                "outcome_unknown_exhausted" if exhausted else "retry_scheduled"
            )
            await conn.execute(
                """UPDATE pending_conversions
                      SET ym_delivery_status=$2,
                          ym_transport_accepted_at=CASE WHEN $3 THEN NOW() ELSE ym_transport_accepted_at END,
                          ym_fired_at=CASE WHEN $3 THEN NOW() ELSE ym_fired_at END,
                          ym_last_error=CASE WHEN $3 THEN NULL ELSE $4 END,
                          ym_error=CASE WHEN $3 THEN NULL ELSE $4 END,
                          ym_next_attempt_at=CASE WHEN $2='retry_scheduled'
                              THEN NOW() + ($5 * INTERVAL '1 second') ELSE NULL END,
                          ym_lease_expires_at=NULL
                    WHERE id=$1 AND ym_attempt_token=$6""",
                row["id"], status, accepted, (error or "browser callback timeout")[:500],
                _retry_delay(row["ym_attempt_count"]), attempt_token,
            )
            return {"success": True, "status": status, "accounting_confirmed": False}


async def get_delivery_state_for_visit(visit_id: int) -> Optional[dict]:
    return await fetch_one(
        """SELECT confirmed_at,subscription_id,
                  ym_delivery_status,ym_attempt_count,ym_transport_accepted_at,
                  ym_accounting_confirmed_at,ym_last_error,
                  vk_delivery_status,vk_attempt_count,vk_transport_accepted_at,
                  vk_accounting_confirmed_at,vk_last_error
             FROM pending_conversions WHERE visit_id=$1""",
        visit_id,
    )


async def _reconcile_expired_yandex_leases() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            expired = await conn.fetch(
                """SELECT id,ym_attempt_token,ym_attempt_count FROM pending_conversions
                     WHERE ym_delivery_status='attempting' AND ym_lease_expires_at < NOW()
                     FOR UPDATE SKIP LOCKED"""
            )
            for row in expired:
                await conn.execute(
                    """UPDATE conversion_delivery_attempts
                          SET finished_at=COALESCE(finished_at,NOW()),
                              transport_status=COALESCE(transport_status,'outcome_unknown'),
                              error=COALESCE(error,'browser closed or callback timed out')
                        WHERE attempt_token=$1""",
                    row["ym_attempt_token"],
                )
                exhausted = row["ym_attempt_count"] >= _MAX_ATTEMPTS
                await conn.execute(
                    """UPDATE pending_conversions
                          SET ym_delivery_status=$2,ym_lease_expires_at=NULL,
                              ym_next_attempt_at=CASE WHEN $2='retry_scheduled' THEN NOW() ELSE NULL END,
                              ym_last_error='browser closed or callback timed out'
                        WHERE id=$1""",
                    row["id"], "outcome_unknown_exhausted" if exhausted else "retry_scheduled",
                )


async def _reconcile_expired_vk_leases() -> None:
    """Turn process-crash leases into an explicit unknown outcome."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            expired = await conn.fetch(
                """SELECT id,vk_attempt_token,vk_attempt_count FROM pending_conversions
                     WHERE vk_delivery_status='attempting' AND vk_lease_expires_at < NOW()
                     FOR UPDATE SKIP LOCKED"""
            )
            for row in expired:
                await conn.execute(
                    """UPDATE conversion_delivery_attempts
                          SET finished_at=COALESCE(finished_at,NOW()),
                              transport_status=COALESCE(transport_status,'outcome_unknown'),
                              error=COALESCE(error,'server stopped before result was persisted')
                        WHERE attempt_token=$1""",
                    row["vk_attempt_token"],
                )
                exhausted = row["vk_attempt_count"] >= _MAX_ATTEMPTS
                await conn.execute(
                    """UPDATE pending_conversions
                          SET vk_delivery_status=$2,vk_lease_expires_at=NULL,
                              vk_next_attempt_at=CASE WHEN $2='retry_scheduled' THEN NOW() ELSE NULL END,
                              vk_last_error='server stopped before result was persisted'
                        WHERE id=$1""",
                    row["id"], "outcome_unknown_exhausted" if exhausted else "retry_scheduled",
                )


async def _reconcile_confirmed_subscriptions() -> None:
    """Recover a webhook committed immediately before queueing/process crash."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.id
              FROM subscriptions s
              JOIN visits v ON v.id=s.visit_id
              LEFT JOIN pending_conversions p ON p.visit_id=s.visit_id
             WHERE s.visit_id IS NOT NULL
               AND s.subscribed_at >= COALESCE(
                   (SELECT applied_at AT TIME ZONE 'UTC'
                      FROM _migrations
                     WHERE filename = '096_conversion_delivery_state.sql'),
                   NOW()
               )
               AND (p.id IS NULL OR p.confirmed_at IS NULL)
             ORDER BY s.id
             LIMIT 100
            """
        )
    for row in rows:
        await _ensure_delivery_for_subscription(row["id"])


async def _delivery_worker() -> None:
    while True:
        try:
            await _reconcile_confirmed_subscriptions()
            await _reconcile_expired_yandex_leases()
            await _reconcile_expired_vk_leases()
            for _ in range(20):
                if not await _deliver_one_vk():
                    break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[conversion] worker error: {type(exc).__name__}: {exc}")
        await asyncio.sleep(5)


def start_conversion_delivery_worker() -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_delivery_worker())


def stop_conversion_delivery_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
    _worker_task = None


# Compatibility for legacy Telegram call sites. Unsafe channel FIFO/orphan
# attribution is intentionally gone; delivery follows the subscription visit.
async def claim_pending_and_fire_safe(channel_id: Optional[int], subscription_id: Optional[int]) -> None:
    del channel_id
    await fire_server_goals_safe(subscription_id)


async def claim_orphan_for_pending_safe(*args, **kwargs) -> None:
    del args, kwargs
