"""AI Design — generate avatar grid + descriptions, apply to MAX channel."""
import os
import base64
import json as json_mod
import secrets
import aiohttp
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File
from PIL import Image

from ..config import settings
from ..database import fetch_one, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.max_api import get_max_api

router = APIRouter()

SESSION_COST = 150  # AI tokens per session

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
TEXT_MODEL = "openai/gpt-5.4-nano"


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code=$1 AND user_id=$2 AND is_active=1", tc, user_id
    )


async def _openrouter_chat(prompt: str, model: str = None) -> str:
    model = model or TEXT_MODEL
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
            result = await resp.json()
    return result.get("choices", [{}])[0].get("message", {}).get("content", "")


async def _openrouter_image_gen(prompt: str, photo_base64: str = None) -> str:
    """Generate image via OpenRouter chat completions with an image-capable model.
    Returns data URL (data:image/png;base64,...) or http URL."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    messages_content = []
    if photo_base64:
        messages_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{photo_base64}"}
        })
    messages_content.append({"type": "text", "text": prompt})

    payload = {
        "model": IMAGE_MODEL,
        "messages": [{"role": "user", "content": messages_content}],
        "modalities": ["image", "text"],
    }
    timeout = aiohttp.ClientTimeout(total=180)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
            result = await resp.json()

    if result.get("error"):
        print(f"[AI Design] API error: {result['error']}")
        raise HTTPException(status_code=500, detail=f"OpenRouter error: {result['error']}")

    message = result.get("choices", [{}])[0].get("message", {})

    # OpenRouter returns images in message.images[] field
    images = message.get("images", [])
    if images:
        url = images[0].get("image_url", {}).get("url", "")
        if url:
            print(f"[AI Design] Got image from 'images' field, len={len(url)}")
            return url

    # Fallback: check content for image parts
    content = message.get("content")
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                url = part.get("image_url", {}).get("url", "")
                if url:
                    return url
    elif isinstance(content, str) and len(content) > 200:
        return content

    print(f"[AI Design] No image in response. Message keys: {list(message.keys())}")
    raise HTTPException(status_code=500, detail="Модель не вернула изображение. Попробуйте ещё раз.")


# ---- List sessions for channel ----

@router.get("/{tc}/sessions")
async def list_sessions(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    rows = await fetch_all(
        """SELECT id, status, niche, style, created_at,
                  chosen_avatar_url, chosen_description,
                  generated_grid_url, generated_descriptions
           FROM ai_design_sessions
           WHERE user_id=$1 AND channel_id=$2
           ORDER BY created_at DESC LIMIT 20""",
        user["id"], channel["id"]
    )

    sessions = []
    for r in rows:
        avatars = r.get("generated_grid_url", "[]")
        if isinstance(avatars, str):
            try:
                avatars = json_mod.loads(avatars)
            except Exception:
                avatars = []
        descriptions = r.get("generated_descriptions", "[]")
        if isinstance(descriptions, str):
            try:
                descriptions = json_mod.loads(descriptions)
            except Exception:
                descriptions = []
        sessions.append({
            "id": r["id"],
            "status": r["status"],
            "niche": r.get("niche"),
            "style": r.get("style"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            "chosen_avatar_url": r.get("chosen_avatar_url"),
            "chosen_description": r.get("chosen_description"),
            "avatars": avatars,
            "descriptions": descriptions,
        })

    return {"success": True, "sessions": sessions}


# ---- Create session (deduct tokens) ----

@router.post("/{tc}/session")
async def create_session(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    u = await fetch_one("SELECT ai_tokens FROM users WHERE id=$1", user["id"])
    if not u or (u["ai_tokens"] or 0) < SESSION_COST:
        raise HTTPException(status_code=402, detail=f"Недостаточно ИИ токенов. Нужно {SESSION_COST}, у вас {u['ai_tokens'] if u else 0}")

    await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id=$2", SESSION_COST, user["id"])

    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user["id"], SESSION_COST, "ai_design", f"Сессия оформления канала {channel['title']}"
    )

    session_id = await execute_returning_id(
        """INSERT INTO ai_design_sessions (user_id, channel_id, tokens_spent)
           VALUES ($1, $2, $3) RETURNING id""",
        user["id"], channel["id"], SESSION_COST
    )

    return {"success": True, "session_id": session_id, "tokens_spent": SESSION_COST}


# ---- Save survey data ----

@router.put("/{tc}/session/{session_id}/survey")
async def save_survey(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    await execute(
        """UPDATE ai_design_sessions
           SET niche=$1, colors=$2, style=$3, contact_link=$4, description=$5, status='generating', updated_at=NOW()
           WHERE id=$6""",
        body.get("niche", ""),
        json_mod.dumps(body.get("colors", [])),
        body.get("style", ""),
        body.get("contact_link", ""),
        body.get("description", ""),
        session_id,
    )

    return {"success": True}


# ---- Upload photo for session ----

@router.post("/{tc}/session/{session_id}/photo")
async def upload_photo(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2",
        session_id, user["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 10 МБ)")

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"ai_design_{secrets.token_hex(8)}{ext}"
    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)
    path = os.path.join(upload_dir, filename)
    with open(path, "wb") as f:
        f.write(content)

    await execute(
        "UPDATE ai_design_sessions SET photo_path=$1, updated_at=NOW() WHERE id=$2",
        path, session_id
    )

    return {"success": True, "photo_url": f"/uploads/{filename}"}


# ---- Generate avatar grid ----

@router.post("/{tc}/session/{session_id}/generate-avatars")
async def generate_avatars(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    niche = session["niche"] or ""
    style = session["style"] or "минимализм"
    colors = session.get("colors") or []
    if isinstance(colors, str):
        colors = json_mod.loads(colors)

    color_str = f" Используй цвета: {', '.join(colors)}." if colors else ""

    photo_base64 = None
    photo_instruction = ""
    if session.get("photo_path") and os.path.exists(session["photo_path"]):
        with open(session["photo_path"], "rb") as f:
            photo_base64 = base64.b64encode(f.read()).decode()
        photo_instruction = " Используй приложенное фото как основу."

    prompt = (
        f"Создай ровную сетку 3x3 из 9 квадратных аватарок для канала в тематике «{niche}» "
        f"в {style} стиле.{color_str}{photo_instruction} "
        f"Важно: между аватарками не должно быть отступов, рамок или промежутков. "
        f"Каждая аватарка занимает ровно 1/3 ширины и 1/3 высоты изображения. "
        f"Все элементы на каждой аватарке должны быть отцентрованы."
    )

    image_result = await _openrouter_image_gen(prompt, photo_base64)

    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)

    grid_filename = f"ai_grid_{secrets.token_hex(8)}.png"
    grid_path = os.path.join(upload_dir, grid_filename)

    if image_result.startswith("data:"):
        # data:image/png;base64,iVBOR...
        b64_data = image_result.split("base64,", 1)[1]
        img_bytes = base64.b64decode(b64_data)
        with open(grid_path, "wb") as f:
            f.write(img_bytes)
    elif image_result.startswith("http"):
        async with aiohttp.ClientSession() as s:
            async with s.get(image_result) as resp:
                img_bytes = await resp.read()
        with open(grid_path, "wb") as f:
            f.write(img_bytes)
    elif len(image_result) > 200:
        img_bytes = base64.b64decode(image_result)
        with open(grid_path, "wb") as f:
            f.write(img_bytes)
    else:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать изображение")

    # Split into 9 parts
    avatar_urls = []
    try:
        img = Image.open(grid_path)
        w, h = img.size
        cell_w, cell_h = w // 3, h // 3
        for row in range(3):
            for col in range(3):
                box = (col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h)
                cell = img.crop(box)
                cell_name = f"ai_avatar_{secrets.token_hex(6)}_{row}_{col}.png"
                cell_path = os.path.join(upload_dir, cell_name)
                cell.save(cell_path, "PNG")
                avatar_urls.append(f"/uploads/{cell_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка разрезки: {str(e)}")

    await execute(
        """UPDATE ai_design_sessions
           SET generated_grid_url=$1, status='choose_avatar', updated_at=NOW()
           WHERE id=$2""",
        json_mod.dumps(avatar_urls), session_id
    )

    return {"success": True, "grid_url": f"/uploads/{grid_filename}", "avatars": avatar_urls}


# ---- Generate descriptions ----

@router.post("/{tc}/session/{session_id}/generate-descriptions")
async def generate_descriptions(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    niche = session["niche"] or ""
    contact = session["contact_link"] or ""

    prompt = (
        f"Придумай 3 разных описания для канала в тематике «{niche}», "
        f"каждое до 400 символов. Обязательно укажи призыв подписаться и "
        f"канал для связи: {contact}\n\n"
        f"Ответь строго в формате JSON: [\"описание1\", \"описание2\", \"описание3\"]"
    )

    content = await _openrouter_chat(prompt)

    descriptions = []
    try:
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            descriptions = json_mod.loads(content[start:end])
    except Exception:
        descriptions = [d.strip() for d in content.split("\n\n") if d.strip()][:3]

    if not descriptions:
        descriptions = [content[:400]]

    await execute(
        """UPDATE ai_design_sessions
           SET generated_descriptions=$1, status='choose_description', updated_at=NOW()
           WHERE id=$2""",
        json_mod.dumps(descriptions, ensure_ascii=False), session_id
    )

    return {"success": True, "descriptions": descriptions}


# ---- Choose avatar ----

@router.post("/{tc}/session/{session_id}/choose-avatar")
async def choose_avatar(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    avatars = session.get("generated_grid_url", "[]")
    if isinstance(avatars, str):
        avatars = json_mod.loads(avatars)

    if index < 0 or index >= len(avatars):
        raise HTTPException(status_code=400, detail="Неверный индекс аватарки")

    await execute(
        "UPDATE ai_design_sessions SET chosen_avatar_index=$1, chosen_avatar_url=$2, updated_at=NOW() WHERE id=$3",
        index, avatars[index], session_id
    )

    return {"success": True, "chosen_avatar": avatars[index]}


# ---- Choose description ----

@router.post("/{tc}/session/{session_id}/choose-description")
async def choose_description(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    descriptions = session.get("generated_descriptions", "[]")
    if isinstance(descriptions, str):
        descriptions = json_mod.loads(descriptions)

    if index < 0 or index >= len(descriptions):
        raise HTTPException(status_code=400, detail="Неверный индекс описания")

    await execute(
        "UPDATE ai_design_sessions SET chosen_description_index=$1, chosen_description=$2, updated_at=NOW() WHERE id=$3",
        index, descriptions[index], session_id
    )

    return {"success": True, "chosen_description": descriptions[index]}


# ---- Apply to channel via MAX Bot API ----

@router.post("/{tc}/session/{session_id}/apply")
async def apply_to_channel(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    if not session.get("chosen_avatar_url") or not session.get("chosen_description"):
        raise HTTPException(status_code=400, detail="Сначала выберите аватарку и описание")

    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=500, detail="MAX API не настроен")

    # Determine chat_id: prefer max_chat_id, fallback to channel_id
    chat_id = channel.get("max_chat_id") or str(channel["channel_id"])

    errors = []

    # 1. Upload avatar to MAX and set as channel icon via PATCH /chats/{chatId}
    try:
        avatar_url = session["chosen_avatar_url"]
        avatar_filename = avatar_url.split("/")[-1]
        avatar_path = os.path.join(settings.UPLOAD_DIR, avatar_filename)

        if os.path.exists(avatar_path):
            # Upload image to MAX
            upload_result = await max_api.upload_file(avatar_path, "photo")
            if upload_result.get("success"):
                # Get the photo token/url from upload
                upload_data = upload_result.get("data", {})
                photo_token = upload_data.get("token")
                photo_url_remote = upload_data.get("url")

                # PATCH /chats/{chatId} with icon
                icon_payload = {}
                if photo_token:
                    icon_payload = {"token": photo_token}
                elif photo_url_remote:
                    icon_payload = {"url": photo_url_remote}
                else:
                    # Use public URL as fallback
                    icon_payload = {"url": f"{settings.APP_URL}{avatar_url}"}

                patch_result = await max_api._request(
                    "PATCH", f"chats/{chat_id}",
                    json={"icon": icon_payload}
                )
                if not patch_result.get("success"):
                    errors.append(f"Аватар: {patch_result.get('error', 'ошибка')}")
            else:
                errors.append(f"Загрузка аватара: {upload_result.get('error', 'ошибка')}")
        else:
            errors.append("Аватар: файл не найден")
    except Exception as e:
        errors.append(f"Аватар: {str(e)}")

    # 2. Description — MAX PATCH /chats/{chatId} doesn't support description field,
    #    so we save it and show to user for manual copy
    #    (Description is stored in chosen_description)

    # Update session status
    status = "applied" if not errors else "partial"
    await execute(
        "UPDATE ai_design_sessions SET status=$1, updated_at=NOW() WHERE id=$2",
        status, session_id
    )

    # Update channel avatar_url in DB
    if not any("Аватар" in e for e in errors):
        avatar_public = f"{settings.APP_URL}{session['chosen_avatar_url']}"
        await execute(
            "UPDATE channels SET avatar_url=$1 WHERE id=$2",
            avatar_public, channel["id"]
        )

    if errors:
        return {"success": True, "status": "partial", "errors": errors,
                "description_note": "Описание нужно установить вручную в настройках канала"}

    return {"success": True, "status": "applied",
            "description_note": "Описание нужно установить вручную в настройках канала"}


# ---- Lead Magnet: upload PDF reference ----

@router.post("/{tc}/session/{session_id}/lm-pdf")
async def upload_lm_pdf(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await fetch_one(
        "SELECT id FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 20 МБ)")

    ext = os.path.splitext(file.filename or "doc.pdf")[1] or ".pdf"
    filename = f"ai_lm_ref_{secrets.token_hex(8)}{ext}"
    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)
    path = os.path.join(upload_dir, filename)
    with open(path, "wb") as f:
        f.write(content)

    await execute(
        "UPDATE ai_design_sessions SET lm_pdf_path=$1, updated_at=NOW() WHERE id=$2",
        path, session_id
    )
    return {"success": True, "pdf_url": f"/uploads/{filename}"}


# ---- Lead Magnet: generate 3 ideas ----

@router.post("/{tc}/session/{session_id}/generate-lm-ideas")
async def generate_lm_ideas(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    wishes = body.get("wishes", "")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    # Save wishes
    await execute(
        "UPDATE ai_design_sessions SET lm_wishes=$1, updated_at=NOW() WHERE id=$2",
        wishes, session_id
    )

    niche = session.get("niche") or ""

    # If PDF was uploaded, extract some text for context
    pdf_context = ""
    pdf_path = session.get("lm_pdf_path")
    if pdf_path and os.path.exists(pdf_path):
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)
            text_parts = []
            for page in doc[:5]:  # first 5 pages
                text_parts.append(page.get_text()[:500])
            pdf_context = "\n".join(text_parts)[:2000]
            doc.close()
        except Exception:
            pass

    pdf_note = f"\n\nВот текст из контента пользователя для вдохновения:\n{pdf_context}" if pdf_context else ""
    wish_note = f"\nПожелания пользователя: {wishes}" if wishes else ""

    prompt = (
        f"Придумай 3 разных варианта лид-магнита (бесплатного подарка за подписку) "
        f"для канала в тематике «{niche}».{wish_note}{pdf_note}\n\n"
        f"Каждый вариант — краткое название и описание в 1-2 предложениях.\n"
        f"Ответь строго в формате JSON: "
        f'[{{"title": "Название", "description": "Описание"}}, ...]'
    )

    content = await _openrouter_chat(prompt)

    ideas = []
    try:
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            ideas = json_mod.loads(content[start:end])
    except Exception:
        pass

    if not ideas:
        ideas = [{"title": "Подарок", "description": content[:200]}]

    await execute(
        "UPDATE ai_design_sessions SET lm_ideas=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(ideas, ensure_ascii=False), session_id
    )

    return {"success": True, "ideas": ideas}


# ---- Lead Magnet: choose idea ----

@router.post("/{tc}/session/{session_id}/choose-lm-idea")
async def choose_lm_idea(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    ideas = session.get("lm_ideas", "[]")
    if isinstance(ideas, str):
        ideas = json_mod.loads(ideas)

    if index < 0 or index >= len(ideas):
        raise HTTPException(status_code=400, detail="Неверный индекс")

    chosen = ideas[index]
    await execute(
        "UPDATE ai_design_sessions SET lm_chosen_idea_index=$1, lm_chosen_idea=$2, updated_at=NOW() WHERE id=$3",
        index, json_mod.dumps(chosen, ensure_ascii=False), session_id
    )

    return {"success": True, "chosen_idea": chosen}


# ---- Lead Magnet: generate content + banner ----

@router.post("/{tc}/session/{session_id}/generate-lm-content")
async def generate_lm_content(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    chosen_idea = session.get("lm_chosen_idea", "{}")
    if isinstance(chosen_idea, str):
        chosen_idea = json_mod.loads(chosen_idea)

    niche = session.get("niche") or ""
    style = session.get("style") or "минимализм"
    colors = session.get("colors") or []
    if isinstance(colors, str):
        colors = json_mod.loads(colors)
    color_str = f"Цветовая гамма: {', '.join(colors)}." if colors else ""
    contact = session.get("contact_link") or ""

    idea_title = chosen_idea.get("title", "Подарок")
    idea_desc = chosen_idea.get("description", "")

    # 1. Generate lead magnet text content
    lm_prompt = (
        f"Напиши текст лид-магнита для канала в тематике «{niche}».\n"
        f"Тема лид-магнита: {idea_title} — {idea_desc}\n"
        f"Текст должен быть полезным, структурированным, до 2000 символов.\n"
        f"В конце укажи призыв подписаться на канал и ссылку для связи: {contact}"
    )
    lm_content = await _openrouter_chat(lm_prompt)

    # 2. Generate post text for pinned post
    post_prompt = (
        f"Напиши короткий пост-закреп для канала в тематике «{niche}».\n"
        f"Пост рекламирует бесплатный подарок за подписку: «{idea_title}».\n"
        f"Должен быть цепляющий, до 500 символов, с призывом получить подарок."
    )
    post_text = await _openrouter_chat(post_prompt)

    # 3. Generate banner image (16:9)
    photo_base64 = None
    photo_instruction = ""
    if session.get("photo_path") and os.path.exists(session["photo_path"]):
        with open(session["photo_path"], "rb") as f:
            photo_base64 = base64.b64encode(f.read()).decode()
        photo_instruction = " Используй приложенное фото человека на баннере."

    banner_prompt = (
        f"Сделай дизайнерский баннер размером 16:9. "
        f"Тема: {idea_title}. "
        f"На баннере только текст «{idea_title}» и тематические иллюстрации для тематики «{niche}». "
        f"{color_str} Стилистика: {style}.{photo_instruction}"
    )

    banner_url = None
    try:
        image_result = await _openrouter_image_gen(banner_prompt, photo_base64)

        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        banner_filename = f"ai_banner_{secrets.token_hex(8)}.png"
        banner_path = os.path.join(upload_dir, banner_filename)

        if image_result.startswith("data:"):
            b64_data = image_result.split("base64,", 1)[1]
            with open(banner_path, "wb") as f:
                f.write(base64.b64decode(b64_data))
        elif image_result.startswith("http"):
            async with aiohttp.ClientSession() as s:
                async with s.get(image_result) as resp:
                    with open(banner_path, "wb") as f:
                        f.write(await resp.read())
        elif len(image_result) > 200:
            with open(banner_path, "wb") as f:
                f.write(base64.b64decode(image_result))

        banner_url = f"/uploads/{banner_filename}"
    except Exception as e:
        print(f"[AI Design] Banner generation failed: {e}")

    await execute(
        """UPDATE ai_design_sessions
           SET lm_content=$1, lm_post_text=$2, lm_banner_url=$3, updated_at=NOW()
           WHERE id=$4""",
        lm_content, post_text, banner_url, session_id
    )

    return {
        "success": True,
        "lm_content": lm_content,
        "post_text": post_text,
        "banner_url": banner_url,
    }


# ---- Lead Magnet: install (create LM + pin post + publish) ----

@router.post("/{tc}/session/{session_id}/install-lm")
async def install_lead_magnet(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    lm_content = session.get("lm_content") or ""
    post_text = session.get("lm_post_text") or ""
    banner_url = session.get("lm_banner_url")
    chosen_idea = session.get("lm_chosen_idea", "{}")
    if isinstance(chosen_idea, str):
        chosen_idea = json_mod.loads(chosen_idea)

    idea_title = chosen_idea.get("title", "Подарок за подписку")

    if not lm_content:
        raise HTTPException(status_code=400, detail="Сначала сгенерируйте контент лид-магнита")

    # 1. Create lead magnet with subscribers_only=true
    code = secrets.token_hex(6)
    lm_id = await execute_returning_id(
        """INSERT INTO lead_magnets (channel_id, code, title, message_text, subscribers_only, show_back_button)
           VALUES ($1,$2,$3,$4,true,true) RETURNING id""",
        channel["id"], code, idea_title, lm_content,
    )

    # 2. Create pin post with button linking to lead magnet
    inline_buttons = json_mod.dumps([
        {"type": "lead_magnet", "lead_magnet_id": lm_id, "text": "Получить бесплатно"}
    ])

    # Handle banner file for pin
    file_path = None
    file_type = None
    file_data = None
    if banner_url:
        banner_filename = banner_url.split("/")[-1]
        banner_path = os.path.join(settings.UPLOAD_DIR, banner_filename)
        if os.path.exists(banner_path):
            file_path = banner_path
            file_type = "photo"
            with open(banner_path, "rb") as f:
                file_data = f.read()

    pin_id = await execute_returning_id(
        """INSERT INTO pin_posts (channel_id, title, message_text, lead_magnet_id, inline_buttons,
           file_path, file_type, file_data, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        channel["id"], idea_title, post_text, lm_id, inline_buttons,
        file_path, file_type, file_data, "photo" if file_path else None,
    )

    # 3. Publish the pin post
    from .pins import publish_pin as _publish_pin_fn
    # We need to call the publish endpoint internally
    try:
        from ..services.messenger import send_to_channel
        from .pins import _resolve_buttons

        resolved_buttons = await _resolve_buttons(inline_buttons, channel, post_id=pin_id, post_type="pin")

        result = await send_to_channel(
            channel, post_text,
            file_path=file_path, file_type=file_type,
            inline_buttons=resolved_buttons,
            attach_type="photo" if file_path else None,
        )

        msg_id = None
        if isinstance(result, dict):
            msg_id = result.get("message_id") or result.get("result", {}).get("message_id")
            if not msg_id:
                msg_data = result.get("message", {})
                msg_id = msg_data.get("body", {}).get("mid")

        await execute(
            "UPDATE pin_posts SET status='published', published_at=NOW(), telegram_message_id=$1 WHERE id=$2",
            str(msg_id) if msg_id else None, pin_id,
        )
    except Exception as e:
        print(f"[AI Design] Pin publish failed: {e}")
        # Pin created but not published — user can publish manually

    # 4. Update session
    await execute(
        """UPDATE ai_design_sessions
           SET lead_magnet_id=$1, pin_post_id=$2, status='completed', updated_at=NOW()
           WHERE id=$3""",
        lm_id, pin_id, session_id,
    )

    return {"success": True, "lead_magnet_id": lm_id, "pin_id": pin_id}


# ---- Get session ----

@router.get("/{tc}/session/{session_id}")
async def get_session(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user["id"], channel["id"]
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    avatars = session.get("generated_grid_url", "[]")
    if isinstance(avatars, str):
        try:
            avatars = json_mod.loads(avatars)
        except Exception:
            avatars = []

    descriptions = session.get("generated_descriptions", "[]")
    if isinstance(descriptions, str):
        try:
            descriptions = json_mod.loads(descriptions)
        except Exception:
            descriptions = []

    return {
        "success": True,
        "session": {
            "id": session["id"],
            "status": session["status"],
            "niche": session.get("niche"),
            "colors": session.get("colors"),
            "style": session.get("style"),
            "contact_link": session.get("contact_link"),
            "description": session.get("description"),
            "photo_path": session.get("photo_path"),
            "avatars": avatars,
            "chosen_avatar_index": session.get("chosen_avatar_index"),
            "chosen_avatar_url": session.get("chosen_avatar_url"),
            "descriptions": descriptions,
            "chosen_description_index": session.get("chosen_description_index"),
            "chosen_description": session.get("chosen_description"),
            "tokens_spent": session.get("tokens_spent"),
            "lm_ideas": _parse_json_field(session.get("lm_ideas")),
            "lm_chosen_idea_index": session.get("lm_chosen_idea_index"),
            "lm_chosen_idea": _parse_json_field(session.get("lm_chosen_idea")),
            "lm_content": session.get("lm_content"),
            "lm_post_text": session.get("lm_post_text"),
            "lm_banner_url": session.get("lm_banner_url"),
            "lead_magnet_id": session.get("lead_magnet_id"),
            "pin_post_id": session.get("pin_post_id"),
        }
    }


def _parse_json_field(val):
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    if isinstance(val, str):
        try:
            return json_mod.loads(val)
        except Exception:
            return val
    return val
