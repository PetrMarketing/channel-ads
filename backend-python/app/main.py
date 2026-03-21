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
    admin, paid_chats, paid_chat_payments,
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
app.include_router(telegram_bot.router, prefix="/api/telegram", tags=["telegram-bot"])

# ========================
# API Routes — Public
# ========================
app.include_router(tracking.router, prefix="/api/track", tags=["tracking"])
app.include_router(max_webhook.router, prefix="/webhook/max", tags=["max-webhook"])
app.include_router(billing.public_router, prefix="/api/billing/public", tags=["billing-public"])
app.include_router(billing.staff_invite_router, prefix="/api/staff", tags=["staff-invites"])
app.include_router(paid_chat_payments.router, prefix="/api/paid-chat-pay", tags=["paid-chat-pay"])


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
            url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
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
    clean_code = code.replace("go_", "") if code.startswith("go_") else code
    # Meta refresh fallback: if JS fails completely, redirect via /go/ after 6 seconds
    meta_refresh = f'<meta http-equiv="refresh" content="6;url=/go/{clean_code}">' if clean_code else ''
    html = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
__META_REFRESH__
<script src="https://st.max.ru/js/max-web-app.js"></script>
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

    # Also record a visit for direct links (no landing page to do it)
    link_type = link.get("link_type", "landing")
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
            from fastapi.responses import HTMLResponse
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
