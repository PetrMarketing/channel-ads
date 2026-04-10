"""
REST API метрик для внешней админки.
Авторизация: заголовок X-API-Key, проверяется по METRICS_API_KEY из env.
Все запросы — read-only SELECT с параметризованными аргументами.
"""

from datetime import datetime, timedelta, date
from typing import Dict, Any, Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Header, Query

from ..config import settings
from ..database import fetch_one, fetch_all

router = APIRouter()


# ---------------------------------------------------------------------------
# Авторизация по API-ключу в заголовке X-API-Key
# ---------------------------------------------------------------------------

async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    """Проверяет API-ключ из заголовка, сравнивая с METRICS_API_KEY."""
    if not settings.METRICS_API_KEY:
        raise HTTPException(status_code=503, detail="Metrics API not configured")
    if x_api_key != settings.METRICS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# ---------------------------------------------------------------------------
# Общие хелперы для фильтрации
# ---------------------------------------------------------------------------

def _parse_dates(
    date_from: Optional[str],
    date_to: Optional[str],
    days: int,
) -> Tuple[datetime, datetime]:
    """
    Определяет диапазон дат для фильтрации.
    Приоритет: date_from/date_to > days.
    Возвращает (start, end) как datetime.
    """
    end = datetime.utcnow()
    start = end - timedelta(days=days)

    if date_from:
        try:
            start = datetime.fromisoformat(date_from)
        except ValueError:
            raise HTTPException(400, "date_from: ожидается формат YYYY-MM-DD")
    if date_to:
        try:
            # Конец дня включительно
            end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)
        except ValueError:
            raise HTTPException(400, "date_to: ожидается формат YYYY-MM-DD")

    return start, end


def _build_where(
    base_conditions: List[str],
    date_column: str,
    start: datetime,
    end: datetime,
    channel_id: Optional[int],
    platform: Optional[str],
    param_offset: int = 0,
) -> Tuple[str, list]:
    """
    Собирает WHERE-клаузу с фильтрами по дате, каналу, платформе.
    param_offset — смещение нумерации $-параметров (если уже есть другие).
    Возвращает (where_string, params_list).
    """
    conditions = list(base_conditions)
    params: list = []
    idx = param_offset

    # Фильтр по дате
    idx += 1
    conditions.append(f"{date_column} >= ${idx}")
    params.append(start)
    idx += 1
    conditions.append(f"{date_column} <= ${idx}")
    params.append(end)

    # Фильтр по каналу
    if channel_id is not None:
        idx += 1
        conditions.append(f"channel_id = ${idx}")
        params.append(channel_id)

    # Фильтр по платформе
    if platform:
        idx += 1
        conditions.append(f"platform = ${idx}")
        params.append(platform)

    where = " AND ".join(conditions) if conditions else "TRUE"
    return where, params


def _dt(val) -> Optional[str]:
    """Безопасно конвертирует datetime/date в ISO-строку."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return str(val)


# ---------------------------------------------------------------------------
# Общие параметры фильтрации для всех эндпоинтов
# ---------------------------------------------------------------------------
# days        — кол-во дней назад (по умолчанию 30)
# date_from   — начало периода (YYYY-MM-DD), приоритетнее days
# date_to     — конец периода (YYYY-MM-DD), приоритетнее days
# channel_id  — фильтр по конкретному каналу
# platform    — фильтр по платформе (telegram / max)
# ---------------------------------------------------------------------------


# ===========================================================================
# 1. Overview — ключевые счётчики по всей системе
# ===========================================================================

@router.get("/overview", dependencies=[Depends(verify_api_key)])
async def overview(
    channel_id: Optional[int] = Query(None, description="Фильтр по ID канала"),
    platform: Optional[str] = Query(None, description="Фильтр по платформе: telegram / max"),
):
    """Общая сводка: пользователи, каналы, подписки, лиды, выручка."""

    # Фильтры для таблиц, где есть channel_id / platform
    ch_where_parts: List[str] = []
    ch_params: list = []
    idx = 0

    if channel_id is not None:
        idx += 1
        ch_where_parts.append(f"channel_id = ${idx}")
        ch_params.append(channel_id)
    if platform:
        idx += 1
        ch_where_parts.append(f"platform = ${idx}")
        ch_params.append(platform)

    ch_where = " AND ".join(ch_where_parts) if ch_where_parts else "TRUE"

    # Каналы (platform — собственное поле)
    chan_parts: List[str] = []
    chan_params: list = []
    ci = 0
    if channel_id is not None:
        ci += 1
        chan_parts.append(f"id = ${ci}")
        chan_params.append(channel_id)
    if platform:
        ci += 1
        chan_parts.append(f"platform = ${ci}")
        chan_params.append(platform)
    chan_where = " AND ".join(chan_parts) if chan_parts else "TRUE"

    # Пользователи — не фильтруются по channel/platform
    users = await fetch_one("SELECT COUNT(*) as c FROM users")
    channels = await fetch_one(f"SELECT COUNT(*) as c FROM channels WHERE {chan_where}", *chan_params)
    active_ch = await fetch_one(f"SELECT COUNT(*) as c FROM channels WHERE is_active = 1 AND {chan_where}", *chan_params)
    subs = await fetch_one(f"SELECT COUNT(*) as c FROM subscriptions WHERE {ch_where}", *ch_params)
    # leads не имеет channel_id — джойним через lead_magnets
    if channel_id is not None:
        leads = await fetch_one(
            "SELECT COUNT(*) as c FROM leads l JOIN lead_magnets lm ON lm.id = l.lead_magnet_id WHERE lm.channel_id = $1",
            channel_id,
        )
    else:
        leads = await fetch_one("SELECT COUNT(*) as c FROM leads")
    orders = await fetch_one(f"SELECT COUNT(*) as c FROM orders WHERE {ch_where}", *ch_params)
    clients = await fetch_one(f"SELECT COUNT(*) as c FROM clients WHERE {ch_where}", *ch_params)

    # Активные биллинги
    bill_parts = ["status = 'active'", "expires_at > NOW()"]
    bill_params: list = []
    bi = 0
    if channel_id is not None:
        bi += 1
        bill_parts.append(f"channel_id = ${bi}")
        bill_params.append(channel_id)
    bill_where = " AND ".join(bill_parts)
    active_bill = await fetch_one(f"SELECT COUNT(*) as c FROM channel_billing WHERE {bill_where}", *bill_params)

    # Выручка биллинг
    rev_parts = ["status = 'paid'"]
    rev_params: list = []
    ri = 0
    if channel_id is not None:
        ri += 1
        rev_parts.append(f"channel_id = ${ri}")
        rev_params.append(channel_id)
    rev_where = " AND ".join(rev_parts)
    rev = await fetch_one(f"SELECT COALESCE(SUM(amount), 0) as total FROM billing_payments WHERE {rev_where}", *rev_params)

    # Выручка заказы
    orev = await fetch_one(f"SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE payment_status = 'paid' AND {ch_where}", *ch_params)

    return {
        "users": users["c"] if users else 0,
        "channels": channels["c"] if channels else 0,
        "active_channels": active_ch["c"] if active_ch else 0,
        "subscriptions": subs["c"] if subs else 0,
        "leads": leads["c"] if leads else 0,
        "active_billings": active_bill["c"] if active_bill else 0,
        "orders": orders["c"] if orders else 0,
        "clients": clients["c"] if clients else 0,
        "total_revenue": float(rev["total"]) if rev else 0,
        "total_orders_revenue": float(orev["total"]) if orev else 0,
    }


# ===========================================================================
# 2. Users — динамика регистраций, даты, источники
# ===========================================================================

@router.get("/users", dependencies=[Depends(verify_api_key)])
async def users_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Конец периода YYYY-MM-DD"),
    platform: Optional[str] = Query(None, description="Фильтр по платформе"),
):
    """Регистрации пользователей по дням, источникам. Список новых юзеров с датами."""
    start, end = _parse_dates(date_from, date_to, days)

    total = await fetch_one("SELECT COUNT(*) as c FROM users")
    new = await fetch_one(
        "SELECT COUNT(*) as c FROM users WHERE created_at >= $1 AND created_at <= $2",
        start, end,
    )

    # Регистрации по дням
    by_day = await fetch_all(
        """SELECT created_at::date as day, COUNT(*) as count
           FROM users WHERE created_at >= $1 AND created_at <= $2
           GROUP BY day ORDER BY day""",
        start, end,
    )

    # По источникам
    by_source = await fetch_all(
        """SELECT COALESCE(source_landing, 'direct') as source, COUNT(*) as count
           FROM users WHERE created_at >= $1 AND created_at <= $2
           GROUP BY source ORDER BY count DESC LIMIT 20""",
        start, end,
    )

    # Последние зарегистрированные пользователи с датами
    recent_users = await fetch_all(
        """SELECT id, telegram_id, max_user_id, username, first_name,
                  email, source_landing, created_at
           FROM users WHERE created_at >= $1 AND created_at <= $2
           ORDER BY created_at DESC LIMIT 50""",
        start, end,
    )

    return {
        "total": total["c"] if total else 0,
        "new": new["c"] if new else 0,
        "period": {"from": _dt(start), "to": _dt(end)},
        "by_day": [{"date": str(r["day"]), "count": r["count"]} for r in by_day],
        "by_source": [{"source": r["source"], "count": r["count"]} for r in by_source],
        "recent_users": [
            {
                "id": r["id"],
                "telegram_id": r["telegram_id"],
                "max_user_id": r["max_user_id"],
                "username": r["username"],
                "first_name": r["first_name"],
                "email": r["email"],
                "source": r["source_landing"],
                "created_at": _dt(r["created_at"]),
            }
            for r in recent_users
        ],
    }


# ===========================================================================
# 3. Channels — тарифы, платформы, рост
# ===========================================================================

@router.get("/channels", dependencies=[Depends(verify_api_key)])
async def channels_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    platform: Optional[str] = Query(None, description="telegram / max"),
):
    """Каналы: распределение по тарифам, платформам, динамика создания."""
    start, end = _parse_dates(date_from, date_to, days)

    # Базовый фильтр платформы
    plat_cond = ""
    plat_params: list = []
    if platform:
        plat_cond = "AND COALESCE(platform, 'telegram') = $3"
        plat_params = [platform]

    total = await fetch_one(
        f"SELECT COUNT(*) as c FROM channels WHERE TRUE {plat_cond.replace('$3','$1') if platform else ''}",
        *([platform] if platform else []),
    )
    new = await fetch_one(
        f"""SELECT COUNT(*) as c FROM channels
            WHERE created_at >= $1 AND created_at <= $2
            {'AND COALESCE(platform, $$telegram$$) = $3' if platform else ''}""",
        start, end, *([platform] if platform else []),
    )

    # По тарифам
    by_plan = await fetch_all(
        """SELECT COALESCE(cb.plan, 'free') as plan, cb.status, COUNT(*) as count
           FROM channels c
           LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           GROUP BY plan, cb.status ORDER BY count DESC"""
    )

    # По дням
    by_day = await fetch_all(
        f"""SELECT created_at::date as day, COUNT(*) as count
            FROM channels
            WHERE created_at >= $1 AND created_at <= $2
            {'AND COALESCE(platform, $$telegram$$) = $3' if platform else ''}
            GROUP BY day ORDER BY day""",
        start, end, *([platform] if platform else []),
    )

    # По платформам
    by_platform = await fetch_all(
        """SELECT COALESCE(platform, 'telegram') as platform, COUNT(*) as count
           FROM channels GROUP BY platform ORDER BY count DESC"""
    )

    # Список каналов за период с датами и биллингом
    recent_channels = await fetch_all(
        f"""SELECT c.id, c.title, c.username, COALESCE(c.platform, 'telegram') as platform,
                   c.is_active, c.created_at,
                   cb.plan, cb.status as billing_status, cb.expires_at, cb.started_at
            FROM channels c
            LEFT JOIN channel_billing cb ON cb.channel_id = c.id
            WHERE c.created_at >= $1 AND c.created_at <= $2
            {'AND COALESCE(c.platform, $$telegram$$) = $3' if platform else ''}
            ORDER BY c.created_at DESC LIMIT 50""",
        start, end, *([platform] if platform else []),
    )

    return {
        "total": total["c"] if total else 0,
        "new": new["c"] if new else 0,
        "period": {"from": _dt(start), "to": _dt(end)},
        "by_plan": [{"plan": r["plan"], "status": r["status"], "count": r["count"]} for r in by_plan],
        "by_day": [{"date": str(r["day"]), "count": r["count"]} for r in by_day],
        "by_platform": [{"platform": r["platform"], "count": r["count"]} for r in by_platform],
        "recent_channels": [
            {
                "id": r["id"], "title": r["title"], "username": r["username"],
                "platform": r["platform"], "is_active": r["is_active"],
                "created_at": _dt(r["created_at"]),
                "plan": r["plan"], "billing_status": r["billing_status"],
                "billing_started_at": _dt(r["started_at"]),
                "billing_expires_at": _dt(r["expires_at"]),
            }
            for r in recent_channels
        ],
    }


# ===========================================================================
# 4. Revenue — выручка биллинг + заказы
# ===========================================================================

@router.get("/revenue", dependencies=[Depends(verify_api_key)])
async def revenue_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None, description="Фильтр по каналу"),
):
    """Выручка по дням: биллинг-платежи и заказы. С фильтрацией по каналу и датам."""
    start, end = _parse_dates(date_from, date_to, days)

    # --- Биллинг ---
    bp_cond = "status = 'paid' AND created_at >= $1 AND created_at <= $2"
    bp_params: list = [start, end]
    if channel_id is not None:
        bp_cond += " AND channel_id = $3"
        bp_params.append(channel_id)

    billing_by_day = await fetch_all(
        f"""SELECT created_at::date as day,
                   COALESCE(SUM(amount), 0) as amount,
                   COUNT(*) as count
            FROM billing_payments WHERE {bp_cond}
            GROUP BY day ORDER BY day""",
        *bp_params,
    )
    billing_total = await fetch_one(
        f"SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM billing_payments WHERE {bp_cond}",
        *bp_params,
    )

    # Список платежей с датами
    billing_list = await fetch_all(
        f"""SELECT bp.id, bp.amount, bp.currency, bp.status, bp.created_at,
                   bp.channel_id, c.title as channel_title
            FROM billing_payments bp
            LEFT JOIN channels c ON c.id = bp.channel_id
            WHERE bp.status = 'paid' AND bp.created_at >= $1 AND bp.created_at <= $2
            {'AND bp.channel_id = $3' if channel_id else ''}
            ORDER BY bp.created_at DESC LIMIT 50""",
        *bp_params,
    )

    # --- Заказы ---
    o_cond = "payment_status = 'paid' AND created_at >= $1 AND created_at <= $2"
    o_params: list = [start, end]
    if channel_id is not None:
        o_cond += " AND channel_id = $3"
        o_params.append(channel_id)

    orders_by_day = await fetch_all(
        f"""SELECT created_at::date as day,
                   COALESCE(SUM(total), 0) as amount,
                   COUNT(*) as count
            FROM orders WHERE {o_cond}
            GROUP BY day ORDER BY day""",
        *o_params,
    )
    orders_total = await fetch_one(
        f"SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM orders WHERE {o_cond}",
        *o_params,
    )

    b_total = float(billing_total["total"]) if billing_total else 0
    b_count = billing_total["count"] if billing_total else 0
    o_total = float(orders_total["total"]) if orders_total else 0
    o_count = orders_total["count"] if orders_total else 0

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "billing": {
            "total": b_total,
            "count": b_count,
            "avg_check": round(b_total / b_count, 2) if b_count else 0,
            "by_day": [{"date": str(r["day"]), "amount": float(r["amount"]), "count": r["count"]} for r in billing_by_day],
            "payments": [
                {
                    "id": r["id"], "amount": float(r["amount"]), "currency": r["currency"],
                    "channel_id": r["channel_id"], "channel_title": r["channel_title"],
                    "created_at": _dt(r["created_at"]),
                }
                for r in billing_list
            ],
        },
        "orders": {
            "total": o_total,
            "count": o_count,
            "avg_check": round(o_total / o_count, 2) if o_count else 0,
            "by_day": [{"date": str(r["day"]), "amount": float(r["amount"]), "count": r["count"]} for r in orders_by_day],
        },
        "combined_total": b_total + o_total,
    }


# ===========================================================================
# 5. Engagement — визиты, клики, лиды, подписки
# ===========================================================================

@router.get("/engagement", dependencies=[Depends(verify_api_key)])
async def engagement_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
    platform: Optional[str] = Query(None),
):
    """Визиты, клики, лиды, подписки за период. Фильтры: канал, платформа, даты."""
    start, end = _parse_dates(date_from, date_to, days)

    # --- Визиты ---
    v_cond = "visited_at >= $1 AND visited_at <= $2"
    v_params: list = [start, end]
    vi = 2
    if channel_id is not None:
        vi += 1
        v_cond += f" AND channel_id = ${vi}"
        v_params.append(channel_id)
    if platform:
        vi += 1
        v_cond += f" AND platform = ${vi}"
        v_params.append(platform)

    visits = await fetch_one(f"SELECT COUNT(*) as c FROM visits WHERE {v_cond}", *v_params)

    # --- Клики ---
    cl_cond = "c.clicked_at >= $1 AND c.clicked_at <= $2"
    cl_params: list = [start, end]
    cli = 2
    if channel_id is not None:
        cli += 1
        cl_cond += f" AND tl.channel_id = ${cli}"
        cl_params.append(channel_id)

    clicks = await fetch_one(
        f"""SELECT COUNT(*) as c FROM clicks c
            JOIN tracking_links tl ON tl.id = c.link_id
            WHERE {cl_cond}""",
        *cl_params,
    )

    # --- Лиды (leads не имеет channel_id — джойним через lead_magnets) ---
    l_cond = "l.claimed_at >= $1 AND l.claimed_at <= $2"
    l_params: list = [start, end]
    li = 2
    l_join = ""
    if channel_id is not None or platform:
        l_join = "JOIN lead_magnets lm ON lm.id = l.lead_magnet_id"
    if channel_id is not None:
        li += 1
        l_cond += f" AND lm.channel_id = ${li}"
        l_params.append(channel_id)
    if platform:
        li += 1
        l_cond += f" AND l.platform = ${li}"
        l_params.append(platform)

    new_leads = await fetch_one(
        f"SELECT COUNT(*) as c FROM leads l {l_join} WHERE {l_cond}", *l_params
    )

    leads_by_day = await fetch_all(
        f"""SELECT l.claimed_at::date as day, COUNT(*) as count
            FROM leads l {l_join} WHERE {l_cond}
            GROUP BY day ORDER BY day""",
        *l_params,
    )

    # --- Подписки ---
    s_where, s_params = _build_where([], "subscribed_at", start, end, channel_id, platform)
    new_subs = await fetch_one(f"SELECT COUNT(*) as c FROM subscriptions WHERE {s_where}", *s_params)

    subs_by_day = await fetch_all(
        f"""SELECT subscribed_at::date as day, COUNT(*) as count
            FROM subscriptions WHERE {s_where}
            GROUP BY day ORDER BY day""",
        *s_params,
    )

    # --- Топ ссылок ---
    tl_cond = "v.visited_at >= $1 AND v.visited_at <= $2"
    tl_params: list = [start, end]
    tli = 2
    if channel_id is not None:
        tli += 1
        tl_cond += f" AND tl.channel_id = ${tli}"
        tl_params.append(channel_id)

    top_links = await fetch_all(
        f"""SELECT tl.id, tl.name, tl.utm_source, tl.utm_campaign, tl.clicks as total_clicks,
                   tl.created_at,
                   COUNT(v.id) as period_visits
            FROM tracking_links tl
            LEFT JOIN visits v ON v.tracking_link_id = tl.id AND {tl_cond}
            {'WHERE tl.channel_id = $' + str(tli) if channel_id else ''}
            GROUP BY tl.id, tl.name, tl.utm_source, tl.utm_campaign, tl.clicks, tl.created_at
            ORDER BY period_visits DESC LIMIT 10""",
        *tl_params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "visits": visits["c"] if visits else 0,
        "clicks": clicks["c"] if clicks else 0,
        "new_leads": new_leads["c"] if new_leads else 0,
        "new_subscriptions": new_subs["c"] if new_subs else 0,
        "leads_by_day": [{"date": str(r["day"]), "count": r["count"]} for r in leads_by_day],
        "subscriptions_by_day": [{"date": str(r["day"]), "count": r["count"]} for r in subs_by_day],
        "top_links": [
            {
                "id": r["id"], "name": r["name"],
                "utm_source": r["utm_source"], "utm_campaign": r["utm_campaign"],
                "total_clicks": r["total_clicks"], "period_visits": r["period_visits"],
                "created_at": _dt(r["created_at"]),
            }
            for r in top_links
        ],
    }


# ===========================================================================
# 6. Billing — MRR, подписки, churn
# ===========================================================================

@router.get("/billing", dependencies=[Depends(verify_api_key)])
async def billing_metrics(
    channel_id: Optional[int] = Query(None),
):
    """Биллинг: активные/истекающие подписки, MRR, распределение по тарифам."""
    now = datetime.utcnow()
    week_later = now + timedelta(days=7)

    # Базовые фильтры (используем cb.channel_id для однозначности в джойнах)
    ch_cond = ""
    ch_params: list = []
    if channel_id is not None:
        ch_cond = "AND cb.channel_id = $1"
        ch_params = [channel_id]

    # Параметры со сдвигом для тех запросов, где уже есть $1
    week_cond = f"AND cb.channel_id = $2" if channel_id else ""
    week_params = [week_later] + ([channel_id] if channel_id else [])

    active = await fetch_one(
        f"SELECT COUNT(*) as c FROM channel_billing cb WHERE cb.status = 'active' AND cb.expires_at > NOW() {ch_cond}",
        *ch_params,
    )
    expiring_7d = await fetch_one(
        f"SELECT COUNT(*) as c FROM channel_billing cb WHERE cb.status = 'active' AND cb.expires_at BETWEEN NOW() AND $1 {week_cond}",
        *week_params,
    )
    expired = await fetch_one(
        f"SELECT COUNT(*) as c FROM channel_billing cb WHERE cb.status = 'active' AND cb.expires_at <= NOW() {ch_cond}",
        *ch_params,
    )
    total_ever = await fetch_one(
        f"SELECT COUNT(DISTINCT cb.channel_id) as c FROM channel_billing cb WHERE TRUE {ch_cond}",
        *ch_params,
    )

    # MRR — оценка месячной выручки от активных подписок
    mrr_row = await fetch_one(
        f"""SELECT COALESCE(SUM(
              CASE WHEN billing_months > 0 AND expires_at > NOW()
                   THEN (SELECT COALESCE(t.price, 0) FROM tariffs t WHERE t.months = cb.billing_months LIMIT 1) / cb.billing_months
                   ELSE 0
              END
            ), 0) as mrr
            FROM channel_billing cb
            WHERE cb.status = 'active' AND cb.expires_at > NOW() {ch_cond}""",
        *ch_params,
    )

    # Распределение по тарифам
    by_plan = await fetch_all(
        f"""SELECT COALESCE(cb.plan, 'free') as plan, COUNT(*) as count
            FROM channel_billing cb WHERE cb.status = 'active' AND cb.expires_at > NOW() {ch_cond}
            GROUP BY plan ORDER BY count DESC""",
        *ch_params,
    )

    # Все активные подписки с датами
    active_list = await fetch_all(
        f"""SELECT cb.id, cb.channel_id, c.title as channel_title,
                   cb.plan, cb.status, cb.billing_months, cb.max_users,
                   cb.started_at, cb.expires_at, cb.created_at
            FROM channel_billing cb
            LEFT JOIN channels c ON c.id = cb.channel_id
            WHERE cb.status = 'active' AND cb.expires_at > NOW() {ch_cond}
            ORDER BY cb.expires_at ASC""",
        *ch_params,
    )

    # Последние платежи с датами
    recent = await fetch_all(
        f"""SELECT bp.id, bp.amount, bp.currency, bp.status, bp.created_at,
                   bp.channel_id, c.title as channel_title
            FROM billing_payments bp
            LEFT JOIN channels c ON c.id = bp.channel_id
            WHERE TRUE {('AND bp.channel_id = $1' if channel_id else '')}
            ORDER BY bp.created_at DESC LIMIT 20""",
        *ch_params,
    )

    return {
        "active_subscriptions": active["c"] if active else 0,
        "expiring_7d": expiring_7d["c"] if expiring_7d else 0,
        "expired_not_renewed": expired["c"] if expired else 0,
        "total_ever_subscribed": total_ever["c"] if total_ever else 0,
        "estimated_mrr": float(mrr_row["mrr"]) if mrr_row else 0,
        "by_plan": [{"plan": r["plan"], "count": r["count"]} for r in by_plan],
        "active_subscriptions_list": [
            {
                "id": r["id"], "channel_id": r["channel_id"],
                "channel_title": r["channel_title"],
                "plan": r["plan"], "billing_months": r["billing_months"],
                "max_users": r["max_users"],
                "started_at": _dt(r["started_at"]),
                "expires_at": _dt(r["expires_at"]),
                "created_at": _dt(r["created_at"]),
            }
            for r in active_list
        ],
        "recent_payments": [
            {
                "id": r["id"], "amount": float(r["amount"]), "currency": r["currency"],
                "status": r["status"], "channel_id": r["channel_id"],
                "channel_title": r["channel_title"],
                "created_at": _dt(r["created_at"]),
            }
            for r in recent
        ],
    }


# ===========================================================================
# 7. Lead Magnets — эффективность лид-магнитов
# ===========================================================================

@router.get("/lead-magnets", dependencies=[Depends(verify_api_key)])
async def lead_magnets_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Лид-магниты: кол-во клеймов, топ по конверсии, список с датами."""
    start, end = _parse_dates(date_from, date_to, days)

    # Топ лид-магнитов по клеймам за период
    ch_filter = "AND lm.channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    top_lm = await fetch_all(
        f"""SELECT lm.id, lm.title, lm.code, lm.channel_id, lm.created_at,
                   c.title as channel_title,
                   COUNT(l.id) as claims_count
            FROM lead_magnets lm
            LEFT JOIN leads l ON l.lead_magnet_id = lm.id
                AND l.claimed_at >= $1 AND l.claimed_at <= $2
            LEFT JOIN channels c ON c.id = lm.channel_id
            WHERE TRUE {ch_filter}
            GROUP BY lm.id, lm.title, lm.code, lm.channel_id, lm.created_at, c.title
            ORDER BY claims_count DESC LIMIT 30""",
        *params,
    )

    # Клеймы по дням (leads не имеет channel_id, джойним через lead_magnets)
    lm_join = "JOIN lead_magnets lm2 ON lm2.id = l2.lead_magnet_id" if channel_id else ""
    lm_cond = "AND lm2.channel_id = $3" if channel_id else ""
    claims_by_day = await fetch_all(
        f"""SELECT l2.claimed_at::date as day, COUNT(*) as count
            FROM leads l2 {lm_join}
            WHERE l2.claimed_at >= $1 AND l2.claimed_at <= $2 {lm_cond}
            GROUP BY day ORDER BY day""",
        *params,
    )

    # Последние клеймы
    recent_claims = await fetch_all(
        f"""SELECT l.id, l.telegram_id, l.max_user_id, l.username, l.first_name,
                   l.platform, l.claimed_at,
                   lm.title as lead_magnet_title, lm.channel_id
            FROM leads l
            JOIN lead_magnets lm ON lm.id = l.lead_magnet_id
            WHERE l.claimed_at >= $1 AND l.claimed_at <= $2
            {('AND lm.channel_id = $3' if channel_id else '')}
            ORDER BY l.claimed_at DESC LIMIT 50""",
        *params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "top_lead_magnets": [
            {
                "id": r["id"], "title": r["title"], "code": r["code"],
                "channel_id": r["channel_id"], "channel_title": r["channel_title"],
                "claims_count": r["claims_count"],
                "created_at": _dt(r["created_at"]),
            }
            for r in top_lm
        ],
        "claims_by_day": [{"date": str(r["day"]), "count": r["count"]} for r in claims_by_day],
        "recent_claims": [
            {
                "id": r["id"], "telegram_id": r["telegram_id"],
                "max_user_id": r["max_user_id"],
                "username": r["username"], "first_name": r["first_name"],
                "platform": r["platform"],
                "lead_magnet_title": r["lead_magnet_title"],
                "channel_id": r["channel_id"],
                "claimed_at": _dt(r["claimed_at"]),
            }
            for r in recent_claims
        ],
    }


# ===========================================================================
# 8. Giveaways — розыгрыши
# ===========================================================================

@router.get("/giveaways", dependencies=[Depends(verify_api_key)])
async def giveaways_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Розыгрыши: статусы, участники, даты создания/проведения."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = "AND g.channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Список розыгрышей за период
    giveaways = await fetch_all(
        f"""SELECT g.id, g.title, g.status, g.winner_count,
                   g.participant_count, g.channel_id,
                   c.title as channel_title,
                   g.created_at, g.published_at, g.drawn_at, g.ends_at
            FROM giveaways g
            LEFT JOIN channels c ON c.id = g.channel_id
            WHERE g.created_at >= $1 AND g.created_at <= $2 {ch_filter}
            ORDER BY g.created_at DESC""",
        *params,
    )

    # Статистика по статусам
    by_status = await fetch_all(
        f"""SELECT status, COUNT(*) as count, SUM(COALESCE(participant_count, 0)) as total_participants
            FROM giveaways
            WHERE created_at >= $1 AND created_at <= $2
            {('AND channel_id = $3' if channel_id else '')}
            GROUP BY status""",
        *params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "giveaways": [
            {
                "id": r["id"], "title": r["title"], "status": r["status"],
                "winner_count": r["winner_count"],
                "participant_count": r["participant_count"],
                "channel_id": r["channel_id"], "channel_title": r["channel_title"],
                "created_at": _dt(r["created_at"]),
                "published_at": _dt(r["published_at"]),
                "drawn_at": _dt(r["drawn_at"]),
                "ends_at": _dt(r["ends_at"]),
            }
            for r in giveaways
        ],
        "by_status": [
            {"status": r["status"], "count": r["count"], "total_participants": r["total_participants"]}
            for r in by_status
        ],
    }


# ===========================================================================
# 9. Broadcasts — рассылки
# ===========================================================================

@router.get("/broadcasts", dependencies=[Depends(verify_api_key)])
async def broadcasts_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Рассылки: отправлено, ошибки, процент доставки, даты."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = "AND b.channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Список рассылок за период
    broadcasts = await fetch_all(
        f"""SELECT b.id, b.title, b.status, b.target_type,
                   b.sent_count, b.failed_count, b.total_count,
                   b.channel_id, c.title as channel_title,
                   b.created_at, b.scheduled_at, b.started_at, b.completed_at
            FROM broadcasts b
            LEFT JOIN channels c ON c.id = b.channel_id
            WHERE b.created_at >= $1 AND b.created_at <= $2 {ch_filter}
            ORDER BY b.created_at DESC""",
        *params,
    )

    # Общая статистика доставки
    totals = await fetch_one(
        f"""SELECT COUNT(*) as count,
                   COALESCE(SUM(sent_count), 0) as total_sent,
                   COALESCE(SUM(failed_count), 0) as total_failed,
                   COALESCE(SUM(total_count), 0) as total_recipients
            FROM broadcasts
            WHERE created_at >= $1 AND created_at <= $2
            {('AND channel_id = $3' if channel_id else '')}""",
        *params,
    )

    t_sent = totals["total_sent"] if totals else 0
    t_recip = totals["total_recipients"] if totals else 0

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "total_broadcasts": totals["count"] if totals else 0,
        "total_sent": t_sent,
        "total_failed": totals["total_failed"] if totals else 0,
        "total_recipients": t_recip,
        "delivery_rate": round(t_sent / t_recip * 100, 1) if t_recip else 0,
        "broadcasts": [
            {
                "id": r["id"], "title": r["title"], "status": r["status"],
                "target_type": r["target_type"],
                "sent_count": r["sent_count"], "failed_count": r["failed_count"],
                "total_count": r["total_count"],
                "channel_id": r["channel_id"], "channel_title": r["channel_title"],
                "created_at": _dt(r["created_at"]),
                "scheduled_at": _dt(r["scheduled_at"]),
                "started_at": _dt(r["started_at"]),
                "completed_at": _dt(r["completed_at"]),
            }
            for r in broadcasts
        ],
    }


# ===========================================================================
# 10. Funnels — воронки автоматизации
# ===========================================================================

@router.get("/funnels", dependencies=[Depends(verify_api_key)])
async def funnels_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Воронки: шаги, прогресс отправки (sent/pending/failed), даты."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = "AND fs.channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Шаги воронок по каналам
    steps = await fetch_all(
        f"""SELECT fs.id, fs.channel_id, c.title as channel_title,
                   fs.step_number, fs.delay_minutes, fs.is_active,
                   lm.title as lead_magnet_title,
                   fs.created_at
            FROM funnel_steps fs
            LEFT JOIN channels c ON c.id = fs.channel_id
            LEFT JOIN lead_magnets lm ON lm.id = fs.lead_magnet_id
            WHERE fs.created_at >= $1 AND fs.created_at <= $2 {ch_filter}
            ORDER BY fs.channel_id, fs.step_number""",
        *params,
    )

    # Прогресс: статусы за период
    fp_ch = "AND fp.scheduled_at >= $1 AND fp.scheduled_at <= $2"
    fp_params: list = [start, end]
    if channel_id:
        fp_ch += " AND fs2.channel_id = $3"
        fp_params.append(channel_id)

    progress = await fetch_all(
        f"""SELECT fp.status, COUNT(*) as count
            FROM funnel_progress fp
            JOIN funnel_steps fs2 ON fs2.id = fp.funnel_step_id
            WHERE TRUE {fp_ch}
            GROUP BY fp.status""",
        *fp_params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "steps": [
            {
                "id": r["id"], "channel_id": r["channel_id"],
                "channel_title": r["channel_title"],
                "step_number": r["step_number"],
                "delay_minutes": r["delay_minutes"],
                "is_active": r["is_active"],
                "lead_magnet_title": r["lead_magnet_title"],
                "created_at": _dt(r["created_at"]),
            }
            for r in steps
        ],
        "progress_by_status": {r["status"]: r["count"] for r in progress},
    }


# ===========================================================================
# 11. Paid Chats — платные чаты
# ===========================================================================

@router.get("/paid-chats", dependencies=[Depends(verify_api_key)])
async def paid_chats_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Платные чаты: подписчики, выручка, планы, даты."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = "AND channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Активные подписчики
    members = await fetch_one(
        f"""SELECT COUNT(*) as c FROM paid_chat_members
            WHERE status = 'active' {('AND channel_id = $1' if channel_id else '')}""",
        *([channel_id] if channel_id else []),
    )

    # Новые подписчики за период
    new_members = await fetch_one(
        f"""SELECT COUNT(*) as c FROM paid_chat_members
            WHERE created_at >= $1 AND created_at <= $2 {ch_filter}""",
        *params,
    )

    # Выручка за период
    revenue = await fetch_one(
        f"""SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
            FROM paid_chat_payments
            WHERE status = 'completed' AND created_at >= $1 AND created_at <= $2 {ch_filter}""",
        *params,
    )

    # По планам
    by_plan = await fetch_all(
        f"""SELECT pcp.title as plan_title, pcp.plan_type, pcp.price,
                   COUNT(pcm.id) as members_count
            FROM paid_chat_plans pcp
            LEFT JOIN paid_chat_members pcm ON pcm.plan_id = pcp.id AND pcm.status = 'active'
            WHERE pcp.is_active = 1 {('AND pcp.channel_id = $1' if channel_id else '')}
            GROUP BY pcp.id, pcp.title, pcp.plan_type, pcp.price
            ORDER BY members_count DESC""",
        *([channel_id] if channel_id else []),
    )

    # Последние платежи
    recent_payments = await fetch_all(
        f"""SELECT pcp.id, pcp.amount, pcp.currency, pcp.status,
                   pcp.username, pcp.first_name, pcp.platform,
                   pcp.created_at, pcp.paid_at
            FROM paid_chat_payments pcp
            WHERE pcp.created_at >= $1 AND pcp.created_at <= $2 {ch_filter}
            ORDER BY pcp.created_at DESC LIMIT 30""",
        *params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "active_members": members["c"] if members else 0,
        "new_members": new_members["c"] if new_members else 0,
        "revenue": float(revenue["total"]) if revenue else 0,
        "payments_count": revenue["count"] if revenue else 0,
        "by_plan": [
            {
                "plan_title": r["plan_title"], "plan_type": r["plan_type"],
                "price": float(r["price"]) if r["price"] else 0,
                "members_count": r["members_count"],
            }
            for r in by_plan
        ],
        "recent_payments": [
            {
                "id": r["id"], "amount": float(r["amount"]),
                "currency": r["currency"], "status": r["status"],
                "username": r["username"], "first_name": r["first_name"],
                "platform": r["platform"],
                "created_at": _dt(r["created_at"]),
                "paid_at": _dt(r["paid_at"]),
            }
            for r in recent_payments
        ],
    }


# ===========================================================================
# 12. Courses — курсы и записи
# ===========================================================================

@router.get("/courses", dependencies=[Depends(verify_api_key)])
async def courses_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Курсы: записи, прогресс, сертификаты, даты."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = "AND co.channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Курсы со статистикой записей
    courses = await fetch_all(
        f"""SELECT co.id, co.title, co.status, co.price, co.currency,
                   co.channel_id, co.created_at,
                   c.title as channel_title,
                   COUNT(ce.id) as enrollments_count,
                   COUNT(ce.id) FILTER (WHERE ce.status = 'completed') as completed_count,
                   ROUND(AVG(ce.progress), 1) as avg_progress
            FROM courses co
            LEFT JOIN channels c ON c.id = co.channel_id
            LEFT JOIN course_enrollments ce ON ce.course_id = co.id
            WHERE co.created_at >= $1 AND co.created_at <= $2 {ch_filter}
            GROUP BY co.id, co.title, co.status, co.price, co.currency,
                     co.channel_id, co.created_at, c.title
            ORDER BY enrollments_count DESC""",
        *params,
    )

    # Записи за период
    ce_ch = "AND co2.channel_id = $3" if channel_id else ""
    new_enrollments = await fetch_one(
        f"""SELECT COUNT(*) as c FROM course_enrollments ce
            JOIN courses co2 ON co2.id = ce.course_id
            WHERE ce.enrolled_at >= $1 AND ce.enrolled_at <= $2 {ce_ch}""",
        *params,
    )

    # Сертификаты за период
    certs = await fetch_one(
        f"""SELECT COUNT(*) as c FROM certificates
            WHERE issued_at >= $1 AND issued_at <= $2
            {('AND course_id IN (SELECT id FROM courses WHERE channel_id = $3)' if channel_id else '')}""",
        *params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "new_enrollments": new_enrollments["c"] if new_enrollments else 0,
        "certificates_issued": certs["c"] if certs else 0,
        "courses": [
            {
                "id": r["id"], "title": r["title"], "status": r["status"],
                "price": float(r["price"]) if r["price"] else 0,
                "currency": r["currency"],
                "channel_id": r["channel_id"], "channel_title": r["channel_title"],
                "enrollments_count": r["enrollments_count"],
                "completed_count": r["completed_count"],
                "avg_progress": float(r["avg_progress"]) if r["avg_progress"] else 0,
                "created_at": _dt(r["created_at"]),
            }
            for r in courses
        ],
    }


# ===========================================================================
# 13. Top Channels — топ каналов по ключевым метрикам
# ===========================================================================

@router.get("/top-channels", dependencies=[Depends(verify_api_key)])
async def top_channels_metrics(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("subscriptions", description="Сортировка: subscriptions, leads, visits, revenue"),
    platform: Optional[str] = Query(None),
):
    """Топ каналов по подпискам, лидам, визитам или выручке за период."""
    start, end = _parse_dates(date_from, date_to, days)

    plat_filter = "AND COALESCE(c.platform, 'telegram') = $4" if platform else ""
    params: list = [start, end, limit]
    if platform:
        params.append(platform)

    # Собираем метрики для каждого канала
    order_col = {
        "subscriptions": "subs_count",
        "leads": "leads_count",
        "visits": "visits_count",
        "revenue": "revenue",
    }.get(sort_by, "subs_count")

    channels = await fetch_all(
        f"""SELECT c.id, c.title, c.username, COALESCE(c.platform, 'telegram') as platform,
                   c.created_at,
                   cb.plan, cb.status as billing_status, cb.expires_at,
                   COALESCE(s.cnt, 0) as subs_count,
                   COALESCE(l.cnt, 0) as leads_count,
                   COALESCE(v.cnt, 0) as visits_count,
                   COALESCE(bpay.total, 0) as revenue
            FROM channels c
            LEFT JOIN channel_billing cb ON cb.channel_id = c.id
            LEFT JOIN (
                SELECT channel_id, COUNT(*) as cnt FROM subscriptions
                WHERE subscribed_at >= $1 AND subscribed_at <= $2
                GROUP BY channel_id
            ) s ON s.channel_id = c.id
            LEFT JOIN (
                SELECT lm.channel_id, COUNT(*) as cnt
                FROM leads ld
                JOIN lead_magnets lm ON lm.id = ld.lead_magnet_id
                WHERE ld.claimed_at >= $1 AND ld.claimed_at <= $2
                GROUP BY lm.channel_id
            ) l ON l.channel_id = c.id
            LEFT JOIN (
                SELECT channel_id, COUNT(*) as cnt FROM visits
                WHERE visited_at >= $1 AND visited_at <= $2
                GROUP BY channel_id
            ) v ON v.channel_id = c.id
            LEFT JOIN (
                SELECT channel_id, COALESCE(SUM(amount), 0) as total
                FROM billing_payments WHERE status = 'paid'
                AND created_at >= $1 AND created_at <= $2
                GROUP BY channel_id
            ) bpay ON bpay.channel_id = c.id
            WHERE TRUE {plat_filter}
            ORDER BY {order_col} DESC
            LIMIT $3""",
        *params,
    )

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "sort_by": sort_by,
        "channels": [
            {
                "id": r["id"], "title": r["title"], "username": r["username"],
                "platform": r["platform"],
                "plan": r["plan"], "billing_status": r["billing_status"],
                "billing_expires_at": _dt(r["expires_at"]),
                "subscriptions": r["subs_count"],
                "leads": r["leads_count"],
                "visits": r["visits_count"],
                "revenue": float(r["revenue"]),
                "created_at": _dt(r["created_at"]),
            }
            for r in channels
        ],
    }


# ===========================================================================
# 14. Conversion Funnel — воронка конверсии: визиты → лиды → подписки
# ===========================================================================

@router.get("/conversion-funnel", dependencies=[Depends(verify_api_key)])
async def conversion_funnel(
    days: int = Query(30, ge=1, le=365),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel_id: Optional[int] = Query(None),
):
    """Воронка конверсии: визиты → лиды → подписки → платежи, с процентами."""
    start, end = _parse_dates(date_from, date_to, days)

    ch_filter = " AND channel_id = $3" if channel_id else ""
    params: list = [start, end]
    if channel_id:
        params.append(channel_id)

    # Визиты
    visits = await fetch_one(
        f"SELECT COUNT(*) as c FROM visits WHERE visited_at >= $1 AND visited_at <= $2 {ch_filter}",
        *params,
    )

    # Лиды (leads не имеет channel_id — джойним через lead_magnets)
    leads_ch = " AND lm.channel_id = $3" if channel_id else ""
    leads_join = "JOIN lead_magnets lm ON lm.id = l.lead_magnet_id" if channel_id else ""
    leads = await fetch_one(
        f"SELECT COUNT(*) as c FROM leads l {leads_join} WHERE l.claimed_at >= $1 AND l.claimed_at <= $2 {leads_ch}",
        *params,
    )

    # Подписки
    subs = await fetch_one(
        f"SELECT COUNT(*) as c FROM subscriptions WHERE subscribed_at >= $1 AND subscribed_at <= $2 {ch_filter}",
        *params,
    )

    # Платежи биллинга
    payments = await fetch_one(
        f"SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total FROM billing_payments WHERE status = 'paid' AND created_at >= $1 AND created_at <= $2 {ch_filter}",
        *params,
    )

    v = visits["c"] if visits else 0
    l = leads["c"] if leads else 0
    s = subs["c"] if subs else 0
    p = payments["c"] if payments else 0

    return {
        "period": {"from": _dt(start), "to": _dt(end)},
        "funnel": [
            {"stage": "visits", "count": v, "rate": 100.0},
            {"stage": "leads", "count": l, "rate": round(l / v * 100, 2) if v else 0},
            {"stage": "subscriptions", "count": s, "rate": round(s / v * 100, 2) if v else 0},
            {"stage": "payments", "count": p, "rate": round(p / v * 100, 2) if v else 0},
        ],
        "payments_total": float(payments["total"]) if payments else 0,
    }
