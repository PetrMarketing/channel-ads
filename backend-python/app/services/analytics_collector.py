"""Background service: collects channel analytics — subscribers + post views."""
import asyncio
import logging
from datetime import datetime, date

from ..database import fetch_all, fetch_one, execute

log = logging.getLogger(__name__)
_task = None


async def _collect():
    """Run collection loop every 2 hours."""
    while True:
        try:
            await _snapshot_all()
        except Exception as e:
            log.warning(f"[AnalyticsCollector] Error: {e}")
        await asyncio.sleep(2 * 3600)


async def _snapshot_all():
    today = date.today()
    channels = await fetch_all("SELECT id, max_chat_id, channel_id, platform FROM channels WHERE is_active = 1")
    for ch in channels:
        try:
            await _collect_channel(ch, today)
        except Exception as e:
            log.warning(f"[AnalyticsCollector] Channel {ch['id']}: {e}")

    log.info(f"[AnalyticsCollector] Snapshot done for {len(channels)} channels")


async def _collect_channel(ch, today):
    """Collect subscribers + post views for one channel."""
    subs = 0
    views_total = 0
    posts_checked = 0

    max_chat_id = ch.get("max_chat_id")
    platform = ch.get("platform", "")

    if platform == "max" and max_chat_id:
        try:
            from .max_api import get_max_api
            api = get_max_api()
            if api:
                # Get subscribers count
                info = await api.get_chat(str(max_chat_id))
                if info.get("success"):
                    data = info.get("data", {})
                    subs = data.get("participants_count", 0) or data.get("members_count", 0) or 0

                # Get recent messages with view counts
                msgs_result = await api.get_messages(str(max_chat_id), count=100)
                if msgs_result.get("success"):
                    messages = msgs_result.get("data", {}).get("messages", [])
                    for msg in messages:
                        stat = msg.get("stat")
                        if stat and stat.get("views"):
                            msg_id = msg.get("body", {}).get("mid") or ""
                            msg_views = stat["views"]
                            views_total += msg_views
                            posts_checked += 1

                            # Save post views for ERID-marked posts
                            await _update_post_views(ch["id"], str(msg_id), msg_views)
        except Exception as e:
            log.warning(f"[AnalyticsCollector] MAX API error for channel {ch['id']}: {e}")

    elif platform == "telegram":
        # Telegram doesn't expose views via bot API easily
        # subscribers can be fetched via getChatMemberCount
        try:
            from ..config import settings
            import aiohttp
            token = settings.TELEGRAM_BOT_TOKEN
            tg_chat_id = ch.get("channel_id")
            if token and tg_chat_id:
                async with aiohttp.ClientSession() as session:
                    resp = await session.get(f"https://api.telegram.org/bot{token}/getChatMemberCount?chat_id={tg_chat_id}")
                    data = await resp.json()
                    if data.get("ok"):
                        subs = data.get("result", 0)
        except Exception as e:
            log.warning(f"[AnalyticsCollector] TG API error for channel {ch['id']}: {e}")

    # Count today's comments
    comments_count = 0
    try:
        comments = await fetch_one(
            "SELECT COUNT(*) as cnt FROM post_comments WHERE channel_id = $1 AND created_at::date = $2",
            ch["id"], today)
        comments_count = comments["cnt"] if comments else 0
    except Exception:
        pass

    # ER: average views / subscribers * 100
    er = 0
    if subs > 0 and posts_checked > 0:
        avg_views = views_total / posts_checked
        er = round(avg_views / subs * 100, 2)
    elif subs > 0 and comments_count > 0:
        er = round(comments_count / subs * 100, 4)

    await execute(
        """INSERT INTO channel_analytics (channel_id, snapshot_date, subscribers_count, views_count, posts_count, comments_count, engagement_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (channel_id, snapshot_date) DO UPDATE
           SET subscribers_count = GREATEST(channel_analytics.subscribers_count, $3),
               views_count = GREATEST(channel_analytics.views_count, $4),
               posts_count = GREATEST(channel_analytics.posts_count, $5),
               comments_count = GREATEST(channel_analytics.comments_count, $6),
               engagement_rate = GREATEST(channel_analytics.engagement_rate, $7)""",
        ch["id"], today, subs, views_total, posts_checked, comments_count, er)


async def _update_post_views(channel_id: int, message_id: str, views: int):
    """Update post_views table for ERID tracking."""
    if not message_id:
        return

    # Check if this message belongs to a tracked post
    for table, post_type in [("content_posts", "content"), ("pin_posts", "pin"), ("giveaways", "giveaway")]:
        try:
            post = await fetch_one(
                f"SELECT id FROM {table} WHERE channel_id = $1 AND telegram_message_id = $2",
                channel_id, message_id)
            if post:
                await execute(
                    """INSERT INTO post_views (channel_id, post_type, post_id, message_id, views_count, checked_at)
                       VALUES ($1, $2, $3, $4, $5, NOW())
                       ON CONFLICT (channel_id, post_type, post_id)
                       DO UPDATE SET views_count = GREATEST(post_views.views_count, $5), checked_at = NOW()""",
                    channel_id, post_type, post["id"], message_id, views)
                break
        except Exception:
            pass


def start_analytics_collector():
    global _task
    if _task is None:
        _task = asyncio.ensure_future(_collect())
        log.info("[AnalyticsCollector] Started (interval: 2h)")


def stop_analytics_collector():
    global _task
    if _task:
        _task.cancel()
        _task = None
