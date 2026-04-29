import { useAuth } from '../contexts/AuthContext';
import { useChannels } from '../contexts/ChannelContext';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';
import Modal from './Modal';
import { useOnboarding } from './OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const TG_BLUE = '#2AABEE';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';

function PlatformBadge({ platform, user, channels, onUnlink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isTG = platform === 'telegram';
  const isLinked = isTG ? !!user.telegram_id : !!user.max_user_id;
  const color = isTG ? TG_BLUE : ACCENT2;
  const label = isTG ? 'TG' : 'MAX';
  const fullName = isTG ? 'Telegram' : 'MAX';
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
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          color: '#fff', border: 'none', padding: '4px 10px',
          borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
          letterSpacing: '0.05em', cursor: 'pointer',
          boxShadow: `0 2px 6px ${color}40`,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 10px ${color}55`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 2px 6px ${color}40`; }}
        title={`${fullName} аккаунт`}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: 14, minWidth: 220, zIndex: 1000,
          boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
          animation: 'hdrPop 0.18s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              background: `linear-gradient(135deg, ${color}, ${color}cc)`,
              color: '#fff', padding: '3px 9px', borderRadius: 6,
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em',
            }}>{label}</span>
            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: DARK }}>{fullName}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 4, fontFamily: 'ui-monospace, monospace' }}>{name}</div>
          <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 12 }}>
            Каналов: <span style={{ color: DARK, fontWeight: 600 }}>{platformChannels.length}</span>
          </div>
          <button
            onClick={() => { setOpen(false); onUnlink(platform); }}
            style={{
              width: '100%', padding: '8px 0', fontSize: '0.78rem', fontWeight: 600,
              borderRadius: 8, border: `1px solid ${DANGER}30`,
              background: '#fff', color: DANGER, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = DANGER; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = DANGER; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = DANGER; e.currentTarget.style.borderColor = `${DANGER}30`; }}
          >
            Отвязать
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onToggleSidebar, onBurgerClick }) {
  const { user, logout } = useAuth();
  const { channels, currentChannel, selectChannel } = useChannels();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleChannelChange = (e) => {
    const ch = channels.find(c => c.tracking_code === e.target.value);
    if (ch) selectChannel(ch);
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.profile-dropdown-wrap')) {
        const dd = document.querySelector('.profile-dropdown');
        if (dd) dd.style.display = 'none';
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const [unlinkModal, setUnlinkModal] = useState(false);
  const [unlinkCode, setUnlinkCode] = useState('');
  const [unlinkPlatform, setUnlinkPlatform] = useState('');
  const tgBot = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBot = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';

  const onboarding = useOnboarding();

  const handleUnlink = async (platform) => {
    try {
      const data = await api.post('/auth/unlink', { platform });
      if (data.success) {
        setUnlinkCode(data.code);
        setUnlinkPlatform(platform);
        setUnlinkModal(true);
      } else showToast(data.error || 'Ошибка', 'error');
    } catch { showToast('Нельзя отвязать единственную платформу', 'error'); }
  };

  const tokenCount = user?.ai_tokens || 0;
  const onboardingPct = onboarding.totalSteps > 0 ? Math.round((onboarding.completedCount / onboarding.totalSteps) * 100) : 0;

  return (
    <header className="header" style={headerStyle}>
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
        {/* Mobile burger (≤768px only via CSS) */}
        <button
          type="button"
          className="header-burger-btn"
          aria-label="Открыть меню"
          onClick={onBurgerClick}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {/* Logo */}
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'hdrFadeIn 0.4s ease', minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 10px ${ACCENT}40`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <h1 style={{
            margin: 0, fontSize: '1.05rem', fontWeight: 700, color: DARK,
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>MAXМаркетинг</h1>
        </div>

        {/* Channel selector */}
        {channels.length > 0 && (
          <div className="global-channel-selector" data-tour="channel-select"
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', animation: 'hdrFadeIn 0.4s ease 0.05s both' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={currentChannel?.tracking_code || ''}
                onChange={handleChannelChange}
                style={selectStyle}
              >
                <option value="">Выберите канал</option>
                {channels.map(ch => (
                  <option key={ch.tracking_code} value={ch.tracking_code}>
                    {(ch.title || ch.channel_id || ch.tracking_code) + (ch.is_staff ? ` (${ch.owner_name || 'сотрудник'})` : '')}
                  </option>
                ))}
              </select>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" strokeLinecap="round"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            {currentChannel?.is_staff && (
              <span style={{
                fontSize: '0.7rem', color: ACCENT2, background: `${ACCENT2}10`,
                padding: '4px 10px', border: `1px solid ${ACCENT2}30`,
                borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
              }} title={`Владелец: ${currentChannel.owner_name || '—'}`}>
                Владелец: {currentChannel.owner_name || '—'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Onboarding button */}
        {user && onboarding.totalSteps > 0 && (
          <button onClick={onboarding.start} title="Запустить обучение"
            className="header-onboarding-btn"
            style={{
              ...onboardingBtn,
              animation: 'hdrFadeIn 0.4s ease 0.1s both',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT}08`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <span className="header-onboarding-label">Обучение</span>
            <span style={progressPill} className="header-onboarding-progress">
              {onboarding.completedCount}/{onboarding.totalSteps}
              <span style={{
                position: 'absolute', left: 0, bottom: -1, height: 2,
                width: `${onboardingPct}%`,
                background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </span>
          </button>
        )}

        {/* + Канал */}
        <button onClick={() => navigate('/')} data-tour="add-channel"
          className="header-add-channel-btn"
          style={{ ...addChannelBtn, animation: 'hdrFadeIn 0.4s ease 0.15s both' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${ACCENT}50`; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span className="header-add-channel-label">Канал</span>
        </button>

        {/* Profile */}
        {user && (
          <div style={{ position: 'relative', animation: 'hdrFadeIn 0.4s ease 0.2s both' }} className="profile-dropdown-wrap" data-tour="profile">
            <button
              onClick={() => {
                const dd = document.querySelector('.profile-dropdown');
                if (dd) dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
              }}
              style={profileBtn}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${ACCENT}50`; e.currentTarget.style.background = `${ACCENT}05`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
            >
              <span className="header-profile-label" style={{ fontWeight: 600, fontSize: '0.82rem', color: DARK }}>Профиль</span>
              <span className="header-profile-pkid" style={{ fontSize: '0.72rem', color: MUTED, fontFamily: 'ui-monospace, monospace' }}>
                PKid: {user.id}
              </span>
              <span style={{
                fontSize: '0.7rem', color: ACCENT2, fontWeight: 700,
                background: `${ACCENT2}10`, padding: '2px 8px', borderRadius: 20,
              }}>{tokenCount}</span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            <div className="profile-dropdown" style={dropdownStyle}>
              {/* User block */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.95rem', fontWeight: 700, color: '#fff',
                    boxShadow: `0 3px 10px ${ACCENT}30`,
                  }}>{(user.first_name || user.username || 'U')[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.first_name || user.username}
                    </div>
                    <div style={{
                      fontSize: '0.72rem', color: MUTED, marginTop: 2,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontFamily: 'ui-monospace, monospace',
                    }}
                      onClick={() => { navigator.clipboard.writeText(String(user.id)); showToast('PKid скопирован'); }}
                      title="Нажмите, чтобы скопировать">
                      PKid: {user.id}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tokens */}
              <div style={{
                padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.82rem', color: MUTED, fontWeight: 500 }}>ИИ Токены</span>
                <span style={{
                  fontSize: '0.85rem', fontWeight: 700,
                  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>{tokenCount}</span>
              </div>

              {/* Platform badges */}
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Аккаунты
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <PlatformBadge platform="max" user={user} channels={channels} onUnlink={handleUnlink} />
                  <PlatformBadge platform="telegram" user={user} channels={channels} onUnlink={handleUnlink} />
                </div>
              </div>

              <button onClick={handleLogout} style={logoutBtn}
                onMouseEnter={e => { e.currentTarget.style.background = `${DANGER}08`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
                Выйти
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unlink modal */}
      <Modal isOpen={unlinkModal} onClose={() => setUnlinkModal(false)} title={`Отвязка ${unlinkPlatform === 'telegram' ? 'Telegram' : 'MAX'}`}>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <p style={{ marginBottom: 18, fontSize: '0.9rem', color: '#444', lineHeight: 1.5 }}>
            Отправьте этот код боту{' '}
            <strong
              style={{ cursor: 'pointer', textDecoration: 'underline dotted', color: ACCENT }}
              title="Нажмите, чтобы скопировать"
              onClick={() => { const name = unlinkPlatform === 'telegram' ? `@${tgBot}` : `@${maxBot}`; navigator.clipboard.writeText(name); showToast('Скопировано'); }}
            >{unlinkPlatform === 'telegram' ? `@${tgBot}` : `@${maxBot}`}</strong>
            {unlinkPlatform === 'telegram' ? ' в Telegram' : ' в MAX'} для подтверждения отвязки:
          </p>
          <div style={{
            fontSize: '2rem', fontWeight: 800, letterSpacing: 8, padding: '20px 28px',
            background: `linear-gradient(135deg, ${DANGER}06, ${DANGER}10)`,
            border: `2px dashed ${DANGER}50`, borderRadius: 12,
            display: 'inline-block', marginBottom: 14, color: DANGER,
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}>
            {unlinkCode}
          </div>
          <p style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 18 }}>Код действителен 5 минут</p>
          <button
            onClick={() => { window.open(unlinkPlatform === 'telegram' ? `https://t.me/${tgBot}` : `https://max.ru/${maxBot}`, '_blank'); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 22px', borderRadius: 10,
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
              color: '#fff', border: 'none', fontSize: '0.88rem', fontWeight: 600,
              cursor: 'pointer', boxShadow: `0 4px 14px ${ACCENT}40`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${ACCENT}55`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
          >
            Открыть {unlinkPlatform === 'telegram' ? 'Telegram' : 'MAX'} →
          </button>
        </div>
      </Modal>

      <style>{`
        @keyframes hdrFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hdrPop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .global-channel-selector select:focus { outline: none; border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}15 !important; }
      `}</style>
    </header>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────

const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 24px', background: '#fff',
  borderBottom: `1px solid ${BORDER}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  flexWrap: 'wrap', gap: 12,
  position: 'sticky', top: 0, zIndex: 50,
  backdropFilter: 'none',
};

const iconBtn = {
  width: 36, height: 36, borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  color: DARK, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'border-color 0.15s, background 0.15s',
};

const selectStyle = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  padding: '8px 32px 8px 14px',
  borderRadius: 10, border: `1px solid #e5e7eb`,
  background: '#fff', color: DARK, fontWeight: 600, fontSize: '0.85rem',
  cursor: 'pointer', minWidth: 200,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const onboardingBtn = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 12px', borderRadius: 10,
  background: '#fff', border: `1px solid ${ACCENT}30`,
  color: ACCENT, fontSize: '0.8rem', fontWeight: 600,
  cursor: 'pointer', transition: 'all 0.15s',
};

const progressPill = {
  position: 'relative', display: 'inline-block',
  fontSize: '0.7rem', padding: '2px 8px',
  background: `${ACCENT}10`, borderRadius: 10,
  fontWeight: 700, fontFamily: 'ui-monospace, monospace',
  color: ACCENT, overflow: 'hidden',
};

const addChannelBtn = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 10,
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', border: 'none',
  fontSize: '0.82rem', fontWeight: 600,
  cursor: 'pointer',
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform 0.15s, box-shadow 0.15s',
};

const profileBtn = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 12px', borderRadius: 10,
  background: '#fff', border: `1px solid #e5e7eb`,
  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
};

const dropdownStyle = {
  display: 'none', position: 'absolute', right: 0, top: 'calc(100% + 6px)',
  background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
  minWidth: 240, zIndex: 100, padding: 0, overflow: 'hidden',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
};

const logoutBtn = {
  width: '100%', padding: '11px 16px', border: 'none', background: 'transparent',
  textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
  color: DANGER, fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 8,
  transition: 'background 0.15s',
};
