"""Блог сервиса:
- /api/blog/* — публичные эндпоинты (список/чтение статей, отметить просмотр/клик).
- /api/admin/blog/* — админские (CRUD категорий и статей).
- sitemap/robots — в main.py.
"""
import re
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..database import execute, execute_returning_id, fetch_all, fetch_one
from ..middleware.admin_auth import get_current_admin

public_router = APIRouter()
admin_router = APIRouter()


# ---------- helpers ----------

def _slugify(text: str) -> str:
    """Простая транслитерация ru→en + slug."""
    table = str.maketrans({
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    })
    s = (text or '').lower().translate(table)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:80] or secrets.token_hex(4)


def _visitor_id(request: Request) -> str:
    """Cookie blog_vid — UUID для уникальных просмотров. Создаётся если нет."""
    vid = request.cookies.get('blog_vid')
    if not vid:
        vid = secrets.token_hex(12)
    return vid


# ============================================================
# PUBLIC
# ============================================================

@public_router.get("/categories")
async def list_categories():
    """Список категорий с числом опубликованных статей."""
    rows = await fetch_all(
        """SELECT c.id, c.slug, c.name, c.description, c.sort_order,
                  COUNT(a.id) FILTER (WHERE a.status = 'published')::int AS article_count
           FROM blog_categories c
           LEFT JOIN blog_articles a ON a.category_id = c.id
           GROUP BY c.id, c.slug, c.name, c.description, c.sort_order
           ORDER BY c.sort_order, c.name"""
    )
    return {"success": True, "categories": [dict(r) for r in rows]}


@public_router.get("/articles")
async def list_articles(
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
):
    """Список опубликованных статей с пагинацией."""
    page = max(1, int(page or 1))
    limit = min(50, max(1, int(limit or 20)))
    offset = (page - 1) * limit

    where_parts = ["a.status = 'published'"]
    params: list = []
    idx = 1
    if category:
        params.append(category)
        where_parts.append(f"c.slug = ${idx}")
        idx += 1
    where_sql = " AND ".join(where_parts)

    total_row = await fetch_one(
        f"""SELECT COUNT(*)::int AS n FROM blog_articles a
            LEFT JOIN blog_categories c ON c.id = a.category_id
            WHERE {where_sql}""",
        *params,
    )
    total = total_row.get("n") if total_row else 0

    params.extend([limit, offset])
    rows = await fetch_all(
        f"""SELECT a.id, a.slug, a.title, a.excerpt, a.cover_image_url,
                   a.published_at, a.views_count,
                   c.slug AS category_slug, c.name AS category_name
            FROM blog_articles a
            LEFT JOIN blog_categories c ON c.id = a.category_id
            WHERE {where_sql}
            ORDER BY a.published_at DESC NULLS LAST
            LIMIT ${idx} OFFSET ${idx + 1}""",
        *params,
    )
    return {
        "success": True,
        "articles": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@public_router.get("/articles/{slug}")
async def get_article(slug: str, request: Request, response: Response):
    """Статья по slug. Регистрирует уникальный просмотр (по cookie/день)."""
    art = await fetch_one(
        """SELECT a.*, c.slug AS category_slug, c.name AS category_name
           FROM blog_articles a
           LEFT JOIN blog_categories c ON c.id = a.category_id
           WHERE a.slug = $1 AND a.status = 'published'""",
        slug,
    )
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    # Просмотры — UNIQUE (article_id, visitor_id, visited_on)
    vid = _visitor_id(request)
    response.set_cookie('blog_vid', vid, max_age=60 * 60 * 24 * 365, samesite='Lax')
    try:
        inserted = await execute_returning_id(
            """INSERT INTO blog_views (article_id, visitor_id, referrer, user_agent)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (article_id, visitor_id, visited_on) DO NOTHING
               RETURNING id""",
            int(art["id"]), vid,
            request.headers.get("referer") or "",
            request.headers.get("user-agent") or "",
        )
        if inserted:
            await execute("UPDATE blog_articles SET views_count = views_count + 1 WHERE id = $1", int(art["id"]))
    except Exception as e:
        print(f"[blog] view track failed: {e}")

    # Похожие статьи (ту же категорию, другие, до 4)
    related = []
    if art.get("category_id"):
        related_rows = await fetch_all(
            """SELECT slug, title, excerpt, cover_image_url
               FROM blog_articles
               WHERE category_id = $1 AND status = 'published' AND id != $2
               ORDER BY published_at DESC NULLS LAST LIMIT 4""",
            int(art["category_id"]), int(art["id"]),
        )
        related = [dict(r) for r in related_rows]

    out = dict(art)
    out["related"] = related
    return {"success": True, "article": out}


@public_router.post("/articles/{slug}/cta-click")
async def track_cta_click(slug: str, request: Request):
    """Юзер нажал CTA «Попробовать» в статье — пишем для статистики."""
    art = await fetch_one("SELECT id FROM blog_articles WHERE slug = $1", slug)
    if not art:
        return {"success": True}
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    target = body.get("target") or "/login"
    vid = _visitor_id(request)
    await execute(
        "INSERT INTO blog_cta_clicks (article_id, visitor_id, target) VALUES ($1, $2, $3)",
        int(art["id"]), vid, target,
    )
    await execute("UPDATE blog_articles SET clicks_count = clicks_count + 1 WHERE id = $1", int(art["id"]))
    return {"success": True}


# ============================================================
# ADMIN
# ============================================================

@admin_router.get("/categories")
async def admin_list_categories(admin: Dict = Depends(get_current_admin)):
    rows = await fetch_all(
        """SELECT c.*, COUNT(a.id)::int AS article_count
           FROM blog_categories c
           LEFT JOIN blog_articles a ON a.category_id = c.id
           GROUP BY c.id ORDER BY c.sort_order, c.name"""
    )
    return {"success": True, "categories": [dict(r) for r in rows]}


@admin_router.post("/categories")
async def admin_create_category(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название обязательно")
    slug = (body.get("slug") or _slugify(name)).strip()
    cid = await execute_returning_id(
        """INSERT INTO blog_categories (slug, name, description, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id""",
        slug, name, body.get("description") or "", int(body.get("sort_order") or 0),
    )
    return {"success": True, "id": cid}


@admin_router.put("/categories/{cid}")
async def admin_update_category(cid: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ("slug", "name", "description", "sort_order"):
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        return {"success": True}
    params.append(cid)
    await execute(f"UPDATE blog_categories SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@admin_router.delete("/categories/{cid}")
async def admin_delete_category(cid: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM blog_categories WHERE id = $1", cid)
    return {"success": True}


@admin_router.get("/articles")
async def admin_list_articles(
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    admin: Dict = Depends(get_current_admin),
):
    where_parts, params = [], []
    idx = 1
    if status:
        params.append(status)
        where_parts.append(f"a.status = ${idx}")
        idx += 1
    if category_id:
        params.append(int(category_id))
        where_parts.append(f"a.category_id = ${idx}")
        idx += 1
    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    rows = await fetch_all(
        f"""SELECT a.id, a.slug, a.title, a.excerpt, a.cover_image_url, a.status,
                   a.views_count, a.clicks_count, a.published_at, a.created_at,
                   c.slug AS category_slug, c.name AS category_name,
                   array_length(regexp_matches(a.body, '<img\\s', 'gi'), 1) AS img_count
            FROM blog_articles a
            LEFT JOIN blog_categories c ON c.id = a.category_id
            {where_sql}
            ORDER BY a.created_at DESC""",
        *params,
    )
    return {"success": True, "articles": [dict(r) for r in rows]}


@admin_router.get("/articles/{aid}")
async def admin_get_article(aid: int, admin: Dict = Depends(get_current_admin)):
    art = await fetch_one("SELECT * FROM blog_articles WHERE id = $1", aid)
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    return {"success": True, "article": dict(art)}


@admin_router.post("/articles")
async def admin_create_article(request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Заголовок обязателен")
    slug = (body.get("slug") or _slugify(title)).strip()
    # Если slug занят — добавим суффикс
    exists = await fetch_one("SELECT id FROM blog_articles WHERE slug = $1", slug)
    if exists:
        slug = f"{slug}-{secrets.token_hex(3)}"
    aid = await execute_returning_id(
        """INSERT INTO blog_articles
            (category_id, slug, title, excerpt, meta_title, meta_description,
             cover_image_url, body, tags, status, published_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id""",
        body.get("category_id") or None,
        slug,
        title,
        body.get("excerpt") or "",
        body.get("meta_title") or None,
        body.get("meta_description") or None,
        body.get("cover_image_url") or None,
        body.get("body") or "",
        body.get("tags") or [],
        body.get("status") or "draft",
        body.get("published_at") or None,
        admin.get("id"),
    )
    return {"success": True, "id": aid, "slug": slug}


@admin_router.put("/articles/{aid}")
async def admin_update_article(aid: int, request: Request, admin: Dict = Depends(get_current_admin)):
    body = await request.json()
    fields, params = [], []
    idx = 1
    allowed = (
        "category_id", "slug", "title", "excerpt", "meta_title", "meta_description",
        "cover_image_url", "body", "tags", "status", "published_at",
    )
    for key in allowed:
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if "status" in body and body["status"] == "published":
        # Если публикуем впервые — выставим published_at
        cur = await fetch_one("SELECT published_at FROM blog_articles WHERE id = $1", aid)
        if cur and not cur.get("published_at"):
            fields.append(f"published_at = ${idx}")
            from datetime import datetime as _dt
            params.append(_dt.utcnow())
            idx += 1
    if not fields:
        return {"success": True}
    fields.append("updated_at = NOW()")
    params.append(aid)
    await execute(f"UPDATE blog_articles SET {', '.join(fields)} WHERE id = ${idx}", *params)
    return {"success": True}


@admin_router.delete("/articles/{aid}")
async def admin_delete_article(aid: int, admin: Dict = Depends(get_current_admin)):
    await execute("DELETE FROM blog_articles WHERE id = $1", aid)
    return {"success": True}


@admin_router.get("/articles/{aid}/stats")
async def admin_article_stats(aid: int, admin: Dict = Depends(get_current_admin)):
    """Подробная статистика статьи: уник за 30 дней, клики, конверсия в регу."""
    art = await fetch_one("SELECT id, slug, views_count, clicks_count FROM blog_articles WHERE id = $1", aid)
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    by_day = await fetch_all(
        """SELECT visited_on::TEXT AS day, COUNT(DISTINCT visitor_id)::int AS uniques
           FROM blog_views WHERE article_id = $1
             AND visited_on > CURRENT_DATE - INTERVAL '30 days'
           GROUP BY visited_on ORDER BY visited_on""",
        aid,
    )
    total_uniques = await fetch_one(
        "SELECT COUNT(DISTINCT visitor_id)::int AS n FROM blog_views WHERE article_id = $1", aid,
    )
    cta_total = await fetch_one(
        "SELECT COUNT(*)::int AS n FROM blog_cta_clicks WHERE article_id = $1", aid,
    )
    # Регистрации с blog_referrer_slug = slug этой статьи
    regs = await fetch_one(
        "SELECT COUNT(*)::int AS n FROM users WHERE blog_referrer_slug = $1", art["slug"],
    )
    return {
        "success": True,
        "views_total": art["views_count"],
        "uniques_total": total_uniques.get("n") if total_uniques else 0,
        "cta_clicks": cta_total.get("n") if cta_total else 0,
        "registrations": regs.get("n") if regs else 0,
        "by_day": [{"day": r["day"], "uniques": int(r.get("uniques") or 0)} for r in by_day],
    }


@admin_router.get("/overview")
async def admin_blog_overview(admin: Dict = Depends(get_current_admin)):
    """Сводка по блогу для дашборда: всего статей/опубликовано/просмотров/конверсий."""
    stats = await fetch_one(
        """SELECT
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='published')::int AS published,
              COUNT(*) FILTER (WHERE status='draft')::int AS drafts,
              COALESCE(SUM(views_count), 0)::int AS views,
              COALESCE(SUM(clicks_count), 0)::int AS cta_clicks
           FROM blog_articles"""
    )
    regs = await fetch_one(
        "SELECT COUNT(*)::int AS n FROM users WHERE blog_referrer_slug IS NOT NULL"
    )
    return {
        "success": True,
        **(dict(stats) if stats else {}),
        "registrations_from_blog": regs.get("n") if regs else 0,
    }
