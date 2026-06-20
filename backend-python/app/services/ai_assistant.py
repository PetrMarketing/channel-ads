"""ИИ-Помощник по сервису.

Принимает свободный текст ("Сделай лид-магнит и пост на 21 июня…")
и через Claude (OpenRouter tool-use) собирает план: какие инструменты
дёрнуть с какими параметрами. Юзер подтверждает план → executor
выполняет шаги последовательно, в конце шлёт уведомление в ПКРеклама-бот.

Поддерживаемые инструменты (MVP):
  1. create_post           — пост в /content
  2. create_lead_magnet    — лид-магнит для канала
  3. create_link           — tracking-ссылка (Лендинг/Прямая/Лид-магнит)
  4. start_ai_content      — запустить ИИ-Контент сессию (пакет постов)
  5. start_broadcast       — рассылка по подписчикам
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import aiohttp

from ..config import settings
from ..database import fetch_one, fetch_all, execute


_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_MODEL = "anthropic/claude-sonnet-4"
_FALLBACK_MODEL = "openai/gpt-4o-mini"
_TIMEOUT = aiohttp.ClientTimeout(total=45)


# ============================================================
# Tool catalog — JSON Schema каждой функции для tool-use LLM
# ============================================================

TOOL_CATALOG: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "create_post",
            "description": (
                "Создать пост в разделе Контент с возможным расписанием и/или генерацией текста/картинки. "
                "Используй когда пользователь хочет ОДИН пост по теме или с готовым текстом."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_tracking_code": {"type": "string", "description": "tc канала (если у юзера несколько). Если один — оставь пустым."},
                    "title": {"type": "string"},
                    "message_text": {"type": "string", "description": "ГОТОВЫЙ текст поста. Если нужно сгенерировать — оставь пустым и заполни topic."},
                    "topic": {"type": "string", "description": "Тема для ИИ-генерации текста. Заполняется если message_text пустой."},
                    "scheduled_at": {"type": "string", "description": "ISO8601 МСК (например 2026-06-21T10:00:00)"},
                    "with_image": {"type": "boolean", "description": "Сгенерировать ИИ-картинку"},
                    "image_topic": {"type": "string", "description": "Тема для генерации картинки (если with_image=true)"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_lead_magnet",
            "description": "Создать лид-магнит для канала (за подписку юзер получает в бот).",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_tracking_code": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "content_text": {"type": "string", "description": "Текст лид-магнита, который придёт юзеру в бот."},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_link",
            "description": "Создать tracking-ссылку для рекламы (Лендинг или Прямая).",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_tracking_code": {"type": "string"},
                    "name": {"type": "string"},
                    "link_type": {"type": "string", "enum": ["landing", "direct", "lm_landing"]},
                    "utm_source": {"type": "string"},
                    "utm_campaign": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_ai_content",
            "description": "Запустить ИИ-Контент сессию — генерация пакета постов на месяц. Используй когда юзер хочет МНОГО постов сразу.",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_tracking_code": {"type": "string"},
                    "topic": {"type": "string", "description": "О чём канал, ниша"},
                    "posts_count": {"type": "integer", "description": "Сколько постов (по умолчанию 30)"},
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_broadcast",
            "description": "Создать и отправить рассылку подписчикам канала.",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_tracking_code": {"type": "string"},
                    "message_text": {"type": "string"},
                    "scheduled_at": {"type": "string", "description": "ISO8601 МСК или пусто для отправки сейчас"},
                },
                "required": ["message_text"],
            },
        },
    },
]


# ============================================================
# Стоимость в ИИ-токенах
# ============================================================

PARSE_COST = 1  # за каждый запрос к Помощнику (распознавание)
TOOL_COSTS = {
    "create_post": 1,          # если message_text задан (готовый)
    "create_post_generated": 10,  # если только topic (генерация с нуля)
    "create_post_with_image": 30, # генерация + картинка
    "create_lead_magnet": 5,
    "create_link": 0,           # бесплатно
    "start_ai_content": 0,      # стоимость отдельно за сессию (150)
    "start_broadcast": 0,
}


def estimate_step_cost(tool_name: str, args: dict) -> int:
    if tool_name == "create_post":
        if args.get("with_image"):
            return TOOL_COSTS["create_post_with_image"]
        if not args.get("message_text"):
            return TOOL_COSTS["create_post_generated"]
        return TOOL_COSTS["create_post"]
    return TOOL_COSTS.get(tool_name, 0)


# ============================================================
# LLM call
# ============================================================

SYSTEM_PROMPT = """Ты — помощник в сервисе MAX Маркетинг для управления каналами в мессенджере MAX.
Пользователь даёт тебе задачу на естественном языке. Твоя работа:
1. Разобрать её на конкретные действия — какие инструменты вызвать и с какими параметрами
2. Если задача неполная (нет даты, темы, текста) — вызови инструмент с пустыми/предположительными значениями, а в конечном ответе укажи что нужно уточнить
3. ВСЕГДА сначала вызывай нужные tools, потом коротко резюмируй для подтверждения юзером

КРИТИЧЕСКИ ВАЖНО про параметры:
- with_image=true ставь ТОЛЬКО если юзер ЯВНО попросил картинку/изображение/фото/иллюстрацию.
  Если просто «сделай пост» — НЕ ставь with_image, не приписывай юзеру лишних трат.
- message_text — заполняй ТОЛЬКО если юзер дал готовый текст в кавычках.
  Если просит на тему чего-то — оставь message_text пустым, а topic заполни.
- scheduled_at указывай в ISO формате МСК времени (например 2026-06-22T10:00:00).
  Если время не указано — поставь 10:00, если дата не указана — на сегодня вечером.

Сегодня: {today_msk}. МСК = UTC+3.
"""


async def parse_query_with_llm(query: str, user_context: dict) -> dict:
    """Шлёт запрос в OpenRouter с tool catalog. Возвращает план:
    {
      "steps": [{"tool": "create_post", "args": {...}}, ...],
      "confirm_summary": "Создам пост 21 июня в 10:00 по теме «...» с картинкой",
      "missing": [...],
    }
    """
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY не задан")

    today_msk = (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%d %B %Y, %H:%M")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.format(today_msk=today_msk)},
        {"role": "user", "content": query},
    ]

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": _MODEL,
        "messages": messages,
        "tools": TOOL_CATALOG,
        "tool_choice": "auto",
        "max_tokens": 1500,
    }

    async def _call(model):
        async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
            payload["model"] = model
            async with session.post(_OPENROUTER_URL, json=payload, headers=headers) as resp:
                return resp.status, await resp.json()

    status, data = await _call(_MODEL)
    if status != 200 or "choices" not in data:
        # fallback
        status, data = await _call(_FALLBACK_MODEL)
        if status != 200 or "choices" not in data:
            err = (data.get("error") or {}) if isinstance(data, dict) else {}
            code = err.get("code") or status
            msg = err.get("message") or str(data)[:200]
            ml = str(msg).lower()
            if code == 402 or "credit" in ml or "afford" in ml or "User not found" in str(msg) or code == 401:
                raise RuntimeError(
                    "На сервере временно нет кредитов для ИИ. "
                    "Мы уже занимаемся — попробуйте через 10-15 минут."
                )
            if code == 429 or "rate" in ml:
                raise RuntimeError("Слишком много запросов к ИИ — попробуйте через минуту.")
            raise RuntimeError("ИИ временно недоступен — попробуйте через несколько минут.")

    msg = data["choices"][0]["message"]
    tool_calls = msg.get("tool_calls") or []
    steps = []
    for tc in tool_calls:
        fn = tc.get("function", {})
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except Exception:
            args = {}
        steps.append({"tool": fn.get("name"), "args": args})

    summary = (msg.get("content") or "").strip()
    if not summary:
        if steps:
            summary = "Готов выполнить: " + ", ".join(s["tool"] for s in steps)
        else:
            summary = "Не понял задачу — переформулируй пожалуйста."

    return {"steps": steps, "confirm_summary": summary, "missing": []}


# ============================================================
# Executor — выполняет шаги через прямые БД-операции / fetch_one
# (вызовы REST endpoints из бэкенда были бы избыточны и медленнее)
# ============================================================

async def _resolve_channel(user_id: int, tc_hint: Optional[str]) -> Optional[dict]:
    if tc_hint:
        ch = await fetch_one(
            "SELECT id, tracking_code, title FROM channels WHERE tracking_code = $1 AND user_id = $2",
            tc_hint, user_id,
        )
        if ch:
            return dict(ch)
    # fallback: первый активный канал юзера
    ch = await fetch_one(
        "SELECT id, tracking_code, title FROM channels WHERE user_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1",
        user_id,
    )
    return dict(ch) if ch else None


def _parse_dt_msk(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    s2 = s.replace("Z", "").replace("+03:00", "")
    if "." in s2:
        s2 = s2.split(".")[0]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(s2, fmt)
        except ValueError:
            continue
    return None


async def execute_step(user_id: int, step: dict) -> dict:
    """Выполняет один шаг. Возвращает {ok, link, message}."""
    tool = step.get("tool")
    args = step.get("args") or {}

    if tool == "create_post":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        scheduled = _parse_dt_msk(args.get("scheduled_at"))
        if scheduled:
            scheduled = scheduled - timedelta(hours=3)  # МСК → UTC

        message_text = (args.get("message_text") or "").strip()
        title = (args.get("title") or "").strip() or "Пост"
        topic = (args.get("topic") or "").strip()
        with_image = bool(args.get("with_image"))
        image_topic = (args.get("image_topic") or "").strip() or topic or title

        # Генерация текста если нужна
        if not message_text and topic:
            try:
                gen = await _quick_generate_post(topic)
                if gen:
                    message_text = gen
            except Exception as e:
                print(f"[ai-assistant] generate post error: {e}")

        # Генерация картинки если запрошена
        image_path = None
        image_file_data = None
        image_error = None
        if with_image:
            try:
                from .ai_openrouter import openrouter_image_gen, save_image_result
                img_prompt = (
                    f"Иллюстрация к посту в канал на тему: «{image_topic}». "
                    "Высокое качество, без текста на картинке."
                )
                img_result = await openrouter_image_gen(img_prompt)
                if img_result and img_result.get("image_base64"):
                    saved = save_image_result(img_result["image_base64"], suffix=".png")
                    if saved:
                        image_path = saved
                        try:
                            with open(image_path, "rb") as _f:
                                image_file_data = _f.read()
                        except Exception:
                            image_file_data = None
                else:
                    image_error = "ИИ не вернул картинку"
            except Exception as e:
                image_error = str(e)[:200]
                print(f"[ai-assistant] image gen error: {e}")

        from ..database import execute_returning_id
        post_id = await execute_returning_id(
            """INSERT INTO content_posts (channel_id, title, message_text, scheduled_at, status,
                                          file_path, file_type, file_data, attach_type)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
            ch["id"], title, message_text or "(пусто, заполните в кабинете)",
            scheduled,
            "scheduled" if scheduled else "draft",
            image_path, "photo" if image_path else None, image_file_data, "photo" if image_path else None,
        )
        link = f"/content?post={post_id}"
        msg = f"Пост создан в канале «{ch['title']}»"
        if with_image:
            msg += " с картинкой" if image_path else f" (картинку сгенерировать не удалось: {image_error or '—'})"
        return {
            "ok": True, "post_id": post_id, "channel": ch["title"],
            "image": bool(image_path),
            "link": link, "message": msg,
        }

    elif tool == "create_lead_magnet":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        import secrets as _sec
        code = _sec.token_urlsafe(8)
        from ..database import execute_returning_id
        lm_id = await execute_returning_id(
            """INSERT INTO lead_magnets (channel_id, code, title, description, content_text)
               VALUES ($1,$2,$3,$4,$5) RETURNING id""",
            ch["id"], code, args.get("title") or "Лид-магнит",
            args.get("description") or "",
            args.get("content_text") or "",
        )
        return {
            "ok": True, "lm_id": lm_id, "code": code,
            "link": "/links",
            "message": f"Лид-магнит «{args.get('title')}» создан в «{ch['title']}»",
        }

    elif tool == "create_link":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        import secrets as _sec
        short = _sec.token_urlsafe(8)[:10]
        from ..database import execute_returning_id
        link_id = await execute_returning_id(
            """INSERT INTO tracking_links (channel_id, name, link_type, short_code,
                                            utm_source, utm_campaign)
               VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
            ch["id"], args.get("name") or "Без названия",
            (args.get("link_type") or "landing"),
            short, args.get("utm_source") or "", args.get("utm_campaign") or "",
        )
        return {
            "ok": True, "link_id": link_id, "short_code": short,
            "link": "/links",
            "message": f"Ссылка «{args.get('name')}» создана",
        }

    elif tool == "start_ai_content":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        return {
            "ok": True, "link": "/content",
            "message": (
                f"Готов запустить ИИ-Контент в «{ch['title']}» по теме "
                f"«{args.get('topic')}». Перейди в раздел Контент → ИИ Контент → "
                "вкладка откроется с предзаполнением. (Авто-запуск пока не реализован.)"
            ),
        }

    elif tool == "start_broadcast":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        scheduled = _parse_dt_msk(args.get("scheduled_at"))
        if scheduled:
            scheduled = scheduled - timedelta(hours=3)
        from ..database import execute_returning_id
        bc_id = await execute_returning_id(
            """INSERT INTO broadcasts (channel_id, message_text, scheduled_at, status)
               VALUES ($1,$2,$3,$4) RETURNING id""",
            ch["id"], args.get("message_text") or "",
            scheduled, "scheduled" if scheduled else "draft",
        )
        return {
            "ok": True, "broadcast_id": bc_id, "link": "/broadcasts",
            "message": f"Рассылка создана в «{ch['title']}»",
        }

    return {"ok": False, "error": f"Неизвестный инструмент: {tool}"}


async def _quick_generate_post(topic: str) -> Optional[str]:
    """Быстрая генерация одного поста через OpenRouter."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        return None
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": _MODEL,
        "messages": [
            {"role": "system", "content": "Ты пишешь короткие живые посты для канала в MAX (мессенджер). 600-1000 символов, без хэштегов."},
            {"role": "user", "content": f"Напиши пост на тему: {topic}"},
        ],
        "max_tokens": 800,
    }
    try:
        async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
            async with session.post(_OPENROUTER_URL, json=payload, headers=headers) as resp:
                data = await resp.json()
                if "choices" in data:
                    return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None
    return None


# ============================================================
# Bot notification
# ============================================================

async def notify_user_done(user_id: int, task_summary: str, sections: List[str]) -> None:
    user = await fetch_one("SELECT max_user_id, telegram_id FROM users WHERE id = $1", user_id)
    if not user:
        return
    text = (
        f"✅ Задача выполнена\n\n"
        f"<b>{task_summary}</b>\n\n"
        f"Результат можно посмотреть в разделах: {', '.join(sections) if sections else '—'}\n\n"
        f"max.pkmarketing.ru"
    )
    try:
        from .messenger import send_to_user
        if user.get("max_user_id"):
            await send_to_user(user["max_user_id"], "max", text)
        elif user.get("telegram_id"):
            await send_to_user(int(user["telegram_id"]), "telegram", text)
    except Exception as e:
        print(f"[ai-assistant] notify failed: {e}")
