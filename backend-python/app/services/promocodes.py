"""Сервис применения промокодов к тарифу (раздел «Подписки»)."""
from datetime import datetime, timezone
from typing import Optional

from ..database import fetch_one, execute


async def resolve_promo(code: str, months: Optional[int] = None) -> Optional[dict]:
    """Возвращает активный промокод или None если нет/невалидный/не для этого срока.
    Если применить нельзя из-за срока подписки — возвращает dict со флагом
    _wrong_months и applicable_months для UX-сообщения."""
    if not code or not code.strip():
        return None
    promo = await fetch_one(
        """SELECT * FROM billing_promocodes
           WHERE LOWER(code) = LOWER($1) AND is_active = TRUE""",
        code.strip(),
    )
    if not promo:
        return None
    # Срок действия
    if promo.get("valid_until"):
        valid_until = promo["valid_until"]
        if hasattr(valid_until, "tzinfo") and valid_until.tzinfo is None:
            valid_until = valid_until.replace(tzinfo=timezone.utc)
        if valid_until < datetime.now(timezone.utc):
            return None
    # Лимит использований
    max_uses = promo.get("max_uses")
    if max_uses is not None and int(promo.get("used_count") or 0) >= int(max_uses):
        return None
    # Привязка к сроку подписки. Если promo.applicable_months задан и текущий
    # срок не входит — возвращаем dict с _wrong_months для понятного ответа UI.
    applicable = promo.get("applicable_months")
    if applicable and months is not None and int(months) not in [int(x) for x in applicable]:
        result = dict(promo)
        result["_wrong_months"] = True
        return result
    return dict(promo)


def calculate_discount(promo: dict, base_amount: float, channels_count: int = 1) -> float:
    """Возвращает размер скидки в рублях.

    Для percent — % от base_amount (равно для любого количества каналов).
    Для fixed — нисходящая логика как у multi-channel discount:
      1-й канал — полная скидка X ₽
      2-й — X * 0.9
      3-й — X * 0.8
      ...
      10-й — X * 0.1 (минимум 10% от исходной)
    Итог: X * sum(max(0.1, 1 - i*0.1) for i in range(N))
    Не уходит ниже base_amount.
    """
    if not promo:
        return 0.0
    dtype = (promo.get("discount_type") or "percent").lower()
    dval = float(promo.get("discount_value") or 0)
    if dval <= 0:
        return 0.0
    if dtype == "percent":
        return round(min(base_amount, base_amount * dval / 100.0), 2)
    # fixed: нисходящая
    n = max(1, int(channels_count or 1))
    multiplier = sum(max(0.1, 1 - i * 0.1) for i in range(n))
    total_discount = dval * multiplier
    return round(min(base_amount, total_discount), 2)


async def consume_promo(promo_id: int) -> None:
    """Инкремент счётчика использований (вызывать после успешной оплаты)."""
    await execute(
        "UPDATE billing_promocodes SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1",
        promo_id,
    )
