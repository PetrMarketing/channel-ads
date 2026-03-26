"""Services (booking) module: branches, specialists, services, bookings, settings."""
import json
from datetime import datetime, timedelta, time as time_type
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Form
from ..middleware.auth import get_current_user
from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..services.file_storage import save_upload

router = APIRouter()
public_router = APIRouter()

# Strip binary file_data from response dicts to prevent serialization errors
_BINARY_KEYS = {"file_data", "cover_file_data"}

def _strip_binary(row):
    if row is None:
        return row
    if isinstance(row, dict):
        return {k: v for k, v in row.items() if k not in _BINARY_KEYS}
    return row

def _strip_binary_list(rows):
    return [_strip_binary(r) for r in rows]


async def _get_owned_channel(tc: str, uid: int):
    return await fetch_one("SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, uid)


# ═══════════════════════════════════════
# BRANCHES
# ═══════════════════════════════════════

@router.get("/{tc}/branches")
async def list_branches(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    branches = await fetch_all("SELECT * FROM service_branches WHERE channel_id = $1 ORDER BY created_at", channel["id"])
    return {"success": True, "branches": _strip_binary_list(branches)}


@router.post("/{tc}/branches")
async def create_branch(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    wh = body.get("working_hours", {})
    if isinstance(wh, str):
        wh = json.loads(wh)
    bid = await execute_returning_id(
        """INSERT INTO service_branches (channel_id, name, city, address, latitude, longitude, working_hours, buffer_time, phone, email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        channel["id"], body.get("name", ""), body.get("city"), body.get("address"),
        body.get("latitude"), body.get("longitude"),
        json.dumps(wh, ensure_ascii=False), int(body.get("buffer_time", 0)),
        body.get("phone"), body.get("email"),
    )
    return {"success": True, "id": bid}


@router.put("/{tc}/branches/{bid}")
async def update_branch(tc: str, bid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "city", "address", "phone", "email", "is_active", "buffer_time", "latitude", "longitude"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "working_hours" in body:
        wh = body["working_hours"]
        if isinstance(wh, dict):
            wh = json.dumps(wh, ensure_ascii=False)
        fields.append(f"working_hours = ${idx}")
        params.append(wh)
        idx += 1
    if fields:
        params.extend([bid, channel["id"]])
        await execute(f"UPDATE service_branches SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/branches/{bid}")
async def delete_branch(tc: str, bid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM service_branches WHERE id = $1 AND channel_id = $2", bid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# CATEGORIES
# ═══════════════════════════════════════

@router.get("/{tc}/categories")
async def list_categories(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    cats = await fetch_all("SELECT * FROM service_categories WHERE channel_id = $1 ORDER BY sort_order, name", channel["id"])
    return {"success": True, "categories": cats}


@router.post("/{tc}/categories")
async def create_category(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    pid = int(body["parent_id"]) if body.get("parent_id") else None
    cid = await execute_returning_id(
        "INSERT INTO service_categories (channel_id, name, parent_id, sort_order) VALUES ($1,$2,$3,$4) RETURNING id",
        channel["id"], body.get("name", ""), pid, int(body.get("sort_order", 0)),
    )
    return {"success": True, "id": cid}


@router.put("/{tc}/categories/{cid}")
async def update_category(tc: str, cid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    await execute("UPDATE service_categories SET name = $1 WHERE id = $2 AND channel_id = $3",
                  body.get("name", ""), cid, channel["id"])
    return {"success": True}


@router.delete("/{tc}/categories/{cid}")
async def delete_category(tc: str, cid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM service_categories WHERE id = $1 AND channel_id = $2", cid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# SERVICES
# ═══════════════════════════════════════

@router.get("/{tc}/services")
async def list_services(tc: str, category_id: Optional[int] = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if category_id:
        svcs = await fetch_all(
            "SELECT s.*, c.name as category_name FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.channel_id = $1 AND s.category_id = $2 ORDER BY s.name",
            channel["id"], category_id)
    else:
        svcs = await fetch_all(
            "SELECT s.*, c.name as category_name FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.channel_id = $1 ORDER BY s.name",
            channel["id"])
    return {"success": True, "services": _strip_binary_list(svcs)}


@router.post("/{tc}/services")
async def create_service(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    cat_id = int(body["category_id"]) if body.get("category_id") else None
    sid = await execute_returning_id(
        """INSERT INTO services (channel_id, category_id, name, description, service_type, duration_minutes, price, max_participants, cancel_hours, color)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
        channel["id"], cat_id, body.get("name", ""), body.get("description"),
        body.get("service_type", "single"), int(body.get("duration_minutes", 60)),
        float(body.get("price", 0)), int(body.get("max_participants", 1)),
        int(body.get("cancel_hours", 24)), body.get("color", "#4F46E5"),
    )
    return {"success": True, "id": sid}


@router.put("/{tc}/services/{sid}")
async def update_service(tc: str, sid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "description", "service_type", "duration_minutes", "price", "max_participants", "cancel_hours", "color", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "category_id" in body:
        fields.append(f"category_id = ${idx}")
        params.append(int(body["category_id"]) if body["category_id"] else None)
        idx += 1
    if fields:
        params.extend([sid, channel["id"]])
        await execute(f"UPDATE services SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/services/{sid}")
async def delete_service(tc: str, sid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM services WHERE id = $1 AND channel_id = $2", sid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# SPECIALISTS
# ═══════════════════════════════════════

@router.get("/{tc}/specialists")
async def list_specialists(tc: str, branch_id: Optional[int] = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if branch_id:
        specs = await fetch_all(
            "SELECT sp.*, b.name as branch_name FROM service_specialists sp LEFT JOIN service_branches b ON b.id = sp.branch_id WHERE sp.channel_id = $1 AND sp.branch_id = $2 ORDER BY sp.name",
            channel["id"], branch_id)
    else:
        specs = await fetch_all(
            "SELECT sp.*, b.name as branch_name FROM service_specialists sp LEFT JOIN service_branches b ON b.id = sp.branch_id WHERE sp.channel_id = $1 ORDER BY sp.name",
            channel["id"])
    return {"success": True, "specialists": _strip_binary_list(specs)}


@router.post("/{tc}/specialists")
async def create_specialist(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    wh = body.get("working_hours", {})
    if isinstance(wh, str):
        wh = json.loads(wh)
    br_id = int(body["branch_id"]) if body.get("branch_id") else None
    sid = await execute_returning_id(
        """INSERT INTO service_specialists (channel_id, branch_id, name, position, phone, email, description, working_hours, max_bookings_per_day)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        channel["id"], br_id, body.get("name", ""), body.get("position"),
        body.get("phone"), body.get("email"), body.get("description"),
        json.dumps(wh, ensure_ascii=False), int(body.get("max_bookings_per_day", 10)),
    )
    return {"success": True, "id": sid}


@router.put("/{tc}/specialists/{sid}")
async def update_specialist(tc: str, sid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "position", "phone", "email", "description", "max_bookings_per_day", "status", "is_active", "rating"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "branch_id" in body:
        fields.append(f"branch_id = ${idx}")
        params.append(int(body["branch_id"]) if body["branch_id"] else None)
        idx += 1
    if "working_hours" in body:
        wh = body["working_hours"]
        if isinstance(wh, dict):
            wh = json.dumps(wh, ensure_ascii=False)
        fields.append(f"working_hours = ${idx}")
        params.append(wh)
        idx += 1
    if fields:
        params.extend([sid, channel["id"]])
        await execute(f"UPDATE service_specialists SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/specialists/{sid}")
async def delete_specialist(tc: str, sid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM service_specialists WHERE id = $1 AND channel_id = $2", sid, channel["id"])
    return {"success": True}


def _file_url(file_path):
    """Generate public URL for an uploaded file."""
    if not file_path:
        return None
    import os
    rel = os.path.relpath(file_path, settings.UPLOAD_DIR)
    return f"{settings.APP_URL}/uploads/{rel.replace(os.sep, '/')}"


@router.post("/{tc}/specialists/{sid}/photo")
async def upload_specialist_photo(tc: str, sid: int, file: UploadFile = File(...), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    file_path, file_type, file_data = await save_upload(file, photo_only=True)
    photo_url = _file_url(file_path)
    await execute(
        "UPDATE service_specialists SET photo_url=$1, file_path=$2, file_type=$3, file_data=$4 WHERE id=$5 AND channel_id=$6",
        photo_url, file_path, file_type, file_data, sid, channel["id"])
    return {"success": True, "photo_url": photo_url}


@router.post("/{tc}/services/{sid}/image")
async def upload_service_image(tc: str, sid: int, file: UploadFile = File(...), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    file_path, file_type, file_data = await save_upload(file, photo_only=True)
    image_url = _file_url(file_path)
    await execute(
        "UPDATE services SET image_url=$1, file_path=$2, file_type=$3, file_data=$4 WHERE id=$5 AND channel_id=$6",
        image_url, file_path, file_type, file_data, sid, channel["id"])
    return {"success": True, "image_url": image_url}


@router.post("/{tc}/settings/cover")
async def upload_settings_cover(tc: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    file_path, file_type, file_data = await save_upload(file, photo_only=True)
    cover_url = _file_url(file_path)
    existing = await fetch_one("SELECT id FROM service_settings WHERE channel_id = $1", channel["id"])
    if existing:
        await execute(
            "UPDATE service_settings SET logo_url=$1, cover_file_path=$2, cover_file_type=$3, cover_file_data=$4 WHERE channel_id=$5",
            cover_url, file_path, file_type, file_data, channel["id"])
    else:
        await execute(
            "INSERT INTO service_settings (channel_id, logo_url, cover_file_path, cover_file_type, cover_file_data) VALUES ($1,$2,$3,$4,$5)",
            channel["id"], cover_url, file_path, file_type, file_data)
    return {"success": True, "cover_url": cover_url}


@router.post("/{tc}/specialists/{sid}/services")
async def assign_specialist_services(tc: str, sid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    service_ids = body.get("service_ids", [])
    custom_prices = body.get("custom_prices", {})
    await execute("DELETE FROM specialist_services WHERE specialist_id = $1", sid)
    for svc_id in service_ids:
        cp = custom_prices.get(str(svc_id))
        await execute(
            "INSERT INTO specialist_services (specialist_id, service_id, custom_price) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            sid, int(svc_id), float(cp) if cp else None,
        )
    return {"success": True}


@router.get("/{tc}/specialists/{sid}/services")
async def get_specialist_services(tc: str, sid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    svcs = await fetch_all(
        """SELECT s.*, ss.custom_price FROM specialist_services ss
           JOIN services s ON s.id = ss.service_id WHERE ss.specialist_id = $1""", sid)
    return {"success": True, "services": _strip_binary_list(svcs)}


# ═══════════════════════════════════════
# BOOKINGS
# ═══════════════════════════════════════

@router.get("/{tc}/bookings")
async def list_bookings(tc: str, date: str = Query(None), date_from: str = Query(None),
                        date_to: str = Query(None), status: str = Query(None),
                        specialist_id: int = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    query = """SELECT b.*, s.name as service_name, sp.name as specialist_name, br.name as branch_name
               FROM service_bookings b
               LEFT JOIN services s ON s.id = b.service_id
               LEFT JOIN service_specialists sp ON sp.id = b.specialist_id
               LEFT JOIN service_branches br ON br.id = b.branch_id
               WHERE b.channel_id = $1"""
    params = [channel["id"]]
    idx = 2
    if date_from and date_to:
        query += f" AND b.booking_date >= ${idx} AND b.booking_date <= ${idx+1}"
        params.extend([datetime.strptime(date_from, "%Y-%m-%d").date(), datetime.strptime(date_to, "%Y-%m-%d").date()])
        idx += 2
    elif date:
        query += f" AND b.booking_date = ${idx}"
        params.append(datetime.strptime(date, "%Y-%m-%d").date())
        idx += 1
    if status:
        query += f" AND b.status = ${idx}"
        params.append(status)
        idx += 1
    if specialist_id:
        query += f" AND b.specialist_id = ${idx}"
        params.append(specialist_id)
        idx += 1
    query += " ORDER BY b.booking_date, b.start_time"
    bookings = await fetch_all(query, *params)
    return {"success": True, "bookings": _strip_binary_list(bookings)}


@router.post("/{tc}/bookings")
async def create_booking(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    bid = await execute_returning_id(
        """INSERT INTO service_bookings (channel_id, branch_id, specialist_id, service_id,
           client_name, client_phone, client_email, client_max_user_id,
           booking_date, start_time, end_time, status, amount, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id""",
        channel["id"],
        int(body["branch_id"]) if body.get("branch_id") else None,
        int(body["specialist_id"]) if body.get("specialist_id") else None,
        int(body["service_id"]) if body.get("service_id") else None,
        body.get("client_name"), body.get("client_phone"), body.get("client_email"),
        body.get("client_max_user_id"),
        datetime.strptime(body["booking_date"], "%Y-%m-%d").date() if body.get("booking_date") else None,
        time_type.fromisoformat(body["start_time"]) if body.get("start_time") else None,
        time_type.fromisoformat(body["end_time"]) if body.get("end_time") else None,
        body.get("status", "pending"),
        float(body.get("amount", 0)), body.get("notes"),
    )
    return {"success": True, "id": bid}


@router.put("/{tc}/bookings/{bid}")
async def update_booking(tc: str, bid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("status", "payment_status", "notes", "client_name", "client_phone"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    for key in ("specialist_id", "service_id"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(int(body[key]) if body[key] else None)
            idx += 1
    if "booking_date" in body and body["booking_date"]:
        fields.append(f"booking_date = ${idx}")
        params.append(datetime.strptime(body["booking_date"], "%Y-%m-%d").date())
        idx += 1
    for key in ("start_time", "end_time"):
        if key in body and body[key]:
            fields.append(f"{key} = ${idx}")
            params.append(time_type.fromisoformat(body[key]))
            idx += 1
    if fields:
        params.extend([bid, channel["id"]])
        await execute(f"UPDATE service_bookings SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/bookings/{bid}")
async def delete_booking(tc: str, bid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM service_bookings WHERE id = $1 AND channel_id = $2", bid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════

@router.get("/{tc}/clients")
async def list_clients(tc: str, search: str = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    query = """SELECT client_name, client_phone, client_email,
               COUNT(*) as total_bookings,
               MAX(booking_date) as last_booking
               FROM service_bookings WHERE channel_id = $1"""
    params = [channel["id"]]
    idx = 2
    if search:
        query += f" AND (client_name ILIKE ${idx} OR client_phone ILIKE ${idx})"
        params.append(f"%{search}%")
        idx += 1
    query += " GROUP BY client_name, client_phone, client_email ORDER BY last_booking DESC"
    clients = await fetch_all(query, *params)
    return {"success": True, "clients": clients}


@router.get("/{tc}/client-bookings")
async def client_bookings(tc: str, phone: str = Query(None), name: str = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    query = """SELECT b.*, s.name as service_name, sp.name as specialist_name, br.name as branch_name
               FROM service_bookings b
               LEFT JOIN services s ON s.id = b.service_id
               LEFT JOIN service_specialists sp ON sp.id = b.specialist_id
               LEFT JOIN service_branches br ON br.id = b.branch_id
               WHERE b.channel_id = $1"""
    params = [channel["id"]]
    idx = 2
    if phone:
        query += f" AND b.client_phone = ${idx}"
        params.append(phone)
        idx += 1
    if name:
        query += f" AND b.client_name = ${idx}"
        params.append(name)
        idx += 1
    query += " ORDER BY b.booking_date DESC, b.start_time DESC"
    bookings = await fetch_all(query, *params)
    return {"success": True, "bookings": _strip_binary_list(bookings)}


# ═══════════════════════════════════════
# NOTIFICATION TEMPLATES
# ═══════════════════════════════════════

@router.get("/{tc}/notification-templates")
async def list_notification_templates(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    templates = await fetch_all("SELECT * FROM service_notification_templates WHERE channel_id = $1", channel["id"])
    return {"success": True, "templates": templates}


@router.post("/{tc}/notification-templates")
async def upsert_notification_template(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    await execute(
        """INSERT INTO service_notification_templates (channel_id, event_type, message_text, is_active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(channel_id, event_type) DO UPDATE SET message_text = $3, is_active = $4""",
        channel["id"], body.get("event_type"), body.get("message_text", ""), body.get("is_active", 1),
    )
    return {"success": True}


# ═══════════════════════════════════════
# SETTINGS / APPEARANCE
# ═══════════════════════════════════════

@router.get("/{tc}/settings")
async def get_settings(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    s = await fetch_one("SELECT * FROM service_settings WHERE channel_id = $1", channel["id"])
    return {"success": True, "settings": _strip_binary(s)}


@router.post("/{tc}/settings")
async def save_settings(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    existing = await fetch_one("SELECT id FROM service_settings WHERE channel_id = $1", channel["id"])
    if existing:
        await execute(
            """UPDATE service_settings SET primary_color=$1, welcome_text=$2, min_booking_hours=$3, slot_step_minutes=$4
               WHERE channel_id = $5""",
            body.get("primary_color", "#4F46E5"), body.get("welcome_text", ""),
            int(body.get("min_booking_hours", 2)), int(body.get("slot_step_minutes", 30)),
            channel["id"],
        )
    else:
        await execute(
            """INSERT INTO service_settings (channel_id, primary_color, welcome_text, min_booking_hours, slot_step_minutes)
               VALUES ($1,$2,$3,$4,$5)""",
            channel["id"], body.get("primary_color", "#4F46E5"), body.get("welcome_text", ""),
            int(body.get("min_booking_hours", 2)), int(body.get("slot_step_minutes", 30)),
        )
    return {"success": True}


# ═══════════════════════════════════════
# PUBLIC API (for miniapp, no auth)
# ═══════════════════════════════════════

@public_router.get("/{tc}/catalog")
async def public_catalog(tc: str):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    categories = await fetch_all(
        "SELECT id, name, parent_id FROM service_categories WHERE channel_id = $1 ORDER BY sort_order, name", channel["id"])
    services = await fetch_all(
        "SELECT id, name, description, image_url, category_id, service_type, duration_minutes, price, color, max_participants FROM services WHERE channel_id = $1 AND is_active = 1 ORDER BY name",
        channel["id"])
    return {"success": True, "categories": categories, "services": services}


@public_router.get("/{tc}/specialists")
async def public_specialists(tc: str, service_id: int = Query(None)):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if service_id:
        specs = await fetch_all(
            """SELECT sp.id, sp.name, sp.position, sp.photo_url, sp.description, sp.rating, ss.custom_price
               FROM service_specialists sp
               JOIN specialist_services ss ON ss.specialist_id = sp.id
               WHERE sp.channel_id = $1 AND ss.service_id = $2 AND sp.is_active = 1 AND sp.status = 'working'
               ORDER BY sp.name""",
            channel["id"], service_id)
    else:
        specs = await fetch_all(
            "SELECT id, name, position, photo_url, description, rating FROM service_specialists WHERE channel_id = $1 AND is_active = 1 AND status = 'working' ORDER BY name",
            channel["id"])
    return {"success": True, "specialists": _strip_binary_list(specs)}


@public_router.get("/{tc}/slots")
async def public_slots(tc: str, specialist_id: int = Query(...), service_id: int = Query(...), date: str = Query(...)):
    """Get available time slots for a specialist on a given date."""
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    specialist = await fetch_one("SELECT * FROM service_specialists WHERE id = $1 AND channel_id = $2", specialist_id, channel["id"])
    if not specialist:
        raise HTTPException(status_code=404, detail="Специалист не найден")

    service = await fetch_one("SELECT * FROM services WHERE id = $1 AND channel_id = $2", service_id, channel["id"])
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    # Get settings
    sett = await fetch_one("SELECT * FROM service_settings WHERE channel_id = $1", channel["id"])
    slot_step = sett["slot_step_minutes"] if sett else 30
    min_hours = sett["min_booking_hours"] if sett else 2

    # Get branch buffer_time
    buffer = 0
    if specialist.get("branch_id"):
        branch = await fetch_one("SELECT buffer_time FROM service_branches WHERE id = $1", specialist["branch_id"])
        if branch:
            buffer = branch.get("buffer_time", 0) or 0

    # Get working hours for day of week
    import datetime as dt
    booking_date = dt.date.fromisoformat(date)
    day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    day_key = day_names[booking_date.weekday()]

    wh = specialist.get("working_hours") or {}
    if isinstance(wh, str):
        wh = json.loads(wh)
    day_hours = wh.get(day_key, {})
    # Support both "from"/"to" and "start"/"end" keys
    def _normalize_hours(dh):
        if not dh:
            return dh
        if "from" in dh and "start" not in dh:
            dh["start"] = dh["from"]
        if "to" in dh and "end" not in dh:
            dh["end"] = dh["to"]
        return dh
    day_hours = _normalize_hours(day_hours)
    if not day_hours or not day_hours.get("start") or not day_hours.get("end"):
        # Try branch working hours
        if specialist.get("branch_id"):
            branch = await fetch_one("SELECT working_hours FROM service_branches WHERE id = $1", specialist["branch_id"])
            if branch:
                bwh = branch.get("working_hours") or {}
                if isinstance(bwh, str):
                    bwh = json.loads(bwh)
                day_hours = _normalize_hours(bwh.get(day_key, {}))
    if not day_hours or not day_hours.get("start") or not day_hours.get("end"):
        return {"success": True, "slots": [], "message": "Выходной день"}

    start_h, start_m = map(int, day_hours["start"].split(":"))
    end_h, end_m = map(int, day_hours["end"].split(":"))
    work_start = start_h * 60 + start_m
    work_end = end_h * 60 + end_m

    duration = service.get("duration_minutes", 60)

    # Get existing bookings
    existing = await fetch_all(
        "SELECT start_time, end_time FROM service_bookings WHERE specialist_id = $1 AND booking_date = $2 AND status NOT IN ('cancelled')",
        specialist_id, booking_date,
    )
    booked_ranges = []
    for b in existing:
        st = b["start_time"]
        et = b["end_time"]
        if hasattr(st, 'hour'):
            booked_ranges.append((st.hour * 60 + st.minute, et.hour * 60 + et.minute))
        else:
            sh, sm = map(int, str(st).split(":"))
            eh, em = map(int, str(et).split(":"))
            booked_ranges.append((sh * 60 + sm, eh * 60 + em))

    # Check max bookings per day
    booking_count = len(existing)
    max_per_day = specialist.get("max_bookings_per_day", 10)

    # Min booking time check
    now = dt.datetime.utcnow()
    min_time = 0
    if booking_date == now.date():
        min_time = (now.hour * 60 + now.minute) + min_hours * 60

    # Generate slots
    slots = []
    t = work_start
    while t + duration <= work_end:
        slot_end = t + duration
        # Check overlap with existing bookings (including buffer)
        overlaps = False
        for bs, be in booked_ranges:
            if t < be + buffer and slot_end > bs - buffer:
                overlaps = True
                break
        if not overlaps and t >= min_time and booking_count < max_per_day:
            h, m = divmod(t, 60)
            eh, em = divmod(slot_end, 60)
            slots.append({"start": f"{h:02d}:{m:02d}", "end": f"{eh:02d}:{em:02d}"})
        t += slot_step

    return {"success": True, "slots": slots}


@public_router.post("/{tc}/book")
async def public_book(tc: str, request: Request):
    """Create booking from miniapp."""
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()

    specialist_id = int(body["specialist_id"])
    service_id = int(body["service_id"])
    import datetime as dt
    book_date = dt.date.fromisoformat(body.get("booking_date") or body.get("date"))
    book_start = time_type.fromisoformat(body["start_time"])
    book_end = time_type.fromisoformat(body["end_time"])

    # Validate no overlap
    existing = await fetch_one(
        """SELECT id FROM service_bookings WHERE specialist_id = $1 AND booking_date = $2
           AND status NOT IN ('cancelled') AND start_time < $3 AND end_time > $4""",
        specialist_id, book_date, book_end, book_start,
    )
    if existing:
        raise HTTPException(status_code=400, detail="Это время уже занято")

    service = await fetch_one("SELECT * FROM services WHERE id = $1", service_id)
    specialist = await fetch_one("SELECT branch_id FROM service_specialists WHERE id = $1", specialist_id)

    client_name = body.get("client_name") or ""
    client_phone = body.get("client_phone") or ""
    client_max_user_id = str(body["client_max_user_id"]) if body.get("client_max_user_id") else None

    bid = await execute_returning_id(
        """INSERT INTO service_bookings (channel_id, branch_id, specialist_id, service_id,
           client_name, client_phone, client_email, client_max_user_id,
           booking_date, start_time, end_time, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id""",
        channel["id"],
        specialist["branch_id"] if specialist else None,
        specialist_id, service_id,
        client_name, client_phone, body.get("client_email"),
        client_max_user_id,
        book_date, book_start, book_end,
        float(service["price"]) if service else 0,
    )

    # Send notification to client via MAX bot
    if client_max_user_id:
        try:
            specialist_row = await fetch_one("SELECT name FROM service_specialists WHERE id = $1", specialist_id)
            service_name = service.get("name", "") if service else ""
            specialist_name = specialist_row.get("name", "") if specialist_row else ""
            date_str = book_date.strftime("%d.%m.%Y")
            time_str = f"{book_start.strftime('%H:%M')} – {book_end.strftime('%H:%M')}"

            # Get notification template
            tmpl = await fetch_one(
                "SELECT message_text, is_active FROM service_notification_templates WHERE channel_id = $1 AND event_type = 'booking_created'",
                channel["id"])
            if tmpl and tmpl.get("is_active", 1) and tmpl.get("message_text"):
                msg = tmpl["message_text"]
            else:
                msg = "✅ Вы записаны!\n\n📋 {service}\n👤 {specialist}\n📅 {date}\n🕐 {time}\n\nЖдём вас!"

            msg = msg.replace("{client_name}", client_name)
            msg = msg.replace("{service}", service_name)
            msg = msg.replace("{specialist}", specialist_name)
            msg = msg.replace("{date}", date_str)
            msg = msg.replace("{time}", time_str)

            from ..services.max_api import get_max_api
            max_api = get_max_api()
            if max_api:
                await max_api.send_direct_message(client_max_user_id, msg)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to send booking notification: {e}")

    return {"success": True, "booking_id": bid}


@public_router.get("/{tc}/appearance")
async def public_appearance(tc: str):
    channel = await fetch_one("SELECT id, title FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    s = await fetch_one("SELECT * FROM service_settings WHERE channel_id = $1", channel["id"])
    return {
        "success": True,
        "channel_title": channel.get("title", ""),
        "settings": _strip_binary(s) or {"primary_color": "#4F46E5", "welcome_text": ""},
    }
