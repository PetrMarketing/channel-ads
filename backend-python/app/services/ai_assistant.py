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
                "Используй когда пользователь хочет ОДИН пост по теме или с готовым текстом. "
                "Кнопки поста (ссылка/комментарии/опрос/лид-магнит) собираются в массив buttons."
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
                    "with_comments": {"type": "boolean", "description": "Добавить кнопку «Комментарии» — true если юзер сказал «с комментариями»/«с обсуждением»"},
                    "buttons": {
                        "type": "array",
                        "description": "Дополнительные кнопки к посту. Каждая — объект с type и параметрами.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["url", "poll", "lead_magnet"]},
                                "text": {"type": "string", "description": "Текст на кнопке"},
                                "url": {"type": "string", "description": "URL — для type='url'"},
                                "poll_id": {"type": "integer", "description": "ID опроса — для type='poll'"},
                                "lead_magnet_id": {"type": "integer", "description": "ID лид-магнита — для type='lead_magnet'"},
                            },
                            "required": ["type", "text"],
                        },
                    },
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
            "name": "ask_user",
            "description": (
                "Задать пользователю уточняющие вопросы когда для выполнения задачи не хватает "
                "критичной информации. Используй ВМЕСТО остальных инструментов если нельзя корректно "
                "выполнить задачу без ответов. Примеры когда нужны уточнения: "
                "- Юзер попросил кнопку со ссылкой но не указал URL. "
                "- Юзер попросил прикрепить опрос но не указал какой. "
                "- Юзер попросил прикрепить лид-магнит но не уточнил. "
                "- Нужна дата поста но юзер не указал. "
                "НЕ используй если можно разумно предположить (например время по умолчанию 10:00 МСК)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string", "description": "Короткий машинный ключ (url, poll_id, scheduled_at, etc.)"},
                                "question": {"type": "string", "description": "Вопрос человеку на русском"},
                                "placeholder": {"type": "string", "description": "Пример ответа для placeholder-подсказки"},
                            },
                            "required": ["key", "question"],
                        },
                    },
                },
                "required": ["questions"],
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
TEXT_GEN_COST = 10   # генерация текста поста с нуля
IMAGE_GEN_COST = 10  # генерация одной картинки
LEAD_MAGNET_COST = 5


def estimate_step_cost(tool_name: str, args: dict) -> int:
    if tool_name == "create_post":
        cost = 1  # готовый текст (минимум)
        if not args.get("message_text"):
            cost = TEXT_GEN_COST  # генерация с нуля
        if args.get("with_image"):
            cost += IMAGE_GEN_COST
        return cost
    if tool_name == "create_lead_magnet":
        return LEAD_MAGNET_COST
    return 0


# ============================================================
# LLM call
# ============================================================

SYSTEM_PROMPT = """Ты — помощник в сервисе MAX Маркетинг для управления каналами в мессенджере MAX.
Пользователь даёт тебе задачу на естественном языке. Твоя работа:
1. Разобрать её на конкретные действия — какие инструменты вызвать и с какими параметрами
2. ЕСЛИ КРИТИЧНЫХ ДАННЫХ НЕТ (см. ниже) — вызови ТОЛЬКО ask_user с массивом вопросов, НЕ выполняй частичный план
3. Если данные есть — вызывай нужные tools + коротко резюмируй для подтверждения

КОГДА обязательно нужен ask_user (задай вопросы):
- Юзер попросил кнопку со ссылкой но не дал URL. Вопрос: «Куда ведёт кнопка? Дай URL»
- Юзер попросил прикрепить опрос но не сказал какой. Вопрос: «ID опроса или название»
- Юзер попросил прикрепить лид-магнит но не сказал какой. Вопрос: «Название лид-магнита»
- Пост создать но нет ни готового текста ни темы для генерации
- Рассылка но не указан текст
Формат вопросов: [{"key":"url","question":"Куда ведёт кнопка?","placeholder":"https://..."}]
После ответа юзер отправит уточнение и мы снова тебя позовём.

КОГДА можно предположить и не спрашивать:
- Время поста → 10:00 МСК по умолчанию
- Дата — сегодня вечером если не указана
- Название канала — если у юзера один канал (не спрашивай tc)

КРИТИЧЕСКИ ВАЖНО про параметры create_post:
- with_image=true ТОЛЬКО если юзер ЯВНО сказал «картинка/изображение/фото/иллюстрация»
- with_comments=true если юзер сказал «с комментариями»/«с обсуждением»
- message_text — ТОЛЬКО если юзер дал готовый текст (обычно в кавычках)
- topic — если юзер просит написать на тему
- buttons — массив кнопок. Каждая: {type: url|poll|lead_magnet, text, url|poll_id|lead_magnet_id}
- scheduled_at — ISO МСК (2026-06-22T10:00:00)

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
    # НЕ используем str.format — в промпте есть JSON-примеры с фигурными
    # скобками ({"key":"url"...}), они ловятся format-ом и падают на KeyError.
    # Простая замена по маркеру безопаснее.
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.replace("{today_msk}", today_msk)},
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

    # Устойчиво к неожиданной структуре ответа: пустой choices, message как
    # строка, tool_calls как строка/None — вернём человеческую ошибку вместо
    # AttributeError.
    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices or not isinstance(choices, list):
        raise RuntimeError("ИИ вернул пустой ответ — попробуйте переформулировать задачу.")
    first = choices[0] if isinstance(choices[0], dict) else {}
    msg = first.get("message") if isinstance(first.get("message"), dict) else {}
    if not msg:
        # Иногда модель отдаёт content напрямую в choice
        content_alt = first.get("text") or first.get("content") or ""
        return {"steps": [], "confirm_summary": (str(content_alt) or "Не понял задачу — переформулируй пожалуйста."), "missing": []}
    raw_tc = msg.get("tool_calls")
    tool_calls = raw_tc if isinstance(raw_tc, list) else []
    steps = []
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except Exception:
            args = {}
        steps.append({"tool": fn.get("name"), "args": args})

    content = msg.get("content")
    if isinstance(content, list):
        content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
    summary = (str(content) if content else "").strip()
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

    if tool == "ask_user":
        # Никакой БД-работы — только маркер что нужны ответы
        return {
            "ok": True,
            "needs_answers": True,
            "questions": args.get("questions") or [],
            "message": "Нужны уточнения — заполните форму ниже.",
        }

    if tool == "create_post":
        ch = await _resolve_channel(user_id, args.get("channel_tracking_code"))
        if not ch:
            return {"ok": False, "error": "Нет доступных каналов"}
        scheduled = _parse_dt_msk(args.get("scheduled_at"))
        if scheduled:
            scheduled = scheduled - timedelta(hours=3)  # МСК → UTC
        else:
            # Юзер не указал дату → ставим на 30 минут вперёд по МСК
            # (минус 3ч для UTC), чтобы пост сразу был виден на вкладке
            # «Ожидание», а не остался невидимым черновиком
            scheduled = datetime.utcnow() + timedelta(minutes=30)

        message_text = (args.get("message_text") or "").strip()
        title = (args.get("title") or "").strip() or "Пост"
        topic = (args.get("topic") or "").strip()
        with_image = bool(args.get("with_image"))
        with_comments = bool(args.get("with_comments"))
        image_topic = (args.get("image_topic") or "").strip() or topic or title

        # Генерация текста если нужна
        if not message_text and topic:
            try:
                gen = await _quick_generate_post(topic)
                if gen:
                    message_text = gen
            except Exception as e:
                print(f"[ai-assistant] generate post error: {e}")
        # Чистим markdown — MAX и TG отображают **bold** как сырые звёзды,
        # а в нашем редакторе markdown тоже не парсится. Заменяем на чистый текст.
        if message_text:
            import re as _re
            message_text = _re.sub(r"\*\*([^*]+)\*\*", r"\1", message_text)  # **bold** → bold
            message_text = _re.sub(r"__([^_]+)__", r"\1", message_text)      # __bold__ → bold
            message_text = _re.sub(r"(?<!\w)\*([^*\n]+)\*(?!\w)", r"\1", message_text)  # *italic*
            message_text = _re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"\1", message_text)    # _italic_

        # Генерация картинки если запрошена
        image_path = None
        image_file_data = None
        image_error = None
        if with_image:
            # Берём последнее фото канала из медиафайлов как референс
            ref = await fetch_one(
                """SELECT file_path FROM content_posts
                   WHERE channel_id = $1 AND file_path IS NOT NULL AND file_path <> ''
                     AND (file_type = 'photo' OR file_path ~* '\\.(png|jpe?g|webp)$')
                   ORDER BY id DESC LIMIT 1""",
                ch["id"],
            )
            if not ref:
                # Нет ни одного фото — не списываем токены за картинку и просим юзера добавить
                image_error = (
                    "В медиафайлах канала ещё нет фото. "
                    "Сначала добавьте хотя бы одно фото (раздел Контент → Мои файлы), "
                    "затем повторите задачу — ИИ возьмёт его как референс стиля."
                )
            else:
                try:
                    import base64 as _b64, os as _os, secrets as _sec
                    ref_path = ref["file_path"]
                    if not _os.path.isabs(ref_path):
                        ref_path = _os.path.join("/app", ref_path.lstrip("/"))
                    if _os.path.exists(ref_path):
                        with open(ref_path, "rb") as _rf:
                            photo_b64 = _b64.b64encode(_rf.read()).decode()
                    else:
                        photo_b64 = None

                    from .ai_openrouter import openrouter_image_gen, save_image_result
                    img_prompt = (
                        f"Иллюстрация к посту в канал на тему: «{image_topic}». "
                        "Высокое качество, без текста на картинке."
                    )
                    # openrouter_image_gen возвращает СТРОКУ (data URL или http URL)
                    img_url = await openrouter_image_gen(img_prompt, photo_b64)
                    if img_url and isinstance(img_url, str):
                        upload_dir = _os.environ.get("UPLOAD_DIR", "/app/uploads")
                        fname = f"ai_post_{_sec.token_hex(8)}.png"
                        fpath = _os.path.join(upload_dir, fname)
                        await save_image_result(img_url, fpath)
                        image_path = f"/uploads/{fname}"
                        try:
                            with open(fpath, "rb") as _f:
                                image_file_data = _f.read()
                        except Exception:
                            image_file_data = None
                    else:
                        image_error = "ИИ не вернул картинку"
                except Exception as e:
                    image_error = str(e)[:200]
                    print(f"[ai-assistant] image gen error: {e}")

        import json as _json
        buttons_list = []
        if with_comments:
            buttons_list.append({"type": "comments", "text": "Комментарии"})
        # Дополнительные кнопки от LLM — url/poll/lead_magnet
        for b in (args.get("buttons") or []):
            if not isinstance(b, dict):
                continue
            btype = (b.get("type") or "").strip()
            text = (b.get("text") or "").strip()
            if not btype or not text:
                continue
            if btype == "url" and b.get("url"):
                buttons_list.append({"type": "url", "text": text, "url": b["url"]})
            elif btype == "poll" and b.get("poll_id"):
                buttons_list.append({"type": "poll", "text": text, "poll_id": int(b["poll_id"])})
            elif btype == "lead_magnet" and b.get("lead_magnet_id"):
                buttons_list.append({"type": "lead_magnet", "text": text, "lead_magnet_id": int(b["lead_magnet_id"])})
        inline_buttons_json = _json.dumps(buttons_list, ensure_ascii=False) if buttons_list else None

        # Авто-прикрепление кнопки «Комментарии» если у канала включён тумблер
        from ..database import fetch_one as _fo
        from ..routes.content import _apply_auto_comments
        ch_settings = await _fo("SELECT comment_settings FROM channels WHERE id = $1", ch["id"])
        inline_buttons_json = _apply_auto_comments(
            inline_buttons_json,
            dict(ch_settings) if ch_settings else None,
        )

        from ..database import execute_returning_id
        post_id = await execute_returning_id(
            """INSERT INTO content_posts (channel_id, title, message_text, scheduled_at, status,
                                          file_path, file_type, file_data, attach_type, inline_buttons)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
            ch["id"], title, message_text or "(пусто, заполните в кабинете)",
            scheduled,
            "scheduled" if scheduled else "draft",
            image_path, "photo" if image_path else None, image_file_data, "photo" if image_path else None,
            inline_buttons_json,
        )
        link = "/content"
        # Время публикации в МСК для подсказки
        msk_time = (scheduled + timedelta(hours=3)).strftime("%d.%m %H:%M") if scheduled else ""
        msg = (f"Пост создан в канале «{ch['title']}» — запланирован на {msk_time} МСК. "
               "Перейдите в Контент → Список → Ожидание чтобы посмотреть / опубликовать сразу.")
        if with_image:
            if image_path:
                msg += " с картинкой"
            else:
                # Возвращаем юзеру 10 ИИт за невышедшую картинку
                try:
                    await execute(
                        "UPDATE users SET ai_tokens = ai_tokens + $1 WHERE id = $2",
                        IMAGE_GEN_COST, user_id,
                    )
                    await execute(
                        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
                        user_id, -IMAGE_GEN_COST, "ai_assistant_refund",
                        f"Refund {IMAGE_GEN_COST} (картинка не сгенерирована)",
                    )
                except Exception:
                    pass
                msg += f" (картинку сгенерировать не удалось: {image_error or '—'}; 10 ИИт возвращены)"
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
            {"role": "system", "content": (
                "Ты пишешь короткие живые посты для канала в MAX (мессенджер). "
                "600-1000 символов, без хэштегов. "
                "ВАЖНО: НЕ используй markdown — никаких **жирный**, *курсив*, "
                "`код` или __подчёркивание__. Пиши чистым текстом с эмодзи. "
                "Списки делай через тире или цифры, не через звёздочки."
            )},
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
