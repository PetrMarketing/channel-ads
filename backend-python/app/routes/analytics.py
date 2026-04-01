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

    # Subscriber history for the week
    week_data = await fetch_all(
        "SELECT snapshot_date, subscribers_count, views_count, posts_count, comments_count, engagement_rate FROM channel_analytics WHERE channel_id = $1 AND snapshot_date >= $2 ORDER BY snapshot_date",
        ch["id"], week_ago)

    # Growth
    growth = 0
    if len(week_data) >= 2:
        growth = (week_data[-1]["subscribers_count"] or 0) - (week_data[0]["subscribers_count"] or 0)

    # Today's comments
    today_comments = 0
    try:
        row = await fetch_one(
            "SELECT COUNT(*) as cnt FROM post_comments WHERE channel_id = $1 AND created_at::date = $2",
            ch["id"], today)
        today_comments = row["cnt"] if row else 0
    except Exception:
        pass

    # Recent posts with views (for top posts)
    top_posts = []
    try:
        posts = await fetch_all(
            """SELECT pv.post_type, pv.post_id, pv.views_count, pv.message_id,
                      COALESCE(cp.title, pp.title, g.title) as title,
                      COALESCE(cp.erid, pp.erid, g.erid) as erid
               FROM post_views pv
               LEFT JOIN content_posts cp ON pv.post_type = 'content' AND cp.id = pv.post_id
               LEFT JOIN pin_posts pp ON pv.post_type = 'pin' AND pp.id = pv.post_id
               LEFT JOIN giveaways g ON pv.post_type = 'giveaway' AND g.id = pv.post_id
               WHERE pv.channel_id = $1
               ORDER BY pv.views_count DESC LIMIT 10""",
            ch["id"])
        top_posts = [dict(p) for p in posts]
    except Exception:
        pass

    subs = latest["subscribers_count"] if latest else 0
    views = latest.get("views_count", 0) if latest else 0
    posts_count = latest.get("posts_count", 0) if latest else 0
    er = float(latest["engagement_rate"]) if latest and latest.get("engagement_rate") else 0

    return {
        "success": True,
        "subscribers": subs,
        "subscribers_growth": growth,
        "views_total": views,
        "posts_count": posts_count,
        "engagement_rate": er,
        "comments_today": today_comments,
        "top_posts": top_posts,
        "history": [
            {
                "date": str(d["snapshot_date"]),
                "subscribers": d["subscribers_count"] or 0,
                "views": d.get("views_count", 0) or 0,
                "comments": d.get("comments_count", 0) or 0,
                "er": float(d.get("engagement_rate", 0) or 0),
            }
            for d in week_data
        ],
    }
