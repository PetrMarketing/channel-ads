import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Query, UploadFile

from ..middleware.admin_auth import (
    get_current_admin, require_superadmin,
    create_admin_jwt, verify_password, hash_password,
)
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


# ---------------------------------------------------------------------------
# Логирование действий админа (для аудита)
# ---------------------------------------------------------------------------

async def log_admin_action(
    admin: Dict[str, Any],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    payload: Optional[dict] = None,
) -> None:
    """Запись в admin_action_log. Не должна валить вызывающий код при ошибке."""
    try:
        await execute(
            """INSERT INTO admin_action_log (admin_id, admin_username, action, target_type, target_id, payload)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb)""",
            admin.get("id"), admin.get("username") or admin.get("display_name"),
            action, target_type, target_id,
            json.dumps(payload or {}, ensure_ascii=False, default=str),
        )
    except Exception as e:
        print(f"[Admin] log_admin_action failed: {e}")


# ---------------------------------------------------------------------------
# Ensure default superadmin exists (called from lifespan)
# ---------------------------------------------------------------------------

async def ensure_default_admin():
    existing = await fetch_one("SELECT id FROM admin_users LIMIT 1")
    if not existing:
        pw = hash_password("admin123")
        await execute_returning_id(
            "INSERT INTO admin_users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id",
            "admin", pw, "Суперадмин", "superadmin",
        )
        print("Default admin created: admin / admin123")


# ===========================
# Auth
# ===========================

@router.post("/auth/login")
async def admin_login(request: Request):
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Введите логин и пароль")
    admin = await fetch_one("SELECT * FROM admin_users WHERE username = $1 AND is_active = 1", username)
    if not admin or not verify_password(password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    await execute("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", admin["id"])
    token = create_admin_jwt(admin["id"])
    return {
        "success": True,
        "token": token,
        "admin": {"id": admin["id"], "username": admin["username"], "display_name": admin["display_name"], "role": admin["role"]},
    }


@router.get("/auth/me")
async def admin_me(admin: Dict = Depends(get_current_admin)):
    return {
        "success": True,
        "admin": {"id": admin["id"], "username": admin["username"], "display_name": admin["display_name"], "role": admin["role"]},
    }


# ===========================
# Dashboard
# ===========================

@router.get("/dashboard/stats")
async def dashboard_stats(admin: Dict = Depends(get_current_admin)):
    users = await fetch_one("SELECT COUNT(*) as c FROM users")
    channels = await fetch_one("SELECT COUNT(*) as c FROM channels")
    subscribers = await fetch_one("SELECT COUNT(*) as c FROM subscriptions")
    active_billing = await fetch_one("SELECT COUNT(*) as c FROM channel_billing WHERE status = 'active' AND expires_at > NOW()")
    leads = await fetch_one("SELECT COUNT(*) as c FROM leads")
    try:
        pins = await fetch_one("SELECT COUNT(*) as c FROM pin_posts")
        broadcasts = await fetch_one("SELECT COUNT(*) as c FROM broadcasts")
        giveaways = await fetch_one("SELECT COUNT(*) as c FROM giveaways")
        lead_magnets = await fetch_one("SELECT COUNT(*) as c FROM lead_magnets")
    except Exception:
        pins = broadcasts = giveaways = lead_magnets = {"c": 0}
    # Total revenue
    try:
        revenue = await fetch_one("SELECT COALESCE(SUM(amount), 0) as total FROM billing_payments WHERE status = 'paid'")
        total_revenue = float(revenue["total"]) if revenue else 0
    except Exception:
        total_revenue = 0

    return {
        "success": True,
        "users": users["c"] if users else 0,
        "channels": channels["c"] if channels else 0,
        "subscribers": subscribers["c"] if subscribers else 0,
        "activeBillings": active_billing["c"] if active_billing else 0,
        "leads": leads["c"] if leads else 0,
        "pins": pins["c"] if pins else 0,
        "broadcasts": broadcasts["c"] if broadcasts else 0,
        "giveaways": giveaways["c"] if giveaways else 0,
        "leadMagnets": lead_magnets["c"] if lead_magnets else 0,
        "totalRevenue": total_revenue,
    }


@router.get("/dashboard/charts")
async def dashboard_charts(days: int = Query(30), admin: Dict = Depends(get_current_admin)):
    """Get daily user registrations and revenue for charts."""
    from datetime import datetime, timedelta
    since = (datetime.utcnow() - timedelta(days=days)).date()

    users_by_day = await fetch_all(
        "SELECT created_at::date as day, COUNT(*) as cnt FROM users WHERE created_at::date >= $1 GROUP BY day ORDER BY day",
        since,
    )
    revenue_by_day = await fetch_all(
        """SELECT created_at::date as day, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
           FROM billing_payments WHERE status = 'paid' AND created_at::date >= $1
           GROUP BY day ORDER BY day""",
        since,
    )

    return {
        "success": True,
        "users_chart": [{"date": str(r["day"]), "count": r["cnt"]} for r in users_by_day],
        "revenue_chart": [{"date": str(r["day"]), "amount": float(r["total"]), "count": r["cnt"]} for r in revenue_by_day],
    }


# ===========================
# Users (app administrators)
# ===========================

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    offset = (page - 1) * limit
    if search:
        # Search by PKid (exact), username, first_name, telegram_id, max_user_id
        if search.strip().isdigit():
            pk_id = int(search.strip())
            total = await fetch_one(
                "SELECT COUNT(*) as c FROM users WHERE id = $1 OR CAST(telegram_id AS TEXT) LIKE $2 OR max_user_id = $3",
                pk_id, f"%{search}%", search.strip(),
            )
            rows = await fetch_all(
                """SELECT u.*, (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channel_count
                   FROM users u
                   WHERE u.id = $1 OR CAST(u.telegram_id AS TEXT) LIKE $2 OR u.max_user_id = $3
                   ORDER BY u.created_at DESC LIMIT $4 OFFSET $5""",
                pk_id, f"%{search}%", search.strip(), limit, offset,
            )
        else:
            like = f"%{search}%"
            total = await fetch_one(
                "SELECT COUNT(*) as c FROM users WHERE username ILIKE $1 OR first_name ILIKE $1 OR max_user_id = $2",
                like, search.strip(),
            )
            rows = await fetch_all(
                """SELECT u.*, (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channel_count
                   FROM users u
                   WHERE u.username ILIKE $1 OR u.first_name ILIKE $1 OR u.max_user_id = $2
                   ORDER BY u.created_at DESC LIMIT $3 OFFSET $4""",
                like, search.strip(), limit, offset,
            )
    else:
        total = await fetch_one("SELECT COUNT(*) as c FROM users")
        rows = await fetch_all(
            """SELECT u.*, (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channel_count
               FROM users u ORDER BY u.created_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
    # Strip binary fields
    clean = []
    for r in rows:
        d = {k: v for k, v in dict(r).items() if not isinstance(v, (bytes, bytearray, memoryview))}
        clean.append(d)
    return {"success": True, "users": clean, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.get("/users/{user_id}")
async def get_user(user_id: int, admin: Dict = Depends(get_current_admin)):
    user = await fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    channels = await fetch_all(
        """SELECT c.*, cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users
           FROM channels c LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.user_id = $1 ORDER BY c.created_at DESC""",
        user_id,
    )
    staff = await fetch_all(
        """SELECT cs.*, c.title as channel_title, c.id as channel_id
           FROM channel_staff cs JOIN channels c ON c.id = cs.channel_id
           WHERE cs.user_id = $1""",
        user_id,
    )
    return {"success": True, "user": user, "channels": channels, "staff": staff}


@router.post("/users/{user_id}/add-tokens")
async def add_tokens(user_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    """Изменить баланс ИИ-токенов (delta может быть положительным или отрицательным).
    Пишет запись в ai_token_usage и admin_action_log."""
    body = await request.json()
    tokens = int(body.get("tokens", 0))
    reason = (body.get("reason") or "").strip() or "Корректировка админом"
    if tokens == 0:
        raise HTTPException(status_code=400, detail="Укажите ненулевое значение")

    user = await fetch_one("SELECT id, ai_tokens FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    before = int(user.get("ai_tokens") or 0)
    new_balance = before + tokens
    if new_balance < 0:
        # Не уходим в минус — обрезаем
        tokens = -before
        new_balance = 0

    await execute("UPDATE users SET ai_tokens = $1 WHERE id = $2", new_balance, user_id)
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1, $2, $3, $4)",
        user_id, tokens, "admin_adjust",
        f"Админ {admin.get('username', '?')}: {reason}",
    )
    await log_admin_action(
        admin, "tokens_adjust", "user", user_id,
        {"before": before, "delta": tokens, "after": new_balance, "reason": reason},
    )
    return {"success": True, "before": before, "after": new_balance, "delta": tokens}


@router.get("/users/{user_id}/channels")
async def user_channels(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT c.*, cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users,
                  (SELECT COUNT(*) FROM channel_staff WHERE channel_id = c.id) as staff_count
           FROM channels c LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.user_id = $1 ORDER BY c.created_at DESC""",
        user_id,
    )
    return {"success": True, "channels": rows}


@router.get("/users/{user_id}/pins")
async def user_pins(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT pp.*, c.title as channel_title FROM pin_posts pp
           JOIN channels c ON c.id = pp.channel_id WHERE c.user_id = $1
           ORDER BY pp.created_at DESC""",
        user_id,
    )
    return {"success": True, "pins": _strip_binary(rows)}


@router.get("/users/{user_id}/broadcasts")
async def user_broadcasts(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT b.*, c.title as channel_title FROM broadcasts b
           JOIN channels c ON c.id = b.channel_id WHERE c.user_id = $1
           ORDER BY b.created_at DESC""",
        user_id,
    )
    return {"success": True, "broadcasts": _strip_binary(rows)}


@router.get("/users/{user_id}/giveaways")
async def user_giveaways(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT g.*, c.title as channel_title FROM giveaways g
           JOIN channels c ON c.id = g.channel_id WHERE c.user_id = $1
           ORDER BY g.created_at DESC""",
        user_id,
    )
    return {"success": True, "giveaways": _strip_binary(rows)}


@router.get("/users/{user_id}/lead-magnets")
async def user_lead_magnets(user_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT lm.*, c.title as channel_title FROM lead_magnets lm
           JOIN channels c ON c.id = lm.channel_id WHERE c.user_id = $1
           ORDER BY lm.created_at DESC""",
        user_id,
    )
    return {"success": True, "leadMagnets": _strip_binary(rows)}


@router.get("/users/{user_id}/balance-history")
async def user_balance_history(
    user_id: int,
    limit: int = Query(100, ge=1, le=500),
    admin: Dict = Depends(get_current_admin),
):
    """Объединённая история операций по пользователю:
    - Изменения ИИ-токенов (ai_token_usage)
    - Платежи (billing_payments → channel_billing → channels)
    - Ручные корректировки админом (admin_action_log с target=user или channel)
    Возвращает единый список, сортированный по дате убывания.
    """
    out = []

    tok = await fetch_all(
        """SELECT id, tokens_used, action, description, created_at
           FROM ai_token_usage WHERE user_id = $1
           ORDER BY created_at DESC LIMIT $2""",
        user_id, limit,
    )
    for r in tok:
        out.append({
            "kind": "tokens",
            "id": f"tok-{r['id']}",
            "delta": int(r.get("tokens_used") or 0),
            "label": _token_action_label(r.get("action") or ""),
            "action": r.get("action"),
            "description": r.get("description") or "",
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })

    pays = await fetch_all(
        """SELECT bp.id, bp.amount, bp.status, bp.created_at,
                  COALESCE(c.title, 'Канал') AS channel_title, c.id AS channel_id
           FROM billing_payments bp
           LEFT JOIN channel_billing cb ON cb.id = bp.channel_billing_id
           LEFT JOIN channels c ON c.id = COALESCE(bp.channel_id, cb.channel_id)
           WHERE c.user_id = $1
           ORDER BY bp.created_at DESC LIMIT $2""",
        user_id, limit,
    )
    for r in pays:
        out.append({
            "kind": "payment",
            "id": f"pay-{r['id']}",
            "amount": float(r.get("amount") or 0),
            "status": r.get("status"),
            "label": f"Оплата канала «{r.get('channel_title')}»" + (
                " (ожидает)" if r.get("status") == "pending" else
                "" if r.get("status") == "paid" else
                f" ({r.get('status')})"
            ),
            "channel_id": r.get("channel_id"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })

    chans = await fetch_all("SELECT id FROM channels WHERE user_id = $1", user_id)
    chan_ids = [c["id"] for c in chans]
    admin_rows = await fetch_all(
        """SELECT id, admin_username, action, target_type, target_id, payload, created_at
           FROM admin_action_log
           WHERE (target_type = 'user' AND target_id = $1)
              OR (target_type = 'channel' AND target_id = ANY($2::int[]))
           ORDER BY created_at DESC LIMIT $3""",
        user_id, chan_ids or [0], limit,
    )
    for r in admin_rows:
        payload = r.get("payload")
        if isinstance(payload, str):
            try: payload = json.loads(payload)
            except Exception: payload = {}
        payload = payload or {}
        label = {
            "tokens_adjust":  f"Админ изменил токены: {payload.get('delta', '?')}",
            "billing_adjust": f"Админ изменил подписку: {payload.get('delta_days', '?')} дн.",
        }.get(r.get("action") or "", f"Админ: {r.get('action')}")
        out.append({
            "kind": "admin",
            "id": f"adm-{r['id']}",
            "label": label,
            "admin": r.get("admin_username") or "?",
            "reason": payload.get("reason") or "",
            "payload": payload,
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })

    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"success": True, "items": out[:limit]}


def _token_action_label(action: str) -> str:
    return {
        "ai_landing":             "ИИ Лендинг",
        "ai_design":              "ИИ Оформление",
        "ai_content_post":        "ИИ Контент: пост",
        "ai_content_image":       "ИИ Контент: картинка",
        "ai_content_image_batch": "ИИ Контент: картинка (батч)",
        "ai_content_image_prompt":"Промт для картинки",
        "ai_post_text":           "Генерация текста поста",
        "ai_post_image":          "Генерация картинки поста",
        "ai_post_refund":         "Возврат токенов",
        "purchase":               "Покупка пакета",
        "referral_bonus":         "Реф. бонус",
        "subscription_bonus":     "Бонус за подписку",
        "season_winner":          "Награда сезона",
        "admin_adjust":           "Корректировка админом",
    }.get(action, action or "Операция")


# ============================================================
# Онбординг — админ-оверрайды текстов
# ============================================================

@router.get("/onboarding/overrides")
async def admin_get_onboarding_overrides(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT o.step_id, o.title, o.text, o.updated_at, a.username AS updated_by_username
           FROM onboarding_text_overrides o
           LEFT JOIN admin_users a ON a.id = o.updated_by
           ORDER BY o.updated_at DESC"""
    )
    return {"success": True, "overrides": [dict(r) for r in rows]}


@router.put("/onboarding/overrides/{step_id}")
async def admin_set_onboarding_override(step_id: str, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    title = body.get("title")
    text = body.get("text")
    if (title is None or title == "") and (text is None or text == ""):
        # Очистить оверрайд если оба пустые
        await execute("DELETE FROM onboarding_text_overrides WHERE step_id = $1", step_id)
        await log_admin_action(admin, "onboarding_clear", "step", None, {"step_id": step_id})
        return {"success": True, "cleared": True}
    await execute(
        """INSERT INTO onboarding_text_overrides (step_id, title, text, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (step_id)
           DO UPDATE SET title = EXCLUDED.title, text = EXCLUDED.text, updated_by = EXCLUDED.updated_by, updated_at = NOW()""",
        step_id, title, text, admin.get("id"),
    )
    await log_admin_action(admin, "onboarding_override", "step", None, {"step_id": step_id, "title": title, "text": text})
    return {"success": True}


# ============================================================
# Универсальная загрузка файлов из админки
# ============================================================

@router.post("/upload")
async def admin_upload(
    file: UploadFile = File(...),
    admin: Dict = Depends(get_current_admin),
):
    """Загружает файл в /uploads, возвращает {url, file_type, size_bytes}.
    Используется в форме уведомлений и рассылок (картинка/видео обложки)."""
    from ..services.file_storage import save_upload
    try:
        path, file_type, _data = await save_upload(file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    import os as _os
    url = "/uploads/" + _os.path.basename(path)
    size = _os.path.getsize(path) if _os.path.exists(path) else 0
    return {"success": True, "url": url, "file_type": file_type, "size_bytes": size}


# ============================================================
# Уведомления (модалки для всех пользователей при заходе)
# ============================================================

@router.get("/notifications")
async def admin_list_notifications(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT n.*,
                  (SELECT COUNT(*) FROM user_notifications_seen WHERE notification_id = n.id) AS shown_count
           FROM admin_notifications n
           ORDER BY n.created_at DESC"""
    )
    return {"success": True, "items": [dict(r) for r in rows]}


@router.post("/notifications")
async def admin_create_notification(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Заголовок обязателен")
    nid = await execute_returning_id(
        """INSERT INTO admin_notifications
           (title, body, image_url, button_text, button_url, audience, is_active, starts_at, ends_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        title, body.get("body") or "", body.get("image_url") or None,
        body.get("button_text") or None, body.get("button_url") or None,
        body.get("audience") or "all",
        bool(body.get("is_active", True)),
        body.get("starts_at") or None, body.get("ends_at") or None,
        admin.get("id"),
    )
    await log_admin_action(admin, "notification_create", "notification", nid, {"title": title})
    return {"success": True, "id": nid}


@router.put("/notifications/{nid}")
async def admin_update_notification(nid: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "body", "image_url", "button_text", "button_url", "audience", "is_active", "starts_at", "ends_at"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(nid)
    await execute(f"UPDATE admin_notifications SET {', '.join(fields)} WHERE id = ${idx}", *params)
    await log_admin_action(admin, "notification_update", "notification", nid, body)
    return {"success": True}


@router.delete("/notifications/{nid}")
async def admin_delete_notification(nid: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM admin_notifications WHERE id = $1", nid)
    await log_admin_action(admin, "notification_delete", "notification", nid, {})
    return {"success": True}


# ============================================================
# Админ-рассылки по базе пользователей (через бота)
# ============================================================

@router.get("/broadcasts-users")
async def admin_list_broadcasts(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        "SELECT * FROM admin_broadcasts ORDER BY created_at DESC"
    )
    return {"success": True, "items": [dict(r) for r in rows]}


@router.post("/broadcasts-users")
async def admin_create_broadcast(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название обязательно")
    inline_buttons = body.get("inline_buttons")
    if isinstance(inline_buttons, (list, dict)):
        import json as _json
        inline_buttons = _json.dumps(inline_buttons, ensure_ascii=False)
    bid = await execute_returning_id(
        """INSERT INTO admin_broadcasts
           (title, message_text, image_url, media_type, button_text, button_url, inline_buttons,
            audience, status, scheduled_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id""",
        title, body.get("message_text") or "", body.get("image_url") or None,
        body.get("media_type") or None, body.get("button_text") or None,
        body.get("button_url") or None, inline_buttons,
        body.get("audience") or "all",
        body.get("status") or "draft",
        body.get("scheduled_at") or None,
        admin.get("id"),
    )
    return {"success": True, "id": bid}


@router.put("/broadcasts-users/{bid}")
async def admin_update_broadcast(bid: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "image_url", "media_type", "button_text", "button_url",
                "inline_buttons", "audience", "status", "scheduled_at"):
        if key in body:
            val = body[key]
            if key == "inline_buttons" and isinstance(val, (list, dict)):
                import json as _json
                val = _json.dumps(val, ensure_ascii=False)
            fields.append(f"{key} = ${idx}")
            params.append(val)
            idx += 1
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(bid)
    await execute(f"UPDATE admin_broadcasts SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@router.delete("/broadcasts-users/{bid}")
async def admin_delete_broadcast(bid: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM admin_broadcasts WHERE id = $1", bid)
    await log_admin_action(admin, "broadcast_delete", "broadcast_user", bid, {})
    return {"success": True}


def _audience_where(audience: str):
    """SQL WHERE-условие для выборки получателей по audience."""
    if audience == "max":
        return "u.max_user_id IS NOT NULL"
    if audience == "telegram":
        return "u.telegram_id IS NOT NULL"
    if audience == "paid":
        return ("EXISTS (SELECT 1 FROM channels c JOIN channel_billing cb ON cb.channel_id = c.id "
                "WHERE c.user_id = u.id AND cb.status = 'active')")
    if audience == "free":
        return ("NOT EXISTS (SELECT 1 FROM channels c JOIN channel_billing cb ON cb.channel_id = c.id "
                "WHERE c.user_id = u.id AND cb.status = 'active')")
    return "TRUE"


@router.post("/broadcasts-users/preview-audience")
async def admin_preview_audience(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    audience = body.get("audience") or "all"
    where = _audience_where(audience)
    row = await fetch_one(
        f"SELECT COUNT(*) AS n FROM users u WHERE (u.max_user_id IS NOT NULL OR u.telegram_id IS NOT NULL) AND ({where})"
    )
    return {"success": True, "count": int(row.get("n") or 0)}


@router.post("/broadcasts-users/{bid}/send-test")
async def admin_send_test(bid: int, admin: Dict = Depends(get_current_admin)):
    """Отправить копию рассылки текущему админу — тестовая отправка.
    Берём admin_users.username и пытаемся найти связанный с ним юзер по
    тому же username. Если нет — пробуем по email."""
    bc = await fetch_one("SELECT * FROM admin_broadcasts WHERE id = $1", bid)
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    # Сначала по user_pkid из admin_users (явная привязка), потом фоллбэк на
    # username/email, чтобы старые админы продолжали работать.
    me = None
    admin_full = await fetch_one("SELECT user_pkid, username FROM admin_users WHERE id = $1", admin.get("id"))
    if admin_full and admin_full.get("user_pkid"):
        me = await fetch_one(
            "SELECT * FROM users WHERE id = $1 AND (telegram_id IS NOT NULL OR max_user_id IS NOT NULL)",
            int(admin_full["user_pkid"]),
        )
    if not me:
        me = await fetch_one(
            """SELECT * FROM users
               WHERE (telegram_id IS NOT NULL OR max_user_id IS NOT NULL)
                 AND (username = $1 OR email = $1)
               LIMIT 1""",
            (admin_full or {}).get("username") or admin.get("username") or "",
        )
    if not me:
        raise HTTPException(
            status_code=400,
            detail="Не нашёл вас среди пользователей сервиса. Откройте «Админы» и впишите свой PKid.",
        )
    sent, failed = await _send_admin_broadcast_to_user(bc, me)
    return {"success": True, "sent": sent, "failed": failed, "user_id": me["id"]}


@router.post("/broadcasts-users/{bid}/send-now")
async def admin_send_now(bid: int, admin: Dict = Depends(get_current_admin)):
    """Запустить рассылку сейчас (фоновый таск)."""
    bc = await fetch_one("SELECT * FROM admin_broadcasts WHERE id = $1", bid)
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if bc.get("status") in ("sending", "sent"):
        raise HTTPException(status_code=400, detail=f"Уже {bc.get('status')}")
    import asyncio as _aio
    await execute(
        "UPDATE admin_broadcasts SET status='sending', started_at=NOW() WHERE id = $1", bid,
    )
    _aio.create_task(_run_admin_broadcast(bid))
    await log_admin_action(admin, "broadcast_send", "broadcast_user", bid, {"title": bc.get("title")})
    return {"success": True}


@router.post("/broadcasts-users/{bid}/cancel")
async def admin_cancel_broadcast(bid: int, admin: Dict = Depends(get_current_admin)):
    bc = await fetch_one("SELECT status FROM admin_broadcasts WHERE id = $1", bid)
    if not bc:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    if bc.get("status") not in ("scheduled", "sending"):
        raise HTTPException(status_code=400, detail="Можно отменить только scheduled/sending")
    await execute("UPDATE admin_broadcasts SET status='cancelled' WHERE id = $1", bid)
    return {"success": True}


async def _send_admin_broadcast_to_user(bc: dict, user: dict):
    """Отправка одной копии рассылки. Возвращает (sent, failed) — 1 или 0."""
    from ..services.messenger import send_to_user
    import json as _json

    text = bc.get("message_text") or ""

    # inline_buttons: новый формат (массив объектов из ButtonBuilder) или
    # legacy (button_text + button_url). Билдер уже возвращает плоский
    # массив [{text, url}, ...] — НЕ оборачиваем в [[...]].
    inline = None
    raw_btns = bc.get("inline_buttons")
    if raw_btns:
        try:
            parsed = _json.loads(raw_btns) if isinstance(raw_btns, str) else raw_btns
            if isinstance(parsed, list) and parsed:
                inline = parsed
        except Exception as e:
            print(f"[admin-broadcast {bc['id']}] bad inline_buttons: {e}")
    if inline is None and bc.get("button_text") and bc.get("button_url"):
        inline = [{"text": bc["button_text"], "url": bc["button_url"]}]

    file_path = None
    file_type = None
    if bc.get("image_url"):
        url = bc["image_url"]
        if url.startswith("/uploads/"):
            file_path = "/app" + url
            file_type = bc.get("media_type") or "photo"

    sent, failed = 0, 0
    platforms = []
    if user.get("max_user_id"):
        platforms.append(("max", user["max_user_id"]))
    elif user.get("telegram_id"):
        platforms.append(("telegram", user["telegram_id"]))
    if not platforms:
        print(f"[admin-broadcast {bc['id']}] user_id={user.get('id')} has no max/telegram id — skipped")
        return 0, 0
    for platform, uid in platforms:
        try:
            res = await send_to_user(uid, platform, text, file_path=file_path, file_type=file_type, inline_buttons=inline)
            ok = (res or {}).get("success") if isinstance(res, dict) else True
            if ok is False:
                err = (res or {}).get("error", "unknown")
                print(f"[admin-broadcast {bc['id']}] FAIL user={user.get('id')} platform={platform}: {err}")
                failed += 1
            else:
                sent += 1
                print(f"[admin-broadcast {bc['id']}] sent user={user.get('id')} platform={platform}")
        except Exception as e:
            print(f"[admin-broadcast {bc['id']}] EXC user={user.get('id')} platform={platform}: {e}")
            failed += 1
    return sent, failed


async def _run_admin_broadcast(bid: int):
    """Фоновая отправка рассылки всем подходящим пользователям.

    Симафор + rate-limiter: до 10 параллельных отправок, не больше 17 в секунду.
    Лимит MAX bot API ~20 req/sec; оставляем запас на пиковые подвисания.
    """
    import asyncio as _aio
    from ..services.rate_limiter import RateLimiter

    bc = await fetch_one("SELECT * FROM admin_broadcasts WHERE id = $1", bid)
    if not bc:
        return
    audience = bc.get("audience") or "all"
    where = _audience_where(audience)
    users = await fetch_all(
        f"""SELECT * FROM users u
            WHERE (u.max_user_id IS NOT NULL OR u.telegram_id IS NOT NULL)
              AND ({where})"""
    )
    total = len(users)
    if total == 0:
        await execute(
            "UPDATE admin_broadcasts SET status='sent', completed_at=NOW(), sent_count=0, failed_count=0, total_count=0 WHERE id = $1", bid,
        )
        print(f"[admin-broadcast {bid}] no recipients matched audience={audience}")
        return

    sem = _aio.Semaphore(10)            # макс 10 одновременно
    limiter = RateLimiter(17)           # макс 17 запросов в секунду (запас от лимита 20)
    counter = {"sent": 0, "failed": 0, "cancelled": False, "done": 0}

    async def process_one(u_row: dict):
        if counter["cancelled"]:
            return
        async with sem:
            if counter["cancelled"]:
                return
            await limiter.acquire()
            # Перед каждой отправкой проверяем что не отменили (cheap query in_memory? нет, берём из БД)
            if counter["done"] % 20 == 0:
                cur = await fetch_one("SELECT status FROM admin_broadcasts WHERE id = $1", bid)
                if not cur or cur.get("status") == "cancelled":
                    counter["cancelled"] = True
                    return
            try:
                s, f = await _send_admin_broadcast_to_user(bc, dict(u_row))
                counter["sent"] += s
                counter["failed"] += f
            except Exception as e:
                print(f"[admin-broadcast {bid}] EXC user={u_row.get('id')}: {e}")
                counter["failed"] += 1
            counter["done"] += 1
            # Каждые 50 сообщений обновляем счётчики в БД (UI видит прогресс)
            if counter["done"] % 50 == 0:
                await execute(
                    "UPDATE admin_broadcasts SET sent_count=$1, failed_count=$2, total_count=$3 WHERE id = $4",
                    counter["sent"], counter["failed"], total, bid,
                )

    print(f"[admin-broadcast {bid}] start: total={total} audience={audience}, rate=17/sec, concurrency=10")
    await _aio.gather(*[process_one(u) for u in users])

    final_status = "cancelled" if counter["cancelled"] else "sent"
    await execute(
        f"UPDATE admin_broadcasts SET status='{final_status}', completed_at=NOW(), sent_count=$1, failed_count=$2, total_count=$3 WHERE id = $4",
        counter["sent"], counter["failed"], total, bid,
    )
    print(f"[admin-broadcast {bid}] done status={final_status} sent={counter['sent']} failed={counter['failed']} total={total}")


@router.get("/referrals/overview")
async def admin_referrals_overview(
    limit: int = Query(50, ge=1, le=500),
    admin: Dict = Depends(get_current_admin),
):
    """Сводка по рефералам: топ-рефереров и список последних регистраций."""
    top_referrers = await fetch_all(
        """SELECT u.id, u.username, u.first_name, u.email, u.referral_balance,
                  COUNT(rs.id) AS signups,
                  COALESCE(SUM(re.commission_amount), 0)::float AS total_earned
           FROM users u
           LEFT JOIN referral_signups rs ON rs.referrer_user_id = u.id
           LEFT JOIN referral_earnings re ON re.referrer_user_id = u.id
           GROUP BY u.id, u.username, u.first_name, u.email, u.referral_balance
           HAVING COUNT(rs.id) > 0
           ORDER BY signups DESC, total_earned DESC
           LIMIT $1""",
        limit,
    )
    recent_signups = await fetch_all(
        """SELECT rs.id, rs.created_at,
                  rs.referrer_user_id, ru.username AS referrer_username, ru.first_name AS referrer_name,
                  rs.referred_user_id, du.username AS referred_username, du.first_name AS referred_name,
                  EXISTS(SELECT 1 FROM referral_earnings re WHERE re.referred_user_id = rs.referred_user_id) AS has_paid
           FROM referral_signups rs
           LEFT JOIN users ru ON ru.id = rs.referrer_user_id
           LEFT JOIN users du ON du.id = rs.referred_user_id
           ORDER BY rs.created_at DESC
           LIMIT $1""",
        limit,
    )
    totals = await fetch_one(
        """SELECT
             (SELECT COUNT(*) FROM referral_signups) AS total_signups,
             (SELECT COUNT(*) FROM referral_links) AS total_links,
             (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_earnings)::float AS total_paid_out,
             (SELECT COUNT(DISTINCT referred_user_id) FROM referral_earnings) AS converted_signups"""
    )
    return {
        "success": True,
        "top_referrers": [dict(r) for r in top_referrers],
        "recent_signups": [dict(r) for r in recent_signups],
        "totals": dict(totals) if totals else {},
    }


@router.get("/funnel/registrations")
async def admin_registration_funnel(
    days: int = Query(30, ge=1, le=365),
    admin: Dict = Depends(get_current_admin),
):
    """Воронка пользователей за последние N дней:
    1) Регистрация (users.created_at)
    2) Подключили канал (есть запись в channels)
    3) Оплатили тариф (есть paid в billing_payments)
    4) Активны сейчас (channel_billing.status='active')
    """
    rows = await fetch_one(
        f"""WITH recent_users AS (
              SELECT id FROM users WHERE created_at >= NOW() - INTERVAL '{int(days)} days'
            )
            SELECT
              (SELECT COUNT(*) FROM recent_users) AS step_register,
              (SELECT COUNT(DISTINCT u.id) FROM recent_users u
                 JOIN channels c ON c.user_id = u.id) AS step_channel,
              (SELECT COUNT(DISTINCT u.id) FROM recent_users u
                 JOIN channels c ON c.user_id = u.id
                 JOIN channel_billing cb ON cb.channel_id = c.id
                 JOIN billing_payments bp ON bp.channel_billing_id = cb.id
                 WHERE bp.status = 'paid') AS step_paid,
              (SELECT COUNT(DISTINCT u.id) FROM recent_users u
                 JOIN channels c ON c.user_id = u.id
                 JOIN channel_billing cb ON cb.channel_id = c.id
                 WHERE cb.status = 'active' AND cb.expires_at > NOW()) AS step_active"""
    )
    by_day = await fetch_all(
        f"""SELECT DATE(created_at)::TEXT AS day, COUNT(*)::int AS n
            FROM users
            WHERE created_at >= NOW() - INTERVAL '{int(days)} days'
            GROUP BY DATE(created_at) ORDER BY day"""
    )
    s_reg = (rows.get("step_register") if rows else 0) or 0
    s_ch  = (rows.get("step_channel") if rows else 0) or 0
    s_paid = (rows.get("step_paid") if rows else 0) or 0
    s_act = (rows.get("step_active") if rows else 0) or 0
    pct = lambda a, b: round(a * 100 / b, 1) if b else 0
    funnel = [
        {"key": "register", "label": "Регистрации",        "count": s_reg,  "pct_of_prev": 100, "pct_of_total": 100},
        {"key": "channel",  "label": "Подключили канал",    "count": s_ch,   "pct_of_prev": pct(s_ch, s_reg),  "pct_of_total": pct(s_ch, s_reg)},
        {"key": "paid",     "label": "Оплатили тариф",      "count": s_paid, "pct_of_prev": pct(s_paid, s_ch), "pct_of_total": pct(s_paid, s_reg)},
        {"key": "active",   "label": "Активны сейчас",      "count": s_act,  "pct_of_prev": pct(s_act, s_paid), "pct_of_total": pct(s_act, s_reg)},
    ]
    return {
        "success": True,
        "days": days,
        "funnel": funnel,
        "by_day": [{"day": r["day"], "n": int(r.get("n") or 0)} for r in by_day],
    }


@router.get("/action-log")
async def admin_action_log_list(
    limit: int = Query(100, ge=1, le=500),
    admin_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    admin: Dict = Depends(get_current_admin),
):
    """Лог действий админов с фильтрами."""
    conds, params = [], []
    if admin_id is not None:
        params.append(int(admin_id))
        conds.append(f"admin_id = ${len(params)}")
    if target_type:
        params.append(target_type)
        conds.append(f"target_type = ${len(params)}")
    if target_id is not None:
        params.append(int(target_id))
        conds.append(f"target_id = ${len(params)}")
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    params.append(int(limit))
    rows = await fetch_all(
        f"""SELECT id, admin_id, admin_username, action, target_type, target_id, payload, created_at
            FROM admin_action_log {where}
            ORDER BY created_at DESC LIMIT ${len(params)}""",
        *params,
    )
    items = []
    for r in rows:
        p = r.get("payload")
        if isinstance(p, str):
            try: p = json.loads(p)
            except Exception: p = {}
        items.append({
            "id": r["id"],
            "admin_id": r.get("admin_id"),
            "admin_username": r.get("admin_username") or "?",
            "action": r.get("action"),
            "target_type": r.get("target_type"),
            "target_id": r.get("target_id"),
            "payload": p or {},
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"success": True, "items": items}


@router.get("/users/{user_id}/referrals")
async def user_referrals(user_id: int, admin: Dict = Depends(get_current_admin)):
    # Links
    links = await fetch_all("SELECT * FROM referral_links WHERE user_id = $1 ORDER BY created_at", user_id)
    # Signups
    signups = await fetch_all(
        """SELECT rs.*, u.first_name as referred_name, u.username as referred_username, u.created_at as user_created
           FROM referral_signups rs
           LEFT JOIN users u ON u.id = rs.referred_user_id
           WHERE rs.referrer_user_id = $1 ORDER BY rs.created_at DESC""",
        user_id,
    )
    # Earnings
    earnings = await fetch_all(
        "SELECT * FROM referral_earnings WHERE referrer_user_id = $1 ORDER BY created_at DESC LIMIT 50",
        user_id,
    )
    # Balance
    user = await fetch_one("SELECT referral_balance FROM users WHERE id = $1", user_id)
    return {
        "success": True,
        "links": links,
        "signups": signups,
        "earnings": earnings,
        "balance": float(user.get("referral_balance", 0)) if user else 0,
    }


@router.put("/users/{user_id}/extend-tariff")
async def extend_tariff(user_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    """Корректировка expires_at канала. Принимает либо months (старое API),
    либо days (новое — может быть отрицательным для уменьшения срока).
    """
    body = await request.json()
    channel_id = body.get("channel_id")
    if not channel_id:
        raise HTTPException(status_code=400, detail="channel_id обязателен")

    days = body.get("days")
    if days is None:
        # Обратная совместимость: months → days
        months = int(body.get("months", 1))
        days = 30 * months
    days = int(days)
    if days == 0:
        raise HTTPException(status_code=400, detail="Укажите ненулевое значение")
    reason = (body.get("reason") or "").strip() or "Корректировка админом"

    channel = await fetch_one("SELECT * FROM channels WHERE id = $1 AND user_id = $2", channel_id, user_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    billing = await fetch_one("SELECT * FROM channel_billing WHERE channel_id = $1", channel_id)
    before_expires = None
    if not billing:
        if days < 0:
            raise HTTPException(status_code=400, detail="У канала ещё нет подписки — нечего сокращать")
        new_expires = datetime.utcnow() + timedelta(days=days)
        await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, status, expires_at, max_users) VALUES ($1,'paid','active',$2,1) RETURNING id",
            channel_id, new_expires,
        )
    else:
        before_expires = billing["expires_at"]
        base = before_expires if before_expires and before_expires > datetime.utcnow() else datetime.utcnow()
        new_expires = base + timedelta(days=days)
        # Если уменьшение делает дату меньше "сейчас" — статус становится expired
        new_status = "active" if new_expires > datetime.utcnow() else "expired"
        await execute(
            "UPDATE channel_billing SET status = $1, expires_at = $2 WHERE channel_id = $3",
            new_status, new_expires, channel_id,
        )
    await log_admin_action(
        admin, "billing_adjust", "channel", int(channel_id),
        {
            "user_id": user_id,
            "channel_title": channel.get("title"),
            "before": before_expires.isoformat() if before_expires and hasattr(before_expires, 'isoformat') else None,
            "after": new_expires.isoformat(),
            "delta_days": days,
            "reason": reason,
        },
    )
    return {"success": True, "expires_at": new_expires.isoformat(), "delta_days": days}


@router.delete("/users/{user_id}/pins/{pin_id}")
async def delete_user_pin(user_id: int, pin_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM pin_posts WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        pin_id, user_id,
    )
    return {"success": True}


@router.put("/users/{user_id}/pins/{pin_id}")
async def edit_user_pin(user_id: int, pin_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "button_type", "lm_button_text"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([pin_id, user_id])
    await execute(
        f"UPDATE pin_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id IN (SELECT id FROM channels WHERE user_id = ${idx+1})",
        *params,
    )
    return {"success": True}


@router.delete("/users/{user_id}/broadcasts/{broadcast_id}")
async def delete_user_broadcast(user_id: int, broadcast_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM broadcasts WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        broadcast_id, user_id,
    )
    return {"success": True}


@router.delete("/users/{user_id}/giveaways/{giveaway_id}")
async def delete_user_giveaway(user_id: int, giveaway_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM giveaways WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        giveaway_id, user_id,
    )
    return {"success": True}


@router.put("/users/{user_id}/giveaways/{giveaway_id}")
async def edit_user_giveaway(user_id: int, giveaway_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "prizes", "conditions", "legal_info", "status", "winner_count"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([giveaway_id, user_id])
    await execute(
        f"UPDATE giveaways SET {', '.join(fields)} WHERE id = ${idx} AND channel_id IN (SELECT id FROM channels WHERE user_id = ${idx+1})",
        *params,
    )
    return {"success": True}


@router.delete("/users/{user_id}/lead-magnets/{lm_id}")
async def delete_user_lead_magnet(user_id: int, lm_id: int, admin: Dict = Depends(get_current_admin)):
    await execute(
        "DELETE FROM lead_magnets WHERE id = $1 AND channel_id IN (SELECT id FROM channels WHERE user_id = $2)",
        lm_id, user_id,
    )
    return {"success": True}


# ===========================
# Channels
# ===========================

@router.get("/channels")
async def list_channels(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    platform: str = Query(""),
    billing_status: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    """Список каналов с фильтрами:
    - search: по title/username/owner email/owner name
    - platform: 'max'/'telegram'
    - billing_status: 'active' | 'expired' | 'trial' | 'none' (нет записи в channel_billing)
    """
    offset = (page - 1) * limit
    conditions = []
    params = []
    idx = 1

    join_billing = "LEFT JOIN channel_billing cb ON cb.channel_id = c.id"

    if search:
        conditions.append(f"(c.title ILIKE ${idx} OR c.username ILIKE ${idx} OR u.email ILIKE ${idx} OR u.first_name ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1
    if platform:
        conditions.append(f"c.platform = ${idx}")
        params.append(platform)
        idx += 1
    if billing_status:
        if billing_status == "none":
            conditions.append("cb.id IS NULL")
        else:
            conditions.append(f"cb.status = ${idx}")
            params.append(billing_status)
            idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = await fetch_one(
        f"""SELECT COUNT(*) as c FROM channels c
            LEFT JOIN users u ON u.id = c.user_id
            {join_billing} {where}""",
        *params,
    )
    params.extend([limit, offset])
    rows = await fetch_all(
        f"""SELECT c.*, u.username as owner_username, u.first_name as owner_name,
                   u.email as owner_email,
                   cb.status as billing_status, cb.expires_at as billing_expires,
                   cb.max_users as billing_max_users, cb.plan as billing_plan
            FROM channels c
            LEFT JOIN users u ON u.id = c.user_id
            {join_billing}
            {where} ORDER BY c.created_at DESC LIMIT ${idx} OFFSET ${idx+1}""",
        *params,
    )
    return {"success": True, "channels": rows, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.put("/channels/{channel_id}/billing-status")
async def admin_set_billing_status(
    channel_id: int, request: Request,
    admin: Dict = Depends(get_current_admin),
):
    """Заморозка / разморозка / отметить как trial для канала."""
    body = await request.json()
    new_status = (body.get("status") or "").strip()
    reason = (body.get("reason") or "").strip() or "Изменение статуса админом"
    if new_status not in ("active", "expired", "trial", "frozen"):
        raise HTTPException(status_code=400, detail="status: active|expired|trial|frozen")
    ch = await fetch_one("SELECT id, title FROM channels WHERE id = $1", channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    billing = await fetch_one("SELECT id, status FROM channel_billing WHERE channel_id = $1", channel_id)
    if billing:
        before = billing.get("status")
        await execute("UPDATE channel_billing SET status = $1 WHERE id = $2", new_status, billing["id"])
    else:
        before = None
        await execute_returning_id(
            "INSERT INTO channel_billing (channel_id, plan, status, max_users) VALUES ($1, 'paid', $2, 1) RETURNING id",
            channel_id, new_status,
        )
    await log_admin_action(
        admin, "channel_status_change", "channel", channel_id,
        {"channel_title": ch.get("title"), "before": before, "after": new_status, "reason": reason},
    )
    return {"success": True, "before": before, "after": new_status}


@router.delete("/channels/{channel_id}")
async def admin_delete_channel(
    channel_id: int, request: Request,
    admin: Dict = Depends(get_current_admin),
):
    """Удалить канал (каскадно — биллинг/контент уйдут по FK ON DELETE CASCADE)."""
    body = {}
    try: body = await request.json()
    except Exception: pass
    reason = (body.get("reason") or "").strip() or "Удаление админом"
    ch = await fetch_one("SELECT id, title FROM channels WHERE id = $1", channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM channels WHERE id = $1", channel_id)
    await log_admin_action(
        admin, "channel_delete", "channel", channel_id,
        {"channel_title": ch.get("title"), "reason": reason},
    )
    return {"success": True}


@router.get("/channels/{channel_id}")
async def get_channel(channel_id: int, admin: Dict = Depends(get_current_admin)):
    ch = await fetch_one(
        """SELECT c.*, u.username as owner_username, u.first_name as owner_name, u.id as owner_id,
                  cb.status as billing_status, cb.expires_at as billing_expires, cb.max_users
           FROM channels c LEFT JOIN users u ON u.id = c.user_id
           LEFT JOIN channel_billing cb ON cb.channel_id = c.id
           WHERE c.id = $1""",
        channel_id,
    )
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")

    staff = await fetch_all(
        """SELECT cs.*, u.username, u.first_name, u.telegram_id
           FROM channel_staff cs JOIN users u ON u.id = cs.user_id
           WHERE cs.channel_id = $1""",
        channel_id,
    )
    return {"success": True, "channel": ch, "staff": staff}


def _strip_binary(rows):
    """Remove binary fields (file_data etc.) from query results for JSON serialization."""
    clean = []
    for row in rows:
        clean.append({k: v for k, v in row.items() if not isinstance(v, (bytes, bytearray, memoryview))})
    return clean


@router.get("/channels/{channel_id}/pins")
async def channel_pins(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM pin_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "pins": _strip_binary(rows)}


@router.get("/channels/{channel_id}/lead-magnets")
async def channel_lead_magnets(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM lead_magnets WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "leadMagnets": _strip_binary(rows)}


@router.get("/channels/{channel_id}/content")
async def channel_content(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM content_posts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "posts": _strip_binary(rows)}


@router.get("/channels/{channel_id}/giveaways")
async def channel_giveaways(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "giveaways": _strip_binary(rows)}


@router.get("/channels/{channel_id}/links")
async def channel_links(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM tracking_links WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "links": rows}


@router.put("/channels/{channel_id}/links/{link_id}")
async def edit_channel_link(channel_id: int, link_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "is_paused"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([link_id, channel_id])
    await execute(
        f"UPDATE tracking_links SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
        *params,
    )
    return {"success": True}


@router.delete("/channels/{channel_id}/links/{link_id}")
async def delete_channel_link(channel_id: int, link_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM tracking_links WHERE id = $1 AND channel_id = $2", link_id, channel_id)
    return {"success": True}


@router.get("/channels/{channel_id}/broadcasts")
async def channel_broadcasts(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM broadcasts WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
    return {"success": True, "broadcasts": _strip_binary(rows)}


@router.get("/channels/{channel_id}/comments")
async def channel_comments(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        rows = await fetch_all("SELECT * FROM comments WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100", channel_id)
    except Exception:
        rows = []
    return {"success": True, "comments": rows}


@router.get("/channels/{channel_id}/paid-chats")
async def channel_paid_chats(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        chats = await fetch_all("SELECT * FROM paid_chats WHERE channel_id = $1 ORDER BY created_at DESC", channel_id)
        members = await fetch_all(
            """SELECT pcm.*, pc.title as chat_title FROM paid_chat_members pcm
               JOIN paid_chats pc ON pc.id = pcm.paid_chat_id
               WHERE pc.channel_id = $1 ORDER BY pcm.joined_at DESC LIMIT 100""",
            channel_id,
        )
        posts = await fetch_all(
            """SELECT pcp.*, pc.title as chat_title FROM paid_chat_posts pcp
               JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               WHERE pc.channel_id = $1 ORDER BY pcp.created_at DESC LIMIT 100""",
            channel_id,
        )
    except Exception:
        chats, members, posts = [], [], []

    # Payment settings
    try:
        payment_settings = await fetch_all(
            "SELECT * FROM paid_chat_payment_settings WHERE channel_id = $1",
            channel_id,
        )
    except Exception:
        payment_settings = []

    # Plans
    try:
        plans = await fetch_all(
            "SELECT * FROM paid_chat_plans WHERE channel_id = $1 ORDER BY sort_order, created_at",
            channel_id,
        )
    except Exception:
        plans = []

    # Payments (recent 100)
    try:
        payments = await fetch_all(
            """SELECT pcp.*, pc.title as chat_title, pp.title as plan_title
               FROM paid_chat_payments pcp
               LEFT JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               LEFT JOIN paid_chat_plans pp ON pp.id = pcp.plan_id
               WHERE pcp.channel_id = $1 ORDER BY pcp.created_at DESC LIMIT 100""",
            channel_id,
        )
    except Exception:
        payments = []

    return {
        "success": True,
        "chats": _strip_binary(chats),
        "members": _strip_binary(members),
        "posts": _strip_binary(posts),
        "payment_settings": payment_settings,
        "plans": plans,
        "payments": _strip_binary(payments),
    }


@router.get("/channels/{channel_id}/funnels")
async def channel_funnels(channel_id: int, admin: Dict = Depends(get_current_admin)):
    try:
        rows = await fetch_all("SELECT * FROM funnel_steps WHERE channel_id = $1 ORDER BY step_order", channel_id)
    except Exception:
        rows = []
    return {"success": True, "funnels": rows}


@router.get("/channels/{channel_id}/subscribers")
async def channel_subscribers(channel_id: int, admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT s.*, u.username, u.first_name FROM subscriptions s
           LEFT JOIN users u ON u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id
           WHERE s.channel_id = $1 ORDER BY s.subscribed_at DESC LIMIT 200""",
        channel_id,
    )
    return {"success": True, "subscribers": rows}


# ─── Channel content CRUD (admin editing) ───

@router.put("/channels/{channel_id}/pins/{item_id}")
async def edit_channel_pin(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "erid"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE pin_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/pins/{item_id}")
async def delete_channel_pin(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM pin_posts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/content/{item_id}")
async def edit_channel_content(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "scheduled_at", "erid"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE content_posts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/content/{item_id}")
async def delete_channel_content(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM content_posts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/broadcasts/{item_id}")
async def edit_channel_broadcast(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE broadcasts SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/broadcasts/{item_id}")
async def delete_channel_broadcast(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM broadcasts WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/giveaways/{item_id}")
async def edit_channel_giveaway(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "status", "erid", "legal_info"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE giveaways SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/giveaways/{item_id}")
async def delete_channel_giveaway(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM giveaways WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.put("/channels/{channel_id}/lead-magnets/{item_id}")
async def edit_channel_lm(channel_id: int, item_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "name", "message_text"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([item_id, channel_id])
    await execute(f"UPDATE lead_magnets SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/channels/{channel_id}/lead-magnets/{item_id}")
async def delete_channel_lm(channel_id: int, item_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM lead_magnets WHERE id = $1 AND channel_id = $2", item_id, channel_id)
    return {"success": True}


@router.get("/channels/{channel_id}/logs")
async def channel_logs(channel_id: int, admin: Dict = Depends(get_current_admin)):
    """Activity log for channel: visits, clicks, subscriptions."""
    logs = []

    # Visits
    try:
        visits = await fetch_all(
            """SELECT v.id, v.ip_address, v.user_agent, v.platform, v.visited_at as created_at,
                      v.username, v.first_name, tl.name as link_name, tl.short_code
               FROM visits v LEFT JOIN tracking_links tl ON tl.id = v.tracking_link_id
               WHERE v.channel_id = $1 ORDER BY v.visited_at DESC LIMIT 200""",
            channel_id,
        )
        for v in visits:
            logs.append({**v, "type": "visit", "text": f"Визит: {v.get('first_name') or v.get('username') or v.get('ip_address') or '—'} → {v.get('link_name') or v.get('short_code') or '—'}"})
    except Exception:
        pass

    # Subscriptions
    try:
        subs = await fetch_all(
            """SELECT s.id, s.telegram_id, s.max_user_id, s.username, s.first_name,
                      s.platform, s.subscribed_at as created_at
               FROM subscriptions s WHERE s.channel_id = $1 ORDER BY s.subscribed_at DESC LIMIT 200""",
            channel_id,
        )
        for s in subs:
            logs.append({**s, "type": "subscription", "text": f"Подписка: {s.get('first_name') or s.get('username') or s.get('telegram_id') or s.get('max_user_id') or '—'}"})
    except Exception:
        pass

    # Pins
    try:
        pins = await fetch_all(
            "SELECT id, title, status, published_at, created_at FROM pin_posts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for p in pins:
            dt = p.get("published_at") or p.get("created_at")
            logs.append({"type": "pin", "text": f"Закреп: {p.get('title') or '—'} [{p.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Broadcasts
    try:
        broads = await fetch_all(
            "SELECT id, title, status, sent_at, created_at FROM broadcasts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for b in broads:
            dt = b.get("sent_at") or b.get("created_at")
            logs.append({"type": "broadcast", "text": f"Рассылка: {b.get('title') or '—'} [{b.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Content posts
    try:
        posts = await fetch_all(
            "SELECT id, title, status, published_at, created_at FROM content_posts WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 100",
            channel_id,
        )
        for p in posts:
            dt = p.get("published_at") or p.get("created_at")
            logs.append({"type": "post", "text": f"Публикация: {p.get('title') or '—'} [{p.get('status')}]", "created_at": dt})
    except Exception:
        pass

    # Giveaways
    try:
        gives = await fetch_all(
            "SELECT id, title, status, created_at FROM giveaways WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 50",
            channel_id,
        )
        for g in gives:
            logs.append({"type": "giveaway", "text": f"Розыгрыш: {g.get('title') or '—'} [{g.get('status')}]", "created_at": g.get("created_at")})
    except Exception:
        pass

    # Lead magnets delivered (leads)
    try:
        leads = await fetch_all(
            """SELECT l.id, l.created_at, lm.title as lm_title, l.username, l.first_name
               FROM leads l LEFT JOIN lead_magnets lm ON lm.id = l.lead_magnet_id
               WHERE l.channel_id = $1 ORDER BY l.created_at DESC LIMIT 100""",
            channel_id,
        )
        for l in leads:
            name = l.get("first_name") or l.get("username") or "—"
            logs.append({"type": "lead", "text": f"Лид-магнит: {l.get('lm_title') or '—'} → {name}", "created_at": l.get("created_at")})
    except Exception:
        pass

    # Sort by date desc
    logs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"success": True, "logs": logs[:500]}


# ===========================
# Subscribers
# ===========================

@router.get("/subscribers")
async def list_subscribers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    admin: Dict = Depends(get_current_admin),
):
    offset = (page - 1) * limit
    if search:
        like = f"%{search}%"
        total = await fetch_one(
            """SELECT COUNT(*) as c FROM subscriptions s
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               WHERE CAST(s.telegram_id AS TEXT) LIKE $1 OR s.max_user_id ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1""",
            like,
        )
        rows = await fetch_all(
            """SELECT s.*, c.title as channel_title, c.platform,
                      u.username, u.first_name
               FROM subscriptions s
               JOIN channels c ON c.id = s.channel_id
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               WHERE CAST(s.telegram_id AS TEXT) LIKE $1 OR s.max_user_id ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1
               ORDER BY s.subscribed_at DESC LIMIT $2 OFFSET $3""",
            like, limit, offset,
        )
    else:
        total = await fetch_one("SELECT COUNT(*) as c FROM subscriptions")
        rows = await fetch_all(
            """SELECT s.*, c.title as channel_title, c.platform,
                      u.username, u.first_name
               FROM subscriptions s
               JOIN channels c ON c.id = s.channel_id
               LEFT JOIN users u ON (u.telegram_id = s.telegram_id OR u.max_user_id = s.max_user_id)
               ORDER BY s.subscribed_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
    return {"success": True, "subscribers": rows, "total": total["c"] if total else 0, "page": page, "limit": limit}


@router.get("/subscribers/{identifier}")
async def get_subscriber(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE username = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    subs = await fetch_all(
        """SELECT s.*, c.title as channel_title, c.platform
           FROM subscriptions s JOIN channels c ON c.id = s.channel_id
           WHERE s.telegram_id = $1 OR s.max_user_id = $2
           ORDER BY s.subscribed_at DESC""",
        user.get("telegram_id"), user.get("max_user_id"),
    )
    return {"success": True, "user": user, "subscriptions": subs}


@router.get("/subscribers/{identifier}/channels")
async def subscriber_channels(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    channels = await fetch_all(
        """SELECT DISTINCT c.*, s.subscribed_at
           FROM subscriptions s JOIN channels c ON c.id = s.channel_id
           WHERE s.telegram_id = $1 OR s.max_user_id = $2
           ORDER BY s.subscribed_at DESC""",
        user.get("telegram_id"), user.get("max_user_id"),
    )
    return {"success": True, "channels": channels}


@router.get("/subscribers/{identifier}/dialog")
async def subscriber_dialog(identifier: str, admin: Dict = Depends(get_current_admin)):
    user = None
    if identifier.isdigit():
        user = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", int(identifier))
    if not user:
        user = await fetch_one("SELECT * FROM users WHERE max_user_id = $1", identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Подписчик не найден")

    messages = await fetch_all(
        "SELECT * FROM bot_message_log WHERE user_id = $1 ORDER BY created_at ASC LIMIT 500",
        user["id"],
    )
    return {"success": True, "messages": messages}


@router.delete("/subscribers/{identifier}/dialog/{message_id}")
async def delete_dialog_message(identifier: str, message_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM bot_message_log WHERE id = $1", message_id)
    return {"success": True}


# ===========================
# Admin panel admins (superadmin only)
# ===========================

@router.get("/admins")
async def list_admins(admin: Dict = Depends(require_superadmin)):
    rows = await fetch_all(
        """SELECT a.id, a.username, a.display_name, a.role, a.is_active,
                  a.last_login_at, a.created_at, a.user_pkid,
                  u.first_name AS pkid_first_name, u.username AS pkid_username,
                  u.max_user_id AS pkid_max_user_id, u.telegram_id AS pkid_telegram_id
           FROM admin_users a
           LEFT JOIN users u ON u.id = a.user_pkid
           ORDER BY a.created_at"""
    )
    return {"success": True, "admins": [dict(r) for r in rows]}


@router.post("/admins")
async def create_admin(request: Request, admin: Dict = Depends(require_superadmin)):
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    display_name = body.get("display_name", "")
    role = body.get("role", "admin")
    user_pkid_raw = body.get("user_pkid")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username и password обязательны")
    if role not in ("superadmin", "admin", "viewer"):
        raise HTTPException(status_code=400, detail="Неизвестная роль")
    existing = await fetch_one("SELECT id FROM admin_users WHERE username = $1", username)
    if existing:
        raise HTTPException(status_code=400, detail="Username уже занят")
    user_pkid = None
    if user_pkid_raw:
        try:
            user_pkid = int(user_pkid_raw)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="PKid должен быть числом")
        u = await fetch_one("SELECT id FROM users WHERE id = $1", user_pkid)
        if not u:
            raise HTTPException(status_code=400, detail=f"Пользователь PKid={user_pkid} не найден")
    pw_hash = hash_password(password)
    aid = await execute_returning_id(
        "INSERT INTO admin_users (username, password_hash, display_name, role, user_pkid) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        username, pw_hash, display_name, role, user_pkid,
    )
    return {"success": True, "adminId": aid}


@router.put("/admins/{admin_id}")
async def update_admin(admin_id: int, request: Request, admin: Dict = Depends(require_superadmin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("display_name", "role", "is_active"):
        if key in body:
            if key == "role" and body[key] not in ("superadmin", "admin", "viewer"):
                raise HTTPException(status_code=400, detail="Неизвестная роль")
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "user_pkid" in body:
        upk = body["user_pkid"]
        if upk in ("", None):
            user_pkid = None
        else:
            try: user_pkid = int(upk)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="PKid должен быть числом")
            u = await fetch_one("SELECT id FROM users WHERE id = $1", user_pkid)
            if not u:
                raise HTTPException(status_code=400, detail=f"Пользователь PKid={user_pkid} не найден")
        fields.append(f"user_pkid = ${idx}")
        params.append(user_pkid)
        idx += 1
    if "password" in body and body["password"]:
        fields.append(f"password_hash = ${idx}")
        params.append(hash_password(body["password"]))
        idx += 1
    if not fields:
        return {"success": True}
    params.append(admin_id)
    await execute(f"UPDATE admin_users SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: int, admin: Dict = Depends(require_superadmin)):
    if admin_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    await execute("DELETE FROM admin_users WHERE id = $1", admin_id)
    return {"success": True}


# ===========================
# Tariffs
# ===========================

@router.get("/tariffs")
async def list_tariffs(admin: Dict = Depends(get_current_admin)):
    tariffs = await fetch_all("SELECT * FROM tariffs ORDER BY months ASC")
    return {"success": True, "tariffs": tariffs}


@router.put("/tariffs/{tariff_id}")
async def update_tariff(tariff_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    price = body.get("price")
    label = body.get("label")
    is_active = body.get("is_active")

    if price is not None and (not isinstance(price, (int, float)) or price < 0):
        raise HTTPException(status_code=400, detail="Некорректная цена")

    fields = []
    params = []
    idx = 1
    if price is not None:
        fields.append(f"price = ${idx}")
        params.append(int(price))
        idx += 1
    if label is not None:
        fields.append(f"label = ${idx}")
        params.append(label)
        idx += 1
    if is_active is not None:
        fields.append(f"is_active = ${idx}")
        params.append(bool(is_active))
        idx += 1

    if not fields:
        return {"success": True}

    fields.append(f"updated_at = NOW()")
    params.append(tariff_id)
    await execute(f"UPDATE tariffs SET {', '.join(fields)} WHERE id = ${idx}", *params)
    tariff = await fetch_one("SELECT * FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True, "tariff": tariff}


@router.post("/tariffs")
async def create_tariff(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    months = body.get("months")
    label = body.get("label")
    price = body.get("price")

    if not months or not label or price is None:
        raise HTTPException(status_code=400, detail="months, label и price обязательны")

    tariff_id = await execute_returning_id(
        "INSERT INTO tariffs (months, label, price) VALUES ($1, $2, $3) RETURNING id",
        int(months), label, int(price),
    )
    tariff = await fetch_one("SELECT * FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True, "tariff": tariff}


@router.delete("/tariffs/{tariff_id}")
async def delete_tariff(tariff_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM tariffs WHERE id = $1", tariff_id)
    return {"success": True}


# ===========================
# Finance
# ===========================

@router.get("/finance")
async def finance_overview(
    admin: Dict = Depends(get_current_admin),
    period: str = "30d",
):
    """Get all payments for the given period."""
    days = {"7d": 7, "14d": 14, "30d": 30, "90d": 90, "365d": 365}.get(period, 30)

    # Billing payments (service subscriptions)
    billing = await fetch_all(
        """SELECT bp.id, bp.amount, bp.currency, bp.status, bp.payment_id, bp.created_at,
                  cb.channel_id, c.title as channel_title, u.username as user_username, u.first_name as user_name
           FROM billing_payments bp
           LEFT JOIN channel_billing cb ON cb.id = bp.channel_billing_id
           LEFT JOIN channels c ON c.id = cb.channel_id
           LEFT JOIN users u ON u.id = c.user_id
           WHERE bp.created_at > NOW() - INTERVAL '%s days'
           ORDER BY bp.created_at DESC""" % days,
    )

    # Paid chat payments
    try:
        paid_chat = await fetch_all(
            """SELECT pcp.id, pcp.amount, pcp.currency, pcp.status, pcp.payment_id, pcp.created_at,
                      pc.title as chat_title, c.title as channel_title
               FROM paid_chat_payments pcp
               LEFT JOIN paid_chats pc ON pc.id = pcp.paid_chat_id
               LEFT JOIN channels c ON c.id = pc.channel_id
               WHERE pcp.created_at > NOW() - INTERVAL '%s days'
               ORDER BY pcp.created_at DESC""" % days,
        )
    except Exception:
        paid_chat = []

    # AI Token purchases
    try:
        token_purchases = await fetch_all(
            """SELECT atp.id, atp.tokens, atp.amount, atp.payment_status, atp.paid_at, atp.created_at,
                      u.username as user_username, u.first_name as user_name
               FROM ai_token_purchases atp
               LEFT JOIN users u ON u.id = atp.user_id
               WHERE atp.created_at > NOW() - INTERVAL '%s days'
               ORDER BY atp.created_at DESC""" % days,
        )
    except Exception:
        token_purchases = []

    # Totals
    total_billing = sum(float(p.get("amount", 0)) for p in billing if p.get("status") == "paid")
    total_paid_chat = sum(float(p.get("amount", 0)) for p in paid_chat if p.get("status") in ("paid", "success", "completed"))
    total_ai_tokens = sum(float(p.get("amount", 0)) for p in token_purchases if p.get("payment_status") == "paid")
    pending_billing = sum(float(p.get("amount", 0)) for p in billing if p.get("status") == "pending")

    return {
        "success": True,
        "billing_payments": billing,
        "paid_chat_payments": paid_chat,
        "token_purchases": token_purchases,
        "totals": {
            "billing": total_billing,
            "paid_chat": total_paid_chat,
            "ai_tokens": total_ai_tokens,
            "total": total_billing + total_paid_chat + total_ai_tokens,
            "pending": pending_billing,
        },
        "period": period,
    }


# ===========================
# AI Generations
# ===========================

@router.get("/generations")
async def admin_generations(admin: Dict = Depends(get_current_admin)):
    """Все ИИ генерации: дизайн, лендинги, использование токенов."""
    # Генерации дизайна
    try:
        design_sessions = await fetch_all(
            """SELECT ads.id, ads.status, ads.niche, ads.style, ads.regen_count,
                      ads.tokens_spent, ads.created_at, ads.updated_at,
                      u.username as user_username, u.first_name as user_name,
                      c.title as channel_title
               FROM ai_design_sessions ads
               LEFT JOIN users u ON u.id = ads.user_id
               LEFT JOIN channels c ON c.id = ads.channel_id
               ORDER BY ads.created_at DESC LIMIT 100""",
        )
    except Exception:
        design_sessions = []

    # Генерации лендингов
    try:
        landing_sessions = await fetch_all(
            """SELECT al.id, al.status, al.niche, al.design_style, al.regen_count,
                      al.tokens_spent, al.published, al.slug, al.created_at, al.updated_at,
                      u.username as user_username, u.first_name as user_name,
                      c.title as channel_title
               FROM ai_landings al
               LEFT JOIN users u ON u.id = al.user_id
               LEFT JOIN channels c ON c.id = al.channel_id
               ORDER BY al.created_at DESC LIMIT 100""",
        )
    except Exception:
        landing_sessions = []

    # Использование токенов (последние 100)
    try:
        usage = await fetch_all(
            """SELECT atu.id, atu.tokens_used, atu.action, atu.description, atu.created_at,
                      u.username as user_username, u.first_name as user_name
               FROM ai_token_usage atu
               LEFT JOIN users u ON u.id = atu.user_id
               ORDER BY atu.created_at DESC LIMIT 100""",
        )
    except Exception:
        usage = []

    # Сводка
    try:
        summary = await fetch_one(
            """SELECT
                 (SELECT COUNT(*) FROM ai_design_sessions) as total_designs,
                 (SELECT COUNT(*) FROM ai_landings) as total_landings,
                 (SELECT COALESCE(SUM(tokens_used), 0) FROM ai_token_usage) as total_tokens_used,
                 (SELECT COUNT(*) FROM ai_design_sessions WHERE status IN ('generating', 'generating_avatars')) as queue_designs,
                 (SELECT COUNT(*) FROM ai_landings WHERE status = 'draft') as queue_landings""",
        )
    except Exception:
        summary = {}

    return {
        "success": True,
        "design_sessions": design_sessions,
        "landing_sessions": landing_sessions,
        "usage": usage,
        "summary": dict(summary) if summary else {},
    }


# ===========================
# Landing Pages
# ===========================

@router.get("/landings")
async def list_landings(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all("SELECT * FROM landing_pages_v2 ORDER BY created_at")
    result = []
    for r in rows:
        d = dict(r)
        # Count users from this landing
        try:
            users_from = await fetch_one(
                "SELECT COUNT(*) as cnt FROM users WHERE source_landing = $1", r["slug"]
            )
            paid_from = await fetch_one(
                """SELECT COUNT(DISTINCT bp.id) as cnt, COALESCE(SUM(bp.amount), 0) as total
                   FROM billing_payments bp
                   JOIN channel_billing cb ON cb.id = bp.channel_billing_id
                   JOIN channels c ON c.id = cb.channel_id
                   JOIN users u ON u.id = c.user_id
                   WHERE u.source_landing = $1 AND bp.status = 'paid'""",
                r["slug"],
            )
            d["users_from_landing"] = users_from["cnt"] if users_from else 0
            d["payments_from_landing"] = paid_from["cnt"] if paid_from else 0
            d["revenue_from_landing"] = float(paid_from["total"]) if paid_from else 0
        except Exception:
            d["users_from_landing"] = 0
            d["payments_from_landing"] = 0
            d["revenue_from_landing"] = 0
        result.append(d)
    return {"success": True, "landings": result}


@router.put("/landings/{landing_id}")
async def update_landing(landing_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("title", "slug", "is_active", "ym_counter_id", "vk_pixel_id", "ym_goal_register", "ym_goal_payment"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(landing_id)
    await execute(f"UPDATE landing_pages_v2 SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@router.post("/landings")
async def create_landing(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    lid = await execute_returning_id(
        "INSERT INTO landing_pages_v2 (slug, title) VALUES ($1, $2) RETURNING id",
        body.get("slug", ""), body.get("title", ""),
    )
    return {"success": True, "id": lid}


@router.delete("/landings/{landing_id}")
async def delete_landing(landing_id: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM landing_pages_v2 WHERE id = $1", landing_id)
    return {"success": True}


@router.post("/landings/{landing_id}/track")
async def track_landing_event(landing_id: int, request: Request):
    """Public: track view/click on landing."""
    body = await request.json()
    event = body.get("event", "view")
    if event == "view":
        await execute("UPDATE landing_pages_v2 SET views_count = views_count + 1 WHERE id = $1", landing_id)
    elif event == "click":
        await execute("UPDATE landing_pages_v2 SET clicks_count = clicks_count + 1 WHERE id = $1", landing_id)
    elif event == "register":
        await execute("UPDATE landing_pages_v2 SET registrations_count = registrations_count + 1 WHERE id = $1", landing_id)
    return {"success": True}


@router.post("/fix-comment-buttons")
async def fix_comment_buttons(admin: Dict = Depends(get_current_admin)):
    """Update old comment buttons from startapp to direct URLs."""
    import json as _json
    from ..config import settings
    from ..services.max_api import get_max_api
    from ..services.messenger import html_to_max_markdown, build_max_inline_buttons

    max_api = get_max_api()
    results = []

    for table, post_type in [("pin_posts", "pin"), ("content_posts", "content")]:
        posts = await fetch_all(f"""
            SELECT p.id, p.channel_id, p.telegram_message_id, p.message_text, p.inline_buttons,
                   p.file_type, p.max_file_token, c.platform, c.max_chat_id
            FROM {table} p JOIN channels c ON c.id = p.channel_id
            WHERE p.status = 'published' AND p.telegram_message_id IS NOT NULL
              AND (p.inline_buttons LIKE '%comments%' OR p.inline_buttons LIKE '%startapp%')
        """)

        for post in posts:
            try:
                buttons = _json.loads(post["inline_buttons"]) if isinstance(post["inline_buttons"], str) else post["inline_buttons"]
                if not isinstance(buttons, list):
                    continue

                needs_update = False
                new_buttons = []
                for btn in buttons:
                    url = btn.get("url", "")
                    if btn.get("type") == "comments" or ("comments_" in url and "comments-app" in url):
                        # Restore startapp URL for MAX MiniApp
                        from ..routes.pins import _get_max_bot_link_id
                        bot_link_id = await _get_max_bot_link_id()
                        startapp_url = f"https://max.ru/id{bot_link_id}_bot?startapp=comments_{post_type}_{post['id']}"
                        new_buttons.append({"text": btn.get("text", "Комментарии"), "type": "link", "url": startapp_url})
                        needs_update = True
                    else:
                        new_buttons.append(btn)

                if not needs_update:
                    continue

                msg_id = post["telegram_message_id"]
                ok = False

                if post.get("platform") == "max" and msg_id and max_api:
                    max_text = html_to_max_markdown(post.get("message_text", ""))
                    max_btns = build_max_inline_buttons(_json.dumps(new_buttons))
                    attachments = None
                    if post.get("max_file_token"):
                        _m = {"photo": "image", "video": "video", "audio": "audio"}
                        attachments = [{"type": _m.get(post.get("file_type", "file"), "file"), "payload": {"token": post["max_file_token"]}}]
                    result = await max_api.edit_message(msg_id, max_text, attachments, max_btns)
                    ok = result.get("success", False)

                await execute(f"UPDATE {table} SET inline_buttons = $1 WHERE id = $2", _json.dumps(new_buttons), post["id"])
                results.append({"post_id": post["id"], "type": post_type, "updated_in_channel": ok})
            except Exception as e:
                results.append({"post_id": post["id"], "type": post_type, "error": str(e)})

    return {"success": True, "results": results}


# ===========================
# Support Tickets (Admin)
# ===========================

@router.get("/support/tickets")
async def admin_support_tickets(admin: Dict = Depends(get_current_admin), status: str = ""):
    """Список тикетов поддержки."""
    where = "WHERE 1=1"
    if status:
        where += f" AND st.status = '{status}'"

    rows = await fetch_all(
        f"""SELECT st.id, st.user_id, st.status, st.escalated, st.created_at, st.updated_at,
                   u.first_name as user_name, u.username as user_username,
                   (SELECT content FROM support_messages sm WHERE sm.ticket_id = st.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
                   (SELECT role FROM support_messages sm WHERE sm.ticket_id = st.id ORDER BY sm.created_at DESC LIMIT 1) as last_role,
                   (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id = st.id) as msg_count
            FROM support_tickets st
            LEFT JOIN users u ON u.id = st.user_id
            {where}
            ORDER BY st.updated_at DESC LIMIT 200""",
    )
    return {"success": True, "tickets": rows}


@router.get("/support/tickets/{ticket_id}")
async def admin_support_ticket_detail(ticket_id: int, admin: Dict = Depends(get_current_admin)):
    """Детали тикета с сообщениями."""
    ticket = await fetch_one(
        """SELECT st.*, u.first_name as user_name, u.username as user_username
           FROM support_tickets st LEFT JOIN users u ON u.id = st.user_id
           WHERE st.id = $1""",
        ticket_id,
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    messages = await fetch_all(
        "SELECT id, role, content, image_url, admin_id, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at",
        ticket_id,
    )
    return {"success": True, "ticket": ticket, "messages": messages}


@router.post("/support/tickets/{ticket_id}/reply")
async def admin_support_reply(ticket_id: int, request: Request, admin: Dict = Depends(get_current_admin)):
    """Ответ админа на тикет."""
    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Пустое сообщение")

    ticket = await fetch_one("SELECT id FROM support_tickets WHERE id=$1", ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    await execute(
        "INSERT INTO support_messages (ticket_id, role, content, admin_id) VALUES ($1, 'admin', $2, $3)",
        ticket_id, content, admin["id"],
    )
    # Оставляем escalated=TRUE — иначе следующий вопрос юзера снова уйдёт ИИ.
    # Status='answered' = «админ ответил, ждём пользователя».
    await execute(
        "UPDATE support_tickets SET status='answered', escalated=TRUE, updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    return {"success": True}


@router.post("/support/tickets/{ticket_id}/return-to-ai")
async def admin_return_to_ai(ticket_id: int, admin: Dict = Depends(get_current_admin)):
    """Вернуть тикет ИИ-ассистенту (пользователь снова получит автоответы)."""
    ticket = await fetch_one("SELECT id FROM support_tickets WHERE id=$1", ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    await execute(
        "UPDATE support_tickets SET status='ai', escalated=FALSE, updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    await execute(
        "INSERT INTO support_messages (ticket_id, role, content, admin_id) VALUES ($1, 'admin', $2, $3)",
        ticket_id, "Возвращаем диалог ИИ-ассистенту. Если возникнут вопросы — снова напишите, мы подключимся.", admin["id"],
    )
    return {"success": True}


@router.post("/support/tickets/{ticket_id}/close")
async def admin_close_ticket(ticket_id: int, admin: Dict = Depends(get_current_admin)):
    """Закрыть тикет."""
    await execute(
        "UPDATE support_tickets SET status='closed', updated_at=NOW() WHERE id=$1", ticket_id
    )
    return {"success": True}
