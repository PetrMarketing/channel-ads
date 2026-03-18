import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../../components/Loading';

export default function GoRedirectPage() {
  const { code } = useParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) {
      setError('Код не указан');
      return;
    }

    const redirect = async () => {
      try {
        const resp = await fetch(`/api/track/info/${code}`);
        const data = await resp.json();
        if (!data.success || !data.link) {
          setError(data.error || 'Ссылка не найдена');
          return;
        }

        const link = data.link;
        const linkType = link.link_type || 'landing';

        if (linkType === 'direct') {
          // Record visit + click for direct links (fire-and-forget)
          fetch('/api/track/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              short_code: code,
              ip_address: '',
              user_agent: navigator.userAgent,
            }),
          }).catch(() => {});

          // Redirect straight to channel
          const platform = link.platform;
          const username = link.channel_username || link.username;
          const maxChatId = link.max_chat_id;
          const joinLink = link.join_link;

          let channelUrl;
          if (joinLink) {
            channelUrl = joinLink;
          } else if (platform === 'max' && maxChatId) {
            channelUrl = maxChatId.startsWith('http') ? maxChatId : `https://max.ru/chats/${maxChatId}`;
          } else if (platform === 'max' && username) {
            channelUrl = `https://max.ru/chats/${username}`;
          } else if (username) {
            channelUrl = `https://t.me/${username}`;
          } else {
            window.location.href = `/subscribe/${code}`;
            return;
          }
          window.location.href = channelUrl;
        } else {
          // Landing link: go to subscribe page (it handles visit/click recording)
          window.location.href = `/subscribe/${code}`;
        }
      } catch {
        setError('Ошибка загрузки ссылки');
      }
    };

    redirect();
  }, [code]);

  if (error) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', textAlign: 'center',
    }}>
      <div>
        <h2 style={{ color: 'var(--error)', marginBottom: '10px' }}>Ошибка</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Loading text="Перенаправление..." />
    </div>
  );
}
