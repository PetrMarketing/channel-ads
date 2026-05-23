"""ИИ Контент — сессии генерации контент-плана через Claude/OpenRouter.

Phase 1: текстовая генерация постов.
Phase 2: фотобанк + генерация иллюстраций к постам (per-post + батч).
"""
import asyncio
import base64
import csv
import io
import json as json_mod
import os
import secrets
import time
from datetime import datetime, timedelta, date, timezone

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
    MOSCOW_TZ = ZoneInfo("Europe/Moscow")
except Exception:  # pragma: no cover — fallback на жёсткий +3
    MOSCOW_TZ = timezone(timedelta(hours=3))

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from typing import Any, Dict, Optional, List

from ..config import settings
from ..database import execute, execute_returning_id, fetch_all, fetch_one
from ..middleware.auth import get_current_user
from ..services.ai_openrouter import openrouter_chat, openrouter_image_gen, save_image_result

router = APIRouter()


# =============================================================================
# Phase 2 — стоимости (в ИИ-токенах)
# =============================================================================
TOKENS_PROMPT_GEN = 1
TOKENS_IMAGE_GEN = 10


# =============================================================================
# Прогресс батчевой генерации картинок (in-memory, per-process)
# =============================================================================
_BATCH_PROGRESS: Dict[int, Dict[str, Any]] = {}
# Прогресс per-post text generation. Frontend опрашивает /text-progress, при
# каждом инкременте generated подтягивает GET /session/{id} → новые посты
# проявляются в UI один за другим.
_TEXT_PROGRESS: Dict[int, Dict[str, Any]] = {}


# =============================================================================
# Контент-маркетинговый конспект (база знаний для системного промпта)
# =============================================================================
CONTENT_MARKETING_GUIDE = """\
КОНТЕНТ-МАРКЕТИНГ В МЕССЕНДЖЕР-КАНАЛАХ — РАБОЧИЙ КОНСПЕКТ.

1) КЛЮЧЕВОЙ ПРИНЦИП ПОСТА.
   1 пост = 1 мысль = 1 действие (CTA).
   Если в посте смешано две идеи — лучше разделить на два поста.
   Без CTA пост теряет смысл: всегда дай читателю простое следующее действие
   (написать, перейти по ссылке, оставить реакцию, ответить на опрос).

2) СТРУКТУРА ПОСТА (универсальная).
   - Цепляющее начало (вопрос, цифра, провокация, личная история).
   - Развитие (1–3 коротких смысловых блока, факты/доводы/детали).
   - Усиление (доказательство: кейс, цифра, цитата, скрин).
   - CTA (одна ясная фраза: «Напишите “+” в личку», «Жмите на кнопку», «Поставьте 🔥»).
   Длина: 200–1500 символов. Короткие абзацы (1–3 строки), пустые строки между блоками.

3) ФОРМУЛЫ КОПИРАЙТИНГА — выбирать под цель поста.
   AIDA: Внимание → Интерес → Желание → Действие. Для продающих и анонсов.
   PAS:  Боль → Усиление боли → Решение. Для прогревов и постов о проблеме клиента.
   ODS:  Оффер → Дедлайн → Призыв. Для распродаж, акций, ограниченных предложений.
   PMPHS: Боль → Больше боли → Надежда → Решение. Глубокие прогревы, истории трансформации.
   FAB:  Свойство → Преимущество → Выгода. Для постов о продукте/услуге.
   4U:   Useful · Urgent · Unique · Ultra-specific. Для заголовков и анонсов.

4) ПСИХОЛОГИЧЕСКИЕ ТРИГГЕРЫ (использовать аккуратно, не более 1–2 на пост).
   - Выгода (что получит человек).
   - Социальные доказательства (отзывы, кейсы, цифры, «уже 500 человек прошли»).
   - Авторитет (опыт автора, цифры роста, регалии).
   - Дефицит (осталось 3 места, акция до пятницы).
   - Срочность (только сегодня, дедлайн).
   - Страх упущенной выгоды (FOMO).
   - Любопытство (вопрос, недосказанность, «секрет, который…»).
   - Принадлежность («наш круг», «свои люди»).
   - Взаимность (бесплатная польза → потом продажа).
   - Простота / прозрачность (без сложных схем).

5) ТИПЫ КОНТЕНТА И ИХ РОЛЬ.
   - Продающий: оффер, кейс, разбор продукта, отзыв, демонстрация результата.
     Допустимо до ~80% постов в продающей нише, но без "впаривания".
     Каждый продающий пост должен закрывать конкретное возражение или давать пользу.
   - Прогревающий: личные истории, ценности, путь, философия, ошибки и инсайты.
     Создаёт доверие. Без них продажи не работают.
   - Активирующий (вовлечение): опросы, выбор «А или Б», провокации,
     просьбы поделиться мнением, чек-листы, мини-задания.
     Поднимают охваты и комментарии.

6) РУБРИКИ — ДЛЯ РАЗНООБРАЗИЯ И ПРИВЫЧКИ ЧИТАТЬ.
   Примеры рубрик: «Кейс недели», «Личное», «Разбор», «Мини-урок», «Чек-лист»,
   «Опрос», «Ошибка», «За кадром», «Цифры», «Антикейс», «Q&A», «Лайфхак»,
   «Подборка», «Мнение», «История клиента», «Сравнение», «Топ-5», «Мифы».
   На канал достаточно 5–8 живых рубрик с понятным форматом.

7) ЗАГОЛОВКИ И ПЕРВАЯ СТРОКА.
   Первая строка решает, дочитают ли пост. Использовать:
   - конкретику и цифры («3 ошибки», «за 7 дней»);
   - вопрос с интригой («Почему 9 из 10 каналов умирают за месяц?»);
   - провокацию («Контент-план — это вред»);
   - личную ноту («Вчера потерял клиента из-за одной фразы»).
   Не начинать с «Друзья!», «Привет всем!», «Хочу поделиться» — это слабо.

8) ЯЗЫК.
   - Простой, человеческий, как будто пишешь другу.
   - Без штампов: «инновационный», «команда профессионалов», «индивидуальный подход».
   - Без канцелярита: «осуществляем», «предоставляем услуги», «в кратчайшие сроки».
   - Глаголы в активе («помогу», «расскажу», «покажу»).
   - Конкретика вместо абстракции (не «много клиентов», а «47 заявок за неделю»).
   - Эмодзи — точечно, для акцентов и навигации, а не «гирляндой».

9) ВЁРСТКА ДЛЯ МЕССЕНДЖЕРА.
   - Короткие абзацы (1–3 строки).
   - Пустая строка между смысловыми блоками — обязательно.
   - Списки маркерами «—», «•» или эмодзи-маркерами (👉 ✅ 🔻).
   - Жирный (<b>) — на ключевые мысли и CTA, не «через слово».
   - Курсив (<i>) — для акцентов, цитат, мыслей вслух.
   - Перенос строки <br> там, где нужен ритм.
   - Один пост — один основной посыл, не «сборная солянка».

10) CTA — ПРИЗЫВЫ К ДЕЙСТВИЮ.
    Сильный CTA: глагол + конкретика + лёгкость.
    «Напишите “+” в личку и я скину разбор»
    «Жмите на кнопку — заберите чек-лист»
    «Голосуйте: Telegram или MAX?»
    Слабый CTA: «Подписывайтесь, делитесь, ставьте лайки» — ни о чём.
    1 пост — 1 CTA. Несколько CTA конкурируют между собой и снижают конверсию.

11) РИТМ КОНТЕНТ-ПЛАНА.
    На 30 дней рекомендуется чередование:
    - 40–50% полезного и прогревающего;
    - 30–40% продающего (оффер, кейс, разбор продукта);
    - 10–20% вовлекающего (опросы, дискуссии).
    Перед сильным продающим постом (оффер) ставь 1–2 прогрева на ту же тему.
    Между двумя продающими — обязательно один полезный/личный.

12) ПРОДАЖИ БЕЗ ВПАРИВАНИЯ.
    - Продаём решение, не продукт. Сначала боль клиента, потом продукт как ответ.
    - Показываем результат до/после, цифры, сроки.
    - Снимаем возражения заранее: «дорого», «у меня не получится», «нет времени».
    - Истории клиентов сильнее любого «купите».
    - Ограничение/дедлайн усиливает решение, но не должен звучать манипулятивно.

13) ЧАСТЫЕ ОШИБКИ.
    - Сразу продавать незнакомым — нужны прогревы.
    - Длинные «полотна» без структуры — никто не дочитает.
    - Сложные слова и термины без расшифровки.
    - Постоянное «я-я-я» вместо «вы получите / для вас».
    - Отсутствие CTA или сразу 3 CTA в одном посте.
    - Скучный заголовок («Новости», «Анонс», «Информация»).
    - Контент «обо всём» без чёткой темы канала.

14) ПРИЁМЫ ВОВЛЕЧЕНИЯ.
    - Вопрос в конце поста.
    - Опрос на 2–4 варианта.
    - Просьба поделиться опытом в комментариях.
    - «А или Б?» — выбор между двумя вариантами.
    - Чек-лист с просьбой отметить, что уже сделал.
    - Спор / провокация (с уважением, без токсичности).

15) ЭМОЦИОНАЛЬНЫЕ КРЮКИ.
    - Удивление: неожиданная цифра или факт.
    - Узнавание: «знакомая ситуация?».
    - Конфликт: «многие думают X, но на самом деле Y».
    - Облегчение: «оказывается, можно проще».
    - Вдохновение: история про преодоление.

ИТОГО: каждый пост проверяй по чек-листу:
1. Есть ли крючок в первой строке?
2. Понятна ли одна главная мысль?
3. Есть ли доказательство (кейс, цифра, опыт)?
4. Есть ли один чёткий CTA?
5. Соответствует ли длина и тон стилю канала?
"""


# =============================================================================
# Утилиты
# =============================================================================
SESSION_STATUS_DRAFT = "draft"
SESSION_STATUS_GENERATING = "generating"
SESSION_STATUS_GENERATED = "generated"
SESSION_STATUS_PUBLISHED = "published"


def calc_session_cost(posts_count: int, base_per_post: int = 10) -> int:
    """Стоимость пакета с линейной скидкой за объём.
    discount_factor: 1.0 при 15 постах → 0.5 при 60.
    Пример при base=10: 15→150, 30→250, 60→300.
    Пример при base=5 (макс уровень): 15→75, 60→150.
    """
    n = max(15, min(60, int(posts_count or 30)))
    base = max(1, int(base_per_post or 10))
    discount_factor = 1.0 - 0.5 * (n - 15) / 45  # 1.0 → 0.5
    total = int(round(base * n * discount_factor))
    return max(n, total)  # минимум 1 токен/пост


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


async def _get_owned_channel(tc: str, user_id: int):
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code=$1 AND user_id=$2 AND is_active=1",
        tc, user_id,
    )


async def _get_session(session_id: int, user_id: int, channel_id: int):
    return await fetch_one(
        "SELECT * FROM ai_content_sessions WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        session_id, user_id, channel_id,
    )


def _serialize_session(s: dict) -> dict:
    return {
        "id": s["id"],
        "channel_id": s["channel_id"],
        "topic": s.get("topic"),
        "goal_sales": s.get("goal_sales") or 0,
        "goal_warmup": s.get("goal_warmup") or 0,
        "goal_activity": s.get("goal_activity") or 0,
        "style_source": s.get("style_source"),
        "style_text": s.get("style_text"),
        "products": _parse_json_field(s.get("products")) or [],
        "posts_count": s.get("posts_count") or 30,
        "first_post_time": s.get("first_post_time"),
        "second_post_time": s.get("second_post_time"),
        "start_date": s["start_date"].isoformat() if s.get("start_date") else None,
        "status": s.get("status"),
        "tokens_charged": s.get("tokens_charged") or 0,
        "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
        "last_image_palette": _parse_json_field(s.get("last_image_palette")) or [],
    }


def _serialize_post(p: dict) -> dict:
    file_path = p.get("file_path")
    file_url = None
    if file_path:
        # Convert /var/.../uploads/xxx → /uploads/xxx
        try:
            file_url = "/uploads/" + os.path.basename(file_path)
        except Exception:
            file_url = None
    return {
        "id": p["id"],
        "session_id": p["session_id"],
        "sort_order": p.get("sort_order"),
        "title": p.get("title"),
        "message_text": p.get("message_text"),
        "cta": p.get("cta"),
        "goal_type": p.get("goal_type"),
        "rubric": p.get("rubric"),
        "scheduled_at": p["scheduled_at"].isoformat() if p.get("scheduled_at") else None,
        "inline_buttons": _parse_json_field(p.get("inline_buttons")),
        "attach_type": p.get("attach_type"),
        "file_path": file_path,
        "file_url": file_url,
        "file_type": p.get("file_type"),
        "published_post_id": p.get("published_post_id"),
        # Phase 2 — изображение
        "generated_image_url": p.get("generated_image_url"),
        "generated_image_prompt": p.get("generated_image_prompt"),
        "generated_image_mode": p.get("generated_image_mode"),
        "generated_image_format": p.get("generated_image_format"),
        "generated_image_palette": _parse_json_field(p.get("generated_image_palette")),
    }


# =============================================================================
# Роуты — список сессий и создание
# =============================================================================
@router.get("/{tc}/cost")
async def get_cost(tc: str, posts_count: int = 30, user: Dict[str, Any] = Depends(get_current_user)):
    """Подсчёт стоимости генерации для произвольного количества постов."""
    cost = calc_session_cost(posts_count)
    per_post = round(cost / max(1, posts_count), 1)
    return {"success": True, "posts_count": posts_count, "tokens": cost, "per_post": per_post}


@router.get("/{tc}/sessions")
async def list_sessions(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    rows = await fetch_all(
        """SELECT s.id, s.topic, s.posts_count, s.status, s.tokens_charged, s.created_at,
                  s.goal_sales, s.goal_warmup, s.goal_activity,
                  COALESCE((SELECT COUNT(*) FROM ai_content_session_posts WHERE session_id=s.id),0) AS post_count
           FROM ai_content_sessions s
           WHERE s.user_id=$1 AND s.channel_id=$2
           ORDER BY s.created_at DESC LIMIT 30""",
        user["id"], channel["id"],
    )
    return {
        "success": True,
        "sessions": [
            {
                "id": r["id"],
                "topic": r.get("topic"),
                "posts_count": r.get("posts_count") or 0,
                "status": r.get("status"),
                "tokens_charged": r.get("tokens_charged") or 0,
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "post_count": r.get("post_count") or 0,
                "goal_sales": r.get("goal_sales") or 0,
                "goal_warmup": r.get("goal_warmup") or 0,
                "goal_activity": r.get("goal_activity") or 0,
            }
            for r in rows
        ],
    }


@router.post("/{tc}/session")
async def create_session(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Создаёт пустую сессию (без списания токенов — оно при /generate)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    tomorrow = (datetime.now(timezone.utc).date() + timedelta(days=1))
    session_id = await execute_returning_id(
        """INSERT INTO ai_content_sessions
           (user_id, channel_id, posts_count, first_post_time, second_post_time, start_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id""",
        user["id"], channel["id"], 30, "10:00", "19:00", tomorrow,
    )
    return {"success": True, "session_id": session_id}


@router.get("/{tc}/session/{session_id}")
async def get_session(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    posts = await fetch_all(
        "SELECT * FROM ai_content_session_posts WHERE session_id=$1 ORDER BY sort_order, id",
        session_id,
    )
    return {
        "success": True,
        "session": _serialize_session(session),
        "posts": [_serialize_post(p) for p in posts],
    }


# =============================================================================
# Бриф / стиль / продукты / расписание
# =============================================================================
@router.put("/{tc}/session/{session_id}/brief")
async def save_brief(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    body = await request.json()
    topic = (body.get("topic") or "").strip()
    g_sales = int(body.get("goal_sales") or 0)
    g_warmup = int(body.get("goal_warmup") or 0)
    g_activity = int(body.get("goal_activity") or 0)
    posts_count = int(body.get("posts_count") or 30)
    first_time = (body.get("first_post_time") or "10:00").strip()
    second_time = (body.get("second_post_time") or "").strip() or None
    start_str = body.get("start_date")

    if not topic:
        raise HTTPException(status_code=400, detail="Укажите тематику канала")
    for v, name in ((g_sales, "Продажи"), (g_warmup, "Прогрев"), (g_activity, "Активность")):
        if v < 0 or v > 100 or v % 10 != 0:
            raise HTTPException(status_code=400, detail=f"{name}: значение должно быть от 0 до 100 с шагом 10")
    if g_sales + g_warmup + g_activity != 100:
        raise HTTPException(status_code=400, detail="Сумма целей должна быть ровно 100%")
    if posts_count < 15 or posts_count > 60:
        raise HTTPException(status_code=400, detail="Количество постов: от 15 до 60")

    start_date = None
    if start_str:
        try:
            start_date = datetime.strptime(start_str, "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=400, detail="Неверный формат даты")

    await execute(
        """UPDATE ai_content_sessions
           SET topic=$1, goal_sales=$2, goal_warmup=$3, goal_activity=$4,
               posts_count=$5, first_post_time=$6, second_post_time=$7, start_date=$8,
               updated_at=NOW()
           WHERE id=$9""",
        topic, g_sales, g_warmup, g_activity, posts_count,
        first_time, second_time, start_date, session_id,
    )
    return {"success": True}


@router.put("/{tc}/session/{session_id}/style")
async def save_style(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    body = await request.json()
    source = (body.get("source") or "text").strip()
    text = (body.get("text") or "").strip()

    if source == "existing":
        rows = await fetch_all(
            """SELECT message_text FROM content_posts
               WHERE channel_id=$1 AND message_text IS NOT NULL AND message_text<>''
               ORDER BY COALESCE(published_at, scheduled_at, created_at) DESC LIMIT 30""",
            channel["id"],
        )
        if not rows:
            raise HTTPException(status_code=400, detail="В канале нет опубликованных постов для анализа")
        text = "\n\n---\n\n".join((r.get("message_text") or "") for r in rows)
    elif source == "text":
        if not text:
            raise HTTPException(status_code=400, detail="Вставьте текст-образец")
    else:
        # 'file' источник обрабатывается отдельным эндпоинтом
        if not text:
            raise HTTPException(status_code=400, detail="Источник 'file' — загрузите файл через /style-file")

    text = text[:10000]
    await execute(
        "UPDATE ai_content_sessions SET style_source=$1, style_text=$2, updated_at=NOW() WHERE id=$3",
        source, text, session_id,
    )
    return {"success": True, "chars": len(text)}


@router.post("/{tc}/session/{session_id}/style-file")
async def upload_style_file(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 5 МБ)")

    fname = (file.filename or "style.txt").lower()
    text = ""

    if fname.endswith(".docx"):
        try:
            import docx  # python-docx — опциональная зависимость
            bio = io.BytesIO(raw)
            doc = docx.Document(bio)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="Поддержка .docx не настроена. Используйте .txt/.md или вставьте текст вручную.",
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Не удалось прочитать .docx: {e}")
    else:
        text = raw.decode("utf-8", errors="ignore")

    text = text[:10000]
    if not text.strip():
        raise HTTPException(status_code=400, detail="Не удалось извлечь текст из файла")

    # Сохраняем сам файл — на всякий случай
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    saved_name = f"ai_content_style_{secrets.token_hex(8)}_{os.path.basename(fname)}"
    saved_path = os.path.join(settings.UPLOAD_DIR, saved_name)
    with open(saved_path, "wb") as f:
        f.write(raw)

    await execute(
        """UPDATE ai_content_sessions
           SET style_source='file', style_text=$1, style_file_path=$2, updated_at=NOW()
           WHERE id=$3""",
        text, saved_path, session_id,
    )
    return {"success": True, "chars": len(text)}


@router.put("/{tc}/session/{session_id}/products")
async def save_products(tc: str, session_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    body = await request.json()
    raw_items = body.get("products") or []
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="products должен быть списком")

    items = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip()
        if not name:
            continue
        items.append({
            "name": name[:200],
            "description": (it.get("description") or "").strip()[:1000],
            "price": str(it.get("price") or "")[:60],
        })

    await execute(
        "UPDATE ai_content_sessions SET products=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(items, ensure_ascii=False), session_id,
    )
    return {"success": True, "count": len(items)}


@router.post("/{tc}/session/{session_id}/products-file")
async def upload_products_file(
    tc: str, session_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 2 МБ)")

    text = raw.decode("utf-8", errors="ignore")
    items = []
    try:
        # Пробуем определить разделитель: запятая или точка с запятой
        sample = text[:1024]
        delim = ";" if sample.count(";") > sample.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=delim)
        for i, row in enumerate(reader):
            if not row:
                continue
            # Пропускаем header если первая строка содержит "name" или "название"
            if i == 0 and any(("name" in (c or "").lower() or "назван" in (c or "").lower()) for c in row):
                continue
            name = (row[0] or "").strip() if len(row) > 0 else ""
            if not name:
                continue
            description = (row[1] or "").strip() if len(row) > 1 else ""
            price = (row[2] or "").strip() if len(row) > 2 else ""
            items.append({
                "name": name[:200],
                "description": description[:1000],
                "price": price[:60],
            })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось разобрать CSV: {e}")

    await execute(
        "UPDATE ai_content_sessions SET products=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(items, ensure_ascii=False), session_id,
    )
    return {"success": True, "count": len(items), "products": items}


# =============================================================================
# Генерация
# =============================================================================
def _build_user_prompt(session: dict) -> str:
    products = _parse_json_field(session.get("products")) or []
    if products:
        products_block = "\n".join(
            f"- {p.get('name', '')} — {p.get('description', '')} (цена: {p.get('price', 'не указана')})"
            for p in products
        )
    else:
        products_block = "нет"

    style_text = (session.get("style_text") or "")[:8000]
    posts_count = int(session.get("posts_count") or 30)

    sched_hint = (
        f"всего {posts_count} постов на 30 дней, "
        f"с двумя постами в день если posts_count > 30"
    )

    return f"""\
Сгенерируй контент-план для канала в национальном мессенджере MAX.

ТЕМАТИКА КАНАЛА: {session.get('topic') or ''}

РАСПРЕДЕЛЕНИЕ ЦЕЛЕЙ КОНТЕНТА:
- Продажи: {session.get('goal_sales') or 0}%
- Прогрев: {session.get('goal_warmup') or 0}%
- Активность (вовлечение): {session.get('goal_activity') or 0}%

КОЛИЧЕСТВО ПОСТОВ: {posts_count}

СТИЛЬ ПОСТОВ (ориентируйся на этот стиль письма, тональность, длину, форматирование):
---
{style_text}
---

ПРОДУКТЫ/УСЛУГИ (если есть продающие посты):
{products_block}

Верни СТРОГО JSON-массив без markdown-обёрток:
[
  {{
    "title": "Краткий заголовок поста (для админки, не для публикации)",
    "message_text": "Полный текст поста (HTML-форматирование разрешено: <b>, <i>, <br>, эмодзи). 200-1500 символов. С CTA в конце.",
    "goal_type": "sales | warmup | activity",
    "rubric": "Название рубрики (например: 'Кейс', 'Лайфхак', 'Опрос', 'Личное')",
    "cta": "Что сделать в конце поста (1 фраза)",
    "scheduled_offset_days": 0
  }}
]

Распредели posts по дням: {sched_hint}.
scheduled_offset_days от 0 (день старта) до 29 (через месяц).
Соблюдай заданное распределение целей (продажи/прогрев/активность) ±5%.
"""


def _build_system_prompt() -> str:
    return f"""\
Ты — эксперт по контент-маркетингу. Используй приведённый ниже конспект как
базу знаний при генерации контент-плана. Соблюдай:
- 1 пост = 1 мысль = 1 призыв к действию (CTA)
- Используй формулы AIDA / PAS / ODS / PMPHS где уместно
- Учитывай психологические триггеры (выгода, доказательства, страх, дефицит и т.д.)
- 80% продающего контента может быть, но не впаривающего
- Простой человеческий язык, без штампов

КОНСПЕКТ КОНТЕНТ-МАРКЕТИНГА:
{CONTENT_MARKETING_GUIDE}
"""


def _build_user_prompt_single(
    session: dict, post_index: int, total: int,
    prior_outlines: list, day_offset: int, slot_idx: int, posts_per_day: int,
) -> str:
    """Промпт для генерации ОДНОГО поста с контекстом уже созданных. Используется
    в стримовой per-post генерации — каждый пост строится отдельно, чтобы
    модель не упиралась в context window и фронт мог показать его сразу."""
    products = _parse_json_field(session.get("products")) or []
    if products:
        products_block = "\n".join(
            f"- {p.get('name', '')} — {p.get('description', '')} (цена: {p.get('price', 'не указана')})"
            for p in products
        )
    else:
        products_block = "нет"

    style_text = (session.get("style_text") or "")[:8000]

    if prior_outlines:
        prior_block = "\n".join(
            f"#{i+1}. [{(p.get('goal_type') or '?').upper()}] {p.get('rubric') or '-'}: {p.get('title') or '(без названия)'}"
            for i, p in enumerate(prior_outlines)
        )
    else:
        prior_block = "(пока ничего не сгенерировано — это самый первый пост)"

    return f"""\
Сгенерируй ОДИН пост для контент-плана канала в национальном мессенджере MAX.

ТЕМАТИКА КАНАЛА: {session.get('topic') or ''}

РАСПРЕДЕЛЕНИЕ ЦЕЛЕЙ КОНТЕНТА (общий план):
- Продажи: {session.get('goal_sales') or 0}%
- Прогрев: {session.get('goal_warmup') or 0}%
- Активность: {session.get('goal_activity') or 0}%

СТИЛЬ ПОСТОВ:
---
{style_text}
---

ПРОДУКТЫ/УСЛУГИ:
{products_block}

ВСЕГО В ПЛАНЕ: {total} постов. Этот — №{post_index + 1}.
ДЕНЬ: +{day_offset} от старта. Слот в дне: {slot_idx + 1} из {posts_per_day}.

УЖЕ СОЗДАНЫ ПОСТЫ В ЭТОМ ПЛАНЕ:
{prior_block}

Не повторяй темы и формулировки уже созданных постов — вноси разнообразие
рубрик и подходов. Соблюдай заданное распределение целей в общем плане
(посмотри уже созданные и подбери goal_type так, чтобы общий баланс
выдерживался).

Верни СТРОГО ОДИН JSON-объект (БЕЗ массива, БЕЗ markdown-обёрток):
{{
  "title": "Краткий заголовок для админки (не для публикации)",
  "message_text": "Полный текст поста, 200-1500 символов, HTML разрешён (<b>, <i>, <br>, эмодзи). С CTA в конце.",
  "goal_type": "sales | warmup | activity",
  "rubric": "Название рубрики (Кейс, Лайфхак, Опрос, Личное и т.п.)",
  "cta": "Что сделать в конце (1 фраза)"
}}
"""


def _parse_one_post(content: str) -> Optional[dict]:
    """Извлекает одиночный JSON-объект из ответа модели."""
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)
        text = text[1] if len(text) > 1 else ""
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        v = json_mod.loads(text[start : end + 1])
        return v if isinstance(v, dict) else None
    except Exception:
        return None


def _parse_generated_posts(content: str) -> list:
    """Извлекает JSON-массив из ответа модели."""
    if not content:
        return []
    text = content.strip()
    # Если вокруг markdown-обёртка ```json ... ```
    if text.startswith("```"):
        text = text.split("```", 2)
        text = text[1] if len(text) > 1 else ""
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        return json_mod.loads(text[start : end + 1])
    except Exception:
        return []


def _compute_scheduled_at(start_date: date, offset_days: int, slot_idx: int,
                          first_time: str, second_time: Optional[str]) -> Optional[datetime]:
    """Возвращает offset-aware datetime в UTC.

    Время `first_time` / `second_time` пользователь задаёт в МСК (Europe/Moscow).
    asyncpg хранит TIMESTAMPTZ корректно только если datetime — aware. Раньше мы
    отдавали naive — Postgres трактовал его как UTC, и фронт прибавлял +3 часа.
    """
    if not start_date:
        return None
    try:
        ttxt = first_time if (slot_idx == 0 or not second_time) else second_time
        hh, mm = ttxt.split(":")
        d = start_date + timedelta(days=int(offset_days or 0))
        local_dt = datetime(d.year, d.month, d.day, int(hh), int(mm), tzinfo=MOSCOW_TZ)
        return local_dt.astimezone(timezone.utc)
    except Exception:
        return None


@router.post("/{tc}/session/{session_id}/generate")
async def generate_posts(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Per-post fire-and-forget генерация. Возвращается за <1с со стартовым
    статусом, реальные посты появляются по мере готовности — фронт опрашивает
    /text-progress и подгружает session при инкременте."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    # Idempotency guard — если генерация для этой сессии уже идёт, не запускаем
    # второй раннер (двойной клик / retry привели бы к двойным списаниям).
    existing_tp = _TEXT_PROGRESS.get(session_id)
    if existing_tp and existing_tp.get("in_progress"):
        return {
            "success": True,
            "in_progress": True,
            "total": existing_tp.get("total", 0),
            "already_running": True,
        }

    if not session.get("topic"):
        raise HTTPException(status_code=400, detail="Заполните бриф (тематика канала)")
    if (session.get("goal_sales") or 0) + (session.get("goal_warmup") or 0) + (session.get("goal_activity") or 0) != 100:
        raise HTTPException(status_code=400, detail="Сумма целей должна быть 100%")
    if not (session.get("style_text") or "").strip():
        raise HTTPException(status_code=400, detail="Загрузите образец стиля постов")

    posts_count = int(session.get("posts_count") or 30)
    # Динамическая цена: базовая стоимость поста с уровня (skill='text'),
    # дальше — скидка за объём через calc_session_cost.
    from ..services.channel_levels import skill_cost as _skill_cost, track_skill as _track_skill
    base_per_post = await _skill_cost(channel["id"], "text")
    total_cost = calc_session_cost(posts_count, base_per_post)
    cost_per_post = max(1, (total_cost + posts_count - 1) // posts_count)

    # Pre-check баланса на полную стоимость, но списание per-success в раннере.
    u = await fetch_one("SELECT ai_tokens FROM users WHERE id=$1", user["id"])
    if not u or (u["ai_tokens"] or 0) < total_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Недостаточно ИИ токенов. Нужно {total_cost}, у вас {u['ai_tokens'] if u else 0}",
        )

    await execute(
        "UPDATE ai_content_sessions SET status='generating', tokens_charged=0, updated_at=NOW() WHERE id=$1",
        session_id,
    )

    # Чистим старые посты (если повторная генерация)
    await execute("DELETE FROM ai_content_session_posts WHERE session_id=$1", session_id)

    # Распределение по дням (как в старом коде, но детерминированно).
    posts_per_day = max(1, (posts_count + 29) // 30)
    start_date = session.get("start_date")
    first_time = session.get("first_post_time") or "10:00"
    second_time = session.get("second_post_time") or None

    system_prompt = _build_system_prompt()
    channel_label = channel.get("title") or channel.get("id")

    _TEXT_PROGRESS[session_id] = {
        "total": posts_count,
        "generated": 0,
        "failed": 0,
        "tokens_charged": 0,
        "in_progress": True,
        "started_at": time.time(),
    }

    async def _runner():
        prior_outlines: list = []
        gen_count = 0
        fail_count = 0
        charged_total = 0
        try:
            for i in range(posts_count):
                day_offset = min(29, i // posts_per_day)
                slot_idx = i % posts_per_day
                user_prompt = _build_user_prompt_single(
                    session, i, posts_count, prior_outlines,
                    day_offset, slot_idx, posts_per_day,
                )
                full_prompt = system_prompt + "\n\n" + user_prompt
                try:
                    content = await openrouter_chat(full_prompt, model="anthropic/claude-sonnet-4")
                    item = _parse_one_post(content)
                    if not item or not (item.get("message_text") or "").strip():
                        raise RuntimeError("Невалидный или пустой ответ модели")
                    sched_at = _compute_scheduled_at(start_date, day_offset, slot_idx, first_time, second_time)
                    await execute_returning_id(
                        """INSERT INTO ai_content_session_posts
                           (session_id, sort_order, title, message_text, cta, goal_type, rubric, scheduled_at)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id""",
                        session_id, i,
                        (item.get("title") or "")[:300],
                        item.get("message_text") or "",
                        (item.get("cta") or "")[:300],
                        (item.get("goal_type") or "")[:20],
                        (item.get("rubric") or "")[:100],
                        sched_at,
                    )
                    await _charge_tokens(
                        user["id"], cost_per_post, "ai_content_post",
                        f"Пост #{i+1}/{posts_count} для канала {channel_label}",
                    )
                    try:
                        await _track_skill(channel["id"], "text", 1)
                    except Exception as te:
                        print(f"[Levels] track text skip: {te}")
                    try:
                        from ..services.achievements import track_event as _ach_track
                        await _ach_track(channel["id"], "ai_text", 1)
                    except Exception as ae:
                        print(f"[Achievements] track text skip: {ae}")
                    charged_total += cost_per_post
                    gen_count += 1
                    prior_outlines.append({
                        "title": item.get("title"),
                        "rubric": item.get("rubric"),
                        "goal_type": item.get("goal_type"),
                    })
                except Exception as e:
                    fail_count += 1
                    print(f"[ai-content] post {i+1}/{posts_count} failed sid={session_id}: {type(e).__name__}: {e}")
                # Обновляем прогресс после каждого поста (успех/неудача)
                bp = _TEXT_PROGRESS.get(session_id)
                if bp is not None:
                    bp["generated"] = gen_count
                    bp["failed"] = fail_count
                    bp["tokens_charged"] = charged_total
        except Exception as e:
            print(f"[ai-content] text runner exception sid={session_id}: {type(e).__name__}: {e}")
        finally:
            try:
                final_status = "generated" if gen_count > 0 else "draft"
                await execute(
                    "UPDATE ai_content_sessions SET status=$1, tokens_charged=$2, updated_at=NOW() WHERE id=$3",
                    final_status, charged_total, session_id,
                )
            except Exception as e:
                print(f"[ai-content] final status save failed sid={session_id}: {e}")
            bp = _TEXT_PROGRESS.get(session_id)
            if bp is not None:
                bp["in_progress"] = False
                bp["generated"] = gen_count
                bp["failed"] = fail_count
                bp["tokens_charged"] = charged_total

    asyncio.create_task(_runner())

    return {
        "success": True,
        "in_progress": True,
        "total": posts_count,
    }


@router.get("/{tc}/session/{session_id}/text-progress")
async def get_text_progress(
    tc: str, session_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Опрос прогресса per-post text generation. Frontend читает каждые 1.5с
    и при инкременте generated подтягивает GET /session/{id} для рендера."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    progress = _TEXT_PROGRESS.get(session_id)
    if not progress:
        return {
            "success": True,
            "in_progress": False,
            "total": 0,
            "generated": 0,
            "failed": 0,
            "tokens_charged": 0,
        }
    return {"success": True, **progress}


# =============================================================================
# Редактирование сгенерированных постов
# =============================================================================
def _parse_dt(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        s = val
        if s.endswith("Z"):
            s = s[:-1]
        if "." in s:
            s = s.split(".")[0]
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
    return None


@router.put("/{tc}/session/{session_id}/post/{post_id}")
async def update_session_post(
    tc: str, session_id: int, post_id: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    body = await request.json()

    fields, params = [], []
    idx = 1
    for key in ("title", "message_text", "cta", "goal_type", "rubric", "scheduled_at", "attach_type", "inline_buttons"):
        if key in body:
            val = body[key]
            if key == "scheduled_at":
                val = _parse_dt(val)
            elif key == "inline_buttons" and val is not None:
                val = json_mod.dumps(val) if not isinstance(val, str) else val
            fields.append(f"{key}=${idx}")
            params.append(val)
            idx += 1
    if not fields:
        return {"success": True}
    params.extend([post_id, session_id])
    await execute(
        f"UPDATE ai_content_session_posts SET {', '.join(fields)}, updated_at=NOW() WHERE id=${idx} AND session_id=${idx+1}",
        *params,
    )
    post = await fetch_one("SELECT * FROM ai_content_session_posts WHERE id=$1", post_id)
    return {"success": True, "post": _serialize_post(post)}


@router.post("/{tc}/session/{session_id}/post/{post_id}/file")
async def upload_post_file(
    tc: str, session_id: int, post_id: int,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    from ..services.file_storage import save_upload
    path, ftype, fdata = await save_upload(file)
    await execute(
        """UPDATE ai_content_session_posts
           SET file_path=$1, file_type=$2, file_data=$3, updated_at=NOW()
           WHERE id=$4 AND session_id=$5""",
        path, ftype, fdata, post_id, session_id,
    )
    return {"success": True, "file_type": ftype}


@router.delete("/{tc}/session/{session_id}/post/{post_id}")
async def delete_session_post(
    tc: str, session_id: int, post_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    await execute(
        "DELETE FROM ai_content_session_posts WHERE id=$1 AND session_id=$2",
        post_id, session_id,
    )
    return {"success": True}


# =============================================================================
# Конвертация в content_posts (планирование/публикация)
# =============================================================================
async def _convert_to_content_post(channel_id: int, p: dict, status: str) -> int:
    """Создаёт строку в content_posts на основании поста сессии.

    ai_content_session_posts.scheduled_at — TIMESTAMPTZ (offset-aware, в UTC),
    content_posts.scheduled_at — TIMESTAMP без TZ (naive UTC, scheduler сравнивает
    с NOW()). Поэтому приводим к naive-UTC: убираем tzinfo после astimezone(UTC).
    """
    inline_buttons = p.get("inline_buttons")
    if inline_buttons is not None and not isinstance(inline_buttons, str):
        inline_buttons = json_mod.dumps(inline_buttons)

    sched = p.get("scheduled_at")
    if isinstance(sched, datetime) and sched.tzinfo is not None:
        sched = sched.astimezone(timezone.utc).replace(tzinfo=None)

    new_post_id = await execute_returning_id(
        """INSERT INTO content_posts
           (channel_id, title, message_text, scheduled_at, inline_buttons, status,
            file_path, file_type, file_data, attach_type, ai_generated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) RETURNING id""",
        channel_id,
        p.get("title") or "Публикация",
        p.get("message_text") or "",
        sched,
        inline_buttons,
        status,
        p.get("file_path"),
        p.get("file_type"),
        p.get("file_data"),
        p.get("attach_type"),
    )
    return new_post_id


@router.post("/{tc}/session/{session_id}/post/{post_id}/publish")
async def publish_session_post(
    tc: str, session_id: int, post_id: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Конвертирует пост сессии в content_posts.

    Body: { "now": true } — мгновенная публикация. Иначе — запланированная.
    """
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    try:
        body = await request.json()
    except Exception:
        body = {}
    publish_now = bool(body.get("now"))

    p = await fetch_one("SELECT * FROM ai_content_session_posts WHERE id=$1 AND session_id=$2", post_id, session_id)
    if not p:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if p.get("published_post_id"):
        raise HTTPException(status_code=400, detail="Пост уже добавлен в Публикации")

    status = "draft" if publish_now else ("scheduled" if p.get("scheduled_at") else "draft")
    new_id = await _convert_to_content_post(channel["id"], dict(p), status)

    await execute(
        "UPDATE ai_content_session_posts SET published_post_id=$1, updated_at=NOW() WHERE id=$2",
        new_id, post_id,
    )

    if publish_now:
        # Используем тот же endpoint что и обычная публикация
        from .content import publish_post as _publish
        try:
            res = await _publish(tc, new_id, user)
            return {"success": True, "content_post_id": new_id, "published": True, "result": res}
        except Exception as e:
            return {"success": True, "content_post_id": new_id, "published": False, "error": str(e)}

    return {"success": True, "content_post_id": new_id, "published": False}


@router.post("/{tc}/session/{session_id}/publish-all")
async def publish_all(tc: str, session_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Конвертирует все непереданные посты сессии в запланированные content_posts."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(session_id, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    rows = await fetch_all(
        "SELECT * FROM ai_content_session_posts WHERE session_id=$1 AND published_post_id IS NULL ORDER BY sort_order, id",
        session_id,
    )
    count = 0
    for p in rows:
        d = dict(p)
        status = "scheduled" if d.get("scheduled_at") else "draft"
        new_id = await _convert_to_content_post(channel["id"], d, status)
        await execute(
            "UPDATE ai_content_session_posts SET published_post_id=$1, updated_at=NOW() WHERE id=$2",
            new_id, p["id"],
        )
        count += 1

    await execute(
        "UPDATE ai_content_sessions SET status='published', updated_at=NOW() WHERE id=$1",
        session_id,
    )
    # Достижение «ИИ Контент сессии» — за каждый publish-all (если что-то выложили).
    if count > 0:
        try:
            from ..services.achievements import track_event
            await track_event(int(channel["id"]), "ai_content_session", 1)
        except Exception as e:
            print(f"[Achievements] track ai_content_session skip: {e}")
    return {"success": True, "count": count}


# =============================================================================
# Phase 2 — Фотобанк
# =============================================================================
def _photo_url_from_path(path: str) -> str:
    if not path:
        return ""
    return "/uploads/" + os.path.basename(path)


def _serialize_photo(p: dict) -> dict:
    return {
        "id": p["id"],
        "file_path": p.get("file_path"),
        "file_url": p.get("file_url") or _photo_url_from_path(p.get("file_path") or ""),
        "description": p.get("description") or "",
        "created_at": p["created_at"].isoformat() if p.get("created_at") else None,
    }


@router.get("/{tc}/photos")
async def list_photos(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Список фото из фотобанка для канала."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = await fetch_all(
        """SELECT * FROM ai_content_photos
           WHERE user_id=$1 AND channel_id=$2
           ORDER BY created_at DESC""",
        user["id"], channel["id"],
    )
    return {"success": True, "photos": [_serialize_photo(r) for r in rows]}


@router.post("/{tc}/photos")
async def upload_photo(
    tc: str,
    file: UploadFile = File(...),
    description: str = Form(""),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Загрузка фото в фотобанк (multipart: file + description)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 10 МБ)")

    ct = (file.content_type or "").lower()
    if ct and not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Разрешены только изображения")

    ext = os.path.splitext(file.filename or "img.png")[1].lower() or ".png"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        ext = ".png"

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    fname = f"ai_content_photo_{secrets.token_hex(10)}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(raw)

    file_url = f"/uploads/{fname}"
    photo_id = await execute_returning_id(
        """INSERT INTO ai_content_photos (user_id, channel_id, file_path, file_url, description)
           VALUES ($1,$2,$3,$4,$5) RETURNING id""",
        user["id"], channel["id"], path, file_url, (description or "")[:500],
    )
    row = await fetch_one("SELECT * FROM ai_content_photos WHERE id=$1", photo_id)
    return {"success": True, "photo": _serialize_photo(row)}


@router.put("/{tc}/photos/{photo_id}")
async def update_photo(
    tc: str, photo_id: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Обновить описание фото."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    photo = await fetch_one(
        "SELECT * FROM ai_content_photos WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        photo_id, user["id"], channel["id"],
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    body = await request.json()
    description = (body.get("description") or "")[:500]
    await execute(
        "UPDATE ai_content_photos SET description=$1 WHERE id=$2",
        description, photo_id,
    )
    row = await fetch_one("SELECT * FROM ai_content_photos WHERE id=$1", photo_id)
    return {"success": True, "photo": _serialize_photo(row)}


@router.delete("/{tc}/photos/{photo_id}")
async def delete_photo(
    tc: str, photo_id: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Удалить фото из фотобанка (и файл)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    photo = await fetch_one(
        "SELECT * FROM ai_content_photos WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        photo_id, user["id"], channel["id"],
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    fp = photo.get("file_path")
    if fp and os.path.exists(fp):
        try:
            os.unlink(fp)
        except Exception:
            pass
    await execute("DELETE FROM ai_content_photos WHERE id=$1", photo_id)
    return {"success": True}


# =============================================================================
# Phase 2 — Генерация промпта и изображения для поста
# =============================================================================
def _format_palette(palette) -> str:
    if not palette:
        return ""
    if isinstance(palette, str):
        try:
            palette = json_mod.loads(palette)
        except Exception:
            return ""
    if not isinstance(palette, list):
        return ""
    return ", ".join(str(c) for c in palette if c)


async def _charge_tokens(user_id: int, amount: int, action: str, description: str):
    """Списывает токены атомарно. Бросает 402 если недостаточно."""
    from ..database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            cur = await conn.fetchrow("SELECT ai_tokens FROM users WHERE id=$1 FOR UPDATE", user_id)
            if not cur or (cur["ai_tokens"] or 0) < amount:
                raise HTTPException(
                    status_code=402,
                    detail=f"Недостаточно ИИ токенов. Нужно {amount}, у вас {cur['ai_tokens'] if cur else 0}",
                )
            await conn.execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id=$2", amount, user_id)
            await conn.execute(
                "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
                user_id, amount, action, description,
            )


async def _refund_tokens(user_id: int, amount: int, reason: str):
    if amount <= 0:
        return
    await execute("UPDATE users SET ai_tokens = ai_tokens + $1 WHERE id=$2", amount, user_id)
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user_id, -amount, "ai_content_refund", reason,
    )


async def _build_image_prompt(
    post_text: str,
    mode: str,
    palette: List[str],
    photo_description: Optional[str],
    image_format: str,
) -> str:
    """Зовёт Claude и получает text prompt для image-модели. Дефолт —
    hyperrealistic фотография в указанной палитре, без надписей; если по
    смыслу нужны надписи — только кириллица."""
    palette_block = _format_palette(palette) or "не задана"
    photo_block = (photo_description or "не задано")[:300] if mode in ("photo", "collage") else "не используется"
    fmt = image_format or "1:1"

    mode_hint = {
        "text": (
            "Hyperrealistic photographic SCENE that literally depicts the topic "
            "of the post (real people or objects performing the activity, real "
            "environment) — NOT an abstract metaphor, NOT graphic design, NOT a "
            "conceptual icon. Treat the post as a brief and stage a photo shoot."
        ),
        "photo": (
            f"Hyperrealistic photo using this reference photo as subject "
            f"description: «{photo_block}». The same person/object appears in a "
            f"new scene that matches the post topic."
        ),
        "collage": (
            f"Photographic collage composed of multiple realistic shots "
            f"({photo_block}). Cohesive lighting and palette across panels."
        ),
    }.get(mode, "Hyperrealistic photographic scene illustrating the post topic")

    sys_prompt = (
        "You are a senior art director crafting prompts for a top-tier image "
        "generation model (Midjourney / Imagen / Flux quality).\n\n"
        "OUTPUT REQUIREMENTS:\n"
        "- Return ONE prompt in English, 90–160 words, no preface, no markdown.\n"
        "- Default style is HYPERREALISTIC PHOTOGRAPHY — real human skin texture, "
        "  natural lighting, real environment, shallow depth of field, sharp focus, "
        "  film grain, 8k resolution. Avoid abstract, conceptual, vector, "
        "  illustration, graphic design, 3D render, cartoon UNLESS the post "
        "  explicitly demands it.\n"
        "- Compose like a photographer: subject + action + setting + camera angle + "
        "  lens + lighting (e.g. soft diffused window light, golden hour, studio "
        "  softbox) + mood.\n"
        "- COLOR PALETTE is a hard constraint — name the dominant tones explicitly "
        "  in the prompt and instruct the model to keep walls, props, clothing, "
        "  background within that palette.\n"
        "- TEXT ON IMAGE: by default 'No text, no logos, no watermarks'. Only if "
        "  the post genuinely requires text on the image (e.g. a visible price tag, "
        "  street sign, a quote) — instruct the model to render Russian (Cyrillic) "
        "  text only, with accurate cyrillic typography, no Latin characters.\n"
        "- End with photographic technical tags: 'shallow depth of field, sharp "
        "  focus, soft shadows, hyperrealistic skin texture, film grain, 8k'.\n"
    )

    user_prompt = f"""POST TEXT (the brief — translate the topic into a real scene):
{(post_text or '')[:2000]}

ILLUSTRATION MODE: {mode_hint}
COLOR PALETTE (must dominate): {palette_block}
ASPECT RATIO: {fmt}

Return only the final prompt (one paragraph, English)."""

    full = sys_prompt + "\n\n" + user_prompt
    raw = await openrouter_chat(full, model="anthropic/claude-sonnet-4")
    text = (raw or "").strip()
    # Снимаем code-fence/префиксы если попались
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("text"):
            text = text[4:].strip()
    for pref in ("Prompt:", "PROMPT:", "prompt:"):
        if text.startswith(pref):
            text = text[len(pref):].strip()
    return text[:3000]


async def _decide_image_mode(post_text: str, has_photos: bool, has_screenshots: bool) -> str:
    """Спрашивает у Claude Haiku какой режим иллюстрации лучше подходит к посту."""
    prompt = f"""К этому посту нужна иллюстрация. Какая лучше всего подойдёт?

ТЕКСТ ПОСТА:
{(post_text or '')[:1500]}

Доступно: фото из фотобанка автора={'да' if has_photos else 'нет'}, скриншоты для коллажа={'да' if has_screenshots else 'нет'}.

Ответь СТРОГО одним словом: photo (фото с человеком из фотобанка) ИЛИ object (изображение предмета/иллюстрация по тексту) ИЛИ collage (коллаж из скриншотов).
"""
    try:
        res = await openrouter_chat(prompt, model="anthropic/claude-haiku-4-5")
        word = (res or "").strip().lower().split()[0] if res else "object"
        word = word.strip(".,!?\"'")
        if word == "photo" and has_photos:
            return "photo"
        if word == "collage" and has_screenshots:
            return "collage"
        return "text"
    except Exception:
        return "text"


async def _pick_best_photo(post_text: str, photos: List[dict]) -> Optional[dict]:
    """Просит Claude выбрать индекс наиболее подходящего фото из фотобанка."""
    if not photos:
        return None
    if len(photos) == 1:
        return photos[0]

    listing = "\n".join(
        f"{i}. {(p.get('description') or 'без описания')[:200]}"
        for i, p in enumerate(photos)
    )
    prompt = f"""Из списка фото выбери ОДНО наиболее подходящее для иллюстрации к посту.

ТЕКСТ ПОСТА:
{(post_text or '')[:1500]}

ФОТО:
{listing}

Ответь СТРОГО одним числом — индексом подходящего фото (0..{len(photos)-1})."""
    try:
        res = await openrouter_chat(prompt, model="anthropic/claude-haiku-4-5")
        digits = "".join(c for c in (res or "") if c.isdigit() or c == " ").strip().split()
        if digits:
            idx = int(digits[0])
            if 0 <= idx < len(photos):
                return photos[idx]
    except Exception:
        pass
    return photos[0]


def _read_photo_base64(path: str) -> Optional[str]:
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
        return None


@router.post("/{tc}/session/{sid}/post/{pid}/generate-prompt")
async def generate_image_prompt(
    tc: str, sid: int, pid: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Генерирует промт для изображения через Claude. Стоимость: 1 токен."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(sid, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    post = await fetch_one(
        "SELECT * FROM ai_content_session_posts WHERE id=$1 AND session_id=$2", pid, sid,
    )
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    body = await request.json()
    mode = (body.get("mode") or "text").strip()
    if mode not in ("text", "photo", "collage"):
        mode = "text"
    palette = body.get("palette") or []
    image_format = (body.get("format") or "1:1").strip()
    ref_photo_id = body.get("reference_photo_id")

    if mode in ("photo", "collage"):
        bank_count = await fetch_one(
            "SELECT COUNT(*)::int AS n FROM ai_content_photos WHERE user_id=$1 AND channel_id=$2",
            user["id"], channel["id"],
        )
        if not bank_count or (bank_count.get("n") or 0) == 0:
            raise HTTPException(
                status_code=400,
                detail="Фотобанк пуст. Добавьте хотя бы 1 фото для режима «По фото» или «Коллаж».",
            )

    photo_description = None
    if ref_photo_id:
        ref = await fetch_one(
            "SELECT * FROM ai_content_photos WHERE id=$1 AND user_id=$2 AND channel_id=$3",
            int(ref_photo_id), user["id"], channel["id"],
        )
        if ref:
            photo_description = ref.get("description") or ""

    await _charge_tokens(
        user["id"], TOKENS_PROMPT_GEN, "ai_content_image_prompt",
        f"Промт для иллюстрации к посту #{pid}",
    )

    try:
        prompt_text = await _build_image_prompt(
            post.get("message_text") or "",
            mode, palette, photo_description, image_format,
        )
    except Exception as e:
        await _refund_tokens(user["id"], TOKENS_PROMPT_GEN, f"Ошибка генерации промпта поста #{pid}")
        raise HTTPException(status_code=500, detail=f"Ошибка генерации промпта: {e}")

    if not prompt_text:
        await _refund_tokens(user["id"], TOKENS_PROMPT_GEN, f"Пустой промпт для поста #{pid}")
        raise HTTPException(status_code=500, detail="ИИ вернул пустой промпт")

    await execute(
        "UPDATE ai_content_session_posts SET generated_image_prompt=$1, updated_at=NOW() WHERE id=$2",
        prompt_text, pid,
    )
    # Запоминаем палитру в сессии — подставится в следующие генерации
    if palette:
        await execute(
            "UPDATE ai_content_sessions SET last_image_palette=$1, updated_at=NOW() WHERE id=$2",
            json_mod.dumps(palette, ensure_ascii=False), sid,
        )
    return {"success": True, "prompt": prompt_text, "tokens_charged": TOKENS_PROMPT_GEN}


async def _do_image_generation_for_post(
    user_id: int,
    channel_id: int,
    session_id: int,
    post: dict,
    prompt: str,
    mode: str,
    image_format: str,
    palette: list,
    reference_photo_id: Optional[int] = None,
) -> str:
    """Генерирует и сохраняет изображение, обновляет post-row.
    Возвращает image URL (/uploads/...). Бросает HTTPException при ошибке.
    Не списывает токены — это делается снаружи."""
    photo_base64 = None
    if reference_photo_id:
        ref = await fetch_one(
            "SELECT * FROM ai_content_photos WHERE id=$1 AND user_id=$2 AND channel_id=$3",
            int(reference_photo_id), user_id, channel_id,
        )
        if ref and ref.get("file_path"):
            photo_base64 = _read_photo_base64(ref["file_path"])

    # Safety net поверх промпта: aspect ratio (image-модель не понимает --ar
    # параметр напрямую), палитра как hard constraint, фотореализм по умолчанию,
    # русская кириллица если текст всё-таки появится.
    palette_str = _format_palette(palette)
    enhanced = prompt
    fmt_hint = {
        "1:1": "Square 1:1 aspect ratio composition.",
        "4:3": "Landscape 4:3 aspect ratio composition.",
        "3:4": "Portrait 3:4 aspect ratio composition.",
    }.get(image_format, "")
    if fmt_hint:
        enhanced = f"{enhanced}\n\n{fmt_hint}"
    if palette_str:
        enhanced = (
            f"{enhanced}\n\nDominant color palette (HARD CONSTRAINT): {palette_str}. "
            f"Walls, props, clothing, background and accents must stay within this palette."
        )
    enhanced += (
        "\n\nPhotographic realism is mandatory: real human skin texture, natural "
        "lighting, real-world environment, sharp focus, shallow depth of field, soft "
        "shadows, hyperrealistic 8k resolution, subtle film grain. NO abstract "
        "shapes, NO vector art, NO illustration, NO 3D render, NO cartoon, NO "
        "graphic-design aesthetic — unless the post explicitly asks for them."
    )
    enhanced += (
        "\n\nText on image: prefer NO text, no captions, no logos, no watermarks. "
        "If text is essential to the scene (sign, price tag, label, document) — "
        "render ONLY Russian (Cyrillic) characters with accurate cyrillic "
        "typography. No Latin letters, no fake glyphs, no gibberish."
    )

    image_result = await openrouter_image_gen(enhanced, photo_base64)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    out_name = f"ai_content_img_{secrets.token_hex(10)}.png"
    out_path = os.path.join(settings.UPLOAD_DIR, out_name)
    await save_image_result(image_result, out_path)

    image_url = f"/uploads/{out_name}"

    await execute(
        """UPDATE ai_content_session_posts
           SET generated_image_url=$1,
               generated_image_prompt=$2,
               generated_image_mode=$3,
               generated_image_format=$4,
               generated_image_palette=$5,
               file_path=$6,
               file_type='photo',
               attach_type='photo',
               updated_at=NOW()
           WHERE id=$7""",
        image_url, prompt, mode, image_format,
        json_mod.dumps(palette or [], ensure_ascii=False),
        out_path, post["id"],
    )
    return image_url


@router.post("/{tc}/session/{sid}/post/{pid}/generate-image")
async def generate_image_for_post(
    tc: str, sid: int, pid: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Генерирует изображение для конкретного поста. Стоимость: 10 токенов."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(sid, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    post = await fetch_one(
        "SELECT * FROM ai_content_session_posts WHERE id=$1 AND session_id=$2", pid, sid,
    )
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    body = await request.json()
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Промт пуст")
    mode = (body.get("mode") or "text").strip()
    if mode not in ("text", "photo", "collage"):
        mode = "text"
    image_format = (body.get("format") or "1:1").strip()
    if image_format not in ("1:1", "4:3", "3:4"):
        image_format = "1:1"
    palette = body.get("palette") or []
    ref_photo_id = body.get("reference_photo_id")

    if mode in ("photo", "collage"):
        bank_count = await fetch_one(
            "SELECT COUNT(*)::int AS n FROM ai_content_photos WHERE user_id=$1 AND channel_id=$2",
            user["id"], channel["id"],
        )
        if not bank_count or (bank_count.get("n") or 0) == 0:
            raise HTTPException(
                status_code=400,
                detail="Фотобанк пуст. Добавьте хотя бы 1 фото для режима «По фото» или «Коллаж».",
            )

    from ..services.channel_levels import skill_cost as _skill_cost, track_skill as _track_skill
    img_cost = await _skill_cost(channel["id"], "image")

    await _charge_tokens(
        user["id"], img_cost, "ai_content_image",
        f"Иллюстрация к посту #{pid}",
    )

    try:
        image_url = await _do_image_generation_for_post(
            user["id"], channel["id"], sid, dict(post),
            prompt, mode, image_format, palette, ref_photo_id,
        )
    except HTTPException as e:
        await _refund_tokens(user["id"], img_cost, f"Ошибка генерации иллюстрации поста #{pid}")
        raise
    except Exception as e:
        await _refund_tokens(user["id"], img_cost, f"Ошибка генерации иллюстрации поста #{pid}")
        raise HTTPException(status_code=500, detail=f"Ошибка генерации изображения: {e}")

    try:
        # Регенерация платной картинки — тоже считается за image
        await _track_skill(channel["id"], "image", 1)
    except Exception as te:
        print(f"[Levels] track image skip: {te}")
    try:
        from ..services.achievements import track_event as _ach_track
        await _ach_track(channel["id"], "ai_image", 1)
    except Exception as ae:
        print(f"[Achievements] track image skip: {ae}")

    # Запоминаем палитру в сессии — подставится в следующие генерации
    if palette:
        await execute(
            "UPDATE ai_content_sessions SET last_image_palette=$1, updated_at=NOW() WHERE id=$2",
            json_mod.dumps(palette, ensure_ascii=False), sid,
        )

    fresh = await fetch_one("SELECT * FROM ai_content_session_posts WHERE id=$1", pid)
    return {
        "success": True,
        "image_url": image_url,
        "tokens_charged": img_cost,
        "post": _serialize_post(fresh),
    }


@router.post("/{tc}/session/{sid}/generate-images-all")
async def generate_images_all(
    tc: str, sid: int, request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Батч: сгенерировать иллюстрации ко всем постам сессии без картинок.
    Списывает 10 токенов за КАЖДЫЙ успешно сгенерированный пост (per-success).
    Сначала проверяем, что у пользователя хватит токенов на ВСЕ посты.
    """
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(sid, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    # Idempotency guard — если батч для этой сессии уже идёт, не запускаем
    # второй раннер (раньше двойной клик / retry на фронте приводил к тому,
    # что один и тот же пост обрабатывался 2-4 раза и за каждый списывалось
    # 10 токенов). Возвращаем успех, фронт продолжит polling существующего.
    existing_bp = _BATCH_PROGRESS.get(sid)
    if existing_bp and existing_bp.get("in_progress"):
        return {
            "success": True,
            "in_progress": True,
            "total": existing_bp.get("total", 0),
            "already_running": True,
        }

    body = await request.json()
    image_format = (body.get("format") or "1:1").strip()
    if image_format not in ("1:1", "4:3", "3:4"):
        image_format = "1:1"
    palette = body.get("palette") or []
    default_mode = (body.get("default_mode") or "auto").strip()
    # Опционально: список ID фото из банка, которые разрешено использовать.
    # Пустой список / отсутствие = использовать все.
    raw_photo_ids = body.get("photo_ids") or []
    try:
        selected_photo_ids = {int(x) for x in raw_photo_ids if x is not None}
    except Exception:
        selected_photo_ids = set()

    if default_mode in ("auto", "photo", "collage"):
        bank_count = await fetch_one(
            "SELECT COUNT(*)::int AS n FROM ai_content_photos WHERE user_id=$1 AND channel_id=$2",
            user["id"], channel["id"],
        )
        if not bank_count or (bank_count.get("n") or 0) == 0:
            raise HTTPException(
                status_code=400,
                detail="Фотобанк пуст. Добавьте хотя бы 1 фото для режима «Авто», «По фото» или «Коллаж».",
            )

    posts = await fetch_all(
        """SELECT * FROM ai_content_session_posts
           WHERE session_id=$1 AND (generated_image_url IS NULL OR generated_image_url='')
           ORDER BY sort_order, id""",
        sid,
    )
    if not posts:
        return {"success": True, "generated_count": 0, "failed_count": 0, "results": []}

    from ..services.channel_levels import skill_cost as _skill_cost, track_skill as _track_skill
    img_cost = await _skill_cost(channel["id"], "image")
    total_needed = img_cost * len(posts)
    u = await fetch_one("SELECT ai_tokens FROM users WHERE id=$1", user["id"])
    if not u or (u["ai_tokens"] or 0) < total_needed:
        raise HTTPException(
            status_code=402,
            detail=f"Недостаточно ИИ токенов. Нужно {total_needed} ({len(posts)}×{img_cost}), у вас {u['ai_tokens'] if u else 0}",
        )

    photos = await fetch_all(
        "SELECT * FROM ai_content_photos WHERE user_id=$1 AND channel_id=$2 ORDER BY created_at DESC",
        user["id"], channel["id"],
    )
    photos_list = [dict(p) for p in photos]
    # Если пользователь выбрал конкретные фото — фильтруем банк
    if selected_photo_ids:
        photos_list = [p for p in photos_list if p.get("id") in selected_photo_ids]
    has_photos = len(photos_list) > 0

    results = []
    generated = 0
    failed = 0
    total_charged = 0

    # Инициализируем прогресс для polling-эндпоинта
    _BATCH_PROGRESS[sid] = {
        "total": len(posts),
        "generated": 0,
        "failed": 0,
        "in_progress": True,
        "started_at": time.time(),
    }

    sem = asyncio.Semaphore(2)

    async def process_post(p_dict):
        nonlocal generated, failed, total_charged
        post_id = p_dict["id"]
        async with sem:
            try:
                # Решаем режим
                if default_mode == "auto":
                    mode_word = await _decide_image_mode(
                        p_dict.get("message_text") or "", has_photos, False,
                    )
                    if mode_word == "photo" and has_photos:
                        mode = "photo"
                    elif mode_word == "collage":
                        mode = "text"  # Без скриншотов в батче — фоллбэк
                    else:
                        mode = "text"
                elif default_mode in ("text", "photo", "collage"):
                    mode = default_mode if (default_mode != "photo" or has_photos) else "text"
                else:
                    mode = "text"

                ref_photo_id = None
                photo_description = None
                if mode == "photo" and photos_list:
                    pick = await _pick_best_photo(p_dict.get("message_text") or "", photos_list)
                    if pick:
                        ref_photo_id = pick["id"]
                        photo_description = pick.get("description") or ""

                prompt = await _build_image_prompt(
                    p_dict.get("message_text") or "",
                    mode, palette, photo_description, image_format,
                )
                if not prompt:
                    raise RuntimeError("Пустой промт")

                image_url = await _do_image_generation_for_post(
                    user["id"], channel["id"], sid, p_dict,
                    prompt, mode, image_format, palette, ref_photo_id,
                )

                # Списываем за успех (динамическая цена по уровню)
                await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id=$2",
                              img_cost, user["id"])
                await execute(
                    "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
                    user["id"], img_cost, "ai_content_image_batch",
                    f"Батч-иллюстрация к посту #{post_id}",
                )
                try:
                    await _track_skill(channel["id"], "image", 1)
                except Exception as te:
                    print(f"[Levels] track image batch skip: {te}")
                try:
                    from ..services.achievements import track_event as _ach_track
                    await _ach_track(channel["id"], "ai_image", 1)
                except Exception as ae:
                    print(f"[Achievements] track image batch skip: {ae}")
                total_charged += img_cost
                generated += 1
                results.append({"post_id": post_id, "image_url": image_url, "mode": mode})
                # Атомарный snapshot для polling — frontend сразу подменит
                # картинку на конкретном посте, не дожидаясь окончания батча.
                bp = _BATCH_PROGRESS.get(sid)
                if bp is not None:
                    bp["generated"] = generated
                    bp["results"] = list(results)
            except HTTPException as e:
                failed += 1
                results.append({"post_id": post_id, "error": e.detail})
                bp = _BATCH_PROGRESS.get(sid)
                if bp is not None:
                    bp["failed"] = failed
                    bp["results"] = list(results)
            except Exception as e:
                failed += 1
                results.append({"post_id": post_id, "error": str(e)})
                bp = _BATCH_PROGRESS.get(sid)
                if bp is not None:
                    bp["failed"] = failed
                    bp["results"] = list(results)

    # Fire-and-forget. Возвращаем 202 сразу — батч из 10+ изображений запросто
    # выходит за nginx proxy_read_timeout=300с и фронт ловит 504. Прогресс,
    # финальные счётчики и список сгенерированных результатов фронт читает из
    # /batch-progress (он уже опрашивается в UI каждые 1500мс).
    async def _runner():
        try:
            await asyncio.gather(*[process_post(dict(p)) for p in posts])
        except Exception as e:
            print(f"[ai-content] batch runner exception sid={sid}: {type(e).__name__}: {e}")
        finally:
            bp = _BATCH_PROGRESS.get(sid)
            if bp is not None:
                bp["in_progress"] = False
                bp["generated"] = generated
                bp["failed"] = failed
                bp["tokens_charged"] = total_charged
                bp["results"] = results
            # Запоминаем палитру в сессии — подставится в следующие генерации
            if palette:
                try:
                    await execute(
                        "UPDATE ai_content_sessions SET last_image_palette=$1, updated_at=NOW() WHERE id=$2",
                        json_mod.dumps(palette, ensure_ascii=False), sid,
                    )
                except Exception as e:
                    print(f"[ai-content] palette save failed sid={sid}: {e}")

    asyncio.create_task(_runner())

    return {
        "success": True,
        "in_progress": True,
        "total": len(posts),
    }


@router.get("/{tc}/session/{sid}/batch-progress")
async def get_batch_progress(
    tc: str, sid: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Опрос прогресса батчевой генерации картинок (in-memory, текущий процесс)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    progress = _BATCH_PROGRESS.get(sid)
    if not progress:
        return {
            "success": True,
            "in_progress": False,
            "total": 0,
            "generated": 0,
            "failed": 0,
        }
    return {"success": True, **progress}


@router.delete("/{tc}/session/{sid}/post/{pid}/image")
async def delete_post_image(
    tc: str, sid: int, pid: int,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Удалить сгенерированное изображение у поста (без возврата токенов)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    session = await _get_session(sid, user["id"], channel["id"])
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    post = await fetch_one(
        "SELECT * FROM ai_content_session_posts WHERE id=$1 AND session_id=$2", pid, sid,
    )
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    fp = post.get("file_path")
    if fp and os.path.exists(fp):
        try:
            os.unlink(fp)
        except Exception:
            pass
    await execute(
        """UPDATE ai_content_session_posts
           SET generated_image_url=NULL, file_path=NULL, file_type=NULL, file_data=NULL,
               attach_type=NULL, updated_at=NOW()
           WHERE id=$1""",
        pid,
    )
    return {"success": True}
