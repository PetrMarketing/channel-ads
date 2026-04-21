"""Чат поддержки — ИИ-ассистент с эскалацией к специалисту."""
import os
import base64
import secrets
from typing import Dict, Any, Optional

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File, Form

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.ai_openrouter import openrouter_chat_messages
from ..services.support_kb import get_support_prompt

router = APIRouter()

SUPPORT_MODEL = "openai/gpt-4.1-nano"


# ---- Получить/создать активный тикет ----

@router.get("/ticket")
async def get_or_create_ticket(user: Dict[str, Any] = Depends(get_current_user)):
    """Получить активный тикет или создать новый."""
    ticket = await fetch_one(
        "SELECT * FROM support_tickets WHERE user_id=$1 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
        user["id"],
    )
    if ticket:
        messages = await fetch_all(
            "SELECT id, role, content, image_url, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at",
            ticket["id"],
        )
        return {"success": True, "ticket_id": ticket["id"], "status": ticket["status"],
                "escalated": ticket["escalated"], "messages": messages}

    tid = await execute_returning_id(
        "INSERT INTO support_tickets (user_id) VALUES ($1) RETURNING id", user["id"]
    )
    return {"success": True, "ticket_id": tid, "status": "ai", "escalated": False, "messages": []}


# ---- Получить сообщения тикета ----

@router.get("/ticket/{ticket_id}/messages")
async def get_messages(ticket_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    ticket = await fetch_one(
        "SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    messages = await fetch_all(
        "SELECT id, role, content, image_url, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at",
        ticket_id,
    )
    return {"success": True, "messages": messages}


# ---- Отправить сообщение (текст) ----

@router.post("/ticket/{ticket_id}/message")
async def send_message(ticket_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    ticket = await fetch_one(
        "SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    if ticket["status"] == "closed":
        raise HTTPException(status_code=400, detail="Тикет закрыт")

    body = await request.json()
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Пустое сообщение")

    await execute(
        "INSERT INTO support_messages (ticket_id, role, content) VALUES ($1, 'user', $2)",
        ticket_id, content,
    )
    await execute("UPDATE support_tickets SET updated_at=NOW() WHERE id=$1", ticket_id)

    if ticket["status"] == "escalated":
        return {"success": True, "ai_reply": None}

    ai_text, escalated = await _generate_ai_reply(ticket_id)
    return {"success": True, "ai_reply": ai_text, "escalated": escalated}


# ---- Загрузить изображение ----

@router.post("/ticket/{ticket_id}/photo")
async def send_photo(
    ticket_id: int,
    file: UploadFile = File(...),
    content: str = Form(""),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = await fetch_one(
        "SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    if ticket["status"] == "closed":
        raise HTTPException(status_code=400, detail="Тикет закрыт")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 10 МБ)")

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"support_{secrets.token_hex(8)}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    path = os.path.join(settings.UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(file_bytes)

    image_url = f"/uploads/{filename}"
    msg_text = content.strip() or "Отправлено изображение"

    await execute(
        "INSERT INTO support_messages (ticket_id, role, content, image_url) VALUES ($1, 'user', $2, $3)",
        ticket_id, msg_text, image_url,
    )
    await execute("UPDATE support_tickets SET updated_at=NOW() WHERE id=$1", ticket_id)

    if ticket["status"] == "escalated":
        return {"success": True, "image_url": image_url, "ai_reply": None}

    # Генерируем ответ ИИ с учётом изображения
    ai_text, escalated = await _generate_ai_reply(ticket_id, image_bytes=file_bytes, image_ext=ext)
    return {"success": True, "image_url": image_url, "ai_reply": ai_text, "escalated": escalated}


# ---- Общая функция генерации ответа ИИ ----

async def _generate_ai_reply(ticket_id: int, image_bytes: bytes = None, image_ext: str = ".png"):
    """Генерирует ответ ИИ по истории тикета. Возвращает (текст, escalated)."""
    history = await fetch_all(
        "SELECT role, content, image_url FROM support_messages WHERE ticket_id=$1 ORDER BY created_at",
        ticket_id,
    )

    messages = [{"role": "system", "content": get_support_prompt()}]
    for msg in history:
        role = "assistant" if msg["role"] in ("ai", "admin") else "user"
        # Для последнего сообщения с картинкой — отправляем vision
        if msg.get("image_url") and msg == history[-1] and image_bytes:
            mime = "image/jpeg" if image_ext.lower() in (".jpg", ".jpeg") else "image/png"
            b64 = base64.b64encode(image_bytes).decode()
            messages.append({
                "role": role,
                "content": [
                    {"type": "text", "text": msg["content"] or "Пользователь отправил скриншот."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            })
        else:
            messages.append({"role": role, "content": msg["content"]})

    try:
        ai_text = await openrouter_chat_messages(messages, model=SUPPORT_MODEL)
    except Exception as e:
        print(f"[Support] AI error: {e}")
        ai_text = "Сейчас позову специалиста, подождите пожалуйста [ESCALATE]"

    escalated = "[ESCALATE]" in ai_text
    ai_text_clean = ai_text.replace("[ESCALATE]", "").strip()

    await execute(
        "INSERT INTO support_messages (ticket_id, role, content) VALUES ($1, 'ai', $2)",
        ticket_id, ai_text_clean,
    )

    if escalated:
        await execute(
            "UPDATE support_tickets SET escalated=TRUE, status='escalated', updated_at=NOW() WHERE id=$1",
            ticket_id,
        )

    return ai_text_clean, escalated


# ---- Закрыть тикет (пользователь) ----

@router.post("/ticket/{ticket_id}/close")
async def close_ticket(ticket_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    ticket = await fetch_one(
        "SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    await execute(
        "UPDATE support_tickets SET status='closed', updated_at=NOW() WHERE id=$1", ticket_id
    )
    return {"success": True}
