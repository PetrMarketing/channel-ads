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
  const metrikaReady = useRef(false);

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

  // Inject Yandex Metrika script
  useEffect(() => {
    if (!info) return;
    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    if (!counterId) return;

    // Init Metrika
    window.ym = window.ym || function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.l = Date.now();
    window.ym(Number(counterId), 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });

    // Load Metrika script
    const script = document.createElement('script');
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.async = true;
    script.onload = () => {
      metrikaReady.current = true;
      // Capture client ID and send to backend
      captureYmClientId(counterId);
    };
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [info]);

  // Capture ym_client_id and patch visit
  const captureYmClientId = useCallback((counterId) => {
    if (!visitId || !counterId) return;
    const tryCapture = (attempts = 0) => {
      if (attempts > 30) return; // 15 sec max
      try {
        window.ym(Number(counterId), 'getClientID', (clientID) => {
          if (clientID) {
            api.patch(`/track/visit/${visitId}/ym-client`, { ym_client_id: String(clientID) }).catch(() => {});
          }
        });
      } catch {
        setTimeout(() => tryCapture(attempts + 1), 500);
      }
    };
    tryCapture();
  }, [visitId]);

  // Re-try client ID capture when visitId becomes available
  useEffect(() => {
    if (!visitId || !info) return;
    const counterId = info.ym_counter_id || info.yandex_metrika_id;
    if (counterId && metrikaReady.current) {
      captureYmClientId(counterId);
    }
  }, [visitId, info, captureYmClientId]);

  // Poll for subscription confirmation
  useEffect(() => {
    if (!visitId || subscribed) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.get(`/track/check-subscription-by-visit?visit_id=${visitId}`);
        if (data.subscribed) {
          setSubscribed(true);
          clearInterval(interval);
          // Fire Metrika goal
          const counterId = info?.ym_counter_id || info?.yandex_metrika_id;
          const goalName = info?.ym_goal_name || 'subscribe_channel';
          if (counterId && window.ym) {
            try { window.ym(Number(counterId), 'reachGoal', goalName); } catch {}
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
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>&#10003;</div>
            <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>Вы подписаны!</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Спасибо за подписку</p>
          </div>
        ) : (
          <div>
            {subscribeUrl ? (
              <a href={subscribeUrl} target="_blank" rel="noreferrer"
                className="btn btn-primary btn-large"
                style={{ display: 'block', textDecoration: 'none', marginBottom: '12px' }}>
                Подписаться
              </a>
            ) : (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Подпишитесь на канал
              </p>
            )}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Подпишитесь на канал и оставайтесь на этой странице — мы автоматически проверим подписку
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
