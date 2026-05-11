"""Раз в минуту проверяет admin_broadcasts со статусом 'scheduled' и
scheduled_at <= NOW(). Если такие есть — переводит в 'sending' и запускает
фоновую отправку (use _run_admin_broadcast из admin.py)."""
import asyncio
from ..database import fetch_all, execute

_task = None
_INTERVAL_SEC = 60


async def _check():
    rows = await fetch_all(
        "SELECT id FROM admin_broadcasts WHERE status = 'scheduled' AND scheduled_at <= NOW() ORDER BY scheduled_at LIMIT 5"
    )
    for r in rows:
        bid = int(r["id"])
        await execute(
            "UPDATE admin_broadcasts SET status = 'sending', started_at = NOW() WHERE id = $1 AND status = 'scheduled'",
            bid,
        )
        # Fire-and-forget
        from ..routes.admin import _run_admin_broadcast
        asyncio.create_task(_run_admin_broadcast(bid))
        print(f"[AdminBroadcastRunner] picked up #{bid} for sending")


async def _runner():
    await asyncio.sleep(45)
    while True:
        try:
            await _check()
        except Exception as e:
            print(f"[AdminBroadcastRunner] error: {e}")
        await asyncio.sleep(_INTERVAL_SEC)


def start_admin_broadcast_runner():
    global _task
    _task = asyncio.create_task(_runner())
    print("[AdminBroadcastRunner] Started (interval: 60s)")


def stop_admin_broadcast_runner():
    global _task
    if _task:
        _task.cancel()
        _task = None
