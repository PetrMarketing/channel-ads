from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute

router = APIRouter()


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "max")


@router.get("/{tc}/status")
async def max_status(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        return {"success": True, "connected": False, "message": "MAX bot not configured"}

    result = await max_api.get_me()
    return {
        "success": True,
        "connected": result.get("success", False),
        "bot": result.get("data") if result.get("success") else None,
        "channel": {
            "max_chat_id": channel.get("max_chat_id"),
            "max_connected": channel.get("max_connected"),
        },
    }


@router.get("/{tc}/chats")
async def list_chats(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Вернуть каналы пользователя, сохранённые из webhook-событий MAX."""
    chats = await fetch_all(
        """SELECT max_chat_id AS chat_id, title, username, max_connected, avatar_url
           FROM channels
           WHERE user_id=$1 AND platform='max' AND deleted_at IS NULL
           ORDER BY created_at DESC""",
        user["id"],
    )
    return {"success": True, "chats": chats}


@router.post("/{tc}/connect")
async def connect_channel(tc: str, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    body = await request.json()
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    chat_id = body.get("chat_id")
    if not chat_id:
        raise HTTPException(status_code=400, detail="chat_id required")

    await execute(
        "UPDATE channels SET max_chat_id = $1, max_connected = 1 WHERE id = $2",
        str(chat_id), channel["id"],
    )
    return {"success": True}


@router.post("/{tc}/disconnect")
async def disconnect_channel(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    await execute("UPDATE channels SET max_chat_id = NULL, max_connected = 0 WHERE id = $1", channel["id"])
    return {"success": True}


@router.post("/{tc}/discover")
async def discover_channels(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """MAX удалил общий поиск чатов; подключение выполняется через bot_added."""
    return {
        "success": True,
        "discovered": [],
        "message": "Добавьте бота администратором канала — канал появится автоматически",
    }


@router.post("/{tc}/refresh")
async def refresh_chat_info(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    if not channel.get("max_chat_id"):
        raise HTTPException(status_code=400, detail="MAX chat not connected")

    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=400, detail="MAX bot not configured")

    result = await max_api.get_chat(channel["max_chat_id"])
    if result.get("success"):
        chat_data = result.get("data", {})
        title = chat_data.get("title", channel.get("title"))
        await execute("UPDATE channels SET title = $1 WHERE id = $2", title, channel["id"])
        return {"success": True, "chat": chat_data}

    return {"success": False, "error": result.get("error", "Failed to get chat info")}
