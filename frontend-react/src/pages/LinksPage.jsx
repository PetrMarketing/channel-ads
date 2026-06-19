import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { usePageOnboarding } from '../components/OnboardingTour';

const APP_URL = window.location.origin;
const MAX_BOT_FALLBACK = 'id575307462228_bot';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const TYPE_META = {
  landing:    { icon: '📄', label: 'Лендинг',    grad: [ACCENT, ACCENT2],    soft: 'rgba(67,97,238,0.10)',  text: ACCENT,  desc: 'Страница подписки + Метрика' },
  direct:     { icon: '🔗', label: 'Прямая',     grad: ['#3b82f6', '#06b6d4'], soft: 'rgba(59,130,246,0.10)', text: '#3b82f6', desc: 'Переход в канал' },
  lm_landing: { icon: '🎁', label: 'Лид-магнит', grad: [SUCCESS, '#34d399'],   soft: 'rgba(16,185,129,0.10)', text: SUCCESS,   desc: 'Подарок + подписка' },
  ai_landing: { icon: '🌐', label: 'ИИ Лендинг', grad: [ACCENT2, '#a855f7'],   soft: 'rgba(123,104,238,0.10)', text: ACCENT2,  desc: 'Генерация страницы ИИ' },
};

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
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

const hintStyle = { fontSize: '0.74rem', color: MUTED, marginTop: 4, lineHeight: 1.45 };

const linkAnimStyle = (i) => ({
  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const codePillStyle = (color) => ({
  display: 'inline-block',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.78rem',
  padding: '6px 12px',
  borderRadius: 8,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color,
  cursor: 'pointer',
  transition: 'all .15s ease',
  wordBreak: 'break-all',
  maxWidth: '100%',
});

const smallCodePillStyle = {
  display: 'inline-block',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.72rem',
  padding: '4px 10px',
  borderRadius: 6,
  background: '#fff',
  border: `1px solid ${BORDER}`,
  color: ACCENT2,
  cursor: 'pointer',
  wordBreak: 'break-all',
  transition: 'all .15s ease',
};

const infoBanner = (tint, border) => ({
  padding: 14, borderRadius: 12,
  background: tint, border: `1px solid ${border}`,
});

export default function LinksPage() {
  const navigate = useNavigate();
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showMetrikaModal, setShowMetrikaModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [metrikaLink, setMetrikaLink] = useState(null);
  const [metrikaForm, setMetrikaForm] = useState({ ym_counter_id: '', ym_goal_name: '', vk_pixel_id: '', vk_goal_name: '' });
  const [form, setForm] = useState({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', lm_title: '', lm_description: '', lm_description_align: 'left', lm_button_text: 'Получить бесплатно', lm_lead_magnet_id: '' });
  const [saving, setSaving] = useState(false);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [lmImageFile, setLmImageFile] = useState(null);
  const [aiLandings, setAiLandings] = useState([]);
  const [expandedStats, setExpandedStats] = useState({});
  const [dailyStats, setDailyStats] = useState({});

  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('links', [
    { selector: '[data-tour-page="links-create"]', title: 'Создание ссылки', text: 'Нажмите эту кнопку, чтобы создать новую трекинг-ссылку. Выберите тип: Лендинг, Прямая, Лид-магнит или ИИ Лендинг.', placement: 'bottom' },
  ]);

  const loadLinks = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/links/${tc}`);
      if (data.success) setLinks(data.links || []);
    } catch {
      showToast('Ошибка загрузки ссылок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => {
    if (!tc) return;
    api.get(`/pins/${tc}/lead-magnets`).then(d => { if (d.success) setLeadMagnets(d.lead_magnets || d.leadMagnets || []); }).catch(() => {});
    api.get(`/ai-landing/${tc}/landings`).then(d => { if (d.success) setAiLandings((d.landings || []).filter(l => l.status === 'generated' || l.status === 'published')); }).catch(() => {});
  }, [tc]);

  const openCreate = () => {
    setEditingLink(null);
    setLmImageFile(null);
    setForm({ name: '', link_type: 'landing', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', lm_title: '', lm_description: '', lm_description_align: 'left', lm_button_text: 'Получить бесплатно', lm_lead_magnet_id: '' });
    setShowModal(true);
  };

  const openEdit = (link) => {
    setEditingLink(link);
    setForm({
      name: link.name || '',
      link_type: link.link_type || 'landing',
      utm_source: link.utm_source || '',
      utm_medium: link.utm_medium || '',
      utm_campaign: link.utm_campaign || '',
      utm_content: link.utm_content || '',
      utm_term: link.utm_term || '',
      lm_title: link.lm_title || '',
      lm_description: link.lm_description || '',
      lm_description_align: link.lm_description_align || 'left',
      lm_button_text: link.lm_button_text || 'Получить бесплатно',
      lm_lead_magnet_id: link.lm_lead_magnet_id || '',
    });
    setShowModal(true);
  };

  const openMetrika = (link) => {
    setMetrikaLink(link);
    setMetrikaForm({
      ym_counter_id: link.ym_counter_id || currentChannel?.yandex_metrika_id || '',
      ym_goal_name: link.ym_goal_name || 'subscribe_channel',
      vk_pixel_id: link.vk_pixel_id || currentChannel?.vk_pixel_id || '',
      vk_goal_name: link.vk_goal_name || 'subscribe_channel',
    });
    setShowMetrikaModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Введите название ссылки', 'error');
      return;
    }
    setSaving(true);
    try {
      let data;
      const cleanForm = { ...form };
      if (editingLink) {
        data = await api.put(`/links/${tc}/${editingLink.id}`, cleanForm);
      } else {
        data = await api.post(`/links/${tc}`, cleanForm);
      }
      if (data.success) {
        const linkId = data.link?.id || editingLink?.id;
        if (lmImageFile && linkId) {
          try {
            const fd = new FormData(); fd.append('file', lmImageFile);
            await api.upload(`/links/${tc}/${linkId}/lm-image`, fd);
          } catch {}
          setLmImageFile(null);
        }
        showToast(editingLink ? 'Ссылка обновлена' : 'Ссылка создана');
        setShowModal(false);
        loadLinks();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetrika = async () => {
    if (!metrikaLink) return;
    setSaving(true);
    try {
      const data = await api.put(`/links/${tc}/${metrikaLink.id}/metrika`, metrikaForm);
      if (data.success) {
        showToast('Метрика обновлена');
        setShowMetrikaModal(false);
        loadLinks();
      }
    } catch {
      showToast('Ошибка сохранения метрики', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Channel-level метрика (YM + VK pixel) ───
  // Используется как fallback для всех ссылок этого канала
  const [channelMetrika, setChannelMetrika] = useState({
    yandex_metrika_id: '',
    vk_pixel_id: '',
  });
  const [savingChannelMetrika, setSavingChannelMetrika] = useState(false);
  const [showChannelMetrika, setShowChannelMetrika] = useState(false);

  useEffect(() => {
    setChannelMetrika({
      yandex_metrika_id: currentChannel?.yandex_metrika_id || '',
      vk_pixel_id: currentChannel?.vk_pixel_id || '',
    });
  }, [currentChannel?.id, currentChannel?.yandex_metrika_id, currentChannel?.vk_pixel_id]);

  const saveChannelMetrika = async () => {
    if (!tc) return;
    setSavingChannelMetrika(true);
    try {
      const data = await api.put(`/channels/${tc}`, {
        yandex_metrika_id: channelMetrika.yandex_metrika_id || '',
        vk_pixel_id: channelMetrika.vk_pixel_id || '',
      });
      if (data?.success) {
        showToast('Сохранено');
        if (currentChannel) {
          currentChannel.yandex_metrika_id = channelMetrika.yandex_metrika_id || '';
          currentChannel.vk_pixel_id = channelMetrika.vk_pixel_id || '';
        }
      }
    } catch (e) {
      showToast(e.message || 'Ошибка сохранения', 'error');
    } finally {
      setSavingChannelMetrika(false);
    }
  };

  const handleTogglePause = async (link) => {
    try {
      const data = await api.patch(`/links/${tc}/${link.id}/pause`);
      if (data.success) {
        showToast(data.is_paused ? 'Ссылка приостановлена' : 'Ссылка активирована');
        loadLinks();
      }
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить ссылку?')) return;
    try {
      const data = await api.delete(`/links/${tc}/${id}`);
      if (data.success) {
        showToast('Ссылка удалена');
        loadLinks();
      }
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  const copyLink = (shortCode) => {
    const url = `${APP_URL}/go/${shortCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Ссылка скопирована');
    }).catch(() => {
      showToast('Не удалось скопировать', 'error');
    });
  };

  const toggleDailyStats = async (link) => {
    const isOpen = expandedStats[link.id];
    setExpandedStats(p => ({ ...p, [link.id]: !isOpen }));
    if (!isOpen && !dailyStats[link.id]) {
      try {
        const data = await api.get(`/links/${tc}/${link.id}/daily-stats`);
        if (data.success) setDailyStats(p => ({ ...p, [link.id]: data.days || [] }));
      } catch {}
    }
  };

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .lp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .lp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .lp-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .lp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .lp-input:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .lp-typecard {
          flex: 1; min-width: 140px;
          display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
          padding: 14px 14px 16px; border-radius: 14px; cursor: pointer;
          border: 1.5px solid ${BORDER}; background: #fff;
          transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
          text-align: left;
        }
        .lp-typecard:hover { border-color: ${ACCENT}55; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
        .lp-typecard.active {
          border-color: ${ACCENT};
          background: linear-gradient(135deg, ${ACCENT}08, ${ACCENT2}08);
          box-shadow: 0 4px 14px ${ACCENT}1f;
          transform: translateY(-1px);
        }
        .lp-code:hover { background: ${ACCENT}10 !important; border-color: ${ACCENT}40 !important; color: ${ACCENT} !important; }
        .lp-code-alt:hover { background: ${ACCENT2}10 !important; border-color: ${ACCENT2}40 !important; }
        .lp-chartnav:hover { background: ${ACCENT}08 !important; border-color: ${ACCENT}40 !important; color: ${ACCENT} !important; }
        .lp-toggle-stats:hover { color: ${ACCENT2} !important; }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Аналитика трафика
              </div>
              <h1 style={pageTitleStyle}>
                Трекинг-ссылки
              </h1>
              <p style={pageSubStyle}>
                Управление ссылками с UTM-метками и сквозной аналитикой
              </p>
            </div>
            <button
              data-tour-page="links-create"
              className="lp-primary"
              style={primaryBtn}
              onClick={openCreate}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Создать ссылку
            </button>
          </div>
        </section>

        {/* Channel-level метрика — общий счётчик для всех ссылок канала */}
        <section style={{
          background: '#fff', borderRadius: 16,
          border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
               onClick={() => setShowChannelMetrika(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: DARK }}>
                📊 Метрика канала
              </span>
              {(currentChannel?.yandex_metrika_id || currentChannel?.vk_pixel_id) ? (
                <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>настроена</span>
              ) : (
                <span style={pill('rgba(245,158,11,0.12)', WARNING)}>не настроена · конверсии не отслеживаются</span>
              )}
            </div>
            <span style={{ fontSize: '1.2rem', color: MUTED }}>{showChannelMetrika ? '▴' : '▾'}</span>
          </div>
          {showChannelMetrika && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: MUTED, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Yandex Metrika ID
                </label>
                <input className="lp-input" style={inputStyle} placeholder="12345678"
                  value={channelMetrika.yandex_metrika_id}
                  onChange={e => setChannelMetrika(p => ({ ...p, yandex_metrika_id: e.target.value.trim() }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: MUTED, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  VK Pixel ID
                </label>
                <input className="lp-input" style={inputStyle} placeholder="3751584"
                  value={channelMetrika.vk_pixel_id}
                  onChange={e => setChannelMetrika(p => ({ ...p, vk_pixel_id: e.target.value.trim() }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.78rem', color: MUTED }}>
                  Эти счётчики применяются ко всем ссылкам канала. Можно переопределить в настройках конкретной ссылки.
                  Цель по умолчанию: <code>subscribe_channel</code>.
                </span>
                <button className="lp-primary" style={{ ...primaryBtn, padding: '8px 16px' }}
                  onClick={saveChannelMetrika} disabled={savingChannelMetrika}>
                  {savingChannelMetrika ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}
        </section>

        {loading ? <Loading /> : links.length === 0 && aiLandings.length === 0 ? (
          <EmptyLinks onCreate={openCreate} />
        ) : (
          <>
            {links.length > 0 && (
              <section style={{ marginBottom: aiLandings.length > 0 ? 32 : 8 }}>
                <div style={sectionHeaderRow}>
                  <div>
                    <h2 style={sectionTitleStyle}>Ссылки</h2>
                    <p style={sectionSubStyle}>Всего: {links.length}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {links.map((link, i) => {
                    const meta = TYPE_META[link.link_type] || TYPE_META.landing;
                    const isDirectMax = link.link_type === 'direct' && currentChannel?.platform === 'max';
                    const botName = import.meta.env.VITE_MAX_BOT_USERNAME || MAX_BOT_FALLBACK;
                    const goUrl = `${APP_URL}/go/${link.short_code}`;
                    const startappUrl = `https://max.ru/${botName}?startapp=go_${link.short_code}`;
                    // For direct MAX links use the deep-link as the primary
                    // displayed URL — gives full attribution. Otherwise keep
                    // the /go/ URL (used by /subscribe and /lm flows).
                    const url = isDirectMax ? startappUrl : goUrl;
                    const isExpanded = !!expandedStats[link.id];
                    return (
                      <div
                        key={link.id}
                        className="lp-card"
                        style={{
                          ...cardBase,
                          padding: 18,
                          opacity: link.is_paused ? 0.72 : 1,
                          ...linkAnimStyle(i),
                        }}
                      >
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{
                            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                            fontSize: '1.5rem',
                            boxShadow: `0 4px 12px ${meta.grad[0]}33`,
                            position: 'relative', overflow: 'hidden',
                          }}>
                            <div style={{
                              position: 'absolute', inset: 0,
                              backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.22), transparent 60%)',
                              pointerEvents: 'none',
                            }} />
                            <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>{meta.icon}</span>
                          </div>

                          <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                                {link.name || '—'}
                              </span>
                              <span style={pill(meta.soft, meta.text)}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                                {meta.label}
                              </span>
                              {link.is_paused && (
                                <span style={pill('rgba(230,57,70,0.10)', DANGER)}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: DANGER }} />
                                  Пауза
                                </span>
                              )}
                            </div>

                            <code
                              className="lp-code"
                              onClick={() => {
                                navigator.clipboard.writeText(url).then(
                                  () => showToast('Ссылка скопирована'),
                                  () => showToast('Не удалось скопировать', 'error'),
                                );
                              }}
                              title="Нажмите чтобы скопировать"
                              style={codePillStyle(ACCENT)}
                            >
                              {url}
                            </code>

                            {isDirectMax && (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <code
                                  className="lp-code-alt"
                                  onClick={() => { navigator.clipboard.writeText(goUrl); showToast('Универсальная ссылка скопирована'); }}
                                  title="Универсальная короткая ссылка (вне MAX)"
                                  style={smallCodePillStyle}
                                >
                                  Универсальная · {goUrl}
                                </code>
                                <code
                                  className="lp-code-alt"
                                  onClick={() => { navigator.clipboard.writeText(`https://max.ru/${botName}?start=go_${link.short_code}`); showToast('Бот-ссылка скопирована'); }}
                                  title="Бот-ссылка (старый формат)"
                                  style={smallCodePillStyle}
                                >
                                  Бот · max.ru/{botName}?start=go_{link.short_code}
                                </code>
                              </div>
                            )}

                            <div style={{
                              display: 'flex', gap: 14, marginTop: 12, alignItems: 'center',
                              fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                            }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 6px ${ACCENT2}80` }} />
                                Визиты <b style={{ color: DARK, fontWeight: 700, marginLeft: 2 }}>{(link.visit_count ?? 0).toLocaleString('ru-RU')}</b>
                              </span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: SUCCESS, boxShadow: `0 0 6px ${SUCCESS}80` }} />
                                Подписки <b style={{ color: DARK, fontWeight: 700, marginLeft: 2 }}>{(link.sub_count ?? 0).toLocaleString('ru-RU')}</b>
                              </span>
                              {link.utm_source && (
                                <span style={pill(SOFT_BG, MUTED)}>UTM · {link.utm_source}</span>
                              )}
                              {link.ym_counter_id && (
                                <span style={pill('rgba(245,158,11,0.10)', WARNING)}>YM · {link.ym_counter_id}</span>
                              )}
                              {link.vk_pixel_id && (
                                <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>VK · {link.vk_pixel_id}</span>
                              )}
                              <button
                                className="lp-toggle-stats"
                                onClick={() => toggleDailyStats(link)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                  fontSize: '0.78rem', color: ACCENT, fontWeight: 600,
                                  marginLeft: 'auto', transition: 'color .15s ease',
                                }}
                              >
                                {isExpanded ? 'Скрыть статистику ▲' : 'По дням ▼'}
                              </button>
                            </div>

                            {isExpanded && (
                              <div style={{
                                marginTop: 14, padding: 14,
                                background: SOFT_BG, borderRadius: 12,
                                border: `1px solid ${BORDER}`,
                                animation: 'dashFadeUp 0.3s ease both',
                              }}>
                                {!(dailyStats[link.id]?.length) ? (
                                  <span style={{ color: MUTED, fontSize: '0.82rem' }}>Нет данных за период</span>
                                ) : <DailyChart data={dailyStats[link.id]} />}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <button className="lp-ghost" style={iconGhostBtn} onClick={() => copyLink(link.short_code)} title="Копировать">⧉</button>
                            <button className="lp-ghost" style={iconGhostBtn} onClick={() => openEdit(link)} title="Редактировать">✎</button>
                            {(link.link_type === 'landing' || link.link_type === 'lm_landing') && (
                              <button className="lp-ghost" style={iconGhostBtn} onClick={() => openMetrika(link)} title="Пиксели">📊</button>
                            )}
                            <button className="lp-ghost" style={iconGhostBtn} onClick={() => handleTogglePause(link)} title={link.is_paused ? 'Включить' : 'Пауза'}>
                              {link.is_paused ? '▶' : '⏸'}
                            </button>
                            <button className="lp-danger" style={dangerGhost} onClick={() => handleDelete(link.id)} title="Удалить">🗑</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {aiLandings.length > 0 && (
              <section style={{ marginTop: links.length > 0 ? 0 : 8 }}>
                <div style={sectionHeaderRow}>
                  <div>
                    <h2 style={sectionTitleStyle}>ИИ Лендинги</h2>
                    <p style={sectionSubStyle}>Сгенерированные ИИ страницы под нишу канала</p>
                  </div>
                  <button className="lp-ghost" style={ghostBtn} onClick={() => navigate('/ai-landing')}>
                    Открыть редактор →
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {aiLandings.map((l, i) => {
                    const url = `${APP_URL}/land/${l.slug}`;
                    const meta = TYPE_META.ai_landing;
                    return (
                      <div
                        key={`ail_${l.id}`}
                        className="lp-card"
                        style={{ ...cardBase, padding: 18, ...linkAnimStyle(i) }}
                      >
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{
                            width: 64, height: 64, borderRadius: 14, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative', overflow: 'hidden',
                            background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                            boxShadow: `0 6px 18px ${meta.grad[0]}38`,
                          }}>
                            <div style={{
                              position: 'absolute', inset: 0,
                              backgroundImage: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.32), transparent 65%)',
                            }} />
                            <span style={{ fontSize: '1.85rem', position: 'relative', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.28))' }}>🌐</span>
                          </div>

                          <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                                {l.niche || 'ИИ Лендинг'}
                              </span>
                              <span style={pill(meta.soft, meta.text)}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                                ИИ Лендинг
                              </span>
                              <span style={pill(
                                l.published ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                                l.published ? SUCCESS : WARNING,
                              )}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.published ? SUCCESS : WARNING }} />
                                {l.published ? 'Опубликован' : 'Готов'}
                              </span>
                            </div>
                            <code
                              className="lp-code"
                              onClick={() => { navigator.clipboard.writeText(url); showToast('Ссылка скопирована'); }}
                              title="Нажмите чтобы скопировать"
                              style={codePillStyle(ACCENT2)}
                            >
                              {url}
                            </code>
                            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap' }}>
                              {l.design_style && (
                                <span style={pill(SOFT_BG, MUTED)}>Стиль · {l.design_style}</span>
                              )}
                              {l.created_at && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                                  {new Date(l.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="lp-ghost" style={ghostBtn}
                              onClick={() => { navigator.clipboard.writeText(url); showToast('Ссылка скопирована'); }}>
                              ⧉ Копировать
                            </button>
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="lp-ghost" style={{ ...ghostBtn, textDecoration: 'none' }}>
                              ↗ Открыть
                            </a>
                            <button className="lp-ghost" style={ghostBtn} onClick={() => navigate('/ai-landing')}>
                              ✎ Редактировать
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingLink ? 'Редактировать ссылку' : 'Создать ссылку'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Название ссылки *</label>
              <input className="lp-input" style={inputStyle} placeholder="Рекламный пост в канале" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <div style={hintStyle}>Внутреннее название — клиенты его не увидят.</div>
            </div>

            {!editingLink && (
              <div>
                <label style={labelStyle}>Тип ссылки</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['landing', 'direct', 'lm_landing'].map(v => {
                    const meta = TYPE_META[v];
                    const active = form.link_type === v;
                    return (
                      <label key={v} className={`lp-typecard${active ? ' active' : ''}`}>
                        <input type="radio" name="link_type" value={v} checked={active}
                          onChange={() => setForm(p => ({ ...p, link_type: v }))} style={{ display: 'none' }} />
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                          fontSize: '1.15rem',
                          boxShadow: `0 3px 10px ${meta.grad[0]}33`,
                        }}>{meta.icon}</div>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: DARK, letterSpacing: '-0.01em' }}>{meta.label}</span>
                        <span style={{ fontSize: '0.74rem', color: MUTED, lineHeight: 1.35 }}>{meta.desc}</span>
                      </label>
                    );
                  })}
                  <div className="lp-typecard" onClick={() => { setShowModal(false); navigate('/ai-landing'); }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${TYPE_META.ai_landing.grad[0]} 0%, ${TYPE_META.ai_landing.grad[1]} 100%)`,
                      fontSize: '1.15rem',
                      boxShadow: `0 3px 10px ${TYPE_META.ai_landing.grad[0]}33`,
                    }}>🌐</div>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: DARK, letterSpacing: '-0.01em' }}>ИИ Лендинг</span>
                    <span style={{ fontSize: '0.74rem', color: MUTED, lineHeight: 1.35 }}>{TYPE_META.ai_landing.desc}</span>
                  </div>
                </div>
              </div>
            )}

            {form.link_type === 'landing' && !editingLink && (
              <div style={infoBanner('rgba(67,97,238,0.04)', `${ACCENT}25`)}>
                <p style={{ fontSize: '0.82rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
                  Лендинг-ссылка откроет страницу подписки. Для отслеживания конверсий через Яндекс Метрику
                  укажите ID счётчика в настройках канала или на конкретной ссылке (кнопка «Пиксели»).
                </p>
              </div>
            )}

            {form.link_type === 'lm_landing' && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 14,
                padding: 16, borderRadius: 12,
                background: 'rgba(16,185,129,0.04)', border: `1px solid ${SUCCESS}25`,
              }}>
                <p style={{ fontSize: '0.82rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
                  Страница с описанием лид-магнита. После подписки на канал пользователь получает материал через бота.
                </p>
                <div>
                  <label style={labelStyle}>Изображение</label>
                  {(editingLink?.lm_image_url) && (
                    <img src={editingLink.lm_image_url} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8, border: `1px solid ${BORDER}` }} />
                  )}
                  {lmImageFile && (
                    <img src={URL.createObjectURL(lmImageFile)} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8, border: `1px solid ${BORDER}` }} />
                  )}
                  <input type="file" accept="image/*" className="lp-input" style={{ ...inputStyle, padding: 8 }}
                    onChange={e => setLmImageFile(e.target.files?.[0] || null)} />
                  <div style={hintStyle}>JPG, PNG, WebP. Отображается вверху страницы лид-магнита.</div>
                </div>
                <div>
                  <label style={labelStyle}>Заголовок</label>
                  <input className="lp-input" style={inputStyle} placeholder="Бесплатный гайд по маркетингу" value={form.lm_title || ''}
                    onChange={e => setForm(p => ({ ...p, lm_title: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Описание</label>
                  <textarea className="lp-input" style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 90 }} rows={4} placeholder="Описание того, что получит пользователь..." value={form.lm_description || ''}
                    onChange={e => setForm(p => ({ ...p, lm_description: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {['left', 'center', 'right'].map(a => {
                      const active = (form.lm_description_align || 'left') === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, lm_description_align: a }))}
                          style={{
                            ...ghostBtn,
                            ...(active ? {
                              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                              borderColor: 'transparent', color: '#fff',
                              boxShadow: `0 3px 10px ${ACCENT}40`,
                            } : {}),
                            padding: '6px 12px',
                          }}
                        >
                          {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Текст на кнопке</label>
                  <input className="lp-input" style={inputStyle} placeholder="Получить бесплатно" value={form.lm_button_text || ''}
                    onChange={e => setForm(p => ({ ...p, lm_button_text: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Лид-магнит (выдаётся после подписки)</label>
                  <select className="lp-input" style={inputStyle} value={form.lm_lead_magnet_id || ''}
                    onChange={e => setForm(p => ({ ...p, lm_lead_magnet_id: e.target.value }))}>
                    <option value="">— Выберите лид-магнит —</option>
                    {leadMagnets.map(lm => (
                      <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                    ))}
                  </select>
                  <div style={hintStyle}>Создайте лид-магнит в разделе «Закрепы → Лид-магниты»</div>
                </div>
              </div>
            )}

            <div>
              <div style={{ ...labelStyle, marginBottom: 10 }}>UTM-метки</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.72rem', color: MUTED, fontWeight: 500 }}>Source</label>
                  <input className="lp-input" style={inputStyle} placeholder="telegram" value={form.utm_source}
                    onChange={e => setForm(p => ({ ...p, utm_source: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.72rem', color: MUTED, fontWeight: 500 }}>Medium</label>
                  <input className="lp-input" style={inputStyle} placeholder="post" value={form.utm_medium}
                    onChange={e => setForm(p => ({ ...p, utm_medium: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.72rem', color: MUTED, fontWeight: 500 }}>Campaign</label>
                  <input className="lp-input" style={inputStyle} placeholder="spring_sale" value={form.utm_campaign}
                    onChange={e => setForm(p => ({ ...p, utm_campaign: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.72rem', color: MUTED, fontWeight: 500 }}>Content</label>
                  <input className="lp-input" style={inputStyle} placeholder="banner_1" value={form.utm_content}
                    onChange={e => setForm(p => ({ ...p, utm_content: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.72rem', color: MUTED, fontWeight: 500 }}>Term</label>
                  <input className="lp-input" style={inputStyle} placeholder="keyword" value={form.utm_term}
                    onChange={e => setForm(p => ({ ...p, utm_term: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="lp-ghost" style={ghostBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button className="lp-primary" style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showMetrikaModal} onClose={() => setShowMetrikaModal(false)} title="Аналитика и пиксели">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={infoBanner('rgba(67,97,238,0.04)', `${ACCENT}25`)}>
              <p style={{ fontSize: '0.82rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
                Счётчики автоматически устанавливаются на страницу подписки. При подписке отправляется событие (цель).
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${WARNING} 0%, #ef4444 100%)`,
                fontSize: '0.95rem', color: '#fff', fontWeight: 700,
                boxShadow: `0 4px 12px ${WARNING}40`,
              }}>Я</div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>Яндекс Метрика</h4>
                <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>Счётчик и цель конверсии</div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>ID счётчика</label>
              <input className="lp-input" style={inputStyle} placeholder="12345678" value={metrikaForm.ym_counter_id}
                onChange={e => setMetrikaForm(p => ({ ...p, ym_counter_id: e.target.value }))} />
              {currentChannel?.yandex_metrika_id && !metrikaForm.ym_counter_id && (
                <p style={{ ...hintStyle, color: ACCENT }}>
                  Используется счётчик канала: {currentChannel.yandex_metrika_id}
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Название цели</label>
              <input className="lp-input" style={inputStyle} placeholder="subscribe_channel" value={metrikaForm.ym_goal_name}
                onChange={e => setMetrikaForm(p => ({ ...p, ym_goal_name: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, #0077FF 0%, ${ACCENT2} 100%)`,
                fontSize: '0.78rem', color: '#fff', fontWeight: 800, letterSpacing: '0.02em',
                boxShadow: `0 4px 12px #0077FF40`,
              }}>VK</div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>Пиксель VK Рекламы</h4>
                <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>Ретаргетинг и события подписки</div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>ID пикселя VK</label>
              <input className="lp-input" style={inputStyle} placeholder="3751584" value={metrikaForm.vk_pixel_id}
                onChange={e => setMetrikaForm(p => ({ ...p, vk_pixel_id: e.target.value }))} />
              {currentChannel?.vk_pixel_id && !metrikaForm.vk_pixel_id && (
                <p style={{ ...hintStyle, color: ACCENT }}>
                  Используется пиксель канала: {currentChannel.vk_pixel_id}
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Название цели VK</label>
              <input className="lp-input" style={inputStyle} placeholder="subscribe_channel" value={metrikaForm.vk_goal_name}
                onChange={e => setMetrikaForm(p => ({ ...p, vk_goal_name: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="lp-ghost" style={ghostBtn} onClick={() => setShowMetrikaModal(false)}>Отмена</button>
              <button className="lp-primary" style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSaveMetrika} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
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
  lineHeight: 1.5, maxWidth: 520,
};
const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};

function EmptyLinks({ onCreate }) {
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
      <div aria-hidden style={{
        position: 'relative', width: 120, height: 120, margin: '0 auto 26px',
      }}>
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
          <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
        Создайте первую ссылку
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 420, lineHeight: 1.55,
      }}>
        Трекинг-ссылки помогают измерить эффективность рекламы: визиты, подписки и конверсии по каждому источнику.
      </p>

      <button className="lp-primary" style={primaryBtn} onClick={onCreate}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Создать ссылку
      </button>
    </div>
  );
}

function DailyChart({ data }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [hover, setHover] = useState(null);
  const chartRef = useRef(null);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  const dataMap = {};
  data.forEach(d => { if (d.day) dataMap[d.day.slice(0, 10)] = d; });

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const d = dataMap[key];
    days.push({ day: i, visits: d?.visits || 0, subs: d?.subs || 0 });
  }

  const maxVal = Math.max(...days.map(d => Math.max(d.visits, d.subs)), 1);
  const totalV = days.reduce((a, d) => a + d.visits, 0);
  const totalS = days.reduce((a, d) => a + d.subs, 0);
  const cr = totalV > 0 ? ((totalS / totalV) * 100).toFixed(1) : '0';

  const w = 500;
  const h = 100;
  const pad = { top: 4, bottom: 4, left: 0, right: 0 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const toX = (i) => pad.left + (i / Math.max(daysInMonth - 1, 1)) * cw;
  const toY = (v) => pad.top + ch - (v / maxVal) * ch;

  const makePath = (key) => days.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' ');
  const makeArea = (key) => {
    const line = days.map((d, i) => `${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(' L');
    return `M${toX(0).toFixed(1)},${(pad.top + ch).toFixed(1)} L${line} L${toX(daysInMonth - 1).toFixed(1)},${(pad.top + ch).toFixed(1)} Z`;
  };

  const visitPath = makePath('visits');
  const subsPath = makePath('subs');
  const visitArea = makeArea('visits');
  const subsArea = makeArea('subs');

  const xLabels = [1, Math.ceil(daysInMonth / 4), Math.ceil(daysInMonth / 2), Math.ceil(daysInMonth * 3 / 4), daysInMonth];

  const navBtn = {
    background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
    width: 28, height: 28, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', color: MUTED, fontWeight: 600,
    transition: 'all .15s ease',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="lp-chartnav" onClick={() => setMonthOffset(p => p + 1)} style={navBtn}>‹</button>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 130, textAlign: 'center', textTransform: 'capitalize', color: DARK, letterSpacing: '-0.01em' }}>{monthLabel}</span>
          <button className="lp-chartnav" onClick={() => setMonthOffset(p => Math.max(0, p - 1))} disabled={monthOffset === 0} style={{ ...navBtn, opacity: monthOffset === 0 ? 0.3 : 1, cursor: monthOffset === 0 ? 'default' : 'pointer' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: '0.74rem', flexWrap: 'wrap' }}>
          <span style={pill('rgba(123,104,238,0.10)', ACCENT2)}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT2 }} />
            Визиты <b style={{ marginLeft: 2, letterSpacing: '-0.02em' }}>{totalV}</b>
          </span>
          <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
            Подписки <b style={{ marginLeft: 2, letterSpacing: '-0.02em' }}>{totalS}</b>
          </span>
          <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>CR · {cr}%</span>
        </div>
      </div>

      <div ref={chartRef} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h + 16}`} style={{ width: '100%', height: 'auto', maxHeight: 160, display: 'block' }}
          onMouseMove={e => {
            const rect = chartRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = ((e.clientX - rect.left) / rect.width) * w;
            const idx = Math.round(((x - pad.left) / cw) * (daysInMonth - 1));
            if (idx >= 0 && idx < daysInMonth && days[idx]) {
              const pct = (e.clientX - rect.left) / rect.width * 100;
              setHover({ idx, pct });
            }
          }}>
          <defs>
            <linearGradient id="gVisit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT2} stopOpacity="0.28" />
              <stop offset="100%" stopColor={ACCENT2} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gSubs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SUCCESS} stopOpacity="0.28" />
              <stop offset="100%" stopColor={SUCCESS} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(r => (
            <line key={r} x1={pad.left} x2={w - pad.right} y1={pad.top + ch * (1 - r)} y2={pad.top + ch * (1 - r)}
              stroke={BORDER} strokeWidth="0.6" strokeDasharray="3,4" />
          ))}
          <path d={visitArea} fill="url(#gVisit)" />
          <path d={subsArea} fill="url(#gSubs)" />
          <path d={visitPath} fill="none" stroke={ACCENT2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={subsPath} fill="none" stroke={SUCCESS} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {hover && (
            <line x1={toX(hover.idx)} x2={toX(hover.idx)} y1={pad.top} y2={pad.top + ch}
              stroke={MUTED} strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6" />
          )}
          {days.map((d, i) => {
            const isHovered = hover?.idx === i;
            return [
              d.visits > 0 && <circle key={`v${i}`} cx={toX(i)} cy={toY(d.visits)} r={isHovered ? 4 : 2.4} fill={ACCENT2} opacity={isHovered ? 1 : 0.85} />,
              d.subs > 0 && <circle key={`s${i}`} cx={toX(i)} cy={toY(d.subs)} r={isHovered ? 4 : 2.4} fill={SUCCESS} opacity={isHovered ? 1 : 0.85} />,
              isHovered && d.visits === 0 && <circle key={`vh${i}`} cx={toX(i)} cy={toY(0)} r={3} fill={ACCENT2} opacity={0.4} />,
              isHovered && d.subs === 0 && <circle key={`sh${i}`} cx={toX(i)} cy={toY(0)} r={3} fill={SUCCESS} opacity={0.4} />,
            ];
          })}
          {xLabels.map(d => (
            <text key={d} x={toX(d - 1)} y={h + 12} textAnchor="middle" fontSize="9" fill={MUTED} fontWeight="500">{d}</text>
          ))}
        </svg>
        {hover && days[hover.idx] && (
          <div style={{
            position: 'absolute', top: -4,
            left: `${hover.pct}%`, transform: hover.pct > 75 ? 'translateX(-100%)' : 'translateX(-50%)',
            background: '#fff', border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: '8px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
            fontSize: '0.75rem', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: DARK, letterSpacing: '-0.01em' }}>
              {days[hover.idx].day} {monthLabel}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: ACCENT2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT2 }} />
                <b>{days[hover.idx].visits}</b>
              </span>
              <span style={{ color: SUCCESS, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                <b>{days[hover.idx].subs}</b>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
