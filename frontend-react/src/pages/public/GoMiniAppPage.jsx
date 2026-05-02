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
 * which opens the configured Mini App with start_param=go_X. Different
 * runtimes expose this differently — try them all and use whichever works.
 */
function readStartParam() {
  try {
    // 1. MAX SDK (window.maxApp.initData / window.MaxApp)
    const maxApp = (typeof window !== 'undefined') && (window.maxApp || window.MaxApp);
    const maxInit = maxApp?.initDataUnsafe || maxApp?.initData;
    if (maxInit && typeof maxInit === 'object') {
      if (maxInit.start_param) return String(maxInit.start_param);
      if (maxInit.startParam) return String(maxInit.startParam);
    }
    // 2. Telegram-WebApp shim (some clients reuse the API)
    const tg = (typeof window !== 'undefined') && window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.start_param) return String(tg.initDataUnsafe.start_param);

    // 3. URL hash (#tgWebAppStartParam=go_X / #startapp=go_X)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace(/^#/, '');
      const hp = new URLSearchParams(hash);
      const v = hp.get('tgWebAppStartParam') || hp.get('startapp') || hp.get('start_param');
      if (v) return v;
    }
    // 4. Query string (?startapp=go_X)
    if (typeof window !== 'undefined') {
      const qp = new URLSearchParams(window.location.search);
      const v = qp.get('startapp') || qp.get('start_param') || qp.get('start');
      if (v) return v;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Try to extract MAX user_id from any available SDK init_data. */
function readMaxUserId() {
  try {
    const maxApp = (typeof window !== 'undefined') && (window.maxApp || window.MaxApp);
    const init = maxApp?.initDataUnsafe || maxApp?.initData;
    if (init?.user?.id) return String(init.user.id);
    if (init?.user_id) return String(init.user_id);
  } catch {}
  return null;
}

function readRawInitData() {
  try {
    const maxApp = (typeof window !== 'undefined') && (window.maxApp || window.MaxApp);
    const raw = maxApp?.initData;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      try { return JSON.stringify(raw); } catch { return null; }
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

  // Resolve short code from start_param on mount.
  useEffect(() => {
    const sp = readStartParam();
    if (!sp) {
      setError('Не удалось определить ссылку. Откройте через MAX.');
      setLoading(false);
      return;
    }
    // start_param looks like "go_<shortCode>" — strip the prefix.
    const code = sp.startsWith('go_') ? sp.slice(3) : sp;
    setShortCode(code);
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
    try {
      const maxApp = window.MaxApp || window.maxApp;
      if (maxApp && typeof maxApp.openLink === 'function') {
        maxApp.openLink(url);
        return;
      }
      if (maxApp && typeof maxApp.openTelegramLink === 'function') {
        maxApp.openTelegramLink(url);
        return;
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
              {/* Channel avatar */}
              <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 20px' }}>
                <div style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`,
                  animation: 'gmPulse 3s ease-in-out infinite',
                }} />
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={channelTitle}
                    style={{
                      position: 'relative', width: 96, height: 96, borderRadius: '50%',
                      objectFit: 'cover', boxShadow: `0 12px 32px ${ACCENT}30`,
                      border: '3px solid #fff',
                    }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    position: 'relative', width: 96, height: 96, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '2.5rem', fontWeight: 800,
                    letterSpacing: '-0.04em',
                    boxShadow: `0 12px 32px ${ACCENT}40`,
                    border: '3px solid #fff',
                  }}>
                    {channelTitle.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Platform pill */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20,
                background: `${ACCENT}10`, color: ACCENT,
                fontSize: '0.72rem', fontWeight: 700, marginBottom: 14,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: ACCENT,
                  boxShadow: `0 0 8px ${ACCENT}`,
                }} />
                {platformLabel}
              </div>

              {/* Title */}
              <h2 style={{
                fontSize: '1.5rem', fontWeight: 800, color: DARK, margin: '0 0 10px',
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>{channelTitle}</h2>

              <p style={{
                fontSize: '0.92rem', color: MUTED, margin: '0 0 24px',
                lineHeight: 1.5,
              }}>
                Откройте канал и подпишитесь —<br />мы зафиксируем ваш переход
              </p>

              {/* CTA */}
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
                {clicked ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Открываем канал…
                  </>
                ) : (
                  <>
                    Перейти в канал
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>

              <p style={{
                fontSize: '0.78rem', color: MUTED, margin: '16px 0 0',
                lineHeight: 1.5,
              }}>
                Безопасный переход через мини-приложение MAX
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
