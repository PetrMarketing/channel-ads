"""Background service: check paid chat member expiry, send notifications, kick expired members."""
import asyncio
import math
from datetime import datetime
from typing import Optional

import aiohttp

from ..config import settings
from ..database import fetch_all, fetch_one, execute


_task: Optional[asyncio.Task] = None


async def check_paid_chat_expiry():
    from ..database import get_pool
    pool = await get_pool()

    now = datetime.utcnow()

    # Fetch active members with expiration dates (skip one_time plans — they have perpetual access)
    try:
        members = await fetch_all("""
            SELECT m.*, pc.chat_id as chat_identifier, pc.platform as chat_platform,
                   pc.title as chat_title, pc.channel_id,
                   p.title as plan_title, p.plan_type
            FROM paid_chat_members m
            JOIN paid_chats pc ON pc.id = m.paid_chat_id
            LEFT JOIN paid_chat_plans p ON p.id = m.plan_id
            WHERE m.status = 'active' AND m.expires_at IS NOT NULL
              AND (p.plan_type IS NULL OR p.plan_type != 'one_time')
        """)
    except Exception as e:
        print(f"[PaidChatChecker] Error fetching members: {e}")
        return

    for member in members:
        expires_at = member.get("expires_at")
        if not expires_at:
            continue
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        days_left = (expires_at - now).total_seconds() / 86400

        try:
            if days_left <= 0:
                # Subscription expired — kick and mark expired
                if not member.get("notified_expired"):
                    await _send_member_notification(member, "expired")
                    await execute(
                        "UPDATE paid_chat_members SET notified_expired = TRUE WHERE id = $1",
                        member["id"],
                    )
                await _kick_member(member)
                await execute(
                    "UPDATE paid_chat_members SET status = 'expired' WHERE id = $1",
                    member["id"],
                )
                print(f"[PaidChatChecker] Expired & kicked member {member['id']} from chat {member.get('chat_title')}")

            elif days_left <= 1 and not member.get("notified_1d"):
                await _send_member_notification(member, "1_day_before_expiry")
                await execute(
                    "UPDATE paid_chat_members SET notified_1d = TRUE WHERE id = $1",
                    member["id"],
                )

            elif days_left <= 3 and not member.get("notified_3d"):
                await _send_member_notification(member, "3_days_before_expiry")
                await execute(
                    "UPDATE paid_chat_members SET notified_3d = TRUE WHERE id = $1",
                    member["id"],
                )

        except Exception as e:
            print(f"[PaidChatChecker] Error processing member {member['id']}: {e}")


async def _send_member_notification(member: dict, event_type: str):
    """Send notification to the member based on configured notification templates."""
    from .messenger import send_to_user
    from .file_storage import ensure_file

    channel_id = member.get("channel_id")
    chat_title = member.get("chat_title", "чат")

    # Try to get custom notification text + optional image
    notif = await fetch_one(
        "SELECT message_text, file_path, file_type, file_data FROM paid_chat_notifications WHERE channel_id = $1 AND event_type = $2 AND is_active = 1",
        channel_id, event_type,
    )

    if notif and notif.get("message_text"):
        message = notif["message_text"]
    else:
        # Default messages
        if event_type == "3_days_before_expiry":
            message = f"📢 Ваша подписка на «{chat_title}» истекает через 3 дня. Продлите подписку, чтобы сохранить доступ."
        elif event_type == "1_day_before_expiry":
            message = f"⏰ Ваша подписка на «{chat_title}» истекает завтра! Продлите подписку, чтобы не потерять доступ."
        elif event_type == "expired":
            message = f"⚠️ Ваша подписка на «{chat_title}» истекла. Вы были удалены из чата. Оформите подписку заново для возобновления доступа."
        else:
            return

    file_path = ensure_file(notif.get("file_path"), notif.get("file_data")) if notif else None
    file_type = notif.get("file_type") if notif else None

    platform = member.get("platform") or member.get("chat_platform") or "telegram"
    tg_id = member.get("telegram_id")
    max_user_id = member.get("max_user_id")

    user_id = int(tg_id) if platform == "telegram" and tg_id else max_user_id
    if not user_id:
        return

    try:
        await send_to_user(user_id, platform, message, file_path=file_path, file_type=file_type)
        print(f"[PaidChatChecker] Notified {platform} user {user_id} ({event_type}) for «{chat_title}»")
    except Exception as e:
        print(f"[PaidChatChecker] Notify failed {user_id}: {e}")


async def _kick_member(member: dict):
    """Remove the member from the chat via Telegram or MAX API."""
    platform = member.get("platform") or member.get("chat_platform") or "telegram"
    chat_id = member.get("chat_identifier")  # the actual chat_id (TG numeric or MAX string)

    if not chat_id:
        print(f"[PaidChatChecker] No chat_id for member {member['id']}, cannot kick")
        return

    if platform == "telegram":
        tg_id = member.get("telegram_id")
        if not tg_id:
            return
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            return
        url = f"{settings.TELEGRAM_API_URL}/bot{token}/banChatMember"
        payload = {"chat_id": chat_id, "user_id": int(tg_id)}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                result = await resp.json()
                if result.get("ok"):
                    print(f"[PaidChatChecker] Banned TG user {tg_id} from chat {chat_id}")
                    # Immediately unban so they can rejoin if they re-subscribe
                    unban_url = f"{settings.TELEGRAM_API_URL}/bot{token}/unbanChatMember"
                    unban_payload = {"chat_id": chat_id, "user_id": int(tg_id), "only_if_banned": True}
                    async with session.post(unban_url, json=unban_payload) as _:
                        pass
                else:
                    print(f"[PaidChatChecker] Failed to ban TG user {tg_id}: {result}")

    elif platform == "max":
        max_user_id = member.get("max_user_id")
        if not max_user_id:
            return
        from .max_api import get_max_api
        max_api = get_max_api()
        if not max_api:
            return
        result = await max_api.remove_chat_member(str(chat_id), str(max_user_id))
        if result.get("success"):
            print(f"[PaidChatChecker] Removed MAX user {max_user_id} from chat {chat_id}")
        else:
            print(f"[PaidChatChecker] Failed to remove MAX user {max_user_id}: {result.get('error')}")


async def _paid_chat_loop():
    await asyncio.sleep(15)  # Initial delay
    while True:
        try:
            await check_paid_chat_expiry()
        except Exception as e:
            print(f"[PaidChatChecker] {e}")
        await asyncio.sleep(3600)  # every hour


def start_paid_chat_checker():
    global _task
    _task = asyncio.create_task(_paid_chat_loop())
    print("[PaidChatChecker] Started (interval: 1h)")


def stop_paid_chat_checker():
    global _task
    if _task:
        _task.cancel()
        _task = None
