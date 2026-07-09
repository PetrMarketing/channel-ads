"""Сервис для работы с OpenRouter API — генерация текста и изображений."""
import json
import aiohttp
from fastapi import HTTPException

from ..config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Production модель (без "-preview" — та ушла в 403 на нашем ключе).
# Fallback'ы пробуем последовательно если основная упала.
IMAGE_MODEL = "google/gemini-3.1-flash-image"
IMAGE_FALLBACK_MODELS = [
    "google/gemini-3.1-flash-lite-image",
    "google/gemini-2.5-flash-image",
]
TEXT_MODEL = "openai/gpt-5.4-nano"


FALLBACK_TEXT_MODELS = ["openai/gpt-4o-mini", "openai/gpt-4o"]


async def openrouter_chat(prompt: str, model: str = None) -> str:
    """Генерация текста через OpenRouter chat completions.

    Пробуем по очереди: основная модель → gpt-4o-mini → gpt-4o.
    Полезно когда Claude/основная модель refuse'ит нейтральные промпты
    (safety guidelines Anthropic срабатывают на бизнес-темы вроде
    «алкоголь», «ставки»). Если все три вернули пусто — HTTPException
    с человеческим сообщением, без потери токенов у юзера
    (endpoint делает refund).
    """
    model = model or TEXT_MODEL
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async def _call(m):
        payload = {
            "model": m,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 4096,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
                status = resp.status
                raw = await resp.text()
                try:
                    return status, json.loads(raw), raw
                except Exception:
                    return status, {}, raw

    # Строим последовательность моделей: основная + fallback'и (без дублей)
    tried = []
    chain = [model] + [m for m in FALLBACK_TEXT_MODELS if m != model]
    saw_403 = False
    for m in chain:
        status, result, raw = await _call(m)
        text = _extract_text(result, m)
        if text:
            return text
        if status == 403:
            saw_403 = True
        # Диагностика — что именно ответила модель
        finish = ""
        try:
            ch = (result.get("choices") or [{}])[0]
            finish = ch.get("finish_reason") or ch.get("native_finish_reason") or ""
        except Exception:
            pass
        err = result.get("error") if isinstance(result, dict) else None
        err_msg = ""
        if isinstance(err, dict):
            err_msg = str(err.get("message") or "")[:120]
        elif isinstance(err, str):
            err_msg = err[:120]
        # Если ничего внятного не нашли — возьмём начало raw body
        if not err_msg and not finish:
            err_msg = f"raw[:120]={raw[:120]!r}"
        tried.append(f"{m}[{status}]: finish={finish or '—'} err={err_msg or '—'}")
        print(f"[OpenRouter] chain step failed → {tried[-1]}")

    # Все модели упали. Если хоть одна отдала 403 (OpenRouter security
    # policy — обычно триггер на URL / чужие бренды / стоп-слова в
    # промпте), делаем ещё один retry с САНИТИЗИРОВАННЫМ промптом:
    # убираем http:// ссылки, кавычки-скобки, странные символы. Часто
    # именно contact_link (URL) — источник проблемы.
    if saw_403:
        import re as _re
        sanitized = _re.sub(r"https?://\S+", "", prompt)   # убираем URL-ы
        sanitized = _re.sub(r"@\S+", "", sanitized)         # убираем @handles
        sanitized = _re.sub(r"[«»\"'`]", "", sanitized)     # убираем кавычки
        sanitized = _re.sub(r"\s+", " ", sanitized).strip()
        if sanitized and sanitized != prompt:
            print("[OpenRouter] 403 detected — retrying with sanitized prompt")
            for m in chain:
                try:
                    st2, r2, raw2 = await _call(m)
                    # Подменяем prompt в замыкании через новый _call2
                    async def _call2(mm):
                        p2 = {
                            "model": mm,
                            "messages": [{"role": "user", "content": sanitized}],
                            "temperature": 0.7,
                            "max_tokens": 4096,
                        }
                        async with aiohttp.ClientSession() as s:
                            async with s.post(OPENROUTER_URL, json=p2, headers=headers) as resp:
                                rw = await resp.text()
                                try:
                                    return resp.status, json.loads(rw), rw
                                except Exception:
                                    return resp.status, {}, rw
                    st3, r3, raw3 = await _call2(m)
                    t3 = _extract_text(r3, m)
                    if t3:
                        print(f"[OpenRouter] sanitized retry {m} succeeded")
                        return t3
                except Exception as e:
                    print(f"[OpenRouter] sanitized retry {m} error: {e}")

    raise HTTPException(
        status_code=502,
        detail=(
            "ИИ не смог сгенерировать текст. Попробуйте убрать из "
            "описания канала ссылки, @упоминания и стоп-слова. "
            f"Если не поможет — напишите в поддержку. [{'; '.join(tried)}]"
        ),
    )


def _extract_text(result: dict, model: str = "") -> str:
    """Достаёт текст из ответа OpenRouter с фолбэками.

    Anthropic-модели через OpenRouter иногда отдают пустой content + текст
    в reasoning / reasoning_content. Также проверяем error и refusal."""
    if not isinstance(result, dict):
        print(f"[OpenRouter] non-dict response: {type(result).__name__}")
        return ""
    err = result.get("error")
    if err:
        msg = err.get("message", "") if isinstance(err, dict) else str(err)
        code = err.get("code") if isinstance(err, dict) else None
        print(f"[OpenRouter] {model} error code={code}: {msg[:300]}")
        if code == 402 or "credits" in msg.lower() or "afford" in msg.lower():
            raise HTTPException(status_code=502, detail="На сервере временно нет кредитов для ИИ. Мы уже занимаемся — попробуйте через 10-15 минут.")
        if code == 429 or "rate" in msg.lower():
            raise HTTPException(status_code=503, detail="Слишком много запросов к ИИ — попробуйте через минуту.")
        return ""
    choices = result.get("choices") or []
    if not choices:
        print(f"[OpenRouter] no choices. keys={list(result.keys())} body={str(result)[:400]}")
        return ""
    msg = choices[0].get("message") or {}
    # 1) обычный путь
    content = msg.get("content")
    if isinstance(content, list):
        # Vision / parts формат: [{"type":"text","text":"..."}, ...]
        text_parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
        content = "\n".join(t for t in text_parts if t).strip()
    if isinstance(content, str) and content.strip():
        return content
    # 2) refusal (Anthropic)
    refusal = msg.get("refusal")
    if refusal:
        print(f"[OpenRouter] {model} refusal: {refusal[:200]}")
        return ""
    # 3) reasoning поля (Anthropic extended-thinking, OpenAI o1/o3)
    for k in ("reasoning_content", "reasoning"):
        v = msg.get(k)
        if isinstance(v, str) and v.strip():
            print(f"[OpenRouter] {model} returned text via '{k}' (content was empty)")
            return v.strip()
    finish = choices[0].get("finish_reason") or choices[0].get("native_finish_reason")
    print(f"[OpenRouter] {model} empty content. finish={finish} msg_keys={list(msg.keys())} usage={result.get('usage')}")
    return ""


async def openrouter_chat_messages(messages: list, model: str = None) -> str:
    """Chat completions с полной историей сообщений."""
    model = model or TEXT_MODEL
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async def _call(m):
        payload = {"model": m, "messages": messages, "temperature": 0.4, "max_tokens": 4096}
        async with aiohttp.ClientSession() as session:
            async with session.post(OPENROUTER_URL, json=payload, headers=headers) as resp:
                return await resp.json()

    chain = [model] + [m for m in FALLBACK_TEXT_MODELS if m != model]
    for m in chain:
        result = await _call(m)
        text = _extract_text(result, m)
        if text:
            return text
        print(f"[OpenRouter/messages] {m} empty → trying next")
    raise HTTPException(
        status_code=502,
        detail="ИИ не смог сформулировать ответ. Попробуйте ещё раз или упростите вопрос.",
    )


def _shrink_b64_photo(b64: str, max_side: int = 1024, quality: int = 78) -> str:
    """Уменьшает фото-референс до max_side по большей стороне в JPEG q78,
    чтобы не съедать токены OpenRouter. base64-фото 5+ МБ легко даёт
    >40K tokens на input — это убивает кредитный лимит юзера."""
    try:
        import io as _io
        import base64 as _b64
        from PIL import Image as _Img
        raw = _b64.b64decode(b64)
        if len(raw) <= 250 * 1024:  # уже < 250КБ — не трогаем
            return b64
        img = _Img.open(_io.BytesIO(raw))
        if img.mode in ("RGBA", "LA", "P"):
            bg = _Img.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = bg
        w, h = img.size
        if max(w, h) > max_side:
            if w >= h:
                img = img.resize((max_side, int(h * max_side / w)), _Img.LANCZOS)
            else:
                img = img.resize((int(w * max_side / h), max_side), _Img.LANCZOS)
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return _b64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f"[AI shrink] photo shrink failed, sending as-is: {e}")
        return b64


async def openrouter_image_gen(prompt: str, photo_base64=None) -> str:
    """Генерация изображения через OpenRouter. Возвращает data URL или http URL.
    photo_base64 может быть строкой (одно фото-референс) или списком строк
    (до нескольких референсов). Большие фото автоматически даунскейлятся."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Нормализуем: список base64-строк (могут быть None) и сжимаем
    photos: list = []
    if photo_base64 is None:
        pass
    elif isinstance(photo_base64, list):
        photos = [_shrink_b64_photo(p) for p in photo_base64 if p]
    elif isinstance(photo_base64, str) and photo_base64:
        photos = [_shrink_b64_photo(photo_base64)]

    # Формируем сообщение: фото-референсы (если есть) + текст
    messages_content = []
    for p in photos:
        messages_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{p}"}
        })
    messages_content.append({"type": "text", "text": prompt})

    payload = {
        "model": IMAGE_MODEL,
        "messages": [{"role": "user", "content": messages_content}],
        "modalities": ["image", "text"],
        # max_tokens — НЕ для размера картинки, а лимит вывода модели.
        # Без него OpenRouter резервирует context модели (60K+),
        # из-за чего 402 «not enough credits». 4096 хватает для image+text.
        "max_tokens": 4096,
    }
    timeout = aiohttp.ClientTimeout(total=180)

    async def _post(mdl):
        p = dict(payload)
        p["model"] = mdl
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(OPENROUTER_URL, json=p, headers=headers) as resp:
                return resp.status, await resp.json()

    try:
        img_status, result = await _post(IMAGE_MODEL)
        # Если основная модель отдала 403 / 404 / 429 — сразу пробуем fallback
        # image-модели (у OpenRouter иногда preview-версии дизаблят).
        if img_status in (403, 404, 429, 500, 502, 503) or (result.get("error") and not result.get("choices")):
            for fb in IMAGE_FALLBACK_MODELS:
                print(f"[AI Image] {IMAGE_MODEL} status={img_status} → trying {fb}")
                img_status, result = await _post(fb)
                if img_status == 200 and not result.get("error"):
                    break
    except aiohttp.ClientError as e:
        print(f"[AI Image] network error: {e}")
        raise HTTPException(status_code=503, detail="Сетевая ошибка при обращении к ИИ — попробуйте ещё раз")

    # Проверяем ошибку API
    if result.get("error"):
        err = result["error"]
        msg = err.get("message", "") if isinstance(err, dict) else str(err)
        code = err.get("code") if isinstance(err, dict) else None
        print(f"[AI Image] API error code={code}: {msg[:300]}")
        if code == 402 or "credits" in msg.lower() or "afford" in msg.lower():
            raise HTTPException(status_code=502, detail="На сервере временно нет кредитов для ИИ. Мы уже занимаемся, попробуйте через 10-15 минут.")
        if code == 429 or "rate" in msg.lower():
            raise HTTPException(status_code=503, detail="Слишком много запросов к ИИ — попробуйте через минуту.")
        ml = msg.lower()
        is_safety = ("security policy" in ml or "safety" in ml or "safety_filter" in ml
                     or "blocked" in ml or "prohibited" in ml or "harm" in ml
                     or "access denied" in ml)
        if is_safety:
            # Gemini safety-filter триггерится лицами / чувствительными
            # словами. Делаем ДВУХСТУПЕНЧАТЫЙ retry:
            # 1) если было фото — тот же промпт без фото
            # 2) нейтральный fallback-промпт вообще без ниши
            fallback_prompt = (
                "9 modern abstract icons in a colorful geometric flat style, "
                "arranged as a 3x3 grid. No text, no letters, no faces, no people. "
                "Each icon is centered in its cell, minimalist illustrations, "
                "vibrant gradient background. Perfect square 1:1 aspect ratio."
            )
            retry_stages = []
            if photos:
                # Стадия A: убираем фото, оставляем оригинальный текст
                retry_stages.append(("no-photo", [{"type": "text", "text": prompt}]))
            # Стадия B: полностью нейтральный промпт без ниши (последний шанс)
            retry_stages.append(("neutral-fallback", [{"type": "text", "text": fallback_prompt}]))

            recovered = False
            for stage_name, retry_content in retry_stages:
                print(f"[AI Image] safety block — retry stage: {stage_name}")
                retry_payload = dict(payload)
                retry_payload["messages"] = [{"role": "user", "content": retry_content}]
                try:
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        async with session.post(OPENROUTER_URL, json=retry_payload, headers=headers) as resp:
                            result = await resp.json()
                except aiohttp.ClientError as e:
                    print(f"[AI Image] retry {stage_name} network error: {e}")
                    continue
                if not result.get("error"):
                    recovered = True
                    break
                err2 = result["error"]
                msg2 = err2.get("message", "") if isinstance(err2, dict) else str(err2)
                print(f"[AI Image] retry {stage_name} failed: {msg2[:200]}")

            if not recovered:
                # Все ретраи провалились — сообщаем юзеру честно
                if photos:
                    raise HTTPException(
                        status_code=422,
                        detail=("ИИ отклонил и фото, и нейтральный fallback (safety-фильтр). "
                                "Попробуйте другое фото — без лиц — и смените описание "
                                "канала на более общее."),
                    )
                raise HTTPException(
                    status_code=422,
                    detail=("ИИ отклонил запрос даже с нейтральным промптом. "
                            "Скорее всего временный сбой safety-фильтра — попробуйте "
                            "через 5-10 минут."),
                )
            # успех на одной из стадий — идём ниже извлекать картинку
        else:
            raise HTTPException(status_code=502, detail=f"Ошибка ИИ: {msg[:200]}")

    message = result.get("choices", [{}])[0].get("message", {})

    # OpenRouter возвращает изображения в message.images[]
    images = message.get("images", [])
    if images:
        url = images[0].get("image_url", {}).get("url", "")
        if url:
            print(f"[AI Design] Got image from 'images' field, len={len(url)}")
            return url

    # Фоллбэк: проверяем content на image parts
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


async def save_image_result(image_result: str, filepath: str):
    """Сохраняет результат генерации (data URL, http URL или base64) в файл."""
    import base64

    if image_result.startswith("data:"):
        b64_data = image_result.split("base64,", 1)[1]
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(b64_data))
    elif image_result.startswith("http"):
        async with aiohttp.ClientSession() as s:
            async with s.get(image_result) as resp:
                with open(filepath, "wb") as f:
                    f.write(await resp.read())
    elif len(image_result) > 200:
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(image_result))
    else:
        raise HTTPException(status_code=500, detail="Не удалось сохранить изображение")
