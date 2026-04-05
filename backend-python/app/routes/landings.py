"""Public landing pages — server-rendered HTML."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from ..database import fetch_one, execute

router = APIRouter()

LANDINGS = {
    "max-ads": {
        "title": "Реклама в национальном мессенджере MAX",
        "subtitle": "Автоматизируйте рекламу каналов, отслеживайте подписки и конверсии",
        "hero_badge": "Первая платформа для MAX",
        "features": [
            {"icon": "📊", "title": "Трекинг ссылок", "desc": "Создавайте UTM-ссылки и отслеживайте подписки с точностью до источника"},
            {"icon": "🎯", "title": "Лид-магниты", "desc": "Привлекайте подписчиков бесплатным контентом и конвертируйте в продажи"},
            {"icon": "📢", "title": "Рассылки", "desc": "Массовая отправка с таргетингом по лид-магнитам, датам и розыгрышам"},
            {"icon": "🎰", "title": "Розыгрыши", "desc": "Проводите конкурсы с автоматическим определением победителей"},
            {"icon": "📈", "title": "Аналитика", "desc": "Подписчики, просмотры, ER — вся статистика в одном месте"},
            {"icon": "💳", "title": "Монетизация", "desc": "Платные чаты с 5 эквайрингами: Тинькофф, ЮMoney, Робокасса, Prodamus, GetCourse"},
        ],
        "steps": [
            {"num": "1", "title": "Добавьте бота", "desc": "Откройте канал → Настройки → Администраторы → добавьте бота"},
            {"num": "2", "title": "Настройте рекламу", "desc": "Создайте ссылки, лид-магниты и воронки в личном кабинете"},
            {"num": "3", "title": "Получайте подписчиков", "desc": "Отслеживайте конверсии и масштабируйте рекламу"},
        ],
        "color1": "#7c3aed", "color2": "#4f46e5",
    },
    "max-content": {
        "title": "Автоматизация контента в MAX",
        "subtitle": "Планируйте публикации, создавайте воронки и управляйте контентом каналов",
        "hero_badge": "Контент-календарь для MAX",
        "features": [
            {"icon": "📅", "title": "Контент-календарь", "desc": "Планируйте посты на месяц вперёд с визуальным календарём"},
            {"icon": "📌", "title": "Закрепы", "desc": "Создавайте и публикуйте закреплённые сообщения в один клик"},
            {"icon": "🔄", "title": "Воронки", "desc": "Автоматические серии сообщений после подписки или получения лид-магнита"},
            {"icon": "📊", "title": "Предпросмотр", "desc": "Смотрите как будет выглядеть пост перед публикацией и отправляйте себе тест"},
            {"icon": "✏️", "title": "Редактирование", "desc": "Обновляйте уже опубликованные посты прямо из панели управления"},
            {"icon": "📱", "title": "Мини-приложения", "desc": "Встроенные виджеты записи на услуги и комментариев"},
        ],
        "steps": [
            {"num": "1", "title": "Подключите канал", "desc": "Добавьте бота администратором — канал появится автоматически"},
            {"num": "2", "title": "Создайте контент", "desc": "Запланируйте посты, настройте воронки и лид-магниты"},
            {"num": "3", "title": "Автоматизируйте", "desc": "Система публикует контент по расписанию и ведёт аналитику"},
        ],
        "color1": "#2563eb", "color2": "#0891b2",
    },
    "max-comments": {
        "title": "Комментарии через MAX",
        "subtitle": "Добавьте интерактивные комментарии к постам вашего канала",
        "hero_badge": "Мини-приложение комментариев",
        "features": [
            {"icon": "💬", "title": "Комментарии к постам", "desc": "Подписчики комментируют через встроенное мини-приложение"},
            {"icon": "🎨", "title": "Кастомизация", "desc": "Настройте цвета, фон, градиенты и изображения под ваш бренд"},
            {"icon": "🛡️", "title": "Модерация", "desc": "Управляйте комментариями: удаляйте нежелательные, отслеживайте активность"},
            {"icon": "📊", "title": "Аналитика", "desc": "Считайте вовлечённость и активность подписчиков"},
            {"icon": "🔗", "title": "Встраивание", "desc": "Добавьте кнопку «Комментарии» к любому посту при публикации"},
            {"icon": "👤", "title": "Аватары", "desc": "Автоматические аватары с инициалами и настраиваемыми цветами"},
        ],
        "steps": [
            {"num": "1", "title": "Подключите канал", "desc": "Добавьте бота и настройте оформление комментариев"},
            {"num": "2", "title": "Опубликуйте пост", "desc": "Добавьте кнопку «Комментарии» при создании поста"},
            {"num": "3", "title": "Собирайте отзывы", "desc": "Подписчики комментируют, вы модерируете и анализируете"},
        ],
        "color1": "#059669", "color2": "#0d9488",
    },
}


def _render_landing(slug: str, landing_db: dict) -> str:
    """Render landing page HTML."""
    data = LANDINGS.get(slug, LANDINGS["max-ads"])
    ym_id = landing_db.get("ym_counter_id") or ""
    vk_id = landing_db.get("vk_pixel_id") or ""
    goal_reg = landing_db.get("ym_goal_register") or "register"
    goal_pay = landing_db.get("ym_goal_payment") or "payment"
    lid = landing_db.get("id", 0)
    c1 = data["color1"]
    c2 = data["color2"]

    features_html = ""
    for f in data["features"]:
        features_html += f'''
        <div class="feature-card">
            <div class="feature-icon">{f["icon"]}</div>
            <h3>{f["title"]}</h3>
            <p>{f["desc"]}</p>
        </div>'''

    steps_html = ""
    for s in data["steps"]:
        steps_html += f'''
        <div class="step-card">
            <div class="step-num">{s["num"]}</div>
            <h3>{s["title"]}</h3>
            <p>{s["desc"]}</p>
        </div>'''

    ym_script = ""
    if ym_id:
        ym_script = f'''<script>(function(m,e,t,r,i,k,a){{m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){{if(document.scripts[j].src===r)return}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)}})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym({ym_id},"init",{{clickmap:true,trackLinks:true,accurateTrackBounce:true}});</script>'''

    vk_script = ""
    if vk_id:
        vk_script = f'''<script>!function(){{var t=document.createElement("script");t.type="text/javascript",t.async=!0,t.src="https://top-fwz1.mail.ru/js/code.js",t.onload=function(){{window._tmr=window._tmr||[];window._tmr.push({{id:"{vk_id}",type:"pageView",start:Date.now()}})}},document.head.appendChild(t)}}();</script>'''

    return f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{data["title"]} — MAXМаркетинг</title>
<meta name="description" content="{data["subtitle"]}">
<link rel="icon" href="/favicon.ico">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;line-height:1.6}}
.container{{max-width:1100px;margin:0 auto;padding:0 20px}}
.hero{{background:linear-gradient(135deg,{c1},{c2});color:#fff;padding:80px 20px 60px;text-align:center}}
.hero-badge{{display:inline-block;padding:6px 16px;background:rgba(255,255,255,0.2);border-radius:999px;font-size:0.85rem;font-weight:600;margin-bottom:20px;backdrop-filter:blur(4px)}}
.hero h1{{font-size:clamp(1.8rem,5vw,3rem);font-weight:800;margin-bottom:16px;line-height:1.2}}
.hero p{{font-size:1.1rem;opacity:0.9;max-width:600px;margin:0 auto 32px}}
.cta-btn{{display:inline-block;padding:16px 40px;background:#fff;color:{c1};border-radius:12px;font-size:1.1rem;font-weight:700;text-decoration:none;transition:transform .2s,box-shadow .2s}}
.cta-btn:hover{{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.2)}}
.section{{padding:60px 20px}}
.section-title{{text-align:center;font-size:clamp(1.5rem,3vw,2rem);font-weight:700;margin-bottom:40px}}
.features-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}}
.feature-card{{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;transition:transform .2s,box-shadow .2s}}
.feature-card:hover{{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.08)}}
.feature-icon{{font-size:2rem;margin-bottom:12px}}
.feature-card h3{{font-size:1.1rem;font-weight:700;margin-bottom:8px}}
.feature-card p{{font-size:0.92rem;color:#6b7280}}
.steps{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-top:40px}}
.step-card{{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;text-align:center}}
.step-num{{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,{c1},{c2});color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:800;margin:0 auto 16px}}
.step-card h3{{font-size:1.05rem;font-weight:700;margin-bottom:8px}}
.step-card p{{font-size:0.88rem;color:#6b7280}}
.cta-section{{background:linear-gradient(135deg,{c1},{c2});color:#fff;padding:60px 20px;text-align:center;margin-top:40px}}
.cta-section h2{{font-size:clamp(1.5rem,3vw,2rem);font-weight:700;margin-bottom:16px}}
.cta-section p{{opacity:0.9;margin-bottom:24px;font-size:1rem}}
.cta-section .cta-btn{{background:#fff;color:{c1}}}
.footer{{text-align:center;padding:30px;color:#9ca3af;font-size:0.82rem}}
</style>
{ym_script}
{vk_script}
</head>
<body>
<div class="hero">
    <div class="container">
        <div class="hero-badge">{data["hero_badge"]}</div>
        <h1>{data["title"]}</h1>
        <p>{data["subtitle"]}</p>
        <a href="/login?from={slug}" class="cta-btn" onclick="trackClick()">Попробовать бесплатно</a>
    </div>
</div>

<div class="section" style="background:#f9fafb">
    <div class="container">
        <h2 class="section-title">Возможности</h2>
        <div class="features-grid">
            {features_html}
        </div>
    </div>
</div>

<div class="section">
    <div class="container">
        <h2 class="section-title">Как это работает</h2>
        <div class="steps">
            {steps_html}
        </div>
    </div>
</div>

<div class="cta-section">
    <div class="container">
        <h2>Начните прямо сейчас</h2>
        <p>Подключите канал за 2 минуты. Без VPN, без заграничных карт.</p>
        <a href="/login?from={slug}" class="cta-btn" onclick="trackClick()">Подключить канал</a>
    </div>
</div>

<div class="footer">MAXМаркетинг — платформа для управления рекламой каналов</div>

<script>
fetch('/api/admin/landings/{lid}/track',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{event:'view'}})}}).catch(()=>{{}});
function trackClick(){{
    fetch('/api/admin/landings/{lid}/track',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{event:'click'}})}}).catch(()=>{{}});
    {f'if(typeof ym!=="undefined")ym({ym_id},"reachGoal","{goal_reg}");' if ym_id else ''}
    {f'if(window._tmr)window._tmr.push({{id:"{vk_id}",type:"reachGoal",goal:"{goal_reg}"}});' if vk_id else ''}
}}
</script>
</body>
</html>'''


@router.get("/l/{slug}")
async def serve_landing(slug: str):
    """Serve public landing page."""
    landing = await fetch_one("SELECT * FROM landing_pages_v2 WHERE slug = $1 AND is_active = true", slug)
    if not landing:
        return HTMLResponse("<h1>Страница не найдена</h1>", status_code=404)
    return HTMLResponse(_render_landing(slug, landing))
