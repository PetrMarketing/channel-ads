"""Заметки и диалог с клиентами — система + каналы Wazzup."""
import aiohttp
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends

from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import get_current_user

router = APIRouter()


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code=$1 AND user_id=$2 AND is_active=1", tc, user_id
    )


# ---- Заметки/сообщения клиента ----

@router.get("/{tc}/notes/{identifier}")
async def get_notes(tc: str, identifier: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    notes = await fetch_all(
        """SELECT id, channel_type, direction, content, author_name, created_at
           FROM client_notes WHERE channel_id=$1 AND client_identifier=$2
           ORDER BY created_at""",
        channel["id"], identifier,
    )
    return {"success": True, "notes": notes}


@router.post("/{tc}/notes/{identifier}")
async def add_note(tc: str, identifier: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    content = (body.get("content") or "").strip()
    channel_type = body.get("channel_type", "system")  # system, wazzup_CHANNELID
    if not content:
        raise HTTPException(status_code=400, detail="Пустое сообщение")

    author = user.get("first_name") or user.get("username") or "Оператор"

    # Если Wazzup канал — отправляем через API
    if channel_type.startswith("wazzup_"):
        wazzup_channel_id = channel_type.replace("wazzup_", "")
        phone = body.get("phone") or identifier
        transport = body.get("transport", "")
        sent = await _send_wazzup(channel["id"], wazzup_channel_id, phone, content, transport)
        if not sent:
            raise HTTPException(status_code=400, detail="Не удалось отправить через Wazzup. Проверьте настройки.")

    await execute_returning_id(
        """INSERT INTO client_notes (channel_id, client_identifier, channel_type, direction, content, author_name)
           VALUES ($1, $2, $3, 'out', $4, $5) RETURNING id""",
        channel["id"], identifier, channel_type, content, author,
    )
    return {"success": True}


# ---- Настройки Wazzup ----

@router.get("/{tc}/wazzup-settings")
async def get_wazzup_settings(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    ws = await fetch_one("SELECT * FROM whatsapp_settings WHERE channel_id=$1", channel["id"])
    if not ws:
        return {"success": True, "settings": {"api_token": "", "is_active": False}, "channels": []}
    # Подтягиваем каналы из Wazzup
    channels = []
    if ws.get("is_active") and ws.get("api_token"):
        channels = await _fetch_wazzup_channels(ws["api_token"])
    return {
        "success": True,
        "settings": {
            "api_token": ws.get("api_token", ""),
            "is_active": ws.get("is_active", False),
        },
        "channels": channels,
    }


@router.post("/{tc}/wazzup-settings")
async def save_wazzup_settings(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    token = body.get("api_token", "")
    is_active = body.get("is_active", False)

    existing = await fetch_one("SELECT id FROM whatsapp_settings WHERE channel_id=$1", channel["id"])
    if existing:
        await execute(
            "UPDATE whatsapp_settings SET api_token=$1, is_active=$2 WHERE channel_id=$3",
            token, is_active, channel["id"],
        )
    else:
        await execute(
            "INSERT INTO whatsapp_settings (channel_id, api_token, is_active) VALUES ($1, $2, $3)",
            channel["id"], token, is_active,
        )

    # Вернём каналы если токен активен
    channels = []
    if is_active and token:
        channels = await _fetch_wazzup_channels(token)
    return {"success": True, "channels": channels}


# ---- Получить каналы Wazzup ----

@router.get("/{tc}/wazzup-channels")
async def get_wazzup_channels(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    ws = await fetch_one(
        "SELECT api_token FROM whatsapp_settings WHERE channel_id=$1 AND is_active=TRUE", channel["id"]
    )
    if not ws or not ws.get("api_token"):
        return {"success": True, "channels": []}
    channels = await _fetch_wazzup_channels(ws["api_token"])
    return {"success": True, "channels": channels}


# ---- Wazzup API ----

async def _fetch_wazzup_channels(api_token: str) -> list:
    """Получить список каналов из Wazzup API."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.wazzup24.com/v3/channels",
                headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    print(f"[Wazzup] Channels API error: {resp.status}")
                    return []
                data = await resp.json()
                print(f"[Wazzup] Channels response: {data}")
                result = []
                for ch in data if isinstance(data, list) else []:
                    result.append({
                        "id": ch.get("channelId") or ch.get("id", ""),
                        "type": ch.get("transport") or ch.get("type", ""),
                        "name": ch.get("name", ""),
                        "state": ch.get("state", "active"),
                        "phone": ch.get("plainId") or ch.get("phone", ""),
                    })
                return result
    except Exception as e:
        print(f"[Wazzup] Fetch channels error: {e}")
        return []


async def _send_wazzup(channel_id: int, wazzup_channel_id: str, phone: str, text: str, transport: str = "") -> bool:
    """Отправить сообщение через Wazzup API."""
    ws = await fetch_one(
        "SELECT api_token FROM whatsapp_settings WHERE channel_id=$1 AND is_active=TRUE", channel_id
    )
    if not ws or not ws.get("api_token"):
        return False

    # Определяем chatType по транспорту канала
    transport_to_chat_type = {
        "whatsapp": "whatsapp",
        "telegram": "telegram",
        "tgapi": "telegram",
        "instagram": "instagram",
        "vk": "vk",
        "viber": "viber",
        "avito": "avito",
    }
    chat_type = transport_to_chat_type.get(transport, transport or "whatsapp")

    # Очищаем номер
    clean_phone = "".join(c for c in phone if c.isdigit())
    if clean_phone.startswith("8") and len(clean_phone) == 11:
        clean_phone = "7" + clean_phone[1:]
    elif len(clean_phone) == 10 and clean_phone.startswith("9"):
        clean_phone = "7" + clean_phone

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.wazzup24.com/v3/message",
                json={
                    "channelId": wazzup_channel_id,
                    "chatId": clean_phone,
                    "chatType": chat_type,
                    "text": text,
                },
                headers={
                    "Authorization": f"Bearer {ws['api_token']}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                ok = resp.status in (200, 201)
                resp_body = await resp.text()
                print(f"[Wazzup] Send response {resp.status}: chatId={clean_phone}, chatType={chat_type}, body={resp_body[:500]}")
                return ok
    except Exception as e:
        print(f"[Wazzup] Send error: {e}")
        return False
