import os
import re
import json
import base64
import html as _html
from contextlib import asynccontextmanager
from datetime import datetime, date

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse, Response


class _SafeEncoder(json.JSONEncoder):
    """JSON encoder that skips binary file_data fields and handles dates."""
    def default(self, obj):
        if isinstance(obj, (bytes, bytearray, memoryview)):
            return None  # skip binary data in API responses
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)

from .config import settings
from .database import init_database, close_database, fetch_one, fetch_all, execute, execute_returning_id
from .middleware.auth import get_current_user

from .routes import (
    auth, channels, links, tracking, billing, pins, broadcasts,
    funnels, content, giveaways, notifications, payments,
    max_routes, telegram_bot, max_webhook,
    admin, paid_chats, paid_chat_payments, services, ord, referrals, landings,
    metrics, shop, payment_webhooks, ai_post, files_library, blog,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_database()

    # Init MAX API
    from .services.max_api import init_max_api
    init_max_api()

    # Start background processors
    from .services.billing_checker import start_billing_checker
    from .services.funnel_processor import start_processors
    start_billing_checker()
    start_processors()

    from .services.paid_chat_checker import start_paid_chat_checker
    start_paid_chat_checker()

    from .services.channel_activator import start_channel_activator
    start_channel_activator()
    from .services.analytics_collector import start_analytics_collector
    start_analytics_collector()
    from .services.booking_reminder import start_booking_reminder
    start_booking_reminder()

    from .services.draft_cleaner import start_draft_cleaner
    start_draft_cleaner()

    from .services.season_rotator import start_season_rotator
    start_season_rotator()

    from .services.admin_broadcast_runner import start_admin_broadcast_runner
    start_admin_broadcast_runner()

    # Start bot polling
    from .routes.telegram_bot import start_telegram_polling
    from .routes.max_webhook import start_max_polling
    start_telegram_polling()
    start_max_polling()

    from .routes.admin import ensure_default_admin
    await ensure_default_admin()

    print(f"Server running on port {settings.PORT}")
    yield

    # Shutdown
    from .services.billing_checker import stop_billing_checker
    from .services.funnel_processor import stop_processors
    from .routes.telegram_bot import stop_telegram_polling
    from .routes.max_webhook import stop_max_polling
    stop_billing_checker()
    stop_processors()
    stop_telegram_polling()
    stop_max_polling()
    await close_database()


class SafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, cls=_SafeEncoder, ensure_ascii=False).encode("utf-8")


app = FastAPI(title="Channel Ads API", lifespan=lifespan, default_response_class=SafeJSONResponse)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static files ---
upload_dir = settings.UPLOAD_DIR
os.makedirs(upload_dir, exist_ok=True)

# Сидим bundled-ассеты в uploads, если их там ещё нет (например после
# пересоздания volume). Источник — backend-python/assets рядом с пакетом app/.
_assets_src = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
if os.path.isdir(_assets_src):
    import shutil
    for _name in os.listdir(_assets_src):
        _dst = os.path.join(upload_dir, _name)
        if not os.path.exists(_dst):
            try:
                shutil.copy2(os.path.join(_assets_src, _name), _dst)
                print(f"[Assets] Seeded {_name} → uploads/")
            except Exception as _e:
                print(f"[Assets] Failed to seed {_name}: {_e}")

# Сидим bundled-картинки из репо (backend-python/uploads/) в Docker volume,
# если их там ещё нет. Используется для статей блога с привязанными PNG —
# Dockerfile копирует backend-python/ в образ, но volume mount /app/uploads
# скрывает скопированное, поэтому копируем при старте.
_uploads_src = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
if os.path.isdir(_uploads_src) and os.path.realpath(_uploads_src) != os.path.realpath(upload_dir):
    import shutil as _shutil
    seeded = 0
    for _root, _dirs, _files in os.walk(_uploads_src):
        rel = os.path.relpath(_root, _uploads_src)
        dst_dir = upload_dir if rel == "." else os.path.join(upload_dir, rel)
        os.makedirs(dst_dir, exist_ok=True)
        for _fn in _files:
            _dst = os.path.join(dst_dir, _fn)
            if not os.path.exists(_dst):
                try:
                    _shutil.copy2(os.path.join(_root, _fn), _dst)
                    seeded += 1
                except Exception as _e:
                    print(f"[Uploads] Seed failed {_fn}: {_e}")
    if seeded:
        print(f"[Uploads] Seeded {seeded} bundled file(s) from {_uploads_src}")

app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Mount React SPA frontend (built by Vite)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend-react", "dist")
if os.path.isdir(frontend_dist):
    from fastapi.responses import FileResponse

    @app.get("/robots.txt", include_in_schema=False)
    async def serve_robots():
        app_url = settings.APP_URL.rstrip("/")
        body = (
            "User-agent: *\n"
            "Allow: /\n"
            "Disallow: /admin\n"
            "Disallow: /api\n"
            "Disallow: /uploads/\n"
            f"Sitemap: {app_url}/sitemap.xml\n"
        )
        return Response(content=body, media_type="text/plain")

    @app.get("/sitemap.xml", include_in_schema=False)
    async def serve_sitemap():
        """Динамический sitemap: статичные + опубликованные статьи блога."""
        app_url = settings.APP_URL.rstrip("/")
        items = [
            (f"{app_url}/", "1.0", "daily"),
            (f"{app_url}/promo", "0.9", "weekly"),
            (f"{app_url}/blog", "0.9", "daily"),
            (f"{app_url}/documentation", "0.6", "weekly"),
        ]
        try:
            arts = await fetch_all(
                "SELECT slug, GREATEST(updated_at, published_at) AS lastmod "
                "FROM blog_articles WHERE status = 'published' "
                "ORDER BY published_at DESC LIMIT 5000"
            )
            for a in arts:
                items.append((f"{app_url}/blog/{a['slug']}", "0.7", "weekly", a.get("lastmod")))
            cats = await fetch_all("SELECT slug FROM blog_categories ORDER BY sort_order")
            for c in cats:
                items.append((f"{app_url}/blog/category/{c['slug']}", "0.6", "weekly"))
        except Exception as e:
            print(f"[sitemap] error: {e}")
        urls_xml = []
        for it in items:
            url, prio, freq = it[0], it[1], it[2]
            lastmod = it[3] if len(it) > 3 and it[3] else None
            lm = f"<lastmod>{lastmod.strftime('%Y-%m-%d') if hasattr(lastmod, 'strftime') else str(lastmod)[:10]}</lastmod>" if lastmod else ""
            urls_xml.append(
                f"<url><loc>{url}</loc>{lm}<changefreq>{freq}</changefreq><priority>{prio}</priority></url>"
            )
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + "".join(urls_xml) +
            '</urlset>'
        )
        return Response(content=xml, media_type="application/xml")

    @app.get("/favicon.ico", include_in_schema=False)
    async def serve_favicon():
        return FileResponse(os.path.join(frontend_dist, "favicon.ico"), media_type="image/x-icon")

    @app.get("/apple-touch-icon.png", include_in_schema=False)
    async def serve_apple_icon():
        return FileResponse(os.path.join(frontend_dist, "apple-touch-icon.png"), media_type="image/png")

    @app.get("/logo-64.png", include_in_schema=False)
    async def serve_logo_64():
        return FileResponse(os.path.join(frontend_dist, "logo-64.png"), media_type="image/png")

    @app.get("/logo-192.png", include_in_schema=False)
    async def serve_logo_192():
        return FileResponse(os.path.join(frontend_dist, "logo-192.png"), media_type="image/png")

    @app.get("/promo", include_in_schema=False)
    async def serve_promo_landing():
        landing_path = os.path.join(os.path.dirname(__file__), "routes", "maxmarketing_landing.html")
        with open(landing_path, "r", encoding="utf-8") as f:
            html = f.read()
        # Подтягиваем 3 свежие опубликованные статьи блога и встраиваем
        # секцию «Свежее в блоге» вместо плейсхолдера.
        try:
            arts = await fetch_all(
                """SELECT a.slug, a.title, a.excerpt, a.cover_image_url,
                          a.published_at, c.name AS category_name
                   FROM blog_articles a
                   LEFT JOIN blog_categories c ON c.id = a.category_id
                   WHERE a.status='published'
                   ORDER BY a.published_at DESC NULLS LAST LIMIT 3"""
            )
        except Exception as e:
            print(f"[promo blog block] {e}")
            arts = []
        if arts:
            cards = []
            for a in arts:
                cover = a.get("cover_image_url") or ""
                cover_style = (
                    f"background:url({cover}) center/cover;"
                    if cover else
                    "background:linear-gradient(135deg,#4361ee20,#7b68ee30);"
                )
                excerpt = (a.get("excerpt") or "").replace("<", "&lt;")[:160]
                cat = (a.get("category_name") or "").replace("<", "&lt;")
                title = (a.get("title") or "").replace("<", "&lt;")
                cards.append(
                    f'<a class="blog-card" href="/blog/{a["slug"]}">'
                    f'<div class="blog-card-cover" style="{cover_style}"></div>'
                    f'<div class="blog-card-body">'
                    + (f'<span class="blog-card-cat">{cat}</span>' if cat else '')
                    + f'<h3>{title}</h3>'
                    + (f'<p>{excerpt}</p>' if excerpt else '')
                    + '</div></a>'
                )
            blog_section = (
                '<section id="blog">\n'
                '  <div class="container">\n'
                '    <div class="cases-head reveal">\n'
                '      <div class="eyebrow"><span class="eyebrow-dot"></span>Блог</div>\n'
                '      <h2 class="sec-title">Свежее <span class="gradient-text">в блоге</span></h2>\n'
                '      <p class="sec-sub">Гайды, кейсы и инструкции по работе с каналами в MAX.</p>\n'
                '    </div>\n'
                '    <div class="blog-cards reveal-stagger">\n'
                + '\n'.join(cards) +
                '\n    </div>\n'
                '    <div style="text-align:center;margin-top:36px;">\n'
                '      <a href="/blog" class="btn-outline">Все статьи блога →</a>\n'
                '    </div>\n'
                '  </div>\n'
                '</section>\n'
                '<style>\n'
                '  .blog-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;}\n'
                '  .blog-card{display:flex;flex-direction:column;border:1px solid #e5e7eb;'
                'border-radius:14px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;'
                'transition:transform .15s ease,box-shadow .15s ease;}\n'
                '  .blog-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.08);}\n'
                '  .blog-card-cover{aspect-ratio:16/9;}\n'
                '  .blog-card-body{padding:16px;display:flex;flex-direction:column;gap:8px;flex:1;}\n'
                '  .blog-card-cat{font-size:.7rem;font-weight:700;color:#4361ee;text-transform:uppercase;letter-spacing:.05em;}\n'
                '  .blog-card h3{margin:0;font-size:1.05rem;font-weight:700;color:#1a1a2e;line-height:1.35;}\n'
                '  .blog-card p{margin:0;font-size:.86rem;color:#6b7280;line-height:1.5;'
                'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}\n'
                '  .btn-outline{display:inline-block;padding:12px 28px;border-radius:12px;'
                'border:1px solid #4361ee;color:#4361ee;font-weight:700;text-decoration:none;'
                'transition:background .15s,color .15s;}\n'
                '  .btn-outline:hover{background:#4361ee;color:#fff;}\n'
                '</style>\n'
            )
        else:
            blog_section = ""
        html = html.replace("<!-- BLOG_SECTION_PLACEHOLDER -->", blog_section)
        return HTMLResponse(content=html)

    # Reverse proxies for analytics pixels — MAX in-app browser fails SSL on
    # mc.yandex.ru and top-fwz1.mail.ru directly. Browser hits us instead and
    # we forward server-to-server. Real user IP/UA are passed via X-Forwarded-*
    # so YM/VK can attribute. Cookies aren't relayed (they're set by upstream
    # on the wrong domain), so the frontend uses its own UUID cid for
    # attribution.
    import aiohttp as _aiohttp
    _PROXY_TIMEOUT = _aiohttp.ClientTimeout(total=5)

    async def _pixel_proxy(upstream_base: str, path: str, request: Request):
        qs = request.url.query
        target = f"{upstream_base.rstrip('/')}/{path}{('?' + qs) if qs else ''}"
        real_ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
        ua = request.headers.get("user-agent", "")
        headers = {
            "User-Agent": ua,
            "Accept": "image/*,*/*;q=0.5",
        }
        if real_ip:
            headers["X-Forwarded-For"] = real_ip
            headers["X-Real-IP"] = real_ip
        try:
            async with _aiohttp.ClientSession(timeout=_PROXY_TIMEOUT) as s:
                async with s.get(target, headers=headers, allow_redirects=False) as resp:
                    body = await resp.read()
                    return Response(
                        content=body,
                        status_code=resp.status,
                        media_type=resp.headers.get("content-type", "image/gif"),
                    )
        except Exception as e:
            print(f"[pixel-proxy] {target[:200]} → {type(e).__name__}: {e}")
            # Return a 1x1 gif so the <img> doesn't error in console.
            gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
            return Response(content=gif, status_code=200, media_type="image/gif")

    @app.get("/_ymp/{path:path}", include_in_schema=False)
    async def yandex_metrika_proxy(path: str, request: Request):
        return await _pixel_proxy("https://mc.yandex.ru", path, request)

    @app.get("/_vkp/{path:path}", include_in_schema=False)
    async def vk_pixel_proxy(path: str, request: Request):
        # Лог чтобы видеть, что прилетает (кратко: только тип и goal из data)
        try:
            qs = dict(request.query_params)
            pid = qs.get("id", "?")
            data_b64 = qs.get("data", "")
            goal_label = ""
            if data_b64:
                import base64 as _b, json as _j
                try:
                    decoded = _b.b64decode(data_b64 + "==").decode("utf-8", errors="ignore")
                    goal_label = decoded[:120]
                except Exception:
                    goal_label = f"<bad b64>"
            print(f"[VK-pixel] /_vkp/{path} id={pid} data={goal_label}")
        except Exception:
            pass
        return await _pixel_proxy("https://top-fwz1.mail.ru", path, request)

    # Serve assets
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# ========================
# API Routes — Protected
# ========================
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(channels.router, prefix="/api/channels", tags=["channels"])
app.include_router(links.router, prefix="/api/links", tags=["links"])
app.include_router(pins.router, prefix="/api/pins", tags=["pins"])
app.include_router(broadcasts.router, prefix="/api/broadcasts", tags=["broadcasts"])
app.include_router(funnels.router, prefix="/api/funnels", tags=["funnels"])
app.include_router(content.router, prefix="/api/content", tags=["content"])
app.include_router(giveaways.router, prefix="/api/giveaways", tags=["giveaways"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(max_routes.router, prefix="/api/max", tags=["max"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(paid_chats.router, prefix="/api/paid-chats", tags=["paid-chats"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(shop.router, prefix="/api/shop", tags=["shop"])
app.include_router(ord.router, prefix="/api/ord", tags=["ord"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["referrals"])
app.include_router(landings.router, tags=["landings"])
from .routes import analytics, comments
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(telegram_bot.router, prefix="/api/telegram", tags=["telegram-bot"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
from .routes import ai_design, ai_design_lm
app.include_router(ai_design.router, prefix="/api/ai-design", tags=["ai-design"])
app.include_router(ai_design_lm.router, prefix="/api/ai-design", tags=["ai-design-lm"])
from .routes import ai_landings
app.include_router(ai_landings.router, prefix="/api/ai-landing", tags=["ai-landing"])
from .routes import ai_content
app.include_router(ai_content.router, prefix="/api/ai-content", tags=["ai-content"])
app.include_router(ai_post.router, prefix="/api/ai-post", tags=["ai-post"])
app.include_router(files_library.router, prefix="/api/files", tags=["files-library"])
app.include_router(blog.public_router, prefix="/api/blog", tags=["blog"])
app.include_router(blog.admin_router, prefix="/api/admin/blog", tags=["admin-blog"])
from .routes import support
app.include_router(support.router, prefix="/api/support", tags=["support"])
from .routes import client_notes
app.include_router(client_notes.router, prefix="/api/clients", tags=["client-notes"])
from .routes import onboarding
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["onboarding"])
from .routes import feature_visibility
app.include_router(feature_visibility.public_router, prefix="/api/feature-visibility", tags=["feature-visibility"])
app.include_router(feature_visibility.admin_router, prefix="/api/admin/feature-visibility", tags=["admin-feature-visibility"])
from .routes import polls
# public_router ПЕРЕД router — иначе /api/polls/public/{id} матчится как
# /api/polls/{tc}/{poll_id} (с tc='public') и требует авторизации
app.include_router(polls.public_router, prefix="/api/polls/public", tags=["polls-public"])
app.include_router(polls.router, prefix="/api/polls", tags=["polls"])
from .routes import ai_assistant
app.include_router(ai_assistant.router, prefix="/api/ai-assistant", tags=["ai-assistant"])
from .routes import streams
app.include_router(streams.public_router, prefix="/api/streams/public", tags=["streams-public"])
app.include_router(streams.rtmp_router, prefix="/rtmp", tags=["rtmp"])  # без auth, для nginx-rtmp хуков
app.include_router(streams.router, prefix="/api/streams", tags=["streams"])

# ========================
# API Routes — Public
# ========================
app.include_router(ai_landings.public_router, tags=["ai-landing-public"])
app.include_router(tracking.router, prefix="/api/track", tags=["tracking"])
app.include_router(max_webhook.router, prefix="/webhook/max", tags=["max-webhook"])
app.include_router(billing.public_router, prefix="/api/billing/public", tags=["billing-public"])
app.include_router(billing.staff_invite_router, prefix="/api/staff", tags=["staff-invites"])
app.include_router(services.public_router, prefix="/api/services/public", tags=["services-public"])
app.include_router(shop.public_router, prefix="/api/shop/public", tags=["shop-public"])
app.include_router(comments.public_router, prefix="/api/comments/public", tags=["comments-public"])
app.include_router(paid_chat_payments.router, prefix="/api/paid-chat-pay", tags=["paid-chat-pay"])
app.include_router(payment_webhooks.router, prefix="/api/payments/webhook", tags=["payment-webhooks"])


def _short_address(addr_data):
    """Build short address from Nominatim addressdetails: street + house + city."""
    a = addr_data.get("address", {})
    parts = []
    # City
    city = a.get("city") or a.get("town") or a.get("village") or a.get("hamlet") or ""
    if city:
        parts.append(city)
    # Street
    street = a.get("road") or a.get("pedestrian") or a.get("neighbourhood") or ""
    if street:
        parts.append(street)
    # House
    house = a.get("house_number") or ""
    if house:
        parts.append(house)
    return ", ".join(parts) if parts else addr_data.get("display_name", "")


@app.api_route("/hls/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def proxy_hls(path: str):
    """Reverse-proxy для HLS-сегментов nginx-rtmp контейнера.
    Зрители получают /hls/{key}.m3u8 и /hls/{key}-N.ts через наш домен."""
    import aiohttp as _aio
    from fastapi.responses import Response
    target = f"http://rtmp:8081/hls/{path}"
    try:
        async with _aio.ClientSession() as session:
            async with session.get(target, timeout=_aio.ClientTimeout(total=10)) as r:
                content = await r.read()
                content_type = r.headers.get("content-type", "application/octet-stream")
                return Response(content=content, status_code=r.status,
                                media_type=content_type,
                                headers={"Cache-Control": "no-cache",
                                         "Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return Response(status_code=404, content=str(e))


@app.get("/api/geo/reverse")
async def geo_reverse(lat: float = 0, lon: float = 0):
    """Reverse geocode via Nominatim."""
    import aiohttp
    if not lat or not lon:
        return {"address": ""}
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&addressdetails=1&accept-language=ru"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers={"User-Agent": "PKMarketing/1.0"},
                                   timeout=aiohttp.ClientTimeout(total=5)) as resp:
                data = await resp.json()
                return {"address": _short_address(data)}
    except Exception:
        return {"address": ""}


@app.get("/api/geo/suggest")
async def geo_suggest(q: str = ""):
    """Address suggestions via Nominatim."""
    import aiohttp
    if not q or len(q) < 3:
        return {"results": []}
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&addressdetails=1&limit=5&countrycodes=ru&accept-language=ru"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers={"User-Agent": "PKMarketing/1.0"},
                                   timeout=aiohttp.ClientTimeout(total=5)) as resp:
                data = await resp.json()
                return {"results": [{"display": _short_address(r), "lat": float(r["lat"]), "lon": float(r["lon"])} for r in data if r.get("lat")]}
    except Exception:
        return {"results": []}


# ========================
# Top-level endpoints
# ========================

@app.get("/bot/start/{payload}")
async def bot_deep_link_redirect(payload: str):
    """Redirect to MAX bot deep link. Used as intermediate URL for link buttons."""
    from .services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=503, detail="MAX bot not configured")
    me = await max_api.get_me()
    bot_user_id = str(me.get("data", {}).get("user_id", ""))
    if not bot_user_id:
        raise HTTPException(status_code=503, detail="Cannot get bot info")
    return RedirectResponse(url=f"https://max.ru/id{bot_user_id}_bot?start={payload}", status_code=302)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "channel-ads-python"}


@app.get("/api/dashboard")
async def dashboard_stats(request: Request, user=Depends(get_current_user)):
    """Dashboard overview stats. Optional ?tc= to filter by channel."""
    try:
        tc = request.query_params.get("tc")
        if tc:
            channel = await fetch_one("SELECT id FROM channels WHERE tracking_code = $1 AND user_id = $2", tc, user["id"])
            if not channel:
                return {"success": True, "visits": 0, "subscribers": 0, "leads": 0, "scheduledPosts": 0}
            cid = channel["id"]
            visits = await fetch_one("SELECT COUNT(*) as count FROM visits WHERE channel_id = $1", cid)
            subs = await fetch_one("SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = $1", cid)
            leads = await fetch_one(
                "SELECT COUNT(*) as count FROM leads WHERE lead_magnet_id IN (SELECT id FROM lead_magnets WHERE channel_id = $1)", cid)
            posts = await fetch_one(
                "SELECT COUNT(*) as count FROM content_posts WHERE channel_id = $1 AND status = 'scheduled'", cid)
        else:
            visits = await fetch_one(
                "SELECT COUNT(*) as count FROM visits v JOIN channels c ON c.id = v.channel_id WHERE c.user_id = $1", user["id"])
            subs = await fetch_one(
                "SELECT COUNT(*) as count FROM subscriptions s JOIN channels c ON c.id = s.channel_id WHERE c.user_id = $1", user["id"])
            leads = await fetch_one(
                "SELECT COUNT(*) as count FROM leads l JOIN lead_magnets lm ON lm.id = l.lead_magnet_id JOIN channels c ON c.id = lm.channel_id WHERE c.user_id = $1", user["id"])
            posts = await fetch_one(
                "SELECT COUNT(*) as count FROM content_posts cp JOIN channels c ON c.id = cp.channel_id WHERE c.user_id = $1 AND cp.status = 'scheduled'", user["id"])
        return {
            "success": True,
            "visits": visits["count"] if visits else 0,
            "subscribers": subs["count"] if subs else 0,
            "leads": leads["count"] if leads else 0,
            "scheduledPosts": posts["count"] if posts else 0,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# --- Subscription bonuses (Обзор) ---
# Бонусные подписки за +N ИИ-токенов. Проверка через MAX API: бот должен
# быть участником канала (status=member или admin), тогда is_user_member
# вернёт true для подписчика.
SUBSCRIPTION_BONUSES = [
    {
        "key": "smmpavel",
        "title": "Пресняков Маркетинг",
        "url": "https://max.ru/smmpavel",
        "ai_tokens": 10,
        "max_chat_id": "-68434131015095",
        "avatar_url": "https://i.oneme.ru/i?r=BUFxtygYfQ8hp8NJRyp5v4T32KpmXgwbUtbi3wrEKV4whvN14XTwre9u91cvAM4_XgBF94LGqStOwUK28iSN1Ynb&fn=w_1440",
    },
    {
        "key": "diary_neprogrammist",
        "title": "Дневник НЕпрограммиста",
        "url": "https://max.ru/join/VCz2RMDkwZRzXPpo1kjo5TypZrfajw2vhVQtY_LVMVg",
        "ai_tokens": 10,
        "max_chat_id": "-72587203431884",
        "avatar_url": "https://i.oneme.ru/i?r=BTEFHNxXjmuR0N2Fir9SuMMRbeyfTwSY0YCDuD26Ydmft5HBHiOr_iGqJFFEZ2PBTiY&fn=w_1440",
    },
]


def _bonus_by_key(key: str):
    for b in SUBSCRIPTION_BONUSES:
        if b["key"] == key:
            return b
    return None


@app.get("/api/dashboard/subscription-bonuses")
async def list_subscription_bonuses(user=Depends(get_current_user)):
    """Список доступных подписочных бонусов с признаком claimed для текущего юзера."""
    rows = await fetch_all(
        "SELECT bonus_key FROM user_subscription_bonuses WHERE user_id = $1",
        user["id"],
    )
    claimed_keys = {r["bonus_key"] for r in rows}
    items = []
    for b in SUBSCRIPTION_BONUSES:
        if b["key"] in claimed_keys:
            continue  # после получения плашка скрывается
        items.append({
            "key": b["key"],
            "title": b["title"],
            "url": b["url"],
            "ai_tokens": b["ai_tokens"],
            "avatar_url": b["avatar_url"],
        })
    return {"success": True, "bonuses": items}


@app.post("/api/dashboard/subscription-bonuses/{key}/claim")
async def claim_subscription_bonus(key: str, user=Depends(get_current_user)):
    bonus = _bonus_by_key(key)
    if not bonus:
        raise HTTPException(status_code=404, detail="Бонус не найден")

    # Idempotency: уже забран?
    existing = await fetch_one(
        "SELECT id FROM user_subscription_bonuses WHERE user_id = $1 AND bonus_key = $2",
        user["id"], key,
    )
    if existing:
        return {"success": True, "already_claimed": True}

    if not user.get("max_user_id"):
        raise HTTPException(status_code=400, detail="Сначала привяжите MAX-аккаунт через бота")

    chat_id = bonus.get("max_chat_id")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Бот ещё не добавлен в канал — попробуйте позже")

    from .services.max_api import get_max_api
    max_api = get_max_api()
    if not max_api:
        raise HTTPException(status_code=500, detail="MAX API недоступен")
    is_member = await max_api.is_user_member(chat_id, str(user["max_user_id"]))
    if not is_member:
        raise HTTPException(status_code=400, detail="Подписка не найдена. Подпишитесь на канал и попробуйте снова.")

    tokens = int(bonus["ai_tokens"])
    await execute(
        "INSERT INTO user_subscription_bonuses (user_id, bonus_key, tokens_granted) VALUES ($1, $2, $3) ON CONFLICT (user_id, bonus_key) DO NOTHING",
        user["id"], key, tokens,
    )
    await execute(
        "UPDATE users SET ai_tokens = COALESCE(ai_tokens, 0) + $1 WHERE id = $2",
        tokens, user["id"],
    )
    return {"success": True, "tokens_granted": tokens}


# --- Admin announcements (модалки для всех юзеров) ---
@app.get("/api/announcements/active")
async def list_active_announcements(user=Depends(get_current_user)):
    """Активные уведомления для текущего юзера, которые он ещё не закрывал.
    Учитывает audience и временное окно starts_at/ends_at."""
    rows = await fetch_all(
        """SELECT n.*
           FROM admin_notifications n
           WHERE n.is_active = TRUE
             AND (n.starts_at IS NULL OR n.starts_at <= NOW())
             AND (n.ends_at IS NULL OR n.ends_at >= NOW())
             AND NOT EXISTS (
               SELECT 1 FROM user_notifications_seen s
               WHERE s.notification_id = n.id AND s.user_id = $1
             )
           ORDER BY n.created_at DESC
           LIMIT 5""",
        user["id"],
    )
    return {"success": True, "items": [dict(r) for r in rows]}


@app.post("/api/announcements/{nid}/seen")
async def mark_announcement_seen(nid: int, user=Depends(get_current_user)):
    await execute(
        "INSERT INTO user_notifications_seen (user_id, notification_id) VALUES ($1, $2) "
        "ON CONFLICT (user_id, notification_id) DO NOTHING",
        user["id"], nid,
    )
    return {"success": True}


# --- Achievements notifications ---
@app.get("/api/achievements/notifications")
async def list_achievement_notifications(user=Depends(get_current_user)):
    """Новые ачивки пользователя — для модалки."""
    from .services.achievements import fetch_pending_notifications
    items = await fetch_pending_notifications(user["id"])
    return {"success": True, "items": items}


@app.post("/api/achievements/notifications/{aid}/seen")
async def mark_achievement_seen(aid: int, user=Depends(get_current_user)):
    from .services.achievements import mark_notification_seen
    await mark_notification_seen(user["id"], aid)
    return {"success": True}


@app.get("/api/achievements/race")
async def get_race_leaderboard(tc: str = "", user=Depends(get_current_user)):
    """Топ-10 каналов по очкам в текущем сезоне + место выбранного."""
    channel_id = None
    if tc:
        ch = await fetch_one(
            "SELECT id FROM channels WHERE tracking_code = $1 AND user_id = $2",
            tc, user["id"],
        )
        if ch:
            channel_id = ch["id"]
    from .services.achievements import get_season_leaderboard
    data = await get_season_leaderboard(channel_id=channel_id, limit=10)
    return {"success": True, **data}


@app.get("/api/modules/{tracking_code}")
async def get_module_settings(tracking_code: str):
    """Get enabled modules for a channel."""
    channel = await fetch_one("SELECT * FROM channels WHERE tracking_code = $1", tracking_code)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    modules = await fetch_all("SELECT * FROM channel_modules WHERE channel_id = $1", channel["id"])
    return {"success": True, "modules": modules}


@app.put("/api/modules/{tracking_code}/{module_type}")
async def toggle_module(tracking_code: str, module_type: str, request: Request):
    """Enable/disable a module for a channel."""
    body = await request.json()
    channel = await fetch_one("SELECT * FROM channels WHERE tracking_code = $1", tracking_code)
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    is_enabled = body.get("is_enabled", 1)
    config = json.dumps(body.get("config", {}))
    await execute(
        """INSERT INTO channel_modules (channel_id, module_type, is_enabled, config)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (channel_id, module_type) DO UPDATE SET is_enabled = $3, config = $4""",
        channel["id"], module_type, is_enabled, config,
    )
    return {"success": True}


@app.get("/api/bot-info")
async def bot_info():
    """Get bot info for both platforms."""
    result = {"success": True, "telegram": None, "max": None}

    if settings.TELEGRAM_BOT_TOKEN:
        import aiohttp
        try:
            url = f"{settings.TELEGRAM_API_URL}/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    data = await resp.json()
                    if data.get("ok"):
                        result["telegram"] = data["result"]
        except Exception:
            pass

    from .services.max_api import get_max_api
    max_api = get_max_api()
    if max_api:
        try:
            me = await max_api.get_me()
            if me.get("success"):
                result["max"] = me["data"]
        except Exception:
            pass

    return result


@app.get("/miniapp")
@app.get("/miniapp/{code}")
async def miniapp_page(request: Request, code: str = ""):
    """MAX Mini App — seamless redirect to channel with tracking."""
    from fastapi.responses import HTMLResponse
    # Also check query param
    if not code:
        code = request.query_params.get("WebAppStartParam", "") or request.query_params.get("code", "")
    # Handle comments_ prefix — render comments app directly (no redirect)
    if code.startswith("comments_"):
        return await comments_app_page(request, code)
    # Handle book_ prefix — redirect to booking miniapp
    if code.startswith("book_"):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"/booking/{code}", status_code=302)
    # Handle shop_ prefix — render shop miniapp directly (no redirect to preserve WebApp context)
    if code.startswith("shop_"):
        return await shop_app_page(request, code)
    # Handle paid_ prefix — redirect to payment page
    if code.startswith("paid_"):
        tc_val = code[5:]
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"/pay/{tc_val}", status_code=302)
    clean_code = code.replace("go_", "") if code.startswith("go_") else code
    # Meta refresh fallback: if JS fails completely, redirect via /go/ after 6 seconds
    meta_refresh = f'<meta http-equiv="refresh" content="6;url=/go/{clean_code}">' if clean_code else ''
    html = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
__META_REFRESH__
<script>
// Load WebApp bridge with timeout
var _waLoaded=false;
var s=document.createElement('script');s.src='https://st.max.ru/js/max-web-app.js';
s.onload=function(){_waLoaded=true;try{window.WebApp.ready()}catch(e){}};
s.onerror=function(){_waLoaded=true};
document.head.appendChild(s);
setTimeout(function(){if(!_waLoaded){_waLoaded=true;console.log('WebApp bridge timeout')}},3000);
</script>
<style>
body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f5}
.c{text-align:center;padding:24px}
.s{width:36px;height:36px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:s .7s linear infinite;margin:0 auto 16px}
@keyframes s{to{transform:rotate(360deg)}}
p{color:#666;font-size:15px}
</style>
</head><body>
<div class="c"><div class="s"></div><p>Переход в канал...</p></div>
<script>
async function doRedirect() {
  try {
    // Get start_param from multiple sources
    let startParam = '';
    // 1. Server-side code from URL path (most reliable)
    const pathCode = '__SERVER_CODE__';
    if (pathCode) startParam = pathCode;
    // 2. WebApp bridge
    if (!startParam && window.WebApp && window.WebApp.initDataUnsafe) {
      startParam = window.WebApp.initDataUnsafe.start_param || '';
    }
    // 3. URL query params
    if (!startParam) {
      const url = new URL(window.location.href);
      startParam = url.searchParams.get('WebAppStartParam') || url.searchParams.get('startapp') || url.searchParams.get('start_param') || '';
    }

    if (!startParam) {
      // Пустой start_param = юзер тапнул «Приложение» в меню бота.
      // Пробуем авто-логин через MAX WebApp initData (HMAC-подписан).
      // Если подпись валидна — сохраняем JWT и открываем ЛК. Если нет —
      // отдаём на /login где юзер получит стандартный вход через бота.
      document.querySelector('p').textContent = 'Открываем кабинет...';
      var initData = '';
      var initDataUnsafe = null;
      var hasWebApp = false;
      try { hasWebApp = !!window.WebApp; } catch(e) {}
      try { initData = (window.WebApp && window.WebApp.initData) || ''; } catch(e) {}
      try { initDataUnsafe = (window.WebApp && window.WebApp.initDataUnsafe) || null; } catch(e) {}
      var authResp = null; var authStatus = 'no-request';
      try {
        const r = await fetch('/api/auth/max-webapp', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({initData: initData, initDataUnsafe: initDataUnsafe}),
        });
        authStatus = r.status;
        try { authResp = await r.json(); } catch(e) {}
        if (authResp && authResp.success && authResp.token) {
          try {
            localStorage.setItem('token', authResp.token);
            if (authResp.user) localStorage.setItem('user', JSON.stringify(authResp.user));
          } catch(e) {}
          window.location.replace('/');
          return true;
        }
      } catch(e) { authStatus = 'fetch-error: ' + e.message; }
      // Авто-логин не прошёл — редирект в чат с ботом с deep-link
      // /start open_cabinet. Бот вернёт кнопку с одноразовым JWT.
      window.location.replace('__MAX_BOT_DEEPLINK__');
      return true;
    }

    // Handle comments_ prefix
    if (startParam.startsWith('comments_')) {
      window.location.href = '/comments-app/' + startParam;
      return true;
    }
    // Handle poll_ prefix — голосование в опросе
    if (startParam.startsWith('poll_')) {
      window.location.href = '/polls-app/' + startParam;
      return true;
    }
    // Handle stream_ prefix — эфиры
    if (startParam.startsWith('stream_')) {
      window.location.href = '/streams-app/' + startParam;
      return true;
    }
    // Handle book_ prefix — redirect to booking page
    if (startParam.startsWith('book_')) {
      window.location.href = '/booking/' + startParam;
      return true;
    }
    // Handle paid_ prefix — redirect to payment page
    if (startParam.startsWith('paid_')) {
      window.location.href = '/pay/' + startParam.slice(5);
      return true;
    }

    const code = startParam.startsWith('go_') ? startParam.slice(3) : startParam;

    const resp = await fetch('/api/track/miniapp-visit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: code})
    });
    const data = await resp.json();
    const channelUrl = data.channel_url;

    if (channelUrl) {
      // Show clickable button
      document.querySelector('.c').innerHTML =
        '<a id="go-btn" href="' + channelUrl + '" style="display:inline-block;padding:16px 40px;background:#7B68EE;color:#fff;border-radius:12px;text-decoration:none;font-size:17px;font-weight:600;margin-top:8px">Перейти в канал</a>';
      document.getElementById('go-btn').addEventListener('click', function(e) {
        e.preventDefault();
        // openMaxLink for max.ru links (opens natively), openLink for others
        var url = this.href;
        try {
          if (url.includes('max.ru') && window.WebApp && window.WebApp.openMaxLink) {
            window.WebApp.openMaxLink(url);
          } else if (window.WebApp && window.WebApp.openLink) {
            window.WebApp.openLink(url);
          } else {
            window.location.href = url;
          }
        } catch(err) { window.location.href = url; }
        setTimeout(function(){ try { window.WebApp.close(); } catch(e){} }, 1000);
      });
      return true;
    } else {
      document.querySelector('p').textContent = 'Ссылка не найдена';
      setTimeout(() => { try { window.WebApp?.close(); } catch(e){} }, 2000);
      return true;
    }
  } catch(e) {
    document.querySelector('p').textContent = 'Ошибка: ' + e.message;
    setTimeout(() => { try { window.WebApp?.close(); } catch(e){} }, 3000);
    return true;
  }
  return false;
}

// Fallback: if miniapp doesn't load in 5 sec, use direct link
let done = false;
const fallbackTimer = setTimeout(() => {
  if (done) return;
  // Get code from any available source
  const url = new URL(window.location.href);
  let sp = url.searchParams.get('WebAppStartParam') || url.searchParams.get('startapp') || '';
  // Also try path: /miniapp/CODE
  if (!sp) {
    const pathParts = url.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'miniapp') sp = pathParts[2];
  }
  const c = sp.startsWith('go_') ? sp.slice(3) : sp;
  if (c) {
    // Use /go/ redirect (works without JS/bridge)
    window.location.href = '/go/' + c;
  } else {
    // Пустой start_param даже через 5 сек → это меню-кнопка «Приложение»,
    // ведём в ЛК а не показываем ошибку.
    window.location.replace('/');
  }
}, 5000);

(async function() {
  if (window.WebApp) {
    try { window.WebApp.ready(); } catch(e) {}
  }
  let ok = await doRedirect();
  if (!ok) {
    for (let i = 0; i < 5 && !ok; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (window.WebApp) {
        try { window.WebApp.ready(); } catch(e) {}
      }
      ok = await doRedirect();
    }
  }
  if (ok) { done = true; clearTimeout(fallbackTimer); }
})();
</script>
</body></html>"""
    # Deep-link на бот с payload open_cabinet — используется когда WebApp
    # контекста нет и мы не можем идентифицировать юзера. Бот вернёт кнопку
    # с одноразовым JWT.
    try:
        from .routes.pins import _get_max_bot_link_id
        bot_link_id = await _get_max_bot_link_id()
    except Exception:
        bot_link_id = ""
    deeplink = f"https://max.ru/id{bot_link_id}_bot?start=open_cabinet" if bot_link_id else "/login"
    html = (html.replace('__META_REFRESH__', meta_refresh)
                .replace('__SERVER_CODE__', code)
                .replace('__MAX_BOT_DEEPLINK__', deeplink))
    return HTMLResponse(html)


@app.get("/streams-app")
@app.get("/streams-app/{params}")
async def streams_app_page(request: Request, params: str = ""):
    """Stream miniapp — анонс/таймер + плеер + комментарии."""
    from fastapi.responses import HTMLResponse
    if not params:
        params = request.query_params.get("WebAppStartParam", "") or request.query_params.get("startapp", "") or ""
    stream_id = ""
    if params.startswith("stream_"):
        stream_id = params[7:]
    elif params:
        stream_id = params

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script>
var _waReady=false;
var _s=document.createElement('script');_s.src='https://st.max.ru/js/max-web-app.js';
_s.onload=function(){{_waReady=true;try{{window.WebApp.ready()}}catch(e){{}};if(window._pendingInit)window._pendingInit();}};
_s.onerror=function(){{_waReady=true;if(window._pendingInit)window._pendingInit();}};
document.head.appendChild(_s);
setTimeout(function(){{if(!_waReady){{_waReady=true;if(window._pendingInit)window._pendingInit();}}}},2000);
</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a14;color:#fff;min-height:100vh}}
.app{{max-width:540px;margin:0 auto;min-height:100vh;background:#0a0a14;display:flex;flex-direction:column}}
.cover{{position:relative;min-height:280px;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:40px 24px;text-align:center;color:#fff;overflow:hidden}}
.cover-bg{{position:absolute;inset:0;background:#0a0a14;background-size:cover;background-position:center;filter:blur(8px);transform:scale(1.1);z-index:0}}
.cover-overlay{{position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:1}}
.cover-inner{{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center}}
.ch{{font-size:.78rem;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}}
.title{{font-size:1.6rem;font-weight:800;line-height:1.2;margin-bottom:12px}}
.desc{{font-size:.95rem;opacity:.85;max-width:480px;line-height:1.5;margin-bottom:18px}}
.badge{{display:inline-block;background:rgba(255,255,255,0.15);padding:5px 14px;border-radius:999px;font-size:.78rem;font-weight:600;backdrop-filter:blur(8px)}}
.live-badge{{background:#dc2626}}
.timer{{display:flex;gap:10px;margin-top:12px;justify-content:center}}
.timer-cell{{background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 14px;min-width:64px}}
.timer-num{{font-size:1.6rem;font-weight:800;line-height:1}}
.timer-lbl{{font-size:.65rem;opacity:.7;text-transform:uppercase;margin-top:4px;letter-spacing:.06em}}
.player-wrap{{background:#000;aspect-ratio:16/9;width:100%}}
.player-wrap iframe{{width:100%;height:100%;border:0;display:block}}
.section{{padding:18px 18px;background:#11111e}}
.section h3{{font-size:.95rem;margin-bottom:10px;color:#fff;font-weight:700}}
.comments-box{{background:#16162a;border-radius:12px;padding:14px;min-height:60px}}
.comment{{padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)}}
.comment:last-child{{border-bottom:none}}
.c-row{{display:flex;gap:10px;align-items:flex-start}}
.avatar{{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#4361ee,#7b68ee);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.78rem;flex-shrink:0}}
.c-author{{font-weight:600;font-size:.85rem;color:#fff}}
.c-time{{font-size:.7rem;color:rgba(255,255,255,0.4);margin-left:6px}}
.c-text{{font-size:.88rem;color:rgba(255,255,255,0.85);margin-top:2px;line-height:1.45}}
.compose{{display:flex;gap:8px;margin-top:10px}}
.compose input{{flex:1;padding:10px 14px;border:1px solid rgba(255,255,255,0.1);background:#11111e;color:#fff;border-radius:20px;font-size:.9rem;outline:none}}
.compose input:focus{{border-color:#4361ee}}
.compose button{{padding:10px 16px;border:none;border-radius:20px;background:#4361ee;color:#fff;font-weight:600;cursor:pointer;font-size:.9rem}}
.empty{{text-align:center;padding:20px 0;color:rgba(255,255,255,0.4);font-size:.85rem}}
.loading{{text-align:center;padding:50px;color:rgba(255,255,255,0.5)}}
.spinner{{width:28px;height:28px;border:3px solid rgba(255,255,255,0.1);border-top-color:#4361ee;border-radius:50%;animation:sp .6s linear infinite;margin:0 auto 10px}}
@keyframes sp{{to{{transform:rotate(360deg)}}}}
.foot{{text-align:center;padding:12px;color:rgba(255,255,255,0.3);font-size:.75rem}}
</style>
</head><body>
<div class="app" id="app"><div class="loading"><div class="spinner"></div>Загрузка...</div></div>
<script>
const API = '/api/streams/public';
const STREAM_ID = '{stream_id}';
const COMMENTS_API = '/api/comments/public';
let stream = null, uid = '', userName = '', userUsername = '';

function esc(s){{return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''}}
function fmtTime(iso){{try{{return new Date(iso).toLocaleString('ru-RU',{{hour:'2-digit',minute:'2-digit'}});}}catch{{return''}}}}

async function resolveUser() {{
  const start = Date.now();
  while (Date.now() - start < 4000) {{
    try {{
      if (window.WebApp && window.WebApp.initDataUnsafe) {{
        const u = window.WebApp.initDataUnsafe.user;
        if (u && (u.user_id || u.id)) {{
          uid = String(u.user_id || u.id);
          // MAX SDK даёт: name / display_name / first_name / last_name.
          // Telegram: first_name / last_name. Берём первое что есть.
          const parts = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          userName = parts || u.name || u.display_name || u.username || '';
          userUsername = u.username || '';
          return;
        }}
      }}
    }} catch(e) {{}}
    await new Promise(r => setTimeout(r, 200));
  }}
  let stored = '';
  try {{ stored = localStorage.getItem('stream_anon_v1') || ''; }} catch(e) {{}}
  if (!stored) {{
    stored = 'anon_' + Math.random().toString(36).slice(2,12);
    try {{ localStorage.setItem('stream_anon_v1', stored); }} catch(e) {{}}
  }}
  uid = stored;
}}

function renderTimer(startsAt) {{
  const diff = new Date(startsAt).getTime() - Date.now();
  if (diff <= 0) return '<div class="badge live-badge">● LIVE СЕЙЧАС</div>';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return '<div class="timer">' +
    (d > 0 ? cell(d, 'дней') : '') +
    cell(h, 'часов') + cell(m, 'минут') + cell(s, 'сек') +
    '</div>';
}}
function cell(n, lbl) {{
  return '<div class="timer-cell"><div class="timer-num">' + String(n).padStart(2,'0') + '</div><div class="timer-lbl">' + lbl + '</div></div>';
}}

function renderPlayer() {{
  // Для типа encoder играем HLS-поток с нашего RTMP-сервера
  if (stream.stream_type === 'encoder') {{
    return '<div class="player-wrap"><video id="hls-video" controls autoplay muted playsinline style="width:100%;height:100%;background:#000"></video></div>';
  }}
  const url = stream.embed_url || stream.stream_url;
  if (!url) return '<div class="player-wrap" style="display:flex;align-items:center;justify-content:center;color:#666">Плеер не настроен</div>';
  return '<div class="player-wrap"><iframe src="' + esc(url) + '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe></div>';
}}

function setupHlsPlayer() {{
  const video = document.getElementById('hls-video');
  if (!video || stream.stream_type !== 'encoder') return;
  const hlsUrl = stream.playback_url || (stream.stream_key ? '/hls/' + stream.stream_key + '.m3u8' : '');
  if (!hlsUrl) return;
  if (video.canPlayType('application/vnd.apple.mpegurl')) {{
    video.src = hlsUrl;
    return;
  }}
  // Подгружаем hls.js для браузеров без нативного HLS
  if (window.Hls) {{ attachHls(video, hlsUrl); return; }}
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
  s.onload = function() {{ attachHls(video, hlsUrl); }};
  document.head.appendChild(s);
}}
function attachHls(video, url) {{
  if (!window.Hls || !window.Hls.isSupported()) return;
  const hls = new window.Hls();
  hls.loadSource(url);
  hls.attachMedia(video);
}}

function renderCover() {{
  const bg = stream.bg_image_url
    ? 'style="background-image:url(' + esc(stream.bg_image_url) + ')"'
    : '';
  const isLive = stream.status === 'live' || new Date(stream.starts_at).getTime() <= Date.now();
  return '<div class="cover"><div class="cover-bg" ' + bg + '></div><div class="cover-overlay"></div>' +
         '<div class="cover-inner">' +
         '<div class="ch">' + esc(stream.channel_title) + '</div>' +
         '<div class="title">' + esc(stream.title) + '</div>' +
         (stream.description ? '<div class="desc">' + esc(stream.description) + '</div>' : '') +
         (isLive ? '' : '<div class="badge">📅 Начало: ' + fmtTime(stream.starts_at) + '</div>') +
         '<div id="timer">' + renderTimer(stream.starts_at) + '</div>' +
         '</div></div>';
}}

async function loadComments() {{
  try {{
    const r = await fetch(COMMENTS_API + '/stream/' + STREAM_ID);
    const d = await r.json();
    if (d.success) renderComments(d.comments || []);
  }} catch(e) {{}}
}}

function renderComments(items) {{
  const box = document.getElementById('comments-box');
  if (!box) return;
  if (items.length === 0) {{
    box.innerHTML = '<div class="empty">Пока нет комментариев. Будьте первым!</div>';
  }} else {{
    box.innerHTML = items.map(c => {{
      const letter = (c.user_name || 'A')[0].toUpperCase();
      return '<div class="comment"><div class="c-row">' +
        '<div class="avatar">' + esc(letter) + '</div>' +
        '<div style="flex:1"><span class="c-author">' + esc(c.user_name || 'Аноним') + '</span>' +
        '<span class="c-time">' + fmtTime(c.created_at) + '</span>' +
        '<div class="c-text">' + esc(c.comment_text) + '</div></div></div></div>';
    }}).join('');
  }}
}}

async function sendComment() {{
  const input = document.getElementById('comment-input');
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  await fetch(COMMENTS_API + '/stream/' + STREAM_ID, {{
    method: 'POST', headers: {{'Content-Type':'application/json'}},
    body: JSON.stringify({{ user_name: userName || 'Аноним', max_user_id: uid, comment_text: text }}),
  }});
  await loadComments();
}}

async function render() {{
  document.getElementById('app').innerHTML =
    renderCover() + renderPlayer() +
    '<div class="section"><h3>💬 Комментарии</h3>' +
    '<div class="comments-box" id="comments-box"><div class="loading"><div class="spinner"></div></div></div>' +
    '<div class="compose"><input id="comment-input" placeholder="Написать комментарий..." />' +
    '<button onclick="sendComment()">Отправить</button></div>' +
    '</div><div class="foot">MAX Маркетинг · ПКРеклама</div>';
  document.getElementById('comment-input').addEventListener('keydown', e => {{
    if (e.key === 'Enter') sendComment();
  }});
  setupHlsPlayer();
  await loadComments();
  // Обновляем таймер каждую секунду
  setInterval(() => {{
    const t = document.getElementById('timer');
    if (t && stream) t.innerHTML = renderTimer(stream.starts_at);
  }}, 1000);
  // Перезагружаем комменты раз в 10 сек (живой чат)
  setInterval(loadComments, 10000);
}}

async function load() {{
  const r = await fetch(API + '/' + STREAM_ID);
  const d = await r.json();
  if (!d.success) {{
    document.getElementById('app').innerHTML = '<div class="loading">Эфир не найден</div>';
    return;
  }}
  stream = d.stream;
  await render();
}}

window._pendingInit = async function() {{
  await resolveUser();
  await load();
}};
if (_waReady) {{ window._pendingInit(); }}
</script>
</body></html>"""
    return HTMLResponse(html)


@app.get("/polls-app")
@app.get("/polls-app/{params}")
async def polls_app_page(request: Request, params: str = ""):
    """Poll miniapp — голосование с вариантами, после выбора показ процентов."""
    from fastapi.responses import HTMLResponse
    if not params:
        params = request.query_params.get("WebAppStartParam", "") or request.query_params.get("startapp", "") or ""
    poll_id = ""
    if params.startswith("poll_"):
        poll_id = params[5:]
    elif params:
        poll_id = params

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script>
var _waReady=false;
var _s=document.createElement('script');_s.src='https://st.max.ru/js/max-web-app.js';
_s.onload=function(){{_waReady=true;try{{window.WebApp.ready()}}catch(e){{}};if(window._pendingInit)window._pendingInit();}};
_s.onerror=function(){{_waReady=true;if(window._pendingInit)window._pendingInit();}};
document.head.appendChild(_s);
setTimeout(function(){{if(!_waReady){{_waReady=true;if(window._pendingInit)window._pendingInit();}}}},2000);
</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1f2937}}
.app{{max-width:480px;margin:0 auto;min-height:100vh;background:#fff;display:flex;flex-direction:column;padding-bottom:16px}}
.header{{padding:20px 20px 16px;text-align:center;background:linear-gradient(135deg,#4361ee 0%,#7b68ee 100%);color:#fff}}
.header .ch{{font-size:.78rem;opacity:.85;margin-bottom:6px;letter-spacing:.04em;text-transform:uppercase}}
.header .q{{font-size:1.15rem;font-weight:700;line-height:1.35}}
.header .meta{{font-size:.78rem;opacity:.85;margin-top:6px}}
.options{{padding:14px 16px;display:flex;flex-direction:column;gap:10px}}
.opt{{position:relative;padding:14px 18px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;transition:all .15s;overflow:hidden;text-align:left;font-size:.95rem;color:#1a1a2e;font-weight:500;width:100%;font-family:inherit}}
.opt:hover{{border-color:#4361ee;background:rgba(67,97,238,0.03)}}
.opt:disabled{{cursor:default;opacity:1}}
.opt.voted{{border-color:#4361ee;background:rgba(67,97,238,0.05);font-weight:600}}
.opt-bar{{position:absolute;top:0;left:0;bottom:0;background:linear-gradient(90deg,rgba(67,97,238,0.10),rgba(123,104,238,0.18));z-index:0;border-radius:12px;transition:width .4s ease}}
.opt-content{{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:10px}}
.opt-pct{{font-weight:700;color:#4361ee;font-size:.92rem;white-space:nowrap}}
.opt-cnt{{font-size:.72rem;color:#6b7280;font-weight:400}}
.foot{{text-align:center;padding:10px 16px 8px;color:#9ca3af;font-size:.78rem}}
.toast{{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:10px 16px;border-radius:10px;font-size:.85rem;opacity:0;transition:opacity .25s;pointer-events:none;z-index:50}}
.toast.show{{opacity:.95}}
.loading{{text-align:center;padding:40px;color:#9ca3af}}
.spinner{{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#4361ee;border-radius:50%;animation:sp .6s linear infinite;margin:0 auto 8px}}
@keyframes sp{{to{{transform:rotate(360deg)}}}}
.closed-badge{{display:inline-block;background:rgba(255,255,255,0.20);padding:3px 10px;border-radius:8px;font-size:.72rem;margin-top:6px}}
.tap-hint{{text-align:center;color:#9ca3af;font-size:.78rem;margin-top:4px}}
</style>
</head><body>
<div class="app" id="app"><div class="loading"><div class="spinner"></div>Загрузка...</div></div>
<div class="toast" id="toast"></div>
<script>
const API = '/api/polls/public';
const POLL_ID = '{poll_id}';
let uid = '', platform = 'max', userName = '', userUsername = '';
let state = null;
let voted = false;

function esc(s){{return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''}}

function toast(text){{var t=document.getElementById('toast');t.textContent=text;t.classList.add('show');setTimeout(function(){{t.classList.remove('show')}},1800)}}

function tryReadWebAppUser() {{
  try {{
    if (window.WebApp && window.WebApp.initDataUnsafe) {{
      const u = window.WebApp.initDataUnsafe.user;
      if (u && (u.user_id || u.id)) {{
        // MAX SDK даёт user.user_id (строка), TG — user.id (long int).
        // Различаем по наличию user_id (приоритет — MAX), иначе по длине.
        const isMax = !!u.user_id || (window.WebApp && window.WebApp.platform === 'max');
        return {{
          uid: String(u.user_id || u.id),
          name: ((u.first_name||'')+' '+(u.last_name||'')).trim(),
          username: u.username || '',
          platform: isMax ? 'max' : 'telegram',
        }};
      }}
    }}
  }} catch(e) {{}}
  return null;
}}

async function resolveUser() {{
  // Ждём MAX SDK до 4 секунд — initDataUnsafe.user может появиться не сразу
  const start = Date.now();
  while (Date.now() - start < 4000) {{
    const u = tryReadWebAppUser();
    if (u) {{
      uid = u.uid;
      userName = u.name;
      userUsername = u.username;
      platform = u.platform;
      return;
    }}
    await new Promise(r => setTimeout(r, 200));
  }}
  // SDK не отдал user — стабильный анонимный id, восстанавливается из localStorage
  const ANON_KEY = 'poll_uid_anon_v2';
  let stored = '';
  try {{ stored = localStorage.getItem(ANON_KEY) || ''; }} catch(e) {{}}
  if (!stored) {{
    stored = 'anon_' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
    try {{ localStorage.setItem(ANON_KEY, stored); }} catch(e) {{}}
  }}
  uid = stored;
  platform = 'max';
}}

async function load() {{
  const url = API + '/' + POLL_ID + (uid ? '?uid=' + encodeURIComponent(uid) + '&platform=' + platform : '');
  const r = await fetch(url);
  const d = await r.json();
  if (!d.success) {{
    document.getElementById('app').innerHTML = '<div class="loading">Опрос не найден</div>';
    return;
  }}
  state = d.poll;
  voted = (d.my_votes && d.my_votes.length > 0);
  render(d.my_votes || []);
}}

function render(myVotes) {{
  const showResults = voted || state.is_closed;
  let h = '<div class="header">';
  if (state.channel_title) h += '<div class="ch">' + esc(state.channel_title) + '</div>';
  h += '<div class="q">📊 ' + esc(state.question) + '</div>';
  h += '<div class="meta">' + (state.total_votes || 0) + ' ' + plural(state.total_votes||0, 'голос', 'голоса', 'голосов') +
       ' · ' + (state.is_anonymous ? 'анонимно' : 'открытый');
  if (state.allow_multiple) h += ' · мульти-выбор';
  h += '</div>';
  if (state.is_closed) h += '<div class="closed-badge">🔒 Опрос закрыт</div>';
  h += '</div>';

  h += '<div class="options">';
  for (const opt of state.options) {{
    const isMine = myVotes.includes(opt.id);
    const pct = opt.percent || 0;
    h += '<button class="opt ' + (isMine ? 'voted' : '') + '" data-id="' + opt.id + '" ' +
         (state.is_closed ? 'disabled' : '') + '>';
    if (showResults) {{
      h += '<div class="opt-bar" style="width:' + pct + '%"></div>';
    }}
    h += '<div class="opt-content">';
    h += '<span>' + (isMine ? '✓ ' : '') + esc(opt.text) + '</span>';
    if (showResults) {{
      h += '<span class="opt-pct">' + pct + '%<span class="opt-cnt"> · ' + opt.votes + '</span></span>';
    }}
    h += '</div></button>';
  }}
  h += '</div>';

  if (!showResults) h += '<div class="tap-hint">Тапните на вариант, чтобы проголосовать</div>';
  h += '<div class="foot">MAX Маркетинг · ПКРеклама</div>';
  document.getElementById('app').innerHTML = h;

  document.querySelectorAll('.opt').forEach(el => {{
    el.addEventListener('click', () => vote(parseInt(el.dataset.id)));
  }});
}}

async function vote(optId) {{
  if (state.is_closed) return;
  try {{
    const r = await fetch(API + '/' + POLL_ID + '/vote', {{
      method: 'POST', headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{option_id: optId, uid, platform, name: userName, username: userUsername}}),
    }});
    const d = await r.json();
    if (d.success) {{
      state = d.poll;
      voted = (d.my_votes && d.my_votes.length > 0);
      render(d.my_votes || []);
      if (d.message) toast(d.message);
      try {{ window.WebApp && window.WebApp.HapticFeedback && window.WebApp.HapticFeedback.notificationOccurred('success'); }} catch(e) {{}}
    }} else {{
      toast(d.error || 'Ошибка');
    }}
  }} catch(e) {{
    toast('Ошибка сети');
  }}
}}

function plural(n, one, few, many) {{
  const m = n % 10, h = n % 100;
  if (m === 1 && h !== 11) return one;
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return few;
  return many;
}}

window._pendingInit = async function() {{
  await resolveUser();
  await load();
}};
if (_waReady) {{ window._pendingInit(); }}
</script>
</body></html>"""
    return HTMLResponse(html)


@app.get("/comments-app")
@app.get("/comments-app/{params}")
async def comments_app_page(request: Request, params: str = ""):
    """Comments miniapp — view and add comments to a post."""
    from fastapi.responses import HTMLResponse
    if not params:
        params = request.query_params.get("WebAppStartParam", "") or request.query_params.get("startapp", "") or ""
    # Parse comments_{post_type}_{post_id}  e.g. comments_content_42
    post_type = "content"
    post_id = ""
    if params.startswith("comments_"):
        parts = params[9:].split("_", 1)
        if len(parts) == 2:
            post_type = parts[0]
            post_id = parts[1]
        elif len(parts) == 1:
            post_id = parts[0]

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script>
var _waReady=false;
var _s=document.createElement('script');_s.src='https://st.max.ru/js/max-web-app.js';
_s.onload=function(){{
  _waReady=true;
  try{{window.WebApp.ready()}}catch(e){{}}
  if(window._pendingInit)window._pendingInit();
}};
_s.onerror=function(){{_waReady=true;if(window._pendingInit)window._pendingInit();}};
document.head.appendChild(_s);
setTimeout(function(){{if(!_waReady){{_waReady=true;if(window._pendingInit)window._pendingInit();}}}},2000);
</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1f2937}}
.app{{max-width:480px;margin:0 auto;min-height:100vh;background:#fff;display:flex;flex-direction:column}}
.header{{padding:16px 20px;text-align:center;color:#fff;position:sticky;top:0;z-index:10}}
.header h1{{font-size:1.1rem;font-weight:600}}
.header p{{font-size:0.82rem;opacity:0.85;margin-top:2px}}
.comments-list{{padding:12px 16px;flex:1;overflow-y:auto;padding-bottom:80px}}
.comment{{padding:12px;border-bottom:1px solid #f0f0f0}}
.comment:last-child{{border-bottom:none}}
.comment-author{{font-weight:600;font-size:0.9rem;color:#374151}}
.comment-time{{font-size:0.72rem;color:#9ca3af;margin-left:8px}}
.comment-text{{font-size:0.9rem;margin-top:4px;line-height:1.5;color:#4b5563}}
.compose{{position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:#fff;border-top:1px solid #e5e7eb;padding:12px 16px;display:flex;gap:8px;z-index:20}}
.compose input{{flex:1;padding:10px 14px;border:1px solid #e5e7eb;border-radius:20px;font-size:0.9rem;outline:none}}
.compose input:focus{{border-color:var(--pc,#4F46E5)}}
.compose button{{padding:10px 20px;border:none;border-radius:20px;font-weight:600;font-size:0.9rem;cursor:pointer;color:#fff}}
.compose button:disabled{{opacity:0.5}}
.empty{{text-align:center;padding:40px 20px;color:#9ca3af;font-size:0.9rem}}
.loading{{text-align:center;padding:40px;color:#9ca3af}}
.spinner{{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:var(--pc,#4F46E5);border-radius:50%;animation:sp .6s linear infinite;margin:0 auto 8px}}
@keyframes sp{{to{{transform:rotate(360deg)}}}}
.avatar{{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;object-fit:cover}}
.comment-row{{display:flex;gap:10px;align-items:flex-start}}
</style>
</head><body>
<div class="app" id="app"><div class="loading"><div class="spinner"></div><p>Загрузка...</p></div></div>
<script>
const API = '/api/comments/public';
const POST_TYPE = '{post_type}';
const POST_ID = '{post_id}';
let userName = '';
let maxUserId = '';
let userPhoto = '';
let channelTitle = '';
let pc = '#4F46E5';
let _pt = POST_TYPE, _pi = POST_ID;
let _settings = {{}};

function esc(s) {{ return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }}

async function init() {{
  // Try WebApp bridge (may not be available if opened via direct link)
  try {{
    if (window.WebApp) {{
      window.WebApp.ready();
      const u = window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user;
      if (u) {{
        userName = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
        maxUserId = String(u.user_id || u.id || '');
        userPhoto = u.avatar_url || u.photo_url || '';
      }}
    }}
  }} catch(e) {{ console.log('WebApp not available:', e); }}

  // If no POST_ID from server, try getting from WebApp start_param
  if (!_pi && window.WebApp && window.WebApp.initDataUnsafe) {{
    let sp = window.WebApp.initDataUnsafe.start_param || '';
    if (sp.startsWith('comments_')) {{
      const parts = sp.slice(9).split('_');
      if (parts.length >= 2) {{ _pt = parts[0]; _pi = parts[1]; }}
      else if (parts.length === 1) {{ _pi = parts[0]; }}
    }}
  }}
  // Also try URL params
  if (!_pi) {{
    const urlP = new URLSearchParams(window.location.search);
    const sp2 = urlP.get('WebAppStartParam') || urlP.get('startapp') || '';
    if (sp2.startsWith('comments_')) {{
      const parts = sp2.slice(9).split('_');
      if (parts.length >= 2) {{ _pt = parts[0]; _pi = parts[1]; }}
      else if (parts.length === 1) {{ _pi = parts[0]; }}
    }}
  }}
  if (!_pi) {{
    document.getElementById('app').innerHTML = '<div class="empty">Комментарии не найдены. Откройте ссылку из поста канала.</div>';
    return;
  }}
  try {{
    const r = await fetch(API + '/' + _pt + '/' + _pi);
    const data = await r.json();
    if (data.success) {{
      channelTitle = data.channel_title || '';
      const s = data.settings || {{}};
      _settings = s;
      pc = s.primary_color || '#4F46E5';
      document.documentElement.style.setProperty('--pc', pc);
      render(data.comments || []);
    }} else {{
      document.getElementById('app').innerHTML = '<div class="empty">Пост не найден</div>';
    }}
  }} catch(e) {{
    document.getElementById('app').innerHTML = '<div class="empty">Ошибка загрузки</div>';
  }}
}}

function render(comments) {{
  const app = document.getElementById('app');
  // Build header background from settings
  let headerBg = 'background:' + pc;
  if (_settings.bg_type === 'gradient') {{
    headerBg = 'background:linear-gradient(' + (_settings.gradient_direction||'135deg') + ',' + (_settings.gradient_from||pc) + ',' + (_settings.gradient_to||'#7C3AED') + ')';
  }} else if (_settings.bg_type === 'image' && _settings.bg_image_url) {{
    headerBg = 'background-image:url(' + _settings.bg_image_url + ');background-size:cover;background-position:center';
  }} else if (_settings.bg_color) {{
    headerBg = 'background:' + _settings.bg_color;
  }}
  // Page background
  let pageBg = '';
  if (_settings.page_bg_type === 'gradient') {{
    pageBg = 'background:linear-gradient(' + (_settings.page_gradient_direction||'180deg') + ',' + (_settings.page_gradient_from||'#f5f5f5') + ',' + (_settings.page_gradient_to||'#e0e7ff') + ')';
  }} else if (_settings.page_bg_type === 'color' && _settings.page_bg_color) {{
    pageBg = 'background:' + _settings.page_bg_color;
  }}
  if (pageBg) document.querySelector('.app').style.cssText = pageBg;

  let headerTitle = _settings.header_text || 'Комментарии';
  const htc = _settings.header_text_color || '#fff';
  const ptc = _settings.page_text_color || '#1f2937';
  function hexToRgb(hex) {{ const m=(hex||'#000').replace('#','').match(/.{{2}}/g); return m?m.map(x=>parseInt(x,16)).join(','):'0,0,0'; }}
  const oc = _settings.overlay_color || '#000000';

  let h = '<div class="header" style="' + headerBg + ';position:relative;color:' + htc + '">';
  if (_settings.bg_type === 'image' && _settings.bg_image_url) {{
    h += '<div style="position:absolute;inset:0;background:rgba(' + hexToRgb(oc) + ',' + ((_settings.overlay_opacity||40)/100) + ')';
    if (_settings.blur) h += ';backdrop-filter:blur(' + _settings.blur + 'px)';
    h += '"></div>';
  }}
  h += '<div style="position:relative;z-index:1"><h1>' + esc(headerTitle) + '</h1>';
  if (channelTitle) h += '<p>' + esc(channelTitle) + '</p>';
  h += '</div></div>';
  // Apply page text color
  document.documentElement.style.setProperty('--text-color', ptc);
  h += '<div class="comments-list" style="color:' + ptc + '">';
  if (!comments.length) {{
    h += '<div class="empty">Пока нет комментариев. Будьте первым!</div>';
  }}
  const colors = ['#4F46E5','#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626'];
  comments.forEach((c, i) => {{
    const color = colors[(c.user_name || '').charCodeAt(0) % colors.length];
    const letter = (c.user_name || 'А')[0].toUpperCase();
    const time = c.created_at ? new Date(c.created_at).toLocaleString('ru-RU', {{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}}) : '';
    h += '<div class="comment"><div class="comment-row">';
    if (c.user_avatar) {{
      h += '<img class="avatar" src="' + esc(c.user_avatar) + '" alt="">';
    }} else {{
      h += '<div class="avatar" style="background:' + color + '">' + esc(letter) + '</div>';
    }}
    h += '<div><span class="comment-author">' + esc(c.user_name || 'Аноним') + '</span>';
    h += '<span class="comment-time">' + time + '</span>';
    if (c.reply_to_name) {{
      h += '<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px">↩ ' + esc(c.reply_to_name) + '</div>';
    }}
    h += '<div class="comment-text">' + esc(c.comment_text) + '</div>';
    h += '<span class="reply-btn" data-id="' + c.id + '" data-name="' + esc(c.user_name || 'Аноним') + '" style="font-size:0.72rem;color:' + pc + ';cursor:pointer;margin-top:2px;display:inline-block" onclick="setReply(this.dataset.id,this.dataset.name)">Ответить</span>';
    h += '</div></div></div>';
  }});
  h += '</div>';
  h += '<div class="compose">';
  h += '<input id="c-input" placeholder="Написать комментарий..." maxlength="500">';
  h += '<button id="c-btn" style="background:' + pc + '" onclick="send()">→</button>';
  h += '</div>';
  app.innerHTML = h;
  // Enter to send
  document.getElementById('c-input').addEventListener('keydown', function(e) {{
    if (e.key === 'Enter') send();
  }});
}}

let replyToId = null;
let replyToName = '';

function setReply(id, name) {{
  replyToId = id;
  replyToName = name;
  const input = document.getElementById('c-input');
  input.placeholder = '↩ Ответ для ' + name + '...';
  input.focus();
  // Show cancel
  let cancel = document.getElementById('reply-cancel');
  if (!cancel) {{
    cancel = document.createElement('div');
    cancel.id = 'reply-cancel';
    cancel.style.cssText = 'font-size:0.75rem;color:#9ca3af;padding:4px 16px;cursor:pointer;background:#f9fafb;border-top:1px solid #e5e7eb';
    cancel.onclick = function() {{ clearReply(); }};
    document.querySelector('.compose').before(cancel);
  }}
  cancel.innerHTML = '↩ Ответ для <b>' + name + '</b> <span style="margin-left:8px;color:#e63946">✕</span>';
}}

function clearReply() {{
  replyToId = null;
  replyToName = '';
  document.getElementById('c-input').placeholder = 'Написать комментарий...';
  const cancel = document.getElementById('reply-cancel');
  if (cancel) cancel.remove();
}}

async function send() {{
  const input = document.getElementById('c-input');
  const btn = document.getElementById('c-btn');
  const text = input.value.trim();
  if (!text) return;
  btn.disabled = true;
  try {{
    const payload = {{comment_text: text, user_name: userName, max_user_id: maxUserId, user_avatar: userPhoto}};
    if (replyToId) payload.parent_id = replyToId;
    const r = await fetch(API + '/' + _pt + '/' + _pi, {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify(payload)
    }});
    const data = await r.json();
    if (data.success) {{
      input.value = '';
      clearReply();
      const r2 = await fetch(API + '/' + _pt + '/' + _pi);
      const d2 = await r2.json();
      if (d2.success) render(d2.comments || []);
      window.scrollTo(0, document.body.scrollHeight);
    }} else {{
      alert(data.detail || 'Ошибка');
    }}
  }} catch(e) {{ alert('Ошибка: ' + e.message); }}
  finally {{ btn.disabled = false; }}
}}

// Wait for WebApp bridge then init
if (_waReady) {{ init(); }} else {{ window._pendingInit = function(){{ init(); }}; }}
</script>
</body></html>"""
    return HTMLResponse(html)


@app.get("/booking")
@app.get("/booking/{params}")
async def booking_page(request: Request, params: str = ""):
    """Booking miniapp — standalone SPA for service booking."""
    from fastapi.responses import HTMLResponse
    if not params:
        params = request.query_params.get("WebAppStartParam", "") or request.query_params.get("startapp", "") or ""
    # Parse book_{tc} or book_{tc}_{branch_id}
    tc = ""
    branch_id = ""
    if params.startswith("book_"):
        parts = params[5:].split("_", 1)
        tc = parts[0] if parts else ""
        branch_id = parts[1] if len(parts) > 1 else ""
    elif params:
        tc = params

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script src="https://st.max.ru/js/max-web-app.js" async></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1f2937}}
.app{{max-width:480px;margin:0 auto;min-height:100vh;background:#fff}}
.header{{padding:16px 20px;text-align:center;color:#fff;position:sticky;top:0;z-index:10}}
.header h1{{font-size:1.2rem;font-weight:600}}
.header p{{font-size:0.85rem;opacity:0.85;margin-top:4px}}
.section{{padding:12px 16px}}
.section h2{{font-size:1rem;font-weight:600;margin-bottom:10px;color:#374151}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;transition:all .15s}}
.card:hover,.card.selected{{border-color:var(--pc,#4F46E5);box-shadow:0 0 0 2px rgba(79,70,229,0.15)}}
.card .name{{font-weight:600;font-size:0.95rem}}
.card .meta{{font-size:0.82rem;color:#6b7280;margin-top:4px}}
.card .price{{font-weight:700;color:var(--pc,#4F46E5);font-size:1.05rem;margin-top:4px}}
.slots-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}}
.slot{{padding:8px 4px;text-align:center;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:0.85rem;transition:all .15s}}
.slot:hover,.slot.selected{{background:var(--pc,#4F46E5);color:#fff;border-color:var(--pc,#4F46E5)}}
.btn{{display:block;width:100%;padding:14px;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;color:#fff;transition:opacity .15s}}
.btn:disabled{{opacity:0.5}}
.form-input{{width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;margin-bottom:10px;outline:none}}
.form-input:focus{{border-color:var(--pc,#4F46E5)}}
.form-label{{display:block;font-size:0.85rem;font-weight:500;margin-bottom:4px;color:#374151}}
.dates-row{{display:flex;gap:6px;overflow-x:auto;padding:4px 0;margin-bottom:10px;-webkit-overflow-scrolling:touch}}
.date-btn{{flex-shrink:0;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;text-align:center;font-size:0.82rem;transition:all .15s}}
.date-btn:hover,.date-btn.selected{{background:var(--pc,#4F46E5);color:#fff;border-color:var(--pc,#4F46E5)}}
.date-btn.disabled{{opacity:0.35;pointer-events:none;background:#f3f4f6}}
.date-btn .day{{font-weight:600;font-size:0.9rem}}
.date-btn .weekday{{font-size:0.72rem;color:#6b7280}}
.date-btn.selected .weekday{{color:rgba(255,255,255,0.8)}}
.date-btn.today{{border-color:var(--pc,#4F46E5)}}
.cal-overlay{{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;display:flex;align-items:center;justify-content:center}}
.cal-box{{background:#fff;border-radius:16px;padding:16px;width:320px;max-width:90vw}}
.cal-nav{{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}}
.cal-nav button{{background:none;border:none;font-size:1.2rem;cursor:pointer;padding:4px 8px;color:#374151}}
.cal-nav span{{font-weight:600;font-size:0.95rem}}
.cal-grid{{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}}
.cal-grid .cal-hdr{{font-size:0.72rem;color:#9ca3af;font-weight:600;padding:4px 0}}
.cal-grid .cal-day{{padding:8px 4px;border-radius:8px;font-size:0.85rem;cursor:pointer;transition:all .12s}}
.cal-grid .cal-day:hover{{background:rgba(79,70,229,0.1)}}
.cal-grid .cal-day.sel{{background:var(--pc,#4F46E5);color:#fff}}
.cal-grid .cal-day.today-mark{{border:1.5px solid var(--pc,#4F46E5)}}
.cal-grid .cal-day.past{{color:#d1d5db;pointer-events:none}}
.cal-grid .cal-day.empty{{pointer-events:none}}
.time-group{{margin-bottom:12px}}
.time-group-title{{font-size:0.82rem;font-weight:600;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:6px}}
.time-group-title span{{font-size:0.9rem}}
.back-btn{{background:none;border:none;font-size:0.9rem;color:var(--pc,#4F46E5);cursor:pointer;padding:8px 0;font-weight:500}}
.loading{{text-align:center;padding:40px;color:#9ca3af}}
.spinner{{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:var(--pc,#4F46E5);border-radius:50%;animation:spin .6s linear infinite;margin:0 auto 12px}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
.specialist-card{{display:flex;gap:12px;align-items:center}}
.avatar{{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0}}
.success-screen{{text-align:center;padding:48px 24px}}
.success-screen .icon{{font-size:3rem;margin-bottom:12px}}
.success-screen h2{{margin-bottom:8px}}
.success-screen p{{color:#6b7280;font-size:0.9rem}}
</style>
</head><body>
<div class="app" id="app"><div class="loading"><div class="spinner"></div><p>Загрузка...</p></div></div>
<script>
const API = '/api/services/public';
const TC = '{tc}';
const BRANCH_ID = '{branch_id}';
let appearance = {{}};
let privacyPolicyUrl = '';
let state = {{step:'services',services:[],specialists:[],selectedService:null,selectedSpecialist:null,selectedDate:'',selectedSlot:null,showCal:false,calYear:new Date().getFullYear(),calMonth:new Date().getMonth(),userName:'',userPhone:'',userEmail:'',userId:'',availableDates:null}};
const WEEKDAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
var WB = window.WebApp || {{}};
function bHaptic(t) {{ try {{ if (WB.HapticFeedback) WB.HapticFeedback[t==='success'?'notificationOccurred':'impactOccurred'](t==='success'?'success':'light'); }} catch(e) {{}} }}
function bUpdateBack() {{ try {{ if (!WB.BackButton) return; if (state.step==='services') WB.BackButton.hide(); else WB.BackButton.show(); }} catch(e) {{}} }}
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function localDateStr(d) {{ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }}

async function api(path) {{
  const r = await fetch(API + '/' + TC + path);
  return r.json();
}}

async function init() {{
  try {{
    if (window.WebApp) {{
      try {{ window.WebApp.ready(); }} catch(e) {{}}
      var u = window.WebApp.initDataUnsafe && window.WebApp.initDataUnsafe.user;
      if (u) {{
        state.userName = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
        state.userId = u.id || '';
      }}
      try {{ if (WB.BackButton) WB.BackButton.onClick(function() {{ bookGoBack(); }}); }} catch(e) {{}}
    }}
    const [catData, appData] = await Promise.all([api('/catalog'), api('/appearance')]);
    if (catData.success) state.services = catData.services || [];
    if (appData.success && appData.settings) appearance = appData.settings;
    if (appData.privacy_policy_url) privacyPolicyUrl = appData.privacy_policy_url;
    document.documentElement.style.setProperty('--pc', appearance.primary_color || '#4F46E5');
    render();
  }} catch(e) {{
    document.getElementById('app').innerHTML = '<div class="loading"><p>Ошибка загрузки: ' + e.message + '</p></div>';
  }}
}}

function render() {{
  const app = document.getElementById('app');
  const pc = appearance.primary_color || '#4F46E5';
  const a = appearance;
  // Header background
  let headerBg = 'background:' + pc;
  if (a.bg_type === 'gradient') {{
    headerBg = 'background:linear-gradient(' + (a.gradient_direction||'135deg') + ',' + (a.gradient_from||pc) + ',' + (a.gradient_to||'#7C3AED') + ')';
  }} else if (a.bg_type === 'image' && a.bg_image_url) {{
    headerBg = 'background-image:url(' + a.bg_image_url + ');background-size:cover;background-position:center';
  }} else if (a.bg_color) {{
    headerBg = 'background:' + a.bg_color;
  }}
  // Page background
  if (a.page_bg_type === 'gradient') {{
    document.querySelector('.app').style.background = 'linear-gradient(' + (a.page_gradient_direction||'180deg') + ',' + (a.page_gradient_from||'#f5f5f5') + ',' + (a.page_gradient_to||'#e0e7ff') + ')';
  }} else if (a.page_bg_type === 'color' && a.page_bg_color) {{
    document.querySelector('.app').style.background = a.page_bg_color;
  }}
  let h = '<div class="header" style="' + headerBg + ';position:relative">';
  if (a.bg_type === 'image' && a.bg_image_url) {{
    h += '<div style="position:absolute;inset:0;background:rgba(0,0,0,' + ((a.overlay_opacity||40)/100) + ')';
    if (a.blur) h += ';backdrop-filter:blur(' + a.blur + 'px)';
    h += '"></div>';
  }}
  h += '<div style="position:relative;z-index:1"><h1>' + (a.welcome_text || 'Запись на услугу') + '</h1></div></div>';

  // Cover image on services screen
  if (state.step === 'services' && appearance.logo_url) {{
    h += '<div style="padding:0 16px"><img src="' + esc(appearance.logo_url) + '" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin-top:12px" alt=""></div>';
  }}

  if (state.step === 'services') {{
    h += '<div class="section"><h2>Выберите услугу</h2>';
    if (!state.services.length) h += '<p style="color:#9ca3af;text-align:center;padding:20px">Нет доступных услуг</p>';
    state.services.forEach((s, i) => {{
      h += '<div class="card" onclick="selectService(' + i + ')">';
      if (s.image_url) h += '<img src="' + esc(s.image_url) + '" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px" alt="">';
      h += '<div class="name">' + esc(s.name) + '</div>';
      if (s.description) h += '<div class="meta">' + esc(s.description) + '</div>';
      h += '<div class="meta">' + s.duration_minutes + ' мин</div>';
      h += '<div class="price">' + Number(s.price).toLocaleString('ru-RU') + ' ₽</div>';
      h += '</div>';
    }});
    h += '</div>';
  }}

  if (state.step === 'specialists') {{
    h += '<div class="section"><button class="back-btn" onclick="goBack(\\\'services\\\')">&larr; Назад</button>';
    h += '<h2>Выберите специалиста</h2>';
    if (!state.specialists.length) h += '<p style="color:#9ca3af;text-align:center;padding:20px">Нет доступных специалистов</p>';
    state.specialists.forEach((s, i) => {{
      h += '<div class="card" onclick="selectSpecialist(' + i + ')">';
      h += '<div class="specialist-card">';
      const color = ['#4F46E5','#7C3AED','#2563EB','#0891B2','#059669'][i % 5];
      if (s.photo_url) {{
        h += '<img src="' + esc(s.photo_url) + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover">';
      }} else {{
        h += '<div class="avatar" style="background:' + color + '">' + esc((s.name||'С')[0]) + '</div>';
      }}
      h += '<div><div class="name">' + esc(s.name) + '</div>';
      if (s.position) h += '<div class="meta">' + esc(s.position) + '</div>';
      h += '</div></div></div>';
    }});
    h += '</div>';
  }}

  if (state.step === 'datetime') {{
    h += '<div class="section"><button class="back-btn" onclick="goBack(\\\'specialists\\\')">&larr; Назад</button>';
    h += '<h2>Дата и время</h2>';
    // Week strip - current week starting from Monday
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = localDateStr(today);
    // Find Monday of current week
    const mon = new Date(today);
    const dow = mon.getDay(); // 0=Sun
    mon.setDate(mon.getDate() - (dow === 0 ? 6 : dow - 1));
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">';
    h += '<div class="dates-row" style="flex:1">';
    const avail = state.availableDates;
    for (let i = 0; i < 7; i++) {{
      const d = new Date(mon); d.setDate(d.getDate() + i);
      const ds = localDateStr(d);
      const isPast = d < today;
      const noSlots = avail && !avail.includes(ds);
      const disabled = isPast || noSlots;
      const isToday = ds === todayStr;
      const sel = state.selectedDate === ds ? ' selected' : '';
      const cls = disabled ? ' disabled' : (isToday ? ' today' : '');
      if (disabled) {{
        h += '<div class="date-btn disabled">';
      }} else {{
        h += '<div class="date-btn' + sel + cls + '" onclick="selectDate(\\\'' + ds + '\\\')">';
      }}
      h += '<div class="day">' + d.getDate() + '</div>';
      h += '<div class="weekday">' + WEEKDAYS[d.getDay()] + '</div>';
      h += '</div>';
    }}
    h += '</div>';
    // Calendar button
    h += '<div style="flex-shrink:0"><button style="background:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:1.1rem" onclick="toggleCal()">&#128197;</button></div>';
    h += '</div>';

    // Full month calendar overlay
    if (state.showCal) {{
      h += '<div class="cal-overlay" onclick="toggleCal()">';
      h += '<div class="cal-box" onclick="event.stopPropagation()">';
      h += '<div class="cal-nav">';
      h += '<button onclick="calPrev()">&larr;</button>';
      h += '<span>' + MONTHS[state.calMonth] + ' ' + state.calYear + '</span>';
      h += '<button onclick="calNext()">&rarr;</button>';
      h += '</div>';
      h += '<div class="cal-grid">';
      WEEKDAYS_SHORT.forEach(wd => {{ h += '<div class="cal-hdr">' + wd + '</div>'; }});
      const first = new Date(state.calYear, state.calMonth, 1);
      let startDow = first.getDay(); // 0=Sun
      startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0
      const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();
      for (let i = 0; i < startDow; i++) h += '<div class="cal-day empty"></div>';
      for (let d = 1; d <= daysInMonth; d++) {{
        const dt = new Date(state.calYear, state.calMonth, d);
        const ds = localDateStr(dt);
        const isPast = dt < today;
        const noSlots = avail && !avail.includes(ds);
        const disabled = isPast || noSlots;
        const isSel = state.selectedDate === ds;
        const isT = ds === todayStr;
        let cls = 'cal-day';
        if (disabled) cls += ' past';
        if (isSel) cls += ' sel';
        if (isT && !disabled) cls += ' today-mark';
        if (disabled) {{
          h += '<div class="' + cls + '">' + d + '</div>';
        }} else {{
          h += '<div class="' + cls + '" onclick="selectDate(\\\'' + ds + '\\\');toggleCal()">' + d + '</div>';
        }}
      }}
      h += '</div></div></div>';
    }}

    // Time slots grouped by period
    if (state.selectedDate) {{
      if (state.loadingSlots) {{
        h += '<div class="loading"><div class="spinner"></div></div>';
      }} else if (state.slots && state.slots.length) {{
        const morning = state.slots.filter(s => {{ const h = parseInt(s.start); return h < 12; }});
        const afternoon = state.slots.filter(s => {{ const h = parseInt(s.start); return h >= 12 && h < 17; }});
        const evening = state.slots.filter(s => {{ const h = parseInt(s.start); return h >= 17; }});
        const groups = [
          {{title: '🌅 Утро', slots: morning}},
          {{title: '☀️ День', slots: afternoon}},
          {{title: '🌙 Вечер', slots: evening}},
        ];
        groups.forEach(g => {{
          if (g.slots.length === 0) return;
          h += '<div class="time-group">';
          h += '<div class="time-group-title"><span>' + g.title + '</span></div>';
          h += '<div class="slots-grid">';
          g.slots.forEach(sl => {{
            const sel = state.selectedSlot && state.selectedSlot.start === sl.start ? ' selected' : '';
            h += '<div class="slot' + sel + '" onclick="selectSlot(\\\'' + sl.start + '\\\',\\\'' + sl.end + '\\\')">' + sl.start + '</div>';
          }});
          h += '</div></div>';
        }});
      }} else {{
        h += '<p style="color:#9ca3af;text-align:center;padding:16px">Нет свободных слотов на эту дату</p>';
      }}
    }}
    if (state.selectedSlot) {{
      h += '<div style="margin-top:16px"><button class="btn" style="background:' + pc + '" onclick="goToForm()">Далее</button></div>';
    }}
    h += '</div>';
  }}

  if (state.step === 'form') {{
    // Format date nicely
    const fd = new Date(state.selectedDate + 'T12:00:00');
    const dateStr = fd.getDate() + ' ' + ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][fd.getMonth()] + ', ' + WEEKDAYS[fd.getDay()];

    h += '<div class="section"><button class="back-btn" onclick="goBack(\\\'datetime\\\')">&larr; Назад</button>';
    h += '<h2>Подтверждение записи</h2>';
    // Booking summary card
    h += '<div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:16px">';
    h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    if (state.selectedSpecialist.photo_url) {{
      h += '<img src="' + esc(state.selectedSpecialist.photo_url) + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover">';
    }} else {{
      h += '<div style="width:40px;height:40px;border-radius:50%;background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">' + esc((state.selectedSpecialist.name||'С')[0]) + '</div>';
    }}
    h += '<div><div style="font-weight:600">' + esc(state.selectedSpecialist.name) + '</div>';
    if (state.selectedSpecialist.position) h += '<div style="font-size:0.82rem;color:#6b7280">' + esc(state.selectedSpecialist.position) + '</div>';
    h += '</div></div>';
    h += '<div style="display:flex;flex-direction:column;gap:6px;font-size:0.9rem">';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Услуга</span><span style="font-weight:500">' + esc(state.selectedService.name) + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Дата</span><span style="font-weight:500">' + dateStr + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Время</span><span style="font-weight:500">' + state.selectedSlot.start + ' – ' + state.selectedSlot.end + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Стоимость</span><span style="font-weight:700;color:' + pc + '">' + Number(state.selectedSpecialist.custom_price || state.selectedService.price).toLocaleString('ru-RU') + ' ₽</span></div>';
    h += '</div></div>';

    // User info (pre-filled from MAX, editable)
    h += '<div style="margin-bottom:12px">';
    h += '<label class="form-label">Имя</label>';
    h += '<input class="form-input" id="f-name" value="' + esc(state.userName) + '" placeholder="Ваше имя">';
    h += '<label class="form-label">Телефон</label>';
    h += '<div style="display:flex;gap:8px">';
    h += '<input class="form-input" id="f-phone" type="tel" value="' + esc(state.userPhone) + '" placeholder="+7..." style="flex:1;margin:0">';
    if (WB.requestContact) h += '<button class="btn" style="background:' + pc + ';padding:8px 12px;font-size:0.8rem;white-space:nowrap" onclick="bFillPhone()">Авто</button>';
    h += '</div>';
    h += '<label class="form-label">Комментарий</label>';
    h += '<textarea class="form-input" id="f-notes" rows="2" placeholder="Пожелания (необязательно)"></textarea>';
    h += '</div>';
    if (privacyPolicyUrl) {{
      h += '<p style="font-size:0.72rem;color:#9ca3af;text-align:center;margin:8px 0">'
        + 'Отправляя форму, вы соглашаетесь с <a href="' + esc(privacyPolicyUrl) + '" target="_blank" style="color:' + pc + '">политикой обработки персональных данных</a></p>';
    }}
    h += '<button class="btn" id="book-btn" style="background:' + pc + '" onclick="submitBooking()">Подтвердить запись</button>';
    h += '</div>';
  }}

  if (state.step === 'success') {{
    h += '<div class="success-screen">';
    h += '<div class="icon">✅</div>';
    h += '<h2>Вы записаны!</h2>';
    h += '<p>' + esc(state.selectedService.name) + '</p>';
    h += '<p>' + esc(state.selectedSpecialist.name) + '</p>';
    h += '<p><b>' + state.selectedDate + ' · ' + state.selectedSlot.start + '–' + state.selectedSlot.end + '</b></p>';
    h += '<button class="btn" style="background:' + pc + ';margin-top:24px" onclick="resetApp()">Записаться ещё</button>';
    h += '</div>';
  }}

  app.innerHTML = h;
}}

function esc(s) {{ return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }}

function selectService(i) {{
  state.selectedService = state.services[i];
  state.step = 'specialists';
  state.specialists = [];
  render(); bUpdateBack();
  api('/specialists?service_id=' + state.selectedService.id).then(d => {{
    if (d.success) state.specialists = d.specialists || [];
    render();
  }});
}}

function selectSpecialist(i) {{
  state.selectedSpecialist = state.specialists[i];
  state.step = 'datetime';
  state.selectedDate = '';
  state.selectedSlot = null;
  state.slots = [];
  state.availableDates = null;
  render(); bUpdateBack();
  api('/available-dates?specialist_id=' + state.selectedSpecialist.id + '&service_id=' + state.selectedService.id + '&days=60').then(d => {{
    if (d.success) state.availableDates = d.dates || [];
    render();
  }});
}}

function selectDate(d) {{
  state.selectedDate = d;
  state.selectedSlot = null;
  state.loadingSlots = true;
  render();
  api('/slots?specialist_id=' + state.selectedSpecialist.id + '&service_id=' + state.selectedService.id + '&date=' + d).then(data => {{
    state.loadingSlots = false;
    state.slots = data.success ? (data.slots || []) : [];
    render();
  }});
}}

function selectSlot(start, end) {{
  state.selectedSlot = {{start, end}};
  render();
}}

function toggleCal() {{ state.showCal = !state.showCal; render(); }}
function calPrev() {{ state.calMonth--; if (state.calMonth < 0) {{ state.calMonth = 11; state.calYear--; }} render(); }}
function calNext() {{ state.calMonth++; if (state.calMonth > 11) {{ state.calMonth = 0; state.calYear++; }} render(); }}

function goToForm() {{ state.step = 'form'; render(); }}

function goBack(step) {{
  state.step = step;
  if (step === 'services') {{ state.selectedService = null; state.selectedSpecialist = null; }}
  if (step === 'specialists') {{ state.selectedSpecialist = null; state.selectedDate = ''; state.selectedSlot = null; }}
  if (step === 'datetime') {{ state.selectedSlot = null; }}
  render(); bUpdateBack();
}}
async function bFillPhone() {{
  try {{ var r = await WB.requestContact(); if (r && r.phone) {{ var el = document.getElementById('f-phone'); if (el) el.value = r.phone; bHaptic('success'); }} }} catch(e) {{}}
}}
function bookGoBack() {{
  if (state.step === 'confirm') goBack('datetime');
  else if (state.step === 'datetime') goBack('specialists');
  else if (state.step === 'specialists') goBack('services');
}}

async function submitBooking() {{
  const name = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const notes = document.getElementById('f-notes').value.trim();
  if (!name) {{ alert('Укажите имя'); return; }}
  const btn = document.getElementById('book-btn');
  btn.disabled = true; btn.textContent = 'Подтверждение...';
  try {{
    const r = await fetch(API + '/' + TC + '/book', {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{
        service_id: state.selectedService.id,
        specialist_id: state.selectedSpecialist.id,
        branch_id: BRANCH_ID ? parseInt(BRANCH_ID) : null,
        booking_date: state.selectedDate,
        start_time: state.selectedSlot.start,
        end_time: state.selectedSlot.end,
        client_name: name, client_phone: phone, client_email: '',
        client_max_user_id: state.userId || '', notes: notes
      }})
    }});
    const data = await r.json();
    if (data.success) {{ bHaptic('success'); state.step = 'success'; render(); bUpdateBack(); }}
    else {{ alert(data.detail || 'Ошибка бронирования'); btn.disabled = false; btn.textContent = 'Подтвердить запись'; }}
  }} catch(e) {{ alert('Ошибка: ' + e.message); btn.disabled = false; btn.textContent = 'Подтвердить запись'; }}
}}

function resetApp() {{
  state = {{step:'services',services:state.services,specialists:[],selectedService:null,selectedSpecialist:null,selectedDate:'',selectedSlot:null}};
  render();
}}

init();
</script>
</body></html>"""
    return HTMLResponse(html)


@app.get("/shop-app")
@app.get("/shop-app/{params}")
async def shop_app_page(request: Request, params: str = ""):
    """Shop miniapp — standalone SPA for online shop."""
    from fastapi.responses import HTMLResponse
    if not params:
        params = request.query_params.get("WebAppStartParam", "") or request.query_params.get("startapp", "") or ""
    tc = ""
    if params.startswith("shop_"):
        tc = params[5:]
    elif params:
        tc = params

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script src="https://st.max.ru/js/max-web-app.js" async></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1f2937}}
.app{{max-width:480px;margin:0 auto;min-height:100vh;background:#fff}}
.header{{padding:14px 20px;text-align:center;color:#fff;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px}}
.header h1{{font-size:1.1rem;font-weight:600;flex:1;text-align:center}}
.header .back{{background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;padding:4px}}
.header .cart-icon{{position:relative;background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer}}
.header .cart-badge{{position:absolute;top:-6px;right:-8px;background:#ef4444;color:#fff;font-size:0.65rem;padding:1px 5px;border-radius:10px;font-weight:700}}
.banner{{width:100%;height:160px;object-fit:cover}}
.section{{padding:12px 16px}}
.section h2{{font-size:1rem;font-weight:600;margin-bottom:10px;color:#374151}}
.hscroll{{display:flex;gap:10px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch}}
.hscroll::-webkit-scrollbar{{display:none}}
.pcard{{flex-shrink:0;width:140px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;cursor:pointer}}
.pcard img{{width:100%;height:100px;object-fit:cover}}
.pcard .info{{padding:8px}}
.pcard .pname{{font-size:0.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.pcard .pprice{{font-size:0.85rem;font-weight:700;color:var(--pc,#4F46E5);margin-top:2px}}
.cat-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}}
.cat-card{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .15s}}
.cat-card:hover{{border-color:var(--pc,#4F46E5);box-shadow:0 0 0 2px rgba(79,70,229,0.12)}}
.cat-card .cname{{font-weight:600;font-size:0.9rem}}
.cat-card .ccnt{{font-size:0.78rem;color:#6b7280;margin-top:2px}}
.prod-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}}
.pgcard{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;cursor:pointer}}
.pgcard img{{width:100%;height:120px;object-fit:cover}}
.pgcard .info{{padding:8px}}
.pgcard .pname{{font-size:0.85rem;font-weight:500}}
.pgcard .pprice{{font-size:0.9rem;font-weight:700;color:var(--pc,#4F46E5);margin-top:2px}}
.pgcard .old-price{{font-size:0.78rem;color:#9ca3af;text-decoration:line-through;margin-left:4px}}
.filter-bar{{display:flex;gap:8px;overflow-x:auto;padding:4px 0;margin-bottom:12px;-webkit-overflow-scrolling:touch}}
.filter-bar::-webkit-scrollbar{{display:none}}
.fbtn{{flex-shrink:0;padding:6px 14px;border:1px solid #e5e7eb;border-radius:20px;background:#fff;cursor:pointer;font-size:0.82rem;transition:all .15s}}
.fbtn.active{{background:var(--pc,#4F46E5);color:#fff;border-color:var(--pc,#4F46E5)}}
.product-img{{width:100%;max-height:300px;object-fit:cover;border-radius:0 0 16px 16px}}
.product-info{{padding:16px}}
.product-info h2{{font-size:1.2rem;margin-bottom:6px}}
.price-row{{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}}
.price-row .cur{{font-size:1.3rem;font-weight:700;color:var(--pc,#4F46E5)}}
.price-row .old{{font-size:0.95rem;color:#9ca3af;text-decoration:line-through}}
.desc{{font-size:0.88rem;color:#6b7280;margin-bottom:12px;line-height:1.5}}
.variants{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}}
.vbtn{{padding:6px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:0.85rem}}
.vbtn.active{{background:var(--pc,#4F46E5);color:#fff;border-color:var(--pc,#4F46E5)}}
.qty-row{{display:flex;align-items:center;gap:12px;margin-bottom:14px}}
.qty-btn{{width:36px;height:36px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center}}
.qty-val{{font-size:1.1rem;font-weight:600;min-width:20px;text-align:center}}
.btn{{display:block;width:100%;padding:14px;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;color:#fff;transition:opacity .15s}}
.btn:disabled{{opacity:0.5}}
.cart-item{{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #f3f4f6}}
.cart-item img{{width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0}}
.ci-info{{flex:1}}
.ci-info .ciname{{font-size:0.88rem;font-weight:500}}
.ci-info .civar{{font-size:0.78rem;color:#6b7280}}
.ci-info .ciprice{{font-size:0.9rem;font-weight:600;color:var(--pc,#4F46E5);margin-top:2px}}
.ci-qty{{display:flex;align-items:center;gap:6px;margin-top:4px}}
.ci-qty button{{width:26px;height:26px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem}}
.ci-remove{{background:none;border:none;color:#ef4444;font-size:0.8rem;cursor:pointer;margin-top:4px}}
.promo-row{{display:flex;gap:8px;margin:12px 0}}
.promo-row input{{flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem}}
.promo-row button{{padding:10px 16px;border:none;border-radius:8px;background:var(--pc,#4F46E5);color:#fff;font-size:0.85rem;cursor:pointer}}
.totals{{margin:12px 0;font-size:0.9rem}}
.totals .row{{display:flex;justify-content:space-between;padding:4px 0}}
.totals .total{{font-weight:700;font-size:1.05rem;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px}}
.form-label{{display:block;font-size:0.85rem;font-weight:500;margin-bottom:4px;color:#374151}}
.form-input{{width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:0.95rem;margin-bottom:10px;outline:none}}
.form-input:focus{{border-color:var(--pc,#4F46E5)}}
.dm-list{{margin-bottom:12px}}
.dm-item{{padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between}}
.dm-item.active{{border-color:var(--pc,#4F46E5);background:rgba(79,70,229,0.04)}}
.success-wrap{{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;padding:40px 20px;text-align:center}}
.success-wrap .check{{width:64px;height:64px;border-radius:50%;background:var(--pc,#4F46E5);display:flex;align-items:center;justify-content:center;margin-bottom:16px}}
.success-wrap .check svg{{width:32px;height:32px;stroke:#fff;stroke-width:3;fill:none}}
.success-wrap h2{{margin-bottom:8px}}
.success-wrap p{{color:#6b7280;font-size:0.9rem}}
.empty{{text-align:center;padding:40px 20px;color:#9ca3af}}
.loading{{text-align:center;padding:40px;color:#9ca3af}}
</style>
</head><body>
<div class="app" id="app"><div class="loading">Загрузка...</div></div>
<script>
var TC = '{tc}';
var API = '/api/shop/public';
var uid = '';

function resolveUid() {{
  try {{
    var wa = window.WebApp;
    if (wa && wa.initDataUnsafe) {{
      var u = wa.initDataUnsafe.user;
      if (u && u.id) uid = String(u.id);
      if (u) S.userName = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    }}
  }} catch(e) {{ /* resolveUid error */ }}
  if (!uid) {{ uid = localStorage.getItem('shop_uid'); if (!uid) {{ uid = 'anon_' + Math.random().toString(36).slice(2,10); localStorage.setItem('shop_uid', uid); }} }}
}}

var S = {{
  screen: 'home', cat: null, prodId: null, product: null,
  categories: [], products: [], cartItems: [], appearance: {{}}, deliveryMethods: [],
  filterCat: null, variant: null, qty: 1,
  promo: '', discount: 0, promoApplied: false,
  orderNum: '', dmId: null, userName: '', userPhone: ''
}};

var $=function(id){{return document.getElementById(id)}};
var app=$('app');
var WA = window.WebApp || {{}};
function haptic(type) {{ try {{ if (WA.HapticFeedback) WA.HapticFeedback[type === 'success' ? 'notificationOccurred' : 'impactOccurred'](type === 'success' ? 'success' : 'light'); }} catch(e) {{}} }}
function updateBackButton() {{ try {{ if (!WA.BackButton) return; if (S.screen === 'home') WA.BackButton.hide(); else WA.BackButton.show(); }} catch(e) {{}} }}

function fmt(p) {{ return parseFloat(p||0).toLocaleString('ru-RU') + ' &#8381;'; }}
function img(url) {{ return url || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23f3f4f6%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2214%22>No image</text></svg>'; }}

async function api(path, opts) {{
  const r = await fetch(API + '/' + TC + path, opts);
  return r.json();
}}

// Retry user detection when bridge loads late
document.querySelector('script[src*="max-web-app"]').addEventListener('load', function() {{
  WA = window.WebApp || {{}};
  try {{ if (WA.ready) WA.ready(); }} catch(e) {{}}
  if (uid.startsWith('anon_')) {{ resolveUid(); loadCart().then(render); }}
}});

async function init() {{
  WA = window.WebApp || {{}};
  try {{
    if (WA.ready) WA.ready();
    if (WA.BackButton) WA.BackButton.onClick(function() {{ goBack(); }});
  }} catch(e) {{}}
  resolveUid();
  try {{
    const [catData, appData] = await Promise.all([api('/catalog'), api('/appearance')]);
    S.categories = catData.categories || [];
    S.products = catData.products || [];
    S.appearance = appData.settings || {{}};
    document.title = appData.channel_title || 'Shop';
    S.privacyUrl = appData.privacy_policy_url || '';
    api('/track-visit', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{user_identifier:uid}})}}).catch(()=>{{}});
    await loadCart();
    render();
  }} catch(e) {{ app.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>'; }}
}}

async function loadCart() {{
  try {{ const d = await api('/cart/' + uid); S.cartItems = d.items || []; }} catch(e) {{ S.cartItems = []; }}
}}

function pc() {{ return S.appearance.primary_color || '#4F46E5'; }}

function cartCount() {{ return S.cartItems.reduce((s,i)=>s+i.quantity, 0); }}

function headerBg() {{
  var a = S.appearance;
  if (a.bg_type === 'gradient' && a.gradient_from && a.gradient_to)
    return 'linear-gradient(' + (a.gradient_direction || '135deg') + ',' + a.gradient_from + ',' + a.gradient_to + ')';
  return a.bg_color || pc();
}}
function headerTextColor() {{ return S.appearance.header_text_color || '#fff'; }}
function pageBg() {{
  var a = S.appearance;
  if (a.page_bg_type === 'gradient' && a.page_gradient_from && a.page_gradient_to)
    return 'linear-gradient(' + (a.page_gradient_direction || '180deg') + ',' + a.page_gradient_from + ',' + a.page_gradient_to + ')';
  return a.page_bg_color || '#fff';
}}

function headerHtml(title, back) {{
  return '<div class="header" style="background:' + headerBg() + ';color:' + headerTextColor() + '">' +
    (back ? '<button class="back" onclick="goBack()" style="color:' + headerTextColor() + '">&#8592;</button>' : '<div style="width:28px"></div>') +
    '<h1>' + title + '</h1>' +
    '<button class="cart-icon" onclick="go(&#39;cart&#39;)" style="color:' + headerTextColor() + '">' +
      '&#128722;' + (cartCount() ? '<span class="cart-badge">' + cartCount() + '</span>' : '') +
    '</button></div>';
}}

function go(screen, data) {{
  if (screen === 'catalog') {{ S.filterCat = data || null; }}
  if (screen === 'product') {{ S.prodId = data; S.product = null; S.variant = null; S.qty = 1; }}
  S.screen = screen;
  render();
  updateBackButton();
  if (screen === 'product') loadProduct();
  window.scrollTo(0,0);
}}

function goBack() {{
  if (S.screen === 'product') go('catalog');
  else if (S.screen === 'checkout') go('cart');
  else if (S.screen === 'cart' || S.screen === 'catalog') go('home');
  else go('home');
}}

async function loadProduct() {{
  try {{
    const d = await api('/product/' + S.prodId);
    S.product = d.product || d;
    if (S.product.variants?.length) S.variant = S.product.variants[0];
    render();
  }} catch(e) {{}}
}}

async function addToCart() {{
  try {{
    await api('/cart', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{
      user_identifier: uid, product_id: S.prodId,
      variant_id: S.variant?.id || null, quantity: S.qty
    }})}});
    await loadCart();
    render();
    haptic('light');
    var ci = document.querySelector('.cart-icon');
    if (ci) {{
      ci.style.transition = 'transform 0.15s';
      ci.style.transform = 'scale(1.5)';
      setTimeout(function() {{ ci.style.transform = 'scale(1)'; }}, 200);
    }}
  }} catch(e) {{ alert('Ошибка добавления'); }}
}}

async function removeItem(itemId) {{
  try {{ await api('/cart/' + uid + '/' + itemId, {{method:'DELETE'}}); await loadCart(); render(); }} catch(e) {{}}
}}

async function applyPromo() {{
  if (!S.promo) return;
  try {{
    const sub = S.cartItems.reduce((s,i)=>s + (parseFloat(i.price)||0)*i.quantity, 0);
    const d = await api('/apply-promo', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{code:S.promo, subtotal:sub}})}});
    if (d.discount) {{ S.discount = d.discount; S.promoApplied = true; }}
    else {{ alert(d.detail || d.message || 'Промокод не найден'); }}
    render();
  }} catch(e) {{}}
}}

async function loadDM() {{
  try {{ const d = await api('/delivery-methods'); S.deliveryMethods = d.methods || d || []; }} catch(e) {{}}
}}

function render() {{
  const s = S.screen;
  if (s === 'home') renderHome();
  else if (s === 'catalog') renderCatalog();
  else if (s === 'product') renderProduct();
  else if (s === 'cart') renderCart();
  else if (s === 'checkout') renderCheckout();
  else if (s === 'success') renderSuccess();
  document.documentElement.style.setProperty('--pc', pc());
}}

function renderHome() {{
  const hits = S.products.filter(p=>p.is_hit).slice(0,10);
  const newest = [...S.products].sort((a,b)=>(b.id||0)-(a.id||0)).slice(0,10);
  let h = headerHtml(S.appearance.shop_name || 'Магазин', false);
  var _rawB = S.appearance.banners; if (typeof _rawB === 'string') try {{ _rawB = JSON.parse(_rawB); }} catch(e) {{ _rawB = []; }}
  var _banners = (Array.isArray(_rawB) && _rawB.length) ? _rawB : (S.appearance.banner_url ? [S.appearance.banner_url] : []);
  if (_banners.length === 1) {{
    h += '<img class="banner" src="' + _banners[0] + '">';
  }} else if (_banners.length > 1) {{
    h += '<div class="banner-slider" style="position:relative;overflow:hidden">';
    h += '<img class="banner" id="bannerImg" src="' + _banners[0] + '">';
    h += '<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;gap:4px">';
    _banners.forEach(function(_, i) {{ h += '<div class="bdot" data-i="' + i + '" style="width:' + (i===0?16:6) + 'px;height:6px;border-radius:3px;background:' + (i===0?'#fff':'rgba(255,255,255,0.5)') + ';cursor:pointer;transition:all .2s"></div>'; }});
    h += '</div></div>';
  }}
  // Приветственный текст (если задан в настройках магазина)
  if (S.appearance.welcome_text && String(S.appearance.welcome_text).trim()) {{
    var _wt = String(S.appearance.welcome_text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
    h += '<div class="section"><p style="color:#4b5563;font-size:0.92rem;line-height:1.5;margin:0">' + _wt + '</p></div>';
  }}
  if (hits.length) {{
    h += `<div class="section"><h2>Хиты</h2><div class="hscroll">`;
    hits.forEach(p => {{ h += `<div class="pcard" onclick="go('product',${{p.id}})"><img src="${{img(p.image_url)}}"><div class="info"><div class="pname">${{p.name}}</div><div class="pprice">${{fmt(p.price)}}</div></div></div>`; }});
    h += `</div></div>`;
  }}
  if (newest.length) {{
    h += `<div class="section"><h2>Новинки</h2><div class="hscroll">`;
    newest.forEach(p => {{ h += `<div class="pcard" onclick="go('product',${{p.id}})"><img src="${{img(p.image_url)}}"><div class="info"><div class="pname">${{p.name}}</div><div class="pprice">${{fmt(p.price)}}</div></div></div>`; }});
    h += `</div></div>`;
  }}
  if (S.categories.length) {{
    h += `<div class="section"><h2>Категории</h2><div class="cat-grid">`;
    S.categories.forEach(c => {{
      const cnt = S.products.filter(p=>p.category_id===c.id).length;
      h += `<div class="cat-card" onclick="go('catalog',${{c.id}})"><div class="cname">${{c.name}}</div><div class="ccnt">${{cnt}} товаров</div></div>`;
    }});
    h += `</div></div>`;
  }}
  h += `<div class="section"><button class="btn" style="background:${{pc()}}" onclick="go('catalog')">Весь каталог</button></div>`;
  app.innerHTML = h;
}}

function renderCatalog() {{
  let prods = S.filterCat ? S.products.filter(p=>p.category_id===S.filterCat) : S.products;
  let h = headerHtml('Каталог', true);
  h += `<div class="section"><div class="filter-bar">`;
  h += `<button class="fbtn ${{!S.filterCat?'active':''}}" onclick="S.filterCat=null;render()">Все</button>`;
  S.categories.forEach(c => {{
    h += `<button class="fbtn ${{S.filterCat===c.id?'active':''}}" onclick="S.filterCat=${{c.id}};render()">${{c.name}}</button>`;
  }});
  h += `</div><div class="prod-grid">`;
  prods.forEach(p => {{
    h += `<div class="pgcard" onclick="go('product',${{p.id}})"><img src="${{img(p.image_url)}}"><div class="info"><div class="pname">${{p.name}}</div><div class="pprice">${{fmt(p.price)}}${{p.old_price ? '<span class="old-price">'+fmt(p.old_price)+'</span>' : ''}}</div></div></div>`;
  }});
  if (!prods.length) h += `<div class="empty">Товары не найдены</div>`;
  h += `</div></div>`;
  app.innerHTML = h;
}}

function renderProduct() {{
  if (!S.product) {{ app.innerHTML = headerHtml('Товар', true) + '<div class="loading">Загрузка...</div>'; return; }}
  const p = S.product;
  let h = headerHtml(p.name, true);
  h += `<img class="product-img" src="${{img(p.image_url)}}">`;
  h += `<div class="product-info"><h2>${{p.name}}</h2>`;
  h += `<div class="price-row"><span class="cur">${{fmt(S.variant?.price || p.price)}}</span>`;
  if (p.old_price) h += `<span class="old">${{fmt(p.old_price)}}</span>`;
  h += `</div>`;
  if (p.description) h += `<div class="desc">${{p.description}}</div>`;
  if (p.variants?.length > 0) {{
    h += `<div class="variants">`;
    p.variants.forEach(v => {{
      h += `<button class="vbtn ${{S.variant?.id===v.id?'active':''}}" onclick="S.variant=S.product.variants.find(x=>x.id===${{v.id}});render()">${{v.name}}</button>`;
    }});
    h += `</div>`;
  }}
  h += `<div class="qty-row"><button class="qty-btn" onclick="if(S.qty>1)S.qty--;render()">−</button><span class="qty-val">${{S.qty}}</span><button class="qty-btn" onclick="S.qty++;render()">+</button></div>`;
  h += `<button class="btn" style="background:${{pc()}}" onclick="addToCart()">Добавить в корзину</button></div>`;
  app.innerHTML = h;
}}

function renderCart() {{
  let h = headerHtml('Корзина', true);
  if (!S.cartItems.length) {{
    h += `<div class="empty"><p>Корзина пуста</p><br><button class="btn" style="background:${{pc()}};max-width:200px;margin:0 auto" onclick="go('home')">В магазин</button></div>`;
    app.innerHTML = h; return;
  }}
  h += `<div class="section">`;
  S.cartItems.forEach(i => {{
    var _price = parseFloat(i.variant_price || i.price) || 0;
    h += `<div class="cart-item"><img src="${{img(i.image_url || i.product_image_url)}}"><div class="ci-info"><div class="ciname">${{i.product_name || i.name}}</div>`;
    if (i.variant_name) h += `<div class="civar">${{i.variant_name}}</div>`;
    h += `<div class="ciprice">${{fmt(_price)}} × ${{i.quantity}}</div>`;
    h += `<button class="ci-remove" onclick="removeItem(${{i.id}})">Удалить</button></div></div>`;
  }});
  const sub = S.cartItems.reduce((s,i)=>s+(parseFloat(i.variant_price || i.price)||0)*i.quantity, 0);
  h += `<div class="promo-row"><input id="promo" placeholder="Промокод" value="${{S.promo}}" onchange="S.promo=this.value"><button onclick="applyPromo()">Применить</button></div>`;
  h += `<div class="totals"><div class="row"><span>Подытог</span><span>${{fmt(sub)}}</span></div>`;
  if (S.discount) h += `<div class="row"><span>Скидка</span><span>-${{fmt(S.discount)}}</span></div>`;
  h += `<div class="row total"><span>Итого</span><span>${{fmt(Math.max(0, sub - S.discount))}}</span></div></div>`;
  h += `<button class="btn" style="background:${{pc()}}" onclick="goCheckout()">Оформить</button></div>`;
  app.innerHTML = h;
}}

async function loadCustomer() {{
  if (S.userName && S.userPhone) return;
  try {{
    const d = await api('/customer-info?uid=' + encodeURIComponent(uid));
    if (d && d.success) {{
      if (!S.userName && d.name) S.userName = d.name;
      if (!S.userPhone && d.phone) S.userPhone = d.phone;
    }}
  }} catch(e) {{ /* ignore */ }}
}}

async function goCheckout() {{ await loadDM(); await loadCustomer(); S.screen = 'checkout'; render(); window.scrollTo(0,0); }}

function renderCheckout() {{
  let h = headerHtml('Оформление', true);
  h += `<div class="section">`;
  h += '<label class="form-label">Имя</label><input class="form-input" id="cname" placeholder="Ваше имя" value="' + (S.userName || '') + '">';
  h += '<label class="form-label">Телефон</label><div style="display:flex;gap:8px"><input class="form-input" id="cphone" type="tel" placeholder="+7..." value="' + (S.userPhone || '') + '" style="flex:1;margin:0">';
  if (WA.requestContact) h += '<button class="btn" style="background:' + pc() + ';padding:8px 12px;font-size:0.8rem;white-space:nowrap" onclick="fillPhone()">Автозаполнение</button>';
  h += '</div>';
  h += '<label class="form-label">Адрес</label><input class="form-input" id="caddr" placeholder="Город, улица, дом">';
  if (S.deliveryMethods.length) {{
    h += `<label class="form-label">Доставка</label><div class="dm-list">`;
    S.deliveryMethods.forEach(m => {{
      h += `<div class="dm-item ${{S.dmId===m.id?'active':''}}" onclick="S.dmId=${{m.id}};render()"><span>${{m.name}}</span><span>${{m.price ? fmt(m.price) : 'Бесплатно'}}</span></div>`;
    }});
    h += `</div>`;
  }}
  if (S.privacyUrl) h += `<p style="font-size:0.78rem;color:#9ca3af;margin:8px 0">Оформляя заказ, вы соглашаетесь с <a href="${{S.privacyUrl}}" target="_blank">политикой конфиденциальности</a></p>`;
  h += `<button class="btn" style="background:${{pc()}};margin-top:8px" onclick="submitOrder()">Оплатить</button></div>`;
  app.innerHTML = h;
}}

async function submitOrder() {{
  const name = $('cname')?.value || '';
  const phone = $('cphone')?.value || '';
  const addr = $('caddr')?.value || '';
  if (!name || !phone) {{ alert('Заполните имя и телефон'); return; }}
  const btn = app.querySelector('.btn:last-child');
  if (btn) {{ btn.disabled = true; btn.textContent = 'Оформление...'; }}
  try {{
    const d = await api('/checkout', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{
      user_identifier: uid, client_name: name, client_phone: phone,
      client_email: '', client_address: addr,
      delivery_method_id: S.dmId, promo_code: S.promoApplied ? S.promo : '',
      notes: ''
    }})}});
    if (d.order_id || d.success) {{
      S.orderNum = d.order_number || d.order_id || '';
      S.cartItems = []; S.promo = ''; S.discount = 0; S.promoApplied = false;
      haptic('success');
      S.screen = 'success'; render();
      updateBackButton();
    }} else {{ alert(d.detail || 'Ошибка оформления'); if(btn){{ btn.disabled=false; btn.textContent='Оплатить'; }} }}
  }} catch(e) {{ alert('Ошибка оформления: ' + (e.message || e)); if(btn){{ btn.disabled=false; btn.textContent='Оплатить'; }} }}
}}

async function fillPhone() {{
  try {{
    var result = await WA.requestContact();
    if (result && result.phone) {{
      var el = $('cphone');
      if (el) el.value = result.phone;
      haptic('success');
    }}
  }} catch(e) {{}}
}}

function resetShop() {{ S.screen='home'; S.promo=''; S.discount=0; render(); }}

function renderSuccess() {{
  var botUrl = 'https://max.ru/{settings.MAX_BOT_USERNAME or "id575307462228_bot"}?start=shoporder_' + encodeURIComponent(S.orderNum);
  app.innerHTML = '<div class="success-wrap">' +
    '<div class="check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>' +
    '<h2>Заказ оформлен!</h2>' +
    '<p>Заказ ' + (S.orderNum ? '&#8470; ' + S.orderNum : '') + '</p>' +
    '<p style="font-size:0.85rem;color:#6b7280;margin-top:8px">Напишите боту для оплаты и связи с менеджером</p>' +
    '<a href="' + botUrl + '" style="display:block;text-decoration:none;margin-top:20px">' +
    '<div class="btn" style="background:' + pc() + ';max-width:260px;width:100%;margin:0 auto">Написать боту</div></a>' +
    '<div class="btn" style="background:transparent;color:' + pc() + ';border:1px solid ' + pc() + ';max-width:260px;width:100%;margin:10px auto 0;cursor:pointer" onclick="resetShop()">Продолжить покупки</div>' +
    '</div>';
}}

init();
var _bIdx=0,_bTimer=null;
function startBannerSlider(){{var _sb=S.appearance.banners;if(typeof _sb==='string')try{{_sb=JSON.parse(_sb)}}catch(e){{_sb=[]}};var b=(Array.isArray(_sb)&&_sb.length)?_sb:(S.appearance.banner_url?[S.appearance.banner_url]:[]);if(b.length<=1)return;clearInterval(_bTimer);function upd(){{var img=document.getElementById('bannerImg');if(img)img.src=b[_bIdx];document.querySelectorAll('.bdot').forEach(function(d){{var i=parseInt(d.dataset.i);d.style.width=(i===_bIdx?'16px':'6px');d.style.background=(i===_bIdx?'#fff':'rgba(255,255,255,0.5)');}});}}
_bTimer=setInterval(function(){{_bIdx=(_bIdx+1)%b.length;upd();}},10000);var sl=document.querySelector('.banner-slider');if(sl){{var sx=0;sl.ontouchstart=function(e){{sx=e.touches[0].clientX;}};sl.ontouchend=function(e){{var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40){{_bIdx=dx<0?(_bIdx+1)%b.length:(_bIdx-1+b.length)%b.length;upd();clearInterval(_bTimer);_bTimer=setInterval(function(){{_bIdx=(_bIdx+1)%b.length;upd();}},10000);}}}};document.querySelectorAll('.bdot').forEach(function(d){{d.onclick=function(){{_bIdx=parseInt(d.dataset.i);upd();}}}});}}}}
var _oR=render;render=function(){{_oR();if(S.screen==='home')startBannerSlider();}};
</script>
</body></html>"""
    return HTMLResponse(html)


@app.get("/join/{token}")
async def one_time_invite(token: str):
    """One-time invite link for paid chat members."""
    from fastapi.responses import HTMLResponse
    row = await fetch_one(
        "SELECT * FROM paid_chat_invite_tokens WHERE token = $1", token
    )
    if not row:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    if row["used"]:
        return HTMLResponse("""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
.c{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px}</style>
</head><body><div class="c"><h2>⚠️ Ссылка уже использована</h2><p>Эта пригласительная ссылка была использована ранее.</p></div></body></html>""")

    # Mark as used
    await execute("UPDATE paid_chat_invite_tokens SET used = TRUE, used_at = NOW() WHERE id = $1", row["id"])
    # Redirect to actual chat invite link
    return RedirectResponse(url=row["target_url"], status_code=302)


@app.get("/go/{code}")
async def redirect_tracking_link(code: str, request: Request):
    """Short link redirect handler."""
    link = await fetch_one("""
        SELECT tl.*, c.tracking_code, c.channel_id as ch_channel_id, c.platform,
               c.username as channel_username, c.max_chat_id, c.join_link
        FROM tracking_links tl JOIN channels c ON c.id = tl.channel_id
        WHERE tl.short_code = $1
    """, code)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if link.get("is_paused"):
        raise HTTPException(status_code=410, detail="Link paused")

    # Increment click counter & record click
    await execute("UPDATE tracking_links SET clicks = clicks + 1 WHERE id = $1", link["id"])
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    await execute("INSERT INTO clicks (link_id, ip_address, user_agent) VALUES ($1,$2,$3)", link["id"], ip, ua)

    # Lead magnet landing — redirect to /lm/ page
    link_type = link.get("link_type", "landing")
    if link_type == "lm_landing":
        qs_lm = request.url.query
        return RedirectResponse(f"/lm/{code}{('?' + qs_lm) if qs_lm else ''}", status_code=302)

    # MAX-канал: direct + landing → SPA лендинг /click/{code}, который грузит
    # tag.js (set _ym_uid + capture ClientID), создаёт pending_conversion на
    # клик и затем редиректит в max.ru/{bot}?startapp=v_{visit_token}.
    # Это даёт точный per-click pixel attribution через bot DM-flow.
    qs = request.url.query
    qs_suffix = f"?{qs}" if qs else ""

    is_max_channel = (link.get("platform") or "").lower() == "max"
    if link_type in ("direct", "landing") and is_max_channel:
        target = f"/click/{code}{qs_suffix}"
        print(f"[track] {link_type} code={code} → SPA click landing: {target}")
        return RedirectResponse(url=target, status_code=302)

    # TG-канал landing или fallback — обычная /subscribe страница
    subscribe_url = f"{settings.APP_URL}/subscribe/{code}{qs_suffix}"
    return RedirectResponse(url=subscribe_url, status_code=302)


# ========================
# Error handlers
# ========================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": str(exc) or "Internal server error"},
    )


# ========================
# SEO meta-tag injection for public link pages
# ========================
_SPA_INDEX_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "frontend-react", "dist", "index.html"
)
try:
    with open(_SPA_INDEX_PATH, "r", encoding="utf-8") as _f:
        _SPA_INDEX_HTML = _f.read()
except Exception:
    _SPA_INDEX_HTML = None


def _inject_seo(html_str: str, *, title: str, description: str, url: str, image: str | None = None) -> str:
    """Replace meta tags in the SPA index.html with link-specific values.
    Safe: any failure returns original html."""
    try:
        title_e = _html.escape(title or "")
        desc_e = _html.escape(description or "")
        url_e = _html.escape(url or "")
        image_e = _html.escape(image or "https://max.pkmarketing.ru/og-cover.png")

        html_str = re.sub(r'<title>[^<]*</title>', f'<title>{title_e}</title>', html_str, count=1)
        html_str = re.sub(r'(<meta\s+name="description"\s+content=)"[^"]*"', rf'\1"{desc_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+property="og:title"\s+content=)"[^"]*"', rf'\1"{title_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+property="og:description"\s+content=)"[^"]*"', rf'\1"{desc_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+property="og:url"\s+content=)"[^"]*"', rf'\1"{url_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+property="og:image"\s+content=)"[^"]*"', rf'\1"{image_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+name="twitter:title"\s+content=)"[^"]*"', rf'\1"{title_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+name="twitter:description"\s+content=)"[^"]*"', rf'\1"{desc_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+name="twitter:image"\s+content=)"[^"]*"', rf'\1"{image_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+itemprop="name"\s+content=)"[^"]*"', rf'\1"{title_e}"', html_str, count=1)
        html_str = re.sub(r'(<meta\s+itemprop="description"\s+content=)"[^"]*"', rf'\1"{desc_e}"', html_str, count=1)
        return html_str
    except Exception:
        return html_str


def _default_spa_response() -> HTMLResponse | None:
    """Return raw SPA HTML (no injection) — used when link not found / paused."""
    if _SPA_INDEX_HTML is not None:
        return HTMLResponse(content=_SPA_INDEX_HTML)
    if os.path.isfile(_SPA_INDEX_PATH):
        try:
            with open(_SPA_INDEX_PATH, "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read())
        except Exception:
            return None
    return None


@app.get("/subscribe/{code}", include_in_schema=False)
async def serve_subscribe_seo(code: str):
    """Serve SPA index.html with channel-specific OG/Twitter/title meta tags."""
    default_resp = _default_spa_response()
    if _SPA_INDEX_HTML is None:
        # Fall through to catch-all behavior if template missing
        if default_resp is not None:
            return default_resp
        raise HTTPException(status_code=404, detail="SPA not built")

    try:
        link = await fetch_one(
            "SELECT tl.is_paused, c.title AS channel_title, c.avatar_url AS channel_avatar "
            "FROM tracking_links tl LEFT JOIN channels c ON c.id = tl.channel_id "
            "WHERE tl.short_code = $1",
            code,
        )
        if not link or (link.get("is_paused") and int(link.get("is_paused") or 0) == 1):
            return default_resp

        channel_title = (link.get("channel_title") or "").strip() or "Канал"
        title = f"{channel_title} — подписка через MAX Маркетинг"
        description = f"Подпишитесь на канал «{channel_title}» в национальном мессенджере MAX."
        url = f"https://max.pkmarketing.ru/subscribe/{code}"
        image = link.get("channel_avatar")

        return HTMLResponse(content=_inject_seo(
            _SPA_INDEX_HTML, title=title, description=description, url=url, image=image,
        ))
    except Exception:
        return default_resp


@app.get("/lm/{code}", include_in_schema=False)
async def serve_lm_seo(code: str):
    """Serve SPA index.html with lead-magnet-specific OG/Twitter/title meta tags."""
    default_resp = _default_spa_response()
    if _SPA_INDEX_HTML is None:
        if default_resp is not None:
            return default_resp
        raise HTTPException(status_code=404, detail="SPA not built")

    try:
        link = await fetch_one(
            "SELECT tl.is_paused, tl.lm_title, tl.lm_description, tl.lm_image_url, "
            "c.title AS channel_title, c.avatar_url AS channel_avatar "
            "FROM tracking_links tl LEFT JOIN channels c ON c.id = tl.channel_id "
            "WHERE tl.short_code = $1",
            code,
        )
        if not link or (link.get("is_paused") and int(link.get("is_paused") or 0) == 1):
            return default_resp

        channel_title = (link.get("channel_title") or "").strip() or "Канал"
        lm_title = (link.get("lm_title") or "").strip()
        lm_description = (link.get("lm_description") or "").strip()

        if lm_title:
            title = f"{lm_title} — {channel_title}"
        else:
            title = f"Бесплатный материал — {channel_title}"

        if lm_description:
            description = lm_description[:160]
        else:
            description = f"Получите бесплатный материал от канала «{channel_title}»."

        url = f"https://max.pkmarketing.ru/lm/{code}"
        image = link.get("lm_image_url") or link.get("channel_avatar")

        return HTMLResponse(content=_inject_seo(
            _SPA_INDEX_HTML, title=title, description=description, url=url, image=image,
        ))
    except Exception:
        return default_resp


# ========================
# SPA Catch-All (must be last!)
# ========================
async def _inject_blog_meta(html: str, full_path: str) -> str:
    """Для /blog/<slug> подставляем правильные SEO meta в index.html
    (Google/боты часто не ждут SPA-JS). Заголовок, description, OG-image,
    JSON-LD Article. Не трогаем разметку — только дописываем теги в head."""
    parts = full_path.strip("/").split("/")
    slug = None
    if len(parts) >= 2 and parts[0] == "blog" and parts[1] not in ("category", ""):
        slug = parts[1]
    elif len(parts) >= 3 and parts[0] == "blog" and parts[1] == "category":
        slug = None  # категория — отдельный обработчик ниже
    if not slug:
        return html
    art = await fetch_one(
        "SELECT slug, title, excerpt, meta_title, meta_description, cover_image_url, "
        "published_at, updated_at FROM blog_articles WHERE slug = $1 AND status = 'published'",
        slug,
    )
    if not art:
        return html
    app_url = settings.APP_URL.rstrip("/")
    title = (art.get("meta_title") or art.get("title") or "Блог").replace("<", "").replace(">", "")
    desc = (art.get("meta_description") or art.get("excerpt") or "")[:300].replace("<", "").replace(">", "")
    cover = art.get("cover_image_url") or ""
    if cover and cover.startswith("/"):
        cover = app_url + cover
    page_url = f"{app_url}/blog/{slug}"
    pub = art.get("published_at")
    upd = art.get("updated_at")
    pub_iso = pub.isoformat() if hasattr(pub, "isoformat") else ""
    upd_iso = upd.isoformat() if hasattr(upd, "isoformat") else ""
    json_ld = (
        '{"@context":"https://schema.org","@type":"Article",'
        f'"headline":{json.dumps(title, ensure_ascii=False)},'
        f'"description":{json.dumps(desc, ensure_ascii=False)},'
        f'"datePublished":"{pub_iso}","dateModified":"{upd_iso}",'
        f'"image":"{cover}","mainEntityOfPage":"{page_url}"'
        '}'
    )
    full_title = f"{title} — MAX Маркетинг"
    # Удаляем дефолтные мета-теги шаблона, чтобы боты/краулеры брали наши,
    # а не общие про сервис.
    html = re.sub(r'<title>[^<]*</title>', '', html, count=1)
    for attr in ('name="description"', 'name="keywords"',
                 'property="og:type"', 'property="og:title"',
                 'property="og:description"', 'property="og:url"',
                 'property="og:image"',
                 'name="twitter:title"', 'name="twitter:description"',
                 'name="twitter:image"',
                 'itemprop="name"', 'itemprop="description"', 'itemprop="url"'):
        html = re.sub(rf'<meta\s[^>]*{re.escape(attr)}[^>]*/?>\s*', '', html)
    inject = (
        f'<title>{full_title}</title>\n'
        f'<meta name="description" content="{desc}">\n'
        f'<link rel="canonical" href="{page_url}">\n'
        f'<meta property="og:type" content="article">\n'
        f'<meta property="og:title" content="{title}">\n'
        f'<meta property="og:description" content="{desc}">\n'
        f'<meta property="og:url" content="{page_url}">\n'
        f'<meta property="og:site_name" content="MAX Маркетинг">\n'
        + (f'<meta property="og:image" content="{cover}">\n' if cover else '')
        + f'<meta name="twitter:card" content="summary_large_image">\n'
        f'<meta name="twitter:title" content="{title}">\n'
        f'<meta name="twitter:description" content="{desc}">\n'
        + (f'<meta name="twitter:image" content="{cover}">\n' if cover else '')
        + f'<script type="application/ld+json">{json_ld}</script>\n'
    )
    if "</head>" in html:
        return html.replace("</head>", inject + "</head>", 1)
    return html


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve React SPA for all non-API routes."""
    # Backend paths: redirect to add trailing slash or return 404
    backend_prefixes = ("api", "uploads", "assets", "webhook", "health", "go")
    for prefix in backend_prefixes:
        if full_path == prefix or full_path.startswith(prefix + "/"):
            # Already has proper path structure but no matching route → 404
            if full_path.endswith("/"):
                raise HTTPException(status_code=404, detail="Not found")
            # Missing trailing slash → redirect so FastAPI router can match
            return RedirectResponse(url=f"/{full_path}/", status_code=307)

    spa_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend-react", "dist")
    index_path = os.path.join(spa_dir, "index.html")
    if os.path.isfile(index_path):
        with open(index_path, "r") as f:
            html = f.read()
        # Для статей блога добавляем SEO meta прямо в HTML
        if full_path.startswith("blog/"):
            try:
                html = await _inject_blog_meta(html, full_path)
            except Exception as e:
                print(f"[blog SEO inject] {e}")
        return HTMLResponse(content=html)

    raise HTTPException(status_code=404, detail="Not found")
