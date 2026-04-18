"""ИИ Оформление — основные роуты: сессии, опрос, аватары, описания, применение."""
import os
import base64
import json as json_mod
import secrets
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File
from PIL import Image

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.max_api import get_max_api
from ..services.ai_openrouter import openrouter_chat, openrouter_image_gen, save_image_result

router = APIRouter()

SESSION_COST = 150  # Стоимость сессии в ИИ токенах


async def _get_owned_channel(tc: str, user_id: int):
    """Получить канал пользователя по tracking_code."""
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code=$1 AND user_id=$2 AND is_active=1", tc, user_id
    )


async def _get_session(session_id: int, user_id: int, channel_id: int):
    """Получить сессию оформления по ID."""
    return await fetch_one(
        "SELECT * FROM ai_design_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user_id, channel_id
    )


def _parse_json_field(val):
    """Парсит JSON-поле из строки или возвращает как есть."""
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


# ---- Список сессий канала ----

@router.get("/{tc}/sessions")
async def list_sessions(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Возвращает список прошлых сессий оформления для канала."""
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
        sessions.append({
            "id": r["id"],
            "status": r["status"],
            "niche": r.get("niche"),
            "style": r.get("style"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            "chosen_avatar_url": r.get("chosen_avatar_url"),
            "chosen_description": r.get("chosen_description"),
            "avatars": _parse_json_field(r.get("generated_grid_url")) or [],
            "descriptions": _parse_json_field(r.get("generated_descriptions")) or [],
        })

    return {"success": True, "sessions": sessions}


# ---- Создание сессии (списание токенов) ----

@router.post("/{tc}/session")
async def create_session(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Создаёт новую сессию оформления и списывает ИИ токены."""
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


# ---- Сохранение данных опроса ----

@router.put("/{tc}/session/{session_id}/survey")
async def save_survey(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохраняет ответы пользователя из опроса."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    session = await _get_session(session_id, user["id"], channel["id"])
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


# ---- Загрузка фото для сессии ----

@router.post("/{tc}/session/{session_id}/photo")
async def upload_photo(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Загрузка фото пользователя для генерации аватарок."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await fetch_one("SELECT id FROM ai_design_sessions WHERE id=$1 AND user_id=$2", session_id, user["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 10 МБ)")

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"ai_design_{secrets.token_hex(8)}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    path = os.path.join(settings.UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)

    await execute("UPDATE ai_design_sessions SET photo_path=$1, updated_at=NOW() WHERE id=$2", path, session_id)
    return {"success": True, "photo_url": f"/uploads/{filename}"}


# ---- Генерация сетки аватарок 3x3 ----

@router.post("/{tc}/session/{session_id}/generate-avatars")
async def generate_avatars(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Генерирует сетку 3x3 аватарок и разрезает на 9 частей."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    # Подготавливаем промт
    niche = session["niche"] or ""
    style = session["style"] or "минимализм"
    colors = _parse_json_field(session.get("colors")) or []
    color_str = f" Используй цвета: {', '.join(colors)}." if colors else ""

    # Проверяем лимит перегенераций (макс 2 перегенерации = 3 генерации всего)
    regen_count = session.get("regen_count") or 0
    if regen_count > 2:
        raise HTTPException(status_code=400, detail="Достигнут лимит перегенераций (макс 2)")

    # Фото используется при любом стиле
    photo_base64, photo_instruction = None, ""
    if session.get("photo_path") and os.path.exists(session["photo_path"]):
        with open(session["photo_path"], "rb") as f:
            photo_base64 = base64.b64encode(f.read()).decode()
        photo_instruction = " На каждой аватарке используй приложенное фото как элемент дизайна."

    prompt = (
        f"Создай квадратное изображение (соотношение сторон строго 1:1) с ровной сеткой 3x3 из 9 аватарок "
        f"для канала в тематике «{niche}» в {style} стиле.{color_str}{photo_instruction} "
        f"ВАЖНО: изображение должно быть строго квадратным (1:1). "
        f"Между аватарками не должно быть отступов, рамок, промежутков или границ. "
        f"Сетка ровно 3 колонки и 3 ряда, без зазоров. "
        f"Каждая аватарка — ровно 1/3 ширины и 1/3 высоты всего изображения. "
        f"Главный элемент каждой аватарки расположен строго по центру клетки. "
        f"На аватарках не должно быть никакого текста, надписей или букв — только графика и иллюстрации."
    )

    # Генерируем и сохраняем изображение
    image_result = await openrouter_image_gen(prompt, photo_base64)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    grid_filename = f"ai_grid_{secrets.token_hex(8)}.png"
    grid_path = os.path.join(settings.UPLOAD_DIR, grid_filename)
    await save_image_result(image_result, grid_path)

    # Разрезаем на 9 частей
    avatar_urls = _split_grid(grid_path, settings.UPLOAD_DIR)

    await execute(
        """UPDATE ai_design_sessions
           SET generated_grid_url=$1, status='choose_avatar', regen_count=COALESCE(regen_count,0)+1, updated_at=NOW()
           WHERE id=$2""",
        json_mod.dumps(avatar_urls), session_id
    )
    return {"success": True, "grid_url": f"/uploads/{grid_filename}", "avatars": avatar_urls, "regen_count": regen_count + 1}


# ---- Генерация описаний ----

@router.post("/{tc}/session/{session_id}/generate-descriptions")
async def generate_descriptions(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Генерирует 3 варианта описания канала."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    niche = session["niche"] or ""
    contact = session["contact_link"] or ""

    prompt = (
        f"Придумай 3 разных описания для канала в тематике «{niche}», "
        f"каждое до 400 символов. Обязательно укажи призыв подписаться и "
        f"канал для связи: {contact}\n\n"
        f"ВАЖНО: не используй markdown-разметку (###, **, __ и т.д.). Пиши простым текстом.\n\n"
        f"Ответь строго в формате JSON: [\"описание1\", \"описание2\", \"описание3\"]"
    )

    content = await openrouter_chat(prompt)

    # Парсим JSON из ответа
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


# ---- Выбор аватарки ----

@router.post("/{tc}/session/{session_id}/choose-avatar")
async def choose_avatar(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохраняет выбранную аватарку."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    avatars = _parse_json_field(session.get("generated_grid_url")) or []
    if index < 0 or index >= len(avatars):
        raise HTTPException(status_code=400, detail="Неверный индекс аватарки")

    await execute(
        "UPDATE ai_design_sessions SET chosen_avatar_index=$1, chosen_avatar_url=$2, updated_at=NOW() WHERE id=$3",
        index, avatars[index], session_id
    )
    return {"success": True, "chosen_avatar": avatars[index]}


# ---- Выбор описания ----

@router.post("/{tc}/session/{session_id}/choose-description")
async def choose_description(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохраняет выбранное описание."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    descriptions = _parse_json_field(session.get("generated_descriptions")) or []
    if index < 0 or index >= len(descriptions):
        raise HTTPException(status_code=400, detail="Неверный индекс описания")

    await execute(
        "UPDATE ai_design_sessions SET chosen_description_index=$1, chosen_description=$2, updated_at=NOW() WHERE id=$3",
        index, descriptions[index], session_id
    )
    return {"success": True, "chosen_description": descriptions[index]}


# ---- Применение оформления через MAX Bot API ----

@router.post("/{tc}/session/{session_id}/apply")
async def apply_to_channel(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Устанавливает аватар канала через MAX Bot API PATCH /chats/{chatId}."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    if not session.get("chosen_avatar_url") or not session.get("chosen_description"):
        raise HTTPException(status_code=400, detail="Сначала выберите аватарку и описание")

    errors = await _apply_avatar_to_max(channel, session)

    status = "applied" if not errors else "partial"
    await execute("UPDATE ai_design_sessions SET status=$1, updated_at=NOW() WHERE id=$2", status, session_id)

    # Обновляем avatar_url канала в БД
    if not any("Аватар" in e for e in errors):
        await execute(
            "UPDATE channels SET avatar_url=$1 WHERE id=$2",
            f"{settings.APP_URL}{session['chosen_avatar_url']}", channel["id"]
        )

    result = {"success": True, "status": status, "description_note": "Описание нужно установить вручную в настройках канала"}
    if errors:
        result["errors"] = errors
    return result


# ---- Получение сессии ----

@router.get("/{tc}/session/{session_id}")
async def get_session(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Возвращает полные данные сессии оформления."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

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
            "avatars": _parse_json_field(session.get("generated_grid_url")) or [],
            "chosen_avatar_index": session.get("chosen_avatar_index"),
            "chosen_avatar_url": session.get("chosen_avatar_url"),
            "descriptions": _parse_json_field(session.get("generated_descriptions")) or [],
            "chosen_description_index": session.get("chosen_description_index"),
            "chosen_description": session.get("chosen_description"),
            "tokens_spent": session.get("tokens_spent"),
            "regen_count": session.get("regen_count") or 0,
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


# ---- Вспомогательные функции ----

def _split_grid(grid_path: str, upload_dir: str) -> list:
    """Разрезает изображение сетки 3x3 на 9 отдельных аватарок. Обрезает до квадрата если нужно."""
    avatar_urls = []
    img = Image.open(grid_path)
    w, h = img.size
    # Обрезаем до квадрата по меньшей стороне (центрирование)
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        w, h = side, side
    cell_w, cell_h = w // 3, h // 3
    for row in range(3):
        for col in range(3):
            box = (col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h)
            cell = img.crop(box)
            cell_name = f"ai_avatar_{secrets.token_hex(6)}_{row}_{col}.png"
            cell_path = os.path.join(upload_dir, cell_name)
            cell.save(cell_path, "PNG")
            avatar_urls.append(f"/uploads/{cell_name}")
    return avatar_urls


async def _apply_avatar_to_max(channel, session) -> list:
    """Загружает аватар в MAX и устанавливает как иконку канала."""
    max_api = get_max_api()
    if not max_api:
        return ["MAX API не настроен"]

    chat_id = channel.get("max_chat_id") or str(channel["channel_id"])
    errors = []

    try:
        avatar_url = session["chosen_avatar_url"]
        avatar_filename = avatar_url.split("/")[-1]
        avatar_path = os.path.join(settings.UPLOAD_DIR, avatar_filename)

        if os.path.exists(avatar_path):
            upload_result = await max_api.upload_file(avatar_path, "photo")
            if upload_result.get("success"):
                upload_data = upload_result.get("data", {})
                photo_token = upload_data.get("token")
                photo_url_remote = upload_data.get("url")

                icon_payload = {}
                if photo_token:
                    icon_payload = {"token": photo_token}
                elif photo_url_remote:
                    icon_payload = {"url": photo_url_remote}
                else:
                    icon_payload = {"url": f"{settings.APP_URL}{avatar_url}"}

                patch_result = await max_api._request("PATCH", f"chats/{chat_id}", json={"icon": icon_payload})
                if not patch_result.get("success"):
                    errors.append(f"Аватар: {patch_result.get('error', 'ошибка')}")
            else:
                errors.append(f"Загрузка аватара: {upload_result.get('error', 'ошибка')}")
        else:
            errors.append("Аватар: файл не найден")
    except Exception as e:
        errors.append(f"Аватар: {str(e)}")

    return errors
