import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, API_BASE } from '../services/api';
import '../styles/global.css';

export default function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tgBotUsername = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const [showMerge, setShowMerge] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [newUser, setNewUser] = useState(null);
  const [pendingToken, setPendingToken] = useState(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    const botToken = searchParams.get('token');

    if (!botToken) {
      if (token) navigate('/', { replace: true });
      return;
    }

    // Remove token from URL
    window.history.replaceState({}, '', '/login');

    (async () => {
      setLoading(true);

      // Validate new token
      let newUserData;
      try {
        const r = await fetch(`/api/auth/me`, {
          headers: { 'Authorization': 'Bearer ' + botToken },
        });
        const data = await r.json();
        if (!data.success) {
          setError('Ссылка для входа недействительна. Запросите новую у бота.');
          setLoading(false);
          return;
        }
        newUserData = data.user;
      } catch {
        setError('Ошибка подключения к серверу. Попробуйте позже.');
        setLoading(false);
        return;
      }

      // Check existing session
      const existingToken = localStorage.getItem('token');
      if (existingToken) {
        try {
          const r = await fetch(`/api/auth/me`, {
            headers: { 'Authorization': 'Bearer ' + existingToken },
          });
          const data = await r.json();
          if (data.success && data.user.id !== newUserData.id) {
            setLoading(false);
            setCurrentUser(data.user);
            setNewUser(newUserData);
            setPendingToken(botToken);
            setShowMerge(true);
            return;
          }
        } catch {}
      }

      // No conflict — log in
      login(botToken, newUserData);
      const redirectTo = searchParams.get('redirect') || '/';
      navigate(redirectTo, { replace: true });
    })();
  }, []);

  const doMerge = async () => {
    setMerging(true);
    try {
      const existingToken = localStorage.getItem('token');
      const r = await fetch(`/api/auth/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + existingToken,
        },
        body: JSON.stringify({ mergeToken: pendingToken }),
      });
      const data = await r.json();
      if (data.success) {
        login(data.token, data.user);
        navigate('/?merged=1', { replace: true });
      } else {
        setError(data.error || 'Ошибка объединения');
        setMerging(false);
      }
    } catch {
      setError('Ошибка подключения');
      setMerging(false);
    }
  };

  const switchToNew = () => {
    if (!window.confirm('Вы выйдете из текущего аккаунта и войдёте как новый пользователь. Продолжить?')) return;
    login(pendingToken, newUser);
    navigate('/', { replace: true });
  };

  const getUserPlatform = (u) => {
    if (u?.telegram_id && u?.max_user_id) return 'both';
    if (u?.telegram_id) return 'telegram';
    if (u?.max_user_id) return 'max';
    return 'unknown';
  };

  const formatDetail = (u) => {
    if (u?.username) return '@' + u.username;
    if (u?.telegram_id) return 'TG ID: ' + u.telegram_id;
    if (u?.max_user_id) return 'MAX ID: ' + u.max_user_id;
    return '';
  };

  return (
    <div className="auth-wrapper" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '20px',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '420px', textAlign: 'center',
      }}>
        {!showMerge ? (
          <>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}><img src="/logo-64.png" alt="PK" style={{ width: 32, height: 32, borderRadius: 6, verticalAlign: 'middle', marginRight: 8 }} />MAXМаркетинг</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '0.9rem' }}>
              Трекинг подписок из рекламы Яндекс
            </p>

            {loading && (
              <div style={{ marginBottom: '20px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                <span className="spinner" style={{
                  display: 'inline-block', width: '18px', height: '18px',
                  border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  verticalAlign: 'middle', marginRight: '8px',
                }} />
                Авторизация...
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px', padding: '14px', marginBottom: '20px', color: '#ef4444', fontSize: '0.9rem',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <button
                onClick={() => window.open(`https://max.ru/${maxBotUsername}?start=auth`, '_blank')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  padding: '16px 24px', borderRadius: '12px', fontSize: '1rem', fontWeight: 600,
                  textDecoration: 'none', background: '#7B68EE', color: '#fff', border: 'none',
                  cursor: 'pointer', transition: 'all 0.2s', width: '100%',
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>💬</span>
                Войти через MAX
              </button>
            </div>

            <p style={{ marginTop: '24px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Нажмите кнопку — бот в MAX пришлёт ссылку для входа.<br />
              Если бот не ответил — напишите ему <strong>/start</strong>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Объединить аккаунты?</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Обнаружен существующий аккаунт с другой платформы
            </p>

            <div style={{
              background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px', padding: '16px', marginBottom: '20px', textAlign: 'left',
              fontSize: '0.9rem', lineHeight: 1.5,
            }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', marginBottom: '10px' }}>
                <strong>{currentUser?.first_name || currentUser?.username || '—'}</strong>
                <span style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, marginLeft: '8px',
                  background: getUserPlatform(currentUser) === 'telegram' ? '#2AABEE' : '#7B68EE', color: '#fff',
                }}>
                  {getUserPlatform(currentUser) === 'telegram' ? 'Telegram' : 'MAX'}
                </span>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDetail(currentUser)}</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '1.2rem', margin: '6px 0' }}>+</div>
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px' }}>
                <strong>{newUser?.first_name || newUser?.username || '—'}</strong>
                <span style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, marginLeft: '8px',
                  background: getUserPlatform(newUser) === 'telegram' ? '#2AABEE' : '#7B68EE', color: '#fff',
                }}>
                  {getUserPlatform(newUser) === 'telegram' ? 'Telegram' : 'MAX'}
                </span>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDetail(newUser)}</div>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Объединение позволит входить и через Telegram, и через MAX.<br />
              Все каналы будут доступны в одном аккаунте.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={doMerge}
                disabled={merging}
                style={{
                  padding: '14px', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 600,
                  background: 'var(--accent, #3b82f6)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                {merging ? 'Объединяем...' : 'Объединить аккаунты'}
              </button>
              <button
                onClick={switchToNew}
                style={{
                  padding: '14px', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                Не объединять, войти отдельно
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
