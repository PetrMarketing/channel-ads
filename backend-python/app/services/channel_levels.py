"""Прогресс канала по навыкам ИИ — уровни, цены, левел-ап.

Уровень привязан к каналу. На каждом уровне счётчик period_count сбрасывается;
total_count — нарастающий итог за всё время. Формула цены за операцию и цены
тарифа берётся по текущему уровню.

Уровни:
  landing: 1→2:1шт, 2→3:5, 3→4:10, 4→5:20  (цены: 500/400/350/300/200)
  text:    1→2:100, 2→3:150, 3→4:250, 4→5:500 (10/9/8/7/5)
  image:   1→2:100, 2→3:150, 3→4:250, 4→5:500 (10/9/8/7/5)

Уровень канала (общий) = min(landing_level, text_level, image_level).
Цена тарифа: 1→490, 2→450, 3→425, 4→400, 5→375.
"""
from typing import Dict, List, Any, Optional

from ..database import fetch_one, fetch_all, execute


SKILLS = ("landing", "text", "image")

# Пороги: сколько успешных операций нужно чтобы перейти С текущего уровня
# на следующий. Индекс = current_level - 1. None означает «дальше уровней нет».
SKILL_THRESHOLDS: Dict[str, List[Optional[int]]] = {
    "landing": [1, 5, 10, 20, None],
    "text":    [100, 150, 250, 500, None],
    "image":   [100, 150, 250, 500, None],
}

# Цена в ИИ-токенах за 1 операцию на каждом уровне (1..5).
SKILL_COSTS: Dict[str, List[int]] = {
    "landing": [500, 400, 350, 300, 200],
    "text":    [10, 9, 8, 7, 5],
    "image":   [10, 9, 8, 7, 5],
}

# Цена тарифа канала в рублях/мес по уровню.
SUBSCRIPTION_PRICES: Dict[int, int] = {
    1: 490,
    2: 450,
    3: 425,
    4: 400,
    5: 375,
}

SKILL_LABELS: Dict[str, str] = {
    "landing": "ИИ Лендинг",
    "text":    "ИИ Тексты",
    "image":   "ИИ Картинки",
}

SKILL_UNITS: Dict[str, str] = {
    "landing": "лендинг",
    "text":    "текст",
    "image":   "картинка",
}


def _threshold(skill: str, level: int) -> Optional[int]:
    """Сколько нужно сделать ещё с уровня `level`, чтобы достичь level+1.
    None — если дальше нет уровней."""
    arr = SKILL_THRESHOLDS.get(skill, [])
    idx = level - 1
    if idx < 0 or idx >= len(arr):
        return None
    return arr[idx]


def _cost(skill: str, level: int) -> int:
    arr = SKILL_COSTS.get(skill, [])
    idx = max(0, min(len(arr) - 1, level - 1))
    return arr[idx]


async def _get_or_create_row(channel_id: int, skill: str) -> Dict[str, Any]:
    row = await fetch_one(
        "SELECT * FROM channel_skill_progress WHERE channel_id = $1 AND skill_type = $2",
        channel_id, skill,
    )
    if row:
        return dict(row)
    await execute(
        "INSERT INTO channel_skill_progress (channel_id, skill_type) VALUES ($1, $2) "
        "ON CONFLICT (channel_id, skill_type) DO NOTHING",
        channel_id, skill,
    )
    row = await fetch_one(
        "SELECT * FROM channel_skill_progress WHERE channel_id = $1 AND skill_type = $2",
        channel_id, skill,
    )
    return dict(row) if row else {
        "channel_id": channel_id, "skill_type": skill,
        "current_level": 1, "period_count": 0, "total_count": 0,
    }


async def track_skill(channel_id: int, skill: str, n: int = 1) -> Dict[str, Any]:
    """Учесть `n` успешных операций по навыку. Каскадно делаем левел-апы,
    если за один батч пересекли несколько порогов. Возвращает строку прогресса
    после изменений."""
    if not channel_id or skill not in SKILLS or n <= 0:
        return {}
    row = await _get_or_create_row(channel_id, skill)
    level = int(row.get("current_level") or 1)
    period = int(row.get("period_count") or 0) + n
    total = int(row.get("total_count") or 0) + n
    leveled_up = False
    while True:
        thr = _threshold(skill, level)
        if thr is None or period < thr:
            break
        period -= thr
        level += 1
        leveled_up = True
    if leveled_up:
        await execute(
            "UPDATE channel_skill_progress SET current_level = $1, period_count = $2, "
            "total_count = $3, last_level_up_at = now(), updated_at = now() "
            "WHERE channel_id = $4 AND skill_type = $5",
            level, period, total, channel_id, skill,
        )
    else:
        await execute(
            "UPDATE channel_skill_progress SET period_count = $1, total_count = $2, "
            "updated_at = now() WHERE channel_id = $3 AND skill_type = $4",
            period, total, channel_id, skill,
        )
    return {
        "skill": skill, "level": level, "period_count": period,
        "total_count": total, "leveled_up": leveled_up,
    }


async def skill_cost(channel_id: int, skill: str) -> int:
    """Текущая цена операции в ИИ-токенах для канала."""
    if not channel_id or skill not in SKILLS:
        return _cost(skill, 1)
    row = await fetch_one(
        "SELECT current_level FROM channel_skill_progress WHERE channel_id = $1 AND skill_type = $2",
        channel_id, skill,
    )
    level = int(row["current_level"]) if row else 1
    return _cost(skill, level)


async def channel_overall_level(channel_id: int) -> int:
    """Общий уровень канала = минимум по всем 3 навыкам."""
    if not channel_id:
        return 1
    rows = await fetch_all(
        "SELECT skill_type, current_level FROM channel_skill_progress WHERE channel_id = $1",
        channel_id,
    )
    levels = {r["skill_type"]: int(r["current_level"]) for r in rows}
    return min(levels.get(s, 1) for s in SKILLS)


async def subscription_price(channel_id: int) -> int:
    lvl = await channel_overall_level(channel_id)
    return SUBSCRIPTION_PRICES.get(lvl, SUBSCRIPTION_PRICES[1])


async def get_levels_summary(channel_id: int) -> Dict[str, Any]:
    """Полный снимок прогресса для UI."""
    rows = await fetch_all(
        "SELECT skill_type, current_level, period_count, total_count, last_level_up_at "
        "FROM channel_skill_progress WHERE channel_id = $1",
        channel_id,
    )
    by_skill = {r["skill_type"]: dict(r) for r in rows}
    skills_data = []
    for s in SKILLS:
        row = by_skill.get(s) or {}
        level = int(row.get("current_level") or 1)
        period = int(row.get("period_count") or 0)
        total = int(row.get("total_count") or 0)
        thr = _threshold(s, level)
        cur_cost = _cost(s, level)
        next_cost = _cost(s, level + 1) if level < 5 else None
        skills_data.append({
            "skill": s,
            "label": SKILL_LABELS[s],
            "unit": SKILL_UNITS[s],
            "level": level,
            "period_count": period,
            "total_count": total,
            "next_threshold": thr,
            "current_cost": cur_cost,
            "next_cost": next_cost,
            "is_max": level >= 5,
        })
    overall = min(s["level"] for s in skills_data) if skills_data else 1
    next_price = SUBSCRIPTION_PRICES.get(overall + 1) if overall < 5 else None
    return {
        "channel_id": channel_id,
        "overall_level": overall,
        "subscription_price": SUBSCRIPTION_PRICES.get(overall, SUBSCRIPTION_PRICES[1]),
        "subscription_price_next": next_price,
        "subscription_price_default": SUBSCRIPTION_PRICES[1],
        "skills": skills_data,
    }
