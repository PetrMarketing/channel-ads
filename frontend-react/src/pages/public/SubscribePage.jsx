import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import Loading from '../../components/Loading';
import { useTrackingPixels } from '../../hooks/useTrackingPixels';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

export default function SubscribePage() {
  const { shortCode } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState(null);
  const [visitId, setVisitId] = useState(null);
  const [clicked, setClicked] = useState(false);

  const loadInfo = useCallback(async () => {
    if (!shortCode) return;
    setLoading(true);
    try {
      const data = await api.get(`/track/info/${shortCode}`);
      if (data.success) {
        setInfo(data.link);
        try {
          const visitData = await api.post('/track/visit', {
            short_code: shortCode,
            ip_address: '',
            user_agent: navigator.userAgent,
          });
          if (visitData.success && visitData.visitId) {
            setVisitId(visitData.visitId);
          }
        } catch {}
      } else {
        setError(data.error || 'Ссылка не найдена');
      }
    } catch {
      setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [shortCode]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const { reachGoals, ymClientIdPromise, getYmClientIdSync } = useTrackingPixels(info);

  const handleChannelClick = useCallback(() => {
    setClicked(true);
    if (visitId) {
      const cid = getYmClientIdSync();
      if (cid) {
        api.post(`/track/visit/${visitId}/ym-client-id`, { ym_client_id: String(cid) })
          .catch(() => {});
      }
    }
    // Fire goal immediately on click — простая и надёжная механика.
    // Лучше дубли в Метрике чем тишина. Дедуп выключен сознательно.
    reachGoals();
  }, [visitId, getYmClientIdSync, reachGoals]);

  // Surface the YM ClientID to the backend so the server-side fallback fire
  // (services/conversion_pixels.fire_server_goals) can attribute properly.
  // Fire-and-forget — never block the UI on this.
  useEffect(() => {
    if (!visitId || !ymClientIdPromise) return;
    let cancelled = false;
    ymClientIdPromise.then((clientId) => {
      if (cancelled || !clientId) return;
      api.post(`/track/visit/${visitId}/ym-client-id`, { ym_client_id: String(clientId) })
        .catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [visitId, ymClientIdPromise]);

  // Polling — любая подписка в канале после открытия лендинга триггерит цель.
  // Стреляем без дедупа: Метрика сама дедуплицирует по ClientID, а нам важно
  // не пропустить событие. UI меняется на "Вы подписались!" после первого hit.
  useEffect(() => {
    if (!visitId) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.get(`/track/check-subscription-by-visit?visit_id=${visitId}`);
        if (data.subscribed) {
          if (!subscribed) setSubscribed(true);
          reachGoals();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [visitId, subscribed, reachGoals]);

  const getSubscribeUrl = () => {
    if (!info) return null;
    if (info.join_link) return info.join_link;
    const platform = info.platform;
    const channelUsername = info.channel_username || info.username;
    const maxChatId = info.max_chat_id;
    if (platform === 'max' && maxChatId) {
      return maxChatId.startsWith('http') ? maxChatId : `https://max.ru/chats/${maxChatId}`;
    }
    if (channelUsername) return `https://t.me/${channelUsername}`;
    return null;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: SOFT_BG }}>
      <Loading />
    </div>
  );

  if (error) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, textAlign: 'center', background: SOFT_BG,
    }}>
      <div>
        <h2 style={{ marginBottom: 10, color: DANGER, fontWeight: 800 }}>Ошибка</h2>
        <p style={{ color: MUTED }}>{error}</p>
      </div>
    </div>
  );

  const subscribeUrl = getSubscribeUrl();
  const platform = info?.platform || 'telegram';
  const platformLabel = platform === 'max' ? 'MAX' : 'Telegram';
  const waiting = clicked && !subscribed;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: SOFT_BG,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes spFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes spSpin { to { transform: rotate(360deg); } }
        @keyframes spDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes spPop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 20,
        padding: 36, maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(26,26,46,0.10)',
        animation: 'spFadeUp 0.4s ease both',
      }}>
        {subscribed ? (
          <div style={{ animation: 'spPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
            <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
              <div style={{
                position: 'absolute', inset: -10, borderRadius: '50%',
                background: `radial-gradient(circle, ${SUCCESS}30 0%, transparent 70%)`,
                animation: 'spPulse 2.4s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 12px 32px ${SUCCESS}40`,
              }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
            </div>
            <h2 style={{
              fontSize: '1.5rem', fontWeight: 800, color: DARK, margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>Вы подписались!</h2>
            <p style={{ fontSize: '0.95rem', color: MUTED, margin: 0, lineHeight: 1.5 }}>
              Спасибо за подписку на канал
            </p>
          </div>
        ) : waiting ? (
          <div>
            <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
              <div style={{
                position: 'absolute', inset: -10, borderRadius: '50%',
                background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
                animation: 'spPulse 2.4s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 12px 32px ${ACCENT}40`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#fff',
                  animation: 'spSpin 1s linear infinite',
                }} />
              </div>
            </div>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20,
              background: `${ACCENT}10`, color: ACCENT,
              fontSize: '0.72rem', fontWeight: 600, marginBottom: 12,
              letterSpacing: '0.01em',
            }}>
              <span style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: ACCENT,
                    animation: `spDot 1.2s ease-in-out ${i * 0.16}s infinite`,
                  }} />
                ))}
              </span>
              Ожидание подписки
            </div>

            <h2 style={{
              fontSize: '1.35rem', fontWeight: 800, color: DARK, margin: '0 0 10px',
              letterSpacing: '-0.02em',
            }}>Подпишитесь на канал</h2>
            <p style={{ fontSize: '0.9rem', color: MUTED, margin: '0 0 22px', lineHeight: 1.5 }}>
              Откройте канал и нажмите «Подписаться» —<br />
              статус обновится автоматически
            </p>

            <div style={{
              padding: 16, borderRadius: 14,
              background: SOFT_BG, border: `1px solid ${BORDER}`,
              marginBottom: 16,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: '0.85rem', color: DARK,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  color: '#fff', fontWeight: 800, fontSize: '0.9rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  letterSpacing: '-0.02em',
                }}>{platform === 'max' ? 'M' : 'T'}</div>
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: DARK, letterSpacing: '-0.005em' }}>
                    {info?.channel_title || 'Канал'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>
                    {platformLabel} · ожидаем подписку
                  </div>
                </div>
              </div>
            </div>

            {subscribeUrl && (
              <a
                href={subscribeUrl}
                target="_blank"
                rel="noreferrer"
                onClick={handleChannelClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 12, textDecoration: 'none',
                  background: '#fff', border: `1px solid ${BORDER}`,
                  color: DARK, fontSize: '0.85rem', fontWeight: 600,
                  transition: 'all .15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = DARK; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7" /><path d="M7 7h10v10" />
                </svg>
                Открыть канал ещё раз
              </a>
            )}
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
              <div style={{
                position: 'absolute', inset: -10, borderRadius: '50%',
                background: `radial-gradient(circle, ${ACCENT}25 0%, transparent 70%)`,
                animation: 'spPulse 3s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 12px 32px ${ACCENT}40`,
                color: '#fff', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em',
              }}>
                {platform === 'max' ? 'M' : 'T'}
              </div>
            </div>

            <h2 style={{
              fontSize: '1.5rem', fontWeight: 800, color: DARK, margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}>{info?.channel_title || 'Канал'}</h2>
            {info?.channel_description && (
              <p style={{ fontSize: '0.9rem', color: MUTED, margin: '0 0 22px', lineHeight: 1.5 }}>
                {info.channel_description}
              </p>
            )}

            {subscribeUrl ? (
              <>
                <a
                  href={subscribeUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleChannelClick}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '14px 28px', borderRadius: 14, textDecoration: 'none',
                    background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                    color: '#fff', fontSize: '1rem', fontWeight: 700,
                    boxShadow: `0 8px 24px ${ACCENT}40`,
                    letterSpacing: '-0.01em',
                    transition: 'transform .15s ease, box-shadow .15s ease',
                    marginBottom: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${ACCENT}55`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 8px 24px ${ACCENT}40`; }}
                >
                  Перейти в канал
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
                <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  Подпишитесь и оставайтесь на этой странице —<br />
                  статус обновится автоматически
                </p>
              </>
            ) : (
              <p style={{ fontSize: '0.92rem', color: MUTED, margin: 0 }}>
                Подпишитесь на канал
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
