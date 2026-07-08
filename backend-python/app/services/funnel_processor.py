"""Background processors for funnels, broadcasts, content posts, automations, and abandoned carts."""
import asyncio
import json
from datetime import datetime
from typing import Optional

from ..database import fetch_all, fetch_one, execute, execute_returning_id


def _parse_date_value(val):
    """Convert date string to datetime for asyncpg TIMESTAMP comparison."""
    if not val or val == "":
        return None
    if isinstance(val, datetime):
        return val
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt)
        except (ValueError, TypeError):
            continue
    return None


_processor_tasks: list = []


def _parse_hhmm(s):
    try:
        h, m = (s or "10:00").split(":")
        return int(h) % 24, int(m) % 60
    except Exception:
        return 10, 0


# Все «человеческие» время в воронке — по МСК (UTC+3).
# В БД scheduled_at храним в UTC (как и NOW() postgres).
_MSK_OFFSET_HOURS = 3


def _compute_step_scheduled_at(prev_at_utc, step) -> "datetime":
    """Возвращает scheduled_at (naive UTC datetime) для шага воронки.

    prev_at_utc — момент предыдущего шага (или подписки для первого).
    Каждый шаг считается ОТ предыдущего, а не от подписки.

    Поддерживаемые типы delay_config:
      after_seconds — value секунд/минут/часов/дней после prev (без TZ).
      at_day_time   — через N полных дней в HH:MM (МСК) от prev. Если в
                      этот же день время уже прошло, +1 день.
      at_weekday_time — ближайший указанный день недели в HH:MM (МСК).
      at_exact_date — фиксированный момент (naive = МСК).

    Fallback на step.delay_minutes (число минут от prev).
    """
    from datetime import datetime as _dt, timedelta as _td
    import json as _json

    # Fallback: delay_minutes от UI (число минут от prev)
    fallback_minutes = int(step.get("delay_minutes", 60) or 60)
    target_utc = prev_at_utc + _td(minutes=fallback_minutes)

    delay_config = step.get("delay_config")
    if not delay_config:
        return target_utc

    try:
        cfg = _json.loads(delay_config) if isinstance(delay_config, str) else delay_config
        cfg_type = (cfg.get("type") or "after_seconds").lower()

        if cfg_type == "after_seconds":
            val = int(cfg.get("value", 60) or 60)
            unit = (cfg.get("unit") or "minutes").lower()
            mult = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)
            return prev_at_utc + _td(seconds=val * mult)

        if cfg_type == "at_day_time":
            days = int(cfg.get("days", 1) or 0)
            h, m = _parse_hhmm(cfg.get("time"))
            # Считаем в МСК: prev_msk + N дней с установкой времени
            prev_msk = prev_at_utc + _td(hours=_MSK_OFFSET_HOURS)
            target_msk = (prev_msk + _td(days=days)).replace(hour=h, minute=m, second=0, microsecond=0)
            # Если получилось в прошлом (или равно prev) — +1 день
            if target_msk <= prev_msk:
                target_msk += _td(days=1)
            return target_msk - _td(hours=_MSK_OFFSET_HOURS)

        if cfg_type == "at_weekday_time":
            weekday = int(cfg.get("weekday", 1) or 1)
            h, m = _parse_hhmm(cfg.get("time"))
            prev_msk = prev_at_utc + _td(hours=_MSK_OFFSET_HOURS)
            days_ahead = (weekday - prev_msk.weekday()) % 7
            target_msk = (prev_msk + _td(days=days_ahead)).replace(hour=h, minute=m, second=0, microsecond=0)
            if target_msk <= prev_msk:
                target_msk += _td(days=7)
            return target_msk - _td(hours=_MSK_OFFSET_HOURS)

        if cfg_type == "at_exact_date":
            dt_str = (cfg.get("datetime") or "").strip()
            if dt_str:
                try:
                    # ISO-парсинг. Поддерживаем Z и наивные значения (трактуем как МСК).
                    target = _dt.fromisoformat(dt_str.replace("Z", "+00:00"))
                    if target.tzinfo:
                        # Уже с TZ — конвертим в UTC
                        target_utc_aware = target.astimezone(__import__("datetime").timezone.utc)
                        return target_utc_aware.replace(tzinfo=None)
                    # naive → юзер вводил в datetime-local (это локальное время браузера,
                    # для русских юзеров обычно МСК). Считаем naive как МСК и -3ч.
                    return target - _td(hours=_MSK_OFFSET_HOURS)
                except Exception:
                    pass
    except Exception as e:
        print(f"[FunnelProcessor] delay_config parse error for step {step.get('id')}: {e}")

    return target_utc


async def schedule_funnel_for_lead(lead_id: int, lead_magnet_id: int, telegram_id=None, max_user_id=None, platform="telegram"):
    """Schedule funnel steps for a lead. Cancels any pending steps and reschedules from now."""
    from datetime import datetime as _dt

    # Remove all previous progress for this lead (pending + sent) to start fresh
    await execute(
        "DELETE FROM funnel_progress WHERE lead_id = $1",
        lead_id,
    )
    steps = await fetch_all(
        "SELECT * FROM funnel_steps WHERE lead_magnet_id = $1 AND is_active = 1 ORDER BY step_number",
        lead_magnet_id,
    )

    # prev_at_utc — для первого шага = подписка (now UTC), для последующих
    # = scheduled_at предыдущего шага. Так шаги «нанизываются» по времени
    # последовательно, а не все от подписки.
    prev_at_utc = _dt.utcnow()
    for step in steps:
        target_utc = _compute_step_scheduled_at(prev_at_utc, step)
        # Гарантируем что не уходим назад во времени (например, кто-то задал
        # at_exact_date в прошлом)
        if target_utc < prev_at_utc:
            target_utc = prev_at_utc
        await execute(
            """INSERT INTO funnel_progress (lead_id, funnel_step_id, telegram_id, max_user_id, platform, scheduled_at, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'pending')""",
            lead_id, step["id"], telegram_id, max_user_id, platform, target_utc,
        )
        prev_at_utc = target_utc
    if steps:
        print(f"[FunnelProcessor] Scheduled {len(steps)} steps for lead {lead_id}, lm {lead_magnet_id}")


async def process_pending_funnel_messages():
    """Send due funnel messages with concurrency."""
    pending = await fetch_all("""
        SELECT fp.*, fs.message_text, fs.file_path, fs.file_type, fs.telegram_file_id,
               fs.inline_buttons, fs.file_data, fs.attach_type, fs.max_file_token,
               l.telegram_id as lead_tg_id, l.max_user_id as lead_max_id,
               l.platform as lead_platform
        FROM funnel_progress fp
        JOIN funnel_steps fs ON fs.id = fp.funnel_step_id
        JOIN leads l ON l.id = fp.lead_id
        WHERE fp.status = 'pending' AND fp.scheduled_at <= NOW()
        ORDER BY fp.scheduled_at
        LIMIT 200
    """)
    if not pending:
        return
    from .messenger import send_to_user
    from .file_storage import ensure_file
    sem = asyncio.Semaphore(10)  # 10 concurrent sends

    async def _send_one(msg):
        async with sem:
            try:
                user_id = msg.get("lead_tg_id") or msg.get("lead_max_id")
                platform = msg.get("lead_platform", "telegram")
                if not user_id:
                    await execute("UPDATE funnel_progress SET status = 'failed' WHERE id = $1", msg["id"])
                    return
                msg_file_path = ensure_file(msg.get("file_path"), msg.get("file_data"))
                # Диагностический лог: если file_path/file_data был но
                # msg_file_path получился None — картинка гарантированно
                # не приложится, видно причину в prod-логах.
                if (msg.get("file_path") or msg.get("file_data")) and not msg_file_path:
                    print(f"[FunnelProcessor] step={msg.get('funnel_step_id')} progress={msg['id']} "
                          f"file_path='{msg.get('file_path')}' data_len={len(msg.get('file_data') or b'')} "
                          f"→ ensure_file returned None, attachment will be missing")
                r = await send_to_user(
                    user_id=user_id, platform=platform,
                    text=msg.get("message_text", ""),
                    file_path=msg_file_path, file_type=msg.get("file_type"),
                    telegram_file_id=msg.get("telegram_file_id"),
                    inline_buttons=msg.get("inline_buttons"),
                    attach_type=msg.get("attach_type"),
                    max_file_token=msg.get("max_file_token"),
                    file_data=msg.get("file_data"),
                )
                # Кэшируем свежий MAX file_token — следующая отправка воронки
                # обойдётся без upload_file (быстрее + не долбим MAX API).
                fresh_max = r.get("fresh_max_file_token") if isinstance(r, dict) else None
                if fresh_max and not msg.get("max_file_token"):
                    await execute(
                        "UPDATE funnel_steps SET max_file_token = $1 WHERE id = $2",
                        fresh_max, msg["funnel_step_id"],
                    )
                await execute("UPDATE funnel_progress SET status = 'sent', sent_at = NOW() WHERE id = $1", msg["id"])
            except Exception as e:
                print(f"[FunnelProcessor] Error sending funnel msg {msg['id']}: {e}")
                await execute("UPDATE funnel_progress SET status = 'failed' WHERE id = $1", msg["id"])

    await asyncio.gather(*[_send_one(m) for m in pending])


_BROADCAST_CONCURRENCY = 5  # concurrent sends per broadcast (MAX API allows ~5-10 req/sec)


async def _get_broadcast_leads(bc):
    """Get recipients for a broadcast based on filter rules."""
    filter_rules_raw = bc.get("filter_rules")
    filter_rules = None
    if filter_rules_raw:
        try:
            filter_rules = json.loads(filter_rules_raw) if isinstance(filter_rules_raw, str) else filter_rules_raw
        except (json.JSONDecodeError, TypeError):
            filter_rules = None

    if filter_rules and isinstance(filter_rules, (dict, list)):
        base_query = "SELECT * FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)"
        query_params = [bc["channel_id"]]
        idx = 2
        if isinstance(filter_rules, list):
            for rule in filter_rules:
                field = rule.get("field")
                op = rule.get("operator", "equals")
                value = rule.get("value")
                if not field or value is None:
                    continue
                if field == "platform" and op == "equals":
                    base_query += f" AND platform = ${idx}"
                    query_params.append(value)
                    idx += 1
                elif field == "lead_magnet_id" and op == "equals":
                    base_query += f" AND lead_magnet_id = ${idx}"
                    query_params.append(int(value))
                    idx += 1
                elif field == "registration_date" and op == "after":
                    base_query += f" AND claimed_at >= ${idx}"
                    query_params.append(_parse_date_value(value) or value)
                    idx += 1
                elif field == "registration_date" and op == "before":
                    base_query += f" AND claimed_at <= ${idx}"
                    query_params.append(_parse_date_value(value) or value)
                    idx += 1
        elif isinstance(filter_rules, dict):
            if filter_rules.get("platform"):
                base_query += f" AND platform = ${idx}"
                query_params.append(filter_rules["platform"])
                idx += 1
            if filter_rules.get("lead_magnet_id"):
                base_query += f" AND lead_magnet_id = ${idx}"
                query_params.append(int(filter_rules["lead_magnet_id"]))
                idx += 1
            if filter_rules.get("claimed_after"):
                base_query += f" AND claimed_at >= ${idx}"
                query_params.append(_parse_date_value(filter_rules["claimed_after"]) or filter_rules["claimed_after"])
                idx += 1
            if filter_rules.get("claimed_before"):
                base_query += f" AND claimed_at <= ${idx}"
                query_params.append(_parse_date_value(filter_rules["claimed_before"]) or filter_rules["claimed_before"])
                idx += 1
        return await fetch_all(base_query, *query_params)
    elif bc.get("target_type") == "all_leads":
        return await fetch_all(
            "SELECT * FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)",
            bc["channel_id"],
        )
    else:
        return await fetch_all(
            "SELECT * FROM leads WHERE lead_magnet_id = $1",
            bc.get("target_lead_magnet_id"),
        )


async def _send_broadcast(bc):
    """Send a single broadcast to all its recipients concurrently."""
    try:
        await execute("UPDATE broadcasts SET status = 'sending', started_at = NOW() WHERE id = $1", bc["id"])
        leads = await _get_broadcast_leads(bc)
        total = len(leads)
        sent = 0
        failed = 0
        from .messenger import send_to_user
        from .file_storage import ensure_file
        bc_file_path = ensure_file(bc.get("file_path"), bc.get("file_data"))
        cached_tg_file_id = bc.get("telegram_file_id")
        cached_max_token = bc.get("max_file_token")
        sem = asyncio.Semaphore(_BROADCAST_CONCURRENCY)
        lock = asyncio.Lock()

        async def _send_one(lead):
            nonlocal sent, failed, cached_tg_file_id, cached_max_token
            async with sem:
                try:
                    uid = lead.get("telegram_id") or lead.get("max_user_id")
                    plat = lead.get("platform", "telegram")
                    if uid:
                        result = await send_to_user(
                            user_id=uid, platform=plat,
                            text=bc.get("message_text", ""),
                            file_path=bc_file_path,
                            file_type=bc.get("file_type"),
                            telegram_file_id=cached_tg_file_id,
                            inline_buttons=bc.get("inline_buttons"),
                            attach_type=bc.get("attach_type"),
                            max_file_token=cached_max_token,
                        )
                        async with lock:
                            sent += 1
                            # Cache file IDs after first successful send
                            if isinstance(result, dict) and bc_file_path:
                                if plat == "telegram" and not cached_tg_file_id:
                                    r = result.get("result", {})
                                    for key in ("document", "photo", "video", "audio", "voice"):
                                        obj = r.get(key)
                                        if obj:
                                            fid = obj.get("file_id") if isinstance(obj, dict) else (obj[-1].get("file_id") if isinstance(obj, list) and obj else None)
                                            if fid:
                                                cached_tg_file_id = fid
                                                break
                                elif plat == "max" and not cached_max_token:
                                    body = result.get("data", result) if isinstance(result, dict) else {}
                                    for att in (body.get("body", {}).get("attachments") or body.get("attachments") or []):
                                        tok = att.get("payload", {}).get("token")
                                        if tok:
                                            cached_max_token = tok
                                            break
                    else:
                        async with lock:
                            failed += 1
                except Exception:
                    async with lock:
                        failed += 1

        # Send all in parallel with semaphore
        await asyncio.gather(*[_send_one(lead) for lead in leads])

        # Persist cached file IDs
        if cached_tg_file_id and cached_tg_file_id != bc.get("telegram_file_id"):
            await execute("UPDATE broadcasts SET telegram_file_id = $1 WHERE id = $2", cached_tg_file_id, bc["id"])
        if cached_max_token and cached_max_token != bc.get("max_file_token"):
            await execute("UPDATE broadcasts SET max_file_token = $1 WHERE id = $2", cached_max_token, bc["id"])
        await execute(
            "UPDATE broadcasts SET status = 'completed', completed_at = NOW(), sent_count = $1, failed_count = $2, total_count = $3 WHERE id = $4",
            sent, failed, total, bc["id"],
        )
        print(f"[Broadcast] #{bc['id']} done: {sent}/{total} sent, {failed} failed")
    except Exception as e:
        print(f"[Broadcast] #{bc['id']} error: {e}")
        await execute("UPDATE broadcasts SET status = 'failed' WHERE id = $1", bc["id"])


async def process_scheduled_broadcasts():
    """Send scheduled broadcasts — multiple broadcasts run in parallel."""
    broadcasts = await fetch_all("""
        SELECT * FROM broadcasts
        WHERE status = 'scheduled' AND scheduled_at <= NOW()
    """)
    if not broadcasts:
        return
    # Run all due broadcasts in parallel
    await asyncio.gather(*[_send_broadcast(bc) for bc in broadcasts])


async def process_scheduled_posts():
    """Publish scheduled content posts."""
    from .messenger import send_to_channel
    posts = await fetch_all("""
        SELECT cp.*, c.channel_id as ch_channel_id, c.platform, c.max_chat_id
        FROM content_posts cp
        JOIN channels c ON c.id = cp.channel_id
        WHERE cp.status = 'scheduled' AND cp.scheduled_at <= NOW()
    """)
    from .file_storage import ensure_file
    for post in posts:
        try:
            # Atomically mark as 'publishing' to prevent duplicate sends
            result_row = await fetch_one(
                "UPDATE content_posts SET status = 'publishing' WHERE id = $1 AND status = 'scheduled' RETURNING id",
                post["id"],
            )
            if not result_row:
                continue  # Already picked up by another cycle

            channel = await fetch_one("SELECT * FROM channels WHERE id = $1", post["channel_id"])
            if not channel:
                print(f"[FunnelProcessor] Post {post['id']}: channel not found")
                await execute("UPDATE content_posts SET status = 'scheduled' WHERE id = $1 AND status = 'publishing'", post["id"])
                continue

            post_file_path = ensure_file(post.get("file_path"), post.get("file_data"))

            # Resolve buttons
            resolved_buttons = post.get("inline_buttons")
            if resolved_buttons:
                try:
                    from ..routes.pins import _resolve_buttons
                    resolved_buttons = await _resolve_buttons(resolved_buttons, channel, post_id=post["id"], post_type="content")
                except Exception as e:
                    print(f"[FunnelProcessor] Post {post['id']}: button resolve error: {e}")

            # Отделяем отправку от пост-обработки: если send_to_channel
            # успешно вернулся, пост УЖЕ в канале — обязательно ставим
            # published, даже если парсинг msg_id или UPDATE упадут.
            sent_ok = False
            send_error = None
            result = None
            try:
                result = await send_to_channel(
                    channel, post.get("message_text", ""),
                    file_path=post_file_path,
                    file_type=post.get("file_type"),
                    telegram_file_id=post.get("telegram_file_id"),
                    inline_buttons=resolved_buttons,
                    attach_type=post.get("attach_type"),
                    max_file_token=post.get("max_file_token"),
                    attachment_paths=post.get("attachment_paths") or [],
                    attachment_tokens=post.get("attachment_tokens") or [],
                )
                # send_to_channel может вернуть {success: False, ...} — это тоже фейл
                if isinstance(result, dict) and result.get("success") is False:
                    send_error = result.get("error") or "send failed"
                else:
                    sent_ok = True
            except Exception as e:
                import traceback
                traceback.print_exc()
                send_error = str(e)

            if sent_ok:
                # Парсинг msg_id защищён — даже если упадёт, статус уже published
                msg_id = None
                fresh_token = None
                try:
                    if isinstance(result, dict):
                        msg_id = result.get("message_id") or result.get("result", {}).get("message_id")
                        if not msg_id:
                            msg_id = result.get("message", {}).get("body", {}).get("mid")
                        fresh_token = result.get("max_file_token")
                except Exception as e:
                    print(f"[FunnelProcessor] Post {post['id']}: msg_id parse error: {e}")
                # UPDATE обёрнут в try — пост уже в канале, нельзя допустить
                # проброс во внешний except, который вернёт scheduled → дубли.
                # Сохраняем max_file_token чтобы edit кнопок не потерял картинку.
                try:
                    if fresh_token and not post.get("max_file_token"):
                        await execute(
                            """UPDATE content_posts SET status = 'published',
                               published_at = NOW(), scheduled_at = NULL,
                               telegram_message_id = $1, max_file_token = $2
                               WHERE id = $3""",
                            str(msg_id) if msg_id else None, fresh_token, post["id"],
                        )
                    else:
                        await execute(
                            "UPDATE content_posts SET status = 'published', published_at = NOW(), scheduled_at = NULL, telegram_message_id = $1 WHERE id = $2",
                            str(msg_id) if msg_id else None, post["id"],
                        )
                except Exception as e:
                    print(f"[FunnelProcessor] Post {post['id']}: UPDATE to published failed: {e}, trying without msg_id")
                    await execute(
                        "UPDATE content_posts SET status = 'published', published_at = NOW(), scheduled_at = NULL WHERE id = $1",
                        post["id"],
                    )
            else:
                # КРИТИЧНО: НЕ возвращаем 'scheduled' с retry через 5 мин —
                # send_to_channel мог реально отправить пост, а exception
                # упал на парсинге ответа MAX-API. Тогда мы шлём дубликат
                # каждые 5 минут бесконечно. Лучше пометить failed —
                # пользователь увидит ошибку, проверит канал и вручную
                # нажмёт «Опубликовать» если нужно.
                await execute(
                    """UPDATE content_posts SET status = 'failed',
                       scheduled_at = NULL, last_error = $2
                       WHERE id = $1 AND status = 'publishing'""",
                    post["id"], (send_error or "Неизвестная ошибка")[:500],
                )
                print(f"[FunnelProcessor] Post {post['id']} send failed → status='failed' (no auto-retry): {send_error}")
        except Exception as e:
            # Сюда долетают только ошибки ДО try send_to_channel (ensure_file,
            # channel lookup, button resolve). В канал ещё ничего не уходило —
            # безопасно вернуть scheduled с задержкой, чтобы шедулер повторил.
            import traceback
            traceback.print_exc()
            await execute(
                """UPDATE content_posts SET status = 'scheduled',
                   scheduled_at = NOW() + INTERVAL '5 minutes'
                   WHERE id = $1 AND status = 'publishing'""",
                post["id"],
            )
            print(f"[FunnelProcessor] Post {post['id']} setup error (before send), retry in 5 min: {e}")


async def process_automation_queue():
    """Process pending automation queue items."""
    from .messenger import send_to_user
    items = await fetch_all("""
        SELECT aq.*, ast.action_type, ast.action_config
        FROM automation_queue aq
        JOIN automation_steps ast ON ast.id = aq.step_id
        WHERE aq.status = 'pending' AND aq.scheduled_at <= NOW()
        ORDER BY aq.scheduled_at
        LIMIT 50
    """)
    for item in items:
        try:
            action_type = item.get("action_type", "")
            config = item.get("action_config") or {}
            if isinstance(config, str):
                config = json.loads(config)

            uid = item.get("telegram_id") or item.get("max_user_id")
            plat = item.get("platform", "telegram")

            if action_type == "send_message" and uid:
                await send_to_user(user_id=uid, platform=plat, text=config.get("message", ""))
            elif action_type == "add_tag":
                pass  # tag logic
            elif action_type == "remove_tag":
                pass  # tag logic

            await execute("UPDATE automation_queue SET status = 'done' WHERE id = $1", item["id"])
            await execute(
                """INSERT INTO automation_log (automation_id, step_id, client_id, telegram_id, max_user_id, status)
                   VALUES ($1, $2, $3, $4, $5, 'executed')""",
                item["automation_id"], item["step_id"], item.get("client_id"),
                item.get("telegram_id"), item.get("max_user_id"),
            )
        except Exception as e:
            print(f"[AutomationProcessor] Queue item {item['id']} error: {e}")
            await execute("UPDATE automation_queue SET status = 'failed' WHERE id = $1", item["id"])


async def process_abandoned_carts():
    """Find abandoned carts and optionally notify."""
    try:
        carts = await fetch_all("""
            SELECT c.*, ch.title as channel_title
            FROM carts c
            JOIN channels ch ON ch.id = c.channel_id
            WHERE c.status = 'active'
            AND c.updated_at < NOW() - INTERVAL '30 minutes'
        """)
        for cart in carts:
            await execute("UPDATE carts SET status = 'abandoned' WHERE id = $1", cart["id"])
    except Exception as e:
        print(f"[AbandonedCarts] Error: {e}")


async def _funnel_loop():
    await asyncio.sleep(10)
    while True:
        try:
            await process_pending_funnel_messages()
        except Exception as e:
            print(f"[FunnelProcessor] {e}")
        await asyncio.sleep(30)


async def _broadcast_loop():
    await asyncio.sleep(15)
    while True:
        try:
            await process_scheduled_broadcasts()
        except Exception as e:
            print(f"[BroadcastProcessor] {e}")
        await asyncio.sleep(60)


async def _content_loop():
    await asyncio.sleep(20)
    while True:
        try:
            await process_scheduled_posts()
        except Exception as e:
            print(f"[ContentProcessor] {e}")
        await asyncio.sleep(60)


async def _automation_loop():
    await asyncio.sleep(10)
    while True:
        try:
            await process_automation_queue()
        except Exception as e:
            print(f"[AutomationProcessor] {e}")
        await asyncio.sleep(30)


async def _cart_loop():
    await asyncio.sleep(30)
    while True:
        try:
            await process_abandoned_carts()
        except Exception as e:
            print(f"[AbandonedCarts] {e}")
        await asyncio.sleep(600)  # 10 minutes


async def refresh_channel_titles():
    """Синхронизация title и avatar активных MAX-каналов.
    Если владелец переименовал канал в мессенджере — у нас в БД остаётся
    старое название, пока сюда не пришёл `bot_added` (что бывает только
    при повторном добавлении). Раз в 6 часов опрашиваем get_chat
    и обновляем разошедшиеся поля."""
    from .max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        return
    rows = await fetch_all(
        """SELECT id, max_chat_id, title, avatar_url, username
           FROM channels
           WHERE platform = 'max' AND is_active = 1 AND deleted_at IS NULL
             AND max_chat_id IS NOT NULL
           ORDER BY created_at NULLS FIRST
           LIMIT 200"""
    )
    updated_count = 0
    for r in rows:
        try:
            info = await max_api.get_chat(str(r["max_chat_id"]))
            if not info.get("success"):
                continue
            data = info.get("data", {}) or {}
            new_title = (data.get("title") or "").strip()
            new_link = data.get("link") or None
            icon = data.get("icon") or {}
            new_avatar = icon.get("url") if isinstance(icon, dict) else None

            updates, params = [], []
            idx = 1
            if new_title and new_title != (r.get("title") or "").strip():
                updates.append(f"title = ${idx}"); params.append(new_title); idx += 1
            if new_avatar and new_avatar != r.get("avatar_url"):
                updates.append(f"avatar_url = ${idx}"); params.append(new_avatar); idx += 1
            if new_link and new_link != r.get("username"):
                updates.append(f"username = ${idx}"); params.append(new_link); idx += 1

            if updates:
                params.append(r["id"])
                await execute(
                    f"UPDATE channels SET {', '.join(updates)} WHERE id = ${idx}",
                    *params,
                )
                updated_count += 1
                print(f"[ChannelRefresh] #{r['id']} updated: title={new_title!r}")
        except Exception as e:
            print(f"[ChannelRefresh] #{r.get('id')} get_chat failed: {e}")
        # Лёгкий rate-limit для MAX API (5-10 req/sec у бота)
        await asyncio.sleep(0.15)
    if updated_count:
        print(f"[ChannelRefresh] обновлено {updated_count} каналов из {len(rows)}")


async def _channel_refresh_loop():
    # 2 минуты после старта чтобы не дёргать сразу при boot
    await asyncio.sleep(120)
    while True:
        try:
            await refresh_channel_titles()
        except Exception as e:
            print(f"[ChannelRefresh] loop error: {e}")
        await asyncio.sleep(6 * 3600)  # раз в 6 часов


async def purge_deleted_channels():
    """Каналы в корзине >30 дней — каскадно вычищаем."""
    rows = await fetch_all(
        "SELECT id, title FROM channels WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days' LIMIT 50",
    )
    if not rows:
        return
    for r in rows:
        cid = int(r["id"])
        try:
            await execute("DELETE FROM offline_conversions WHERE channel_id = $1", cid)
            await execute("DELETE FROM subscriptions WHERE channel_id = $1", cid)
            await execute("DELETE FROM visits WHERE channel_id = $1", cid)
            await execute("DELETE FROM clicks WHERE link_id IN (SELECT id FROM tracking_links WHERE channel_id = $1)", cid)
            await execute("DELETE FROM tracking_links WHERE channel_id = $1", cid)
            await execute("DELETE FROM funnel_progress WHERE lead_id IN (SELECT id FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1))", cid)
            await execute("DELETE FROM funnel_steps WHERE channel_id = $1", cid)
            await execute("DELETE FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)", cid)
            await execute("DELETE FROM pin_posts WHERE channel_id = $1", cid)
            await execute("DELETE FROM lead_magnets WHERE channel_id = $1", cid)
            await execute("DELETE FROM broadcasts WHERE channel_id = $1", cid)
            await execute("DELETE FROM content_posts WHERE channel_id = $1", cid)
            await execute("DELETE FROM channel_modules WHERE channel_id = $1", cid)
            await execute("DELETE FROM channel_billing WHERE channel_id = $1", cid)
            await execute("DELETE FROM channels WHERE id = $1", cid)
            print(f"[TrashPurge] permanently deleted channel #{cid} ({r.get('title')})")
        except Exception as e:
            print(f"[TrashPurge] channel #{cid} failed: {e}")


async def _trash_purge_loop():
    # Запуск раз в час (через 60s после старта чтобы не блокировать миграции)
    await asyncio.sleep(60)
    while True:
        try:
            await purge_deleted_channels()
        except Exception as e:
            print(f"[TrashPurge] loop error: {e}")
        await asyncio.sleep(3600)


async def _offline_conv_upload_loop():
    """Раз в 5 минут заливаем накопившиеся offline_conversions в YM API.
    Каждый канал с непустыми pending записями обрабатывается отдельно.
    Server-side fire через mc.yandex.ru/watch фильтруется YM по IP датацентра,
    а offline API через OAuth не привязан к IP — это надёжный fallback."""
    await asyncio.sleep(60)
    while True:
        try:
            await _upload_offline_conversions_for_all_channels()
        except Exception as e:
            print(f"[OfflineConv] loop error: {e}")
        await asyncio.sleep(300)  # 5 min


async def _upload_offline_conversions_for_all_channels():
    import aiohttp
    from ..config import settings as _settings
    rows = await fetch_all(
        """SELECT DISTINCT oc.channel_id, oc.ym_counter_id
           FROM offline_conversions oc
           WHERE oc.uploaded_at IS NULL"""
    )
    if not rows:
        return
    for r in rows:
        ch_id = r["channel_id"]
        counter = r["ym_counter_id"]
        ch = await fetch_one("SELECT ym_oauth_token FROM channels WHERE id = $1", ch_id)
        ym_token = (ch and ch.get("ym_oauth_token")) or _settings.YM_OAUTH_TOKEN
        if not ym_token:
            continue
        pending = await fetch_all(
            """SELECT id, ym_client_id, goal_name, conversion_time
               FROM offline_conversions
               WHERE channel_id = $1 AND ym_counter_id = $2 AND uploaded_at IS NULL
               ORDER BY conversion_time LIMIT 1000""",
            ch_id, counter,
        )
        if not pending:
            continue
        csv_lines = ["ClientId,Target,DateTime"]
        for c in pending:
            t = c["conversion_time"]
            t_str = t.strftime("%Y-%m-%d %H:%M:%S") if hasattr(t, "strftime") else str(t)
            csv_lines.append(f"{c['ym_client_id']},{c['goal_name']},{t_str}")
        csv_data = "\n".join(csv_lines)
        url = f"https://api-metrika.yandex.net/management/v1/counter/{counter}/offline_conversions/upload?client_id_type=CLIENT_ID"
        headers = {"Authorization": f"OAuth {ym_token}"}
        try:
            async with aiohttp.ClientSession() as session:
                data = aiohttp.FormData()
                data.add_field("file", csv_data, filename="conversions.csv", content_type="text/csv")
                async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    body = await resp.text()
                    if resp.status == 200:
                        for c in pending:
                            await execute("UPDATE offline_conversions SET uploaded_at = NOW() WHERE id = $1", c["id"])
                        print(f"[OfflineConv] uploaded {len(pending)} conversions to YM counter={counter}")
                    else:
                        err = body[:500]
                        for c in pending:
                            await execute("UPDATE offline_conversions SET upload_error = $1 WHERE id = $2", err, c["id"])
                        print(f"[OfflineConv] YM upload failed counter={counter} status={resp.status}: {err[:200]}")
        except Exception as e:
            print(f"[OfflineConv] YM upload exception counter={counter}: {e}")


def start_processors():
    global _processor_tasks
    _processor_tasks = [
        asyncio.create_task(_funnel_loop()),
        asyncio.create_task(_broadcast_loop()),
        asyncio.create_task(_content_loop()),
        asyncio.create_task(_automation_loop()),
        asyncio.create_task(_cart_loop()),
        asyncio.create_task(_trash_purge_loop()),
        asyncio.create_task(_channel_refresh_loop()),
        asyncio.create_task(_offline_conv_upload_loop()),
    ]
    print("[Processors] Started (funnels: 30s, broadcasts: 60s, content: 60s, automation: 30s, carts: 10m, trash-purge: 1h, channel-refresh: 6h, offline-conv: 5m)")


def stop_processors():
    global _processor_tasks
    for task in _processor_tasks:
        task.cancel()
    _processor_tasks = []
