import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useChannels } from '../contexts/ChannelContext';
import Modal from '../components/Modal';
import { usePageOnboarding } from '../components/OnboardingTour';

const MAX_BOT_USERNAME = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const TIER_LABELS = { 1: '1 мес', 3: '3 мес', 6: '6 мес', 12: '12 мес' };

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.82rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const iconGhostBtn = {
  ...ghostBtn,
  width: 34, height: 34, padding: 0, fontSize: '0.95rem',
};

const dangerGhost = {
  ...iconGhostBtn,
  color: DANGER,
  borderColor: 'rgba(230,57,70,0.25)',
  background: 'rgba(230,57,70,0.04)',
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.88rem', color: DARK,
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: DARK, marginBottom: 6,
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const STAT_TILES = [
  { key: 'total_invited',  label: 'Приглашено', grad: [ACCENT, ACCENT2], icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6 M22 11h-6" />
    </svg>
  )},
  { key: 'total_active',   label: 'Активных', grad: [SUCCESS, '#34d399'], icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )},
  { key: 'total_earned',   label: 'Заработано', suffix: ' ₽', grad: [WARNING, '#f97316'], icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )},
  { key: 'balance',        label: 'Доступно', suffix: ' ₽', grad: [ACCENT2, '#a855f7'], icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01 M18 12h.01" />
    </svg>
  )},
];

const initialsFrom = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export default function ReferralPage() {
  const { showToast } = useToast();
  const { channels } = useChannels();
  const [dashboard, setDashboard] = useState(null);
  const [links, setLinks] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLinkName, setNewLinkName] = useState('');
  const [showUseModal, setShowUseModal] = useState(false);
  const [useForm, setUseForm] = useState({ tracking_code: '', months: 1 });
  const [using, setUsing] = useState(false);

  const { overlay: pageTour } = usePageOnboarding('referrals', [
    { selector: '[data-tour-page="ref-create"]', title: 'Реферальная ссылка', text: 'Делитесь ссылкой, получайте до 50% с платежей рефералов.', placement: 'bottom' },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, l, e] = await Promise.all([
        api.get('/referrals/dashboard'),
        api.get('/referrals/links'),
        api.get('/referrals/earnings'),
      ]);
      if (d.success) setDashboard(d);
      if (l.success) setLinks(l.links || []);
      if (e.success) setEarnings(e.earnings || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createLink = async () => {
    try {
      const data = await api.post('/referrals/links', { name: newLinkName || 'Основная ссылка' });
      if (data.success) {
        showToast('Ссылка создана');
        setNewLinkName('');
        load();
      }
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const deleteLink = async (id) => {
    if (!confirm('Удалить ссылку?')) return;
    await api.delete(`/referrals/links/${id}`);
    load();
  };

  const buildUrl = (code) => `https://max.ru/${MAX_BOT_USERNAME}?start=auth_ref_${code}`;

  const copyLink = (code) => {
    navigator.clipboard.writeText(buildUrl(code));
    showToast('Ссылка скопирована');
  };

  const shareTo = (network, code) => {
    const url = encodeURIComponent(buildUrl(code));
    const text = encodeURIComponent('Присоединяйся к PK Marketing — комплексная маркетинговая платформа для каналов.');
    let target;
    if (network === 'tg') target = `https://t.me/share/url?url=${url}&text=${text}`;
    else if (network === 'vk') target = `https://vk.com/share.php?url=${url}&title=PK Marketing`;
    else if (network === 'wa') target = `https://wa.me/?text=${text}%20${url}`;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  };

  const useBalance = async () => {
    setUsing(true);
    try {
      const data = await api.post('/referrals/use-balance', useForm);
      if (data.success) {
        showToast(`Подписка активирована! Новый баланс: ${data.new_balance} ₽`);
        setShowUseModal(false);
        load();
      }
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setUsing(false); }
  };

  const tiers = dashboard?.commission_tiers || {};
  const tierEntries = Object.entries(tiers).sort((a, b) => Number(a[0]) - Number(b[0]));
  const maxPct = tierEntries.reduce((m, [, p]) => Math.max(m, Number(p) || 0), 0) || 50;

  const statValue = (key) => {
    if (key === 'total_active') {
      // approximate from earnings if not provided
      return dashboard?.total_active ?? new Set(earnings.map(e => e.referred_user_id)).size;
    }
    return dashboard?.[key] ?? 0;
  };

  if (loading) return (
    <div style={{ ...cardBase, padding: '56px 32px', textAlign: 'center', color: MUTED, fontSize: '0.92rem' }}>
      Загрузка...
    </div>
  );

  return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .rp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .rp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .rp-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .rp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .rp-input:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .rp-share:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.10);
        }
        .rp-code:hover { background: ${ACCENT}10 !important; border-color: ${ACCENT}40 !important; }
      `}</style>

      <section style={pageHeaderWrap}>
        <div style={pageHeaderBlur1} />
        <div style={pageHeaderBlur2} />
        <div style={pageHeaderRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={eyebrowStyle}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS, boxShadow: `0 0 8px ${SUCCESS}` }} />
              Партнёрская программа
            </div>
            <h1 style={pageTitleStyle}>Реферальная программа</h1>
            <p style={pageSubStyle}>
              Приглашайте друзей и получайте до {maxPct}% с каждого их платежа. Баланс можно использовать для оплаты тарифов.
            </p>
          </div>
          {dashboard?.balance > 0 && (
            <button className="rp-primary" style={primaryBtn} onClick={() => setShowUseModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" />
              </svg>
              Оплатить тарифом
            </button>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 26 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {STAT_TILES.map((tile, i) => {
            const raw = statValue(tile.key);
            const value = typeof raw === 'number' ? raw.toLocaleString('ru-RU') : raw;
            return (
              <div
                key={tile.key}
                className="rp-card"
                style={{ ...cardBase, padding: 16, position: 'relative', overflow: 'hidden', animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` }}
              >
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 36, height: 36, borderRadius: 10,
                  background: `linear-gradient(135deg, ${tile.grad[0]} 0%, ${tile.grad[1]} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 12px ${tile.grad[0]}33`,
                }}>
                  {tile.icon}
                </div>
                <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {tile.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {value}
                  </span>
                  {tile.suffix && (
                    <span style={{ fontSize: '0.85rem', color: MUTED, fontWeight: 600 }}>{tile.suffix.trim()}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {tierEntries.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div style={sectionHeaderRow}>
            <div>
              <h2 style={sectionTitleStyle}>Уровни вознаграждения</h2>
              <p style={sectionSubStyle}>Чем длиннее подписка реферала, тем выше ваш процент</p>
            </div>
          </div>
          <div className="rp-card" style={{ ...cardBase, padding: 22 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              {tierEntries.map(([months, pct], i) => {
                const ratio = Math.min(1, Number(pct) / Math.max(maxPct, 1));
                return (
                  <div key={months} style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{
                      borderRadius: 14, padding: '16px 14px',
                      background: `linear-gradient(135deg, ${ACCENT}${Math.round(8 + ratio * 18).toString(16).padStart(2,'0')}, ${ACCENT2}${Math.round(8 + ratio * 18).toString(16).padStart(2,'0')})`,
                      border: `1px solid ${ACCENT}${ratio > 0.7 ? '50' : '25'}`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: ACCENT, letterSpacing: '-0.04em', lineHeight: 1 }}>
                        {pct}%
                      </div>
                      <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 6 }}>
                        Подписка {TIER_LABELS[months] || `${months} мес`}
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: SOFT_BG, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${ratio * 100}%`,
                        background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
                        borderRadius: 999, transition: 'width .5s ease',
                      }} />
                    </div>
                    {i < tierEntries.length - 1 && (
                      <div aria-hidden style={{ display: 'none' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 26 }}>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitleStyle}>Ваши ссылки</h2>
            <p style={sectionSubStyle}>Создавайте отдельные ссылки под разные источники</p>
          </div>
        </div>

        <div style={{
          ...cardBase,
          padding: 18,
          background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
          borderColor: `${ACCENT}25`,
          marginBottom: 14,
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={labelStyle}>Название (необязательно)</label>
            <input
              className="rp-input"
              style={inputStyle}
              placeholder="Например: Рассылка в чате"
              value={newLinkName}
              onChange={e => setNewLinkName(e.target.value)}
            />
          </div>
          <button
            data-tour-page="ref-create"
            className="rp-primary"
            style={primaryBtn}
            onClick={createLink}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Создать ссылку
          </button>
        </div>

        {links.length === 0 ? (
          <EmptyReferrals />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {links.map((link, i) => {
              const url = buildUrl(link.code);
              return (
                <div
                  key={link.id}
                  className="rp-card"
                  style={{ ...cardBase, padding: 18, animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                      boxShadow: `0 4px 12px ${ACCENT}33`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.22), transparent 60%)',
                      }} />
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                      </svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                          {link.name || 'Ссылка'}
                        </span>
                        <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
                          Регистраций · {link.signups || 0}
                        </span>
                        <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                          Заработано · {(link.earned || 0).toLocaleString('ru-RU')} ₽
                        </span>
                      </div>

                      <code
                        className="rp-code"
                        onClick={() => copyLink(link.code)}
                        title="Нажмите чтобы скопировать"
                        style={{
                          display: 'inline-block',
                          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                          fontSize: '0.78rem',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: SOFT_BG,
                          border: `1px solid ${BORDER}`,
                          color: ACCENT,
                          cursor: 'pointer',
                          transition: 'all .15s ease',
                          wordBreak: 'break-all',
                          maxWidth: '100%',
                        }}
                      >
                        {url}
                      </code>

                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <ShareChip network="tg" onClick={() => shareTo('tg', link.code)} />
                        <ShareChip network="vk" onClick={() => shareTo('vk', link.code)} />
                        <ShareChip network="wa" onClick={() => shareTo('wa', link.code)} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="rp-ghost" style={ghostBtn} onClick={() => copyLink(link.code)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Копировать
                      </button>
                      <button className="rp-danger" style={dangerGhost} onClick={() => deleteLink(link.id)} title="Удалить">🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {earnings.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={sectionHeaderRow}>
            <div>
              <h2 style={sectionTitleStyle}>История начислений</h2>
              <p style={sectionSubStyle}>Последние {earnings.length} платежей рефералов</p>
            </div>
          </div>
          <div className="rp-card" style={{ ...cardBase, padding: 8 }}>
            {earnings.map((e, i) => {
              const name = e.referred_name || e.referred_username || 'Пользователь';
              const initials = initialsFrom(name);
              const status = e.status === 'pending'
                ? { bg: 'rgba(245,158,11,0.10)', color: WARNING, label: 'Ожидает' }
                : { bg: 'rgba(16,185,129,0.10)', color: SUCCESS, label: 'Зачислено' };
              return (
                <div
                  key={e.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                    background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                    color: '#fff', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '-0.02em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 3px 10px ${ACCENT}33`,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: DARK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={pill(`${ACCENT2}10`, ACCENT2)}>{e.commission_percent}%</span>
                      {e.created_at && (
                        <span style={{ fontSize: '0.74rem', color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                          {new Date(e.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={pill(status.bg, status.color)}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
                    {status.label}
                  </span>
                  <span style={{
                    fontSize: '0.95rem', fontWeight: 800, color: SUCCESS, letterSpacing: '-0.02em', minWidth: 70, textAlign: 'right',
                  }}>
                    +{Number(e.commission_amount || 0).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Modal isOpen={showUseModal} onClose={() => setShowUseModal(false)} title="Оплатить тарифом">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: 16, borderRadius: 12,
            background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
            border: `1px solid ${ACCENT}25`,
          }}>
            <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              Доступный баланс
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {(dashboard?.balance || 0).toLocaleString('ru-RU')}
              </span>
              <span style={{ fontSize: '0.92rem', color: MUTED, fontWeight: 600 }}>₽</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Канал</label>
            <select
              className="rp-input"
              style={inputStyle}
              value={useForm.tracking_code}
              onChange={e => setUseForm(f => ({ ...f, tracking_code: e.target.value }))}
            >
              <option value="">— Выберите канал —</option>
              {channels?.map(ch => <option key={ch.tracking_code} value={ch.tracking_code}>{ch.title}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Срок</label>
            <select
              className="rp-input"
              style={inputStyle}
              value={useForm.months}
              onChange={e => setUseForm(f => ({ ...f, months: parseInt(e.target.value) }))}
            >
              <option value={1}>1 месяц</option>
              <option value={3}>3 месяца</option>
              <option value={6}>6 месяцев</option>
              <option value={12}>12 месяцев</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="rp-ghost" style={ghostBtn} onClick={() => setShowUseModal(false)}>Отмена</button>
            <button
              className="rp-primary"
              style={{ ...primaryBtn, opacity: using || !useForm.tracking_code ? 0.7 : 1 }}
              onClick={useBalance}
              disabled={using || !useForm.tracking_code}
            >
              {using ? 'Оплата...' : 'Оплатить'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const SHARE_META = {
  tg: { label: 'Telegram', bg: '#229ED9', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
      <path d="M21.43 3.42L2.7 10.66c-1.28.48-1.27 1.16-.23 1.48l4.81 1.5 11.13-7.02c.53-.32 1.01-.15.61.21l-9.02 8.14h-.02v.02l-.33 4.96c.49 0 .71-.22.99-.49l2.37-2.31 4.93 3.65c.91.5 1.56.24 1.78-.84l3.23-15.21c.32-1.32-.51-1.92-1.55-1.33z"/>
    </svg>
  )},
  vk: { label: 'VK', bg: '#0077FF', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
      <path d="M12.5 18.7c-6.4 0-9.6-4.4-9.7-11.7H6c.1 5.4 2.4 7.6 4.4 8V7h3v4.6c1.9-.2 3.9-2.4 4.6-4.6h3a8.4 8.4 0 01-3.9 5.5c1.9 1.1 4.1 3.1 4.9 5.5h-3.3c-.7-2-2.5-3.6-4.6-3.8v3.8h-.4z"/>
    </svg>
  )},
  wa: { label: 'WhatsApp', bg: '#25D366', icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.7-1.4-1.7-1.6-1.9-.2-.3 0-.4.1-.5.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2A10 10 0 002 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2A10 10 0 0012 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1115 0c0 4.5-3.7 8.2-8 8.2z"/>
    </svg>
  )},
};

function ShareChip({ network, onClick }) {
  const meta = SHARE_META[network];
  return (
    <button
      className="rp-share"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20,
        background: meta.bg, color: '#fff', border: 'none', cursor: 'pointer',
        fontSize: '0.78rem', fontWeight: 600,
        boxShadow: `0 3px 10px ${meta.bg}40`,
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
    >
      {meta.icon}
      {meta.label}
    </button>
  );
}

const pageHeaderWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  padding: '26px 28px 24px', marginBottom: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const pageHeaderBlur1 = {
  position: 'absolute', top: -50, right: -30, width: 180, height: 180,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}24 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 6s ease-in-out infinite',
};
const pageHeaderBlur2 = {
  position: 'absolute', bottom: -70, left: -50, width: 200, height: 200,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}1c 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
};
const pageHeaderRow = {
  position: 'relative', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', gap: 16, flexWrap: 'wrap',
};
const eyebrowStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: '0.72rem', fontWeight: 600, color: MUTED,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
};
const pageTitleStyle = {
  margin: 0, fontSize: 'clamp(1.6rem, 2.4vw, 2rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.05,
};
const pageSubStyle = {
  margin: '8px 0 0', fontSize: '0.92rem', color: MUTED,
  lineHeight: 1.5, maxWidth: 540,
};
const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};

function EmptyReferrals() {
  return (
    <div
      style={{
        ...cardBase,
        padding: '56px 32px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        animation: 'dashFadeUp 0.4s ease 0.1s both',
      }}
    >
      <div aria-hidden style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 26px' }}>
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${ACCENT}45`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="4" />
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
            <circle cx="17" cy="6" r="3" />
            <path d="M14.5 14.5l3 3" />
            <circle cx="20" cy="17" r="3" />
          </svg>
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.25rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>+</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Создайте первую реферальную ссылку
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 420, lineHeight: 1.55,
      }}>
        Делитесь ссылкой в соцсетях и чатах — получайте процент с каждой подписки реферала.
      </p>
    </div>
  );
}
