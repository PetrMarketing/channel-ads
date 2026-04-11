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
    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=400, detail="MAX bot not configured")

    result = await max_api.get_chats()
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Failed to get chats"))

    chats = result.get("data", {}).get("chats", [])
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
    """Discover MAX chats where bot is a member and create channel records."""
    from ..services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=400, detail="MAX bot not configured")

    result = await max_api.get_chats()
    if not result.get("success"):
        raise HTTPException(status_code=502, detail="Failed to get chats")

    chats = result.get("data", {}).get("chats", [])
    discovered = []
    for chat in chats:
        chat_id = str(chat.get("chat_id", ""))
        title = chat.get("title", "")
        existing = await fetch_one("SELECT * FROM channels WHERE max_chat_id = $1", chat_id)
        if not existing:
            discovered.append({"chat_id": chat_id, "title": title})

    return {"success": True, "discovered": discovered}


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
