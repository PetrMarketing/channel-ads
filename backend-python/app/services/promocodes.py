"""Сервис применения промокодов к тарифу (раздел «Подписки»)."""
from datetime import datetime, timezone
from typing import Optional

from ..database import fetch_one, execute


async def resolve_promo(code: str) -> Optional[dict]:
    """Возвращает активный промокод или None если нет/невалидный.
    None означает «применять без промо», без поднятия исключения."""
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
    return dict(promo)


def calculate_discount(promo: dict, base_amount: float) -> float:
    """Возвращает размер скидки в рублях."""
    if not promo:
        return 0.0
    dtype = (promo.get("discount_type") or "percent").lower()
    dval = float(promo.get("discount_value") or 0)
    if dval <= 0:
        return 0.0
    if dtype == "percent":
        return round(min(base_amount, base_amount * dval / 100.0), 2)
    return round(min(base_amount, dval), 2)


async def consume_promo(promo_id: int) -> None:
    """Инкремент счётчика использований (вызывать после успешной оплаты)."""
    await execute(
        "UPDATE billing_promocodes SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1",
        promo_id,
    )
