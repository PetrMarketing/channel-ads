"""AI генерация для обычных постов (раздел Контент).

Два эндпоинта:
- /ai-post/{tc}/generate-text — текст по промту (опц. файл, опц. в стиле канала)
- /ai-post/{tc}/generate-image — картинка по промту, сохранение в /uploads

Списания: динамическая цена через services.channel_levels.skill_cost.
Учёт: track_skill('text'/'image') + track_event('ai_text'/'ai_image').
"""
import os
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from ..config import settings
from ..database import execute, fetch_one, fetch_all
from ..middleware.auth import get_current_user
from ..services.ai_openrouter import openrouter_chat, openrouter_image_gen, save_image_result
from ..services.channel_levels import skill_cost, track_skill
from ..services.achievements import track_event

router = APIRouter()

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 МБ


async def _get_owned_channel(tc: str, user_id: int) -> Optional[Dict[str, Any]]:
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code = $1 AND user_id = $2",
        tc, user_id,
    )


async def _charge(user_id: int, amount: int, action: str, description: str) -> None:
    u = await fetch_one("SELECT ai_tokens FROM users WHERE id=$1", user_id)
    if not u or (u["ai_tokens"] or 0) < amount:
        raise HTTPException(
            status_code=402,
            detail=f"Недостаточно ИИ токенов. Нужно {amount}, у вас {u['ai_tokens'] if u else 0}",
        )
    await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id=$2", amount, user_id)
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user_id, amount, action, description,
    )


async def _refund(user_id: int, amount: int, reason: str) -> None:
    if amount <= 0:
        return
    await execute("UPDATE users SET ai_tokens = ai_tokens + $1 WHERE id=$2", amount, user_id)
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user_id, -amount, "ai_post_refund", reason,
    )


def _decode_text_file(filename: str, raw: bytes) -> str:
    """Достаём текст из файла. Поддерживаем txt/md/csv/json — всё остальное
    пропускаем (только метаданные в промте)."""
    name = (filename or "").lower()
    text_exts = (".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".xml", ".log")
    if any(name.endswith(ext) for ext in text_exts):
        try:
            return raw.decode("utf-8", errors="ignore")[:8000]
        except Exception:
            return ""
    # Бинарные файлы (pdf, docx, …) — без парсинга, только название
    return ""


@router.post("/{tc}/generate-text")
async def generate_post_text(
    tc: str,
    prompt: str = Form(...),
    description: str = Form(""),
    use_channel_style: str = Form("false"),
    file: Optional[UploadFile] = File(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Сгенерировать текст поста по промту. Опц. файл-контекст (до 20 МБ),
    опц. описание, опц. в стиле канала (берёт последние 20 опубликованных постов).
    """
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Промт обязателен")

    # Файл-контекст
    file_block = ""
    if file is not None and file.filename:
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="Файл слишком большой (макс 20 МБ)")
        text_from_file = _decode_text_file(file.filename, raw)
        if text_from_file:
            file_block = f"\n\nКонтекст из файла «{file.filename}»:\n```\n{text_from_file}\n```"
        else:
            file_block = f"\n\nПрикреплён файл «{file.filename}» ({len(raw) // 1024} КБ) — используй его как референс."

    # Стиль канала: подтягиваем последние посты
    use_style = str(use_channel_style).lower() in ("true", "1", "on", "yes")
    style_block = ""
    if use_style:
        recent = await fetch_all(
            """SELECT message_text FROM content_posts
               WHERE channel_id = $1 AND status = 'published'
                 AND message_text IS NOT NULL AND message_text <> ''
               ORDER BY published_at DESC NULLS LAST, created_at DESC
               LIMIT 20""",
            channel["id"],
        )
        samples = [r["message_text"] for r in recent if r and r.get("message_text")]
        if samples:
            joined = "\n\n---\n\n".join(s[:600] for s in samples[:10])
            style_block = (
                f"\n\nСТИЛЬ КАНАЛА (анализируй и подражай — лексика, длина "
                f"абзацев, эмодзи, способ обращения, тон):\n{joined}"
            )

    desc_block = f"\n\nДополнительные пожелания: {description.strip()}" if description and description.strip() else ""

    full_prompt = (
        "Ты — копирайтер канала в мессенджере MAX/Telegram. Напиши пост строго на русском "
        "языке, готовый к публикации. Без вступительных фраз вроде «Вот пост:» — "
        "сразу содержимое поста.\n\n"
        f"Запрос: {prompt}{desc_block}{file_block}{style_block}\n\n"
        "Формат ответа: только текст поста (можно разметка HTML тегами <b>, <i>, <a>). "
        "Без обёрток, без комментариев, без пояснений."
    )

    cost = await skill_cost(channel["id"], "text")
    await _charge(user["id"], cost, "ai_post_text", f"Генерация текста поста для «{channel.get('title', tc)}»")

    try:
        text = await openrouter_chat(full_prompt, model="anthropic/claude-sonnet-4")
    except Exception as e:
        await _refund(user["id"], cost, f"Ошибка генерации текста поста: {e}")
        raise HTTPException(status_code=500, detail=f"Не удалось сгенерировать: {e}")

    text = (text or "").strip()
    if not text:
        await _refund(user["id"], cost, "Пустой ответ модели на генерацию текста поста")
        raise HTTPException(status_code=500, detail="ИИ вернул пустой текст")

    # Чистим возможные ```html обёртки
    if text.startswith("```html"):
        text = text[7:].strip()
    elif text.startswith("```"):
        text = text[3:].strip()
    if text.endswith("```"):
        text = text[:-3].strip()

    try:
        await track_skill(channel["id"], "text", 1)
    except Exception as e:
        print(f"[Levels] track text (post) skip: {e}")
    try:
        await track_event(int(channel["id"]), "ai_text", 1)
    except Exception as e:
        print(f"[Achievements] track ai_text (post) skip: {e}")

    # Сохраняем в "Мои файлы → Генерации текста"
    try:
        import json as _json
        meta = {
            "has_file": bool(file is not None and file.filename),
            "file_name": file.filename if file is not None else None,
            "use_channel_style": use_style,
            "has_description": bool(description and description.strip()),
        }
        await execute(
            """INSERT INTO ai_generations (user_id, channel_id, kind, prompt, result_text, tokens_charged, metadata)
               VALUES ($1, $2, 'text', $3, $4, $5, $6::jsonb)""",
            user["id"], channel["id"], prompt, text, cost, _json.dumps(meta, ensure_ascii=False),
        )
    except Exception as e:
        print(f"[ai-post] save generation history (text) failed: {e}")

    return {"success": True, "message_text": text, "tokens_charged": cost}


@router.post("/{tc}/generate-image")
async def generate_post_image(
    tc: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Сгенерировать картинку для поста. Опционально до 4 референс-фото
    (multipart, поле `refs` повторяется). Возвращает URL в /uploads.

    Принимаем поля вручную из form() — FastAPI 422 на Optional[List[UploadFile]]
    при пустом значении бывает капризен."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    form = await request.form()
    prompt = (form.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Промт обязателен")

    image_format = (form.get("format") or "1:1").strip()
    if image_format not in ("1:1", "4:3", "3:4"):
        image_format = "1:1"

    # Читаем референс-фото в base64 (макс 4) — поле может повторяться
    import base64 as _b64
    ref_b64_list: list = []
    refs = form.getlist("refs")
    print(f"[ai-post] generate-image tc={tc} prompt_len={len(prompt)} format={image_format} refs={len(refs)}")
    for rf in refs[:4]:
        if not hasattr(rf, "filename") or not rf.filename:
            continue
        data = await rf.read()
        if not data:
            continue
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Файл «{rf.filename}» больше 10 МБ")
        ref_b64_list.append(_b64.b64encode(data).decode("ascii"))

    fmt_hint = {
        "1:1": "Square 1:1 aspect ratio composition.",
        "4:3": "Landscape 4:3 aspect ratio composition.",
        "3:4": "Portrait 3:4 aspect ratio composition.",
    }[image_format]

    refs_hint = ""
    if ref_b64_list:
        refs_hint = (
            f"\n\nUse the {len(ref_b64_list)} reference image(s) above as visual anchor: "
            f"match the style, mood, lighting, color palette and composition. "
            f"Combine elements from them where it makes sense."
        )

    enhanced = (
        f"{prompt}\n\n{fmt_hint}{refs_hint}\n\n"
        "Photographic realism is mandatory: natural lighting, sharp focus, "
        "real-world environment, hyperrealistic 8k. NO cartoon, NO 3D render, "
        "NO illustration unless explicitly requested.\n\n"
        "Text on image: prefer NO text. If essential — render ONLY Russian "
        "(Cyrillic) characters with accurate typography. No Latin letters, "
        "no gibberish."
    )

    cost = await skill_cost(channel["id"], "image")
    await _charge(user["id"], cost, "ai_post_image", f"Генерация изображения для поста «{channel.get('title', tc)}»")

    try:
        image_result = await openrouter_image_gen(enhanced, ref_b64_list or None)
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        out_name = f"ai_post_img_{secrets.token_hex(10)}.png"
        out_path = os.path.join(settings.UPLOAD_DIR, out_name)
        await save_image_result(image_result, out_path)
    except HTTPException:
        await _refund(user["id"], cost, "Ошибка генерации изображения для поста")
        raise
    except Exception as e:
        await _refund(user["id"], cost, f"Ошибка генерации изображения для поста: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка генерации изображения: {e}")

    image_url = f"/uploads/{out_name}"

    try:
        await track_skill(channel["id"], "image", 1)
    except Exception as e:
        print(f"[Levels] track image (post) skip: {e}")
    try:
        await track_event(int(channel["id"]), "ai_image", 1)
    except Exception as e:
        print(f"[Achievements] track ai_image (post) skip: {e}")

    # Сохраняем в "Мои файлы → Генерации фото"
    try:
        import json as _json
        meta = {
            "format": image_format,
            "refs_count": len(ref_b64_list),
        }
        await execute(
            """INSERT INTO ai_generations (user_id, channel_id, kind, prompt, result_file_path, tokens_charged, metadata)
               VALUES ($1, $2, 'image', $3, $4, $5, $6::jsonb)""",
            user["id"], channel["id"], prompt, image_url, cost, _json.dumps(meta, ensure_ascii=False),
        )
    except Exception as e:
        print(f"[ai-post] save generation history (image) failed: {e}")

    return {
        "success": True,
        "image_url": image_url,
        "tokens_charged": cost,
        "format": image_format,
    }
