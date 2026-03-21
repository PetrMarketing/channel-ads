"""Background service: periodically check MAX channels admin status and auto-activate/deactivate."""
import asyncio
from typing import Optional

from ..database import fetch_all, execute

_task: Optional[asyncio.Task] = None


async def _check_channels():
    """Check MAX channels: activate if bot is admin, deactivate if not."""
    while True:
        try:
            from ..services.max_api import get_max_api
            max_api = get_max_api()
            if not max_api:
                await asyncio.sleep(300)
                continue

            # Check inactive channels — activate if bot is now admin
            inactive = await fetch_all(
                "SELECT id, max_chat_id, title FROM channels WHERE platform = 'max' AND is_active = 0 AND max_connected = 1 AND max_chat_id IS NOT NULL"
            )
            for ch in (inactive or []):
                try:
                    membership = await max_api.get_membership(ch["max_chat_id"])
                    if membership.get("success") and membership.get("data", {}).get("is_admin"):
                        await execute("UPDATE channels SET is_active = 1 WHERE id = $1", ch["id"])
                        print(f"[ChannelActivator] Activated: {ch.get('title')} ({ch['max_chat_id']})")
                        # Notify owner
                        owner = await fetch_all(
                            "SELECT u.max_user_id FROM users u JOIN channels c ON c.user_id = u.id WHERE c.id = $1 AND u.max_user_id IS NOT NULL",
                            ch["id"],
                        )
                        if owner:
                            from ..routes.max_webhook import _send_to_user_by_id
                            try:
                                await _send_to_user_by_id(max_api, owner[0]["max_user_id"],
                                    f"✅ Канал «{ch.get('title', '')}» теперь активен!")
                            except Exception:
                                pass
                except Exception as e:
                    print(f"[ChannelActivator] Error checking inactive {ch['max_chat_id']}: {e}")

            # Check active channels — deactivate if bot lost admin rights
            active = await fetch_all(
                "SELECT id, max_chat_id, title FROM channels WHERE platform = 'max' AND is_active = 1 AND max_connected = 1 AND max_chat_id IS NOT NULL"
            )
            for ch in (active or []):
                try:
                    membership = await max_api.get_membership(ch["max_chat_id"])
                    if membership.get("success") and not membership.get("data", {}).get("is_admin"):
                        await execute("UPDATE channels SET is_active = 0 WHERE id = $1", ch["id"])
                        print(f"[ChannelActivator] Deactivated (no admin): {ch.get('title')} ({ch['max_chat_id']})")
                        # Notify owner
                        owner = await fetch_all(
                            "SELECT u.max_user_id FROM users u JOIN channels c ON c.user_id = u.id WHERE c.id = $1 AND u.max_user_id IS NOT NULL",
                            ch["id"],
                        )
                        if owner:
                            from ..routes.max_webhook import _send_to_user_by_id
                            try:
                                await _send_to_user_by_id(max_api, owner[0]["max_user_id"],
                                    f"⚠️ Бот потерял права администратора в канале «{ch.get('title', '')}».\n\n"
                                    f"Канал деактивирован. Верните боту права администратора — канал подключится автоматически.")
                            except Exception:
                                pass
                except Exception as e:
                    if "not found" not in str(e).lower():
                        print(f"[ChannelActivator] Error checking active {ch['max_chat_id']}: {e}")

        except Exception as e:
            print(f"[ChannelActivator] Error: {e}")

        await asyncio.sleep(60)  # Every 1 minute


def start_channel_activator():
    global _task
    _task = asyncio.ensure_future(_check_channels())
    print("[ChannelActivator] Started (interval: 1m)")


def stop_channel_activator():
    global _task
    if _task:
        _task.cancel()
        _task = None
