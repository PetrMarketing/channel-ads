import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/global.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function StaffInvitePage() {
  const { token: inviteToken } = useParams();
  const { token: authToken } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/staff/invite/${inviteToken}`);
        const data = await r.json();
        if (data.success) {
          setInvite(data.invite);
        } else {
          setError(data.error || 'Приглашение не найдено или истекло');
        }
      } catch {
        setError('Ошибка загрузки приглашения');
      } finally {
        setLoading(false);
      }
    })();
  }, [inviteToken]);

  const handleAccept = async () => {
    if (!authToken) {
      // Redirect to login, then back here
      navigate(`/login?redirect=/staff-invite/${inviteToken}`);
      return;
    }

    setAccepting(true);
    try {
      const r = await fetch(`${API_BASE}/staff/invite/${inviteToken}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const data = await r.json();
      if (data.success) {
        setAccepted(true);
      } else {
        setError(data.error || 'Ошибка принятия приглашения');
      }
    } catch {
      setError('Ошибка подключения');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '20px',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '420px', textAlign: 'center',
      }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Загрузка приглашения...
          </div>
        ) : error && !accepted ? (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>&#10060;</div>
            <p style={{ color: 'var(--error, #ef4444)', marginBottom: '20px' }}>{error}</p>
            <button
              className="btn btn-outline"
              onClick={() => navigate('/')}
              style={{ padding: '10px 24px' }}
            >
              На главную
            </button>
          </div>
        ) : accepted ? (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>&#9989;</div>
            <h2 style={{ marginBottom: '8px' }}>Приглашение принято!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
              Вы добавлены как {invite?.role_name || 'сотрудник'} канала "{invite?.channel_title}"
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ padding: '12px 24px', width: '100%' }}
            >
              Перейти в панель управления
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>&#128101;</div>
            <h2 style={{ marginBottom: '8px' }}>Приглашение</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
              Вас приглашают стать администратором канала
            </p>

            <div style={{
              background: 'var(--bg-glass, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)',
              borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'left',
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Канал</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{invite?.channel_title}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Роль</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{invite?.role_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Пригласил</div>
                <div style={{ fontSize: '0.95rem' }}>{invite?.inviter_name}</div>
              </div>
            </div>

            {authToken ? (
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={accepting}
                style={{ padding: '14px 24px', width: '100%', fontSize: '1rem', fontWeight: 600 }}
              >
                {accepting ? 'Принятие...' : 'Принять приглашение'}
              </button>
            ) : (
              <a
                href={`https://max.ru/${import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot'}?start=invite_${inviteToken}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ padding: '14px 24px', width: '100%', fontSize: '1rem', fontWeight: 600, display: 'block', textDecoration: 'none', textAlign: 'center' }}
              >
                Принять через MAX бота
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
