"""Comments: post comments management and public miniapp API."""
import json
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from ..middleware.auth import get_current_user
from ..database import fetch_one, fetch_all, execute, execute_returning_id

router = APIRouter()
public_router = APIRouter()


async def _get_channel(tc, uid):
    from ..middleware.auth import get_channel_for_user
    return await get_channel_for_user(tc, uid, "comments")


# ══════════════ Protected (dashboard) ══════════════

@router.get("/{tc}")
async def list_comments(tc: str, post_type: str = Query(None), post_id: int = Query(None),
                        user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    query = """SELECT pc.*,
               CASE WHEN pc.post_type = 'content' THEN (SELECT title FROM content_posts WHERE id = pc.post_id)
                    WHEN pc.post_type = 'pin' THEN (SELECT title FROM pin_posts WHERE id = pc.post_id)
                    ELSE NULL END as post_title
               FROM post_comments pc WHERE pc.channel_id = $1"""
    params = [ch["id"]]
    idx = 2
    if post_type:
        query += f" AND pc.post_type = ${idx}"
        params.append(post_type)
        idx += 1
    if post_id:
        query += f" AND pc.post_id = ${idx}"
        params.append(post_id)
        idx += 1
    query += " ORDER BY pc.created_at DESC LIMIT 200"
    comments = await fetch_all(query, *params)
    return {"success": True, "comments": comments}


@router.delete("/{tc}/{comment_id}")
async def delete_comment(tc: str, comment_id: int, user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    await execute("DELETE FROM post_comments WHERE id = $1 AND channel_id = $2", comment_id, ch["id"])
    return {"success": True}


@router.post("/{tc}/{comment_id}/reply")
async def reply_comment(tc: str, comment_id: int, request: Request, user=Depends(get_current_user)):
    """Reply to a comment from dashboard (as channel owner)."""
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    parent = await fetch_one("SELECT * FROM post_comments WHERE id = $1 AND channel_id = $2", comment_id, ch["id"])
    if not parent:
        raise HTTPException(404, "Комментарий не найден")
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(400, "Текст ответа обязателен")
    reply_name = user.get("first_name") or user.get("username") or "Автор"
    rid = await execute_returning_id(
        """INSERT INTO post_comments (channel_id, post_type, post_id, user_name, comment_text, parent_id, reply_to_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id""",
        ch["id"], parent["post_type"], parent["post_id"],
        reply_name, text, comment_id, parent.get("user_name", ""),
    )
    return {"success": True, "id": rid}


@router.get("/{tc}/settings")
async def get_comment_settings(tc: str, user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    import json
    raw = ch.get("comment_settings") or {}
    if isinstance(raw, str):
        try: raw = json.loads(raw)
        except: raw = {}
    if isinstance(raw, dict):
        raw = {k: v for k, v in raw.items() if not k.isdigit()}
    return {"success": True, "settings": raw}


@router.put("/{tc}/settings")
async def update_comment_settings(tc: str, request: Request, user=Depends(get_current_user)):
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    import json
    body = await request.json()
    await execute("UPDATE channels SET comment_settings = $1::jsonb WHERE id = $2",
                  json.dumps(body, ensure_ascii=False), ch["id"])
    return {"success": True}


@router.post("/{tc}/settings/upload-bg")
async def upload_comment_bg(tc: str, request: Request, user=Depends(get_current_user)):
    """Upload background image for comments appearance."""
    from fastapi import UploadFile, File
    ch = await _get_channel(tc, user["id"])
    if not ch:
        raise HTTPException(404, "Канал не найден")
    form = await request.form()
    file = form.get("file")
    bg_target = form.get("target", "header")  # "header" or "page"
    if not file or not hasattr(file, "read"):
        raise HTTPException(400, "Файл не загружен")
    from ..services.file_storage import save_upload
    file_path, file_type, _ = await save_upload(file, photo_only=True)
    from ..config import settings as app_settings
    rel = file_path.replace(app_settings.UPLOAD_DIR, "").lstrip("/")
    url = f"{app_settings.APP_URL}/uploads/{rel}"

    # Update settings in DB
    import json
    current = ch.get("comment_settings") or {}
    if isinstance(current, str):
        try: current = json.loads(current)
        except: current = {}
    if bg_target == "page":
        current["page_bg_image_url"] = url
    else:
        current["bg_image_url"] = url
    await execute("UPDATE channels SET comment_settings = $1::jsonb WHERE id = $2",
                  json.dumps(current, ensure_ascii=False), ch["id"])
    return {"success": True, "url": url}


# ══════════════ Public (miniapp) ══════════════

@public_router.get("/{post_type}/{post_id}")
async def public_get_comments(post_type: str, post_id: int):
    """Get comments for a post + channel appearance settings."""
    # Find channel via post
    if post_type == "content":
        post = await fetch_one("SELECT id, title, channel_id FROM content_posts WHERE id = $1", post_id)
    elif post_type == "pin":
        post = await fetch_one("SELECT id, title, channel_id FROM pin_posts WHERE id = $1", post_id)
    else:
        raise HTTPException(400, "Неизвестный тип поста")
    if not post:
        raise HTTPException(404, "Пост не найден")
    ch = await fetch_one("SELECT title, comment_settings FROM channels WHERE id = $1", post["channel_id"])
    comments = await fetch_all(
        "SELECT id, user_name, user_avatar, max_user_id, comment_text, parent_id, reply_to_name, created_at FROM post_comments WHERE post_type = $1 AND post_id = $2 ORDER BY created_at",
        post_type, post_id)
    return {
        "success": True,
        "post_title": post.get("title", ""),
        "channel_title": ch.get("title", "") if ch else "",
        "settings": (lambda s: json.loads(s) if isinstance(s, str) else s)(ch.get("comment_settings") or {}) if ch else {},
        "comments": comments,
    }


@public_router.post("/{post_type}/{post_id}")
async def public_add_comment(post_type: str, post_id: int, request: Request):
    """Add a comment from miniapp user."""
    body = await request.json()
    user_name = body.get("user_name", "").strip()
    max_user_id = body.get("max_user_id", "")
    user_avatar = body.get("user_avatar", "")
    text = body.get("comment_text", "").strip()
    if not text:
        raise HTTPException(400, "Введите текст комментария")
    if not user_name:
        user_name = "Аноним"
    # Find channel_id from post
    if post_type == "content":
        post = await fetch_one("SELECT channel_id FROM content_posts WHERE id = $1", post_id)
    elif post_type == "pin":
        post = await fetch_one("SELECT channel_id FROM pin_posts WHERE id = $1", post_id)
    else:
        raise HTTPException(400, "Неизвестный тип поста")
    if not post:
        raise HTTPException(404, "Пост не найден")
    parent_id = body.get("parent_id")
    reply_to_name = ""
    if parent_id:
        parent = await fetch_one("SELECT user_name FROM post_comments WHERE id = $1", int(parent_id))
        reply_to_name = parent.get("user_name", "") if parent else ""

    cid = await execute_returning_id(
        """INSERT INTO post_comments (channel_id, post_type, post_id, max_user_id, user_name, user_avatar, comment_text, parent_id, reply_to_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        post["channel_id"], post_type, post_id,
        str(max_user_id) if max_user_id else None, user_name, user_avatar or None, text,
        int(parent_id) if parent_id else None, reply_to_name or None,
    )

    # Notify channel owner if enabled
    try:
        ch = await fetch_one("SELECT user_id, title, comment_settings FROM channels WHERE id = $1", post["channel_id"])
        if ch:
            settings = ch.get("comment_settings") or {}
            if isinstance(settings, str):
                settings = json.loads(settings)
            if settings.get("notify_comments"):
                owner = await fetch_one("SELECT max_user_id FROM users WHERE id = $1", ch["user_id"])
                if owner and owner.get("max_user_id"):
                    from ..services.max_api import get_max_api
                    from ..routes.max_webhook import _send_to_user_by_id
                    max_api = get_max_api()
                    if max_api:
                        reply_info = f"\nОтвет на: {reply_to_name}" if reply_to_name else ""
                        await _send_to_user_by_id(max_api, owner["max_user_id"],
                            f"💬 Новый комментарий в канале «{ch.get('title', '')}»\n\n"
                            f"От: **{user_name}**{reply_info}\n"
                            f"Комментарий: {text[:200]}")
    except Exception as e:
        print(f"[Comments] Notify error: {e}")

    return {"success": True, "id": cid}
