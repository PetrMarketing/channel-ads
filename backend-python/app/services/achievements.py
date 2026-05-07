"""Сезонные достижения канала.

Сезоны: spring (1 марта), summer (1 июня), autumn (1 сентября), winter (1 декабря).
Тиры: bronze (+1 очко), silver (+3), gold (+5), platinum (+10).

При вызове track_event(channel_id, code, n=1):
  - инкрементим counter в channel_achievement_progress
  - если count >= порога нового тира → INSERT в channel_achievements
    (UNIQUE гарантирует идемпотентность)
  - возвращаем список новых ачивок для модалки
"""
from datetime import date
from typing import Dict, List, Any, Optional

from ..database import fetch_one, fetch_all, execute, execute_returning_id


TIERS = ("bronze", "silver", "gold", "platinum")
TIER_POINTS: Dict[str, int] = {
    "bronze": 1,
    "silver": 3,
    "gold": 5,
    "platinum": 10,
}
TIER_LABELS: Dict[str, str] = {
    "bronze": "Бронза",
    "silver": "Серебро",
    "gold": "Золото",
    "platinum": "Платина",
}
TIER_COLORS: Dict[str, str] = {
    "bronze": "#cd7f32",
    "silver": "#c0c0c0",
    "gold": "#ffd700",
    "platinum": "#e5e4e2",
}

# Каждое достижение — словарь с порогами по 4 тирам в порядке bronze→platinum.
ACHIEVEMENTS: List[Dict[str, Any]] = [
    {"code": "ai_design",        "label": "ИИ Оформление",        "emoji": "🎨", "thresholds": [1, 5, 25, 100]},
    {"code": "link_create",      "label": "Создать ссылку",       "emoji": "🔗", "thresholds": [1, 5, 25, 100]},
    {"code": "link_landing",     "label": "ИИ Лендинг",           "emoji": "🌐", "thresholds": [1, 5, 25, 100]},
    {"code": "link_direct",      "label": "Прямая ссылка",        "emoji": "↗️", "thresholds": [1, 5, 25, 100]},
    {"code": "link_lead_magnet", "label": "Ссылка на лид-магнит", "emoji": "🎁", "thresholds": [1, 5, 25, 100]},
    {"code": "pin_create",       "label": "Создать закреп",       "emoji": "📌", "thresholds": [1, 5, 25, 100]},
    {"code": "lead_magnet",      "label": "Создать лид-магнит",   "emoji": "📥", "thresholds": [1, 5, 25, 100]},
    {"code": "broadcast_send",   "label": "Сделать рассылку",     "emoji": "📨", "thresholds": [1, 10, 100, 1000]},
    {"code": "funnel_step",      "label": "Шаги в воронке",       "emoji": "🔁", "thresholds": [1, 10, 100, 1000]},
    {"code": "post_publish",     "label": "Опубликовать постов",  "emoji": "📝", "thresholds": [10, 30, 300, 3000]},
    {"code": "ai_text",          "label": "Сгенерировать текстов","emoji": "✏️", "thresholds": [10, 50, 500, 5000]},
    {"code": "ai_image",         "label": "Сгенерировать картинок","emoji": "🖼", "thresholds": [10, 50, 500, 5000]},
    {"code": "ai_content_session","label": "ИИ Контент сессии",   "emoji": "🤖", "thresholds": [1, 10, 25, 100]},
    {"code": "giveaway_finish",  "label": "Розыгрыши завершить",  "emoji": "🎉", "thresholds": [1, 10, 25, 100]},
    {"code": "comment_reply",    "label": "Ответы на комментарии","emoji": "💬", "thresholds": [10, 100, 1000, 10000]},
]
_BY_CODE = {a["code"]: a for a in ACHIEVEMENTS}


def current_season_key(d: Optional[date] = None) -> str:
    """Возвращает 'spring_2026' / 'summer_2026' / 'autumn_2026' / 'winter_2025'.
    Зима охватывает декабрь Y, январь и февраль Y+1 — для зимы используем
    год декабря (т.е. зима 2025 = дек 2025 + янв/фев 2026)."""
    d = d or date.today()
    m = d.month
    y = d.year
    if m in (3, 4, 5):
        return f"spring_{y}"
    if m in (6, 7, 8):
        return f"summer_{y}"
    if m in (9, 10, 11):
        return f"autumn_{y}"
    # декабрь / январь / февраль = зима
    if m == 12:
        return f"winter_{y}"
    return f"winter_{y - 1}"


def season_label(key: str) -> str:
    parts = key.split("_")
    if len(parts) != 2:
        return key
    season_ru = {
        "spring": "Весна",
        "summer": "Лето",
        "autumn": "Осень",
        "winter": "Зима",
    }.get(parts[0], parts[0].capitalize())
    return f"{season_ru} {parts[1]}"


async def track_event(channel_id: int, code: str, n: int = 1) -> List[Dict[str, Any]]:
    """Инкремент счётчика и выдача новых ачивок. Возвращает список новых
    разблокированных тиров: [{"code": "ai_text", "tier": "silver", "label": ...}, ...]
    """
    if not channel_id or code not in _BY_CODE or n <= 0:
        return []
    cfg = _BY_CODE[code]
    season = current_season_key()

    # Атомарный upsert + получение нового count
    row = await fetch_one(
        """INSERT INTO channel_achievement_progress (channel_id, code, season_key, count)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (channel_id, code, season_key)
           DO UPDATE SET count = channel_achievement_progress.count + EXCLUDED.count,
                         updated_at = now()
           RETURNING count""",
        channel_id, code, season, n,
    )
    new_count = int(row["count"]) if row else n

    # Какие тиры теперь должны быть разблокированы?
    unlocked: List[Dict[str, Any]] = []
    thresholds = cfg["thresholds"]
    for i, tier in enumerate(TIERS):
        if i >= len(thresholds):
            break
        if new_count >= thresholds[i]:
            # INSERT IGNORE — UNIQUE предотвратит дубликат
            try:
                inserted_id = await execute_returning_id(
                    """INSERT INTO channel_achievements (channel_id, code, tier, season_key)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (channel_id, code, tier, season_key) DO NOTHING
                       RETURNING id""",
                    channel_id, code, tier, season,
                )
                if inserted_id:
                    unlocked.append({
                        "id": inserted_id,
                        "code": code,
                        "tier": tier,
                        "label": cfg["label"],
                        "emoji": cfg["emoji"],
                        "season_key": season,
                        "season_label": season_label(season),
                        "points": TIER_POINTS[tier],
                    })
            except Exception as e:
                print(f"[Achievements] insert failed code={code} tier={tier}: {e}")
    return unlocked


async def get_summary(channel_id: int) -> Dict[str, Any]:
    """Полный снимок для UI: текущий сезон, прогресс по каждому событию,
    разблокированные тиры в текущем сезоне, история по прошлым сезонам."""
    season = current_season_key()
    progress_rows = await fetch_all(
        "SELECT code, count FROM channel_achievement_progress WHERE channel_id = $1 AND season_key = $2",
        channel_id, season,
    )
    progress_by_code = {r["code"]: int(r["count"]) for r in progress_rows}

    unlocked_rows = await fetch_all(
        "SELECT code, tier, season_key FROM channel_achievements WHERE channel_id = $1",
        channel_id,
    )
    # current season unlocks per code
    current_unlocked: Dict[str, set] = {}
    history_unlocked: Dict[str, List[Dict[str, str]]] = {}
    for r in unlocked_rows:
        if r["season_key"] == season:
            current_unlocked.setdefault(r["code"], set()).add(r["tier"])
        else:
            history_unlocked.setdefault(r["code"], []).append({
                "tier": r["tier"],
                "season_key": r["season_key"],
                "season_label": season_label(r["season_key"]),
            })

    items = []
    total_points = 0
    for cfg in ACHIEVEMENTS:
        code = cfg["code"]
        count = progress_by_code.get(code, 0)
        unlocked = current_unlocked.get(code, set())
        # Найти следующий тир
        next_tier = None
        next_threshold = None
        for i, tier in enumerate(TIERS):
            if tier not in unlocked:
                next_tier = tier
                next_threshold = cfg["thresholds"][i]
                break
        for tier in unlocked:
            total_points += TIER_POINTS[tier]
        items.append({
            "code": code,
            "label": cfg["label"],
            "emoji": cfg["emoji"],
            "thresholds": cfg["thresholds"],
            "count": count,
            "unlocked_tiers": sorted(unlocked, key=lambda t: TIERS.index(t)),
            "next_tier": next_tier,
            "next_threshold": next_threshold,
            "history": history_unlocked.get(code, []),
        })
    return {
        "season_key": season,
        "season_label": season_label(season),
        "total_points": total_points,
        "items": items,
        "tier_points": TIER_POINTS,
        "tier_labels": TIER_LABELS,
        "tier_colors": TIER_COLORS,
    }


async def fetch_pending_notifications(user_id: int) -> List[Dict[str, Any]]:
    """Новые (не показанные) ачивки по каналам пользователя — для модалки."""
    rows = await fetch_all(
        """SELECT a.id, a.code, a.tier, a.season_key, a.channel_id, c.title as channel_title
           FROM channel_achievements a
           JOIN channels c ON c.id = a.channel_id
           WHERE c.user_id = $1 AND a.notified_at IS NULL
           ORDER BY a.unlocked_at DESC
           LIMIT 5""",
        user_id,
    )
    out = []
    for r in rows:
        cfg = _BY_CODE.get(r["code"]) or {}
        out.append({
            "id": r["id"],
            "code": r["code"],
            "tier": r["tier"],
            "label": cfg.get("label", r["code"]),
            "emoji": cfg.get("emoji", "🏅"),
            "channel_id": r["channel_id"],
            "channel_title": r["channel_title"],
            "season_key": r["season_key"],
            "season_label": season_label(r["season_key"]),
            "points": TIER_POINTS[r["tier"]],
            "color": TIER_COLORS[r["tier"]],
            "tier_label": TIER_LABELS[r["tier"]],
        })
    return out


async def get_season_leaderboard(channel_id: Optional[int] = None, limit: int = 10) -> Dict[str, Any]:
    """Топ каналов сезона по сумме очков от ачивок + место выбранного канала
    (если он не входит в топ)."""
    season = current_season_key()
    # Сумма очков по каналу. Используем CASE WHEN для перевода tier→points.
    rows = await fetch_all(
        """SELECT c.id AS channel_id, c.title, c.avatar_url,
                  SUM(CASE a.tier
                      WHEN 'bronze' THEN 1
                      WHEN 'silver' THEN 3
                      WHEN 'gold' THEN 5
                      WHEN 'platinum' THEN 10
                      ELSE 0
                  END)::int AS points,
                  COUNT(*)::int AS achievements_count
           FROM channel_achievements a
           JOIN channels c ON c.id = a.channel_id
           WHERE a.season_key = $1
           GROUP BY c.id, c.title, c.avatar_url
           ORDER BY points DESC, achievements_count DESC, c.id ASC""",
        season,
    )
    leaderboard = []
    selected_position = None
    selected_entry = None
    for i, r in enumerate(rows):
        pos = i + 1
        entry = {
            "position": pos,
            "channel_id": r["channel_id"],
            "title": r["title"] or f"Канал #{r['channel_id']}",
            "avatar_url": r.get("avatar_url"),
            "points": int(r["points"] or 0),
            "achievements_count": int(r["achievements_count"] or 0),
            "is_selected": channel_id is not None and r["channel_id"] == channel_id,
        }
        if entry["is_selected"]:
            selected_position = pos
            selected_entry = entry
        if pos <= limit:
            leaderboard.append(entry)
    if channel_id and selected_position is None:
        # Канал есть, но без очков — добавим в конец как "out of top"
        ch_row = await fetch_one(
            "SELECT id, title, avatar_url FROM channels WHERE id = $1",
            channel_id,
        )
        if ch_row:
            selected_entry = {
                "position": None,
                "channel_id": ch_row["id"],
                "title": ch_row["title"] or f"Канал #{ch_row['id']}",
                "avatar_url": ch_row.get("avatar_url"),
                "points": 0,
                "achievements_count": 0,
                "is_selected": True,
            }
    return {
        "season_key": season,
        "season_label": season_label(season),
        "top": leaderboard,
        "total_channels": len(rows),
        "selected_position": selected_position,
        "selected": selected_entry,
    }


async def mark_notification_seen(user_id: int, achievement_id: int) -> bool:
    """Помечаем что пользователь увидел модалку (notified_at = now())."""
    res = await execute(
        """UPDATE channel_achievements a
           SET notified_at = now()
           FROM channels c
           WHERE a.id = $1 AND c.id = a.channel_id AND c.user_id = $2 AND a.notified_at IS NULL""",
        achievement_id, user_id,
    )
    return True
