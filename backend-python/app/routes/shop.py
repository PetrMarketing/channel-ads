"""Online shop module: products, categories, orders, cart, delivery, promotions."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()
public_router = APIRouter()


async def _get_owned_channel(tc: str, uid: int):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "shop")


# ═══════════════════════════════════════
# IMAGE UPLOAD
# ═══════════════════════════════════════

@router.post("/{tc}/upload-image")
async def upload_image(tc: str, request: Request, user=Depends(get_current_user)):
    """Upload image, return URL."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    form = await request.form()
    file = form.get("file")
    if not file or not hasattr(file, "read"):
        raise HTTPException(status_code=400, detail="Файл не загружен")
    from ..services.file_storage import save_upload
    from ..config import settings
    file_path, _, _ = await save_upload(file, photo_only=True)
    rel = file_path.replace(settings.UPLOAD_DIR, "").lstrip("/")
    url = f"/uploads/{rel}"
    return {"success": True, "url": url}


# ═══════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════

@router.get("/{tc}/settings")
async def get_settings(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    s = await fetch_one("SELECT * FROM shop_settings WHERE channel_id = $1", channel["id"])
    if not s:
        sid = await execute_returning_id(
            "INSERT INTO shop_settings (channel_id) VALUES ($1) RETURNING id", channel["id"])
        s = await fetch_one("SELECT * FROM shop_settings WHERE id = $1", sid)
    return {"success": True, "settings": s}


@router.post("/{tc}/settings")
async def save_settings(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    existing = await fetch_one("SELECT id FROM shop_settings WHERE channel_id = $1", channel["id"])
    if existing:
        await execute(
            """UPDATE shop_settings SET shop_name=$1, primary_color=$2, banner_url=$3, welcome_text=$4,
               currency=$5, min_order_amount=$6, require_phone=$7, require_email=$8, require_address=$9,
               manager_user_id=$10, manager_contact_url=$11, banners=$12 WHERE channel_id = $13""",
            body.get("shop_name", ""), body.get("primary_color", "#4F46E5"),
            body.get("banner_url"), body.get("welcome_text", ""),
            body.get("currency", "RUB"), float(body.get("min_order_amount", 0)),
            bool(body.get("require_phone", True)), bool(body.get("require_email", False)),
            bool(body.get("require_address", False)),
            int(body["manager_user_id"]) if body.get("manager_user_id") else None,
            body.get("manager_contact_url", ""),
            json.dumps(body.get("banners", []), ensure_ascii=False),
            channel["id"],
        )
    else:
        await execute(
            """INSERT INTO shop_settings (channel_id, shop_name, primary_color, banner_url, welcome_text,
               currency, min_order_amount, require_phone, require_email, require_address, manager_user_id, manager_contact_url, banners)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)""",
            channel["id"], body.get("shop_name", ""), body.get("primary_color", "#4F46E5"),
            body.get("banner_url"), body.get("welcome_text", ""),
            body.get("currency", "RUB"), float(body.get("min_order_amount", 0)),
            bool(body.get("require_phone", True)), bool(body.get("require_email", False)),
            bool(body.get("require_address", False)),
            int(body["manager_user_id"]) if body.get("manager_user_id") else None,
            body.get("manager_contact_url", ""),
            json.dumps(body.get("banners", []), ensure_ascii=False),
        )
    return {"success": True}


# ═══════════════════════════════════════
# CATEGORIES
# ═══════════════════════════════════════

@router.get("/{tc}/categories")
async def list_categories(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    cats = await fetch_all(
        "SELECT * FROM shop_categories WHERE channel_id = $1 ORDER BY sort_order, name", channel["id"])
    return {"success": True, "categories": cats}


@router.post("/{tc}/categories")
async def create_category(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    pid = int(body["parent_id"]) if body.get("parent_id") else None
    cid = await execute_returning_id(
        """INSERT INTO shop_categories (channel_id, name, description, parent_id, sort_order)
           VALUES ($1,$2,$3,$4,$5) RETURNING id""",
        channel["id"], body.get("name", ""), body.get("description"),
        pid, int(body.get("sort_order", 0)),
    )
    return {"success": True, "id": cid}


@router.put("/{tc}/categories/{cid}")
async def update_category(tc: str, cid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "description", "parent_id", "sort_order", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if fields:
        params.extend([cid, channel["id"]])
        await execute(
            f"UPDATE shop_categories SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/categories/{cid}")
async def delete_category(tc: str, cid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM shop_categories WHERE id = $1 AND channel_id = $2", cid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# PRODUCTS
# ═══════════════════════════════════════

@router.get("/{tc}/products")
async def list_products(tc: str, category_id: Optional[int] = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if category_id:
        products = await fetch_all(
            """SELECT p.*, c.name AS category_name FROM shop_products p
               LEFT JOIN shop_categories c ON c.id = p.category_id
               WHERE p.channel_id = $1 AND p.category_id = $2 ORDER BY p.created_at DESC""",
            channel["id"], category_id)
    else:
        products = await fetch_all(
            """SELECT p.*, c.name AS category_name FROM shop_products p
               LEFT JOIN shop_categories c ON c.id = p.category_id
               WHERE p.channel_id = $1 ORDER BY p.created_at DESC""",
            channel["id"])
    return {"success": True, "products": products}


@router.post("/{tc}/products")
async def create_product(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    images = body.get("images")
    if isinstance(images, list):
        images = json.dumps(images, ensure_ascii=False)
    pid = await execute_returning_id(
        """INSERT INTO shop_products (channel_id, name, description, category_id, price, compare_at_price,
           sku, stock, is_hit, is_new, image_url, images)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id""",
        channel["id"], body.get("name", ""), body.get("description"),
        int(body["category_id"]) if body.get("category_id") else None,
        float(body.get("price", 0)), float(body["compare_at_price"]) if body.get("compare_at_price") else None,
        body.get("sku"), int(body.get("stock", 0)),
        bool(body.get("is_hit", False)), bool(body.get("is_new", False)),
        body.get("image_url"), images,
    )
    return {"success": True, "id": pid}


@router.put("/{tc}/products/{pid}")
async def update_product(tc: str, pid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "description", "category_id", "price", "compare_at_price",
                "sku", "stock", "is_hit", "is_new", "image_url", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "images" in body:
        images = body["images"]
        if isinstance(images, list):
            images = json.dumps(images, ensure_ascii=False)
        fields.append(f"images = ${idx}")
        params.append(images)
        idx += 1
    if fields:
        params.extend([pid, channel["id"]])
        await execute(
            f"UPDATE shop_products SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/products/{pid}")
async def delete_product(tc: str, pid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM shop_products WHERE id = $1 AND channel_id = $2", pid, channel["id"])
    return {"success": True}


@router.post("/{tc}/import-feed")
async def import_feed(tc: str, request: Request, user=Depends(get_current_user)):
    """Import products from YML/XML feed (Yandex.Market format)."""
    import aiohttp
    from xml.etree import ElementTree as ET

    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL фида обязателен")

    # Fetch feed
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail=f"Ошибка загрузки фида: HTTP {resp.status}")
                xml_text = await resp.text()
    except aiohttp.ClientError as e:
        raise HTTPException(status_code=400, detail=f"Не удалось загрузить фид: {e}")

    # Parse XML
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга XML: {e}")

    # Find categories and offers (YML format)
    shop_el = root.find(".//shop") or root
    categories_el = shop_el.find("categories")
    offers_el = shop_el.find("offers")

    ch_id = channel["id"]
    cat_map = {}  # feed_category_id -> db_category_id
    cats_imported = 0

    # Import categories
    if categories_el is not None:
        for cat in categories_el.findall("category"):
            cat_id = cat.get("id")
            cat_name = (cat.text or "").strip()
            parent_feed_id = cat.get("parentId")
            if not cat_name:
                continue
            parent_db_id = cat_map.get(parent_feed_id) if parent_feed_id else None
            existing = await fetch_one(
                "SELECT id FROM shop_categories WHERE channel_id = $1 AND name = $2",
                ch_id, cat_name,
            )
            if existing:
                cat_map[cat_id] = existing["id"]
            else:
                new_id = await execute_returning_id(
                    "INSERT INTO shop_categories (channel_id, name, parent_id) VALUES ($1, $2, $3) RETURNING id",
                    ch_id, cat_name, parent_db_id,
                )
                cat_map[cat_id] = new_id
                cats_imported += 1

    # Import products (offers)
    products_imported = 0
    if offers_el is not None:
        for offer in offers_el.findall("offer"):
            name = (offer.findtext("name") or offer.findtext("model") or "").strip()
            if not name:
                type_prefix = offer.findtext("typePrefix") or ""
                vendor = offer.findtext("vendor") or ""
                model = offer.findtext("model") or ""
                name = " ".join(filter(None, [type_prefix, vendor, model])).strip()
            if not name:
                continue

            price_text = offer.findtext("price") or "0"
            try:
                price = float(price_text)
            except ValueError:
                price = 0

            old_price_text = offer.findtext("oldprice")
            compare_at = float(old_price_text) if old_price_text else None

            description = offer.findtext("description") or ""
            sku = offer.get("id") or ""
            image_url = offer.findtext("picture") or ""
            cat_feed_id = offer.findtext("categoryId")
            cat_db_id = cat_map.get(cat_feed_id)

            # Additional images
            images = []
            for pic in offer.findall("picture"):
                pic_url = (pic.text or "").strip()
                if pic_url and pic_url != image_url:
                    images.append(pic_url)

            stock_text = offer.findtext("stock_quantity") or offer.findtext("count")
            stock = int(stock_text) if stock_text and stock_text.isdigit() else -1

            # Upsert by SKU
            if sku:
                existing = await fetch_one(
                    "SELECT id FROM shop_products WHERE channel_id = $1 AND sku = $2", ch_id, sku,
                )
                if existing:
                    await execute(
                        """UPDATE shop_products SET name=$1, description=$2, price=$3, compare_at_price=$4,
                           image_url=$5, images=$6, category_id=$7, stock=$8 WHERE id=$9""",
                        name, description, price, compare_at, image_url,
                        json.dumps(images), cat_db_id, stock, existing["id"],
                    )
                    products_imported += 1
                    continue

            await execute_returning_id(
                """INSERT INTO shop_products (channel_id, category_id, name, description, price, compare_at_price,
                   sku, image_url, images, stock) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
                ch_id, cat_db_id, name, description, price, compare_at,
                sku, image_url, json.dumps(images), stock,
            )
            products_imported += 1

    return {"success": True, "imported": products_imported, "categories_imported": cats_imported}


# ═══════════════════════════════════════
# PRODUCT VARIANTS
# ═══════════════════════════════════════

@router.get("/{tc}/products/{pid}/variants")
async def list_variants(tc: str, pid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    variants = await fetch_all(
        """SELECT v.* FROM shop_product_variants v
           JOIN shop_products p ON p.id = v.product_id
           WHERE v.product_id = $1 AND p.channel_id = $2 ORDER BY v.id""",
        pid, channel["id"])
    return {"success": True, "variants": variants}


@router.post("/{tc}/products/{pid}/variants")
async def create_variant(tc: str, pid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    product = await fetch_one(
        "SELECT id FROM shop_products WHERE id = $1 AND channel_id = $2", pid, channel["id"])
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    body = await request.json()
    vid = await execute_returning_id(
        """INSERT INTO shop_product_variants (product_id, name, sku, price, stock)
           VALUES ($1,$2,$3,$4,$5) RETURNING id""",
        pid, body.get("name", ""), body.get("sku"),
        float(body.get("price", 0)), int(body.get("stock", 0)),
    )
    return {"success": True, "id": vid}


@router.put("/{tc}/products/{pid}/variants/{vid}")
async def update_variant(tc: str, pid: int, vid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "sku", "price", "stock"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if fields:
        params.extend([vid, pid])
        await execute(
            f"UPDATE shop_product_variants SET {', '.join(fields)} WHERE id = ${idx} AND product_id = ${idx+1}",
            *params)
    return {"success": True}


@router.delete("/{tc}/products/{pid}/variants/{vid}")
async def delete_variant(tc: str, pid: int, vid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM shop_product_variants WHERE id = $1 AND product_id = $2", vid, pid)
    return {"success": True}


# ═══════════════════════════════════════
# DELIVERY METHODS
# ═══════════════════════════════════════

@router.get("/{tc}/delivery")
async def list_delivery(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    methods = await fetch_all(
        "SELECT * FROM shop_delivery_methods WHERE channel_id = $1 ORDER BY id", channel["id"])
    return {"success": True, "delivery_methods": methods}


@router.post("/{tc}/delivery")
async def create_delivery(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    did = await execute_returning_id(
        """INSERT INTO shop_delivery_methods (channel_id, name, description, price, free_from, estimated_days)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
        channel["id"], body.get("name", ""), body.get("description"),
        float(body.get("price", 0)),
        float(body["free_from"]) if body.get("free_from") is not None else None,
        body.get("estimated_days"),
    )
    return {"success": True, "id": did}


@router.put("/{tc}/delivery/{did}")
async def update_delivery(tc: str, did: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "description", "price", "free_from", "estimated_days", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if fields:
        params.extend([did, channel["id"]])
        await execute(
            f"UPDATE shop_delivery_methods SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}",
            *params)
    return {"success": True}


@router.delete("/{tc}/delivery/{did}")
async def delete_delivery(tc: str, did: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM shop_delivery_methods WHERE id = $1 AND channel_id = $2", did, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# PROMOTIONS
# ═══════════════════════════════════════

@router.get("/{tc}/promotions")
async def list_promotions(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    promos = await fetch_all(
        "SELECT * FROM shop_promotions WHERE channel_id = $1 ORDER BY created_at DESC", channel["id"])
    return {"success": True, "promotions": promos}


@router.post("/{tc}/promotions")
async def create_promotion(tc: str, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    pid = await execute_returning_id(
        """INSERT INTO shop_promotions (channel_id, name, promo_type, code, discount_value,
           min_order_amount, max_uses, starts_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        channel["id"], body.get("name", ""), body.get("promo_type", "percentage"),
        body.get("code"), float(body.get("discount_value", 0)),
        float(body["min_order_amount"]) if body.get("min_order_amount") else None,
        int(body["max_uses"]) if body.get("max_uses") else None,
        body.get("starts_at"), body.get("expires_at"),
    )
    return {"success": True, "id": pid}


@router.put("/{tc}/promotions/{pid}")
async def update_promotion(tc: str, pid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("name", "promo_type", "code", "discount_value", "min_order_amount",
                "max_uses", "starts_at", "expires_at", "is_active"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if fields:
        params.extend([pid, channel["id"]])
        await execute(
            f"UPDATE shop_promotions SET {', '.join(fields)} WHERE id = ${idx} AND channel_id = ${idx+1}", *params)
    return {"success": True}


@router.delete("/{tc}/promotions/{pid}")
async def delete_promotion(tc: str, pid: int, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await execute("DELETE FROM shop_promotions WHERE id = $1 AND channel_id = $2", pid, channel["id"])
    return {"success": True}


# ═══════════════════════════════════════
# ORDERS
# ═══════════════════════════════════════

@router.get("/{tc}/orders")
async def list_orders(tc: str, status: Optional[str] = Query(None), user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if status:
        orders = await fetch_all(
            """SELECT o.*, d.name AS delivery_method_name FROM shop_orders o
               LEFT JOIN shop_delivery_methods d ON d.id = o.delivery_method_id
               WHERE o.channel_id = $1 AND o.status = $2 ORDER BY o.created_at DESC""",
            channel["id"], status)
    else:
        orders = await fetch_all(
            """SELECT o.*, d.name AS delivery_method_name FROM shop_orders o
               LEFT JOIN shop_delivery_methods d ON d.id = o.delivery_method_id
               WHERE o.channel_id = $1 ORDER BY o.created_at DESC""",
            channel["id"])
    for order in orders:
        items = await fetch_all(
            """SELECT oi.*, p.name AS product_name, p.image_url
               FROM shop_order_items oi
               LEFT JOIN shop_products p ON p.id = oi.product_id
               WHERE oi.order_id = $1""", order["id"])
        order["items"] = items
    return {"success": True, "orders": orders}


@router.put("/{tc}/orders/{oid}/status")
async def update_order_status(tc: str, oid: int, request: Request, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Статус обязателен")
    await execute(
        "UPDATE shop_orders SET status = $1 WHERE id = $2 AND channel_id = $3",
        new_status, oid, channel["id"])
    return {"success": True}


@router.get("/{tc}/orders/stats")
async def orders_stats(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        "SELECT status, COUNT(*) AS cnt FROM shop_orders WHERE channel_id = $1 GROUP BY status",
        channel["id"])
    stats = {r["status"]: r["cnt"] for r in rows}
    return {"success": True, "stats": stats}


# ═══════════════════════════════════════
# CLIENTS (KANBAN FUNNEL)
# ═══════════════════════════════════════

@router.get("/{tc}/clients")
async def clients_funnel(tc: str, user=Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    ch_id = channel["id"]
    visited = await fetch_one(
        "SELECT COUNT(DISTINCT user_identifier) AS cnt FROM shop_visits WHERE channel_id = $1", ch_id)
    cart = await fetch_one(
        """SELECT COUNT(DISTINCT c.user_identifier) AS cnt FROM shop_carts c
           WHERE c.channel_id = $1 AND EXISTS (SELECT 1 FROM shop_cart_items ci WHERE ci.cart_id = c.id)""", ch_id)
    ordered = await fetch_one(
        "SELECT COUNT(*) AS cnt FROM shop_orders WHERE channel_id = $1", ch_id)
    paid = await fetch_one(
        "SELECT COUNT(*) AS cnt FROM shop_orders WHERE channel_id = $1 AND payment_status = 'paid'", ch_id)
    return {
        "success": True,
        "funnel": {
            "visited": visited["cnt"] if visited else 0,
            "cart": cart["cnt"] if cart else 0,
            "ordered": ordered["cnt"] if ordered else 0,
            "paid": paid["cnt"] if paid else 0,
        },
    }


# ═══════════════════════════════════════
# PUBLIC ROUTES
# ═══════════════════════════════════════

@public_router.get("/{tc}/catalog")
async def public_catalog(tc: str):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    categories = await fetch_all(
        "SELECT id, name, description, parent_id FROM shop_categories WHERE channel_id = $1 AND is_active = 1 ORDER BY sort_order, name",
        channel["id"])
    products = await fetch_all(
        """SELECT id, name, description, category_id, price, compare_at_price, image_url, images, is_hit, is_new
           FROM shop_products WHERE channel_id = $1 AND is_active = 1 ORDER BY created_at DESC""",
        channel["id"])
    return {"success": True, "categories": categories, "products": products}


@public_router.get("/{tc}/product/{pid}")
async def public_product(tc: str, pid: int):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    product = await fetch_one(
        """SELECT p.*, c.name AS category_name FROM shop_products p
           LEFT JOIN shop_categories c ON c.id = p.category_id
           WHERE p.id = $1 AND p.channel_id = $2""",
        pid, channel["id"])
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    variants = await fetch_all(
        "SELECT * FROM shop_product_variants WHERE product_id = $1 ORDER BY id", pid)
    product["variants"] = variants
    return {"success": True, "product": product}


@public_router.get("/{tc}/appearance")
async def public_appearance(tc: str):
    channel = await fetch_one("SELECT id, title, privacy_policy_url FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    s = await fetch_one("SELECT * FROM shop_settings WHERE channel_id = $1", channel["id"])
    return {
        "success": True,
        "channel_title": channel.get("title", ""),
        "settings": s or {"primary_color": "#4F46E5", "welcome_text": "", "currency": "RUB"},
        "privacy_policy_url": channel.get("privacy_policy_url", ""),
    }


@public_router.get("/{tc}/delivery-methods")
async def public_delivery_methods(tc: str):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    methods = await fetch_all(
        "SELECT id, name, description, price, free_from, estimated_days FROM shop_delivery_methods WHERE channel_id = $1 AND is_active = 1 ORDER BY id",
        channel["id"])
    return {"success": True, "delivery_methods": methods}


@public_router.get("/{tc}/cart/{user_id}")
async def get_cart(tc: str, user_id: str):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    cart = await fetch_one(
        "SELECT id FROM shop_carts WHERE channel_id = $1 AND user_identifier = $2", channel["id"], user_id)
    if not cart:
        return {"success": True, "items": []}
    items = await fetch_all(
        """SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
           p.name, p.price, p.image_url, v.name AS variant_name, v.price AS variant_price
           FROM shop_cart_items ci
           JOIN shop_products p ON p.id = ci.product_id
           LEFT JOIN shop_product_variants v ON v.id = ci.variant_id
           WHERE ci.cart_id = $1""", cart["id"])
    return {"success": True, "items": items}


@public_router.post("/{tc}/cart")
async def add_to_cart(tc: str, request: Request):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    user_identifier = body.get("user_identifier")
    product_id = int(body["product_id"])
    variant_id = int(body["variant_id"]) if body.get("variant_id") else None
    quantity = int(body.get("quantity", 1))

    cart = await fetch_one(
        "SELECT id FROM shop_carts WHERE channel_id = $1 AND user_identifier = $2", channel["id"], user_identifier)
    if not cart:
        cart_id = await execute_returning_id(
            "INSERT INTO shop_carts (channel_id, user_identifier) VALUES ($1,$2) RETURNING id",
            channel["id"], user_identifier)
    else:
        cart_id = cart["id"]

    existing = await fetch_one(
        "SELECT id FROM shop_cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3",
        cart_id, product_id, variant_id)

    if quantity <= 0:
        if existing:
            await execute("DELETE FROM shop_cart_items WHERE id = $1", existing["id"])
        return {"success": True}

    if existing:
        await execute("UPDATE shop_cart_items SET quantity = $1 WHERE id = $2", quantity, existing["id"])
    else:
        await execute(
            "INSERT INTO shop_cart_items (cart_id, product_id, variant_id, quantity) VALUES ($1,$2,$3,$4)",
            cart_id, product_id, variant_id, quantity)
    return {"success": True}


@public_router.delete("/{tc}/cart/{user_id}/{item_id}")
async def remove_cart_item(tc: str, user_id: str, item_id: int):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    cart = await fetch_one(
        "SELECT id FROM shop_carts WHERE channel_id = $1 AND user_identifier = $2", channel["id"], user_id)
    if not cart:
        raise HTTPException(status_code=404, detail="Корзина не найдена")
    await execute("DELETE FROM shop_cart_items WHERE id = $1 AND cart_id = $2", item_id, cart["id"])
    return {"success": True}


@public_router.post("/{tc}/checkout")
async def checkout(tc: str, request: Request):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    user_identifier = body.get("user_identifier")

    cart = await fetch_one(
        "SELECT id FROM shop_carts WHERE channel_id = $1 AND user_identifier = $2", channel["id"], user_identifier)
    if not cart:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    items = await fetch_all(
        """SELECT ci.product_id, ci.variant_id, ci.quantity,
           p.price AS product_price, p.stock AS product_stock, p.name AS product_name,
           v.price AS variant_price, v.stock AS variant_stock, v.name AS variant_name
           FROM shop_cart_items ci
           JOIN shop_products p ON p.id = ci.product_id
           LEFT JOIN shop_product_variants v ON v.id = ci.variant_id
           WHERE ci.cart_id = $1""", cart["id"])
    if not items:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    subtotal = 0.0
    for item in items:
        price = float(item["variant_price"] if item["variant_price"] is not None else item["product_price"])
        stock = item["variant_stock"] if item["variant_stock"] is not None else item["product_stock"]
        if stock is not None and stock != -1 and item["quantity"] > stock:
            raise HTTPException(status_code=400, detail=f"Недостаточно товара: {item['product_name']}")
        subtotal += price * item["quantity"]

    discount = 0.0
    promo_code = body.get("promo_code")
    if promo_code:
        promo = await fetch_one(
            """SELECT * FROM shop_promotions WHERE channel_id = $1 AND code = $2 AND is_active = 1
               AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW())""",
            channel["id"], promo_code)
        if promo:
            if promo.get("min_order_amount") and subtotal < float(promo["min_order_amount"]):
                pass
            elif promo.get("max_uses") and promo.get("used_count", 0) >= promo["max_uses"]:
                pass
            else:
                if promo["promo_type"] == "percent":
                    discount = subtotal * float(promo["discount_value"]) / 100
                elif promo["promo_type"] == "fixed":
                    discount = float(promo["discount_value"])
                elif promo["promo_type"] == "free_delivery":
                    delivery_cost = 0.0
                await execute("UPDATE shop_promotions SET used_count = COALESCE(used_count, 0) + 1 WHERE id = $1", promo["id"])

    delivery_cost = 0.0
    delivery_method_id = int(body["delivery_method_id"]) if body.get("delivery_method_id") else None
    if delivery_method_id:
        dm = await fetch_one("SELECT price, free_from FROM shop_delivery_methods WHERE id = $1", delivery_method_id)
        if dm:
            delivery_cost = float(dm["price"] or 0)
            if dm["free_from"] and subtotal >= float(dm["free_from"]):
                delivery_cost = 0

    total = subtotal - discount + delivery_cost

    import secrets as _sec
    order_number = f"SH-{_sec.token_hex(4).upper()}"

    order_id = await execute_returning_id(
        """INSERT INTO shop_orders (channel_id, order_number, user_identifier, client_name, client_phone, client_email,
           client_address, delivery_method_id, discount_amount, subtotal, delivery_price, total, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'new') RETURNING id""",
        channel["id"], order_number, user_identifier, body.get("client_name"), body.get("client_phone"),
        body.get("client_email"), body.get("client_address"),
        delivery_method_id, discount, subtotal, delivery_cost, total, body.get("notes"),
    )

    for item in items:
        price = float(item["variant_price"] if item["variant_price"] is not None else item["product_price"])
        await execute(
            "INSERT INTO shop_order_items (order_id, product_id, variant_id, product_name, variant_name, quantity, price) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            order_id, item["product_id"], item["variant_id"],
            item["product_name"], item.get("variant_name"), item["quantity"], price)
        if item["variant_id"] and item.get("variant_stock") is not None and item["variant_stock"] != -1:
            await execute("UPDATE shop_product_variants SET stock = stock - $1 WHERE id = $2 AND stock > 0", item["quantity"], item["variant_id"])
        elif item.get("product_stock") is not None and item["product_stock"] != -1:
            await execute("UPDATE shop_products SET stock = stock - $1 WHERE id = $2 AND stock > 0", item["quantity"], item["product_id"])

    await execute("DELETE FROM shop_cart_items WHERE cart_id = $1", cart["id"])
    await execute("DELETE FROM shop_carts WHERE id = $1", cart["id"])

    # Notify manager about new order
    try:
        shop_s = await fetch_one("SELECT manager_user_id FROM shop_settings WHERE channel_id = $1", channel["id"])
        manager_id = shop_s.get("manager_user_id") if shop_s else None
        if manager_id:
            from ..services.messenger import send_to_user
            order_lines = [f"<b>Новый заказ {order_number}</b>\n"]
            order_lines.append(f"Клиент: {body.get('client_name', '')} {body.get('client_phone', '')}")
            for item in items:
                p = float(item["variant_price"] if item["variant_price"] is not None else item["product_price"])
                order_lines.append(f"  {item['product_name']} x{item['quantity']} — {p * item['quantity']:.0f} RUB")
            order_lines.append(f"\nИтого: <b>{total:.0f} RUB</b>")
            admin_text = "\n".join(order_lines)
            mgr_user = await fetch_one("SELECT telegram_id, max_user_id FROM users WHERE id = $1", manager_id)
            if mgr_user:
                if mgr_user.get("max_user_id"):
                    await send_to_user(mgr_user["max_user_id"], "max", admin_text)
                elif mgr_user.get("telegram_id"):
                    await send_to_user(int(mgr_user["telegram_id"]), "telegram", admin_text)
    except Exception as e:
        print(f"[Shop] Manager notification error: {e}")

    return {"success": True, "order_id": order_id, "order_number": order_number, "total": total}


@public_router.post("/{tc}/apply-promo")
async def apply_promo(tc: str, request: Request):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    code = body.get("code")
    subtotal = float(body.get("subtotal", 0))

    promo = await fetch_one(
        """SELECT * FROM shop_promotions WHERE channel_id = $1 AND code = $2 AND is_active = 1
           AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW())""",
        channel["id"], code)
    if not promo:
        raise HTTPException(status_code=404, detail="Промокод не найден или истёк")

    if promo.get("min_order_amount") and subtotal < promo["min_order_amount"]:
        raise HTTPException(status_code=400, detail=f"Минимальная сумма заказа: {promo['min_order_amount']}")
    if promo.get("max_uses") and promo.get("used_count", 0) >= promo["max_uses"]:
        raise HTTPException(status_code=400, detail="Промокод исчерпан")

    if promo["promo_type"] == "percentage":
        discount = subtotal * promo["discount_value"] / 100
    else:
        discount = promo["discount_value"]

    return {
        "success": True,
        "promo_type": promo["promo_type"],
        "discount_value": promo["discount_value"],
        "discount": discount,
        "name": promo["name"],
    }


@public_router.post("/{tc}/track-visit")
async def track_visit(tc: str, request: Request):
    channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1", tc)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    body = await request.json()
    user_identifier = body.get("user_identifier")
    if not user_identifier:
        raise HTTPException(status_code=400, detail="user_identifier обязателен")
    await execute(
        """INSERT INTO shop_visits (channel_id, user_identifier)
           VALUES ($1, $2)
           ON CONFLICT (channel_id, user_identifier) DO NOTHING""",
        channel["id"], user_identifier)
    return {"success": True}


