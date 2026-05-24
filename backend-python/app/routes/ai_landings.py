"""ИИ Лендинги — генерация HTML лендингов для каналов."""
import os
import json as json_mod
import secrets
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import HTMLResponse

from ..config import settings
from ..database import fetch_one, fetch_all, execute, execute_returning_id
from ..middleware.auth import get_current_user
from ..services.ai_openrouter import openrouter_chat

router = APIRouter()
# Публичный роутер без авторизации
public_router = APIRouter()

SESSION_COST = 500  # Стоимость генерации лендинга в ИИ токенах
MAX_REGEN = 2  # Максимум правок после первой генерации

# Загружаем референс-лендинг
_REF_PATH = Path(__file__).parent / "landing_reference.html"
_LANDING_REFERENCE = _REF_PATH.read_text(encoding="utf-8") if _REF_PATH.exists() else ""


async def _get_owned_channel(tc: str, user_id: int):
    """Получить канал пользователя."""
    return await fetch_one(
        "SELECT * FROM channels WHERE tracking_code=$1 AND user_id=$2 AND is_active=1", tc, user_id
    )


async def _get_landing(landing_id: int, user_id: int, channel_id: int):
    """Получить лендинг по ID."""
    return await fetch_one(
        "SELECT * FROM ai_landings WHERE id=$1 AND user_id=$2 AND channel_id=$3",
        landing_id, user_id, channel_id
    )


def _parse_json(val):
    """Парсит JSON-поле."""
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


# ---- Список лендингов ----

@router.get("/{tc}/landings")
async def list_landings(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Список лендингов канала."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    rows = await fetch_all(
        """SELECT id, status, niche, design_style, published, slug, created_at
           FROM ai_landings WHERE user_id=$1 AND channel_id=$2
           ORDER BY created_at DESC LIMIT 20""",
        user["id"], channel["id"]
    )
    landings = []
    for r in rows:
        landings.append({
            "id": r["id"],
            "status": r["status"],
            "niche": r.get("niche"),
            "design_style": r.get("design_style"),
            "published": r.get("published", False),
            "slug": r.get("slug"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return {"success": True, "landings": landings}


# ---- Создание сессии (списание токенов) ----

@router.post("/{tc}/landing")
async def create_landing(tc: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Создать новую сессию лендинга, списать токены."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")

    from ..services.channel_levels import skill_cost
    cost = await skill_cost(channel["id"], "landing")

    u = await fetch_one("SELECT ai_tokens FROM users WHERE id=$1", user["id"])
    if not u or (u["ai_tokens"] or 0) < cost:
        raise HTTPException(status_code=402, detail=f"Недостаточно ИИ токенов. Нужно {cost}, у вас {u['ai_tokens'] if u else 0}")

    await execute("UPDATE users SET ai_tokens = ai_tokens - $1 WHERE id=$2", cost, user["id"])
    await execute(
        "INSERT INTO ai_token_usage (user_id, tokens_used, action, description) VALUES ($1,$2,$3,$4)",
        user["id"], cost, "ai_landing", f"Генерация лендинга для канала {channel['title']}"
    )

    slug = secrets.token_hex(8)
    landing_id = await execute_returning_id(
        """INSERT INTO ai_landings (user_id, channel_id, slug, tokens_spent)
           VALUES ($1, $2, $3, $4) RETURNING id""",
        user["id"], channel["id"], slug, cost
    )
    return {"success": True, "landing_id": landing_id, "slug": slug, "cost": cost}


# ---- Сохранение данных опроса ----

@router.put("/{tc}/landing/{landing_id}/survey")
async def save_survey(tc: str, landing_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохранить данные опроса."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    body = await request.json()
    await execute(
        """UPDATE ai_landings SET niche=$1, product=$2, target_audience=$3,
           design_style=$4, additional_info=$5, updated_at=NOW() WHERE id=$6""",
        body.get("niche", ""), body.get("product", ""), body.get("target_audience", ""),
        body.get("design_style", ""), body.get("additional_info", ""), landing_id,
    )
    return {"success": True}


# ---- Загрузка фото ----

@router.post("/{tc}/landing/{landing_id}/photo")
async def upload_photo(
    tc: str, landing_id: int,
    file: UploadFile = File(...),
    description: str = Form(""),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Загрузить фото для лендинга (до 5 шт)."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    photos = _parse_json(landing.get("photos")) or []
    if len(photos) >= 5:
        raise HTTPException(status_code=400, detail="Максимум 5 фото")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс 10 МБ)")

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"ai_landing_{secrets.token_hex(8)}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    path = os.path.join(settings.UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)

    photo_url = f"/uploads/{filename}"
    photos.append({"url": photo_url, "description": description})

    await execute(
        "UPDATE ai_landings SET photos=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(photos, ensure_ascii=False), landing_id
    )
    return {"success": True, "photos": photos}


# ---- Удаление фото ----

@router.delete("/{tc}/landing/{landing_id}/photo/{photo_index}")
async def delete_photo(tc: str, landing_id: int, photo_index: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Удалить фото по индексу."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    photos = _parse_json(landing.get("photos")) or []
    if photo_index < 0 or photo_index >= len(photos):
        raise HTTPException(status_code=400, detail="Неверный индекс фото")

    photos.pop(photo_index)
    await execute(
        "UPDATE ai_landings SET photos=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(photos, ensure_ascii=False), landing_id
    )
    return {"success": True, "photos": photos}


# ---- Обновление описания фото ----

@router.put("/{tc}/landing/{landing_id}/photo/{photo_index}")
async def update_photo_desc(tc: str, landing_id: int, photo_index: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Обновить описание фото."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    body = await request.json()
    photos = _parse_json(landing.get("photos")) or []
    if photo_index < 0 or photo_index >= len(photos):
        raise HTTPException(status_code=400, detail="Неверный индекс фото")

    photos[photo_index]["description"] = body.get("description", "")
    await execute(
        "UPDATE ai_landings SET photos=$1, updated_at=NOW() WHERE id=$2",
        json_mod.dumps(photos, ensure_ascii=False), landing_id
    )
    return {"success": True, "photos": photos}


# ---- Ручное сохранение ТЗ ----

@router.put("/{tc}/landing/{landing_id}/spec")
async def save_spec(tc: str, landing_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохранить ТЗ вручную."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    body = await request.json()
    await execute(
        "UPDATE ai_landings SET technical_spec=$1, updated_at=NOW() WHERE id=$2",
        body.get("spec", ""), landing_id
    )
    return {"success": True}


# ---- Генерация ТЗ через ИИ ----

@router.post("/{tc}/landing/{landing_id}/generate-spec")
async def generate_spec(tc: str, landing_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Сгенерировать техническое задание через ИИ."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    niche = landing.get("niche") or ""
    product = landing.get("product") or ""
    target_audience = landing.get("target_audience") or ""
    design_style = landing.get("design_style") or ""
    additional_info = landing.get("additional_info") or ""

    prompt = (
        f"Составь подробное техническое задание для создания одностраничного лендинга.\n\n"
        f"Ниша: {niche}\n"
        f"Продукт/услуга: {product}\n"
        f"Целевая аудитория: {target_audience}\n"
        f"Стиль дизайна: {design_style}\n"
        f"Дополнительно: {additional_info}\n"
        f"Цель лендинга: подписка на канал\n\n"
        f"Опиши: структуру страницы (какие блоки и в каком порядке), "
        f"заголовки и тексты для каждого блока, призывы к действию, "
        f"цветовую палитру, стиль оформления.\n\n"
        f"НЕ ВКЛЮЧАЙ в ТЗ: ссылки на соцсети, контактную информацию, "
        f"политику конфиденциальности, копирайт, подключение аналитики, "
        f"A/B тестирование, технические требования по производительности.\n\n"
        f"ВАЖНО: не используй markdown-разметку (###, **, __ и т.д.). Пиши простым текстом."
    )

    # Каскад моделей: основная Sonnet 4 → fallback gpt-4o-mini.
    # Любые HTTPException (402 нет кредитов, 429 rate limit, 5xx) и пустые
    # ответы Sonnet — переходим на дешёвую модель.
    spec = ""
    last_error = None
    for attempt_model in ("anthropic/claude-sonnet-4", "openai/gpt-4o-mini"):
        try:
            spec = (await openrouter_chat(prompt, model=attempt_model) or "").strip()
        except HTTPException as e:
            last_error = e.detail
            print(f"[ai-landings] generate-spec {attempt_model} HTTPException: {e.detail}")
            continue
        except Exception as e:
            last_error = str(e)
            print(f"[ai-landings] generate-spec {attempt_model} EXC: {e}")
            continue
        if spec:
            if attempt_model != "anthropic/claude-sonnet-4":
                print(f"[ai-landings] generate-spec fallback succeeded with {attempt_model}")
            break
        print(f"[ai-landings] generate-spec {attempt_model} returned empty; trying next")

    if not spec:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось сгенерировать ТЗ. Попробуйте через пару минут или переформулируйте бриф. ({last_error or 'пустой ответ ИИ'})",
        )

    await execute(
        "UPDATE ai_landings SET technical_spec=$1, updated_at=NOW() WHERE id=$2",
        spec, landing_id
    )
    return {"success": True, "spec": spec}


# ---- Генерация HTML лендинга ----

@router.post("/{tc}/landing/{landing_id}/generate")
async def generate_landing(tc: str, landing_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Сгенерировать HTML лендинг через ИИ."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    regen_count = landing.get("regen_count") or 0
    if landing.get("html_content") and regen_count >= MAX_REGEN:
        raise HTTPException(status_code=400, detail=f"Достигнут лимит правок ({MAX_REGEN})")

    niche = landing.get("niche") or ""
    product = landing.get("product") or ""
    target_audience = landing.get("target_audience") or ""
    design_style = landing.get("design_style") or ""
    additional_info = landing.get("additional_info") or ""
    spec = landing.get("technical_spec") or ""
    photos = _parse_json(landing.get("photos")) or []

    # Формируем описание фото
    photos_desc = ""
    if photos:
        photos_desc = "\n\nФотографии для использования на лендинге:\n"
        for i, p in enumerate(photos):
            url = f"{settings.APP_URL}{p['url']}"
            desc = p.get("description", "")
            photos_desc += f"{i+1}. URL: {url} — {desc}\n"

    # Определяем ссылку на канал
    join_link = channel.get("join_link") or ""
    channel_title = channel.get("title") or "Канал"

    # Референс-лендинг (обрезаем если слишком длинный)
    ref_block = ""
    if _LANDING_REFERENCE:
        ref_html = _LANDING_REFERENCE[:12000]
        ref_block = (
            f"\n\nРЕФЕРЕНС (пример качественного лендинга — используй как образец стиля, "
            f"структуры CSS, анимаций и общего уровня качества, но адаптируй под данные пользователя):\n"
            f"```html\n{ref_html}\n```\n"
        )

    prompt = (
        f"Создай полностью готовый одностраничный HTML-лендинг.\n\n"
        f"ДАННЫЕ:\n"
        f"Ниша: {niche}\n"
        f"Продукт/услуга: {product}\n"
        f"Целевая аудитория: {target_audience}\n"
        f"Стиль дизайна: {design_style}\n"
        f"Дополнительно: {additional_info}\n"
        f"Название канала: {channel_title}\n"
        f"Ссылка на канал: {join_link}\n"
        f"{photos_desc}\n"
        f"{'Техническое задание:\n' + spec if spec else ''}\n"
        f"{ref_block}\n"
        f"ТРЕБОВАНИЯ:\n"
        f"1. Полный HTML документ с <!DOCTYPE html>, все стили в <style> (не inline на элементах)\n"
        f"2. Адаптивный дизайн (mobile-first)\n"
        f"3. CSS переменные (:root) для цветовой палитры как в референсе\n"
        f"4. Секции: hero с градиентным фоном, преимущества (карточки), программа/описание, отзывы, финальный CTA\n"
        f"5. Кнопки подписки на канал с ссылкой: {join_link}\n"
        f"6. Плавающая (sticky) кнопка подписки внизу экрана\n"
        f"7. Анимации появления при скролле (IntersectionObserver, fade-in/slide-up)\n"
        f"8. Современный минималистичный дизайн высокого качества как в референсе\n"
        f"9. Если есть фото — используй их через <img src='URL'> в подходящих секциях\n"
        f"10. Весь контент на русском языке\n"
        f"11. Не используй внешние JS-библиотеки\n"
        f"12. Google Fonts можно использовать через @import\n"
        f"13. Эффекты hover на карточках и кнопках, shimmer-анимация на CTA кнопках\n"
        f"14. Стиль кнопок, карточек и типографики должен соответствовать уровню референса\n\n"
        f"Верни ТОЛЬКО HTML-код без пояснений."
    )

    # Каскад моделей для устойчивости (402/429/empty → fallback)
    html = ""
    last_error = None
    for attempt_model in ("anthropic/claude-sonnet-4", "openai/gpt-4o-mini"):
        try:
            html = (await openrouter_chat(prompt, model=attempt_model) or "").strip()
        except HTTPException as e:
            last_error = e.detail
            print(f"[ai-landings] generate {attempt_model} HTTPException: {e.detail}")
            continue
        except Exception as e:
            last_error = str(e)
            print(f"[ai-landings] generate {attempt_model} EXC: {e}")
            continue
        if html:
            if attempt_model != "anthropic/claude-sonnet-4":
                print(f"[ai-landings] generate fallback succeeded with {attempt_model}")
            break
        print(f"[ai-landings] generate {attempt_model} returned empty; trying next")

    if not html:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось сгенерировать лендинг. Попробуйте через пару минут. ({last_error or 'пустой ответ ИИ'})",
        )

    # Очистка: убираем markdown обёртки если есть
    if html.startswith("```html"):
        html = html[7:]
    if html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]
    html = html.strip()

    new_regen = regen_count + 1 if landing.get("html_content") else 0
    await execute(
        "UPDATE ai_landings SET html_content=$1, status='generated', regen_count=$2, updated_at=NOW() WHERE id=$3",
        html, new_regen, landing_id
    )
    # Прокачка навыка только за первую генерацию (перегенерации = 0).
    if new_regen == 0:
        try:
            from ..services.channel_levels import track_skill
            await track_skill(channel["id"], "landing", 1)
        except Exception as e:
            print(f"[Levels] track landing skip: {e}")
        try:
            from ..services.achievements import track_event
            await track_event(channel["id"], "link_landing", 1)
            await track_event(channel["id"], "link_create", 1)
        except Exception as e:
            print(f"[Achievements] track landing skip: {e}")
    return {"success": True, "html": html, "regen_count": new_regen}


@router.post("/{tc}/landing/{landing_id}/edit")
async def edit_landing(tc: str, landing_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Внести правки в существующий HTML-лендинг через ИИ.
    Тело: { edit_request: str } — текстовое описание изменений."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    existing_html = landing.get("html_content") or ""
    if not existing_html:
        raise HTTPException(status_code=400, detail="Лендинг ещё не сгенерирован — сначала создайте его")

    regen_count = landing.get("regen_count") or 0
    if regen_count >= MAX_REGEN:
        raise HTTPException(status_code=400, detail=f"Достигнут лимит правок ({MAX_REGEN})")

    body = await request.json()
    edit_request = (body.get("edit_request") or "").strip()
    if not edit_request:
        raise HTTPException(status_code=400, detail="Опишите, что нужно изменить")

    prompt = (
        f"в этом коде:\n\n```html\n{existing_html}\n```\n\n"
        f"нужно заменить: {edit_request}\n\n"
        f"Верни ТОЛЬКО полный обновлённый HTML-код без пояснений, без markdown-обёрток. "
        f"Сохрани всю структуру, стили и функциональность, измени только то, что попросили."
    )

    html = await openrouter_chat(prompt, model="anthropic/claude-sonnet-4")

    if html.startswith("```html"):
        html = html[7:]
    if html.startswith("```"):
        html = html[3:]
    if html.endswith("```"):
        html = html[:-3]
    html = html.strip()

    new_regen = regen_count + 1
    await execute(
        "UPDATE ai_landings SET html_content=$1, status='generated', regen_count=$2, updated_at=NOW() WHERE id=$3",
        html, new_regen, landing_id
    )
    return {"success": True, "html": html, "regen_count": new_regen}


# ---- Публикация лендинга ----

@router.post("/{tc}/landing/{landing_id}/publish")
async def publish_landing(tc: str, landing_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Опубликовать лендинг."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    if not landing.get("html_content"):
        raise HTTPException(status_code=400, detail="Сначала сгенерируйте лендинг")

    await execute(
        "UPDATE ai_landings SET published=TRUE, status='published', updated_at=NOW() WHERE id=$1",
        landing_id
    )
    return {"success": True, "slug": landing["slug"], "url": f"{settings.APP_URL}/land/{landing['slug']}"}


# ---- Получение лендинга ----

@router.get("/{tc}/landing/{landing_id}")
async def get_landing_data(tc: str, landing_id: int, user: Dict[str, Any] = Depends(get_current_user)):
    """Получить данные лендинга."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    return {
        "success": True,
        "landing": {
            "id": landing["id"],
            "status": landing["status"],
            "niche": landing.get("niche"),
            "product": landing.get("product"),
            "target_audience": landing.get("target_audience"),
            "design_style": landing.get("design_style"),
            "additional_info": landing.get("additional_info"),
            "photos": _parse_json(landing.get("photos")) or [],
            "technical_spec": landing.get("technical_spec"),
            "html_content": landing.get("html_content"),
            "published": landing.get("published", False),
            "slug": landing.get("slug"),
            "regen_count": landing.get("regen_count") or 0,
            "ym_counter_id": landing.get("ym_counter_id") or "",
            "ym_goal_name": landing.get("ym_goal_name") or "subscribe_channel",
            "vk_pixel_id": landing.get("vk_pixel_id") or "",
            "vk_goal_name": landing.get("vk_goal_name") or "subscribe_channel",
        }
    }


# ---- Сохранение настроек метрики ----

@router.put("/{tc}/landing/{landing_id}/metrika")
async def save_metrika(tc: str, landing_id: int, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
    """Сохранить настройки Яндекс Метрики и VK Пикселя."""
    channel = await _get_owned_channel(tc, user["id"])
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    landing = await _get_landing(landing_id, user["id"], channel["id"])
    if not landing:
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    body = await request.json()
    await execute(
        """UPDATE ai_landings SET ym_counter_id=$1, ym_goal_name=$2,
           vk_pixel_id=$3, vk_goal_name=$4, updated_at=NOW() WHERE id=$5""",
        body.get("ym_counter_id", ""), body.get("ym_goal_name", "subscribe_channel"),
        body.get("vk_pixel_id", ""), body.get("vk_goal_name", "subscribe_channel"),
        landing_id,
    )
    return {"success": True}


# ---- Публичный эндпоинт для отдачи лендинга ----

@public_router.get("/land/{slug}", response_class=HTMLResponse)
async def serve_landing(slug: str):
    """Отдать HTML лендинга по slug."""
    landing = await fetch_one(
        "SELECT html_content, published, ym_counter_id, ym_goal_name, vk_pixel_id, vk_goal_name FROM ai_landings WHERE slug=$1",
        slug,
    )
    if not landing or not landing.get("html_content"):
        raise HTTPException(status_code=404, detail="Лендинг не найден")

    html = landing["html_content"]

    # Инъекция скриптов аналитики перед </head>
    analytics = ""
    ym_id = landing.get("ym_counter_id") or ""
    vk_id = landing.get("vk_pixel_id") or ""
    if ym_id:
        analytics += (
            f'<script>(function(m,e,t,r,i,k,a){{m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};\n'
            f'm[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){{if(document.scripts[j].src===r)return}}\n'
            f'k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)}}\n'
            f')(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");\n'
            f'ym({ym_id},"init",{{clickmap:true,trackLinks:true,accurateTrackBounce:true}});</script>\n'
        )
    if vk_id:
        analytics += (
            f'<script>!function(){{var t=document.createElement("script");t.type="text/javascript",t.async=!0,'
            f't.src="https://top-fwz1.mail.ru/js/code.js",t.onload=function(){{window._tmr=window._tmr||[];'
            f'window._tmr.push({{id:"{vk_id}",type:"pageView",start:Date.now()}})}},document.head.appendChild(t)}}'
            f'();</script>\n'
        )
    if analytics:
        html = html.replace("</head>", analytics + "</head>")

    return HTMLResponse(content=html)
