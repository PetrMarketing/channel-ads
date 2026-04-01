"""VK ORD (маркировка рекламы) integration."""
import aiohttp
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any

from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()

ORD_API_URL = "https://api.ord.vk.com"
ORD_SANDBOX_URL = "https://api-sandbox.ord.vk.com"


async def _get_ord_settings(channel_id: int):
    """Get ORD API settings for channel."""
    row = await fetch_one(
        "SELECT * FROM ord_settings WHERE channel_id = $1", channel_id
    )
    return row


async def _ord_request(method: str, path: str, token: str, sandbox: bool = False, json_body=None, data=None):
    """Make request to VK ORD API."""
    base = ORD_SANDBOX_URL if sandbox else ORD_API_URL
    headers = {"Authorization": f"Bearer {token}"}
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    async with aiohttp.ClientSession() as session:
        kwargs = {"headers": headers}
        if json_body is not None:
            kwargs["json"] = json_body
        if data is not None:
            kwargs["data"] = data

        async with session.request(method, f"{base}{path}", **kwargs) as resp:
            if resp.status == 204:
                return {"success": True}
            try:
                result = await resp.json()
            except Exception:
                text = await resp.text()
                result = {"raw": text}
            if resp.status >= 400:
                return {"success": False, "status": resp.status, "error": result}
            return {"success": True, "status": resp.status, "data": result}


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, user_id
    )


# ─── Settings ───

@router.get("/{tc}/settings")
async def get_settings(tc: str, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    return {"success": True, "settings": settings}


@router.post("/{tc}/settings")
async def save_settings(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    token = body.get("api_token", "")
    sandbox = body.get("sandbox", False)

    # Test token
    result = await _ord_request("GET", "/v1/person?limit=1", token, sandbox)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=f"Ошибка API: {result.get('error', 'Неверный токен')}")

    existing = await _get_ord_settings(channel["id"])
    if existing:
        await execute(
            "UPDATE ord_settings SET api_token = $1, sandbox = $2 WHERE channel_id = $3",
            token, sandbox, channel["id"],
        )
    else:
        await execute_returning_id(
            "INSERT INTO ord_settings (channel_id, api_token, sandbox) VALUES ($1, $2, $3) RETURNING id",
            channel["id"], token, sandbox,
        )
    return {"success": True}


# ─── Counterparties (Контрагенты) ───

@router.get("/{tc}/persons")
async def list_persons(tc: str, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all("SELECT * FROM ord_persons WHERE channel_id = $1 ORDER BY created_at", channel["id"])
    return {"success": True, "persons": rows}


@router.post("/{tc}/persons")
async def create_person(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    body = await request.json()
    external_id = body.get("external_id", "")
    name = body.get("name", "")
    inn = body.get("inn", "")
    role = body.get("role", "advertiser")
    person_type = body.get("person_type", "juridical")

    if not external_id or not name or not inn:
        raise HTTPException(status_code=400, detail="external_id, name и inn обязательны")

    # Create in VK ORD
    ord_body = {
        "name": name,
        "roles": [role],
        "juridical_details": {
            "type": person_type,
            "inn": inn,
        },
    }
    result = await _ord_request("PUT", f"/v1/person/{external_id}", settings["api_token"], settings.get("sandbox", False), json_body=ord_body)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"ORD API: {result.get('error')}")

    # Save locally
    pid = await execute_returning_id(
        """INSERT INTO ord_persons (channel_id, external_id, name, inn, role, person_type)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (channel_id, external_id) DO UPDATE SET name=$3, inn=$4, role=$5, person_type=$6
           RETURNING id""",
        channel["id"], external_id, name, inn, role, person_type,
    )
    return {"success": True, "id": pid, "ord_response": result.get("data")}


# ─── Contracts (Договоры) ───

@router.get("/{tc}/contracts")
async def list_contracts(tc: str, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all("SELECT * FROM ord_contracts WHERE channel_id = $1 ORDER BY created_at", channel["id"])
    return {"success": True, "contracts": rows}


@router.post("/{tc}/contracts")
async def create_contract(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    body = await request.json()
    external_id = body.get("external_id", "")
    client_external_id = body.get("client_external_id", "")
    contractor_external_id = body.get("contractor_external_id", "")
    date = body.get("date", "")
    serial = body.get("serial", "")
    amount = body.get("amount", "")
    subject_type = body.get("subject_type", "distribution")

    ord_body = {
        "type": "service",
        "client_external_id": client_external_id,
        "contractor_external_id": contractor_external_id,
        "date": date,
        "subject_type": subject_type,
    }
    if serial:
        ord_body["serial"] = serial
    if amount:
        ord_body["amount"] = str(amount)

    result = await _ord_request("PUT", f"/v1/contract/{external_id}", settings["api_token"], settings.get("sandbox", False), json_body=ord_body)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"ORD API: {result.get('error')}")

    cid = await execute_returning_id(
        """INSERT INTO ord_contracts (channel_id, external_id, client_external_id, contractor_external_id, date, serial, amount, subject_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (channel_id, external_id) DO UPDATE SET client_external_id=$3, contractor_external_id=$4, date=$5, serial=$6, amount=$7, subject_type=$8
           RETURNING id""",
        channel["id"], external_id, client_external_id, contractor_external_id, date, serial, amount or "", subject_type,
    )
    return {"success": True, "id": cid, "ord_response": result.get("data")}


# ─── Platforms (Площадки) ───

@router.post("/{tc}/pads")
async def create_pad(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    body = await request.json()
    external_id = body.get("external_id", "")
    person_external_id = body.get("person_external_id", "")
    name = body.get("name", channel.get("title", ""))
    url = body.get("url", "")

    ord_body = {
        "person_external_id": person_external_id,
        "is_owner": True,
        "type": "web",
        "name": name,
        "url": url,
    }
    result = await _ord_request("PUT", f"/v1/pad/{external_id}", settings["api_token"], settings.get("sandbox", False), json_body=ord_body)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"ORD API: {result.get('error')}")

    await execute(
        """INSERT INTO ord_pads (channel_id, external_id, person_external_id, name, url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (channel_id, external_id) DO UPDATE SET person_external_id=$3, name=$4, url=$5""",
        channel["id"], external_id, person_external_id, name, url,
    )
    return {"success": True, "ord_response": result.get("data")}


# ─── Creatives (Получение ERID) ───

@router.post("/{tc}/creatives")
async def create_creative(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    """Create creative in VK ORD and get ERID token."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    body = await request.json()
    external_id = body.get("external_id", "")
    contract_external_id = body.get("contract_external_id", "")
    person_external_id = body.get("person_external_id", "")  # for self-promo
    form = body.get("form", "text_block")
    texts = body.get("texts", [])
    brand = body.get("brand", "")
    target_urls = body.get("target_urls", [])
    kktus = body.get("kktus", ["1.1.1"])
    pay_type = body.get("pay_type", "other")

    ord_body = {
        "form": form,
        "kktus": kktus,
        "pay_type": pay_type,
    }
    if contract_external_id:
        ord_body["contract_external_ids"] = [contract_external_id]
    elif person_external_id:
        ord_body["person_external_id"] = person_external_id

    if texts:
        ord_body["texts"] = texts
    if brand:
        ord_body["brand"] = brand
    if target_urls:
        ord_body["target_urls"] = target_urls
    if body.get("name"):
        ord_body["name"] = body["name"]

    result = await _ord_request("PUT", f"/v3/creative/{external_id}", settings["api_token"], settings.get("sandbox", False), json_body=ord_body)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"ORD API: {result.get('error')}")

    erid = result.get("data", {}).get("erid", "")

    # Save locally
    await execute(
        """INSERT INTO ord_creatives (channel_id, external_id, contract_external_id, erid, form, brand, texts)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (channel_id, external_id) DO UPDATE SET erid=$4""",
        channel["id"], external_id, contract_external_id or person_external_id, erid, form, brand,
        json.dumps(texts, ensure_ascii=False),
    )
    return {"success": True, "erid": erid, "ord_response": result.get("data")}


@router.get("/{tc}/creatives")
async def list_creatives(tc: str, user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all("SELECT * FROM ord_creatives WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    return {"success": True, "creatives": rows}


# ─── Statistics ───

@router.post("/{tc}/statistics")
async def send_statistics(tc: str, request: Request, user: Dict = Depends(get_current_user)):
    """Send impression statistics to VK ORD."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    body = await request.json()
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="items обязателен")

    result = await _ord_request("POST", "/v3/statistics", settings["api_token"], settings.get("sandbox", False), json_body={"items": items})
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"ORD API: {result.get('error')}")

    return {"success": True, "ord_response": result.get("data")}


# ─── Marked posts (промаркированные посты) ───

@router.get("/{tc}/marked-posts")
async def list_marked_posts(tc: str, user: Dict = Depends(get_current_user)):
    """Get all posts with ERID across content_posts, pin_posts, giveaways."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    marked = []

    # Content posts with erid
    posts = await fetch_all(
        "SELECT id, title, erid, status, telegram_message_id, published_at, created_at FROM content_posts WHERE channel_id = $1 AND erid IS NOT NULL AND erid != '' ORDER BY created_at DESC",
        channel["id"],
    )
    for p in posts:
        views = await fetch_one("SELECT views_count, checked_at FROM post_views WHERE channel_id = $1 AND post_type = 'content' AND post_id = $2", channel["id"], p["id"])
        marked.append({**p, "post_type": "content", "views_count": views["views_count"] if views else 0, "views_checked_at": str(views["checked_at"]) if views else None})

    # Pin posts with erid
    pins = await fetch_all(
        "SELECT id, title, erid, status, telegram_message_id, published_at, created_at FROM pin_posts WHERE channel_id = $1 AND erid IS NOT NULL AND erid != '' ORDER BY created_at DESC",
        channel["id"],
    )
    for p in pins:
        views = await fetch_one("SELECT views_count, checked_at FROM post_views WHERE channel_id = $1 AND post_type = 'pin' AND post_id = $2", channel["id"], p["id"])
        marked.append({**p, "post_type": "pin", "views_count": views["views_count"] if views else 0, "views_checked_at": str(views["checked_at"]) if views else None})

    # Giveaways with erid
    gws = await fetch_all(
        "SELECT id, title, erid, status, telegram_message_id, published_at, created_at FROM giveaways WHERE channel_id = $1 AND erid IS NOT NULL AND erid != '' ORDER BY created_at DESC",
        channel["id"],
    )
    for g in gws:
        views = await fetch_one("SELECT views_count, checked_at FROM post_views WHERE channel_id = $1 AND post_type = 'giveaway' AND post_id = $2", channel["id"], g["id"])
        marked.append({**g, "post_type": "giveaway", "views_count": views["views_count"] if views else 0, "views_checked_at": str(views["checked_at"]) if views else None})

    marked.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"success": True, "posts": marked}


# ─── KKTU dictionary ───

@router.get("/{tc}/kktu")
async def search_kktu(tc: str, search: str = "", user: Dict = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    settings = await _get_ord_settings(channel["id"])
    if not settings:
        raise HTTPException(status_code=400, detail="Сначала настройте API-токен ORD")

    path = f"/v1/dict/kktu?lang=ru"
    if search:
        path += f"&search={search}"
    result = await _ord_request("GET", path, settings["api_token"], settings.get("sandbox", False))
    return {"success": True, "items": result.get("data", {}).get("items", [])}
