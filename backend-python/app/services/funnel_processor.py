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


async def schedule_funnel_for_lead(lead_id: int, lead_magnet_id: int, telegram_id=None, max_user_id=None, platform="telegram"):
    """Schedule funnel steps for a lead. Cancels any pending steps and reschedules from now."""
    # Remove all previous progress for this lead (pending + sent) to start fresh
    await execute(
        "DELETE FROM funnel_progress WHERE lead_id = $1",
        lead_id,
    )
    steps = await fetch_all(
        "SELECT * FROM funnel_steps WHERE lead_magnet_id = $1 AND is_active = 1 ORDER BY step_number",
        lead_magnet_id,
    )
    cumulative_seconds = 0
    for step in steps:
        # Calculate delay from delay_config (preferred) or delay_minutes (legacy)
        step_delay = step.get("delay_minutes", 60) * 60
        delay_config = step.get("delay_config")
        if delay_config:
            import json as _json
            try:
                cfg = _json.loads(delay_config) if isinstance(delay_config, str) else delay_config
                val = int(cfg.get("value", 60))
                unit = cfg.get("unit", "minutes")
                if unit == "seconds":
                    step_delay = val
                elif unit == "minutes":
                    step_delay = val * 60
                elif unit == "hours":
                    step_delay = val * 3600
                elif unit == "days":
                    step_delay = val * 86400
            except Exception:
                pass
        cumulative_seconds += step_delay
        await execute(
            """INSERT INTO funnel_progress (lead_id, funnel_step_id, telegram_id, max_user_id, platform, scheduled_at, status)
               VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 second' * $6, 'pending')""",
            lead_id, step["id"], telegram_id, max_user_id, platform, cumulative_seconds,
        )
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
                await send_to_user(
                    user_id=user_id, platform=platform,
                    text=msg.get("message_text", ""),
                    file_path=msg_file_path, file_type=msg.get("file_type"),
                    telegram_file_id=msg.get("telegram_file_id"),
                    inline_buttons=msg.get("inline_buttons"),
                    attach_type=msg.get("attach_type"),
                    max_file_token=msg.get("max_file_token"),
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
        WHERE cp.status = 'scheduled' AND cp.scheduled_at <= NOW() + INTERVAL '3 hours'
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

            result = await send_to_channel(
                channel, post.get("message_text", ""),
                file_path=post_file_path,
                file_type=post.get("file_type"),
                telegram_file_id=post.get("telegram_file_id"),
                inline_buttons=resolved_buttons,
                attach_type=post.get("attach_type"),
                max_file_token=post.get("max_file_token"),
            )
            msg_id = None
            if isinstance(result, dict):
                msg_id = result.get("message_id") or result.get("result", {}).get("message_id")
                if not msg_id:
                    msg_id = result.get("message", {}).get("body", {}).get("mid")
            await execute(
                "UPDATE content_posts SET status = 'published', published_at = NOW(), telegram_message_id = $1 WHERE id = $2",
                str(msg_id) if msg_id else None, post["id"],
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            # Mark as failed instead of reverting to scheduled (prevents infinite loop)
            await execute(
                "UPDATE content_posts SET status = 'draft' WHERE id = $1 AND status = 'publishing'",
                post["id"],
            )
            print(f"[FunnelProcessor] Post {post['id']} FAILED, set to draft: {e}")


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


def start_processors():
    global _processor_tasks
    _processor_tasks = [
        asyncio.create_task(_funnel_loop()),
        asyncio.create_task(_broadcast_loop()),
        asyncio.create_task(_content_loop()),
        asyncio.create_task(_automation_loop()),
        asyncio.create_task(_cart_loop()),
    ]
    print("[Processors] Started (funnels: 30s, broadcasts: 60s, content: 60s, automation: 30s, carts: 10m)")


def stop_processors():
    global _processor_tasks
    for task in _processor_tasks:
        task.cancel()
    _processor_tasks = []
