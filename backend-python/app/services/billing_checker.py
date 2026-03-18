"""Background service: check billing expiry and send notifications."""
import asyncio
import math
from datetime import datetime
from typing import Optional

from ..config import settings
from ..database import fetch_all, execute


_billing_task: Optional[asyncio.Task] = None


async def check_billing_expiry():
    from ..database import get_pool
    pool = await get_pool()

    now = datetime.utcnow()

    # 1. Mark expired subscriptions
    try:
        await pool.execute("""
            UPDATE channel_billing SET status = 'expired'
            WHERE status = 'active' AND expires_at < NOW()
            AND notified_expired = TRUE
        """)
    except Exception as e:
        print(f"[BillingChecker] Error marking expired: {e}")

    # 2. Find active subscriptions to check
    try:
        expiring = await fetch_all("""
            SELECT cb.*, c.title as channel_title, c.user_id as owner_id, c.tracking_code,
                u.telegram_id as owner_telegram_id, u.first_name as owner_name
            FROM channel_billing cb
            JOIN channels c ON c.id = cb.channel_id
            JOIN users u ON u.id = c.user_id
            WHERE cb.status = 'active' AND cb.expires_at IS NOT NULL
        """)
    except Exception as e:
        print(f"[BillingChecker] Error fetching subscriptions: {e}")
        return

    for sub in expiring:
        expires_at = sub.get("expires_at")
        if not expires_at:
            continue
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        days_left = math.ceil((expires_at - now).total_seconds() / 86400)

        try:
            if days_left <= 0 and not sub.get("notified_expired"):
                await _send_expiry_notification(sub, 0)
                await execute("UPDATE channel_billing SET notified_expired = TRUE WHERE id = $1", sub["id"])
                await execute("UPDATE channel_billing SET status = 'expired' WHERE id = $1", sub["id"])
            elif 0 < days_left <= 1 and not sub.get("notified_1d"):
                await _send_expiry_notification(sub, 1)
                await execute("UPDATE channel_billing SET notified_1d = TRUE WHERE id = $1", sub["id"])
            elif 1 < days_left <= 7 and not sub.get("notified_7d"):
                await _send_expiry_notification(sub, days_left)
                await execute("UPDATE channel_billing SET notified_7d = TRUE WHERE id = $1", sub["id"])
        except Exception as e:
            print(f"[BillingChecker] Error processing subscription {sub['id']}: {e}")


async def _send_expiry_notification(sub: dict, days_left: int):
    from .messenger import send_telegram_message
    from .max_api import get_max_api
    from ..database import fetch_one

    app_url = settings.APP_URL
    title = sub.get("channel_title", "")

    if days_left <= 0:
        message = (
            f"⚠️ Подписка на канал «{title}» истекла.\n\n"
            f"Продлите подписку, чтобы продолжить использование всех функций.\n\n"
            f"🔗 Управление подпиской: {app_url}"
        )
    elif days_left == 1:
        message = (
            f"⏰ Подписка на канал «{title}» истекает завтра!\n\n"
            f"Продлите подписку заранее, чтобы не потерять доступ.\n\n"
            f"🔗 Управление подпиской: {app_url}"
        )
    else:
        message = (
            f"📢 Подписка на канал «{title}» истекает через {days_left} дн.\n\n"
            f"Не забудьте продлить подписку вовремя.\n\n"
            f"🔗 Управление подпиской: {app_url}"
        )

    # Get owner with both platform IDs
    owner = await fetch_one(
        "SELECT telegram_id, max_user_id, max_dialog_chat_id FROM users WHERE id = $1",
        sub.get("owner_id"),
    )
    if not owner:
        return

    # Send to Telegram
    tg_id = owner.get("telegram_id")
    if tg_id:
        try:
            await send_telegram_message(tg_id, message)
            print(f"[BillingChecker] Notified TG user {tg_id} ({days_left}d left) for «{title}»")
        except Exception as e:
            print(f"[BillingChecker] TG notify failed {tg_id}: {e}")

    # Send to MAX (prefer dialog chat_id, fallback to send_direct_message)
    max_user_id = owner.get("max_user_id")
    max_api = get_max_api()
    if max_user_id and max_api:
        try:
            dialog_chat_id = owner.get("max_dialog_chat_id")
            if dialog_chat_id:
                await max_api.send_message(dialog_chat_id, message)
            else:
                await max_api.send_direct_message(max_user_id, message)
            print(f"[BillingChecker] Notified MAX user {max_user_id} ({days_left}d left) for «{title}»")
        except Exception as e:
            print(f"[BillingChecker] MAX notify failed {max_user_id}: {e}")


async def _billing_loop():
    # Initial delay
    await asyncio.sleep(10)
    while True:
        try:
            await check_billing_expiry()
        except Exception as e:
            print(f"[BillingChecker] {e}")
        await asyncio.sleep(3600)  # every hour


def start_billing_checker():
    global _billing_task
    _billing_task = asyncio.create_task(_billing_loop())
    print("[BillingChecker] Started (interval: 1h)")


def stop_billing_checker():
    global _billing_task
    if _billing_task:
        _billing_task.cancel()
        _billing_task = None
