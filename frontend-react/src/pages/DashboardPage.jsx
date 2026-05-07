import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useChannels } from '../contexts/ChannelContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { channels, loadChannels, selectChannel, currentChannel } = useChannels();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [, setAddPlatform] = useState('max');
  const [unclaimedChannels, setUnclaimedChannels] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [bonusBusyKey, setBonusBusyKey] = useState(null);
  const pollRef = useRef(null);
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const maxBotName = import.meta.env.VITE_MAX_BOT_NAME || 'PKMarketing';

  const { overlay: pageTour } = usePageOnboarding('dashboard', [
    { selector: '[data-tour-page="dash-add-channel"]', title: 'Подключение канала', text: 'Добавьте канал MAX как администратора бота PKMarketing — он появится здесь автоматически.', placement: 'bottom' },
    { selector: '[data-tour-page="dash-stats"]', title: 'Статистика', text: 'Данные обновляются каждые 30 сек.', placement: 'bottom' },
  ]);

  const loadStats = useCallback(async () => {
    try {
      const tc = currentChannel?.tracking_code;
      const url = tc ? `/dashboard?tc=${tc}` : '/dashboard';
      const data = await api.get(url);
      if (data.success) setStats(data);
    } catch {}
  }, [currentChannel]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const loadUnclaimedChannels = useCallback(async () => {
    try {
      const data = await api.get('/channels/unclaimed/list');
      if (data.success) setUnclaimedChannels(data.channels || []);
    } catch {}
  }, []);

  const loadBonuses = useCallback(async () => {
    try {
      const data = await api.get('/dashboard/subscription-bonuses');
      if (data.success) setBonuses(data.bonuses || []);
    } catch {}
  }, []);

  useEffect(() => { loadBonuses(); }, [loadBonuses]);

  const claimBonus = async (b) => {
    setBonusBusyKey(b.key);
    try {
      const data = await api.post(`/dashboard/subscription-bonuses/${b.key}/claim`);
      if (data.success) {
        showToast(data.already_claimed ? 'Бонус уже получен' : `+${b.ai_tokens} ИИ-токенов начислено`, 'success');
        loadBonuses();
      } else {
        showToast(data.error || 'Не удалось проверить подписку', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Подписка не найдена', 'error');
    } finally {
      setBonusBusyKey(null);
    }
  };

  const claimChannel = async (trackingCode) => {
    try {
      const data = await api.post(`/channels/${trackingCode}/claim`);
      if (data.success) {
        showToast('Канал привязан к вашему аккаунту');
        loadChannels();
        loadUnclaimedChannels();
      } else showToast(data.error || 'Ошибка привязки', 'error');
    } catch { showToast('Ошибка привязки канала', 'error'); }
  };

  const openAddModal = useCallback(async () => {
    const defaultPlatform = (user?.max_user_id && !user?.telegram_id) ? 'max' : 'telegram';
    setAddPlatform(defaultPlatform);
    setShowAddModal(true);
    try { await api.post('/channels/scan'); } catch {}
    loadUnclaimedChannels();
    loadChannels(true);
  }, [user, loadUnclaimedChannels, loadChannels]);

  useEffect(() => {
    if (showAddModal) {
      pollRef.current = setInterval(async () => {
        try { await api.post('/channels/scan'); } catch {}
        loadUnclaimedChannels();
        loadChannels(true);
      }, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [showAddModal, loadUnclaimedChannels, loadChannels]);

  const handleDeleteChannel = async (trackingCode) => {
    if (!window.confirm('Удалить канал? Все данные будут потеряны.')) return;
    try {
      const data = await api.delete(`/channels/${trackingCode}`);
      if (data.success) { showToast('Канал удалён'); loadChannels(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  // Smart context — что показать в hero
  const noChannels = channels.length === 0;
  const hasInactive = channels.some(c => !c.billing_active && c.is_active);
  const heroSub = noChannels
    ? 'Подключите первый канал и начнём настраивать вашу маркетинговую воронку.'
    : hasInactive
      ? 'У некоторых каналов нет активной подписки. Активируйте, чтобы открыть все функции.'
      : 'Всё работает. Загляните в графики или запустите новую кампанию.';

  return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      {pageTour}

      {/* HERO — приветствие + контекст + быстрый старт */}
      <section className="dash-hero" style={heroWrap}>
        <div className="dash-hero-blob" style={heroBlur1} />
        <div className="dash-hero-blob" style={heroBlur2} />
        <div style={heroGrid}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="dash-hero-eyebrow" style={heroEyebrow}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS, boxShadow: `0 0 8px ${SUCCESS}` }} />
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="dash-hero-title" style={heroTitle}>
              Привет, {user?.first_name || 'друг'}
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>!</span>
            </h1>
            <p className="dash-hero-sub" style={heroSubtitle}>{heroSub}</p>
            <div className="dash-hero-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
              <button data-tour-page="dash-add-channel" className="dash-hero-cta" onClick={openAddModal} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 20px', borderRadius: 10,
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: '#fff', border: 'none',
                fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                boxShadow: `0 4px 14px ${ACCENT}40`, transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${ACCENT}55`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Добавить канал
              </button>
              {!noChannels && (
                <button className="dash-hero-cta" onClick={() => navigate('/achievements')} style={ghostBtn}>🏆 Достижения канала</button>
              )}
            </div>
          </div>

          {/* Hero gauge — quick metric */}
          {!noChannels && stats && (
            <div className="dash-hero-sidecard" style={heroSidecard}>
              <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                Каналов
              </div>
              <div className="dash-hero-sidecard-value" style={{ fontSize: '2.6rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {channels.length}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: '0.78rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                <span style={{ color: MUTED }}>{channels.filter(c => c.billing_active).length} с активной подпиской</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* METRICS — большие карточки */}
      {stats && !noChannels && (
        <section data-tour-page="dash-stats" style={{ marginBottom: 28 }}>
          <SectionHeader title="Статистика" subtitle="Обновляется каждые 30 секунд" />
          <div style={metricGrid}>
            <MetricCard
              label="Визиты" value={stats.visits ?? 0}
              icon={<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z"/>}
              color={ACCENT} delay="0.05s"
              onClick={() => navigate('/links')}
            />
            <MetricCard
              label="Подписки" value={stats.subscribers ?? 0}
              icon={<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M22 11l-2 2-3-3"/>}
              color={SUCCESS} delay="0.1s"
              onClick={() => navigate('/links')}
            />
            <MetricCard
              label="Лиды" value={stats.leads ?? 0}
              icon={<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>}
              color={ACCENT2} delay="0.15s"
              onClick={() => navigate('/pins')}
            />
            <MetricCard
              label="Публикации" value={stats.scheduledPosts ?? 0}
              icon={<path d="M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>}
              color={WARNING} delay="0.2s"
              onClick={() => navigate('/content')}
            />
          </div>
        </section>
      )}

      {/* SUBSCRIPTION BONUSES — +N ИИ-токенов за подписку на канал */}
      {bonuses.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionHeader title="Бонусы за подписку" subtitle="Подпишитесь на каналы и получите ИИ-токены" />
          <div style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {bonuses.map((b, i) => (
              <div
                key={b.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: 14, borderRadius: 14,
                  background: '#fff',
                  border: `1px solid ${ACCENT2}25`,
                  boxShadow: `0 2px 10px ${ACCENT2}10`,
                  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12,
                  background: b.avatar_url
                    ? `url(${b.avatar_url}) center/cover`
                    : `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '1.1rem',
                  boxShadow: `0 3px 10px ${ACCENT2}30`,
                }}>
                  {!b.avatar_url && (b.title || '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: DARK, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.title}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                    fontSize: '0.78rem', fontWeight: 700, color: ACCENT2,
                    background: `${ACCENT2}10`, padding: '2px 8px', borderRadius: 12,
                  }}>
                    +{b.ai_tokens} ИИ-токенов
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <a href={b.url} target="_blank" rel="noreferrer"
                    style={{
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '7px 14px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
                      color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                      boxShadow: `0 2px 8px ${ACCENT}30`,
                    }}>
                    Подписаться
                  </a>
                  <button
                    onClick={() => claimBonus(b)}
                    disabled={bonusBusyKey === b.key}
                    style={{
                      padding: '6px 12px', borderRadius: 10, fontSize: '0.74rem', fontWeight: 600,
                      cursor: bonusBusyKey === b.key ? 'wait' : 'pointer',
                      background: '#fff', color: ACCENT2,
                      border: `1px solid ${ACCENT2}40`,
                      opacity: bonusBusyKey === b.key ? 0.6 : 1,
                    }}>
                    {bonusBusyKey === b.key ? 'Проверяем…' : 'Я подписался'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CHANNELS — список каналов */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <SectionHeader
            title="Ваши каналы"
            subtitle={noChannels ? 'Добавьте первый, чтобы начать' : `Всего: ${channels.length}`}
            inline
          />
          {!noChannels && (
            <button onClick={openAddModal} style={ghostBtn}>+ Канал</button>
          )}
        </div>

        {noChannels ? (
          <EmptyState onAdd={openAddModal} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {channels.map((ch, i) => (
              <div key={ch.tracking_code} style={{ animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` }}>
                <ChannelCard
                  channel={ch}
                  isSelected={currentChannel?.tracking_code === ch.tracking_code}
                  onSelect={() => selectChannel(ch)}
                  onDelete={() => handleDeleteChannel(ch.tracking_code)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* QUICK ACTIONS — что делать дальше */}
      {!noChannels && (
        <section style={{ marginBottom: 28 }}>
          <SectionHeader title="Что дальше?" subtitle="Быстрый запуск ключевых функций" />
          <div style={quickGrid}>
            <QuickAction
              title="ИИ Оформление" desc="Сгенерируйте аватар, описание и лид-магнит за 2 минуты."
              accent={ACCENT2} icon={<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>}
              onClick={() => navigate('/ai-design')} delay="0.1s"
            />
            <QuickAction
              title="Создать ссылку" desc="UTM, ИИ-лендинг, лид-магнит — выбирайте под задачу."
              accent={ACCENT} icon={<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>}
              onClick={() => navigate('/links')} delay="0.15s"
            />
            <QuickAction
              title="Запустить рассылку" desc="Личное сообщение каждому подписчику с таргетингом."
              accent={SUCCESS} icon={<path d="M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z"/>}
              onClick={() => navigate('/broadcasts')} delay="0.2s"
            />
            <QuickAction
              title="Запись на услуги" desc="Онлайн-запись клиентов через MiniApp в MAX."
              accent="#06b6d4" icon={<path d="M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01"/>}
              onClick={() => navigate('/services')} delay="0.25s"
            />
          </div>
        </section>
      )}

      {/* ADD CHANNEL MODAL */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Добавить канал">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 10 }}>
            <h4 style={{ marginBottom: 8, fontSize: '0.95rem' }}>Добавьте бота в канал</h4>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem', color: '#333' }}>
              <li>Добавьте бота в подписчики канала:
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <code style={codePill} onClick={() => { navigator.clipboard.writeText(`@${maxBotUsername}`); showToast('Скопировано'); }}>@{maxBotUsername}</code>
                  <span style={{ fontSize: '0.78rem', color: MUTED, alignSelf: 'center' }}>или</span>
                  <code style={codePill} onClick={() => { navigator.clipboard.writeText(maxBotName); showToast('Скопировано'); }}>{maxBotName}</code>
                </div>
              </li>
              <li>Откройте канал → <b>Настройки</b> → <b>Администраторы</b> → назначьте бота администратором</li>
              <li>Канал появится автоматически в списке</li>
            </ol>
            {!user?.max_user_id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed #e5e7eb` }}>
                <p style={{ marginBottom: 10, color: MUTED, fontSize: '0.82rem', lineHeight: 1.5 }}>
                  Не привязали MAX к аккаунту? Откройте бота — он пришлёт ссылку для входа.
                </p>
                <a href={`https://max.ru/${maxBotUsername}?start=auth`} target="_blank" rel="noreferrer"
                  className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, background: ACCENT2 }}>
                  💬 Открыть бота в MAX
                </a>
              </div>
            )}
          </div>

          {unclaimedChannels.length > 0 && (
            <div style={{ padding: 14, background: `${ACCENT}08`, border: `1px solid ${ACCENT}30`, borderRadius: 10 }}>
              <h4 style={{ marginBottom: 10, fontSize: '0.9rem', color: ACCENT }}>Обнаруженные каналы</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unclaimedChannels.map(ch => (
                  <div key={ch.tracking_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ch.platform === 'max' ? '💬' : '📱'} {ch.title}</div>
                      <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: 2 }}>Код: {ch.tracking_code}</div>
                    </div>
                    <button className="btn btn-primary" style={{ padding: '5px 14px', fontSize: '0.82rem' }} onClick={() => claimChannel(ch.tracking_code)}>
                      Привязать
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Закрыть</button>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -12px); } }
        .dash-hero-title { overflow-wrap: break-word; word-break: break-word; }
        @media (max-width: 768px) {
          .dash-hero { padding: 22px 20px 20px !important; margin-bottom: 20px !important; }
          .dash-hero-title { font-size: 1.7rem !important; }
          .dash-hero-sub { font-size: 0.88rem !important; margin-top: 8px !important; }
          .dash-hero-eyebrow { font-size: 0.7rem !important; margin-bottom: 10px !important; }
          .dash-hero-actions { margin-top: 16px !important; }
          .dash-hero-sidecard { padding: 14px 18px !important; min-width: 0 !important; width: 100%; }
          .dash-hero-sidecard-value { font-size: 2rem !important; }
        }
        @media (max-width: 480px) {
          .dash-hero { padding: 16px !important; margin-bottom: 16px !important; border-radius: 14px !important; }
          .dash-hero-title { font-size: 1.3rem !important; line-height: 1.15 !important; }
          .dash-hero-sub { font-size: 0.82rem !important; margin-top: 6px !important; }
          .dash-hero-eyebrow { font-size: 0.66rem !important; margin-bottom: 8px !important; }
          .dash-hero-actions { margin-top: 14px !important; gap: 8px !important; flex-direction: column !important; align-items: stretch !important; }
          .dash-hero-cta { width: 100% !important; padding: 11px 16px !important; font-size: 0.85rem !important; }
          .dash-hero-blob { display: none !important; }
          .dash-hero-sidecard { padding: 12px 14px !important; }
          .dash-hero-sidecard-value { font-size: 1.7rem !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function SectionHeader({ title, subtitle, inline }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 14 }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: DARK, letterSpacing: '-0.02em' }}>{title}</h2>
      {subtitle && <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

function MetricCard({ label, value, icon, color, delay, onClick }) {
  return (
    <div onClick={onClick} className="metric-card-poster"
      style={{
        background: '#fff', borderRadius: 14, padding: 18, cursor: onClick ? 'pointer' : 'default',
        border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        position: 'relative', overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
        animation: `dashFadeUp 0.4s ease ${delay} both`,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = `${color}40`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#f0f0f0'; }}
    >
      <div style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 10, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div style={{ fontSize: '0.72rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
        {(value || 0).toLocaleString('ru-RU')}
      </div>
    </div>
  );
}

function QuickAction({ title, desc, accent, icon, onClick, delay }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
        padding: '18px 18px 16px', textAlign: 'left', cursor: 'pointer',
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
        animation: `dashFadeUp 0.4s ease ${delay} both`,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${accent}22`; e.currentTarget.style.borderColor = `${accent}50`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#f0f0f0'; }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px ${accent}30` }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.45, fontWeight: 400 }}>{desc}</div>
      <div style={{ marginTop: 'auto', fontSize: '0.78rem', color: accent, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        Открыть →
      </div>
    </button>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '56px 24px',
      border: '1px solid #f0f0f0', textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      {/* Декоративный CSS-«канал» */}
      <div aria-hidden style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 24px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, animation: 'heroBlobFloat 4s ease-in-out infinite', opacity: 0.95 }} />
        <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l18-5v12L3 14v-3z M11.6 16.8a3 3 0 11-5.8-1.6"/>
          </svg>
        </div>
        <div style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: SUCCESS, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, boxShadow: `0 4px 10px ${SUCCESS}50` }}>
          +
        </div>
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700, color: DARK, letterSpacing: '-0.02em' }}>
        Подключите первый канал
      </h3>
      <p style={{ color: MUTED, fontSize: '0.92rem', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.5 }}>
        Добавьте бота администратором канала MAX — мы сразу подхватим его и откроем все маркетинговые инструменты.
      </p>
      <button onClick={onAdd} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10,
        background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: '#fff', border: 'none',
        fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
        boxShadow: `0 4px 14px ${ACCENT}40`, transition: 'transform 0.15s, box-shadow 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${ACCENT}55`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Добавить канал
      </button>
    </div>
  );
}

function ChannelCard({ channel, isSelected, onSelect, onDelete }) {
  const ch = channel;
  const isDisconnected = ch.is_active === 0 || ch.is_active === false;
  const tgBotUsername = import.meta.env.VITE_TG_BOT_USERNAME || 'PKAds_bot';
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const maxBotName = import.meta.env.VITE_MAX_BOT_NAME || 'PKMarketing';
  const platformColor = ch.platform === 'max' ? ACCENT2 : '#2AABEE';
  const firstLetter = (ch.title || ch.channel_id || 'C')[0].toUpperCase();

  const channelLink = ch.platform === 'max'
    ? (ch.join_link || '')
    : (ch.join_link || (ch.username ? `t.me/${ch.username}` : ''));

  return (
    <div
      style={{
        background: '#fff',
        border: isDisconnected ? `1px solid ${DANGER}40` : isSelected ? `1.5px solid ${ACCENT}` : '1px solid #f0f0f0',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: !isDisconnected ? 'pointer' : 'default',
        opacity: isDisconnected ? 0.85 : 1,
        display: 'flex', width: '100%', boxSizing: 'border-box',
        alignItems: 'center', gap: 14,
        boxShadow: isSelected ? `0 4px 16px ${ACCENT}25` : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      onClick={!isDisconnected ? onSelect : undefined}
      onMouseEnter={e => { if (!isDisconnected && !isSelected) { e.currentTarget.style.borderColor = `${ACCENT}30`; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; } }}
      onMouseLeave={e => { if (!isDisconnected && !isSelected) { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; } }}
    >
      {ch.avatar_url ? (
        <img src={ch.avatar_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, ${platformColor}, ${platformColor}cc)`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.05rem', fontWeight: 700, boxShadow: `0 2px 8px ${platformColor}40`,
        }}>{firstLetter}</div>
      )}

      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ch.title || ch.channel_id || ch.tracking_code}
          </span>
          {isSelected && <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20, background: ACCENT, color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>АКТИВНЫЙ</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {channelLink && (
            <button style={{
              border: `1px solid ${ACCENT}40`, background: `${ACCENT}08`,
              cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', color: ACCENT,
              fontWeight: 600, borderRadius: 6,
            }} onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(channelLink);
              const btn = e.currentTarget; const orig = btn.textContent;
              btn.textContent = '✓ Скопировано'; btn.style.background = ACCENT; btn.style.color = '#fff';
              setTimeout(() => { btn.textContent = orig; btn.style.background = `${ACCENT}08`; btn.style.color = ACCENT; }, 1500);
            }}>Копировать ссылку</button>
          )}
          {isDisconnected ? (
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${DANGER}15`, color: DANGER }}>● Отключен</span>
          ) : ch.billing_active !== undefined && (
            ch.billing_active ? (
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: `${SUCCESS}15`, color: SUCCESS, fontWeight: 600 }}>● Активна · {ch.billing_days_left} дн.</span>
            ) : (
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: `${WARNING}15`, color: WARNING, fontWeight: 600 }}>● Нет подписки</span>
            )
          )}
        </div>
        {isDisconnected && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: '0.78rem', color: MUTED, margin: '0 0 6px', lineHeight: 1.5 }}>
              1. Добавьте бота:{' '}
              <b style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ch.platform === 'max' ? `@${maxBotUsername}` : `@${tgBotUsername}`); }}>
                {ch.platform === 'max' ? `@${maxBotUsername}` : `@${tgBotUsername}`}
              </b>
              {ch.platform === 'max' && <> или <code style={codePill} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(maxBotName); }}>{maxBotName}</code></>}
              <br />2. Канал → Настройки → Администраторы → назначьте бота
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ch.join_link && <a href={ch.join_link} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={(e) => e.stopPropagation()}>Открыть канал</a>}
              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>Удалить</button>
            </div>
          </div>
        )}
      </div>

      {!isDisconnected && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button title="Удалить" style={{ ...iconBtn, color: DANGER }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Style tokens ─────────────────────────────────────────────────────

const heroWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
  padding: '32px 32px 28px', marginBottom: 28,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const heroBlur1 = {
  position: 'absolute', top: -60, right: -40, width: 220, height: 220,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}28 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 6s ease-in-out infinite',
};
const heroBlur2 = {
  position: 'absolute', bottom: -80, left: -60, width: 240, height: 240,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}20 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
};
const heroGrid = {
  position: 'relative', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', gap: 24, flexWrap: 'wrap',
};
const heroEyebrow = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: '0.74rem', fontWeight: 600, color: MUTED,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12,
};
const heroTitle = {
  margin: 0, fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.05,
};
const heroSubtitle = {
  margin: '10px 0 0', fontSize: '0.95rem', color: MUTED,
  lineHeight: 1.5, maxWidth: 520,
};
const heroSidecard = {
  background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
  border: `1px solid ${ACCENT}25`, borderRadius: 12,
  padding: '20px 24px', minWidth: 200,
};
const ghostBtn = {
  padding: '9px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600,
  background: '#fff', border: '1px solid #e5e7eb', color: DARK, cursor: 'pointer',
  transition: 'border-color 0.15s, color 0.15s, transform 0.15s',
};
const metricGrid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14,
};
const quickGrid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
};
const codePill = {
  cursor: 'pointer', padding: '3px 10px', background: '#fff',
  border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.75rem',
  fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all',
};
const iconBtn = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid #f0f0f0',
  background: '#fff', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: MUTED,
  transition: 'border-color 0.15s, color 0.15s, background 0.15s',
};
