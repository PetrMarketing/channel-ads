import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import Loading from '../../components/Loading';

export default function LeadMagnetLandingPage() {
  const { shortCode } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState(null);
  const [visitId, setVisitId] = useState(null);
  const goalFired = useRef(false);

  const loadInfo = useCallback(async () => {
    if (!shortCode) return;
    setLoading(true);
    try {
      const data = await api.get(`/track/info/${shortCode}`);
      if (data.success) {
        setInfo(data.link);
        try {
          const visitData = await api.post('/track/visit', {
            short_code: shortCode, ip_address: '', user_agent: navigator.userAgent,
          });
          if (visitData.success && visitData.visitId) setVisitId(visitData.visitId);
        } catch {}
      } else {
        setError(data.error || 'Ссылка не найдена');
      }
    } catch { setError('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [shortCode]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // Inject Yandex Metrika
  useEffect(() => {
    if (!info) return;
    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    if (!counterId) return;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    window.ym(Number(counterId), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    const script = document.createElement('script');
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [info]);

  // Inject VK Pixel
  useEffect(() => {
    if (!info) return;
    const pixelId = info.vk_pixel_id;
    if (!pixelId) return;
    window._tmr = window._tmr || [];
    window._tmr.push({ id: pixelId, type: 'pageView', start: Date.now() });
    const script = document.createElement('script');
    script.src = 'https://top-fwz1.mail.ru/js/code.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [info]);

  // Poll for subscription
  useEffect(() => {
    if (!visitId || subscribed) return;
    const interval = setInterval(async () => {
      if (goalFired.current) return;
      try {
        const data = await api.get(`/track/check-subscription-by-visit?visit_id=${visitId}`);
        if (data.subscribed && !goalFired.current) {
          goalFired.current = true;
          setSubscribed(true);
          clearInterval(interval);
          const counterId = info?.ym_counter_id || info?.yandex_metrika_id;
          const goalName = info?.ym_goal_name || 'subscribe_channel';
          if (counterId && window.ym) {
            try { window.ym(Number(counterId), 'reachGoal', goalName); } catch {}
          }
          const vkPixelId = info?.vk_pixel_id;
          const vkGoalName = info?.vk_goal_name || 'subscribe_channel';
          if (vkPixelId && window._tmr) {
            try { window._tmr.push({ id: vkPixelId, type: 'reachGoal', goal: vkGoalName }); } catch {}
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [visitId, subscribed, info]);

  const getBotUrl = () => {
    if (!info) return null;
    const lmCode = info.lm_code;
    if (!lmCode) return null;
    const platform = info.platform;
    if (platform === 'max') {
      const maxBot = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
      return `https://max.ru/${maxBot}?start=lm_${lmCode}`;
    }
    const tgBot = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
    return `https://t.me/${tgBot}?start=lm_${lmCode}`;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loading />
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
      <div>
        <h2 style={{ marginBottom: 10, color: 'var(--error)' }}>Ошибка</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    </div>
  );

  const botUrl = getBotUrl();
  const align = info?.lm_description_align || 'left';

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, maxWidth: 440, width: '100%', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}>
        {/* Image */}
        {info?.lm_image_url && (
          <img src={info.lm_image_url} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
        )}

        <div style={{ padding: '28px 24px' }}>
          {/* Title */}
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 12, textAlign: align }}>
            {info?.lm_title || info?.channel_title || 'Бесплатный материал'}
          </h1>

          {/* Description */}
          {info?.lm_description && (
            <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#4b5563', marginBottom: 24, textAlign: align, whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: info.lm_description }} />
          )}

          {subscribed ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
              <h3 style={{ color: '#22c55e', marginBottom: 8 }}>Вы подписались!</h3>
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'block', padding: '14px 24px', background: '#7c3aed', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 600, fontSize: '1rem', marginTop: 16 }}>
                  {info?.lm_button_text || 'Получить бесплатно'}
                </a>
              )}
            </div>
          ) : (
            <div>
              {/* CTA — go to bot (bot checks subscription and delivers lead magnet) */}
              {botUrl ? (
                  <a href={botUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'block', padding: '16px 24px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: '1.05rem', textAlign: 'center', transition: 'transform 0.2s' }}>
                    {info?.lm_button_text || 'Получить бесплатно'}
                  </a>
              ) : null}
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', marginTop: 12 }}>
                Нажмите кнопку — бот проверит подписку на канал и выдаст материал
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
