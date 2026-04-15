import os
import json
import base64
from contextlib import asynccontextmanager
from datetime import datetime, date

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse


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
    metrics, shop,
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
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Mount React SPA frontend (built by Vite)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend-react", "dist")
if os.path.isdir(frontend_dist):
    from fastapi.responses import FileResponse

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

# ========================
# API Routes — Public
# ========================
app.include_router(tracking.router, prefix="/api/track", tags=["tracking"])
app.include_router(max_webhook.router, prefix="/webhook/max", tags=["max-webhook"])
app.include_router(billing.public_router, prefix="/api/billing/public", tags=["billing-public"])
app.include_router(billing.staff_invite_router, prefix="/api/staff", tags=["staff-invites"])
app.include_router(services.public_router, prefix="/api/services/public", tags=["services-public"])
app.include_router(shop.public_router, prefix="/api/shop/public", tags=["shop-public"])
app.include_router(comments.public_router, prefix="/api/comments/public", tags=["comments-public"])
app.include_router(paid_chat_payments.router, prefix="/api/paid-chat-pay", tags=["paid-chat-pay"])


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
      document.querySelector('p').textContent = 'Загрузка...';
      return false;
    }

    // Handle comments_ prefix
    if (startParam.startsWith('comments_')) {
      window.location.href = '/comments-app/' + startParam;
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
    document.querySelector('p').textContent = 'Не удалось загрузить. Попробуйте ещё раз.';
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
    html = html.replace('__META_REFRESH__', meta_refresh).replace('__SERVER_CODE__', code)
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
    // Debug: log what bridge provides
    if (wa) console.log('[Shop] WebApp:', wa.platform, 'initData:', !!wa.initData, 'user:', JSON.stringify(wa.initDataUnsafe?.user || null));
  }} catch(e) {{ console.log('[Shop] resolveUid error:', e); }}
  if (!uid) {{ uid = localStorage.getItem('shop_uid'); if (!uid) {{ uid = 'anon_' + Math.random().toString(36).slice(2,10); localStorage.setItem('shop_uid', uid); }} }}
}}

var S = {{
  screen: 'home', cat: null, prodId: null, product: null,
  categories: [], products: [], cartItems: [], appearance: {{}}, deliveryMethods: [],
  filterCat: null, variant: null, qty: 1,
  promo: '', discount: 0, promoApplied: false,
  orderNum: '', dmId: null, userName: ''
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

function headerHtml(title, back) {{
  return `<div class="header" style="background:${{pc()}}">
    ${{back ? '<button class="back" onclick="goBack()">&#8592;</button>' : '<div style="width:28px"></div>'}}
    <h1>${{title}}</h1>
    <button class="cart-icon" onclick="go(\'cart\')">
      &#128722;${{cartCount() ? '<span class="cart-badge">' + cartCount() + '</span>' : ''}}
    </button>
  </div>`;
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
  var _banners = (S.appearance.banners && S.appearance.banners.length) ? S.appearance.banners : (S.appearance.banner_url ? [S.appearance.banner_url] : []);
  if (_banners.length === 1) {{
    h += '<img class="banner" src="' + _banners[0] + '">';
  }} else if (_banners.length > 1) {{
    h += '<div class="banner-slider" style="position:relative;overflow:hidden">';
    h += '<img class="banner" id="bannerImg" src="' + _banners[0] + '">';
    h += '<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;gap:4px">';
    _banners.forEach(function(_, i) {{ h += '<div class="bdot" data-i="' + i + '" style="width:' + (i===0?16:6) + 'px;height:6px;border-radius:3px;background:' + (i===0?'#fff':'rgba(255,255,255,0.5)') + ';cursor:pointer;transition:all .2s"></div>'; }});
    h += '</div></div>';
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
  if (p.variants?.length > 1) {{
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
    h += `<div class="cart-item"><img src="${{img(i.image_url || i.product_image_url)}}"><div class="ci-info"><div class="ciname">${{i.product_name || i.name}}</div>`;
    if (i.variant_name) h += `<div class="civar">${{i.variant_name}}</div>`;
    h += `<div class="ciprice">${{fmt(i.price)}} × ${{i.quantity}}</div>`;
    h += `<button class="ci-remove" onclick="removeItem(${{i.id}})">Удалить</button></div></div>`;
  }});
  const sub = S.cartItems.reduce((s,i)=>s+(parseFloat(i.price)||0)*i.quantity, 0);
  h += `<div class="promo-row"><input id="promo" placeholder="Промокод" value="${{S.promo}}" onchange="S.promo=this.value"><button onclick="applyPromo()">Применить</button></div>`;
  h += `<div class="totals"><div class="row"><span>Подытог</span><span>${{fmt(sub)}}</span></div>`;
  if (S.discount) h += `<div class="row"><span>Скидка</span><span>-${{fmt(S.discount)}}</span></div>`;
  h += `<div class="row total"><span>Итого</span><span>${{fmt(Math.max(0, sub - S.discount))}}</span></div></div>`;
  h += `<button class="btn" style="background:${{pc()}}" onclick="goCheckout()">Оформить</button></div>`;
  app.innerHTML = h;
}}

async function goCheckout() {{ await loadDM(); S.screen = 'checkout'; render(); window.scrollTo(0,0); }}

function renderCheckout() {{
  let h = headerHtml('Оформление', true);
  h += `<div class="section">`;
  h += '<label class="form-label">Имя</label><input class="form-input" id="cname" placeholder="Ваше имя" value="' + (S.userName || '') + '">';
  h += '<label class="form-label">Телефон</label><div style="display:flex;gap:8px"><input class="form-input" id="cphone" type="tel" placeholder="+7..." style="flex:1;margin:0">';
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
  }} catch(e) {{ alert('Ошибка: ' + e.message); if(btn){{ btn.disabled=false; btn.textContent='Оплатить'; }} }}
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
function startBannerSlider(){{var b=(S.appearance.banners&&S.appearance.banners.length)?S.appearance.banners:(S.appearance.banner_url?[S.appearance.banner_url]:[]);if(b.length<=1)return;clearInterval(_bTimer);function upd(){{var img=document.getElementById('bannerImg');if(img)img.src=b[_bIdx];document.querySelectorAll('.bdot').forEach(function(d){{var i=parseInt(d.dataset.i);d.style.width=(i===_bIdx?'16px':'6px');d.style.background=(i===_bIdx?'#fff':'rgba(255,255,255,0.5)');}});}}
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
        return RedirectResponse(f"/lm/{code}", status_code=302)

    # Also record a visit for direct links (no landing page to do it)
    if link_type == "direct":
        await execute_returning_id(
            """INSERT INTO visits (tracking_link_id, channel_id, ip_address, user_agent,
                utm_source, utm_medium, utm_campaign, utm_content, utm_term, platform)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
            link["id"], link["channel_id"], ip, ua,
            link.get("utm_source"), link.get("utm_medium"), link.get("utm_campaign"),
            link.get("utm_content"), link.get("utm_term"), link.get("platform", "telegram"),
        )
        # Redirect directly to channel
        platform = link.get("platform", "telegram")
        channel_username = link.get("channel_username")
        max_chat_id = link.get("max_chat_id")
        join_link = link.get("join_link")
        # Auto-fetch invite link if missing
        if not join_link:
            try:
                from app.routes.channels import _fetch_invite_link_for_channel
                ch_row = await fetch_one("SELECT * FROM channels WHERE id = $1", link["channel_id"])
                if ch_row:
                    fetched = await _fetch_invite_link_for_channel(ch_row)
                    if fetched:
                        join_link = fetched
                        await execute("UPDATE channels SET join_link = $1 WHERE id = $2", fetched, link["channel_id"])
                        print(f"[direct-link] Auto-fetched invite link: {fetched}")
            except Exception as e:
                print(f"[direct-link] Auto-fetch invite link failed: {e}")

        print(f"[direct-link] code={code} platform={platform} username={channel_username} max_chat_id={max_chat_id} join_link={join_link}")
        if join_link:
            # Prefer explicit join link (works for both Telegram and MAX)
            channel_url = join_link
        elif platform == "max" and max_chat_id:
            if max_chat_id.startswith("http"):
                channel_url = max_chat_id
            else:
                channel_url = f"https://max.ru/chats/{max_chat_id}"
        elif platform == "max" and channel_username:
            channel_url = f"https://max.ru/chats/{channel_username}"
        elif channel_username:
            channel_url = f"https://t.me/{channel_username}"
        else:
            print(f"[direct-link] No channel URL available for code={code}, falling back to landing")
            channel_url = f"{settings.APP_URL}/subscribe/{code}"
        print(f"[direct-link] Redirecting to: {channel_url}")

        # For MAX links opened in MAX internal browser — use instant JS redirect
        # This ensures max.ru links are handled natively by the MAX app
        if "max.ru" in channel_url:
            return HTMLResponse(f"""<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url={channel_url}">
<style>body{{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#f5f5f5}}
.c{{text-align:center;padding:20px}}.s{{width:32px;height:32px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:s .8s linear infinite;margin:0 auto 16px}}
@keyframes s{{to{{transform:rotate(360deg)}}}}</style>
</head><body><div class="c"><div class="s"></div><p>Переход в канал...</p></div>
<script>window.location.replace("{channel_url}");</script></body></html>""")

        return RedirectResponse(url=channel_url, status_code=302)

    # Landing type: redirect to subscribe page
    subscribe_url = f"{settings.APP_URL}/subscribe/{code}"
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
# SPA Catch-All (must be last!)
# ========================
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
            return HTMLResponse(content=f.read())

    raise HTTPException(status_code=404, detail="Not found")
