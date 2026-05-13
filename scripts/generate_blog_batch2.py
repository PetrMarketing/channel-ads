"""Генерация всех оставшихся статей по плану (42 шт.) через Claude Sonnet 4.

Идемпотентно: повторный запуск UPDATE'ит существующие черновики по slug.
Параллелизм: 3 запроса одновременно (sema), чтобы не ловить rate limit.

Запуск:
  docker exec channel-ads python3 /tmp/gen_batch2.py
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
CONCURRENCY = 3

SYSTEM_PROMPT_HOWTO = """Ты SEO-копирайтер пишешь длинную статью для блога сервиса PK Business
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
3. Скриншоты: вставляй как <img data-screenshot-slug='ЧТО-НА-СКРИНЕ' />
   - slug: латиница через дефис, кратко описывает что на скрине
   - Используй ОДИНАКОВЫЕ slug-и для одинаковых скринов между статьями!
     Например: max-create-channel-button (везде где упоминается эта кнопка)
   - После каждого <img> — подпись: <p><em>Подпись скриншота</em></p>
   - Минимум 3-5 скриншотов на статью
4. Заключение / выводы (h2)
5. CTA-абзац (см. формулировку выше)
6. <h2>Часто задаваемые вопросы</h2> + 4-6 пар <h3>вопрос?</h3><p>ответ</p>

HTML-РАЗМЕТКА body:
- Разрешённые теги: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>,
  <blockquote>, <img data-screenshot-slug>
- НИКАКИХ <h1>, <html>, <body>, <head>, <style>, <script>, <div>, <span>
- Никаких inline-стилей, классов, id
- В HTML-АТРИБУТАХ ИСПОЛЬЗУЙ ТОЛЬКО ОДИНАРНЫЕ КАВЫЧКИ '...' (НЕ двойные ").
  Это критично для корректного JSON-ответа.

ОТВЕТ СТРОГО В JSON-ОБЪЕКТЕ БЕЗ ```-обёрток:
{"title": "...", "meta_title": "...", "meta_description": "...",
 "excerpt": "...", "tags": ["..."], "body": "<p>...</p>..."}
"""

# Для кейсовых статей — другой угол: рассказ-история, цифры, выводы
SYSTEM_PROMPT_CASE = SYSTEM_PROMPT_HOWTO.replace(
    "СТРУКТУРА СТАТЬИ (body, без <h1>",
    """ЭТО КЕЙС — пиши как историю с цифрами:
1. Введение: контекст канала (тематика, аудитория, исходные данные)
2. Цели — что хотели, какие KPI
3. <h2>Стратегия / что сделали</h2> — 3-5 H2-блоков с конкретными шагами
4. Скриншоты дашбордов / результата
5. <h2>Цифры и результаты</h2> — таблица или список с метриками
6. <h2>Что НЕ сработало</h2> — честный блок об ошибках (повышает доверие)
7. <h2>Выводы и применимость</h2> — что повторить читателю
8. CTA + FAQ

Все цифры — реалистичные (например 1000 подписчиков за 30 дней,
50000₽ за месяц с платного чата) но укажи, что это пример, а не реклама гарантий.

СТРУКТУРА СТАТЬИ (body, без <h1>"""
)


# Категории: 1=Каналы MAX, 2=Реклама, 3=ИИ, 4=Заработок, 5=Обновления, 6=Кейсы
ARTICLES = [
    # ----- Каналы MAX (cat 1) -----
    {"slug":"kak-sdelat-kanal-publichnym-v-max","cat":1,"topic":"Как сделать канал в MAX публичным и пригласить подписчиков","main":"как создать публичный канал в max (274)","extra":"публичный канал в max (825), открытый канал в max (419), как сделать открытый канал в max (40)","words":1500},
    {"slug":"chem-otlichaetsya-kanal-ot-gruppy-v-max","cat":1,"topic":"Канал, группа или приватный канал в MAX — в чём разница","main":"чем отличается канал от группы в max (61)","extra":"max чем отличается группа от приватного канала, что такое приватный канал в max, группы и каналы в max","words":1500},
    {"slug":"nazvanie-kanala-v-max-kak-pridumat","cat":1,"topic":"Название канала в MAX: как придумать запоминающееся (с примерами)","main":"название канала в max (276)","extra":"как назвать канал в max (56)","words":1200},
    {"slug":"kak-podelitsya-kanalom-i-sdelat-qr-kod-v-max","cat":1,"topic":"Как поделиться каналом в MAX через ссылку и QR-код","main":"ссылка на канал в max (706)","extra":"как сделать ссылку на канал max (105), max создать ссылку на канал, qr код на канал в max","words":1300},
    {"slug":"nastrojki-kanala-v-max-vse-opcii","cat":1,"topic":"Настройки канала в MAX: разбираем все опции","main":"настройки канала в max (100)","extra":"как настроить канал в max, управление каналом в max","words":1500},
    {"slug":"statistika-kanala-v-max-kak-smotret","cat":1,"topic":"Статистика канала в MAX: где посмотреть и что важно","main":"статистика каналов в max (89)","extra":"аналитика каналов max (166), сколько каналов в max","words":1300},
    {"slug":"kak-udalit-kanal-v-max","cat":1,"topic":"Как удалить канал в MAX навсегда","main":"как удалить канал в max (273)","extra":"как убрать каналы в max, как удалить каналы в чате max","words":1100},
    {"slug":"populyarnye-kanaly-v-max-2026","cat":1,"topic":"Популярные каналы в MAX 2026: обновляемая подборка","main":"популярные каналы в max (487)","extra":"топ каналов в max, max каналы список, интересные каналы в max","words":1500},
    {"slug":"kommentarii-v-kanale-max-vklyuchit-otklyuchit","cat":1,"topic":"Комментарии в канале MAX: как включить, отключить и модерировать","main":"комментарии в канале max (866)","extra":"как сделать комментарии в канале max, как включить комментарии в канале max, как добавить комментарии в канале max, как открыть комментарии в канале max","words":1500},
    {"slug":"kak-pisat-v-kanal-max","cat":1,"topic":"Как писать в канал MAX: форматирование, эмодзи, markdown","main":"как писать в канал max (104)","extra":"форматирование текста max, разметка текста max","words":1000},
    {"slug":"kak-zaregistrirovat-kanal-v-max","cat":1,"topic":"Как зарегистрировать канал в MAX: пошагово для новичков","main":"как зарегистрировать канал в max (70)","extra":"регистрация канала max","words":1000},
    {"slug":"kak-podklyuchit-kanal-max","cat":1,"topic":"Как подключить канал MAX к сервисам автоматизации","main":"как подключить канал max (153)","extra":"подключение канала max, бот для канала max","words":1200},
    {"slug":"kak-perevesti-kanal-v-max","cat":1,"topic":"Как перенести канал из Telegram или другого мессенджера в MAX","main":"перенести канал в max (66)","extra":"переход на max, миграция канала","words":1100},
    {"slug":"kak-iskat-kanaly-v-max","cat":1,"topic":"Как искать каналы в MAX: 5 способов найти нужный","main":"как искать каналы в max (48)","extra":"поиск каналов max, найти канал","words":900},
    {"slug":"kak-otpisatsya-ot-kanala-v-max","cat":1,"topic":"Как отписаться от канала в MAX и удалить из списка","main":"как в max отписаться от канала (52)","extra":"отписка от канала max","words":900},
    {"slug":"kak-zablokirovan-kanal-v-max","cat":1,"topic":"Заблокировали канал в MAX: что делать и как восстановить","main":"заблокировали канал в max (80)","extra":"блокировка канала, разблокировка max, апелляция","words":1100},

    # ----- Реклама каналов MAX (cat 2) -----
    {"slug":"kak-zapustit-reklamu-v-max-cherez-yandex-direct","cat":2,"topic":"Как запустить рекламу в MAX через Яндекс Директ — пошагово","main":"как запустить рекламу в max (15)","extra":"реклама в max через яндекс директ, яндекс директ реклама max, яндекс запустил размещение рекламы в мессенджере max","words":1800},
    {"slug":"kupit-reklamu-v-kanale-max","cat":2,"topic":"Где купить рекламу в каналах MAX и как не ошибиться","main":"купить рекламу в max (67)","extra":"сколько стоит реклама в max, биржа рекламы max, размещение рекламы в max","words":1500},
    {"slug":"markirovka-reklamy-v-max-erid","cat":2,"topic":"Маркировка рекламы в MAX и получение ERID — гайд 2026","main":"маркировка рекламы в max (93)","extra":"как промаркировать рекламный пост в max, ОРД, ERID","words":1500},
    {"slug":"targetirovannaya-reklama-v-max","cat":2,"topic":"Таргетированная реклама в MAX: возможности и ограничения","main":"таргетированная реклама в max (23)","extra":"таргет в max, настройка таргетинга","words":1300},
    {"slug":"prodvizhenie-kanala-max-besplatno","cat":2,"topic":"Как продвигать канал в MAX бесплатно — 12 рабочих способов","main":"продвижение канала в max (105)","extra":"как продвигать канал в max, как продвинуть канал в max","words":1800},

    # ----- ИИ для MAX (cat 3) -----
    {"slug":"kak-sdelat-post-v-max-cherez-ii","cat":3,"topic":"Как сделать пост в MAX через ИИ — за 2 минуты вместо 30","main":"как сделать пост в max (115)","extra":"ИИ генерация постов, контент для канала","words":1300},
    {"slug":"kak-otredaktirovat-post-v-max","cat":3,"topic":"Как отредактировать пост в MAX (и переписать через ИИ)","main":"как отредактировать пост в max (11)","extra":"редактировать пост max, переписать текст","words":900},
    {"slug":"kak-zakrepit-post-v-max","cat":3,"topic":"Как закрепить пост в MAX и сделать «эффективный закреп»","main":"как закрепить пост в max (29)","extra":"закреплённый пост, pinned post max","words":1000},
    {"slug":"kak-sdelat-otlozhennyj-post-v-max","cat":3,"topic":"Отложенный пост в MAX: как запланировать публикацию","main":"как сделать отложенный пост в max (5)","extra":"планировщик постов, расписание публикаций","words":1100},
    {"slug":"kak-sdelat-knopki-na-postakh-v-max","cat":3,"topic":"Кнопки под постами в MAX: типы, примеры, как настроить","main":"как настроить кнопки на постах в max (6)","extra":"inline-кнопки, CTA-кнопки, callback","words":1100},
    {"slug":"ii-kontent-plan-dlya-max-na-mesyac","cat":3,"topic":"Как сделать ИИ-контент план для канала MAX на месяц за 5 минут","main":"контент план канал max","extra":"ИИ для канала, генерация идей, нейросеть для постов","words":1300},
    {"slug":"ii-generaciya-kartinok-dlya-postov-max","cat":3,"topic":"ИИ-генерация картинок для постов в MAX: как делать сразу к каждому","main":"картинки для постов max","extra":"генерация изображений нейросетью, иллюстрации для канала","words":1200},
    {"slug":"kak-delat-svoi-stikery-v-max","cat":3,"topic":"Как делать свои стикеры в MAX — и где их брать готовыми","main":"как делать свои стикеры в макс (806)","extra":"стикеры max канал (160), создать стикеры","words":1500},

    # ----- Заработок на MAX (cat 4) -----
    {"slug":"kak-zarabotat-na-kanale-v-max","cat":4,"topic":"Как заработать на канале в MAX: 7 моделей монетизации","main":"как заработать на канале max","extra":"монетизация, доход с канала, продажа рекламы","words":1800},
    {"slug":"monetizaciya-kanala-v-max-ofitsialno","cat":4,"topic":"Монетизация каналов в MAX через Яндекс — как подключить","main":"монетизация канала max (84)","extra":"яндекс запускает тестовую монетизацию каналов в max, max каналы дзен","words":1500},
    {"slug":"internet-magazin-v-max-cherez-mini-app","cat":4,"topic":"Интернет-магазин в MAX через MiniApp: каталог, корзина, оплата","main":"интернет магазин в max (220)","extra":"магазин в приложении max (231), mini app max (298)","words":1700},
    {"slug":"platnyj-kanal-v-max-podpiska-za-dengi","cat":4,"topic":"Платный канал в MAX: как настроить подписку за деньги","main":"платный канал max (54)","extra":"подписка на канал, paywall, эксклюзивный контент","words":1400},
    {"slug":"kanaly-dlya-biznesa-v-max-instrukciya","cat":4,"topic":"Каналы для бизнеса в MAX: пошаговая инструкция","main":"каналы в max для бизнеса (108)","extra":"max для бизнеса создать канал, max для партнеров создать канал, канал в max ип","words":1600},
    {"slug":"kupit-kanal-v-max-prodat-kanal-max","cat":4,"topic":"Купить или продать канал в MAX — где, как и какие риски","main":"купить канал в max (83)","extra":"продам канал в max, продажа каналов max, биржа каналов","words":1400},

    # ----- Обновления (cat 5) -----
    {"slug":"novye-vozmozhnosti-max-2026","cat":5,"topic":"Новые возможности MAX в 2026 — обзор обновлений","main":"новые каналы max (459)","extra":"в max появились каналы (233), новые каналы в мессенджере max","words":1500},
    {"slug":"monetizatsiya-v-max-zapusk-yandex","cat":5,"topic":"Яндекс запустил монетизацию каналов в MAX — что это значит для блогеров","main":"яндекс запускает тестовую монетизацию каналов в max (48)","extra":"яндекс запустил размещение рекламы в мессенджере max","words":1400},
    {"slug":"mini-app-v-max-chto-eto","cat":5,"topic":"Mini-app в MAX: что это и зачем нужно бизнесу","main":"mini app max (298)","extra":"max открыть mini app кнопкой, миниприложение max","words":1500},

    # ----- Кейсы (cat 6) — другой формат -----
    {"slug":"kejs-1000-podpischikov-na-kanal-max-za-mesyac","cat":6,"topic":"Кейс: как привести 1 000 подписчиков на канал MAX за 30 дней","main":"кейс продвижения канала max","extra":"набрать подписчиков, рост канала, реальные цифры","words":1500,"is_case":True},
    {"slug":"kejs-zarabotok-50000-na-platnom-chate-max","cat":6,"topic":"Кейс: 50 000 ₽ в месяц с платного чата в MAX (модель работы)","main":"платный чат max заработок","extra":"эксклюзивный контент, монетизация аудитории","words":1500,"is_case":True},
    {"slug":"kejs-internet-magazin-v-max-pervye-prodazhi","cat":6,"topic":"Кейс: запуск интернет-магазина в MAX за 3 дня и первые 10 заказов","main":"магазин в max кейс","extra":"первые продажи, миниапп, оплата","words":1500,"is_case":True},
    {"slug":"kejs-vysokaya-konversiya-lid-magnita-v-max","cat":6,"topic":"Кейс: лид-магнит с воронкой в MAX дал 38% конверсию в подписку","main":"лид магнит max воронка","extra":"подписная база, рассылка, конверсия","words":1500,"is_case":True},
]


async def call_openrouter(article: dict, api_key: str, session: aiohttp.ClientSession) -> dict:
    is_case = article.get("is_case", False)
    sys_prompt = SYSTEM_PROMPT_CASE if is_case else SYSTEM_PROMPT_HOWTO
    user_prompt = f"""Тема: {article['topic']}
Главный запрос (Wordstat): {article['main']}
Дополнительные запросы: {article['extra']}
Целевой объём: {article['words']} слов
Slug статьи (уже задан): {article['slug']}

Напиши SEO-{'кейс' if is_case else 'гайд'} по правилам системного промпта."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.6,
        "max_tokens": 8000,
        "response_format": {"type": "json_object"},
    }
    async with session.post(OPENROUTER_URL, json=payload, headers=headers) as r:
        data = await r.json()
    if data.get("error"):
        raise RuntimeError(f"OpenRouter error: {data['error']}")
    raw = data["choices"][0]["message"]["content"].strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', raw, re.S)
        if not m:
            raise
        return json.loads(m.group(0))


def normalize_html_quotes(html: str) -> str:
    if not html:
        return html
    def _sub(m):
        attr, val = m.group(1), m.group(2)
        if '"' in val:
            return m.group(0)
        return f"{attr}=\"{val}\""
    return re.sub(r"([a-zA-Z\-]+)='([^']*)'", _sub, html)


def extract_screenshot_slugs(html: str) -> list:
    return sorted(set(re.findall(r'data-screenshot-slug=["\']([^"\']+)["\']', html or "")))


def validate_brand(html: str, title: str, excerpt: str) -> list:
    text = " ".join([html or "", title or "", excerpt or ""])
    sanitized = re.sub(r'max\.pkmarketing\.ru', '__OK__', text, flags=re.I)
    sanitized = re.sub(r'pkmarketing\.ru', '__OK__', sanitized, flags=re.I)
    issues = []
    if re.search(r'\bPK\s*Marketing\b|\bPetr\s*Marketing\b|\bPKMarketing\b', sanitized, re.I):
        issues.append("PKMarketing/PK Marketing — должно быть 'ПКРеклама'")
    if "itcakes" in sanitized.lower():
        issues.append("itcakes.ru — должно быть max.pkmarketing.ru")
    return issues


async def insert_article(pool, article: dict, generated: dict) -> int:
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM blog_articles WHERE slug = $1", article["slug"])
        params = (
            article["cat"],
            generated["title"],
            generated.get("excerpt") or "",
            generated.get("meta_title") or generated["title"],
            generated.get("meta_description") or generated.get("excerpt") or "",
            generated["body"],
            generated.get("tags") or [],
        )
        if existing:
            await conn.execute(
                """UPDATE blog_articles SET category_id=$1, title=$2, excerpt=$3,
                   meta_title=$4, meta_description=$5, body=$6, tags=$7,
                   updated_at=NOW(), status='draft' WHERE id=$8""",
                *params, existing["id"],
            )
            return int(existing["id"])
        row = await conn.fetchrow(
            """INSERT INTO blog_articles (category_id, title, excerpt, meta_title,
                meta_description, body, tags, slug, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id""",
            *params, article["slug"],
        )
        return int(row["id"])


async def process_one(idx, total, art, sema, api_key, session, pool, results):
    async with sema:
        print(f"[{idx}/{total}] START {art['slug']}", flush=True)
        try:
            gen = await call_openrouter(art, api_key, session)
            if "body" in gen:
                gen["body"] = normalize_html_quotes(gen["body"])
            issues = validate_brand(gen.get("body", ""), gen.get("title", ""), gen.get("excerpt", ""))
            ss = extract_screenshot_slugs(gen.get("body", ""))
            words = len(re.sub(r'<[^>]+>', ' ', gen.get("body", "")).split())
            aid = await insert_article(pool, art, gen)
            print(f"[{idx}/{total}] ✓ id={aid} {art['slug']} | {words} слов | {len(ss)} скрин-слотов | issues={len(issues)}", flush=True)
            results.append({"slug": art["slug"], "id": aid, "ok": True, "words": words, "screens": ss, "issues": issues, "title": gen.get("title")})
        except Exception as e:
            print(f"[{idx}/{total}] ✗ {art['slug']}: {e}", flush=True)
            results.append({"slug": art["slug"], "ok": False, "error": str(e)})


async def main():
    api_key = os.environ["OPENROUTER_API_KEY"]
    db_url = os.environ["DATABASE_URL"]
    pool = await asyncpg.create_pool(db_url)
    sema = asyncio.Semaphore(CONCURRENCY)
    results = []
    timeout = aiohttp.ClientTimeout(total=600)
    print(f"=== Генерация {len(ARTICLES)} статей через {MODEL} (concurrency={CONCURRENCY}) ===", flush=True)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        await asyncio.gather(*[
            process_one(i + 1, len(ARTICLES), art, sema, api_key, session, pool, results)
            for i, art in enumerate(ARTICLES)
        ])
    await pool.close()

    # Финальный отчёт
    ok = [r for r in results if r.get("ok")]
    fail = [r for r in results if not r.get("ok")]
    print(f"\n=== ИТОГ ===")
    print(f"  ✓ успешно: {len(ok)}")
    print(f"  ✗ ошибки:  {len(fail)}")
    for r in fail:
        print(f"    - {r['slug']}: {r.get('error','?')[:200]}")

    # Уникальные скриншоты
    all_ss = {}
    for r in ok:
        for s in r.get("screens", []):
            all_ss.setdefault(s, []).append(r.get("title", r["slug"]))
    print(f"\n  Уникальных скрин-слотов в новой партии: {len(all_ss)}")
    # Топ переиспользуемых
    reused = {s: titles for s, titles in all_ss.items() if len(titles) > 1}
    if reused:
        print(f"  Переиспользуются между статьями ({len(reused)}):")
        for s, titles in sorted(reused.items(), key=lambda x: -len(x[1])):
            print(f"    • {s} ({len(titles)} ст.)")

    # Сохраняем JSON-отчёт для последующего markdown
    with open("/tmp/batch2_report.json", "w") as f:
        json.dump({"results": results, "screenshots": {s: t for s, t in all_ss.items()}}, f, ensure_ascii=False, indent=2)
    print("  Полный отчёт: /tmp/batch2_report.json")


if __name__ == "__main__":
    asyncio.run(main())
