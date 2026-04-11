import csv
import io
import json
import secrets

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional

from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute

router = APIRouter()
public_router = APIRouter()


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "offline_conversions")


@router.get("/{tc}")
async def list_conversions(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    conversions = await fetch_all(
        "SELECT * FROM offline_conversions WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 200",
        channel["id"],
    )
    total = await fetch_one("SELECT COUNT(*) as count FROM offline_conversions WHERE channel_id = $1", channel["id"])
    uploaded = await fetch_one(
        "SELECT COUNT(*) as count FROM offline_conversions WHERE channel_id = $1 AND uploaded_at IS NOT NULL",
        channel["id"],
    )
    pending = await fetch_one(
        "SELECT COUNT(*) as count FROM offline_conversions WHERE channel_id = $1 AND uploaded_at IS NULL",
        channel["id"],
    )
    return {
        "success": True,
        "conversions": conversions,
        "total": total["count"] if total else 0,
        "uploaded": uploaded["count"] if uploaded else 0,
        "pending": pending["count"] if pending else 0,
    }


@router.get("/{tc}/csv")
async def download_csv(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    conversions = await fetch_all(
        "SELECT * FROM offline_conversions WHERE channel_id = $1 ORDER BY conversion_time", channel["id"]
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ClientId", "Target", "DateTime", "Price", "Currency"])
    for c in conversions:
        writer.writerow([
            c.get("ym_client_id", ""),
            c.get("goal_name", "subscribe_channel"),
            str(c.get("conversion_time", "")),
            "", "RUB",
        ])
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=conversions_{tc}.csv"},
    )


@router.post("/{tc}/upload")
async def upload_to_metrika(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    pending = await fetch_all(
        "SELECT * FROM offline_conversions WHERE channel_id = $1 AND uploaded_at IS NULL ORDER BY conversion_time",
        channel["id"],
    )
    if not pending:
        return {"success": True, "uploaded": 0}

    ym_token = channel.get("ym_oauth_token") or settings.YM_OAUTH_TOKEN
    if not ym_token:
        raise HTTPException(status_code=400, detail="Yandex Metrika OAuth token not configured")

    # Group by counter
    by_counter = {}
    for c in pending:
        cid = c.get("ym_counter_id", "")
        by_counter.setdefault(cid, []).append(c)

    uploaded = 0
    for counter_id, convs in by_counter.items():
        if not counter_id:
            continue
        # Build CSV
        csv_data = "ClientId,Target,DateTime\n"
        for c in convs:
            csv_data += f"{c['ym_client_id']},{c['goal_name']},{c['conversion_time']}\n"

        url = f"https://api-metrika.yandex.net/management/v1/counter/{counter_id}/offline_conversions/upload"
        headers = {"Authorization": f"OAuth {ym_token}"}

        try:
            async with aiohttp.ClientSession() as session:
                data = aiohttp.FormData()
                data.add_field("file", csv_data, filename="conversions.csv", content_type="text/csv")
                async with session.post(url, data=data, headers=headers) as resp:
                    result = await resp.json()
                    if resp.status == 200:
                        for c in convs:
                            await execute("UPDATE offline_conversions SET uploaded_at = NOW() WHERE id = $1", c["id"])
                            uploaded += 1
                    else:
                        error = json.dumps(result)
                        for c in convs:
                            await execute("UPDATE offline_conversions SET upload_error = $1 WHERE id = $2", error, c["id"])
        except Exception as e:
            for c in convs:
                await execute("UPDATE offline_conversions SET upload_error = $1 WHERE id = $2", str(e), c["id"])

    return {"success": True, "uploaded": uploaded}


@router.post("/{tc}/retry-failed")
async def retry_failed(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute(
        "UPDATE offline_conversions SET upload_error = NULL, uploaded_at = NULL WHERE channel_id = $1 AND upload_error IS NOT NULL",
        channel["id"],
    )
    return {"success": True}


@router.post("/{tc}/share-token")
async def generate_share_token(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    token = secrets.token_hex(16)
    await execute("UPDATE channels SET sheet_share_token = $1 WHERE id = $2", token, channel["id"])
    return {"success": True, "token": token}


# --- Public ---

@public_router.get("/shared/{token}")
async def public_csv(token: str):
    channel = await fetch_one("SELECT * FROM channels WHERE sheet_share_token = $1", token)
    if not channel:
        raise HTTPException(status_code=404, detail="Not found")

    conversions = await fetch_all(
        "SELECT * FROM offline_conversions WHERE channel_id = $1 ORDER BY conversion_time",
        channel["id"],
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ClientId", "Target", "DateTime", "Price", "Currency"])
    for c in conversions:
        writer.writerow([c.get("ym_client_id", ""), c.get("goal_name", ""), str(c.get("conversion_time", "")), "", "RUB"])
    output.seek(0)
    return StreamingResponse(output, media_type="text/csv")
