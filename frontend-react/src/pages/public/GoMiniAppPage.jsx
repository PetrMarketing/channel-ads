import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

/**
 * Parse the start_param from MAX SDK init_data, URL hash or query string.
 * The MAX/Telegram-style miniapp URL is:
 *   https://max.ru/{bot}?startapp=go_X
 * which opens the configured Mini App with start_param=go_X. The actual MAX
 * bridge (https://st.max.ru/js/max-web-app.js) lives at `window.WebApp` —
 * but we try every plausible global so SDK upgrades don't break us.
 */
function readStartParam() {
  if (typeof window === 'undefined') return null;
  try {
    const sdks = [
      window.WebApp, window.webapp,
      window.maxApp, window.MaxApp, window.maxsdk, window.MaxSDK,
      window.MaxJsSdk, window.maxJsSdk, window.MAX, window.max,
      window.Telegram?.WebApp,
    ];
    for (const sdk of sdks) {
      if (!sdk) continue;
      const inits = [
        sdk.initDataUnsafe, sdk.initData, sdk.launchParams,
        sdk.startParams, sdk.initParams,
      ];
      for (const init of inits) {
        if (!init || typeof init !== 'object') continue;
        const v = init.start_param || init.startParam || init.startapp
          || init.tgWebAppStartParam || init.payload;
        if (v) return String(v);
      }
      if (sdk.startParam) return String(sdk.startParam);
      if (sdk.start_param) return String(sdk.start_param);
    }
  } catch {}
  // URL hash (#tgWebAppStartParam=go_X / #startapp=go_X)
  try {
    if (window.location.hash) {
      const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const v = hp.get('tgWebAppStartParam') || hp.get('startapp')
        || hp.get('start_param') || hp.get('WebAppStartParam');
      if (v) return v;
    }
  } catch {}
  // Query string (?startapp=go_X / ?WebAppStartParam=go_X)
  try {
    const qp = new URLSearchParams(window.location.search);
    const v = qp.get('startapp') || qp.get('start_param') || qp.get('start')
      || qp.get('WebAppStartParam') || qp.get('tgWebAppStartParam');
    if (v) return v;
  } catch {}
  return null;
}

/** Try to extract MAX user_id from any available SDK init_data. */
function readMaxUserId() {
  if (typeof window === 'undefined') return null;
  try {
    const sdks = [
      window.WebApp, window.webapp,
      window.maxApp, window.MaxApp,
      window.Telegram?.WebApp,
    ];
    for (const sdk of sdks) {
      if (!sdk) continue;
      const init = sdk.initDataUnsafe || sdk.initData || sdk.launchParams;
      if (!init || typeof init !== 'object') continue;
      const u = init.user;
      if (u?.user_id) return String(u.user_id);
      if (u?.id) return String(u.id);
      if (init.user_id) return String(init.user_id);
    }
  } catch {}
  return null;
}

function readRawInitData() {
  if (typeof window === 'undefined') return null;
  try {
    const sdks = [window.WebApp, window.maxApp, window.MaxApp];
    for (const sdk of sdks) {
      if (!sdk) continue;
      const raw = sdk.initData;
      if (typeof raw === 'string') return raw;
      if (raw && typeof raw === 'object') {
        try { return JSON.stringify(raw); } catch {}
      }
      const u = sdk.initDataUnsafe;
      if (u) {
        try { return JSON.stringify(u); } catch {}
      }
    }
  } catch {}
  return null;
}

/** Read Yandex.Metrika ClientID synchronously from cookie if present. */
function readYmClientIdSync() {
  try {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {}
  return null;
}

export default function GoMiniAppPage() {
  const [info, setInfo] = useState(null);
  const [shortCode, setShortCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clicked, setClicked] = useState(false);
  const visitedRef = useRef(false);

  // Resolve short code from start_param on mount. App.jsx already waits for
  // SDK ready before rendering us, but listen for `max-sdk-ready` anyway in
  // case start_param was found via URL fallback before SDK loaded init data.
  useEffect(() => {
    function tryRead() {
      const sp = readStartParam();
      if (!sp) return false;
      const code = sp.startsWith('go_') ? sp.slice(3) : sp;
      setShortCode(code);
      return true;
    }
    if (tryRead()) return;
    let attempts = 0;
    const handle = setInterval(() => {
      attempts += 1;
      if (tryRead() || attempts >= 20) {
        clearInterval(handle);
        if (attempts >= 20 && !shortCode) {
          setError('Не удалось определить ссылку. Откройте через MAX.');
          setLoading(false);
        }
      }
    }, 200);
    const onReady = () => tryRead();
    window.addEventListener('max-sdk-ready', onReady);
    return () => {
      clearInterval(handle);
      window.removeEventListener('max-sdk-ready', onReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create the visit (and fetch channel info) once the code is known.
  useEffect(() => {
    if (!shortCode || visitedRef.current) return;
    visitedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const payload = {
          code: shortCode,
          max_user_id: readMaxUserId(),
          init_data: readRawInitData(),
          ym_client_id: readYmClientIdSync(),
          page_url: typeof window !== 'undefined' ? window.location.href : '',
        };
        const data = await api.post('/track/miniapp-visit', payload);
        if (cancelled) return;
        if (data.success && data.channel_url) {
          setInfo(data);
        } else {
          setError(data.error || 'Канал недоступен');
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить канал');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shortCode]);

  const openChannel = useCallback(() => {
    if (!info?.channel_url || clicked) return;
    setClicked(true);
    // Fire pending_conversion before navigating away — gives the server a
    // 60s window to attribute the resulting subscription back to this visit.
    if (info.visit_id) {
      try {
        api.post(`/track/visit/${info.visit_id}/await-subscription`, {
          ym_client_id: readYmClientIdSync(),
          page_url: typeof window !== 'undefined' ? window.location.href : '',
        }).catch(() => {});
      } catch {}
    }
    const url = info.channel_url;
    // Prefer MAX SDK deep-linking when available — keeps user inside the app.
    // window.WebApp is the real MAX bridge (st.max.ru/js/max-web-app.js).
    // openMaxLink() is the right call for max.ru links; openLink() for others.
    try {
      const wa = window.WebApp || window.MaxApp || window.maxApp;
      if (wa) {
        const isMaxUrl = /(?:^|\/\/)max\.ru\b/i.test(url);
        if (isMaxUrl && typeof wa.openMaxLink === 'function') {
          wa.openMaxLink(url);
          // Auto-close miniapp shortly after — gives MAX time to process the
          // openMaxLink before the webview is torn down.
          setTimeout(() => { try { wa.close && wa.close(); } catch {} }, 800);
          return;
        }
        if (typeof wa.openLink === 'function') {
          wa.openLink(url);
          setTimeout(() => { try { wa.close && wa.close(); } catch {} }, 800);
          return;
        }
        if (typeof wa.openTelegramLink === 'function') {
          wa.openTelegramLink(url);
          return;
        }
      }
    } catch {}
    // Fallback — straight navigation. Use replace so back-button doesn't
    // bounce the user into the visit again.
    try { window.location.replace(url); } catch { window.location.href = url; }
  }, [info, clicked]);

  const platform = info?.platform || 'max';
  const platformLabel = platform === 'max' ? 'MAX' : 'Telegram';
  const channelTitle = info?.channel_title || 'Канал';
  const avatarUrl = info?.channel_avatar_url || null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: SOFT_BG,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes gmFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gmPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes gmSpin { to { transform: rotate(360deg); } }
        @keyframes gmFloat { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(10px,-8px); } }
      `}</style>

      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 22,
        padding: 36, maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(26,26,46,0.10)',
        animation: 'gmFadeUp 0.4s ease both',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative gradient blobs */}
        <div aria-hidden style={{
          position: 'absolute', top: -60, right: -40, width: 160, height: 160, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT2}22 0%, transparent 70%)`,
          animation: 'gmFloat 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -80, left: -30, width: 180, height: 180, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}1c 0%, transparent 70%)`,
          animation: 'gmFloat 10s ease-in-out -3s infinite',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          {loading ? (
            <div style={{ padding: '40px 0' }}>
              <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
                <div style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  background: `radial-gradient(circle, ${ACCENT}25 0%, transparent 70%)`,
                  animation: 'gmPulse 2.4s ease-in-out infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 12px 32px ${ACCENT}40`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff',
                    animation: 'gmSpin 1s linear infinite',
                  }} />
                </div>
              </div>
              <p style={{ color: MUTED, fontSize: '0.95rem', margin: 0 }}>Загружаем канал…</p>
            </div>
          ) : error ? (
            <div style={{ padding: '12px 0' }}>
              <h2 style={{ color: DANGER, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Ошибка
              </h2>
              <p style={{ color: MUTED, margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          ) : (
            <>
              <h2 style={{
                fontSize: '1.5rem', fontWeight: 800, color: DARK,
                margin: '8px 0 24px', letterSpacing: '-0.02em', lineHeight: 1.25,
              }}>{channelTitle}</h2>

              <button
                type="button"
                onClick={openChannel}
                disabled={clicked}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', padding: '15px 28px', borderRadius: 14,
                  border: 'none', cursor: clicked ? 'default' : 'pointer',
                  background: clicked
                    ? `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`
                    : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  color: '#fff', fontSize: '1rem', fontWeight: 700,
                  boxShadow: clicked
                    ? `0 8px 24px ${SUCCESS}40`
                    : `0 8px 24px ${ACCENT}40`,
                  letterSpacing: '-0.01em',
                  transition: 'transform .15s ease, box-shadow .15s ease',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  if (clicked) return;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = `0 12px 32px ${ACCENT}55`;
                }}
                onMouseLeave={e => {
                  if (clicked) return;
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = `0 8px 24px ${ACCENT}40`;
                }}
              >
                {clicked ? 'Открываем канал…' : 'Подписаться на канал'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
