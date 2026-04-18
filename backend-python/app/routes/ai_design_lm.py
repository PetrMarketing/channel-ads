"""ИИ Оформление — роуты лид-магнита: загрузка PDF, генерация идей, контента, баннера, установка."""
import os
import base64
import json as json_mod
import secrets
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File

from ..config import settings
from ..database import fetch_one, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.ai_openrouter import openrouter_chat, openrouter_image_gen, save_image_result

router = APIRouter()


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


# ---- Загрузка PDF-референса ----

@router.post("/{tc}/session/{session_id}/lm-pdf")
async def upload_lm_pdf(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Загрузка PDF с контентом пользователя как референса для лид-магнита."""
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


# ---- Генерация 3 идей лид-магнита ----

@router.post("/{tc}/session/{session_id}/generate-lm-ideas")
async def generate_lm_ideas(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Генерирует 3 варианта лид-магнита на основе ниши, пожеланий и PDF."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    wishes = body.get("wishes", "")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    # Сохраняем пожелания
    await execute(
        "UPDATE ai_design_sessions SET lm_wishes=$1, updated_at=NOW() WHERE id=$2",
        wishes, session_id
    )

    niche = session.get("niche") or ""

    # Извлекаем текст из PDF если загружен
    pdf_context = _extract_pdf_text(session.get("lm_pdf_path"))
    pdf_note = f"\n\nВот текст из контента пользователя для вдохновения:\n{pdf_context}" if pdf_context else ""
    wish_note = f"\nПожелания пользователя: {wishes}" if wishes else ""

    prompt = (
        f"Придумай 3 разных варианта лид-магнита (бесплатного подарка за подписку) "
        f"для канала в тематике «{niche}».{wish_note}{pdf_note}\n\n"
        f"Каждый вариант — краткое название и описание в 1-2 предложениях.\n"
        f"Ответь строго в формате JSON: "
        f'[{{"title": "Название", "description": "Описание"}}, ...]'
    )

    content = await openrouter_chat(prompt)

    # Парсим JSON из ответа
    ideas = _parse_json_list(content)
    if not ideas:
        ideas = [{"title": "Подарок", "description": content[:200]}]

    await execute(
        "UPDATE ai_design_sessions SET lm_ideas=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(ideas, ensure_ascii=False), session_id
    )

    return {"success": True, "ideas": ideas}


# ---- Выбор идеи лид-магнита ----

@router.post("/{tc}/session/{session_id}/choose-lm-idea")
async def choose_lm_idea(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохраняет выбранную идею лид-магнита."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    body = await request.json()
    index = body.get("index", 0)

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    ideas = _parse_json_field(session.get("lm_ideas", "[]"))
    if index < 0 or index >= len(ideas):
        raise HTTPException(status_code=400, detail="Неверный индекс")

    chosen = ideas[index]
    await execute(
        "UPDATE ai_design_sessions SET lm_chosen_idea_index=$1, lm_chosen_idea=$2, updated_at=NOW() WHERE id=$3",
        index, json_mod.dumps(chosen, ensure_ascii=False), session_id
    )

    return {"success": True, "chosen_idea": chosen}


# ---- Генерация контента лид-магнита + баннера ----

@router.post("/{tc}/session/{session_id}/generate-lm-content")
async def generate_lm_content(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Генерирует текст лид-магнита, пост-закреп и баннер 16:9."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    chosen_idea = _parse_json_field(session.get("lm_chosen_idea", "{}"))
    niche = session.get("niche") or ""
    style = session.get("style") or "минимализм"
    colors = _parse_json_field(session.get("colors", "[]"))
    color_str = f"Цветовая гамма: {', '.join(colors)}." if colors else ""
    contact = session.get("contact_link") or ""

    idea_title = chosen_idea.get("title", "Подарок") if isinstance(chosen_idea, dict) else "Подарок"
    idea_desc = chosen_idea.get("description", "") if isinstance(chosen_idea, dict) else ""

    # 1. Генерация текста лид-магнита
    lm_content = await openrouter_chat(
        f"Напиши текст лид-магнита для канала в тематике «{niche}».\n"
        f"Тема лид-магнита: {idea_title} — {idea_desc}\n"
        f"Текст должен быть полезным, структурированным, до 2000 символов.\n"
        f"В конце укажи призыв подписаться на канал и ссылку для связи: {contact}\n\n"
        f"ВАЖНО: не используй markdown-разметку (###, **, __ и т.д.). "
        f"Пиши простым текстом без форматирования."
    )

    # 2. Генерация текста поста-закрепа
    post_text = await openrouter_chat(
        f"Напиши короткий пост-закреп для канала в тематике «{niche}».\n"
        f"Пост рекламирует бесплатный подарок за подписку: «{idea_title}».\n"
        f"Должен быть цепляющий, до 500 символов. "
        f"Обязательно в конце добавь призыв нажать на кнопку ниже, чтобы получить подарок.\n\n"
        f"ВАЖНО: не используй markdown-разметку (###, **, __ и т.д.). "
        f"Пиши простым текстом без форматирования."
    )

    # 3. Генерация баннера 16:9
    banner_url = await _generate_banner(session, idea_title, niche, style, color_str)

    await execute(
        """UPDATE ai_design_sessions
           SET lm_content=$1, lm_post_text=$2, lm_banner_url=$3, updated_at=NOW()
           WHERE id=$4""",
        lm_content, post_text, banner_url, session_id
    )

    return {"success": True, "lm_content": lm_content, "post_text": post_text, "banner_url": banner_url}


# ---- Установка лид-магнита (создание LM + пин + публикация) ----

@router.post("/{tc}/session/{session_id}/install-lm")
async def install_lead_magnet(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Создаёт лид-магнит, пост-закреп и публикует в канал."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    lm_content = session.get("lm_content") or ""
    post_text = session.get("lm_post_text") or ""
    banner_url = session.get("lm_banner_url")
    chosen_idea = _parse_json_field(session.get("lm_chosen_idea", "{}"))
    idea_title = chosen_idea.get("title", "Подарок за подписку") if isinstance(chosen_idea, dict) else "Подарок за подписку"

    if not lm_content:
        raise HTTPException(status_code=400, detail="Сначала сгенерируйте контент лид-магнита")

    # 1. Создаём лид-магнит с subscribers_only=true
    code = secrets.token_hex(6)
    lm_id = await execute_returning_id(
        """INSERT INTO lead_magnets (channel_id, code, title, message_text, subscribers_only, show_back_button)
           VALUES ($1,$2,$3,$4,true,true) RETURNING id""",
        channel["id"], code, idea_title, lm_content,
    )

    # 2. Создаём пост-закреп с кнопкой ведущей на лид-магнит
    inline_buttons = json_mod.dumps([
        {"type": "lead_magnet", "lead_magnet_id": lm_id, "text": "Получить бесплатно"}
    ])

    # Подготавливаем баннер для пина
    file_path, file_type, file_data = _load_banner_file(banner_url)

    pin_id = await execute_returning_id(
        """INSERT INTO pin_posts (channel_id, title, message_text, lead_magnet_id, inline_buttons,
           file_path, file_type, file_data, attach_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
        channel["id"], idea_title, post_text, lm_id, inline_buttons,
        file_path, file_type, file_data, "photo" if file_path else None,
    )

    # 3. Публикуем пост-закреп в канал
    await _publish_pin(channel, pin_id, post_text, file_path, file_type, inline_buttons)

    # 4. Обновляем статус сессии
    await execute(
        """UPDATE ai_design_sessions
           SET lead_magnet_id=$1, pin_post_id=$2, status='completed', updated_at=NOW()
           WHERE id=$3""",
        lm_id, pin_id, session_id,
    )

    return {"success": True, "lead_magnet_id": lm_id, "pin_id": pin_id}


# ---- Вспомогательные функции ----

def _extract_pdf_text(pdf_path: str) -> str:
    """Извлекает текст из первых 5 страниц PDF файла."""
    if not pdf_path or not os.path.exists(pdf_path):
        return ""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        text_parts = []
        for page in doc[:5]:
            text_parts.append(page.get_text()[:500])
        doc.close()
        return "\n".join(text_parts)[:2000]
    except Exception:
        return ""


def _parse_json_list(content: str) -> list:
    """Извлекает JSON-массив из текстового ответа ИИ."""
    try:
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            return json_mod.loads(content[start:end])
    except Exception:
        pass
    return []


def _parse_json_field(val):
    """Парсит JSON-поле из строки или возвращает как есть."""
    if val is None:
        return []
    if isinstance(val, (list, dict)):
        return val
    if isinstance(val, str):
        try:
            return json_mod.loads(val)
        except Exception:
            return val
    return val


async def _generate_banner(session, idea_title: str, niche: str, style: str, color_str: str) -> str | None:
    """Генерирует баннер 16:9 для поста-закрепа."""
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

    try:
        image_result = await openrouter_image_gen(banner_prompt, photo_base64)
        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        banner_filename = f"ai_banner_{secrets.token_hex(8)}.png"
        banner_path = os.path.join(upload_dir, banner_filename)
        await save_image_result(image_result, banner_path)
        return f"/uploads/{banner_filename}"
    except Exception as e:
        print(f"[AI Design] Banner generation failed: {e}")
        return None


def _load_banner_file(banner_url: str | None) -> tuple:
    """Загружает файл баннера для вставки в пост."""
    if not banner_url:
        return None, None, None
    banner_filename = banner_url.split("/")[-1]
    banner_path = os.path.join(settings.UPLOAD_DIR, banner_filename)
    if os.path.exists(banner_path):
        with open(banner_path, "rb") as f:
            return banner_path, "photo", f.read()
    return None, None, None


async def _publish_pin(channel, pin_id: int, post_text: str, file_path, file_type, inline_buttons):
    """Публикует пост-закреп в канал через send_to_channel."""
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
