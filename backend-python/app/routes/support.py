"""Чат поддержки — древо вопросов с кнопкой «Позвать оператора».

С 2026-05-14 ИИ-ответы отключены: пользователь жмёт кнопки и получает готовые
ответы из support_topics.py. Если ответ не нашёлся — кнопка «Позвать
оператора» создаёт обычный тикет с описанием/скриншотами для админа.
"""
import os
import secrets
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File, Form

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.support_topics import get_topics_tree, get_topic

router = APIRouter()


# ---- Древо вопросов ----

@router.get("/topics")
async def get_support_topics():
    """Возвращает всё древо тем разом — фронт хранит локально и навигирует
    без лишних запросов."""
    return {"success": True, "topics": get_topics_tree(), "root": "root"}


# ---- Создать тикет с выбранной темой и описанием для оператора ----

@router.post("/operator-request")
async def operator_request(request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Пользователь нажал «Позвать оператора» и описал проблему.
    Создаём (или переиспользуем) тикет, добавляем сообщение с контекстом
    выбранной темы, помечаем escalated. Админ увидит в /admin/support."""
    body = await request.json()
    description = (body.get("description") or "").strip()
    topic_id = (body.get("topic_id") or "").strip() or None
    if not description:
        raise HTTPException(status_code=400, detail="Опишите вопрос")

    ticket = await fetch_one(
        "SELECT id FROM support_tickets WHERE user_id=$1 AND status NOT IN ('closed') ORDER BY created_at DESC LIMIT 1",
        user["id"],
    )
    if ticket:
        ticket_id = int(ticket["id"])
    else:
        ticket_id = await execute_returning_id(
            "INSERT INTO support_tickets (user_id, status, escalated) VALUES ($1, 'waiting_human', TRUE) RETURNING id",
            user["id"],
        )

    # Контекст темы (если выбрана) + описание
    parts = []
    if topic_id:
        node = get_topic(topic_id)
        if node and node.get("title"):
            parts.append(f"📂 Тема: {node['title']}")
    parts.append(description)
    full_text = "\n\n".join(parts)

    await execute(
        "INSERT INTO support_messages (ticket_id, role, content) VALUES ($1, 'user', $2)",
        ticket_id, full_text,
    )
    await execute(
        "UPDATE support_tickets SET escalated=TRUE, status='waiting_human', updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    return {"success": True, "ticket_id": ticket_id}


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
        "SELECT id, status, escalated FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")

    messages = await fetch_all(
        "SELECT id, role, content, image_url, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at",
        ticket_id,
    )
    return {
        "success": True,
        "messages": messages,
        "status": ticket.get("status"),
        "escalated": bool(ticket.get("escalated")),
    }


@router.post("/ticket/{ticket_id}/escalate")
async def escalate_ticket(ticket_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Пользователь явно вызывает человека (без ожидания ответа ИИ)."""
    ticket = await fetch_one(
        "SELECT id, status FROM support_tickets WHERE id=$1 AND user_id=$2", ticket_id, user["id"]
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    if ticket["status"] == "closed":
        raise HTTPException(status_code=400, detail="Тикет закрыт")
    await execute(
        "UPDATE support_tickets SET escalated=TRUE, status='waiting_human', updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    # Системное сообщение от ИИ для контекста админа
    await execute(
        "INSERT INTO support_messages (ticket_id, role, content) VALUES ($1, 'ai', $2)",
        ticket_id, "Пользователь нажал «Позвать человека» — ожидаем подключения специалиста.",
    )
    return {"success": True, "status": "waiting_human"}


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
    # Любое сообщение от пользователя = ждёт ответа оператора (ИИ отключён).
    await execute(
        "UPDATE support_tickets SET escalated=TRUE, status='waiting_human', updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    return {"success": True, "ai_reply": None, "status": "waiting_human"}


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

    # Любое сообщение от пользователя = ждёт ответа оператора (ИИ отключён).
    await execute(
        "UPDATE support_tickets SET escalated=TRUE, status='waiting_human', updated_at=NOW() WHERE id=$1",
        ticket_id,
    )
    return {"success": True, "image_url": image_url, "ai_reply": None, "status": "waiting_human"}


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
