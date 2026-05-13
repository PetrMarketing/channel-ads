"""Генератор статей блога v2 — формат как в примере про RUTUBE.

Каждая статья жёстко привязана к ОДНОЙ фиче сервиса MAX Маркетинг
из support_kb.py. ИИ использует выдержку из базы знаний как источник
правды о шагах в UI, чтобы не выдумывать.

Стиль:
- От первого лица ("Приветствую!", "я расскажу", "у меня в канале")
- Конкретный кейс с цифрами
- Пошаговая инструкция в личном кабинете на max.pkmarketing.ru
- Указание стоимости в токенах и рублях (100 токенов = 300 руб)
- Бонус-блок с дополнительной фичей
- Бесплатный период: 2 дня
- Бренд: бот ПКРеклама, сервис MAX Маркетинг, домен max.pkmarketing.ru

Запуск:
  docker exec channel-ads python3 /tmp/gen_v2.py
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

SYSTEM_PROMPT = """Ты опытный SEO-копирайтер и продакт-маркетолог сервиса MAX Маркетинг
(блог на max.pkmarketing.ru/blog). Сервис автоматизирует работу с каналами
в мессенджере MAX: постинг, ИИ-генерация контента, рассылки, лид-магниты,
платные подписки, магазины, аналитика.

🚨 ЖЁСТКИЕ ПРАВИЛА БРЕНДА (нельзя нарушать):
- Бот в MAX → пиши ТОЛЬКО «ПКРеклама» (НЕ «PKMarketing», НЕ «PK Business»,
  НЕ «ПКМаркетинг», НЕ «ПК Маркетинг»)
- Сервис / личный кабинет → «MAX Маркетинг» (с пробелом, НЕ «MAXМаркетинг»)
- Домен → max.pkmarketing.ru (НЕ pkmarketing.ru, НЕ itcakes.ru)
- Бесплатный период → «2 дня бесплатно» (не 3, не 7)
- Цена ИИ-токенов → 100 токенов за 300 руб, 300 за 800 руб, 1000 за 2550 руб

🎯 СТИЛЬ — как у блогера-эксперта (см. эталон ниже):
- От 1 лица: «приветствую», «я расскажу», «у меня в канале», «открываю»
- ОДИН конкретный мини-кейс с реалистичной цифрой (например: «у меня
  канал набрал 3 200 подписчиков за месяц», «потратил 80 токенов = 240 руб»)
- Сравнение «дизайнер vs самостоятельно vs через MAX Маркетинг» — в пользу
  сервиса (быстро, дёшево, без ТЗ)
- Конкретные шаги в UI: «В левом меню → раздел Контент → Публикации»
- Цена за каждое действие в токенах и рублях
- Лёгкая разговорная интонация — будто советуешь другу

🎯 ЭТАЛОН-ОТРЫВОК (как должна звучать статья):
«Приветствую! Если вы продвигаете бизнес в мессенджере MAX и устали
писать посты вручную — вы попали по адресу. В этой статье я расскажу,
как генерировать контент-план на месяц за 5 минут с помощью сервиса
MAX Маркетинг.
[...]
Стоимость сессии — 200 ИИ-токенов. В переводе на обычные деньги это
всего 600 рублей за 30 готовых постов с картинками.»

🎯 SEO-ТРЕБОВАНИЯ:
- meta_title до 60 символов с главным запросом
- meta_description 150-160 символов, цепляюще, с главным запросом
- excerpt 1-2 предложения для карточки и OG
- Главный запрос — в первом абзаце статьи (естественно, не в лоб)
- Дополнительные запросы — вплетай в H2-заголовки и тело
- LSI: подписчики, аудитория, мессенджер, бот, токены

🎯 СТРУКТУРА body (без <h1> — он отрендерится из title):
1. Приветствие + краткий анонс (что узнает читатель)
2. <h2>Зачем [фича]?</h2> — мотивация + статистика/мини-кейс
3. <h2>Что нужно настроить</h2> — список требований/опций
4. <h2>Как это сделать через MAX Маркетинг: пошаговая инструкция</h2>
   - Ссылка на сервис: <a href='https://max.pkmarketing.ru'>max.pkmarketing.ru</a>
   - Упомяни «после регистрации — 2 дня бесплатно + 50 токенов»
5. <h3>Шаг 1. [действие]</h3> + текст + <img data-screenshot-slug='...' />
6. <h3>Шаг 2. ...</h3> ... — минимум 4-5 шагов с скрин-слотами
7. <h2>Важные моменты</h2> — 3-5 советов как из опыта
8. <h2>Бонус: [связанная функция]</h2> — упомяни смежную фичу сервиса
9. <h2>Заключение</h2> — что получает пользователь, призыв попробовать

🎯 HTML-РАЗМЕТКА body:
- Разрешены: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>,
  <blockquote>, <img data-screenshot-slug>
- НИКАКИХ <h1>, <html>, <body>, <head>, <style>, <script>, <div>, <span>
- Никаких inline-стилей, классов, id
- В HTML-АТРИБУТАХ ТОЛЬКО ОДИНАРНЫЕ КАВЫЧКИ '...'
  (это критично для JSON-парсинга)
- Скриншоты: <img data-screenshot-slug='описательный-slug-en' />
  (latin, через дефис; используй ОДИНАКОВЫЙ slug если речь об одном экране
  в разных статьях — например `lk-left-menu`, `ai-content-new-session-btn`)
  После каждой картинки — подпись: <p><em>Подпись скриншота</em></p>

🎯 ИСТОЧНИК ПРАВДЫ ПО ШАГАМ — ВЫДЕРЖКА ИЗ БАЗЫ ЗНАНИЙ СЕРВИСА.
Тебе передадут точные UI-шаги для нужного раздела. ИСПОЛЬЗУЙ ИХ как
скелет «Шаг 1, Шаг 2…». Не выдумывай меню/кнопки которых нет в выдержке.
Можно перефразировать живее, но факты (где находится, сколько токенов,
какая последовательность) — строго из выдержки.

ОТВЕТ — JSON-объект (без ```-обёрток):
{"title":"...","meta_title":"...","meta_description":"...",
 "excerpt":"...","tags":["..."],"body":"<p>...</p>..."}
"""


# Категории: 1=Каналы MAX, 2=Реклама, 3=ИИ, 4=Заработок, 5=Обновления, 6=Кейсы
# Каждая запись: (slug, cat, topic, main, extra, words, kb_keys, is_case)
# kb_keys = подстроки разделов из support_kb которые нужно вырезать
ARTICLES = [
    # ----- ИИ Оформление, посты, картинки, контент-план -----
    {"slug":"kak-oformit-kanal-v-max-cherez-neyroset","cat":3,
     "topic":"Как оформить канал в MAX через нейросеть за 5 минут",
     "main":"оформление канала в max",
     "extra":"название канала в max (276), как оформить канал, аватарка для канала, дизайн канала max",
     "words":1500, "kb_keys":["--- ИИ ОФОРМЛЕНИЕ ---"]},

    {"slug":"kak-napisat-post-v-max-cherez-neyroset","cat":3,
     "topic":"Как написать пост для канала MAX через нейросеть за 10 секунд",
     "main":"как сделать пост в max (115)",
     "extra":"генерация поста, ИИ для поста, нейросеть пост, написать пост в максе",
     "words":1500, "kb_keys":["--- ПУБЛИКАЦИИ", "--- ИИ ГЕНЕРАЦИЯ В ОБЫЧНОМ ПОСТЕ ---"]},

    {"slug":"kak-sgenerirovat-kartinku-dlya-posta-max","cat":3,
     "topic":"Как сгенерировать картинку для поста в канале MAX через ИИ",
     "main":"картинка для поста max",
     "extra":"иллюстрация для канала, нейросеть рисует, генерация изображения max",
     "words":1300, "kb_keys":["--- ИИ ГЕНЕРАЦИЯ В ОБЫЧНОМ ПОСТЕ ---"]},

    {"slug":"kontent-plan-dlya-kanala-max-cherez-ii","cat":3,
     "topic":"Как сделать контент-план для канала MAX на месяц за 5 минут через ИИ",
     "main":"контент план канал max",
     "extra":"план постов на месяц, идеи постов max, ИИ контент канал, расписание публикаций",
     "words":1800, "kb_keys":["--- РАЗДЕЛ «ИИ КОНТЕНТ»"]},

    {"slug":"kak-zaplanirovat-post-v-max-na-nedelyu","cat":3,
     "topic":"Как запланировать пост в канале MAX на день, неделю или месяц",
     "main":"как сделать отложенный пост в max",
     "extra":"планировщик постов, расписание публикаций, отложенный пост max, календарь",
     "words":1300, "kb_keys":["--- ПУБЛИКАЦИИ"]},

    # ----- Закрепы, лид-магниты, рассылки, воронки -----
    {"slug":"kak-zakrepit-post-v-kanale-max-s-knopkami","cat":1,
     "topic":"Как закрепить пост в канале MAX с кнопками — пошаговая инструкция",
     "main":"как закрепить пост в max",
     "extra":"закрепление поста, закреплённый пост, лид-магнит, кнопки в посте",
     "words":1400, "kb_keys":["--- ЗАКРЕПЫ И ЛИД-МАГНИТЫ ---"]},

    {"slug":"kak-razdat-lid-magnit-podpischikam-max","cat":1,
     "topic":"Как раздать лид-магнит (PDF/чек-лист) подписчикам канала MAX",
     "main":"лид магнит для канала",
     "extra":"раздать pdf, бесплатный материал, бонус подписчику, чек-лист в обмен на подписку",
     "words":1400, "kb_keys":["--- ЗАКРЕПЫ И ЛИД-МАГНИТЫ ---"]},

    {"slug":"kak-sdelat-rassylku-podpischikam-kanala-max","cat":1,
     "topic":"Как сделать массовую рассылку подписчикам канала в MAX",
     "main":"рассылка в max",
     "extra":"массовая рассылка, рассылка через бота, личные сообщения подписчикам, broadcast",
     "words":1500, "kb_keys":["--- РАССЫЛКИ ---"]},

    {"slug":"voronka-prodazh-v-max-avtotseplochka","cat":1,
     "topic":"Воронка продаж в MAX: автоцепочка сообщений после подписки на лид-магнит",
     "main":"воронка продаж в максе",
     "extra":"автоматическая рассылка, прогревающая цепочка, серия сообщений, drip-кампания",
     "words":1600, "kb_keys":["--- ВОРОНКИ ---", "--- ЗАКРЕПЫ И ЛИД-МАГНИТЫ ---"]},

    # ----- Розыгрыши, комментарии -----
    {"slug":"kak-provesti-rozygrysh-v-kanale-max","cat":1,
     "topic":"Как провести розыгрыш в канале MAX — без ручного выбора победителя",
     "main":"розыгрыш в канале max",
     "extra":"конкурс в max, рандомайзер подписчиков, розыгрыш призов",
     "words":1300, "kb_keys":["--- РОЗЫГРЫШИ ---"]},

    {"slug":"kak-otvechat-na-kommentarii-v-kanale-max","cat":1,
     "topic":"Как модерировать и отвечать на комментарии в канале MAX из одного окна",
     "main":"комментарии в канале max (866)",
     "extra":"как сделать комментарии в канале max, как открыть комментарии max, модерация",
     "words":1500, "kb_keys":["--- КОММЕНТАРИИ ---"]},

    # ----- Реклама, ОРД, трекинг, лендинги, аналитика -----
    {"slug":"markirovka-reklamy-v-max-i-poluchenie-erid","cat":2,
     "topic":"Маркировка рекламы в MAX и получение ERID за 3 минуты",
     "main":"маркировка рекламы в max (93)",
     "extra":"ОРД, ERID, как промаркировать рекламный пост, закон о рекламе",
     "words":1700, "kb_keys":["--- ОТЧЁТЫ О РЕКЛАМЕ (ОРД) ---"]},

    {"slug":"kak-otsledit-otkuda-prishli-podpischiki-kanala-max","cat":2,
     "topic":"Как отследить откуда приходят подписчики в канал MAX (UTM-метки)",
     "main":"трекинг подписчиков max",
     "extra":"utm метки канал, аналитика рекламы, источники трафика, конверсия",
     "words":1500, "kb_keys":["--- ТРЕКИНГ-ССЫЛКИ ---"]},

    {"slug":"kak-sdelat-lending-pod-reklamu-kanala-max","cat":2,
     "topic":"Как сделать лендинг под рекламу канала MAX через ИИ за 2 минуты",
     "main":"лендинг для канала max",
     "extra":"посадочная страница, ai лендинг, страница продажи, lp для рекламы",
     "words":1500, "kb_keys":["--- ИИ ЛЕНДИНГ ---", "--- ТРЕКИНГ-ССЫЛКИ ---"]},

    {"slug":"statistika-kanala-v-max-chto-smotret","cat":2,
     "topic":"Статистика канала в MAX: что смотреть и как улучшать показатели",
     "main":"статистика каналов в max (89)",
     "extra":"аналитика канала max, метрики канала, рост подписчиков, конверсия",
     "words":1400, "kb_keys":["--- АНАЛИТИКА ---", "--- ДАШБОРД ---"]},

    # ----- Заработок (платные чаты, магазин, услуги) -----
    {"slug":"platnyj-kanal-v-max-podpiska-za-dengi","cat":4,
     "topic":"Как сделать платный канал в MAX и получать оплату от подписчиков",
     "main":"платный канал в max (54)",
     "extra":"подписка на канал за деньги, paywall, эксклюзивный контент max, монетизация",
     "words":1700, "kb_keys":["--- ПЛАТНЫЕ ЧАТЫ ---"]},

    {"slug":"internet-magazin-v-max-cherez-mini-app","cat":4,
     "topic":"Как открыть интернет-магазин в MAX через MiniApp — каталог, корзина, оплата",
     "main":"магазин в max (2 972)",
     "extra":"интернет магазин max (220), магазин в приложении max (231), mini app max (298)",
     "words":2000, "kb_keys":["--- МАГАЗИН ---"]},

    {"slug":"onlayn-zapis-na-uslugi-cherez-kanal-max","cat":4,
     "topic":"Онлайн-запись на услуги через канал MAX — для салонов, врачей, мастеров",
     "main":"онлайн запись через мессенджер",
     "extra":"запись клиентов, расписание специалистов, mini app услуги max, записаться онлайн",
     "words":1500, "kb_keys":["--- УСЛУГИ И ЗАПИСЬ ---"]},

    {"slug":"kak-zarabotat-na-rekomendaciyax-max-marketing","cat":4,
     "topic":"Как заработать на рекомендациях сервиса MAX Маркетинг — реферальная программа",
     "main":"реферальная программа max",
     "extra":"партнёрская программа, заработок на ссылках, комиссия за приглашение",
     "words":1300, "kb_keys":["--- РЕФЕРАЛЬНАЯ ПРОГРАММА ---"]},

    {"slug":"kak-snizit-cenu-tarifa-kanala-v-max","cat":4,
     "topic":"Как снизить цену тарифа канала MAX через прокачку уровня — до 23%",
     "main":"тариф канала max",
     "extra":"скидка на тариф, прокачать канал, дешевле подписка, уровни канала",
     "words":1300, "kb_keys":["--- ТАРИФЫ ---", "ЦЕНА ПО УРОВНЮ КАНАЛА", "ВКЛАДКА \"ПРОГРЕСС\""]},

    # ----- Сотрудники, доступы -----
    {"slug":"kak-dat-dostup-k-kanalu-max-sotrudniku","cat":1,
     "topic":"Как дать доступ к каналу MAX сотруднику без передачи пароля",
     "main":"доступ к каналу max сотрудник",
     "extra":"делегирование канала max, роли в команде, smm-менеджеру доступ, без пароля",
     "words":1300, "kb_keys":["--- СОТРУДНИКИ ---"]},

    # ----- Достижения, гонка -----
    {"slug":"top-kanalov-max-kak-popast-i-poluchit-bonusy","cat":1,
     "topic":"Топ каналов MAX — как попасть в гонку и получить 60 дней бесплатно",
     "main":"популярные каналы в max (487)",
     "extra":"топ каналов в max (74), рейтинг каналов max, гонка каналов, достижения",
     "words":1500, "kb_keys":["--- ДОСТИЖЕНИЯ КАНАЛА", "ВКЛАДКА \"ГОНКА КАНАЛОВ\""]},

    # ----- Обновления -----
    {"slug":"mini-app-v-max-chto-eto-i-kak-ispolzovat","cat":5,
     "topic":"Mini-app в MAX: что это и как использовать для бизнеса (с примерами)",
     "main":"mini app max (298)",
     "extra":"max открыть mini app кнопкой, миниприложение max, веб-приложение в максе",
     "words":1600, "kb_keys":["--- МАГАЗИН ---", "--- УСЛУГИ И ЗАПИСЬ ---"]},

    {"slug":"novye-vozmozhnosti-max-2026-obzor","cat":5,
     "topic":"Новые возможности MAX в 2026: каналы, mini-app, монетизация — что нового",
     "main":"новые каналы max (459)",
     "extra":"в max появились каналы (233), новые каналы в мессенджере max, обновления MAX",
     "words":1500, "kb_keys":[]},  # обзорная — без UI-шагов

    # ----- Кейсы (формат истории, не how-to) -----
    {"slug":"kejs-1500-podpischikov-na-kanal-max-za-mesyac","cat":6,
     "topic":"Кейс: как контент-план через ИИ в MAX дал 1500 подписчиков за 30 дней",
     "main":"продвижение канала max кейс",
     "extra":"набрать подписчиков, рост канала, реальные цифры, ИИ контент план",
     "words":1500, "kb_keys":["--- РАЗДЕЛ «ИИ КОНТЕНТ»"], "is_case":True},

    {"slug":"kejs-50000-na-platnom-kanale-max","cat":6,
     "topic":"Кейс: 50 000 ₽ в месяц с платного канала в MAX через ПКРеклама",
     "main":"платный чат max заработок кейс",
     "extra":"эксклюзивный контент, монетизация аудитории, paywall в max",
     "words":1500, "kb_keys":["--- ПЛАТНЫЕ ЧАТЫ ---"], "is_case":True},

    {"slug":"kejs-magazin-v-max-pervye-zakazy","cat":6,
     "topic":"Кейс: запустили магазин в MAX за 3 дня — 12 заказов на 47 000 ₽ за неделю",
     "main":"магазин в max кейс",
     "extra":"первые продажи, миниапп, оплата, интернет-магазин mini app",
     "words":1500, "kb_keys":["--- МАГАЗИН ---"], "is_case":True},

    {"slug":"kejs-voronka-v-max-konversiya-38-procentov","cat":6,
     "topic":"Кейс: воронка из 7 шагов в MAX дала 38% конверсию в платный канал",
     "main":"воронка max кейс конверсия",
     "extra":"автосерия сообщений, лид-магнит, прогрев, конверсия в покупку",
     "words":1500, "kb_keys":["--- ВОРОНКИ ---", "--- ЗАКРЕПЫ И ЛИД-МАГНИТЫ ---", "--- ПЛАТНЫЕ ЧАТЫ ---"], "is_case":True},
]


# ----- Утилиты -----
def load_kb() -> str:
    path = "/app/backend-python/app/services/support_kb.py"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def extract_kb_section(kb_text: str, section_marker: str) -> str:
    """Возвращает блок от строки с section_marker до следующего '--- ' или конца."""
    lines = kb_text.split("\n")
    out, capture = [], False
    for line in lines:
        if section_marker in line:
            capture = True
            out.append(line)
            continue
        if capture:
            # Конец секции = новая шапка ровного формата '--- ИМЯ ---' или '=== ИМЯ ==='
            if (line.startswith("--- ") and section_marker not in line) or line.startswith("==="):
                break
            out.append(line)
    return "\n".join(out).strip()


def build_kb_excerpt(kb_text: str, keys: list) -> str:
    if not keys:
        return "(Это обзорная статья — UI-шаги не требуются, опиши общие принципы и анонсируй разделы сервиса MAX Маркетинг.)"
    parts = []
    for k in keys:
        chunk = extract_kb_section(kb_text, k)
        if chunk:
            parts.append(chunk)
    return "\n\n".join(parts) if parts else "(база знаний — не нашлось ключей, опиши на основе общего знания о сервисе)"


async def call_openrouter(article: dict, kb_excerpt: str, api_key: str, session) -> dict:
    is_case = article.get("is_case", False)
    user_prompt = f"""ТЕМА СТАТЬИ: {article['topic']}
SLUG (уже задан): {article['slug']}
ГЛАВНЫЙ ЗАПРОС WORDSTAT: {article['main']}
ДОПОЛНИТЕЛЬНЫЕ ЗАПРОСЫ: {article['extra']}
ОБЪЁМ: {article['words']} слов
{'ФОРМАТ: КЕЙС (история с цифрами + раздел «Что не сработало» + выводы)' if is_case else 'ФОРМАТ: HOW-TO (пошаговая инструкция со скриншотами)'}

📚 ВЫДЕРЖКА ИЗ БАЗЫ ЗНАНИЙ СЕРВИСА — используй как источник правды для шагов:
=========================================================================
{kb_excerpt}
=========================================================================

Напиши статью по правилам системного промпта. Вставь минимум 4 скриншот-слота.
Используй ОДНУ конкретную цифру в кейсе (например количество подписчиков,
сумму заработка, потраченные токены)."""

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
    if re.search(r'\bPK\s*Marketing\b|\bPetr\s*Marketing\b|\bPKMarketing\b|\bПК\s*Маркетинг\b|\bПКМаркетинг\b|\bPK\s*Business\b', sanitized, re.I):
        issues.append("Найдено старое имя бота — должно быть «ПКРеклама»")
    if re.search(r'\bMAXМаркетинг\b', sanitized):
        issues.append("Найдено «MAXМаркетинг» — должно быть «MAX Маркетинг»")
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
            generated.get("meta_description") or "",
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


async def process_one(idx, total, art, kb_text, sema, api_key, session, pool, results):
    async with sema:
        print(f"[{idx}/{total}] START {art['slug']}", flush=True)
        try:
            kb_excerpt = build_kb_excerpt(kb_text, art.get("kb_keys", []))
            gen = await call_openrouter(art, kb_excerpt, api_key, session)
            if "body" in gen:
                gen["body"] = normalize_html_quotes(gen["body"])
            issues = validate_brand(gen.get("body", ""), gen.get("title", ""), gen.get("excerpt", ""))
            ss = extract_screenshot_slugs(gen.get("body", ""))
            words = len(re.sub(r'<[^>]+>', ' ', gen.get("body", "")).split())
            aid = await insert_article(pool, art, gen)
            print(f"[{idx}/{total}] ✓ id={aid} {art['slug']} | {words} слов | {len(ss)} скрин-слотов | issues={len(issues)}", flush=True)
            if issues:
                for iss in issues:
                    print(f"      ⚠ {iss}", flush=True)
            results.append({"slug": art["slug"], "id": aid, "ok": True, "words": words, "screens": ss, "issues": issues, "title": gen.get("title")})
        except Exception as e:
            print(f"[{idx}/{total}] ✗ {art['slug']}: {e}", flush=True)
            results.append({"slug": art["slug"], "ok": False, "error": str(e)})


async def main():
    api_key = os.environ["OPENROUTER_API_KEY"]
    db_url = os.environ["DATABASE_URL"]
    kb_text = load_kb()
    pool = await asyncpg.create_pool(db_url)
    sema = asyncio.Semaphore(CONCURRENCY)
    results = []
    timeout = aiohttp.ClientTimeout(total=600)
    print(f"=== Генерация {len(ARTICLES)} статей через {MODEL} (concurrency={CONCURRENCY}) ===", flush=True)
    print(f"=== База знаний: {len(kb_text)} символов ===", flush=True)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        await asyncio.gather(*[
            process_one(i + 1, len(ARTICLES), art, kb_text, sema, api_key, session, pool, results)
            for i, art in enumerate(ARTICLES)
        ])
    await pool.close()

    ok = [r for r in results if r.get("ok")]
    fail = [r for r in results if not r.get("ok")]
    print(f"\n=== ИТОГ ===")
    print(f"  ✓ успешно: {len(ok)}")
    print(f"  ✗ ошибки:  {len(fail)}")
    issues_sum = sum(len(r.get("issues") or []) for r in ok)
    print(f"  ⚠ brand issues: {issues_sum}")
    for r in fail:
        print(f"    - {r['slug']}: {r.get('error','?')[:200]}")
    all_ss = {}
    for r in ok:
        for s in r.get("screens", []):
            all_ss.setdefault(s, []).append(r.get("title"))
    print(f"  Уникальных скрин-слотов: {len(all_ss)}")
    reused = {s: t for s, t in all_ss.items() if len(t) > 1}
    print(f"  Переиспользуются: {len(reused)}")


if __name__ == "__main__":
    asyncio.run(main())
