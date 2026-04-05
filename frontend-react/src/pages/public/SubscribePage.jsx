import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import Loading from '../../components/Loading';

export default function SubscribePage() {
  const { shortCode } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState(null);
  const [visitId, setVisitId] = useState(null);
  const loadInfo = useCallback(async () => {
    if (!shortCode) return;
    setLoading(true);
    try {
      const data = await api.get(`/track/info/${shortCode}`);
      if (data.success) {
        setInfo(data.link);
        // Create visit
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

  // Inject Yandex Metrika script (only for reachGoal on subscription)
  useEffect(() => {
    if (!info) return;
    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    if (!counterId) return;

    window.ym = window.ym || function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.l = Date.now();
    window.ym(Number(counterId), 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    });

    const script = document.createElement('script');
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [info]);

  // Inject VK Pixel script
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

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [info]);

  // Poll for subscription confirmation — fire goals exactly ONCE
  const goalFired = useRef(false);
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
          // Fire Yandex Metrika goal (once)
          const counterId = info?.ym_counter_id || info?.yandex_metrika_id;
          const goalName = info?.ym_goal_name || 'subscribe_channel';
          if (counterId && window.ym) {
            try { window.ym(Number(counterId), 'reachGoal', goalName); } catch {}
          }
          // Fire VK Pixel goal (once)
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

  // Build subscribe URL
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loading />
    </div>
  );

  if (error) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', textAlign: 'center',
    }}>
      <div>
        <h2 style={{ marginBottom: '10px', color: 'var(--error)' }}>Ошибка</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    </div>
  );

  const subscribeUrl = getSubscribeUrl();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '32px', maxWidth: '400px', width: '100%',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>
          {info?.channel_title || 'Канал'}
        </h2>
        {info?.channel_description && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            {info.channel_description}
          </p>
        )}

        {subscribed ? (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
            <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>Вы подписались!</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Спасибо за подписку на канал</p>
          </div>
        ) : (
          <div>
            {subscribeUrl ? (
              <a href={subscribeUrl} target="_blank" rel="noreferrer"
                className="btn btn-primary btn-large"
                style={{ display: 'block', textDecoration: 'none', marginBottom: '16px', padding: '14px 24px', fontSize: '1rem' }}>
                Перейти в канал
              </a>
            ) : (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Подпишитесь на канал
              </p>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
              Подпишитесь и оставайтесь на этой странице — статус обновится автоматически
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
