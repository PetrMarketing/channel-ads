"""Analytics: channel stats snapshots and graphs."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all

router = APIRouter()


async def _get_channel(tc, uid):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


@router.get("/{tc}")
async def get_analytics(tc: str, days: int = Query(30), user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        return {"success": False, "error": "Канал не найден"}
    since = (datetime.utcnow() - timedelta(days=days)).date()
    rows = await fetch_all(
        "SELECT * FROM channel_analytics WHERE channel_id = $1 AND snapshot_date >= $2 ORDER BY snapshot_date",
        ch["id"], since)
    # Strip any binary fields just in case
    data = []
    for r in rows:
        d = dict(r)
        d["snapshot_date"] = str(d["snapshot_date"])
        d.pop("created_at", None)
        data.append(d)
    return {"success": True, "analytics": data}


@router.get("/{tc}/summary")
async def get_summary(tc: str, user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        return {"success": False, "error": "Канал не найден"}
    latest = await fetch_one(
        "SELECT * FROM channel_analytics WHERE channel_id = $1 ORDER BY snapshot_date DESC LIMIT 1",
        ch["id"])
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)
    week_data = await fetch_all(
        "SELECT snapshot_date, subscribers_count FROM channel_analytics WHERE channel_id = $1 AND snapshot_date >= $2 ORDER BY snapshot_date",
        ch["id"], week_ago)
    # Subscriber growth
    growth = 0
    if len(week_data) >= 2:
        growth = (week_data[-1]["subscribers_count"] or 0) - (week_data[0]["subscribers_count"] or 0)
    # Today's comments
    today_comments = await fetch_one(
        "SELECT COUNT(*) as cnt FROM post_comments WHERE channel_id = $1 AND created_at::date = $2",
        ch["id"], today)
    return {
        "success": True,
        "subscribers": latest["subscribers_count"] if latest else 0,
        "subscribers_growth": growth,
        "engagement_rate": float(latest["engagement_rate"]) if latest else 0,
        "avg_views": float(latest["avg_views_per_post"]) if latest else 0,
        "views_24h": latest["views_24h"] if latest else 0,
        "views_48h": latest["views_48h"] if latest else 0,
        "views_72h": latest["views_72h"] if latest else 0,
        "reactions_today": latest["reactions_count"] if latest else 0,
        "comments_today": today_comments["cnt"] if today_comments else 0,
    }
