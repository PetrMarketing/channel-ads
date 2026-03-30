"""Telegram bot: long-polling background service + webhook endpoint.

Handles /start, /channels, /links, /giveaways, /pins, /stats, /help,
/newlink, /newgiveaway, /newpin, /newleadmagnet,
lead magnets, giveaways, channel membership events, account linking.
"""
import asyncio
import json
import re
import secrets
from typing import Optional

import aiohttp
from fastapi import APIRouter, Request

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import find_or_create_tg_user, create_jwt

router = APIRouter()

_poll_task: Optional[asyncio.Task] = None
_BASE = "https://api.telegram.org/bot"


def _api_url(method: str) -> str:
    return f"{_BASE}{settings.TELEGRAM_BOT_TOKEN}/{method}"


async def _tg_request(method: str, **kwargs):
    url = _api_url(method)
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=kwargs) as resp:
            return await resp.json()


async def _send_message(chat_id, text, **kwargs):
    return await _tg_request("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", **kwargs)


async def _send_photo(chat_id, photo, caption="", **kwargs):
    return await _tg_request("sendPhoto", chat_id=chat_id, photo=photo, caption=caption, parse_mode="HTML", **kwargs)


async def _send_document(chat_id, document, caption="", **kwargs):
    return await _tg_request("sendDocument", chat_id=chat_id, document=document, caption=caption, parse_mode="HTML", **kwargs)


async def _send_video(chat_id, video, caption="", **kwargs):
    return await _tg_request("sendVideo", chat_id=chat_id, video=video, caption=caption, parse_mode="HTML", **kwargs)


def _generate_tracking_code() -> str:
    return secrets.token_hex(8)


async def _fetch_tg_invite_link(chat_id) -> Optional[str]:
    """Fetch or create an invite link for a Telegram channel using Bot API."""
    try:
        # exportChatInviteLink creates a new primary invite link (revokes old one)
        # createChatInviteLink creates an additional invite link (safer)
        result = await _tg_request("createChatInviteLink", chat_id=chat_id, name="channel-ads")
        if result.get("ok") and result.get("result", {}).get("invite_link"):
            link = result["result"]["invite_link"]
            print(f"[TG Bot] Created invite link for {chat_id}: {link}")
            return link
        # Fallback: try exportChatInviteLink
        result = await _tg_request("exportChatInviteLink", chat_id=chat_id)
        if result.get("ok") and result.get("result"):
            link = result["result"]
            print(f"[TG Bot] Exported invite link for {chat_id}: {link}")
            return link
        print(f"[TG Bot] Could not get invite link for {chat_id}: {result}")
    except Exception as e:
        print(f"[TG Bot] Error fetching invite link for {chat_id}: {e}")
    return None


# ---- Conversation state for multi-step flows ----

_conversation_state: dict = {}


async def _check_channel_billing(channel_id: int) -> bool:
    """Check if channel has an active subscription (billing)."""
    billing = await fetch_one(
        "SELECT id, status, expires_at FROM channel_billing WHERE channel_id = $1 AND status = 'active' AND expires_at > NOW()",
        channel_id,
    )
    return billing is not None


async def _get_user_channels(tg_user: dict):
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]
    return await fetch_all(
        "SELECT id, title, tracking_code, platform FROM channels WHERE user_id = $1 AND is_active = 1 ORDER BY created_at DESC",
        user["id"],
    ), user, result["token"]


async def _send_subscription_required(chat_id: int, channel_title: str, token: str):
    """Send message that subscription is required."""
    app_url = settings.APP_URL
    billing_url = f"{app_url}/login?token={token}&redirect=/billing"
    await _send_message(
        chat_id,
        f"⚠️ <b>Подписка недействительна</b>\n\n"
        f"Для работы с каналом «{channel_title}» необходима активная подписка.\n\n"
        f"Продлите подписку, чтобы создавать ссылки, закрепы, лид-магниты и розыгрыши.",
        reply_markup={
            "inline_keyboard": [[
                {"text": "💳 Перейти к тарифам", "url": billing_url}
            ]]
        },
    )


# ---- Lead magnet delivery ----

async def handle_lead_magnet(chat_id: int, tg_user: dict, code: str):
    # Strip lm_ prefix if present (deep links use ?start=lm_CODE)
    lm_code = code[3:] if code.startswith("lm_") else code
    lm = await fetch_one("""
        SELECT lm.*, c.title as channel_title, c.channel_id as tg_channel_id, c.username as channel_username
        FROM lead_magnets lm JOIN channels c ON c.id = lm.channel_id
        WHERE lm.code = $1
    """, lm_code)
    if not lm:
        await _send_message(chat_id, "Лид-магнит не найден или был удалён.")
        return

    tg_id = tg_user["id"]

    # Check subscription if required
    if lm.get("subscribers_only") and lm.get("tg_channel_id"):
        try:
            result = await _tg_request("getChatMember", chat_id=int(lm["tg_channel_id"]), user_id=tg_id)
            status = result.get("result", {}).get("status", "")
            is_member = status in ("member", "administrator", "creator")
        except Exception:
            is_member = False
        if not is_member:
            channel_title = lm.get("channel_title") or "канал"
            channel_username = lm.get("channel_username") or ""
            sub_url = f"https://t.me/{channel_username}" if channel_username else f"https://t.me/c/{str(lm['tg_channel_id'])[4:]}"
            keyboard = {"inline_keyboard": [
                [{"text": f"Подписаться на {channel_title}", "url": sub_url}],
                [{"text": "✅ Я подписался", "callback_data": f"lm_{lm_code}"}],
            ]}
            await _send_message(chat_id,
                f"📢 Чтобы получить материал, сначала подпишитесь на канал <b>{channel_title}</b>.",
                reply_markup=keyboard)
            return

    existing = await fetch_one("SELECT id FROM leads WHERE lead_magnet_id = $1 AND telegram_id = $2", lm["id"], tg_id)
    if existing:
        lead_id = existing["id"]
    else:
        lead_id = await execute_returning_id(
            "INSERT INTO leads (lead_magnet_id, telegram_id, username, first_name) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
            lm["id"], tg_id, tg_user.get("username"), tg_user.get("first_name", ""),
        )
    # Always schedule funnel (reschedules from now, cancels old pending)
    if lead_id:
        from ..services.funnel_processor import schedule_funnel_for_lead
        await schedule_funnel_for_lead(lead_id, lm["id"], telegram_id=tg_id)

    from ..services.messenger import (
        sanitize_html_for_telegram, send_telegram_photo, send_telegram_document,
        send_telegram_video, send_telegram_voice, send_telegram_video_note,
    )
    text = sanitize_html_for_telegram(lm.get("message_text") or "")

    file_id = lm.get("telegram_file_id")
    file_path = lm.get("file_path")
    file_data = lm.get("file_data")
    file_type = lm.get("file_type", "document")
    lm_attach_type = lm.get("attach_type") or file_type

    print(f"[TG Bot] Lead magnet #{lm['id']}: file_id={bool(file_id)}, file_path={file_path}, file_data={len(file_data) if file_data else 0}b, type={lm_attach_type}")

    # Restore file from DB if missing on disk (Render ephemeral filesystem)
    if file_path and not file_id:
        from ..services.file_storage import ensure_file
        try:
            file_path = ensure_file(file_path, file_data)
            print(f"[TG Bot] ensure_file result: {file_path}")
        except Exception as e:
            print(f"[TG Bot] ensure_file ERROR: {e}")
            file_path = None

    # If local file still not available but we have binary data, write to temp file
    if not file_id and not file_path and file_data:
        import tempfile, os
        ext_map = {"photo": ".jpg", "video": ".mp4", "voice": ".ogg", "video_note": ".mp4", "document": ""}
        ext = ext_map.get(lm_attach_type, "")
        try:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(file_data if isinstance(file_data, (bytes, bytearray)) else bytes(file_data))
            tmp.close()
            file_path = tmp.name
            print(f"[TG Bot] Wrote temp file: {file_path} ({len(file_data)}b)")
        except Exception as e:
            print(f"[TG Bot] Temp file write ERROR: {e}")

    # Track if we created a temp file so we can clean it up
    _tmp_file = file_path if (not file_id and file_path and file_data and file_path != lm.get("file_path")) else None

    if file_id or file_path:
        source = file_id or file_path
        # Use messenger.py functions that handle both file_id (JSON) and local files (FormData)
        result = None
        try:
            if lm_attach_type == "photo":
                result = await send_telegram_photo(chat_id, source, caption=text)
            elif lm_attach_type == "video":
                result = await send_telegram_video(chat_id, source, caption=text)
            elif lm_attach_type == "voice":
                result = await send_telegram_voice(chat_id, source, caption=text)
            elif lm_attach_type == "video_note":
                result = await send_telegram_video_note(chat_id, source)
            else:
                result = await send_telegram_document(chat_id, source, caption=text)
        except Exception as e:
            print(f"[TG Bot] Send file ERROR: {e}")
            result = None
        finally:
            # Clean up temp file
            if _tmp_file:
                try:
                    import os
                    os.unlink(_tmp_file)
                except Exception:
                    pass

        print(f"[TG Bot] Send result ok={result.get('ok') if result else 'None'}, desc={result.get('description', '') if result else ''}")

        # Cache telegram_file_id after first successful upload to avoid re-uploading
        if result and result.get("ok") and not file_id:
            _cache_telegram_file_id(result, lm["id"], lm_attach_type)
        elif result and not result.get("ok"):
            # File send failed, send text as fallback
            print(f"[TG Bot] File send FAILED, sending text fallback")
            if text:
                await _send_message(chat_id, text)
    elif text:
        await _send_message(chat_id, text)
    else:
        await _send_message(chat_id, "Материал пока не загружен. Попробуйте позже.")


def _cache_telegram_file_id(api_result: dict, lead_magnet_id: int, attach_type: str):
    """Extract and save telegram_file_id from API response for future use."""
    import asyncio
    r = api_result.get("result", {})
    fid = None
    if attach_type == "photo":
        photos = r.get("photo", [])
        if photos:
            fid = photos[-1].get("file_id")  # largest size
    elif attach_type == "video":
        fid = r.get("video", {}).get("file_id")
    elif attach_type == "voice":
        fid = r.get("voice", {}).get("file_id")
    elif attach_type == "video_note":
        fid = r.get("video_note", {}).get("file_id")
    else:
        fid = r.get("document", {}).get("file_id")
    if fid:
        asyncio.create_task(
            execute("UPDATE lead_magnets SET telegram_file_id = $1 WHERE id = $2", fid, lead_magnet_id)
        )


# ---- paid chat handler ----

async def handle_paid_chat(chat_id: int, tg_user: dict, tracking_code: str):
    """Show paid chat info: description, plans, and payment button."""
    from ..database import fetch_one, fetch_all

    channel = await fetch_one("SELECT * FROM channels WHERE tracking_code = $1", tracking_code)
    if not channel:
        await _send_message(chat_id, "Канал не найден.")
        return

    notif = await fetch_one(
        "SELECT message_text, file_path, file_type, file_data FROM paid_chat_notifications WHERE channel_id = $1 AND event_type = 'before_subscribe' AND is_active = 1",
        channel["id"],
    )

    plans = await fetch_all(
        "SELECT id, plan_type, duration_days, price, currency, title, description FROM paid_chat_plans WHERE channel_id = $1 AND is_active = 1 ORDER BY sort_order, price",
        channel["id"],
    )

    lines = []
    channel_title = channel.get("title", "")
    if channel_title:
        lines.append(f"<b>{channel_title}</b>\n")

    if notif and notif.get("message_text"):
        from ..services.messenger import sanitize_html_for_telegram
        lines.append(sanitize_html_for_telegram(notif["message_text"]))
        lines.append("")

    if plans:
        lines.append("<b>Тарифы:</b>")
        for p in plans:
            price_str = f"{int(p['price']) if p['price'] == int(p['price']) else p['price']} {p.get('currency', 'RUB')}"
            name = p.get("title") or (
                "Разовая оплата" if p["plan_type"] == "one_time"
                else f"Подписка на {p['duration_days']} дн."
            )
            lines.append(f"  {name} — <b>{price_str}</b>")
            if p.get("description"):
                lines.append(f"  <i>{p['description']}</i>")

    if not plans:
        lines.append("Тарифы пока не настроены.")

    text = "\n".join(lines)

    app_url = settings.APP_URL
    from urllib.parse import urlencode
    pay_params = urlencode({"platform": "telegram", "tid": tg_user["id"], "name": tg_user.get("first_name", ""), "user": tg_user.get("username", "")})
    pay_url = f"{app_url}/pay/{tracking_code}?{pay_params}"
    keyboard = {"inline_keyboard": [[{"text": "Оплатить", "url": pay_url}]]}

    file_path = None
    if notif and notif.get("file_path"):
        try:
            from ..services.file_storage import ensure_file
            file_path = ensure_file(notif.get("file_path"), notif.get("file_data"))
        except Exception:
            file_path = None

    if file_path and (notif.get("file_type") or "").startswith("image"):
        from ..services.messenger import send_telegram_photo
        await send_telegram_photo(chat_id, file_path, caption=text, reply_markup=keyboard)
    else:
        await _send_message(chat_id, text, reply_markup=keyboard)


# ---- /start handler ----

async def handle_start(chat_id: int, tg_user: dict, payload: str = ""):
    if payload.startswith("lm_"):
        await handle_lead_magnet(chat_id, tg_user, payload)
        return
    if payload.startswith("gw_"):
        await handle_giveaway(chat_id, tg_user, payload)
        return
    if payload.startswith("paid_"):
        tracking_code = payload[5:]
        await handle_paid_chat(chat_id, tg_user, tracking_code)
        return
    if payload.startswith("shop_"):
        tracking_code = payload.replace("shop_", "")
        await handle_shop(chat_id, tg_user, tracking_code)
        return

    result = await find_or_create_tg_user(tg_user)
    token = result["token"]
    app_url = settings.APP_URL
    login_url = f"{app_url}/login?token={token}"

    await _send_message(
        chat_id,
        "👋 Привет! Я помогу отслеживать подписчиков твоих каналов.\n\n"
        "📌 <b>Как подключить канал:</b>\n"
        "1. Откройте ваш канал → Настройки → Администраторы\n"
        "2. Добавьте меня как администратора\n"
        "3. Каналы появятся в личном кабинете автоматически\n\n"
        "📋 <b>Команды бота:</b>\n"
        "/channels — мои каналы\n"
        "/links — ссылки отслеживания\n"
        "/giveaways — розыгрыши\n"
        "/pins — закрепы и лид-магниты\n"
        "/stats — статистика\n\n"
        "📝 <b>Создать:</b>\n"
        "/newlink — новая ссылка\n"
        "/newgiveaway — новый розыгрыш\n"
        "/newpin — новый закреп\n"
        "/newleadmagnet — новый лид-магнит\n"
        "/cancel — отменить текущее действие\n\n"
        "/help — помощь",
        reply_markup={
            "inline_keyboard": [[
                {"text": "📈 Открыть личный кабинет", "url": login_url}
            ]]
        },
    )


async def handle_giveaway(chat_id: int, tg_user: dict, code: str):
    gw = await fetch_one("""
        SELECT g.*, c.title as channel_title
        FROM giveaways g JOIN channels c ON c.id = g.channel_id
        WHERE g.deep_link_code = $1
    """, code)
    if not gw:
        await _send_message(chat_id, "Розыгрыш не найден или был удалён.")
        return
    if gw.get("status") == "finished":
        await _send_message(chat_id, "Этот розыгрыш уже завершён.")
        return
    if gw.get("status") == "draft":
        await _send_message(chat_id, "Розыгрыш ещё не начался.")
        return

    existing = await fetch_one(
        "SELECT id, participant_number FROM giveaway_participants WHERE giveaway_id = $1 AND telegram_id = $2",
        gw["id"], tg_user["id"],
    )
    if existing:
        await _send_message(chat_id, f"Вы уже участвуете! 🎟 Ваш номер: #{existing['participant_number']}")
        return

    count = await fetch_one("SELECT COUNT(*) as cnt FROM giveaway_participants WHERE giveaway_id = $1", gw["id"])
    num = (count["cnt"] if count else 0) + 1
    try:
        await execute(
            "INSERT INTO giveaway_participants (giveaway_id, telegram_id, username, first_name, participant_number, platform) VALUES ($1,$2,$3,$4,$5,'telegram') ON CONFLICT DO NOTHING",
            gw["id"], tg_user["id"], tg_user.get("username"), tg_user.get("first_name", ""), num,
        )
    except Exception as e:
        print(f"[TG Bot] handle_giveaway INSERT failed: {e}")
        await _send_message(chat_id, "⚠️ Не удалось зарегистрировать участие. Попробуйте ещё раз.")
        return
    # Update participants count
    try:
        await execute(
            "UPDATE giveaways SET participant_count = (SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = $1) WHERE id = $1",
            gw["id"],
        )
    except Exception:
        pass
    await _send_message(chat_id, f"🎉 Вы участвуете в розыгрыше «{gw.get('title', '')}»!\n\n🎟 Ваш номер: #{num}")


async def handle_shop(chat_id: int, tg_user: dict, tracking_code: str):
    app_url = settings.APP_URL
    shop_url = f"{app_url}/shop.html?code=shop_{tracking_code}"
    await _send_message(chat_id, "🛍 Откройте каталог для просмотра и заказа:",
                        reply_markup={"inline_keyboard": [[{"text": "🛍 Открыть каталог", "url": shop_url}]]})


# ---- Bot commands ----

async def cmd_channels(chat_id: int, tg_user: dict):
    """List user's channels."""
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]

    channels = await fetch_all(
        "SELECT id, title, tracking_code, is_active, platform FROM channels WHERE user_id = $1 ORDER BY created_at DESC",
        user["id"],
    )
    if not channels:
        await _send_message(chat_id,
            "📭 У вас пока нет подключенных каналов.\n\n"
            f"Чтобы подключить канал:\nОткройте канал → Настройки → Администраторы → добавьте бота @{settings.BOT_USERNAME}")
        return

    lines = ["📺 <b>Ваши каналы:</b>\n"]
    for ch in channels:
        status = "✅" if ch["is_active"] else "❌"
        platform_icon = "📱" if ch["platform"] == "max" else "✈️"
        lines.append(f"{status} {platform_icon} <b>{ch['title']}</b>")
        lines.append(f"   Код: <code>{ch['tracking_code']}</code>")
    await _send_message(chat_id, "\n".join(lines))


async def cmd_links(chat_id: int, tg_user: dict):
    """List user's tracking links."""
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]

    links = await fetch_all("""
        SELECT tl.name, tl.short_code, tl.clicks, tl.is_paused, c.title as channel_title
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE c.user_id = $1 ORDER BY tl.created_at DESC LIMIT 20
    """, user["id"])

    if not links:
        await _send_message(chat_id,
            "📭 У вас пока нет ссылок отслеживания.\n\nСоздайте их в личном кабинете.")
        return

    lines = ["🔗 <b>Ваши ссылки:</b>\n"]
    app_url = settings.APP_URL
    for lnk in links:
        status = "⏸" if lnk["is_paused"] else "▶️"
        lines.append(f"{status} <b>{lnk['name'] or lnk['short_code']}</b> ({lnk['channel_title']})")
        lines.append(f"   {app_url}/go/{lnk['short_code']} — {lnk['clicks']} кликов")
    await _send_message(chat_id, "\n".join(lines))


async def cmd_giveaways(chat_id: int, tg_user: dict):
    """List user's giveaways."""
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]

    giveaways = await fetch_all("""
        SELECT g.title, g.status, g.participant_count, c.title as channel_title
        FROM giveaways g JOIN channels c ON c.id = g.channel_id
        WHERE c.user_id = $1 ORDER BY g.created_at DESC LIMIT 10
    """, user["id"])

    if not giveaways:
        await _send_message(chat_id,
            "📭 У вас пока нет розыгрышей.\n\nСоздайте их в личном кабинете.")
        return

    status_map = {"draft": "📝", "active": "🎉", "finished": "🏆"}
    lines = ["🎁 <b>Ваши розыгрыши:</b>\n"]
    for gw in giveaways:
        icon = status_map.get(gw["status"], "❓")
        lines.append(f"{icon} <b>{gw['title']}</b> ({gw['channel_title']})")
        lines.append(f"   Статус: {gw['status']} | Участников: {gw['participant_count'] or 0}")
    await _send_message(chat_id, "\n".join(lines))


async def cmd_pins(chat_id: int, tg_user: dict):
    """List user's pin posts and lead magnets."""
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]

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
        lines.append("🧲 <b>Лид-магниты:</b>\n")
        for lm in lms:
            lines.append(f"📎 <b>{lm['title']}</b> ({lm['channel_title']})")
            lines.append(f"   Код: <code>{lm['code']}</code> | Лидов: {lm['lead_count']}")

    if pins:
        if lines:
            lines.append("")
        lines.append("📌 <b>Закрепы:</b>\n")
        status_map = {"draft": "📝", "published": "✅", "unpinned": "❌"}
        for p in pins:
            icon = status_map.get(p["status"], "❓")
            lines.append(f"{icon} <b>{p['title']}</b> ({p['channel_title']})")

    if not lines:
        await _send_message(chat_id,
            "📭 У вас пока нет закрепов и лид-магнитов.\n\nСоздайте их в личном кабинете.")
    else:
        await _send_message(chat_id, "\n".join(lines))


async def cmd_stats(chat_id: int, tg_user: dict):
    """Show user stats summary."""
    result = await find_or_create_tg_user(tg_user)
    user = result["user"]

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
    l_count = leads["count"] if leads else 0
    ch = channels["count"] if channels else 0
    conv = f"{(s/v*100):.1f}%" if v > 0 else "—"

    await _send_message(chat_id,
        f"📊 <b>Статистика:</b>\n\n"
        f"📺 Каналов: {ch}\n"
        f"👁 Визитов: {v}\n"
        f"👤 Подписчиков: {s}\n"
        f"🧲 Лидов: {l_count}\n"
        f"📈 Конверсия: {conv}")


async def cmd_help(chat_id: int, tg_user: dict):
    """Show help message."""
    result = await find_or_create_tg_user(tg_user)
    token = result["token"]
    app_url = settings.APP_URL
    login_url = f"{app_url}/login?token={token}"

    await _send_message(chat_id,
        "❓ <b>Помощь</b>\n\n"
        "Я — бот для отслеживания подписчиков каналов и автоматизации.\n\n"
        "📋 <b>Команды:</b>\n"
        "/start — главное меню + авторизация\n"
        "/channels — список подключенных каналов\n"
        "/links — ссылки отслеживания\n"
        "/giveaways — розыгрыши\n"
        "/pins — закрепы и лид-магниты\n"
        "/stats — статистика\n\n"
        "📝 <b>Создать:</b>\n"
        "/newlink — новая ссылка\n"
        "/newgiveaway — новый розыгрыш\n"
        "/newpin — новый закреп\n"
        "/newleadmagnet — новый лид-магнит\n"
        "/cancel — отменить текущее действие\n\n"
        "/help — эта справка\n\n"
        "📌 <b>Как подключить канал:</b>\n"
        "1. Напишите /start для авторизации\n"
        "2. Добавьте бота администратором в канал\n"
        "3. Канал появится автоматически",
        reply_markup={
            "inline_keyboard": [[
                {"text": "📈 Открыть личный кабинет", "url": login_url}
            ]]
        },
    )


# ---- Multi-step conversation handler ----

async def _handle_conversation(chat_id: int, tg_user: dict, text: str) -> bool:
    """Handle multi-step conversation flows. Returns True if message was consumed."""
    uid = tg_user["id"]
    state = _conversation_state.get(uid)
    if not state:
        return False

    flow = state["flow"]
    step = state["step"]

    # Cancel
    if text.lower() in ("отмена", "отменить"):
        _conversation_state.pop(uid, None)
        await _send_message(chat_id, "❌ Действие отменено.")
        return True

    # --- Channel selection step (shared by all flows) ---
    if step == "select_channel":
        channels = state["channels"]
        try:
            idx = int(text) - 1
        except (ValueError, TypeError):
            await _send_message(chat_id, "Введите номер канала из списка:")
            return True
        if idx < 0 or idx >= len(channels):
            await _send_message(chat_id, f"Введите число от 1 до {len(channels)}:")
            return True
        ch = channels[idx]
        state["channel"] = ch
        # Check billing
        has_billing = await _check_channel_billing(ch["id"])
        if not has_billing:
            token = state.get("token", "")
            await _send_subscription_required(chat_id, ch["title"], token)
            _conversation_state.pop(uid, None)
            return True
        # Advance to first flow-specific step
        return await _advance_after_channel(chat_id, uid, state)

    # --- Flow-specific steps ---
    if flow == "newlink":
        return await _handle_newlink_step(chat_id, uid, state, text)
    elif flow == "newgiveaway":
        return await _handle_newgiveaway_step(chat_id, uid, state, text)
    elif flow == "newpin":
        return await _handle_newpin_step(chat_id, uid, state, text)
    elif flow == "newleadmagnet":
        return await _handle_newleadmagnet_step(chat_id, uid, state, text)

    return False


async def _advance_after_channel(chat_id: int, uid: int, state: dict) -> bool:
    """Advance to the first step after channel selection."""
    flow = state["flow"]
    ch = state["channel"]
    if flow == "newlink":
        state["step"] = "name"
        await _send_message(chat_id, f"Канал: <b>{ch['title']}</b>\n\nВведите название ссылки:")
    elif flow == "newgiveaway":
        state["step"] = "title"
        await _send_message(chat_id, f"Канал: <b>{ch['title']}</b>\n\nВведите название розыгрыша:")
    elif flow == "newpin":
        state["step"] = "title"
        await _send_message(chat_id, f"Канал: <b>{ch['title']}</b>\n\nВведите название закрепа:")
    elif flow == "newleadmagnet":
        state["step"] = "title"
        await _send_message(chat_id, f"Канал: <b>{ch['title']}</b>\n\nВведите название лид-магнита:")
    return True


async def _handle_newlink_step(chat_id: int, uid: int, state: dict, text: str) -> bool:
    step = state["step"]
    if step == "name":
        state["name"] = text
        state["step"] = "link_type"
        await _send_message(chat_id,
            "Выберите тип ссылки:\n\n"
            "1 — Лендинг (через страницу подписки + Яндекс Метрика)\n"
            "2 — Прямая (сразу переход в канал, только внутренний счётчик)\n\n"
            "Введите 1 или 2 (по умолчанию 1):")
        return True
    if step == "link_type":
        if text in ("1", "2"):
            state["link_type"] = "direct" if text == "2" else "landing"
        else:
            state["link_type"] = "landing"
        state["step"] = "utm_source"
        await _send_message(chat_id, "Введите utm_source (или <code>-</code> чтобы пропустить):")
        return True
    if step == "utm_source":
        state["utm_source"] = None if text.strip() == "-" else text.strip()
        state["step"] = "confirm"
        lt_label = "Лендинг" if state["link_type"] == "landing" else "Прямая"
        utm = state["utm_source"] or "—"
        await _send_message(chat_id,
            f"📋 <b>Подтвердите создание ссылки:</b>\n\n"
            f"Канал: {state['channel']['title']}\n"
            f"Название: {state['name']}\n"
            f"Тип: {lt_label}\n"
            f"utm_source: {utm}\n\n"
            f"Отправьте <b>да</b> для подтверждения или <b>отмена</b> для отмены.")
        return True
    if step == "confirm":
        if text.lower() not in ("да", "yes", "ок", "ok"):
            _conversation_state.pop(uid, None)
            await _send_message(chat_id, "❌ Создание ссылки отменено.")
            return True
        short_code = secrets.token_hex(4)
        await execute(
            "INSERT INTO tracking_links (channel_id, name, short_code, utm_source, link_type, clicks) VALUES ($1, $2, $3, $4, $5, 0)",
            state["channel"]["id"], state["name"], short_code, state["utm_source"], state["link_type"],
        )
        app_url = settings.APP_URL
        _conversation_state.pop(uid, None)
        await _send_message(chat_id,
            f"✅ Ссылка создана!\n\n"
            f"🔗 {app_url}/go/{short_code}")
        return True
    return False


async def _handle_newgiveaway_step(chat_id: int, uid: int, state: dict, text: str) -> bool:
    step = state["step"]
    if step == "title":
        state["title"] = text
        state["step"] = "prize"
        await _send_message(chat_id, "Введите приз розыгрыша:")
        return True
    if step == "prize":
        state["prize"] = text
        state["step"] = "confirm"
        await _send_message(chat_id,
            f"📋 <b>Подтвердите создание розыгрыша:</b>\n\n"
            f"Канал: {state['channel']['title']}\n"
            f"Название: {state['title']}\n"
            f"Приз: {state['prize']}\n\n"
            f"Отправьте <b>да</b> для подтверждения или <b>отмена</b> для отмены.")
        return True
    if step == "confirm":
        if text.lower() not in ("да", "yes", "ок", "ok"):
            _conversation_state.pop(uid, None)
            await _send_message(chat_id, "❌ Создание розыгрыша отменено.")
            return True
        deep_link_code = f"gw_{secrets.token_hex(4)}"
        import json as _json
        prizes_json = _json.dumps([state["prize"]])
        await execute(
            "INSERT INTO giveaways (channel_id, title, message_text, prizes, deep_link_code, status, participant_count) VALUES ($1, $2, $3, $4, $5, 'draft', 0)",
            state["channel"]["id"], state["title"], state["title"], prizes_json, deep_link_code,
        )
        _conversation_state.pop(uid, None)
        await _send_message(chat_id,
            f"✅ Розыгрыш «{state['title']}» создан!\n\n"
            f"Статус: черновик. Активируйте в личном кабинете.")
        return True
    return False


async def _handle_newpin_step(chat_id: int, uid: int, state: dict, text: str) -> bool:
    step = state["step"]
    if step == "title":
        state["title"] = text
        state["step"] = "text"
        await _send_message(chat_id, "Введите текст закрепа:")
        return True
    if step == "text":
        state["pin_text"] = text
        state["step"] = "confirm"
        await _send_message(chat_id,
            f"📋 <b>Подтвердите создание закрепа:</b>\n\n"
            f"Канал: {state['channel']['title']}\n"
            f"Название: {state['title']}\n"
            f"Текст: {state['pin_text'][:100]}{'...' if len(state['pin_text']) > 100 else ''}\n\n"
            f"Отправьте <b>да</b> для подтверждения или <b>отмена</b> для отмены.")
        return True
    if step == "confirm":
        if text.lower() not in ("да", "yes", "ок", "ok"):
            _conversation_state.pop(uid, None)
            await _send_message(chat_id, "❌ Создание закрепа отменено.")
            return True
        await execute(
            "INSERT INTO pin_posts (channel_id, title, message_text, status) VALUES ($1, $2, $3, 'draft')",
            state["channel"]["id"], state["title"], state["pin_text"],
        )
        _conversation_state.pop(uid, None)
        await _send_message(chat_id,
            f"✅ Закреп «{state['title']}» создан!\n\n"
            f"Статус: черновик. Опубликуйте в личном кабинете.")
        return True
    return False


async def _handle_newleadmagnet_step(chat_id: int, uid: int, state: dict, text: str) -> bool:
    step = state["step"]
    if step == "title":
        state["title"] = text
        state["step"] = "message"
        await _send_message(chat_id, "Введите текст сообщения лид-магнита:")
        return True
    if step == "message":
        state["message_text"] = text
        state["step"] = "confirm"
        await _send_message(chat_id,
            f"📋 <b>Подтвердите создание лид-магнита:</b>\n\n"
            f"Канал: {state['channel']['title']}\n"
            f"Название: {state['title']}\n"
            f"Текст: {state['message_text'][:100]}{'...' if len(state['message_text']) > 100 else ''}\n\n"
            f"⚠️ Загрузка файлов через бота не поддерживается — используйте веб-панель.\n\n"
            f"Отправьте <b>да</b> для подтверждения или <b>отмена</b> для отмены.")
        return True
    if step == "confirm":
        if text.lower() not in ("да", "yes", "ок", "ok"):
            _conversation_state.pop(uid, None)
            await _send_message(chat_id, "❌ Создание лид-магнита отменено.")
            return True
        code = secrets.token_hex(6)
        await execute(
            "INSERT INTO lead_magnets (channel_id, title, message_text, code) VALUES ($1, $2, $3, $4)",
            state["channel"]["id"], state["title"], state["message_text"], code,
        )
        _conversation_state.pop(uid, None)
        await _send_message(chat_id,
            f"✅ Лид-магнит «{state['title']}» создан!\n\n"
            f"Код: <code>{code}</code>\n"
            f"Для загрузки файла используйте веб-панель.")
        return True
    return False


async def _start_flow(chat_id: int, tg_user: dict, flow: str):
    """Start a multi-step creation flow."""
    uid = tg_user["id"]
    channels, user, token = await _get_user_channels(tg_user)

    if not channels:
        await _send_message(chat_id,
            "📭 У вас пока нет подключенных каналов.\n\n"
            f"Чтобы подключить канал:\nОткройте канал → Настройки → Администраторы → добавьте бота @{settings.BOT_USERNAME}")
        return

    state = {"flow": flow, "token": token}

    if len(channels) == 1:
        ch = channels[0]
        state["channel"] = ch
        # Check billing
        has_billing = await _check_channel_billing(ch["id"])
        if not has_billing:
            await _send_subscription_required(chat_id, ch["title"], token)
            return
        _conversation_state[uid] = state
        await _advance_after_channel(chat_id, uid, state)
    else:
        state["step"] = "select_channel"
        state["channels"] = channels
        _conversation_state[uid] = state
        lines = ["Выберите канал:\n"]
        for i, ch in enumerate(channels, 1):
            platform_icon = "📱" if ch["platform"] == "max" else "✈️"
            lines.append(f"{i}. {platform_icon} {ch['title']}")
        lines.append("\nВведите номер канала:")
        await _send_message(chat_id, "\n".join(lines))


# ---- my_chat_member: bot added/removed as admin ----

async def handle_my_chat_member(update: dict):
    chat = update.get("my_chat_member", {})
    chat_info = chat.get("chat", {})
    new_status = chat.get("new_chat_member", {}).get("status", "")
    from_user = chat.get("from", {})
    chat_type = chat_info.get("type", "")
    chat_id = chat_info.get("id")

    if not chat_id:
        return

    # Chats (group/supergroup) → save to bot_chats for paid chats feature
    if chat_type in ("group", "supergroup") and new_status in ("administrator", "member"):
        chat_title = chat_info.get("title", "Чат")
        tg_user_data = {"id": from_user.get("id"), "username": from_user.get("username"), "first_name": from_user.get("first_name", "")}
        result = await find_or_create_tg_user(tg_user_data)
        bind_user_id = result["user"]["id"]
        # Fetch avatar
        _tg_avatar = None
        try:
            cd = await _tg_request("getChat", chat_id=chat_id)
            if cd and cd.get("result", {}).get("photo"):
                fid = cd["result"]["photo"].get("big_file_id") or cd["result"]["photo"].get("small_file_id")
                if fid:
                    fi = await _tg_request("getFile", file_id=fid)
                    fp = fi.get("result", {}).get("file_path") if fi else None
                    if fp:
                        _tg_avatar = f"https://api.telegram.org/file/bot{settings.TELEGRAM_BOT_TOKEN}/{fp}"
        except Exception:
            pass
        try:
            await execute(
                """INSERT INTO bot_chats (chat_id, title, platform, user_id, is_admin, avatar_url)
                   VALUES ($1, $2, 'telegram', $3, $4, $5)
                   ON CONFLICT(chat_id) DO UPDATE SET title = EXCLUDED.title, is_admin = EXCLUDED.is_admin,
                   avatar_url = COALESCE(EXCLUDED.avatar_url, bot_chats.avatar_url),
                   user_id = COALESCE(bot_chats.user_id, EXCLUDED.user_id)""",
                str(chat_id), chat_title, bind_user_id, new_status == "administrator", _tg_avatar,
            )
            print(f"[TG Bot] Saved chat '{chat_title}' ({chat_id})")
            if new_status == "administrator":
                from ..middleware.auth import create_jwt
                _token = create_jwt(bind_user_id)
                _url = f"{settings.APP_URL}/login?token={_token}"
                await _send_message(from_user["id"],
                    f"✅ Бот добавлен администратором в чат «{chat_title}».\n\nВы можете подключить его как платный чат в личном кабинете.",
                    reply_markup={"inline_keyboard": [[{"text": "🔑 Перейти в кабинет", "url": _url}]]})
        except Exception as e:
            print(f"[TG Bot] Save chat error: {e}")
        return

    if chat_type != "channel":
        return

    if new_status == "administrator":
        tg_user = {"id": from_user.get("id"), "username": from_user.get("username"), "first_name": from_user.get("first_name", "")}
        result = await find_or_create_tg_user(tg_user)
        user = result["user"]
        tracking_code = _generate_tracking_code()

        existing = await fetch_one("SELECT id, trial_used FROM channels WHERE channel_id = $1", int(chat_id))

        # For public channels, build join link from username; for private, fetch via API
        _tg_username = chat_info.get("username")
        _tg_join_link = None
        if _tg_username:
            _tg_join_link = f"https://t.me/{_tg_username}"
        else:
            # Private channel — try to get invite link via Bot API
            _tg_join_link = await _fetch_tg_invite_link(chat_id)
            if not _tg_join_link and chat_info.get("invite_link"):
                _tg_join_link = chat_info["invite_link"]

        # Fetch channel avatar
        _tg_avatar = None
        try:
            chat_data = await _tg_request("getChat", chat_id=chat_id)
            if chat_data and chat_data.get("result", {}).get("photo"):
                file_id = chat_data["result"]["photo"].get("big_file_id") or chat_data["result"]["photo"].get("small_file_id")
                if file_id:
                    file_info = await _tg_request("getFile", file_id=file_id)
                    file_path = file_info.get("result", {}).get("file_path") if file_info else None
                    if file_path:
                        _tg_avatar = f"https://api.telegram.org/file/bot{settings.TELEGRAM_BOT_TOKEN}/{file_path}"
        except Exception:
            pass

        await execute("""
            INSERT INTO channels (channel_id, title, username, owner_id, user_id, tracking_code, platform, join_link, avatar_url)
            VALUES ($1, $2, $3, $4, $5, $6, 'telegram', $7, $8)
            ON CONFLICT(channel_id) DO UPDATE SET
                title = EXCLUDED.title, username = EXCLUDED.username,
                is_active = 1, user_id = COALESCE(channels.user_id, EXCLUDED.user_id),
                join_link = COALESCE(EXCLUDED.join_link, channels.join_link),
                avatar_url = COALESCE(EXCLUDED.avatar_url, channels.avatar_url)
        """, int(chat_id), chat_info.get("title", ""), _tg_username, user["id"], user["id"], tracking_code, _tg_join_link, _tg_avatar)

        # Trial activation
        channel = await fetch_one("SELECT id, trial_used FROM channels WHERE channel_id = $1", int(chat_id))
        trial_msg = ""
        if channel and not channel.get("trial_used"):
            existing_billing = await fetch_one("SELECT id FROM channel_billing WHERE channel_id = $1", channel["id"])
            if not existing_billing:
                await execute("""
                    INSERT INTO channel_billing (channel_id, plan, status, started_at, expires_at)
                    VALUES ($1, 'trial', 'active', NOW(), NOW() + INTERVAL '2 days')
                    ON CONFLICT DO NOTHING
                """, channel["id"])
            await execute("UPDATE channels SET trial_used = TRUE WHERE id = $1", channel["id"])
            trial_msg = "\n\n🎁 Активирован бесплатный пробный период на 2 дня!"
            print(f"[TG Bot] Trial activated for channel {chat_info.get('title')} ({chat_id})")

        try:
            from ..middleware.auth import create_jwt
            _token = create_jwt(user["id"])
            _cabinet_url = f"{settings.APP_URL}/login?token={_token}"
            keyboard = {"inline_keyboard": [[{"text": "🔑 Перейти в кабинет", "url": _cabinet_url}]]}
            await _send_message(
                from_user["id"],
                f"✅ Канал «{chat_info.get('title', '')}» успешно подключен!\n\n"
                f"🔗 Код отслеживания: <code>{tracking_code}</code>{trial_msg}",
                reply_markup=keyboard,
            )
        except Exception as e:
            print(f"[TG Bot] Failed to notify owner: {e}")

    elif new_status in ("left", "kicked", "member", "restricted"):
        # "member"/"restricted" = demoted from admin; "left"/"kicked" = removed entirely
        channel = await fetch_one("SELECT id, title, user_id FROM channels WHERE channel_id = $1", int(chat_id))
        await execute("UPDATE channels SET is_active = 0 WHERE channel_id = $1", int(chat_id))

        reason = "удалён из канала" if new_status in ("left", "kicked") else "разжалован из администраторов"
        print(f"[TG Bot] Bot {reason}: {chat_info.get('title')} ({chat_id})")

        if channel and channel.get("user_id"):
            owner = await fetch_one("SELECT telegram_id FROM users WHERE id = $1 AND telegram_id IS NOT NULL", channel["user_id"])
            if owner:
                try:
                    await _send_message(
                        owner["telegram_id"],
                        f"⚠️ Бот {reason} в канале «{channel.get('title', '')}».\n\n"
                        f"Канал деактивирован. Чтобы снова подключить:\n"
                        f"Откройте канал → Настройки → Администраторы → добавьте бота @{settings.BOT_USERNAME}",
                    )
                except Exception as e:
                    print(f"[TG Bot] Notify owner on remove failed: {e}")


# ---- chat_member: new subscriber ----

async def handle_chat_member(update: dict):
    cm = update.get("chat_member", {})
    chat = cm.get("chat", {})
    old_status = cm.get("old_chat_member", {}).get("status", "")
    new_status = cm.get("new_chat_member", {}).get("status", "")
    new_user = cm.get("new_chat_member", {}).get("user", {})

    chat_type = chat.get("type", "")
    was_not_member = old_status in ("left", "kicked")
    is_member = new_status in ("member", "administrator", "creator")

    if not (was_not_member and is_member):
        return

    tg_id = new_user.get("id")
    chat_id_str = str(chat.get("id", ""))

    # Check if this is a paid chat — kick unauthorized users
    if chat_type in ("group", "supergroup") and tg_id:
        paid_chat = await fetch_one(
            "SELECT pc.id FROM paid_chats pc WHERE pc.chat_id = $1 AND pc.is_active = 1",
            chat_id_str,
        )
        if paid_chat:
            member = await fetch_one(
                "SELECT id FROM paid_chat_members WHERE paid_chat_id = $1 AND telegram_id = $2 AND status = 'active'",
                paid_chat["id"], tg_id,
            )
            if not member:
                # Not paid — kick
                try:
                    token = settings.TELEGRAM_BOT_TOKEN
                    await _tg_request("banChatMember", chat_id=chat["id"], user_id=tg_id)
                    await _tg_request("unbanChatMember", chat_id=chat["id"], user_id=tg_id, only_if_banned=True)
                    await _send_message(tg_id,
                        "⚠️ Для доступа к этому чату необходима оплата.\n\nОплатите подписку, чтобы получить доступ.")
                    print(f"[TG Bot] Kicked unpaid user {tg_id} from paid chat {chat_id_str}")
                except Exception as e:
                    print(f"[TG Bot] Failed to kick unpaid user: {e}")
                return

    if chat_type != "channel":
        return

    channel = await fetch_one("SELECT id FROM channels WHERE channel_id = $1", int(chat["id"]))
    if not channel:
        return

    tg_id = new_user.get("id")
    username = new_user.get("username")
    first_name = new_user.get("first_name", "")

    # Find matching visit
    visit = None
    if tg_id:
        visit = await fetch_one("""
            SELECT id FROM visits WHERE channel_id = $1 AND telegram_id = $2
            AND visited_at > NOW() - INTERVAL '7 days' ORDER BY visited_at DESC LIMIT 1
        """, channel["id"], tg_id)
    if not visit:
        visit = await fetch_one("""
            SELECT id FROM visits WHERE channel_id = $1
            AND visited_at > NOW() - INTERVAL '1 hour' ORDER BY visited_at DESC LIMIT 1
        """, channel["id"])

    try:
        await execute("""
            INSERT INTO subscriptions (channel_id, telegram_id, username, first_name, visit_id, platform)
            VALUES ($1, $2, $3, $4, $5, 'telegram')
        """, channel["id"], tg_id, username, first_name, visit["id"] if visit else None)
        print(f"[TG Bot] Subscription: user={username or tg_id}, channel={channel['id']}")
    except Exception as e:
        if "duplicate" not in str(e).lower() and "unique" not in str(e).lower():
            print(f"[TG Bot] Subscription error: {e}")

    # Notify owner
    try:
        from ..services.messenger import notify_owner
        source = "прямой"
        if visit:
            v = await fetch_one("SELECT utm_source, utm_campaign FROM visits WHERE id = $1", visit["id"])
            if v and v.get("utm_source"):
                source = v["utm_source"] + (f" / {v['utm_campaign']}" if v.get("utm_campaign") else "")
        ch = await fetch_one("SELECT title FROM channels WHERE id = $1", channel["id"])
        await notify_owner(
            channel["id"],
            f"🔔 Новый подписчик в «{ch.get('title', 'канале') if ch else 'канале'}»!\n"
            f"👤 {first_name or ''}{' @' + username if username else ''}\n"
            f"📊 Источник: {source}",
        )
    except Exception:
        pass


# ---- Account linking via 6-digit code ----

async def _handle_link_code(chat_id: int, tg_user: dict, code: str):
    """Handle a 6-digit code: link or unlink account."""
    # Check unlink first
    unlink_row = await fetch_one(
        "SELECT * FROM account_link_codes WHERE code = $1 AND target_platform = 'unlink_telegram' AND used = FALSE AND expires_at > NOW()",
        code,
    )
    if unlink_row:
        old_user_id = unlink_row["user_id"]
        tg_id = tg_user.get("id")
        tg_username = tg_user.get("username")
        tg_first_name = tg_user.get("first_name", "")

        # Remove telegram from old account
        await execute("UPDATE users SET telegram_id = NULL, username = NULL WHERE id = $1", old_user_id)

        # Create new separate TG account
        new_user_id = await execute_returning_id(
            "INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING id",
            tg_id, tg_username, tg_first_name,
        )

        # Move TG channels to new account
        await execute(
            "UPDATE channels SET user_id = $1, owner_id = $1 WHERE user_id = $2 AND platform = 'telegram'",
            new_user_id, old_user_id,
        )

        await execute("UPDATE account_link_codes SET used = TRUE WHERE id = $1", unlink_row["id"])

        from ..middleware.auth import create_jwt
        _token = create_jwt(new_user_id)
        _url = f"{settings.APP_URL}/login?token={_token}"
        await _send_message(
            chat_id,
            f"✅ Telegram успешно отвязан.\n\n"
            f"Создан отдельный аккаунт для ваших Telegram-каналов:",
            reply_markup={"inline_keyboard": [[{"text": "🔑 Войти в кабинет", "url": _url}]]},
        )
        return

    # Link code
    row = await fetch_one(
        "SELECT * FROM account_link_codes WHERE code = $1 AND target_platform = 'telegram' AND used = FALSE AND expires_at > NOW()",
        code,
    )
    if not row:
        used = await fetch_one("SELECT * FROM account_link_codes WHERE code = $1 AND used = TRUE", code)
        if used:
            return
        await _send_message(chat_id, "❌ Код не найден или истёк. Запросите новый код в личном кабинете.")
        return

    # Ask for confirmation with inline keyboard
    user_row = await fetch_one("SELECT * FROM users WHERE id = $1", row["user_id"])
    display_name = user_row.get("first_name") or user_row.get("username") or f"ID {row['user_id']}" if user_row else f"ID {row['user_id']}"

    await _send_message(
        chat_id,
        f"🔗 <b>Привязка аккаунта</b>\n\n"
        f"Связать этот Telegram-аккаунт с аккаунтом <b>{display_name}</b>?\n"
        f"Код: <code>{code}</code>",
        reply_markup={
            "inline_keyboard": [
                [
                    {"text": "✅ Да, связать", "callback_data": f"link_yes:{code}"},
                    {"text": "❌ Нет", "callback_data": f"link_no:{code}"},
                ]
            ]
        },
    )


async def _handle_callback_query(callback_query: dict):
    """Handle inline keyboard button clicks."""
    cb_id = callback_query.get("id")
    data = callback_query.get("data", "")
    user = callback_query.get("from", {})
    chat_id = callback_query.get("message", {}).get("chat", {}).get("id")
    tg_user_id = user.get("id")

    # Answer the callback to dismiss loading spinner
    try:
        await _tg_request("answerCallbackQuery", callback_query_id=cb_id)
    except Exception:
        pass

    if not chat_id or not tg_user_id:
        return

    if data.startswith("lm_"):
        # Re-check subscription and deliver lead magnet
        await handle_lead_magnet(chat_id, user, data)
        return

    if data.startswith("link_yes:"):
        code = data[len("link_yes:"):]
        msg_id = callback_query.get("message", {}).get("message_id")

        # Delete the confirmation message
        if msg_id:
            try:
                await _tg_request("deleteMessage", chat_id=chat_id, message_id=msg_id)
            except Exception:
                pass

        # Show "please wait" message
        wait_msg = await _send_message(chat_id, "⏳ Подождите пару секунд... Связываю аккаунты...")
        wait_msg_id = wait_msg.get("result", {}).get("message_id") if isinstance(wait_msg, dict) else None

        row = await fetch_one(
            "SELECT * FROM account_link_codes WHERE code = $1 AND target_platform = 'telegram' AND used = FALSE AND expires_at > NOW()",
            code,
        )
        if not row:
            if wait_msg_id:
                try:
                    await _tg_request("deleteMessage", chat_id=chat_id, message_id=wait_msg_id)
                except Exception:
                    pass
            await _send_message(chat_id, "❌ Код истёк. Запросите новый код в личном кабинете.")
            return

        # Check if this telegram_id is already linked to another account
        existing = await fetch_one("SELECT * FROM users WHERE telegram_id = $1", tg_user_id)
        if existing and existing["id"] != row["user_id"]:
            old_id = existing["id"]
            target_id = row["user_id"]
            await execute("UPDATE channels SET user_id = $1 WHERE user_id = $2", target_id, old_id)
            await execute("UPDATE channels SET owner_id = $1 WHERE owner_id = $2", target_id, old_id)
            await execute("UPDATE users SET telegram_id = NULL WHERE id = $1", old_id)
            await execute("DELETE FROM users WHERE id = $1", old_id)

        # Link the account
        await execute("UPDATE users SET telegram_id = $1, username = COALESCE(username, $2) WHERE id = $3",
                      tg_user_id, user.get("username"), row["user_id"])
        await execute("UPDATE account_link_codes SET used = TRUE WHERE id = $1", row["id"])

        # Delete "please wait" message
        if wait_msg_id:
            try:
                await _tg_request("deleteMessage", chat_id=chat_id, message_id=wait_msg_id)
            except Exception:
                pass

        # Send success with cabinet button
        from ..middleware.auth import create_jwt
        _token = create_jwt(row["user_id"])
        _url = f"{settings.APP_URL}/login?token={_token}"
        await _send_message(
            chat_id,
            "✅ Telegram подключен! Теперь вы можете управлять Telegram-каналами из личного кабинета.",
            reply_markup={"inline_keyboard": [[{"text": "🔑 Перейти в кабинет", "url": _url}]]},
        )

    elif data.startswith("link_no:"):
        msg_id = callback_query.get("message", {}).get("message_id")
        if msg_id:
            try:
                await _tg_request("deleteMessage", chat_id=chat_id, message_id=msg_id)
            except Exception:
                pass
        await _send_message(chat_id, "❌ Привязка отменена.")


# ---- Process a single Telegram update ----

async def process_update(update: dict):
    try:
        if "message" in update:
            msg = update["message"]
            text = (msg.get("text") or "").strip()
            chat_id = msg["chat"]["id"]
            user = msg.get("from", {})
            tg_user = {"id": user.get("id"), "username": user.get("username"), "first_name": user.get("first_name", "")}

            # Commands cancel any active conversation
            if text.startswith("/"):
                _conversation_state.pop(tg_user["id"], None)

            if text.startswith("/start"):
                payload = text[7:].strip() if len(text) > 6 else ""
                await handle_start(chat_id, tg_user, payload)
            elif text == "/channels":
                await cmd_channels(chat_id, tg_user)
            elif text == "/links":
                await cmd_links(chat_id, tg_user)
            elif text == "/giveaways":
                await cmd_giveaways(chat_id, tg_user)
            elif text == "/pins":
                await cmd_pins(chat_id, tg_user)
            elif text == "/stats":
                await cmd_stats(chat_id, tg_user)
            elif text == "/help":
                await cmd_help(chat_id, tg_user)
            elif text == "/newlink":
                await _start_flow(chat_id, tg_user, "newlink")
            elif text == "/newgiveaway":
                await _start_flow(chat_id, tg_user, "newgiveaway")
            elif text == "/newpin":
                await _start_flow(chat_id, tg_user, "newpin")
            elif text == "/newleadmagnet":
                await _start_flow(chat_id, tg_user, "newleadmagnet")
            elif text == "/cancel":
                await _send_message(chat_id, "❌ Действие отменено.")
            elif not text.startswith("/"):
                # Non-command text: check conversation state
                handled = await _handle_conversation(chat_id, tg_user, text)
                if not handled:
                    # Check if it's a 6-digit account link code
                    if re.match(r'^\d{6}$', text):
                        await _handle_link_code(chat_id, tg_user, text)
                    else:
                        await handle_start(chat_id, tg_user)

        if "callback_query" in update:
            await _handle_callback_query(update["callback_query"])

        if "my_chat_member" in update:
            await handle_my_chat_member(update)

        if "chat_member" in update:
            await handle_chat_member(update)

    except Exception as e:
        import traceback
        print(f"[TG Bot] Error processing update: {e}")
        traceback.print_exc()


# ---- Long polling loop ----

async def _poll_loop():
    if not settings.TELEGRAM_BOT_TOKEN:
        print("[TG Bot] No token, polling disabled")
        return

    # Delete any existing webhook so polling works
    try:
        await _tg_request("deleteWebhook")
    except Exception:
        pass

    offset = 0
    await asyncio.sleep(5)
    print("[TG Bot] Polling started")

    while True:
        try:
            url = _api_url("getUpdates")
            params = {"offset": offset, "timeout": 30, "allowed_updates": ["message", "my_chat_member", "chat_member", "callback_query"]}
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=params, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    data = await resp.json()

            if data.get("ok") and data.get("result"):
                for upd in data["result"]:
                    offset = upd["update_id"] + 1
                    await process_update(upd)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[TG Bot] Poll error: {e}")
            await asyncio.sleep(5)


def start_telegram_polling():
    global _poll_task
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    _poll_task = asyncio.create_task(_poll_loop())


def stop_telegram_polling():
    global _poll_task
    if _poll_task:
        _poll_task.cancel()
        _poll_task = None


# ---- Webhook endpoint (alternative to polling) ----

@router.post("/webhook")
async def telegram_webhook(request: Request):
    body = await request.json()
    await process_update(body)
    return {"ok": True}
