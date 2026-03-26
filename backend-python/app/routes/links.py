import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()


def generate_short_code(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _get_owned_channel(tracking_code: str, user_id: int):
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tracking_code, user_id,
    )


@router.get("/{tracking_code}")
async def list_links(tracking_code: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    links = await fetch_all("""
        SELECT tl.*,
            (SELECT COUNT(*) FROM visits WHERE tracking_link_id = tl.id) as visit_count,
            (SELECT COUNT(*) FROM subscriptions s JOIN visits v ON v.id = s.visit_id WHERE v.tracking_link_id = tl.id) as sub_count
        FROM tracking_links tl WHERE tl.channel_id = $1 ORDER BY tl.created_at DESC
    """, channel["id"])
    return {"success": True, "links": links}


@router.post("/{tracking_code}")
async def create_link(tracking_code: str, body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    # Auto-fetch invite link if missing
    if not channel.get("join_link"):
        try:
            from .channels import _fetch_invite_link_for_channel
            invite_link = await _fetch_invite_link_for_channel(channel)
            if not invite_link and channel.get("platform") == "telegram" and channel.get("username"):
                invite_link = f"https://t.me/{channel['username']}"
            if invite_link:
                await execute("UPDATE channels SET join_link = $1 WHERE id = $2", invite_link, channel["id"])
                print(f"[Links] Auto-fetched invite link for channel {channel['id']}: {invite_link}")
        except Exception as e:
            print(f"[Links] Auto-fetch invite link failed: {e}")

    short_code = generate_short_code()
    link_type = body.get("link_type", "landing")
    if link_type not in ("landing", "direct"):
        link_type = "landing"
    link_id = await execute_returning_id(
        """INSERT INTO tracking_links (channel_id, name, utm_source, utm_medium, utm_campaign, utm_content, utm_term, short_code, link_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id""",
        channel["id"],
        body.get("name"),
        body.get("utm_source"),
        body.get("utm_medium"),
        body.get("utm_campaign"),
        body.get("utm_content"),
        body.get("utm_term"),
        short_code,
        link_type,
    )
    link = await fetch_one("SELECT * FROM tracking_links WHERE id = $1", link_id)
    return {"success": True, "link": link}


@router.put("/{tracking_code}/{link_id}")
async def update_link(tracking_code: str, link_id: int, body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    fields = []
    params = []
    idx = 1
    for key in ("name", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "link_type"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1

    if not fields:
        return {"success": True}

    params.extend([link_id, channel["id"]])
    await execute(f"UPDATE tracking_links SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    link = await fetch_one("SELECT * FROM tracking_links WHERE id = $1", link_id)
    return {"success": True, "link": link}


@router.put("/{tracking_code}/{link_id}/metrika")
async def update_metrika(tracking_code: str, link_id: int, body: dict, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    await execute(
        "UPDATE tracking_links SET ym_counter_id = $1, ym_goal_name = $2, vk_pixel_id = $3, vk_goal_name = $4 WHERE id = $5 AND channel_id = $6",
        body.get("ym_counter_id"), body.get("ym_goal_name"),
        body.get("vk_pixel_id"), body.get("vk_goal_name"),
        link_id, channel["id"],
    )
    return {"success": True}


@router.patch("/{tracking_code}/{link_id}/pause")
async def toggle_pause(tracking_code: str, link_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    link = await fetch_one("SELECT * FROM tracking_links WHERE id = $1 AND channel_id = $2", link_id, channel["id"])
    if not link:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")

    new_val = 0 if link["is_paused"] else 1
    await execute("UPDATE tracking_links SET is_paused = $1 WHERE id = $2", new_val, link_id)
    return {"success": True, "is_paused": new_val}


@router.delete("/{tracking_code}/{link_id}")
async def delete_link(tracking_code: str, link_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tracking_code, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    # Manually cascade: remove FK references that may lack ON DELETE CASCADE
    # 1. Offline conversions referencing visits of this link
    await execute("""
        DELETE FROM offline_conversions WHERE visit_id IN
        (SELECT id FROM visits WHERE tracking_link_id = $1)
    """, link_id)
    # 2. Subscriptions referencing visits of this link
    await execute("""
        UPDATE subscriptions SET visit_id = NULL WHERE visit_id IN
        (SELECT id FROM visits WHERE tracking_link_id = $1)
    """, link_id)
    # 3. Nullify visits' tracking_link_id
    await execute("UPDATE visits SET tracking_link_id = NULL WHERE tracking_link_id = $1", link_id)
    # 4. Delete clicks
    await execute("DELETE FROM clicks WHERE link_id = $1", link_id)
    # 5. Delete the link
    await execute("DELETE FROM tracking_links WHERE id = $1 AND channel_id = $2", link_id, channel["id"])
    return {"success": True}
