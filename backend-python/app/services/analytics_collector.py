"""Background service: collects daily channel analytics snapshots."""
import asyncio
import logging
from datetime import datetime, date

from ..database import fetch_all, fetch_one, execute

log = logging.getLogger(__name__)
_task = None


async def _collect():
    """Run collection loop every 6 hours."""
    while True:
        try:
            await _snapshot_all()
        except Exception as e:
            log.warning(f"[AnalyticsCollector] Error: {e}")
        await asyncio.sleep(6 * 3600)


async def _snapshot_all():
    today = date.today()
    channels = await fetch_all("SELECT id, max_chat_id, platform FROM channels WHERE is_active = 1")
    for ch in channels:
        try:
            existing = await fetch_one(
                "SELECT id FROM channel_analytics WHERE channel_id = $1 AND snapshot_date = $2",
                ch["id"], today)
            if existing:
                continue

            subs = 0
            max_chat_id = ch.get("max_chat_id")
            if max_chat_id:
                try:
                    from .max_api import get_max_api
                    api = get_max_api()
                    if api:
                        info = await api.get_chat(str(max_chat_id))
                        if info.get("success"):
                            subs = info.get("data", {}).get("members_count", 0) or 0
                except Exception:
                    pass

            # Count today's comments
            comments = await fetch_one(
                "SELECT COUNT(*) as cnt FROM post_comments WHERE channel_id = $1 AND created_at::date = $2",
                ch["id"], today)
            comments_count = comments["cnt"] if comments else 0

            # ER: (reactions + comments) / subscribers * 100
            er = 0
            if subs > 0:
                er = round(comments_count / subs * 100, 4)

            await execute(
                """INSERT INTO channel_analytics (channel_id, snapshot_date, subscribers_count, comments_count, engagement_rate)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (channel_id, snapshot_date) DO UPDATE
                   SET subscribers_count = $3, comments_count = $4, engagement_rate = $5""",
                ch["id"], today, subs, comments_count, er)
        except Exception as e:
            log.warning(f"[AnalyticsCollector] Channel {ch['id']}: {e}")

    log.info(f"[AnalyticsCollector] Snapshot done for {len(channels)} channels")


def start_analytics_collector():
    global _task
    if _task is None:
        _task = asyncio.ensure_future(_collect())
        log.info("[AnalyticsCollector] Started (interval: 6h)")


def stop_analytics_collector():
    global _task
    if _task:
        _task.cancel()
        _task = None
