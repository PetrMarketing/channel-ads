"""Генерирует русское описание для каждого скриншот-слуга, упомянутого
в статьях блога. Сохраняет в blog_screenshot_hints — оно показывается
в админке («Нужны скрины») вместо технического slug.

Запуск: docker exec channel-ads python3 /tmp/gen_hints.py
"""
import asyncio, os, re, json
import aiohttp, asyncpg

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "anthropic/claude-sonnet-4"
CONCURRENCY = 5

PROMPT_TMPL = """Ты помогаешь админу сервиса PK Business понять, что должно быть на скриншоте.

Технический slug: {slug}
Скриншот используется в этих статьях про мессенджер MAX:
{articles}

Напиши ОДНО короткое предложение по-русски (10-15 слов) — что именно
должно быть на скриншоте. Пиши конкретно, как инструкцию для съёмки.

Примеры хороших описаний:
- "Главный экран MAX со списком чатов, в верхней панели — иконка поиска"
- "Кнопка «Создать канал» в меню MAX, выделена красной рамкой"
- "Дашборд PK Business на max.pkmarketing.ru → раздел «Аналитика»"

Если в slug упоминается pk-business — это скрин админки сервиса
(домен max.pkmarketing.ru), а не самого MAX-приложения.

ОТВЕТ: только одно предложение, без префиксов и кавычек."""


async def gen_hint(slug: str, articles: list, api_key: str, session, sema):
    async with sema:
        articles_str = "\n".join(f"  - {a}" for a in articles[:5])
        prompt = PROMPT_TMPL.format(slug=slug, articles=articles_str)
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": MODEL, "messages": [{"role":"user","content":prompt}],
                   "temperature": 0.3, "max_tokens": 80}
        try:
            async with session.post(OPENROUTER_URL, json=payload, headers=headers) as r:
                d = await r.json()
            if d.get("error"):
                return slug, None, str(d["error"])
            text = d["choices"][0]["message"]["content"].strip()
            # Чистим возможные кавычки/префиксы
            text = re.sub(r'^["\'«]+|["\'»]+$', '', text).strip()
            return slug, text, None
        except Exception as e:
            return slug, None, str(e)


async def main():
    api_key = os.environ["OPENROUTER_API_KEY"]
    db_url = os.environ["DATABASE_URL"]
    pool = await asyncpg.create_pool(db_url)

    # Собираем все slug-и из статей + тайтлы статей
    rows = await pool.fetch(
        "SELECT id, title, body FROM blog_articles WHERE body LIKE '%data-screenshot-slug=%'"
    )
    slug_to_articles = {}
    for r in rows:
        for s in set(re.findall(r'data-screenshot-slug=["\']([^"\']+)["\']', r["body"] or "")):
            slug_to_articles.setdefault(s, []).append(r["title"])

    # Отбрасываем уже описанные
    existing = await pool.fetch("SELECT slug FROM blog_screenshot_hints")
    have = {r["slug"] for r in existing}
    todo = [(s, a) for s, a in slug_to_articles.items() if s not in have]
    print(f"Всего slug-ов: {len(slug_to_articles)}, уже описано: {len(have)}, нужно: {len(todo)}", flush=True)

    if not todo:
        await pool.close()
        return

    sema = asyncio.Semaphore(CONCURRENCY)
    timeout = aiohttp.ClientTimeout(total=300)
    done_count = 0
    async with aiohttp.ClientSession(timeout=timeout) as session:
        tasks = [gen_hint(slug, articles, api_key, session, sema) for slug, articles in todo]
        for coro in asyncio.as_completed(tasks):
            slug, hint, err = await coro
            done_count += 1
            if err:
                print(f"  [{done_count}/{len(todo)}] ✗ {slug}: {err[:100]}", flush=True)
                continue
            await pool.execute(
                "INSERT INTO blog_screenshot_hints (slug, description_ru) VALUES ($1,$2) "
                "ON CONFLICT (slug) DO UPDATE SET description_ru=EXCLUDED.description_ru",
                slug, hint,
            )
            if done_count % 20 == 0 or done_count == len(todo):
                print(f"  [{done_count}/{len(todo)}] {slug} → {hint[:60]}…", flush=True)

    await pool.close()
    print(f"\n✓ Готово: {done_count} описаний", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
