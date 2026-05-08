"""Раз в сутки проверяет, не закончился ли сезон гонки каналов.
Если закончился (текущий ключ != ключ прошлой проверки):
  1. Берёт топ-1 канал прошлого сезона
  2. Начисляет владельцу +1000 ИИ-токенов
  3. Продлевает channel_billing на 60 дней
  4. Записывает в season_rewards (UNIQUE по season_key — двойной выдачи не будет)
"""
import asyncio
from datetime import datetime, timedelta

from ..database import fetch_one, fetch_all, execute, execute_returning_id
from .achievements import current_season_key, get_season_leaderboard, season_label


_task = None
_INTERVAL_SEC = 60 * 60 * 24  # раз в сутки

# Награды по местам: 1 → 1000 ИИт + 60 дней, 2 → 500 + 30, 3 → 250 + 15
PLACE_REWARDS = {
    1: {"tokens": 1000, "days": 60},
    2: {"tokens":  500, "days": 30},
    3: {"tokens":  250, "days": 15},
}


def _previous_season_key(current_key: str) -> str:
    """Из 'spring_2026' возвращает 'winter_2025'. Нужно потому что rotator
    пробуждается ПОСЛЕ начала нового сезона и должен наградить ПРОШЛЫЙ."""
    parts = current_key.split("_")
    if len(parts) != 2:
        return current_key
    season, year_s = parts[0], int(parts[1])
    order = ["winter", "spring", "summer", "autumn"]  # winter ← winter (Y-1) → spring Y → ...
    if season == "spring":
        return f"winter_{year_s - 1}"
    if season == "summer":
        return f"spring_{year_s}"
    if season == "autumn":
        return f"summer_{year_s}"
    if season == "winter":
        return f"autumn_{year_s}"
    return current_key


async def _award_one_place(prev_season_key: str, place: int, channel_id: int, user_id: int, points: int, title: str) -> bool:
    """Выдать награду одному месту (1/2/3). Идемпотентно по (season, place)."""
    cfg = PLACE_REWARDS.get(place)
    if not cfg:
        return False
    existing = await fetch_one(
        "SELECT id FROM season_rewards WHERE season_key = $1 AND place = $2",
        prev_season_key, place,
    )
    if existing:
        return False  # уже выдали

    tokens, days = cfg["tokens"], cfg["days"]

    # 1) +N токенов пользователю
    await execute(
        "UPDATE users SET ai_tokens = COALESCE(ai_tokens, 0) + $1 WHERE id = $2",
        tokens, user_id,
    )

    # 2) +M дней биллинга каналу
    billing = await fetch_one(
        "SELECT id, expires_at FROM channel_billing WHERE channel_id = $1",
        channel_id,
    )
    now = datetime.utcnow()
    if billing:
        base = billing.get("expires_at")
        if base and hasattr(base, "year"):
            try:
                anchor = base if base > now else now
            except TypeError:
                anchor = now
        else:
            anchor = now
        new_expires = anchor + timedelta(days=days)
        await execute(
            "UPDATE channel_billing SET plan = 'paid', expires_at = $1, status = 'active' WHERE id = $2",
            new_expires, billing["id"],
        )
    else:
        new_expires = now + timedelta(days=days)
        await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, status, max_users, billing_months, expires_at) "
            "VALUES ($1, 'paid', 'active', 1, 0, $2) RETURNING id",
            channel_id, new_expires,
        )

    # 3) Лог награды
    await execute(
        "INSERT INTO season_rewards (season_key, place, channel_id, user_id, points_earned, tokens_granted, days_granted) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (season_key, place) DO NOTHING",
        prev_season_key, place, channel_id, user_id, points, tokens, days,
    )
    medal = "🥇" if place == 1 else "🥈" if place == 2 else "🥉"
    print(f"[SeasonRotator] {medal} {place} место за {prev_season_key}: канал «{title}» (id={channel_id}), очков={points}, +{tokens} ИИт, +{days} дней")
    return True


async def _award_season_winner(prev_season_key: str) -> bool:
    """Если победители прошлого сезона ещё не награждены — наградить топ-3."""
    # Топ-3 прошлого сезона
    rows = await fetch_all(
        """SELECT c.id AS channel_id, c.user_id, c.title,
                  SUM(CASE a.tier
                      WHEN 'bronze'   THEN 1
                      WHEN 'silver'   THEN 3
                      WHEN 'gold'     THEN 5
                      WHEN 'platinum' THEN 10
                      ELSE 0 END)::int AS points
           FROM channel_achievements a
           JOIN channels c ON c.id = a.channel_id
           WHERE a.season_key = $1
           GROUP BY c.id, c.user_id, c.title
           ORDER BY points DESC
           LIMIT 3""",
        prev_season_key,
    )

    if not rows or not any(int(r.get("points") or 0) > 0 for r in rows):
        # Пустой сезон — фиксируем place=0, чтобы не повторять обработку
        await execute(
            "INSERT INTO season_rewards (season_key, place, channel_id, user_id, points_earned, tokens_granted, days_granted) "
            "VALUES ($1, 0, 0, 0, 0, 0, 0) ON CONFLICT (season_key, place) DO NOTHING",
            prev_season_key,
        )
        print(f"[SeasonRotator] {prev_season_key}: победителей нет, пустой сезон")
        return False

    awarded_any = False
    for i, r in enumerate(rows):
        place = i + 1  # 1, 2, 3
        if int(r.get("points") or 0) <= 0:
            continue  # без очков не награждаем
        ok = await _award_one_place(
            prev_season_key,
            place,
            int(r["channel_id"]),
            int(r["user_id"]),
            int(r["points"] or 0),
            r.get("title") or f"Канал #{r['channel_id']}",
        )
        awarded_any = awarded_any or ok
    return awarded_any


async def _runner():
    await asyncio.sleep(60)  # дать сервису устаканиться
    while True:
        try:
            cur_key = current_season_key()
            prev_key = _previous_season_key(cur_key)
            await _award_season_winner(prev_key)
        except Exception as e:
            print(f"[SeasonRotator] error: {e}")
        await asyncio.sleep(_INTERVAL_SEC)


def start_season_rotator():
    global _task
    _task = asyncio.create_task(_runner())
    print("[SeasonRotator] Started (check daily, top-3: 1000/500/250 ИИт + 60/30/15 дней)")


def stop_season_rotator():
    global _task
    if _task:
        _task.cancel()
        _task = None
