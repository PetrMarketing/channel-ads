"""MAX bot webhook handler + long-polling fallback.

Handles bot_started, message_created, bot_added, bot_removed, user_added events.
Uses chat_id from events for all message sending (user_id param unreliable in MAX API).
"""
import asyncio
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict

from fastapi import APIRouter, Request

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

_poll_task: Optional[asyncio.Task] = None


def _generate_tracking_code() -> str:
    return secrets.token_hex(8)


async def _get_user_dialog_chat_id(max_user_id: str) -> Optional[str]:
    """Get the stored dialog chat_id for a MAX user from DB (survives restarts)."""
    row = await fetch_one("SELECT max_dialog_chat_id FROM users WHERE max_user_id = $1", str(max_user_id))
    return row.get("max_dialog_chat_id") if row else None


async def _save_dialog_chat_id(max_user_id: str, chat_id: str):
    """Persist user's dialog chat_id to DB for future messaging."""
    try:
        result = await execute("UPDATE users SET max_dialog_chat_id = $1 WHERE max_user_id = $2", chat_id, str(max_user_id))
        print(f"[MAX Bot] Saved dialog_chat_id={chat_id} for user={max_user_id}")
    except Exception as e:
        print(f"[MAX Bot] Failed to save dialog chat_id: {e}")


async def _send_to_chat(max_api, chat_id: str, text: str, attachments=None, buttons=None):
    """Send message using chat_id. Log errors."""
    if not max_api or not chat_id:
        print(f"[MAX Bot] Cannot send: max_api={bool(max_api)}, chat_id={chat_id}")
        return
    result = await max_api.send_message(str(chat_id), text, attachments=attachments, buttons=buttons)
    if not result.get("success"):
        print(f"[MAX Bot] send_message failed for chat_id={chat_id}: {result.get('error')}")
    return result


async def _send_to_user_by_id(max_api, max_user_id: str, text: str, attachments=None, buttons=None):
    """Send message to user using their stored dialog chat_id from DB."""
    if not max_api or not max_user_id:
        return
    dialog_chat_id = await _get_user_dialog_chat_id(max_user_id)
    if dialog_chat_id:
        return await _send_to_chat(max_api, dialog_chat_id, text, attachments, buttons)
    # Last resort fallback - probably won't work but try
    result = await max_api.send_direct_message(str(max_user_id), text, attachments=attachments, buttons=buttons)
    if not result.get("success"):
        print(f"[MAX Bot] send_direct_message fallback failed for user_id={max_user_id}: {result.get('error')}")
    return result


async def _find_or_create_max_user(max_user_id: str, name: str = "", dialog_chat_id: str = ""):
    """Find or create MAX user, store dialog_chat_id, return user+token."""
    from ..middleware.auth import find_or_create_max_user
    result = await find_or_create_max_user(max_user_id, name, dialog_chat_id=dialog_chat_id)
    return result


# ---- Lead magnet delivery ----

async def handle_lead_magnet(max_api, chat_id: str, max_user_id: str, username: str, first_name: str, code: str):
    # Strip lm_ prefix if present (deep links use ?start=lm_CODE)
    lm_code = code[3:] if code.startswith("lm_") else code
    lm = await fetch_one("""
        SELECT lm.*, c.title as channel_title
        FROM lead_magnets lm JOIN channels c ON c.id = lm.channel_id
        WHERE lm.code = $1
    """, lm_code)
    if not lm:
        await _send_to_chat(max_api, chat_id, "Лид-магнит не найден или был удалён.")
        return

    await _find_or_create_max_user(max_user_id, first_name, dialog_chat_id=chat_id)

    existing = await fetch_one("SELECT id FROM leads WHERE lead_magnet_id = $1 AND max_user_id = $2", lm["id"], max_user_id)
    if not existing:
        lead_id = await execute_returning_id(
            "INSERT INTO leads (lead_magnet_id, telegram_id, max_user_id, username, first_name, platform) VALUES ($1, NULL, $2, $3, $4, 'max') ON CONFLICT DO NOTHING RETURNING id",
            lm["id"], max_user_id, username, first_name,
        )
        if lead_id:
            from ..services.funnel_processor import schedule_funnel_for_lead
            await schedule_funnel_for_lead(lead_id, lm["id"], max_user_id=max_user_id, platform="max")

    from ..services.messenger import html_to_max_markdown, sanitize_html_for_telegram
    text = html_to_max_markdown(sanitize_html_for_telegram(lm.get("message_text") or f'📎 Ваш материал: "{lm.get("title", "")}"'))

    # Send file if available
    file_path = lm.get("file_path")
    file_type = lm.get("file_type")
    file_data = lm.get("file_data")
    cached_token = lm.get("max_file_token")
    lm_attach_type = lm.get("attach_type") or file_type
    attachments = None
    file_token = None
    print(f"[MAX Bot] Lead magnet file_path={file_path}, file_type={file_type}, attach_type={lm_attach_type}, cached_token={bool(cached_token)}, has_file_data={file_data is not None and len(file_data) > 0 if file_data else False}")

    # Use cached token if available
    if cached_token:
        type_map = {"photo": "image", "video": "video"}
        att_type = type_map.get(lm_attach_type, "file")
        attachments = [{"type": att_type, "payload": {"token": cached_token}}]
    elif file_path or file_data:
        # Need to upload file
        upload_path = None
        tmp_path = None
        if file_path:
            from ..services.file_storage import ensure_file
            upload_path = ensure_file(file_path, file_data)
            print(f"[MAX Bot] After ensure_file: upload_path={upload_path}")
        if not upload_path and file_data:
            # file_path missing or ensure_file failed — create temp file
            import tempfile, os as _os
            # Preserve original extension from file_path if available
            ext = _os.path.splitext(file_path)[1] if file_path else ""
            if not ext:
                ext = ".jpg" if lm_attach_type == "photo" else ".mp4" if lm_attach_type == "video" else ".bin"
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                raw = file_data if isinstance(file_data, (bytes, bytearray, memoryview)) else bytes(file_data)
                tmp.write(raw)
                tmp_path = tmp.name
                upload_path = tmp_path
            print(f"[MAX Bot] Created temp file: {tmp_path}")

        if upload_path:
            try:
                upload_result = await max_api.upload_file(upload_path, file_type or "document")
                print(f"[MAX Bot] Upload result: {upload_result}")
                if upload_result.get("success"):
                    token_data = upload_result.get("data", {})
                    from ..services.messenger import _extract_max_file_token
                    file_token = _extract_max_file_token(token_data)
                    print(f"[MAX Bot] file_token={file_token}")
                    if file_token:
                        type_map = {"photo": "image", "video": "video"}
                        att_type = type_map.get(lm_attach_type, "file")
                        attachments = [{"type": att_type, "payload": {"token": file_token}}]
                        # Cache token for future use
                        try:
                            await execute("UPDATE lead_magnets SET max_file_token = $1 WHERE id = $2", file_token, lm["id"])
                        except Exception as e:
                            print(f"[MAX Bot] Failed to cache token: {e}")
                else:
                    print(f"[MAX Bot] Upload failed: {upload_result.get('error')}")
            except Exception as e:
                import traceback
                print(f"[MAX Bot] Failed to upload lead magnet file: {e}\n{traceback.format_exc()}")
            finally:
                if tmp_path:
                    import os
                    os.unlink(tmp_path)

    if attachments:
        await _send_to_chat(max_api, chat_id, text, attachments=attachments)
    elif text:
        await _send_to_chat(max_api, chat_id, text)
    else:
        await _send_to_chat(max_api, chat_id, "Материал пока не загружен. Попробуйте позже.")


# ---- Giveaway participation ----

async def handle_giveaway(max_api, chat_id: str, max_user_id: str, username: str, first_name: str, code: str):
    gw = await fetch_one("""
        SELECT g.id, g.channel_id, g.title, g.status, g.deep_link_code, g.participant_count,
               c.title as channel_title
        FROM giveaways g JOIN channels c ON c.id = g.channel_id
        WHERE g.deep_link_code = $1
    """, code)
    if not gw:
        await _send_to_chat(max_api, chat_id, "Розыгрыш не найден.")
        return
    if gw.get("status") == "finished":
        await _send_to_chat(max_api, chat_id, "Этот розыгрыш уже завершён.")
        return
    if gw.get("status") == "draft":
        await _send_to_chat(max_api, chat_id, "Розыгрыш ещё не начался.")
        return

    existing = await fetch_one(
        "SELECT id, participant_number FROM giveaway_participants WHERE giveaway_id = $1 AND max_user_id = $2",
        gw["id"], str(max_user_id),
    )
    if existing:
        await _send_to_chat(max_api, chat_id, f"Вы уже участвуете! 🎟 Ваш номер: #{existing['participant_number']}")
        return

    count = await fetch_one("SELECT COUNT(*) as cnt FROM giveaway_participants WHERE giveaway_id = $1", gw["id"])
    num = (count["cnt"] if count else 0) + 1
    try:
        await execute(
            "INSERT INTO giveaway_participants (giveaway_id, max_user_id, username, first_name, participant_number, platform) VALUES ($1,$2,$3,$4,$5,'max') ON CONFLICT DO NOTHING",
            gw["id"], str(max_user_id), username or "", first_name or "", num,
        )
    except Exception as e:
        print(f"[MAX Bot] handle_giveaway INSERT failed: {e}")
        await _send_to_chat(max_api, chat_id, "⚠️ Не удалось зарегистрировать участие. Попробуйте ещё раз.")
        return

    # Update participants count
    try:
        await execute(
            "UPDATE giveaways SET participant_count = (SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = $1) WHERE id = $1",
            gw["id"],
        )
    except Exception:
        pass

    await _send_to_chat(max_api, chat_id, f"🎉 Вы участвуете в розыгрыше «{gw.get('title', '')}»!\n\n🎟 Ваш номер: #{num}")


# ---- Extract chat_id from different event types ----

def _get_chat_id(body: dict) -> Optional[str]:
    """Extract chat_id from a MAX update body — try ALL known locations."""
    # Direct field
    chat_id = body.get("chat_id")
    if chat_id:
        return str(chat_id)
    # Nested chat object
    chat = body.get("chat", {})
    if chat.get("chat_id"):
        return str(chat["chat_id"])
    # Message recipient
    message = body.get("message", {})
    recipient = message.get("recipient", {})
    if recipient.get("chat_id"):
        return str(recipient["chat_id"])
    # Message-level chat_id
    if message.get("chat_id"):
        return str(message["chat_id"])
    # Sender — some events put it in sender
    sender = message.get("sender", {})
    # user_id as fallback for dialog chats (create dialog via API)
    user_id = body.get("user", {}).get("user_id")
    if user_id:
        # For bot_started, MAX should send chat_id but sometimes doesn't
        # Try to look up stored dialog chat_id
        pass  # Will be handled by caller
    return None


# ---- Bot command handlers ----

async def _cmd_start(max_api, chat_id: str, max_user_id: str, first_name: str, payload: str = ""):
    """Handle /start command with optional payload."""
    if payload.startswith("lm_"):
        await handle_lead_magnet(max_api, chat_id, max_user_id, "", first_name, payload)
        return
    if payload.startswith("shop_"):
        tracking_code = payload.replace("shop_", "")
        app_url = settings.APP_URL
        await _send_to_chat(max_api, chat_id,
            f"🛍 Откройте каталог:",
            buttons=[[{"type": "link", "text": "🛍 Открыть каталог", "url": f"{app_url}/shop.html?code=shop_{tracking_code}"}]])
        return
    if payload.startswith("gw_"):
        await _find_or_create_max_user(max_user_id, first_name, dialog_chat_id=chat_id)
        await handle_giveaway(max_api, chat_id, max_user_id, "", first_name, payload)
        return

    result = await _find_or_create_max_user(max_user_id, first_name, dialog_chat_id=chat_id)
    token = result["token"]
    login_url = f"{settings.APP_URL}/login?token={token}"

    await _send_to_chat(max_api, chat_id,
        f"👋 Привет! Я помогу отслеживать подписчиков каналов.\n\n"
        f"📌 **Как подключить канал:**\n"
        f"1. Откройте ваш канал → Настройки → Администраторы\n"
        f"2. Добавьте меня как администратора\n"
        f"3. Каналы появятся в личном кабинете автоматически\n\n"
        f"📋 **Команды бота:**\n"
        f"/login — войти в личный кабинет\n"
        f"/channels — мои каналы\n"
        f"/links — ссылки отслеживания\n"
        f"/newlink — создать ссылку\n"
        f"/giveaways — розыгрыши\n"
        f"/newgiveaway — создать розыгрыш\n"
        f"/pins — закрепы и лид-магниты\n"
        f"/newpin — создать закреп\n"
        f"/newleadmagnet — создать лид-магнит\n"
        f"/stats — статистика\n"
        f"/help — помощь",
        buttons=[[{"type": "link", "text": "🔑 Открыть личный кабинет", "url": login_url}]],
    )


async def _cmd_channels(max_api, chat_id: str, max_user_id: str):
    """List user's channels."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        await _send_to_chat(max_api, chat_id, "⚠️ Сначала напишите /start для регистрации.")
        return

    channels = await fetch_all(
        "SELECT id, title, tracking_code, is_active, platform FROM channels WHERE user_id = $1 ORDER BY created_at DESC",
        user["id"],
    )
    if not channels:
        await _send_to_chat(max_api, chat_id,
            "📭 У вас пока нет подключенных каналов.\n\n"
            "Чтобы подключить канал, добавьте бота администратором в свой канал.")
        return

    lines = ["📺 **Ваши каналы:**\n"]
    for ch in channels:
        status = "✅" if ch["is_active"] else "❌"
        platform_icon = "📱" if ch["platform"] == "max" else "✈️"
        lines.append(f"{status} {platform_icon} **{ch['title']}**")
        lines.append(f"   Код: `{ch['tracking_code']}`")
    await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_links(max_api, chat_id: str, max_user_id: str):
    """List user's tracking links."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        await _send_to_chat(max_api, chat_id, "⚠️ Сначала напишите /start для регистрации.")
        return

    links = await fetch_all("""
        SELECT tl.name, tl.short_code, tl.clicks, tl.is_paused, c.title as channel_title
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE c.user_id = $1 ORDER BY tl.created_at DESC LIMIT 20
    """, user["id"])

    if not links:
        await _send_to_chat(max_api, chat_id,
            "📭 У вас пока нет ссылок отслеживания.\n\nСоздайте их в личном кабинете.")
        return

    lines = ["🔗 **Ваши ссылки:**\n"]
    app_url = settings.APP_URL
    for lnk in links:
        status = "⏸" if lnk["is_paused"] else "▶️"
        lines.append(f"{status} **{lnk['name'] or lnk['short_code']}** ({lnk['channel_title']})")
        lines.append(f"   {app_url}/go/{lnk['short_code']} — {lnk['clicks']} кликов")
    await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_giveaways(max_api, chat_id: str, max_user_id: str):
    """List user's giveaways."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        await _send_to_chat(max_api, chat_id, "⚠️ Сначала напишите /start для регистрации.")
        return

    giveaways = await fetch_all("""
        SELECT g.title, g.status, g.participant_count, c.title as channel_title
        FROM giveaways g JOIN channels c ON c.id = g.channel_id
        WHERE c.user_id = $1 ORDER BY g.created_at DESC LIMIT 10
    """, user["id"])

    if not giveaways:
        await _send_to_chat(max_api, chat_id,
            "📭 У вас пока нет розыгрышей.\n\nСоздайте их в личном кабинете.")
        return

    status_map = {"draft": "📝", "active": "🎉", "finished": "🏆"}
    lines = ["🎁 **Ваши розыгрыши:**\n"]
    for gw in giveaways:
        icon = status_map.get(gw["status"], "❓")
        lines.append(f"{icon} **{gw['title']}** ({gw['channel_title']})")
        lines.append(f"   Статус: {gw['status']} | Участников: {gw['participant_count'] or 0}")
    await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_pins(max_api, chat_id: str, max_user_id: str):
    """List user's pin posts and lead magnets."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        await _send_to_chat(max_api, chat_id, "⚠️ Сначала напишите /start для регистрации.")
        return

    pins = await fetch_all("""
        SELECT pp.title, pp.status, c.title as channel_title
        FROM pin_posts pp JOIN channels c ON c.id = pp.channel_id
        WHERE c.user_id = $1 ORDER BY pp.created_at DESC LIMIT 10
    """, user["id"])

    lms = await fetch_all("""
        SELECT lm.title, lm.code, c.title as channel_title,
               (SELECT COUNT(*) FROM leads WHERE lead_magnet_id = lm.id) as lead_count
        FROM lead_magnets lm JOIN channels c ON c.id = lm.channel_id
        WHERE c.user_id = $1 ORDER BY lm.created_at DESC LIMIT 10
    """, user["id"])

    lines = []
    if lms:
        lines.append("🧲 **Лид-магниты:**\n")
        for lm in lms:
            lines.append(f"📎 **{lm['title']}** ({lm['channel_title']})")
            lines.append(f"   Код: `{lm['code']}` | Лидов: {lm['lead_count']}")

    if pins:
        if lines:
            lines.append("")
        lines.append("📌 **Закрепы:**\n")
        status_map = {"draft": "📝", "published": "✅", "unpinned": "❌"}
        for p in pins:
            icon = status_map.get(p["status"], "❓")
            lines.append(f"{icon} **{p['title']}** ({p['channel_title']})")

    if not lines:
        await _send_to_chat(max_api, chat_id,
            "📭 У вас пока нет закрепов и лид-магнитов.\n\nСоздайте их в личном кабинете.")
    else:
        await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_stats(max_api, chat_id: str, max_user_id: str):
    """Show user stats summary."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        await _send_to_chat(max_api, chat_id, "⚠️ Сначала напишите /start для регистрации.")
        return

    visits = await fetch_one(
        "SELECT COUNT(*) as count FROM visits v JOIN channels c ON c.id = v.channel_id WHERE c.user_id = $1", user["id"])
    subs = await fetch_one(
        "SELECT COUNT(*) as count FROM subscriptions s JOIN channels c ON c.id = s.channel_id WHERE c.user_id = $1", user["id"])
    leads = await fetch_one(
        "SELECT COUNT(*) as count FROM leads l JOIN lead_magnets lm ON lm.id = l.lead_magnet_id JOIN channels c ON c.id = lm.channel_id WHERE c.user_id = $1", user["id"])
    channels = await fetch_one(
        "SELECT COUNT(*) as count FROM channels WHERE user_id = $1 AND is_active = 1", user["id"])

    v = visits["count"] if visits else 0
    s = subs["count"] if subs else 0
    l = leads["count"] if leads else 0
    ch = channels["count"] if channels else 0
    conv = f"{(s/v*100):.1f}%" if v > 0 else "—"

    await _send_to_chat(max_api, chat_id,
        f"📊 **Статистика:**\n\n"
        f"📺 Каналов: {ch}\n"
        f"👁 Визитов: {v}\n"
        f"👤 Подписчиков: {s}\n"
        f"🧲 Лидов: {l}\n"
        f"📈 Конверсия: {conv}")


async def _cmd_check(max_api, chat_id: str, max_user_id: str, first_name: str):
    """Check and activate inactive MAX channels."""
    result = await _find_or_create_max_user(max_user_id, first_name)
    user = result["user"]
    inactive = await fetch_all(
        "SELECT id, max_chat_id, title FROM channels WHERE user_id = $1 AND platform = 'max' AND is_active = 0",
        user["id"],
    )
    if not inactive:
        await _send_to_chat(max_api, chat_id, "✅ Все ваши каналы уже активны.")
        return

    activated = 0
    for ch in inactive:
        if max_api and ch.get("max_chat_id"):
            try:
                membership = await max_api.get_membership(ch["max_chat_id"])
                if membership.get("success") and membership.get("data", {}).get("is_admin"):
                    await execute("UPDATE channels SET is_active = 1 WHERE id = $1", ch["id"])
                    activated += 1
            except Exception:
                pass
    if activated > 0:
        await _send_to_chat(max_api, chat_id,
            f"✅ Активировано каналов: {activated}\n\nОткройте личный кабинет для настройки.")
    else:
        await _send_to_chat(max_api, chat_id,
            "⚠️ Бот всё ещё не является администратором.\n\n"
            "Откройте канал → Настройки → Администраторы → сделайте бота админом, затем /check.")


async def _cmd_login(max_api, chat_id: str, max_user_id: str, first_name: str):
    """Generate fresh login link for returning users."""
    result = await _find_or_create_max_user(max_user_id, first_name, dialog_chat_id=chat_id)
    token = result["token"]
    login_url = f"{settings.APP_URL}/login?token={token}"
    await _send_to_chat(max_api, chat_id,
        f"🔑 **Вход в личный кабинет**\n\n"
        f"Нажмите кнопку ниже для входа:",
        buttons=[[{"type": "link", "text": "🔑 Открыть личный кабинет", "url": login_url}]],
    )


async def _cmd_help(max_api, chat_id: str):
    """Show help message."""
    app_url = settings.APP_URL
    await _send_to_chat(max_api, chat_id,
        f"❓ **Помощь**\n\n"
        f"Я — бот для отслеживания подписчиков каналов и автоматизации.\n\n"
        f"📋 **Команды:**\n"
        f"/start — главное меню + авторизация\n"
        f"/login — получить ссылку для входа\n"
        f"/channels — список подключенных каналов\n"
        f"/links — ссылки отслеживания\n"
        f"/newlink — создать новую ссылку\n"
        f"/giveaways — розыгрыши\n"
        f"/newgiveaway — создать розыгрыш\n"
        f"/pins — закрепы и лид-магниты\n"
        f"/newpin — создать закреп\n"
        f"/newleadmagnet — создать лид-магнит\n"
        f"/stats — статистика\n"
        f"/check — проверить статус каналов\n"
        f"/help — эта справка\n\n"
        f"📌 **Как подключить канал:**\n"
        f"1. Напишите /start для авторизации\n"
        f"2. Добавьте бота администратором в канал\n"
        f"3. Канал появится автоматически\n\n"
        f"🌐 Личный кабинет: {app_url}")


# ---- Conversation state for multi-step flows ----
# In-memory state for active conversations (keyed by max_user_id)
_conversation_state: Dict[str, dict] = {}


async def _check_channel_billing(channel_id: int) -> bool:
    """Check if channel has an active subscription (billing)."""
    billing = await fetch_one(
        "SELECT id, status, expires_at FROM channel_billing WHERE channel_id = $1 AND status = 'active' AND expires_at > NOW()",
        channel_id,
    )
    return billing is not None


async def _send_subscription_required(max_api, chat_id: str, channel_title: str, max_user_id: str):
    """Send message that subscription is required."""
    result = await _find_or_create_max_user(max_user_id, "")
    token = result["token"]
    app_url = settings.APP_URL
    billing_url = f"{app_url}/login?token={token}&redirect=/billing"
    await _send_to_chat(max_api, chat_id,
        f"⚠️ **Подписка недействительна**\n\n"
        f"Для работы с каналом «{channel_title}» необходима активная подписка.\n\n"
        f"Продлите подписку, чтобы создавать ссылки, закрепы, лид-магниты и розыгрыши.",
        buttons=[[{"type": "link", "text": "💳 Перейти к тарифам", "url": billing_url}]],
    )


async def _get_user_channels(max_user_id: str):
    """Get user's channels for selection."""
    user = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", max_user_id)
    if not user:
        return []
    return await fetch_all(
        "SELECT id, title, tracking_code, platform FROM channels WHERE user_id = $1 AND is_active = 1 ORDER BY created_at DESC",
        user["id"],
    )


async def _cmd_newlink(max_api, chat_id: str, max_user_id: str):
    """Start creating a new tracking link."""
    channels = await _get_user_channels(max_user_id)
    if not channels:
        await _send_to_chat(max_api, chat_id,
            "⚠️ У вас нет активных каналов. Сначала добавьте бота в канал.")
        return

    if len(channels) == 1:
        has_billing = await _check_channel_billing(channels[0]["id"])
        if not has_billing:
            await _send_subscription_required(max_api, chat_id, channels[0]["title"], max_user_id)
            return
        _conversation_state[max_user_id] = {
            "action": "newlink",
            "step": "name",
            "channel_id": channels[0]["id"],
            "channel_title": channels[0]["title"],
        }
        await _send_to_chat(max_api, chat_id,
            f"🔗 Создание ссылки для канала «{channels[0]['title']}»\n\n"
            f"Введите название ссылки (например: \"Реклама в Telegram\"):")
    else:
        lines = ["🔗 **Создание ссылки**\n\nВыберите канал (введите номер):\n"]
        for i, ch in enumerate(channels, 1):
            lines.append(f"{i}. {ch['title']}")
        _conversation_state[max_user_id] = {
            "action": "newlink",
            "step": "select_channel",
            "channels": [{"id": c["id"], "title": c["title"]} for c in channels],
        }
        await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_newgiveaway(max_api, chat_id: str, max_user_id: str):
    """Start creating a new giveaway."""
    channels = await _get_user_channels(max_user_id)
    if not channels:
        await _send_to_chat(max_api, chat_id,
            "⚠️ У вас нет активных каналов. Сначала добавьте бота в канал.")
        return

    if len(channels) == 1:
        has_billing = await _check_channel_billing(channels[0]["id"])
        if not has_billing:
            await _send_subscription_required(max_api, chat_id, channels[0]["title"], max_user_id)
            return
        _conversation_state[max_user_id] = {
            "action": "newgiveaway",
            "step": "title",
            "channel_id": channels[0]["id"],
            "channel_title": channels[0]["title"],
        }
        await _send_to_chat(max_api, chat_id,
            f"🎁 Создание розыгрыша для канала «{channels[0]['title']}»\n\n"
            f"Введите название розыгрыша:")
    else:
        lines = ["🎁 **Создание розыгрыша**\n\nВыберите канал (введите номер):\n"]
        for i, ch in enumerate(channels, 1):
            lines.append(f"{i}. {ch['title']}")
        _conversation_state[max_user_id] = {
            "action": "newgiveaway",
            "step": "select_channel",
            "channels": [{"id": c["id"], "title": c["title"]} for c in channels],
        }
        await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_newpin(max_api, chat_id: str, max_user_id: str):
    """Start creating a new pin post / lead magnet."""
    channels = await _get_user_channels(max_user_id)
    if not channels:
        await _send_to_chat(max_api, chat_id,
            "⚠️ У вас нет активных каналов. Сначала добавьте бота в канал.")
        return

    if len(channels) == 1:
        has_billing = await _check_channel_billing(channels[0]["id"])
        if not has_billing:
            await _send_subscription_required(max_api, chat_id, channels[0]["title"], max_user_id)
            return
        _conversation_state[max_user_id] = {
            "action": "newpin",
            "step": "title",
            "channel_id": channels[0]["id"],
            "channel_title": channels[0]["title"],
        }
        await _send_to_chat(max_api, chat_id,
            f"📌 Создание закрепа для канала «{channels[0]['title']}»\n\n"
            f"Введите заголовок закрепа:")
    else:
        lines = ["📌 **Создание закрепа**\n\nВыберите канал (введите номер):\n"]
        for i, ch in enumerate(channels, 1):
            lines.append(f"{i}. {ch['title']}")
        _conversation_state[max_user_id] = {
            "action": "newpin",
            "step": "select_channel",
            "channels": [{"id": c["id"], "title": c["title"]} for c in channels],
        }
        await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _cmd_newleadmagnet(max_api, chat_id: str, max_user_id: str):
    """Start creating a new lead magnet."""
    channels = await _get_user_channels(max_user_id)
    if not channels:
        await _send_to_chat(max_api, chat_id,
            "⚠️ У вас нет активных каналов. Сначала добавьте бота в канал.")
        return

    if len(channels) == 1:
        has_billing = await _check_channel_billing(channels[0]["id"])
        if not has_billing:
            await _send_subscription_required(max_api, chat_id, channels[0]["title"], max_user_id)
            return
        _conversation_state[max_user_id] = {
            "action": "newleadmagnet",
            "step": "title",
            "channel_id": channels[0]["id"],
            "channel_title": channels[0]["title"],
        }
        await _send_to_chat(max_api, chat_id,
            f"🧲 Создание лид-магнита для канала «{channels[0]['title']}»\n\n"
            f"Введите название лид-магнита:")
    else:
        lines = ["🧲 **Создание лид-магнита**\n\nВыберите канал (введите номер):\n"]
        for i, ch in enumerate(channels, 1):
            lines.append(f"{i}. {ch['title']}")
        _conversation_state[max_user_id] = {
            "action": "newleadmagnet",
            "step": "select_channel",
            "channels": [{"id": c["id"], "title": c["title"]} for c in channels],
        }
        await _send_to_chat(max_api, chat_id, "\n".join(lines))


async def _handle_conversation(max_api, chat_id: str, max_user_id: str, text: str) -> bool:
    """Handle multi-step conversation flow. Returns True if handled."""
    state = _conversation_state.get(max_user_id)
    if not state:
        return False

    action = state["action"]
    step = state["step"]

    # Cancel
    if text.lower() in ("/cancel", "отмена", "отменить"):
        del _conversation_state[max_user_id]
        await _send_to_chat(max_api, chat_id, "❌ Отменено.")
        return True

    # --- New Link flow ---
    if action == "newlink":
        if step == "select_channel":
            try:
                idx = int(text) - 1
                ch = state["channels"][idx]
                has_billing = await _check_channel_billing(ch["id"])
                if not has_billing:
                    del _conversation_state[max_user_id]
                    await _send_subscription_required(max_api, chat_id, ch["title"], max_user_id)
                    return True
                state["channel_id"] = ch["id"]
                state["channel_title"] = ch["title"]
                state["step"] = "name"
                await _send_to_chat(max_api, chat_id,
                    f"Канал: **{ch['title']}**\n\nВведите название ссылки:")
            except (ValueError, IndexError):
                await _send_to_chat(max_api, chat_id, "⚠️ Введите номер канала из списка.")
            return True

        if step == "name":
            state["link_name"] = text
            state["step"] = "link_type"
            await _send_to_chat(max_api, chat_id,
                f"Название: **{text}**\n\n"
                f"Выберите тип ссылки:\n"
                f"1. Лендинг (через страницу подписки + Яндекс Метрика)\n"
                f"2. Прямая (сразу переход в канал, только внутренний счётчик)")
            return True

        if step == "link_type":
            if text in ("1", "лендинг"):
                state["link_type"] = "landing"
            elif text in ("2", "прямая"):
                state["link_type"] = "direct"
            else:
                await _send_to_chat(max_api, chat_id, "⚠️ Введите 1 или 2.")
                return True
            state["step"] = "utm_source"
            link_type_label = "Лендинг" if state["link_type"] == "landing" else "Прямая"
            await _send_to_chat(max_api, chat_id,
                f"Тип: **{link_type_label}**\n\n"
                f"Введите UTM source (или `-` чтобы пропустить).\n"
                f"Примеры: telegram, vk, instagram")
            return True

        if step == "utm_source":
            state["utm_source"] = "" if text == "-" else text
            state["step"] = "confirm"
            name = state["link_name"]
            utm = state["utm_source"]
            link_type_label = "Лендинг" if state.get("link_type") == "landing" else "Прямая"
            await _send_to_chat(max_api, chat_id,
                f"📋 **Подтвердите создание ссылки:**\n\n"
                f"Канал: {state['channel_title']}\n"
                f"Название: {name}\n"
                f"Тип: {link_type_label}\n"
                f"UTM source: {utm or '—'}\n\n"
                f"Отправьте `да` для создания или `отмена` для отмены.")
            return True

        if step == "confirm":
            if text.lower() in ("да", "yes", "ок", "ok", "+"):
                short_code = secrets.token_hex(4)
                await execute(
                    """INSERT INTO tracking_links (channel_id, name, short_code, utm_source, link_type, clicks)
                       VALUES ($1, $2, $3, $4, $5, 0)""",
                    state["channel_id"], state["link_name"], short_code, state.get("utm_source", ""), state.get("link_type", "landing"),
                )
                app_url = settings.APP_URL
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id,
                    f"✅ Ссылка создана!\n\n"
                    f"🔗 {app_url}/go/{short_code}\n\n"
                    f"Используйте эту ссылку для отслеживания подписчиков.")
            else:
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id, "❌ Создание ссылки отменено.")
            return True

    # --- New Giveaway flow ---
    if action == "newgiveaway":
        if step == "select_channel":
            try:
                idx = int(text) - 1
                ch = state["channels"][idx]
                has_billing = await _check_channel_billing(ch["id"])
                if not has_billing:
                    del _conversation_state[max_user_id]
                    await _send_subscription_required(max_api, chat_id, ch["title"], max_user_id)
                    return True
                state["channel_id"] = ch["id"]
                state["channel_title"] = ch["title"]
                state["step"] = "title"
                await _send_to_chat(max_api, chat_id,
                    f"Канал: **{ch['title']}**\n\nВведите название розыгрыша:")
            except (ValueError, IndexError):
                await _send_to_chat(max_api, chat_id, "⚠️ Введите номер канала из списка.")
            return True

        if step == "title":
            state["gw_title"] = text
            state["step"] = "prize"
            await _send_to_chat(max_api, chat_id,
                f"Название: **{text}**\n\nОпишите приз:")
            return True

        if step == "prize":
            state["prize"] = text
            state["step"] = "confirm"
            await _send_to_chat(max_api, chat_id,
                f"📋 **Подтвердите создание розыгрыша:**\n\n"
                f"Канал: {state['channel_title']}\n"
                f"Название: {state['gw_title']}\n"
                f"Приз: {text}\n\n"
                f"Отправьте `да` для создания или `отмена` для отмены.")
            return True

        if step == "confirm":
            if text.lower() in ("да", "yes", "ок", "ok", "+"):
                try:
                    deep_link_code = f"gw_{secrets.token_hex(4)}"
                    import json as _json
                    prizes_json = _json.dumps([state["prize"]], ensure_ascii=False)
                    conditions_json = _json.dumps({"subscribe": True, "invite_friends": 0})
                    await execute(
                        """INSERT INTO giveaways (channel_id, title, message_text, prizes, conditions, deep_link_code, status, participant_count, winner_count)
                           VALUES ($1, $2, $3, $4, $5, $6, 'draft', 0, 1)""",
                        state["channel_id"], state["gw_title"], state["gw_title"], prizes_json, conditions_json, deep_link_code,
                    )
                    del _conversation_state[max_user_id]
                    await _send_to_chat(max_api, chat_id,
                        f"✅ Розыгрыш создан в статусе «черновик»!\n\n"
                        f"Активируйте его в личном кабинете или отправьте /giveaways для просмотра.")
                except Exception as e:
                    del _conversation_state[max_user_id]
                    print(f"[MAX Bot] newgiveaway INSERT failed: {e}")
                    await _send_to_chat(max_api, chat_id, f"⚠️ Ошибка создания розыгрыша: {str(e)}")
            else:
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id, "❌ Создание розыгрыша отменено.")
            return True

    # --- New Pin flow ---
    if action == "newpin":
        if step == "select_channel":
            try:
                idx = int(text) - 1
                ch = state["channels"][idx]
                has_billing = await _check_channel_billing(ch["id"])
                if not has_billing:
                    del _conversation_state[max_user_id]
                    await _send_subscription_required(max_api, chat_id, ch["title"], max_user_id)
                    return True
                state["channel_id"] = ch["id"]
                state["channel_title"] = ch["title"]
                state["step"] = "title"
                await _send_to_chat(max_api, chat_id,
                    f"Канал: **{ch['title']}**\n\nВведите заголовок закрепа:")
            except (ValueError, IndexError):
                await _send_to_chat(max_api, chat_id, "⚠️ Введите номер канала из списка.")
            return True

        if step == "title":
            state["pin_title"] = text
            state["step"] = "text"
            await _send_to_chat(max_api, chat_id,
                f"Заголовок: **{text}**\n\nВведите текст закрепа (сообщение для поста):")
            return True

        if step == "text":
            state["pin_text"] = text
            state["step"] = "confirm"
            await _send_to_chat(max_api, chat_id,
                f"📋 **Подтвердите создание закрепа:**\n\n"
                f"Канал: {state['channel_title']}\n"
                f"Заголовок: {state['pin_title']}\n"
                f"Текст: {text[:100]}{'...' if len(text) > 100 else ''}\n\n"
                f"Отправьте `да` для создания или `отмена` для отмены.")
            return True

        if step == "confirm":
            if text.lower() in ("да", "yes", "ок", "ok", "+"):
                await execute(
                    """INSERT INTO pin_posts (channel_id, title, message_text, status)
                       VALUES ($1, $2, $3, 'draft')""",
                    state["channel_id"], state["pin_title"], state["pin_text"],
                )
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id,
                    f"✅ Закреп создан в статусе «черновик»!\n\n"
                    f"Опубликуйте его в личном кабинете или отправьте /pins для просмотра.")
            else:
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id, "❌ Создание закрепа отменено.")
            return True

    # --- New Lead Magnet flow ---
    if action == "newleadmagnet":
        if step == "select_channel":
            try:
                idx = int(text) - 1
                ch = state["channels"][idx]
                has_billing = await _check_channel_billing(ch["id"])
                if not has_billing:
                    del _conversation_state[max_user_id]
                    await _send_subscription_required(max_api, chat_id, ch["title"], max_user_id)
                    return True
                state["channel_id"] = ch["id"]
                state["channel_title"] = ch["title"]
                state["step"] = "title"
                await _send_to_chat(max_api, chat_id,
                    f"Канал: **{ch['title']}**\n\nВведите название лид-магнита:")
            except (ValueError, IndexError):
                await _send_to_chat(max_api, chat_id, "⚠️ Введите номер канала из списка.")
            return True

        if step == "title":
            state["lm_title"] = text
            state["step"] = "message"
            await _send_to_chat(max_api, chat_id,
                f"Название: **{text}**\n\nВведите текст сообщения для лид-магнита (что получит пользователь):")
            return True

        if step == "message":
            state["lm_message"] = text
            state["step"] = "confirm"
            await _send_to_chat(max_api, chat_id,
                f"📋 **Подтвердите создание лид-магнита:**\n\n"
                f"Канал: {state['channel_title']}\n"
                f"Название: {state['lm_title']}\n"
                f"Сообщение: {text[:100]}{'...' if len(text) > 100 else ''}\n\n"
                f"⚠️ Файл можно прикрепить в личном кабинете.\n\n"
                f"Отправьте `да` для создания или `отмена` для отмены.")
            return True

        if step == "confirm":
            if text.lower() in ("да", "yes", "ок", "ok", "+"):
                code = secrets.token_hex(6)
                await execute(
                    """INSERT INTO lead_magnets (channel_id, title, message_text, code)
                       VALUES ($1, $2, $3, $4)""",
                    state["channel_id"], state["lm_title"], state["lm_message"], code,
                )
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id,
                    f"✅ Лид-магнит создан!\n\n"
                    f"📎 Код: `{code}`\n\n"
                    f"⚠️ Прикрепите файл через личный кабинет для полной работы.")
            else:
                del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id, "❌ Создание лид-магнита отменено.")
            return True

    # Unknown state — clean up
    del _conversation_state[max_user_id]
    return False


# ---- Process a single MAX update ----

async def process_max_update(body: dict):
    update_type = body.get("update_type")
    from ..services.max_api import get_max_api
    max_api = get_max_api()

    print(f"[MAX Bot] Event: {update_type}, keys: {list(body.keys())}")

    try:
        # === bot_started ===
        if update_type == "bot_started":
            max_user = body.get("user")
            if not max_user or not max_user.get("user_id"):
                print(f"[MAX Bot] bot_started: no user in event")
                return

            max_user_id = str(max_user["user_id"])
            first_name = max_user.get("name") or max_user.get("first_name", "")
            payload = body.get("payload", "")
            chat_id = _get_chat_id(body)

            # Check if user already exists (returning user)
            existing_user = await fetch_one("SELECT id, max_dialog_chat_id FROM users WHERE max_user_id = $1", max_user_id)
            is_returning = existing_user is not None

            print(f"[MAX Bot] bot_started: user={max_user_id}, chat_id={chat_id}, payload={payload}, returning={is_returning}")

            if not chat_id:
                # Try to get dialog chat_id from DB (previous interaction)
                if existing_user and existing_user.get("max_dialog_chat_id"):
                    chat_id = existing_user["max_dialog_chat_id"]
                print(f"[MAX Bot] bot_started: no chat_id in event, DB fallback={chat_id}")

            if not chat_id and max_api:
                # Last resort: try sending via user_id to create dialog
                print(f"[MAX Bot] bot_started: attempting send via user_id={max_user_id}")
                result = await max_api.send_direct_message(
                    max_user_id,
                    f"👋 Привет{', ' + first_name if first_name else ''}! Загружаю..."
                )
                if result.get("success"):
                    # Extract chat_id from response
                    msg = result.get("data", {}).get("message", {})
                    resp_chat_id = msg.get("recipient", {}).get("chat_id")
                    if resp_chat_id:
                        chat_id = str(resp_chat_id)
                        print(f"[MAX Bot] bot_started: got chat_id from send response: {chat_id}")
                else:
                    print(f"[MAX Bot] bot_started: send_direct_message failed: {result.get('error')}")

            if not chat_id:
                print(f"[MAX Bot] bot_started: still no chat_id, cannot respond. body: {body}")
                # Still create/update user record
                await _find_or_create_max_user(max_user_id, first_name)
                return

            # Save dialog chat_id to DB (survives restarts)
            await _save_dialog_chat_id(max_user_id, chat_id)

            # Always send start message with fresh auth token (for both new and returning users)
            await _cmd_start(max_api, chat_id, max_user_id, first_name, payload)

        # === message_created ===
        if update_type == "message_created":
            message = body.get("message", {})
            text = (message.get("body", {}).get("text") or "").strip()
            sender = message.get("sender")
            if not sender or not sender.get("user_id"):
                return

            max_user_id = str(sender["user_id"])
            username = sender.get("username") or ""
            first_name = sender.get("name") or sender.get("first_name", "")
            chat_id = _get_chat_id(body)

            print(f"[MAX Bot] message_created: user={max_user_id}, chat_id={chat_id}, text={text[:50]}")

            if not chat_id:
                print(f"[MAX Bot] message_created: no chat_id")
                return

            # Save dialog chat_id to DB
            await _save_dialog_chat_id(max_user_id, chat_id)

            # Ensure user exists and dialog_chat_id is saved
            await _find_or_create_max_user(max_user_id, first_name, dialog_chat_id=chat_id)

            # Route commands
            cmd = text.split()[0].lower() if text else ""
            args = text[len(cmd):].strip() if cmd else ""

            # Empty text or no command — treat as /start for returning users
            if not text:
                await _cmd_start(max_api, chat_id, max_user_id, first_name, "")
                return

            # Check conversation state first (for multi-step flows)
            if not cmd.startswith("/"):
                handled = await _handle_conversation(max_api, chat_id, max_user_id, text)
                if handled:
                    return

            # Cancel conversation on any new command
            if cmd.startswith("/") and max_user_id in _conversation_state:
                if cmd != "/cancel":
                    del _conversation_state[max_user_id]

            if cmd == "/start":
                payload = args
                if payload.startswith("lm_"):
                    await handle_lead_magnet(max_api, chat_id, max_user_id, username, first_name, payload)
                elif payload.startswith("shop_"):
                    tc = payload.replace("shop_", "")
                    app_url = settings.APP_URL
                    await _send_to_chat(max_api, chat_id, f"🛍 Каталог: {app_url}/shop.html?code=shop_{tc}")
                elif payload.startswith("gw_"):
                    await _find_or_create_max_user(max_user_id, first_name)
                    await handle_giveaway(max_api, chat_id, max_user_id, username, first_name, payload)
                else:
                    await _cmd_start(max_api, chat_id, max_user_id, first_name, payload)
            elif cmd == "/login":
                await _cmd_login(max_api, chat_id, max_user_id, first_name)
            elif cmd == "/channels":
                await _cmd_channels(max_api, chat_id, max_user_id)
            elif cmd == "/links":
                await _cmd_links(max_api, chat_id, max_user_id)
            elif cmd == "/newlink":
                await _cmd_newlink(max_api, chat_id, max_user_id)
            elif cmd == "/giveaways":
                await _cmd_giveaways(max_api, chat_id, max_user_id)
            elif cmd == "/newgiveaway":
                await _cmd_newgiveaway(max_api, chat_id, max_user_id)
            elif cmd == "/pins":
                await _cmd_pins(max_api, chat_id, max_user_id)
            elif cmd == "/newpin":
                await _cmd_newpin(max_api, chat_id, max_user_id)
            elif cmd == "/newleadmagnet":
                await _cmd_newleadmagnet(max_api, chat_id, max_user_id)
            elif cmd == "/stats":
                await _cmd_stats(max_api, chat_id, max_user_id)
            elif cmd == "/check":
                await _cmd_check(max_api, chat_id, max_user_id, first_name)
            elif cmd == "/help":
                await _cmd_help(max_api, chat_id)
            elif cmd == "/cancel":
                if max_user_id in _conversation_state:
                    del _conversation_state[max_user_id]
                await _send_to_chat(max_api, chat_id, "❌ Отменено.")
            elif not cmd.startswith("/"):
                # User sent a non-command message and no active conversation
                # Respond with help to avoid "nothing happens" experience
                await _cmd_start(max_api, chat_id, max_user_id, first_name, "")

        # === message_callback (inline button clicks) ===
        if update_type == "message_callback":
            callback_id = body.get("callback", {}).get("callback_id") or body.get("callback_id", "")
            payload = body.get("callback", {}).get("payload") or body.get("payload", "")
            user_info = body.get("callback", {}).get("user") or body.get("user", {})
            max_user_id = str(user_info.get("user_id", ""))
            first_name = user_info.get("name") or user_info.get("first_name", "")
            event_chat_id = _get_chat_id(body)

            print(f"[MAX Bot] message_callback: user={max_user_id}, payload={payload}, callback_id={callback_id}, chat_id={event_chat_id}")

            if not max_user_id:
                print(f"[MAX Bot] message_callback: missing user_id")
                return

            # Answer the callback to dismiss loading spinner
            if callback_id and max_api:
                try:
                    await max_api.answer_callback(callback_id)
                except Exception as e:
                    print(f"[MAX Bot] answer_callback failed: {e}")

            # Callback from channel post — respond via user's DM, not the channel
            # Get or create user's dialog chat_id for DM
            await _find_or_create_max_user(max_user_id, first_name)
            user_chat_id = await _get_user_dialog_chat_id(max_user_id)

            if not user_chat_id and max_api:
                # No stored dialog — create one via send_direct_message
                try:
                    result = await max_api.send_direct_message(max_user_id, "⏳ Загружаю...")
                    if result.get("success"):
                        msg = result.get("data", {}).get("message", {})
                        resp_chat_id = msg.get("recipient", {}).get("chat_id")
                        if resp_chat_id:
                            user_chat_id = str(resp_chat_id)
                            await _save_dialog_chat_id(max_user_id, user_chat_id)
                except Exception as e:
                    print(f"[MAX Bot] Failed to create dialog for callback user: {e}")

            if not user_chat_id:
                print(f"[MAX Bot] message_callback: cannot find/create dialog for user={max_user_id}")
                return

            print(f"[MAX Bot] message_callback: resolved user_chat_id={user_chat_id}, processing payload={payload}")

            if payload.startswith("lm_"):
                try:
                    await handle_lead_magnet(max_api, user_chat_id, max_user_id, "", first_name, payload)
                    print(f"[MAX Bot] message_callback: handle_lead_magnet completed for {payload}")
                except Exception as e:
                    import traceback
                    print(f"[MAX Bot] message_callback: handle_lead_magnet FAILED: {e}")
                    traceback.print_exc()
            elif payload.startswith("gw_"):
                try:
                    await handle_giveaway(max_api, user_chat_id, max_user_id, "", first_name, payload)
                except Exception as e:
                    import traceback
                    print(f"[MAX Bot] message_callback: handle_giveaway FAILED: {e}")
                    traceback.print_exc()
            else:
                print(f"[MAX Bot] message_callback: unknown payload: {payload}")

        # === bot_added ===
        if update_type == "bot_added":
            raw_chat_id = body.get("chat_id") or body.get("chat", {}).get("chat_id")
            if not raw_chat_id:
                print(f"[MAX Bot] bot_added: no chat_id")
                return

            chat_id_str = str(raw_chat_id)
            try:
                chat_id_int = int(raw_chat_id)
            except (ValueError, TypeError):
                print(f"[MAX Bot] Invalid chat_id: {raw_chat_id}")
                return

            print(f"[MAX Bot] bot_added: chat_id={chat_id_str}")

            chat_title = body.get("chat", {}).get("title") or body.get("title") or ""
            chat_link = body.get("chat", {}).get("link") or body.get("link") or None
            chat_owner_id = body.get("chat", {}).get("owner_id") or None

            # Fetch chat info from API for more complete data
            if max_api:
                try:
                    chat_info = await max_api.get_chat(chat_id_str)
                    if chat_info.get("success") and chat_info.get("data"):
                        chat_title = chat_info["data"].get("title") or chat_title
                        chat_link = chat_info["data"].get("link") or chat_link
                        chat_owner_id = chat_info["data"].get("owner_id") or chat_owner_id
                        print(f"[MAX Bot] bot_added: title={chat_title}, owner={chat_owner_id}")
                except Exception as e:
                    print(f"[MAX Bot] getChat failed: {e}")

            if not chat_title:
                chat_title = "MAX Channel"

            # Check admin status
            is_admin = False
            if max_api:
                try:
                    membership = await max_api.get_membership(chat_id_str)
                    is_admin = membership.get("success") and membership.get("data", {}).get("is_admin", False)
                except Exception:
                    pass

            existing = await fetch_one(
                "SELECT id, is_active, trial_used FROM channels WHERE max_chat_id = $1",
                chat_id_str,
            )

            # Find owner: first from API owner_id, then from user who added (inviter_id)
            bind_user_id = None
            owner_max_user_id = None

            # Method 1: chat owner_id from API
            if chat_owner_id:
                owner_max_user_id = str(chat_owner_id)
                owner_row = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", owner_max_user_id)
                if owner_row:
                    bind_user_id = owner_row["id"]

            # Method 2: inviter_id from event (user who added the bot)
            if not bind_user_id:
                inviter_id = body.get("inviter_id") or body.get("user", {}).get("user_id")
                if inviter_id:
                    inviter_max_id = str(inviter_id)
                    inviter_row = await fetch_one("SELECT id FROM users WHERE max_user_id = $1", inviter_max_id)
                    if inviter_row:
                        bind_user_id = inviter_row["id"]
                        owner_max_user_id = inviter_max_id

            # Method 3: most recent user who interacted with bot (last 10 min)
            if not bind_user_id:
                recent = await fetch_one("""
                    SELECT id, max_user_id FROM users
                    WHERE max_user_id IS NOT NULL AND max_dialog_chat_id IS NOT NULL
                    AND created_at > NOW() - INTERVAL '10 minutes'
                    ORDER BY id DESC LIMIT 1
                """)
                if recent:
                    bind_user_id = recent["id"]
                    owner_max_user_id = recent["max_user_id"]

            if not existing:
                tracking_code = _generate_tracking_code()
                active_status = 1 if is_admin else 0

                # Determine join_link: if chat_link looks like a URL, use it
                _join_link = chat_link if chat_link and ("http" in chat_link or "/" in chat_link) else None
                await execute("""
                    INSERT INTO channels (channel_id, title, username, max_chat_id, max_connected, tracking_code, platform, is_active, user_id, owner_id, join_link)
                    VALUES ($1, $2, $3, $4, 1, $5, 'max', $6, $7, $8, $9)
                """, chat_id_str, chat_title, chat_link, chat_id_str, tracking_code, active_status, bind_user_id, bind_user_id, _join_link)

                # Activate trial
                new_channel = await fetch_one("SELECT id FROM channels WHERE max_chat_id = $1", chat_id_str)
                if new_channel:
                    await execute("""
                        INSERT INTO channel_billing (channel_id, plan, status, started_at, expires_at)
                        VALUES ($1, 'trial', 'active', NOW(), NOW() + INTERVAL '2 days')
                        ON CONFLICT DO NOTHING
                    """, new_channel["id"])
                    await execute("UPDATE channels SET trial_used = TRUE WHERE id = $1", new_channel["id"])

                # Notify owner using DB-stored dialog chat_id (survives restarts!)
                if bind_user_id and owner_max_user_id:
                    try:
                        if is_admin:
                            await _send_to_user_by_id(max_api, owner_max_user_id,
                                f"✅ Канал «{chat_title}» успешно подключен!\n\n"
                                f"🔗 Код отслеживания: `{tracking_code}`\n\n"
                                f"🎁 Активирован бесплатный пробный период на 2 дня!\n\n"
                                f"Откройте личный кабинет для настройки.")
                        else:
                            await _send_to_user_by_id(max_api, owner_max_user_id,
                                f"⚠️ Бот добавлен в канал «{chat_title}», но не является администратором.\n\n"
                                f"1. Откройте канал → Настройки → Администраторы\n"
                                f"2. Сделайте бота администратором\n"
                                f"3. Напишите мне /check")
                    except Exception as e:
                        print(f"[MAX Bot] Notify owner failed: {e}")
                elif max_api:
                    # No known owner - post in the channel itself
                    try:
                        await max_api.send_message(chat_id_str,
                            f"✅ Бот подключен!\n\n🔗 Код: `{tracking_code}`\nДля настройки напишите /start боту в ЛС.")
                    except Exception:
                        pass
            else:
                # Channel exists - update but don't re-activate trial
                active_status = 1 if is_admin else existing.get("is_active", 0)
                _join_link = chat_link if chat_link and ("http" in chat_link or "/" in chat_link) else None
                await execute("""
                    UPDATE channels SET is_active = $1, max_connected = 1, title = $2,
                        username = COALESCE($3, username),
                        user_id = COALESCE(user_id, $4),
                        join_link = COALESCE($6, join_link)
                    WHERE id = $5
                """, active_status, chat_title, chat_link, bind_user_id, existing["id"], _join_link)

                # Notify owner about re-connection
                if bind_user_id and owner_max_user_id:
                    try:
                        if is_admin:
                            await _send_to_user_by_id(max_api, owner_max_user_id,
                                f"✅ Канал «{chat_title}» снова подключен!")
                        else:
                            await _send_to_user_by_id(max_api, owner_max_user_id,
                                f"⚠️ Бот снова добавлен в «{chat_title}», но не является администратором.\n"
                                f"Сделайте бота админом и напишите /check.")
                    except Exception:
                        pass

        # === bot_removed ===
        if update_type == "bot_removed":
            removed_chat_id = str(body.get("chat_id") or body.get("chat", {}).get("chat_id") or "")
            if removed_chat_id:
                await execute("""
                    UPDATE channels SET is_active = 0, max_connected = 0
                    WHERE max_chat_id = $1
                """, removed_chat_id)
                print(f"[MAX Bot] Channel deactivated: {removed_chat_id}")

        # === user_added / chat_member_joined ===
        if update_type in ("user_added", "chat_member_joined"):
            max_chat_id = str(body.get("chat_id") or body.get("chat", {}).get("chat_id") or "")
            user_id = str(body.get("user", {}).get("user_id") or "")
            username = body.get("user", {}).get("username") or ""
            first_name = body.get("user", {}).get("name") or body.get("user", {}).get("first_name", "")

            channel = await fetch_one(
                "SELECT id, platform FROM channels WHERE max_chat_id = $1",
                max_chat_id,
            )
            if not channel:
                return

            # Find matching visit
            visit = None
            if user_id:
                visit = await fetch_one("""
                    SELECT id FROM visits WHERE channel_id = $1 AND (max_user_id = $2 OR username = $3)
                    AND visited_at > NOW() - INTERVAL '7 days' ORDER BY visited_at DESC LIMIT 1
                """, channel["id"], user_id, username)
            if not visit:
                visit = await fetch_one("""
                    SELECT id FROM visits WHERE channel_id = $1
                    AND visited_at > NOW() - INTERVAL '1 hour' ORDER BY visited_at DESC LIMIT 1
                """, channel["id"])

            try:
                await execute("""
                    INSERT INTO subscriptions (channel_id, telegram_id, max_user_id, username, first_name, visit_id, platform)
                    VALUES ($1, NULL, $2, $3, $4, $5, 'max')
                """, channel["id"], user_id, username, first_name, visit["id"] if visit else None)
                print(f"[MAX Bot] Subscription: user={username or user_id}, channel={channel['id']}")
            except Exception as e:
                if "duplicate" not in str(e).lower() and "unique" not in str(e).lower():
                    print(f"[MAX Bot] Subscription error: {e}")

            # Notify owner
            try:
                from ..services.messenger import notify_owner
                source = "прямой"
                if visit:
                    v = await fetch_one("SELECT utm_source, utm_campaign FROM visits WHERE id = $1", visit["id"])
                    if v and v.get("utm_source"):
                        source = v["utm_source"] + (f" / {v['utm_campaign']}" if v.get("utm_campaign") else "")
                ch = await fetch_one("SELECT title FROM channels WHERE id = $1", channel["id"])
                await notify_owner(channel["id"],
                    f"🔔 Новый подписчик в «{ch.get('title', 'канале') if ch else 'канале'}»!\n"
                    f"👤 {first_name or ''}{' @' + username if username else ''}\n"
                    f"📊 Источник: {source}")
            except Exception:
                pass

    except Exception as e:
        import traceback
        print(f"[MAX Bot] Error processing {update_type}: {e}")
        traceback.print_exc()
        # Do NOT re-raise — return gracefully so MAX doesn't retry and cause duplicates


# ---- Webhook endpoint ----

@router.post("/")
async def max_webhook(request: Request):
    body = await request.json()
    update_type = body.get("update_type", "unknown")
    print(f"[MAX Bot] Webhook received: {update_type}, body: {body}")

    # Log raw webhook for debugging
    try:
        import json as _json
        await execute(
            "INSERT INTO webhook_logs (platform, event_type, raw_body) VALUES ('max', $1, $2::jsonb)",
            update_type, _json.dumps(body, ensure_ascii=False),
        )
    except Exception as log_err:
        print(f"[MAX Bot] Failed to log webhook: {log_err}")

    await process_max_update(body)
    return {"success": True}


@router.get("/debug-logs")
async def debug_webhook_logs():
    """Show recent webhook logs for debugging."""
    logs = await fetch_all(
        "SELECT id, event_type, raw_body, created_at FROM webhook_logs ORDER BY id DESC LIMIT 20"
    )
    return {"success": True, "logs": logs}


# ---- Long polling fallback ----

async def _max_poll_loop():
    from ..services.max_api import get_max_api
    await asyncio.sleep(8)

    max_api = get_max_api()
    if not max_api:
        print("[MAX Bot] No token, polling disabled")
        return

    # Verify token works
    me = await max_api.get_me()
    if not me.get("success"):
        print(f"[MAX Bot] getMe failed: {me.get('error')} — polling aborted")
        return
    print(f"[MAX Bot] Bot: {me.get('data', {}).get('name', 'unknown')} (id={me.get('data', {}).get('user_id', '?')})")

    # Check if webhooks are active — if so, skip polling (webhook mode)
    try:
        subs_result = await max_api.get_subscriptions()
        if subs_result.get("success"):
            subscriptions = subs_result.get("data", {}).get("subscriptions", [])
            if subscriptions:
                print(f"[MAX Bot] Active webhooks found ({len(subscriptions)}), polling disabled — using webhook mode")
                for sub in subscriptions:
                    print(f"[MAX Bot]   webhook: {sub.get('url')}")
                return
            else:
                print("[MAX Bot] No webhooks found, starting polling")
    except Exception as e:
        print(f"[MAX Bot] Webhook check failed: {e}")

    marker = None
    print("[MAX Bot] Polling started")

    while True:
        try:
            result = await max_api.get_updates(marker=marker, timeout=30)
            if not result.get("success"):
                print(f"[MAX Bot] get_updates failed: {result.get('error')}")
                await asyncio.sleep(5)
                continue
            data = result.get("data", {})
            updates = data.get("updates", [])
            if updates:
                print(f"[MAX Bot] Got {len(updates)} updates")
            for upd in updates:
                try:
                    await process_max_update(upd)
                except Exception as ue:
                    import traceback
                    print(f"[MAX Bot] Update processing error: {ue}")
                    traceback.print_exc()
            new_marker = data.get("marker")
            if new_marker:
                marker = new_marker
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[MAX Bot] Poll error: {e}")
            await asyncio.sleep(5)


def start_max_polling():
    global _poll_task
    if not settings.MAX_BOT_TOKEN:
        return
    _poll_task = asyncio.create_task(_max_poll_loop())


def stop_max_polling():
    global _poll_task
    if _poll_task:
        _poll_task.cancel()
        _poll_task = None
