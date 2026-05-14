"""3 статьи на основе CheckList:
1. Как создать канал в MAX (steps[1..6])
2. Как оформить канал в MAX (steps_manual[1..5])
3. Как оформить канал в MAX при помощи ИИ (steps_ai[1..6])

Скрипт:
1. Скачивает картинки CheckList в /app/uploads (если не было)
2. Кладёт их в blog_screenshots с предсказуемыми slug (checklist-{kind}-step{N})
3. Через Sonnet 4 генерирует SEO-статью на основе шагов, ссылаясь на скрины
   через <img data-screenshot-slug='...'>
4. Кладёт статьи как draft. Старая «kak-oformit-kanal-v-max-cherez-neyroset»
   (id=48 если есть) заменяется новой версией.

Запуск (внутри контейнера channel-ads):
  docker exec channel-ads python3 /tmp/checklist_articles.py
"""
import asyncio, json, os, re, secrets, hashlib
import aiohttp, asyncpg

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "anthropic/claude-sonnet-4"
UPLOAD_DIR = "/app/uploads"


# Источник: frontend-react/src/pages/CheckListPage.jsx
STEPS_CREATE = [
    ("checklist-create-step1",
     "Создайте закрытый канал в MAX",
     "Откройте MAX, создайте новый закрытый канал — он будет основой для вашей аудитории.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/258/h/fc9788f53d94ae47abc3bd4a568142d7.png"),
    ("checklist-create-step2",
     "Введите название канала",
     "Придумайте короткое и понятное название — оно будет первым, что увидят подписчики.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/479/h/60a99f27c130128595648d8bb39633f2.png"),
    ("checklist-create-step3",
     "Авторизуйтесь в MAX Маркетинг",
     "Перейдите по ссылке max.pkmarketing.ru/login и войдите через MAX.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/55/h/c0053f91797d4036fcc3f6706909c41b.png"),
    ("checklist-create-step4",
     "Добавьте канал в сервис",
     "Во вкладке «Обзор» нажмите «Добавить канал» и следуйте инструкции.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/388/h/9f30ff9dda49c82af3a2c7cb3c4d128e.png"),
    ("checklist-create-step5",
     "Добавьте бота «ПКРеклама» в подписчики канала",
     "Найдите бота в MAX и подпишите его на ваш канал.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/203/h/c526cf2ffedb41bc8596829610922fb4.png"),
    ("checklist-create-step6",
     "Сделайте бота администратором канала",
     "Это нужно чтобы сервис мог публиковать посты, считать аналитику и управлять закрепами.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/384/h/7fa7785dace1ef321f9c2ac0a8ce742b.png"),
]

STEPS_AI = [
    ("checklist-ai-step1",
     "Откройте раздел «ИИ Оформление»",
     "В сайдбаре найдите «ИИ Оформление» в категории Маркетинг.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/294/h/b813e6ba0ee9d8d91f7b5dba8b471048.png"),
    ("checklist-ai-step2",
     "Заполните анкету о канале",
     "Укажите сферу, цвета, стиль, ссылку для связи и пожелания. Загрузите фото если хотите чтобы оно было использовано.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/178/h/f9d721ef29d8df0879b7348bc7954b81.png"),
    ("checklist-ai-step3",
     "Выберите аватар и описание",
     "ИИ сгенерирует 9 аватаров и несколько вариантов описания. Нажмите «Применить и продолжить».",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/95/h/7941cf5fd00b0403d880e9f1c9e75021.png"),
    ("checklist-ai-step4",
     "Лид-магнит — подарок за подписку",
     "Можете загрузить файл с вашими постами из других соцсетей и описать чего хотите. Нажмите «Сгенерировать варианты».",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/62/h/60cbcc092c5251507b2430db13e262a1.png"),
    ("checklist-ai-step5",
     "Выберите лид-магнит",
     "ИИ предложит несколько вариантов готового лид-магнита — выберите подходящий.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/343/h/13f0e91caff513d8dd3b12d5e6ec7e98.png"),
    ("checklist-ai-step6",
     "Получите готовый лид-магнит и пост-закреп",
     "Нажмите «Установить» — система автоматически опубликует закреп с кнопкой лид-магнита в канале.",
     None),
]

STEPS_MANUAL = [
    ("checklist-manual-step1",
     "Сгенерируйте 9 аватаров через ПК Маркетинг",
     "Откройте «Фото 2.0» в сервисе ПК Маркетинг (pkmarketing.ru) и используйте промт: «Сгенерируй мне 9 аватарок для канала в тематике (Ваша тематика). Сделай эти картинки сеткой 3х3.»",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/16/h/9fd325772320a73d389986ea01bb5929.png"),
    ("checklist-manual-step2",
     "Установите аватарку и описание в канале",
     "Скачайте понравившуюся аватарку и установите её в канале MAX через настройки. Также добавьте описание канала.",
     None),
    ("checklist-manual-step3",
     "Создайте лид-магнит",
     "Перейдите в раздел «Закрепы» → «Лид-магниты» в MAX Маркетинг. Загрузите PDF-файл (полезный материал для подписчиков).",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/102/h/29d4081f52c297ba0af6517f67a3680f.png"),
    ("checklist-manual-step4",
     "Создайте закреп с кнопкой лид-магнита",
     "В разделе «Закрепы» создайте новый закреп с текстом-приглашением и кнопкой «Получить лид-магнит».",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/280/h/d72817e032b29f22b1d8cbfd0b8f5eb0.png"),
    ("checklist-manual-step5",
     "Нажмите «Опубликовать»",
     "Бот ПКРеклама опубликует пост в вашем канале и закрепит его. Подписчики увидят закреп при заходе.",
     "https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/356/h/1b773db23842303ec920411817685005.png"),
]

ARTICLE_DEFS = [
    {
        "slug": "kak-sozdat-kanal-v-max-poshagovaya-instrukciya",
        "category_id": 1,
        "title": "Как создать канал в MAX и подключить к сервису: пошаговая инструкция",
        "main_query": "как создать канал в max (1 451)",
        "extra": "как сделать канал в max (966), создание канала в max, max ru создать канал, бот для канала max",
        "steps": STEPS_CREATE,
        "intro_hook": "Если вы хотите запустить канал в мессенджере MAX и сразу подключить его к сервису автоматизации — эта инструкция для вас. Пошагово разберём как создать закрытый канал, придумать название, авторизоваться в личном кабинете и подключить бота ПКРеклама — после этого канал готов к публикациям, рассылкам, аналитике и монетизации.",
        "kind": "create",
    },
    {
        "slug": "kak-oformit-kanal-v-max",
        "category_id": 1,
        "title": "Как оформить канал в MAX: аватарка, описание и лид-магнит за 30 минут",
        "main_query": "оформление канала в max",
        "extra": "название канала в max, как оформить канал, аватарка для канала max, лид-магнит подписчикам",
        "steps": STEPS_MANUAL,
        "intro_hook": "Расскажу как оформить канал в MAX без дизайнера: сгенерируем 9 вариантов аватарки в сервисе ПК Маркетинг, установим лучший в канал и сразу подключим лид-магнит — пост-закреп с кнопкой получения PDF-подарка для подписчиков. На всё уходит 30 минут.",
        "kind": "manual",
    },
    {
        "slug": "kak-oformit-kanal-v-max-pri-pomoschi-ii",
        "category_id": 3,
        "title": "Как оформить канал в MAX при помощи ИИ за 5 минут",
        "main_query": "оформление канала в max нейросеть",
        "extra": "ИИ оформление канала, аватарка нейросетью, описание канала ИИ, лид-магнит автоматом",
        "steps": STEPS_AI,
        "intro_hook": "В сервисе MAX Маркетинг есть инструмент «ИИ Оформление» (150 ИИ-токенов = 450 руб) — он за один клик генерирует 9 вариантов аватарки, описание канала и готовый лид-магнит с пост-закрепом. Покажу пошагово на скриншотах.",
        "kind": "ai",
    },
]


SYSTEM_PROMPT = """Ты SEO-копирайтер блога MAX Маркетинг (max.pkmarketing.ru/blog).
Сервис автоматизирует работу с каналами в мессенджере MAX. Бот в MAX
называется ПКРеклама.

🚨 ПРАВИЛА БРЕНДА:
- Бот → «ПКРеклама» (НЕ PKMarketing, НЕ ПКМаркетинг, НЕ PK Business)
- Сервис/админка → «MAX Маркетинг» (с пробелом)
- Домен → max.pkmarketing.ru
- Сервис ПК Маркетинг (pkmarketing.ru) — отдельный сервис для генерации
  обложек/аватарок через ИИ. Это разные сервисы.

🎯 СТИЛЬ статьи:
- От 1 лица: «расскажу», «открываем», «у меня в канале»
- Лёгкая разговорная подача
- Конкретные шаги в UI с указанием куда нажать
- В конце — призыв «Подключите канал к MAX Маркетинг через max.pkmarketing.ru
  — 2 дня бесплатно + 50 ИИ-токенов»

🎯 SEO:
- meta_title до 60 символов с главным запросом
- meta_description 150-160 символов
- excerpt 1-2 предложения
- Главный запрос — в первом абзаце
- Доп. запросы — в H2-заголовках

🎯 СТРУКТУРА body (без <h1>):
1. Введение из 1-2 абзацев — ИСПОЛЬЗУЙ переданный intro_hook
2. <h2>Что нужно перед началом</h2> — список требований (1-3 пункта)
3. <h2>Пошаговая инструкция</h2>
4. На каждый шаг из переданного списка:
   <h3>Шаг N. {заголовок шага}</h3>
   <p>{развёрнутое описание + советы — расширь короткое desc до 2-3 предложений}</p>
   <img data-screenshot-slug='{slug-шага}' />
   <p><em>{короткая подпись скриншота}</em></p>
5. <h2>Что дальше</h2> — что делать после завершения (1-2 абзаца)
6. <h2>Часто задаваемые вопросы</h2> с 3-4 H3-вопросами
7. CTA: «Подключите канал к MAX Маркетинг через max.pkmarketing.ru —
   2 дня бесплатно + 50 ИИ-токенов»

🎯 HTML body:
- Только: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>,
  <a href='...'>, <blockquote>, <img data-screenshot-slug>
- В атрибутах ОДИНАРНЫЕ кавычки '...'
- Никаких <h1>, <div>, <span>, классов, стилей

ОТВЕТ — JSON-объект (без ```):
{"title":"...","meta_title":"...","meta_description":"...","excerpt":"...",
 "tags":["..."],"body":"<p>...</p>..."}
"""


async def download_image(url: str, session) -> str | None:
    """Скачивает картинку в /uploads/checklist_<hash>.png. Возвращает имя файла."""
    if not url:
        return None
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    ext = ".png"
    if ".jpg" in url.lower() or ".jpeg" in url.lower(): ext = ".jpg"
    fname = f"checklist_{h}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    if os.path.exists(path) and os.path.getsize(path) > 100:
        return fname
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
            if r.status != 200:
                print(f"   ✗ download {url} HTTP {r.status}")
                return None
            data = await r.read()
        with open(path, "wb") as f:
            f.write(data)
        print(f"   ✓ downloaded {fname} ({len(data) // 1024} KB)")
        return fname
    except Exception as e:
        print(f"   ✗ download {url}: {e}")
        return None


async def upsert_screenshot(pool, slug: str, title: str, file_url: str, alt_text: str):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM blog_screenshots WHERE slug=$1", slug)
        if existing:
            await conn.execute(
                "UPDATE blog_screenshots SET title=$1, file_url=$2, alt_text=$3, updated_at=NOW() WHERE slug=$4",
                title, file_url, alt_text, slug,
            )
        else:
            await conn.execute(
                "INSERT INTO blog_screenshots (slug, title, file_url, alt_text) VALUES ($1,$2,$3,$4)",
                slug, title, file_url, alt_text,
            )
        # И в hints, чтобы у админа было русское описание если он откроет
        await conn.execute(
            "INSERT INTO blog_screenshot_hints (slug, description_ru) VALUES ($1,$2) "
            "ON CONFLICT (slug) DO UPDATE SET description_ru=EXCLUDED.description_ru",
            slug, alt_text,
        )


async def call_openrouter(article, api_key, session):
    steps_payload = "\n".join(
        f"  Шаг {i+1}. slug='{slug}' | заголовок: «{title}» | desc: {desc}"
        for i, (slug, title, desc, _img) in enumerate(article["steps"])
    )
    user_prompt = f"""ТЕМА: {article['title']}
SLUG: {article['slug']}
ГЛАВНЫЙ ЗАПРОС: {article['main_query']}
ДОП. ЗАПРОСЫ: {article['extra']}

INTRO_HOOK (используй в первом абзаце почти дословно):
{article['intro_hook']}

ШАГИ (используй ровно эти, в этом порядке, с этими slug-ами для скринов):
{steps_payload}

Напиши статью по правилам системного промпта."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.5,
        "max_tokens": 8000,
        "response_format": {"type": "json_object"},
    }
    async with session.post(OPENROUTER_URL, json=payload, headers=headers,
                             timeout=aiohttp.ClientTimeout(total=300)) as r:
        data = await r.json()
    if data.get("error"):
        raise RuntimeError(f"OR error: {data['error']}")
    raw = data["choices"][0]["message"]["content"].strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw)


def normalize_quotes(html: str) -> str:
    if not html: return html
    return re.sub(
        r"([a-zA-Z\-]+)='([^']*)'",
        lambda m: m.group(0) if '"' in m.group(2) else f'{m.group(1)}="{m.group(2)}"',
        html,
    )


async def insert_article(pool, art, gen):
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM blog_articles WHERE slug=$1", art["slug"])
        params = (
            art["category_id"], gen["title"], gen.get("excerpt") or "",
            gen.get("meta_title") or gen["title"], gen.get("meta_description") or "",
            gen["body"], gen.get("tags") or [],
        )
        if existing:
            await conn.execute(
                """UPDATE blog_articles SET category_id=$1, title=$2, excerpt=$3, meta_title=$4,
                   meta_description=$5, body=$6, tags=$7, updated_at=NOW(), status='published',
                   published_at=COALESCE(published_at, NOW())
                   WHERE id=$8""",
                *params, existing["id"],
            )
            return int(existing["id"])
        row = await conn.fetchrow(
            """INSERT INTO blog_articles (category_id, title, excerpt, meta_title,
                meta_description, body, tags, slug, status, published_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'published',NOW()) RETURNING id""",
            *params, art["slug"],
        )
        return int(row["id"])


async def main():
    api_key = os.environ["OPENROUTER_API_KEY"]
    db_url = os.environ["DATABASE_URL"]
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    pool = await asyncpg.create_pool(db_url)

    # 1. Скачиваем все картинки + создаём blog_screenshots
    print("=== Шаг 1: скачивание картинок и регистрация скриншотов ===", flush=True)
    async with aiohttp.ClientSession() as session:
        for art in ARTICLE_DEFS:
            for slug, title, desc, img_url in art["steps"]:
                if not img_url:
                    continue
                fname = await download_image(img_url, session)
                if fname:
                    file_url = f"/uploads/{fname}"
                    await upsert_screenshot(pool, slug, title, file_url, title)

    # 2. Перед генерацией третьей — удалим старую статью с перекрывающимся слугом, если есть
    async with pool.acquire() as conn:
        for old_slug in ("kak-oformit-kanal-v-max-cherez-neyroset", "kak-sozdat-kanal-v-max-poshagovaya-instrukciya"):
            await conn.execute("DELETE FROM blog_articles WHERE slug=$1", old_slug)

    # 3. Генерируем статьи
    print("\n=== Шаг 2: генерация 3 статей через Claude Sonnet 4 ===", flush=True)
    async with aiohttp.ClientSession() as session:
        for art in ARTICLE_DEFS:
            print(f"  • {art['slug']} …", flush=True)
            try:
                gen = await call_openrouter(art, api_key, session)
                if "body" in gen:
                    gen["body"] = normalize_quotes(gen["body"])
                aid = await insert_article(pool, art, gen)
                words = len(re.sub(r'<[^>]+>', ' ', gen.get("body", "")).split())
                print(f"     ✓ id={aid} | {words} слов | {gen.get('title')}", flush=True)
            except Exception as e:
                print(f"     ✗ FAIL: {e}", flush=True)

    await pool.close()
    print("\n✓ Готово", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
