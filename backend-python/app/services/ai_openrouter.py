"""Сервис для работы с OpenRouter API — генерация текста и изображений."""
import aiohttp
from fastapi import HTTPException

from ..config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
TEXT_MODEL = "openai/gpt-5.4-nano"


async def openrouter_chat(prompt: str, model: str = None) -> str:
    """Генерация текста через OpenRouter chat completions."""
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


async def openrouter_image_gen(prompt: str, photo_base64: str = None) -> str:
    """Генерация изображения через OpenRouter. Возвращает data URL или http URL."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Формируем сообщение: опционально фото + текст
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

    # Проверяем ошибку API
    if result.get("error"):
        print(f"[AI Design] API error: {result['error']}")
        raise HTTPException(status_code=500, detail=f"OpenRouter error: {result['error']}")

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
