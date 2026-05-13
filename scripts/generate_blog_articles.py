"""Одноразовый генератор стартовых статей блога через OpenRouter (Claude Sonnet 4).

Запуск ВНУТРИ контейнера channel-ads:
  docker exec channel-ads python3 /app/scripts/generate_blog_articles.py

Генерирует JSON-статью на каждую тему из ARTICLES, валидирует HTML, кладёт в
blog_articles как draft. После ручной проверки и добавления скриншотов — публикуется.
"""
import asyncio
import json
import os
import re
import sys

import aiohttp
import asyncpg

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "anthropic/claude-sonnet-4"

SYSTEM_PROMPT = """Ты SEO-копирайтер пишешь длинную статью для блога сервиса PK Business
(блог: max.pkmarketing.ru/blog). Сервис помогает админам каналов в мессенджере
MAX автоматизировать работу — постинг, рассылки, аналитика, монетизация.

ЖЁСТКИЕ ПРАВИЛА БРЕНДА В ТЕКСТЕ (не нарушать ни в одном предложении!):
- Бот, который подключают к каналу — называй ТОЛЬКО "ПКРеклама"
  (НЕ "PKMarketing", НЕ "PK Business" применительно к боту, НЕ "Petr Marketing")
- SaaS-сервис / личный кабинет — "PK Business"
- Все ссылки на сервис ведут на https://max.pkmarketing.ru (никогда на itcakes.ru)
- В CTA используй формулировку:
  "Подключите бота ПКРеклама к каналу через max.pkmarketing.ru — 2 дня бесплатно"

SEO-ТРЕБОВАНИЯ:
- meta_title до 60 символов, с главным запросом
- meta_description: 150-160 символов, цепляюще, с главным запросом и доп. ключами
- excerpt: 1-2 предложения для карточки и OG
- Главный запрос ОБЯЗАТЕЛЬНО в первом абзаце статьи
- Доп. запросы вплетай в H2-заголовки и тело
- Используй LSI: подписчики, аудитория, мессенджер, Россия, ru, чат

СТРУКТУРА СТАТЬИ (body, без <h1> — он отрендерится из title):
1. Введение: 2-3 абзаца. В первом — главный запрос. Чем полезна статья.
2. 4-7 разделов <h2> с подзаголовками. Каждый раздел: текст + список или скриншот.
3. Скриншоты: вставляй как <img data-screenshot-slug="ЧТО-НА-СКРИНЕ" />
   - slug: латиница через дефис, кратко описывает что на скрине
   - Например: max-create-channel-button, pk-business-dashboard-stats
   - После каждого <img> — подпись: <p><em>Подпись скриншота</em></p>
   - Минимум 4 скриншота на статью
4. Заключение / выводы (h2)
5. CTA-абзац (см. формулировку выше)
6. <h2>Часто задаваемые вопросы</h2> + 4-6 пар <h3>вопрос?</h3><p>ответ</p>

HTML-РАЗМЕТКА body:
- Разрешённые теги: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>,
  <blockquote>, <img data-screenshot-slug>
- НИКАКИХ <h1>, <html>, <body>, <head>, <style>, <script>, <div>, <span>
- Никаких inline-стилей, классов, id
- В HTML-АТРИБУТАХ ИСПОЛЬЗУЙ ТОЛЬКО ОДИНАРНЫЕ КАВЫЧКИ '...' (НЕ двойные ").
  Пример: <a href='https://max.pkmarketing.ru'>...</a>
  Пример: <img data-screenshot-slug='max-create-channel' />
  Это критично для корректного JSON-ответа.

ОТВЕТ СТРОГО В JSON-ОБЪЕКТЕ БЕЗ ```-обёрток и без поясняющего текста:
{
  "title": "Заголовок страницы (до 70 симв)",
  "meta_title": "SEO title (до 60 симв)",
  "meta_description": "150-160 символов, призыв и ключи",
  "excerpt": "1-2 предложения для карточки",
  "tags": ["канал-в-max", "ещё-2-3-тега"],
  "body": "<p>...</p><h2>...</h2>..."
}
"""


# Категории (id из blog_categories): 1=Каналы MAX, 2=Реклама, 3=ИИ, 4=Заработок, 5=Обновления, 6=Кейсы
ARTICLES = [
    {
        "slug": "kanaly-v-max-chto-eto-kak-podpisatsya-i-najti",
        "category_id": 1,
        "topic": "Каналы в MAX: что это, как подписаться и найти нужный канал",
        "main_query": "каналы в max (24 877 запросов в месяц)",
        "extra_queries": "max ru каналы (2705), max мессенджер каналы (1530), как найти канал в max (393), где каналы в max (338)",
        "target_words": 1800,
    },
    {
        "slug": "kak-sozdat-kanal-v-max-poshagovaya-instrukciya",
        "category_id": 1,
        "topic": "Как создать канал в MAX: пошаговая инструкция со скриншотами",
        "main_query": "как создать канал в max (1 451 запросов)",
        "extra_queries": "как сделать канал в max (966), создание канала в max (245), max ru создать канал (136), как сделать канал в мессенджере max (106)",
        "target_words": 2000,
    },
    {
        "slug": "reklama-v-max-messendzhere-polnyy-gayd-2026",
        "category_id": 2,
        "topic": "Реклама в мессенджере MAX в 2026: где, как и сколько стоит",
        "main_query": "реклама в max (1 800 запросов)",
        "extra_queries": "как запустить рекламу в max, реклама на канале max, биржа рекламы max, стоимость рекламы в max каналах",
        "target_words": 2200,
    },
    {
        "slug": "magazin-v-max-kak-sozdat-i-prodavat-cherez-kanal",
        "category_id": 4,
        "topic": "Магазин в MAX: как создать витрину и продавать через канал",
        "main_query": "магазин в max (3 000 запросов)",
        "extra_queries": "как открыть магазин в max, как продавать в max, max бизнес-аккаунт, магазин на канале макс",
        "target_words": 1800,
    },
    {
        "slug": "pochemu-max-ne-otpravlyaet-video-i-kak-ispravit",
        "category_id": 5,
        "topic": "Почему MAX не отправляет видео и как это исправить",
        "main_query": "почему макс не отправляет видео (2 000 запросов)",
        "extra_queries": "max не загружает видео, не загружается видео в max, не отправляются видео в max, max ошибка отправки",
        "target_words": 1500,
    },
]


async def call_openrouter(article: dict, api_key: str) -> dict:
    user_prompt = f"""Тема статьи: {article['topic']}
Главный запрос (Wordstat): {article['main_query']}
Дополнительные запросы: {article['extra_queries']}
Целевой объём: {article['target_words']} слов
Slug статьи (уже задан): {article['slug']}

Напиши SEO-статью под эту тему по правилам системного промпта."""

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.6,
        "max_tokens": 8000,
        "response_format": {"type": "json_object"},
    }
    timeout = aiohttp.ClientTimeout(total=300)
    async with aiohttp.ClientSession(timeout=timeout) as s:
        async with s.post(OPENROUTER_URL, json=payload, headers=headers) as r:
            data = await r.json()

    if data.get("error"):
        raise RuntimeError(f"OpenRouter error: {data['error']}")
    raw = data["choices"][0]["message"]["content"].strip()
    # Чистим возможные ```json ``` обёртки
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        # Пытаемся извлечь JSON-кусок
        m = re.search(r'\{.*\}', raw, re.S)
        if not m:
            raise RuntimeError(f"Не вышло распарсить JSON. Raw: {raw[:500]}") from e
        parsed = json.loads(m.group(0))
    return parsed


def normalize_html_quotes(html: str) -> str:
    """Sonnet может писать атрибуты в одинарных кавычках — приводим к двойным,
    чтобы редактор и читалка работали единообразно."""
    if not html:
        return html
    # Меняем одинарные кавычки в HTML-атрибутах на двойные (упрощённо: только
    # для шаблона attr='value' где value не содержит ", иначе оставляем).
    def _sub(m):
        attr, val = m.group(1), m.group(2)
        if '"' in val:
            return m.group(0)
        return f"{attr}=\"{val}\""
    return re.sub(r"([a-zA-Z\-]+)='([^']*)'", _sub, html)


def extract_screenshot_slugs(html: str) -> list:
    return sorted(set(re.findall(r'data-screenshot-slug=["\']([^"\']+)["\']', html or "")))


def validate_brand(html: str, title: str, excerpt: str) -> list:
    """Проверяет правила бренда. Возвращает список нарушений."""
    text = " ".join([html or "", title or "", excerpt or ""])
    # Сначала вырежем разрешённые упоминания в URL — они НЕ нарушение.
    sanitized = re.sub(r'max\.pkmarketing\.ru', '__OK_DOMAIN__', text, flags=re.I)
    sanitized = re.sub(r'pkmarketing\.ru', '__OK_DOMAIN__', sanitized, flags=re.I)
    issues = []
    if re.search(r'\bPK\s*Marketing\b|\bPetr\s*Marketing\b|\bPKMarketing\b', sanitized, re.I):
        issues.append("PKMarketing/PK Marketing/Petr Marketing — должно быть 'ПКРеклама' для бота")
    if "itcakes" in sanitized.lower():
        issues.append("Найдено itcakes.ru — должно быть max.pkmarketing.ru")
    return issues


async def insert_article(pool, article: dict, generated: dict) -> int:
    """Вставляет статью как draft. Возвращает id."""
    async with pool.acquire() as conn:
        # На случай повторного запуска — обновляем существующий черновик
        existing = await conn.fetchrow(
            "SELECT id FROM blog_articles WHERE slug = $1", article["slug"]
        )
        params = dict(
            category_id=article["category_id"],
            slug=article["slug"],
            title=generated["title"],
            excerpt=generated.get("excerpt") or "",
            meta_title=generated.get("meta_title") or generated["title"],
            meta_description=generated.get("meta_description") or generated.get("excerpt") or "",
            body=generated["body"],
            tags=generated.get("tags") or [],
        )
        if existing:
            await conn.execute(
                """UPDATE blog_articles SET
                   category_id=$1, title=$2, excerpt=$3, meta_title=$4,
                   meta_description=$5, body=$6, tags=$7, updated_at=NOW(),
                   status='draft'
                   WHERE id=$8""",
                params["category_id"], params["title"], params["excerpt"],
                params["meta_title"], params["meta_description"],
                params["body"], params["tags"], existing["id"],
            )
            return int(existing["id"])
        row = await conn.fetchrow(
            """INSERT INTO blog_articles
                (category_id, slug, title, excerpt, meta_title, meta_description,
                 body, tags, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id""",
            params["category_id"], params["slug"], params["title"],
            params["excerpt"], params["meta_title"], params["meta_description"],
            params["body"], params["tags"],
        )
        return int(row["id"])


async def main():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    db_url = os.environ.get("DATABASE_URL")
    if not api_key or not db_url:
        print("ERROR: OPENROUTER_API_KEY и DATABASE_URL должны быть в env", file=sys.stderr)
        sys.exit(1)

    pool = await asyncpg.create_pool(db_url)
    print(f"=== Генерация {len(ARTICLES)} статей через {MODEL} ===\n")

    all_screenshots = {}  # slug -> [список заголовков статей]
    summary = []

    for i, art in enumerate(ARTICLES, 1):
        print(f"[{i}/{len(ARTICLES)}] {art['slug']}")
        print(f"   тема: {art['topic']}")
        try:
            gen = await call_openrouter(art, api_key)
        except Exception as e:
            print(f"   ❌ FAILED: {e}\n")
            summary.append({"slug": art["slug"], "status": "fail", "error": str(e)})
            continue

        # Нормализуем кавычки в HTML и валидируем
        if "body" in gen:
            gen["body"] = normalize_html_quotes(gen["body"])
        issues = validate_brand(gen.get("body", ""), gen.get("title", ""), gen.get("excerpt", ""))
        ss = extract_screenshot_slugs(gen.get("body", ""))
        word_count = len(re.sub(r'<[^>]+>', ' ', gen.get("body", "")).split())

        if issues:
            print(f"   ⚠️  brand issues: {'; '.join(issues)}")

        try:
            aid = await insert_article(pool, art, gen)
        except Exception as e:
            print(f"   ❌ DB error: {e}\n")
            summary.append({"slug": art["slug"], "status": "db_fail", "error": str(e)})
            continue

        for s in ss:
            all_screenshots.setdefault(s, []).append(gen.get("title", art["slug"]))

        print(f"   ✓ inserted id={aid} | {word_count} слов | {len(ss)} скринов | issues={len(issues)}")
        print(f"     title: {gen.get('title','')}")
        print(f"     meta_desc: {gen.get('meta_description','')[:80]}…\n")
        summary.append({
            "id": aid, "slug": art["slug"], "title": gen.get("title"),
            "words": word_count, "screenshots": ss, "issues": issues,
            "status": "ok",
        })

    await pool.close()

    # Финальный отчёт
    print("\n=" * 1, "=" * 60, sep="")
    print("ИТОГ")
    print("=" * 60)
    for s in summary:
        if s["status"] == "ok":
            print(f"✓ #{s['id']} {s['slug']} — {s['words']} слов, {len(s['screenshots'])} скрин-слотов")
        else:
            print(f"✗ {s['slug']} — {s.get('error','?')}")

    print(f"\nВсего УНИКАЛЬНЫХ скриншотов нужно: {len(all_screenshots)}")
    print("Список slug'ов скриншотов и где используются:")
    for slug, where in sorted(all_screenshots.items()):
        print(f"  • {slug}")
        for t in where:
            print(f"      ↳ {t}")


if __name__ == "__main__":
    asyncio.run(main())
