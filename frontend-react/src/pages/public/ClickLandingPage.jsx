import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import Loading from '../../components/Loading';
import { useTrackingPixels } from '../../hooks/useTrackingPixels';

/**
 * MAX channel "click landing" — the SPA page served at /click/{shortCode}.
 *
 * Replaces the old straight-to-bot redirect for MAX direct/landing links.
 * The browser-side detour is necessary so we can:
 *   1. Load Yandex Metrika tag.js (sets _ym_uid cookie + captures ClientID).
 *   2. POST /track/visit/{visit_id}/await-subscription with the captured cid
 *      → creates a pending_conversions row (60s window).
 *   3. Redirect into max.ru/{bot}?startapp=v_{visit_token}, which triggers
 *      the existing _handle_visit_link bot DM-flow → user taps "Перейти в
 *      канал" → subscribes → bot's chat_member event atomically claims the
 *      pending and fires YM/VK pixels (server-side, with full per-pixel
 *      response code + error captured on the pending_conversions row).
 *
 * Only minimal UI: avatar circle + channel title + big gradient button.
 */
const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const MAX_BOT_USERNAME =
  import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';

export default function ClickLandingPage() {
  const { shortCode } = useParams();
  const [info, setInfo] = useState(null);
  const [visitId, setVisitId] = useState(null);
  const [visitToken, setVisitToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false); // button click in flight
  const navigatingRef = useRef(false);

  const loadInfo = useCallback(async () => {
    if (!shortCode) return;
    setLoading(true);
    try {
      const data = await api.get(`/track/info/${shortCode}`);
      if (!data?.success || !data.link) {
        setError(data?.error || 'Ссылка не найдена');
        return;
      }
      setInfo(data.link);
      try {
        const visitData = await api.post('/track/visit', {
          short_code: shortCode,
          ip_address: '',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        });
        if (visitData?.success && visitData.visitId) {
          setVisitId(visitData.visitId);
          setVisitToken(visitData.visitToken || null);
        }
      } catch {
        // Non-fatal: button still works (fallback channel-only redirect).
      }
    } catch {
      setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [shortCode]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // Mounts YM tag.js (and VK code.js if configured), generates pk_cid in
  // cookie, fires init beacon via /_ymp proxy. We ALSO call reachGoals at
  // click time — server-side fire from our datacenter IP gets filtered by
  // YM, but the click-time fire goes through the user's browser via the
  // proxy (real user IP) and counts reliably. Tradeoff: ~5-15% overcount
  // since some users click but never finish subscribing.
  const { reachGoals, ymClientIdPromise, getYmClientIdSync } = useTrackingPixels(info);

  const buildBotUrl = useCallback(() => {
    // ВСЕГДА используем go_ префикс — Mini App URL бота указывает на
    // /miniapp HTML-handler, который понимает только go_X (не v_TOKEN).
    // Атрибуция конверсии сохраняется через pending_conversions: при клике
    // мы создали pending с ym_client_id, бот при подписке найдёт его по
    // channel_id и стрельнёт цель с правильным cid.
    return `https://max.ru/${MAX_BOT_USERNAME}?startapp=go_${shortCode}`;
  }, [shortCode]);

  const handleClick = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setPending(true);

    const targetUrl = buildBotUrl();

    // Capture YM ClientID synchronously if tag.js already finished loading;
    // also race against the async promise (resolves once getClientID callback
    // fires) with a short deadline so we never block UI > ~1.5s.
    let cid = getYmClientIdSync();
    if (!cid && ymClientIdPromise) {
      try {
        cid = await Promise.race([
          ymClientIdPromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
      } catch {}
    }

    if (visitId) {
      try {
        await api.post(`/track/visit/${visitId}/await-subscription`, {
          ym_client_id: cid ? String(cid) : null,
          page_url: typeof window !== 'undefined' ? window.location.href : '',
        });
      } catch {
        // Non-fatal: even if pending creation fails, we still redirect.
      }
    }

    // Fire YM/VK goals from the user's browser via /_ymp proxy. Image-beacon
    // GETs use the user's IP, so the goal attaches to the same session as
    // the visit hit — guaranteed to count in YM reports. Server-side fire
    // after subscription stays as a backup (idempotent via cid dedupe).
    try { reachGoals(); } catch {}

    // Hard navigate (assign, not href, to preserve back-button history).
    if (typeof window !== 'undefined') {
      window.location.assign(targetUrl);
    }
  }, [visitId, ymClientIdPromise, getYmClientIdSync, buildBotUrl, reachGoals]);

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: SOFT_BG,
    }}>
      <Loading />
    </div>
  );

  if (error) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, textAlign: 'center', background: SOFT_BG,
    }}>
      <div>
        <h2 style={{ marginBottom: 10, color: DANGER, fontWeight: 800 }}>Ошибка</h2>
        <p style={{ color: MUTED }}>{error}</p>
      </div>
    </div>
  );

  const channelTitle = info?.channel_title || 'Канал';
  const avatarUrl = info?.channel_avatar_url || info?.avatar_url || null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: SOFT_BG,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes clFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes clPulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes clSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 20,
        padding: 36, maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(26,26,46,0.10)',
        animation: 'clFadeUp 0.4s ease both',
      }}>
        <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
          <div style={{
            position: 'absolute', inset: -10, borderRadius: '50%',
            background: `radial-gradient(circle, ${ACCENT}25 0%, transparent 70%)`,
            animation: 'clPulse 3s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: avatarUrl ? '#fff' : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 12px 32px ${ACCENT}40`,
            color: '#fff', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em',
            overflow: 'hidden',
          }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={channelTitle}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
              />
            ) : (
              'M'
            )}
          </div>
        </div>

        <h2 style={{
          fontSize: '1.5rem', fontWeight: 800, color: DARK, margin: '0 0 8px',
          letterSpacing: '-0.02em',
        }}>{channelTitle}</h2>
        <p style={{ fontSize: '0.9rem', color: MUTED, margin: '0 0 22px', lineHeight: 1.5 }}>
          Откройте канал в мессенджере MAX и подпишитесь
        </p>

        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 28px', borderRadius: 14, border: 'none', cursor: pending ? 'wait' : 'pointer',
            background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
            color: '#fff', fontSize: '1rem', fontWeight: 700,
            boxShadow: `0 8px 24px ${ACCENT}40`,
            letterSpacing: '-0.01em',
            transition: 'transform .15s ease, box-shadow .15s ease',
            opacity: pending ? 0.85 : 1,
          }}
          onMouseEnter={e => {
            if (pending) return;
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = `0 12px 32px ${ACCENT}55`;
          }}
          onMouseLeave={e => {
            if (pending) return;
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = `0 8px 24px ${ACCENT}40`;
          }}
        >
          {pending ? (
            <>
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', animation: 'clSpin 0.7s linear infinite',
                display: 'inline-block',
              }} />
              Открываем MAX…
            </>
          ) : (
            <>
              Перейти в канал
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
