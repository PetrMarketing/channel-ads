import { useAuth } from '../contexts/AuthContext';
import { useChannels } from '../contexts/ChannelContext';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';
import Modal from './Modal';
import ThemeToggle from './ThemeToggle';

function PlatformBadge({ platform, user, channels, onUnlink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isTG = platform === 'telegram';
  const isLinked = isTG ? !!user.telegram_id : !!user.max_user_id;
  const color = isTG ? '#2AABEE' : '#7B68EE';
  const label = isTG ? 'TG' : 'MAX';
  const name = isTG
    ? (user.username ? `@${user.username}` : `ID ${user.telegram_id}`)
    : (user.max_user_id ? `MAX ID ${user.max_user_id}` : '');
  const platformChannels = channels.filter(c => isTG ? c.platform !== 'max' : c.platform === 'max');

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!isLinked) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: color, color: '#fff', border: 'none', padding: '3px 8px',
          borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        title={`${label} аккаунт`}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: '6px',
          background: 'var(--bg-primary, #fff)', border: '1px solid var(--border, #ddd)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          padding: '12px 16px', minWidth: '200px', zIndex: 1000,
          fontSize: '0.82rem',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ background: color, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>{label}</span>
            <span>{isTG ? 'Telegram' : 'MAX'}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>
            {name}
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Каналов: {platformChannels.length}
          </div>
          <button
            onClick={() => { setOpen(false); onUnlink(platform); }}
            style={{
              width: '100%', padding: '6px 0', fontSize: '0.78rem', fontWeight: 500,
              border: '1px solid var(--error, #e63946)', borderRadius: '6px',
              background: 'transparent', color: 'var(--error, #e63946)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.target.style.background = 'var(--error, #e63946)'; e.target.style.color = '#fff'; }}
            onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--error, #e63946)'; }}
          >
            Отвязать
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { channels, currentChannel, selectChannel } = useChannels();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChannelChange = (e) => {
    const ch = channels.find(c => c.tracking_code === e.target.value);
    if (ch) selectChannel(ch);
  };

  const [unlinkModal, setUnlinkModal] = useState(false);
  const [unlinkCode, setUnlinkCode] = useState('');
  const [unlinkPlatform, setUnlinkPlatform] = useState('');
  const tgBot = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBot = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';

  const handleUnlink = async (platform) => {
    try {
      const data = await api.post('/auth/unlink', { platform });
      if (data.success) {
        setUnlinkCode(data.code);
        setUnlinkPlatform(platform);
        setUnlinkModal(true);
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Нельзя отвязать единственную платформу', 'error');
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar}>&#9776;</button>
        <h1><img src="/logo-64.png" alt="PK" style={{ width: 28, height: 28, borderRadius: 6, verticalAlign: 'middle', marginRight: 8 }} />MAXМаркетинг</h1>
        {channels.length > 0 && (
          <div className="global-channel-selector">
            <select
              value={currentChannel?.tracking_code || ''}
              onChange={handleChannelChange}
            >
              <option value="">Выберите канал</option>
              {channels.map(ch => (
                <option key={ch.tracking_code} value={ch.tracking_code}>
                  {ch.title || ch.channel_id || ch.tracking_code}
                </option>
              ))}
            </select>
          </div>
        )}
        {user && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginRight: '4px' }}>
            {user.first_name || user.username || ''}
          </span>
        )}
        {user && (
          <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
            <PlatformBadge platform="max" user={user} channels={channels} onUnlink={handleUnlink} />
          </span>
        )}
      </div>
      <div className="header-right">
        <ThemeToggle />
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          + Добавить канал
        </button>
        <button className="btn btn-outline" onClick={handleLogout} title="Выйти">
          &#128682; Выйти
        </button>
      </div>

      {/* Unlink code modal */}
      <Modal isOpen={unlinkModal} onClose={() => setUnlinkModal(false)} title={`Отвязка ${unlinkPlatform === 'telegram' ? 'Telegram' : 'MAX'}`}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
            Отправьте этот код боту{' '}
            <strong
              style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
              title="Нажмите, чтобы скопировать"
              onClick={() => { const name = unlinkPlatform === 'telegram' ? `@${tgBot}` : `@${maxBot}`; navigator.clipboard.writeText(name); }}
            >{unlinkPlatform === 'telegram' ? `@${tgBot}` : `@${maxBot}`}</strong>
            {unlinkPlatform === 'telegram' ? ' в Telegram' : ' в MAX'} для подтверждения отвязки:
          </p>
          <div style={{
            fontSize: '2rem', fontWeight: 700, letterSpacing: '8px', padding: '16px 24px',
            background: 'var(--bg-glass)', borderRadius: '12px', border: '2px dashed var(--error, #e63946)',
            display: 'inline-block', fontFamily: 'monospace', marginBottom: '16px',
          }}>
            {unlinkCode}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Код действителен 5 минут
          </p>
          <button
            onClick={() => {
              window.open(unlinkPlatform === 'telegram' ? `https://t.me/${tgBot}` : `https://max.ru/${maxBot}`, '_blank');
            }}
            className="btn btn-primary"
            style={{ display: 'inline-block' }}
          >
            Открыть {unlinkPlatform === 'telegram' ? 'Telegram' : 'MAX'}
          </button>
        </div>
      </Modal>
    </header>
  );
}
