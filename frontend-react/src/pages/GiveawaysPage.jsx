import { useState, useEffect, useCallback, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api, API_BASE } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import AttachmentPicker from '../components/AttachmentPicker';
import RichTextEditor from '../components/RichTextEditor';
import MessagePreview from '../components/MessagePreview';
import EridModal from '../components/EridModal';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const STATUS_META = {
  draft:    { label: 'Черновик', grad: [MUTED, '#9ca3af'],  soft: 'rgba(107,114,128,0.10)', text: MUTED },
  active:   { label: 'Активен',  grad: [WARNING, '#f97316'], soft: 'rgba(245,158,11,0.10)',  text: WARNING },
  finished: { label: 'Завершён', grad: [SUCCESS, '#34d399'], soft: 'rgba(16,185,129,0.10)',  text: SUCCESS },
};

const DEFAULT_FORM = {
  title: '',
  message_text: '',
  erid: '',
  legal_info: '',
  prizes: [''],
  conditions: { subscribe: true },
  ends_at: '',
  winner_count: 1,
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
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.84rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const iconGhostBtn = {
  ...ghostBtn,
  width: 34, height: 34, padding: 0, fontSize: '0.95rem',
};

const iconAccentBtn = {
  ...iconGhostBtn,
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  borderColor: 'transparent',
  color: '#fff',
  boxShadow: `0 3px 10px ${ACCENT}3a`,
};

const iconWinnerBtn = {
  ...iconGhostBtn,
  background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
  borderColor: 'transparent',
  color: '#fff',
  boxShadow: `0 3px 10px ${WARNING}45`,
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

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const animStyle = (i) => ({ animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` });

const pageHeaderWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  padding: '26px 28px 24px', marginBottom: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const pageHeaderBlur1 = {
  position: 'absolute', top: -50, right: -30, width: 180, height: 180,
  borderRadius: '50%', background: `radial-gradient(circle, ${WARNING}24 0%, transparent 70%)`,
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
  lineHeight: 1.5, maxWidth: 560,
};

const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

function TrophyIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function CheckIcon({ size = 22, color = '#fff', strokeWidth = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function GiftIcon({ size = 26, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function PeopleIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M17 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PlusIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GradientAvatar({ from, to, children, size = 52 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      boxShadow: `0 4px 12px ${from}33`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.25), transparent 60%)',
        pointerEvents: 'none',
      }} />
      <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))', display: 'inline-flex' }}>{children}</span>
    </div>
  );
}

function EmptyGiveaways({ onCreate }) {
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
          background: `radial-gradient(circle, ${WARNING}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${WARNING}55`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <TrophyIcon size={54} strokeWidth={1.8} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.25rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${ACCENT}55`,
          border: '3px solid #fff',
        }}>+</div>
      </div>

      <h3 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: DARK, margin: '0 0 8px' }}>
        Создайте первый розыгрыш
      </h3>
      <p style={{ fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px', maxWidth: 440, lineHeight: 1.55 }}>
        Опубликуйте конкурс среди подписчиков с автоматическим выбором победителей. Бот подведёт итоги в указанное время.
      </p>
      <button className="gw-primary" data-tour-page="create" style={primaryBtn} onClick={onCreate}>
        <PlusIcon /> Создать розыгрыш
      </button>
    </div>
  );
}

export default function GiveawaysPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [gwImage, setGwImage] = useState(null);
  const [showEridModal, setShowEridModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [publishing, setPublishing] = useState(null);

  const titleRef = useRef(null);
  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('giveaways', [
    { selector: '[data-tour-page="create"]', title: 'Конкурс среди подписчиков', text: 'Укажите призы, дату завершения, условия. Бот опубликует пост в канале с кнопкой «Участвовать».', placement: 'bottom' },
    { selector: '[data-tour-page="draw"]', title: 'Автовыбор победителей', text: 'По истечении срока бот случайно выберет N победителей и опубликует результаты.', placement: 'bottom' },
  ]);

  const loadGiveaways = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/giveaways/${tc}`);
      if (data.success) setGiveaways(data.giveaways || []);
    } catch {
      showToast('Ошибка загрузки розыгрышей', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadGiveaways(); }, [loadGiveaways]);

  const parsePrizes = (raw) => {
    if (!raw) return [''];
    if (Array.isArray(raw)) return raw.length ? raw : [''];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : [''];
    } catch {
      return raw ? [raw] : [''];
    }
  };

  const parseConditions = (raw) => {
    if (!raw) return { subscribe: true };
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return { subscribe: true };
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...DEFAULT_FORM, prizes: [''] });
    setGwImage(null);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      title: item.title || '',
      message_text: item.message_text || '',
      erid: item.erid || '',
      legal_info: item.legal_info || '',
      prizes: parsePrizes(item.prizes),
      conditions: parseConditions(item.conditions),
      ends_at: item.ends_at ? item.ends_at.slice(0, 16) : '',
      winner_count: item.winner_count || 1,
    });
    setGwImage(null);
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    if (!form.title.trim()) {
      const defaultTitle = `Розыгрыш от ${new Date().toLocaleDateString('ru-RU')}`;
      setForm(p => ({ ...p, title: defaultTitle }));
      form.title = defaultTitle;
    }
    const newErrors = {};
    if (!form.message_text.replace(/<[^>]*>/g, '').trim()) newErrors.message_text = 'Текст поста обязателен — он будет опубликован в канале';
    setErrors(newErrors);
    if (newErrors.title) { scrollToRef(titleRef); }
    else if (newErrors.message_text) { scrollToRef(messageRef); }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        prizes: form.prizes.filter(p => p.trim()),
        ends_at: form.ends_at || null,
      };

      let data;
      if (gwImage) {
        const fd = new FormData();
        fd.append('title', payload.title);
        fd.append('message_text', payload.message_text);
        fd.append('erid', payload.erid);
        fd.append('legal_info', payload.legal_info);
        fd.append('prizes', JSON.stringify(payload.prizes));
        fd.append('conditions', JSON.stringify(payload.conditions));
        if (payload.ends_at) fd.append('ends_at', payload.ends_at);
        fd.append('winner_count', String(payload.winner_count));
        fd.append('image', gwImage);
        if (editingItem) {
          data = await api.upload(`/giveaways/${tc}/${editingItem.id}`, fd, 'PUT');
        } else {
          data = await api.upload(`/giveaways/${tc}`, fd);
        }
      } else {
        if (editingItem) {
          data = await api.put(`/giveaways/${tc}/${editingItem.id}`, payload);
        } else {
          data = await api.post(`/giveaways/${tc}`, payload);
        }
      }
      if (data.success) {
        showToast(editingItem ? 'Розыгрыш обновлён' : 'Розыгрыш создан');
        setShowModal(false);
        loadGiveaways();
      } else {
        showToast(data.detail || data.error || 'Ошибка сохранения', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить розыгрыш?')) return;
    try {
      const data = await api.delete(`/giveaways/${tc}/${id}`);
      if (data.success) { showToast('Розыгрыш удалён'); loadGiveaways(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublish = async (g) => {
    if (!window.confirm('Опубликовать розыгрыш в канал?')) return;
    setPublishing(g.id);
    try {
      const data = await api.post(`/giveaways/${tc}/${g.id}/publish`);
      if (data.success) { showToast('Розыгрыш опубликован'); loadGiveaways(); }
      else showToast(data.error || 'Ошибка публикации', 'error');
    } catch { showToast('Ошибка публикации', 'error'); }
    finally { setPublishing(null); }
  };

  const handleDraw = async (g) => {
    if (!window.confirm('Определить победителя?')) return;
    try {
      const data = await api.post(`/giveaways/${tc}/${g.id}/draw`);
      if (data.success) {
        const w = data.winner;
        showToast(`Победитель: ${w.first_name || w.username || w.telegram_id}`);
        loadGiveaways();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch { showToast('Ошибка определения победителя', 'error'); }
  };

  const addPrize = () => setForm(p => ({ ...p, prizes: [...p.prizes, ''] }));
  const removePrize = (idx) => setForm(p => ({ ...p, prizes: p.prizes.filter((_, i) => i !== idx) }));
  const updatePrize = (idx, val) => setForm(p => ({ ...p, prizes: p.prizes.map((pr, i) => i === idx ? val : pr) }));

  const getPrizesDisplay = (g) => {
    try {
      const list = JSON.parse(g.prizes || '[]');
      if (Array.isArray(list) && list.length) return list.filter(Boolean).join(', ');
    } catch { /* ignore */ }
    return g.prize || '';
  };

  const imagePreviewUrl = gwImage
    ? URL.createObjectURL(gwImage)
    : editingItem?.image_path
      ? `${API_BASE.replace('/api', '')}${editingItem.image_path}`
      : null;

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .gw-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .gw-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .gw-ghost-accent:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px ${ACCENT}55 !important;
        }
        .gw-ghost-winner:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px ${WARNING}66 !important;
        }
        .gw-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .gw-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .gw-input:focus,
        .gw-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .gw-cond {
          display: flex; align-items: flex-start; gap: 12;
          padding: 12px 14px; border-radius: 12px;
          cursor: pointer;
          transition: border-color .15s ease, background .15s ease;
        }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING, boxShadow: `0 0 8px ${WARNING}` }} />
                Конкурсы
              </div>
              <h1 style={pageTitleStyle}>Розыгрыши</h1>
              <p style={pageSubStyle}>
                Конкурсы среди подписчиков с автоматическим выбором победителей
              </p>
            </div>
            <button className="gw-primary" data-tour-page="create" style={primaryBtn} onClick={openCreate}>
              <PlusIcon /> Создать розыгрыш
            </button>
          </div>
        </section>

        {loading ? <Loading /> : giveaways.length === 0 ? (
          <EmptyGiveaways onCreate={openCreate} />
        ) : (
          <section>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Розыгрыши</h2>
                <p style={sectionSubStyle}>Всего: {giveaways.length}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {giveaways.map((g, i) => {
                const meta = STATUS_META[g.status] || STATUS_META.draft;
                const prizesText = getPrizesDisplay(g);
                const isDraft = !g.status || g.status === 'draft';
                const isActive = g.status === 'active';
                const isFinished = g.status === 'finished';
                return (
                  <div key={g.id} className="gw-card" style={{ ...cardBase, padding: 18, ...animStyle(i) }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <GradientAvatar from={meta.grad[0]} to={meta.grad[1]}>
                        {isFinished ? <CheckIcon size={26} /> : isActive ? <TrophyIcon size={26} /> : <GiftIcon size={26} />}
                      </GradientAvatar>

                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                            {g.title}
                          </span>
                          <span style={pill(meta.soft, meta.text)}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                            {meta.label}
                          </span>
                          {g.erid && (
                            <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>ERID · {g.erid}</span>
                          )}
                        </div>

                        <div style={{
                          display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap',
                        }}>
                          {prizesText && (
                            <span style={{
                              ...pill('rgba(245,158,11,0.10)', WARNING),
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              padding: '5px 12px',
                            }}>
                              <TrophyIcon size={12} color={WARNING} strokeWidth={2.2} />
                              {prizesText}
                            </span>
                          )}
                        </div>

                        <div style={{
                          display: 'flex', gap: 14, alignItems: 'center',
                          fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <PeopleIcon size={13} color={ACCENT2} />
                            Участников <b style={{ color: DARK, fontWeight: 700, marginLeft: 2 }}>{(g.participant_count ?? 0).toLocaleString('ru-RU')}</b>
                          </span>
                          {g.winner_count > 1 && (
                            <span style={pill(SOFT_BG, MUTED)}>Победителей · {g.winner_count}</span>
                          )}
                          {g.deep_link_code && (
                            <span style={pill(SOFT_BG, MUTED)}>Код · {g.deep_link_code}</span>
                          )}
                          {g.ends_at && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                              Итоги · {new Date(g.ends_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {g.winner_first_name && (
                          <div style={{
                            marginTop: 12,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(16,185,129,0.08)',
                            border: `1px solid ${SUCCESS}30`,
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                          }}>
                            <TrophyIcon size={16} color={SUCCESS} strokeWidth={2.2} />
                            <span style={{ fontSize: '0.85rem', color: DARK, fontWeight: 600 }}>
                              Победитель: <b>{g.winner_first_name}</b>
                              {g.winner_username ? <span style={{ color: SUCCESS, marginLeft: 6 }}>@{g.winner_username}</span> : null}
                            </span>
                          </div>
                        )}
                      </div>

                      {g.image_path && (
                        <div style={{
                          width: 120, height: 80, flexShrink: 0,
                          borderRadius: 10, overflow: 'hidden',
                          border: `1px solid ${BORDER}`,
                        }}>
                          <img
                            src={`${API_BASE.replace('/api', '')}${g.image_path}`}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {isDraft && (
                          <>
                            <button className="gw-ghost" style={iconGhostBtn} onClick={() => openEdit(g)} title="Редактировать">✎</button>
                            <button
                              className="gw-ghost-accent"
                              style={{ ...iconAccentBtn, opacity: publishing === g.id ? 0.7 : 1 }}
                              onClick={() => handlePublish(g)}
                              disabled={publishing === g.id}
                              title="Опубликовать"
                            >
                              {publishing === g.id ? '…' : '▶'}
                            </button>
                          </>
                        )}
                        {isActive && (
                          <button
                            className="gw-ghost-winner"
                            data-tour-page="draw"
                            style={iconWinnerBtn}
                            onClick={() => handleDraw(g)}
                            title="Определить победителя"
                          >
                            <TrophyIcon size={16} strokeWidth={2.1} />
                          </button>
                        )}
                        <button className="gw-danger" style={dangerGhost} onClick={() => handleDelete(g.id)} title="Удалить">🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Редактировать розыгрыш' : 'Создать розыгрыш'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div ref={titleRef}>
              <label style={labelStyle}>Название розыгрыша *</label>
              <input
                className={`gw-input${errors.title ? ' field-error' : ''}`}
                style={inputStyle}
                placeholder="Например: Новогодний розыгрыш iPhone 16"
                value={form.title}
                onChange={e => { setForm(p => ({ ...p, title: e.target.value })); if (e.target.value.trim()) setErrors(er => ({ ...er, title: '' })); }}
              />
              {errors.title && <div className="field-error-text">{errors.title}</div>}
              <div style={hintStyle}>Внутреннее название. Подписчики увидят текст поста ниже.</div>
            </div>

            <div ref={messageRef}>
              <label style={labelStyle}>Текст поста *</label>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.replace(/<[^>]*>/g, '').trim()) setErrors(er => ({ ...er, message_text: '' })); }}
                  placeholder="Текст розыгрыша, который увидят подписчики в канале..."
                  rows={6}
                  showEmoji={true}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div style={hintStyle}>Этот текст будет опубликован в канале при запуске розыгрыша.</div>
            </div>

            <div>
              <label style={labelStyle}>Картинка</label>
              <AttachmentPicker
                file={gwImage}
                onFileChange={setGwImage}
                existingFileInfo={editingItem?.image_type || ''}
              />
              {imagePreviewUrl && (
                <div style={{ marginTop: 10, maxWidth: 320, borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
                  <img src={imagePreviewUrl} alt="Предпросмотр" style={{ width: '100%', display: 'block' }} />
                </div>
              )}
              <div style={hintStyle}>Рекомендуемый размер: 1280x720 px (16:9). JPG или PNG.</div>
            </div>

            <div>
              <label style={labelStyle}>Призы</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.prizes.map((prize, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8 }}>
                    <input className="gw-input" style={{ ...inputStyle, flex: 1 }}
                      placeholder={idx === 0 ? 'Например: iPhone 15 Pro' : 'Ещё один приз'}
                      value={prize}
                      onChange={e => updatePrize(idx, e.target.value)} />
                    {form.prizes.length > 1 && (
                      <button type="button" className="gw-danger" style={dangerGhost} onClick={() => removePrize(idx)} title="Удалить приз">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="gw-ghost" style={{ ...ghostBtn, marginTop: 8 }} onClick={addPrize}>
                <PlusIcon /> Добавить приз
              </button>
              <div style={hintStyle}>Укажите призы — они отобразятся участникам розыгрыша.</div>
            </div>

            <div>
              <label style={labelStyle}>Условия участия</label>
              <label className="gw-cond" style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${form.conditions.subscribe ? `${ACCENT}55` : BORDER}`,
                background: form.conditions.subscribe ? `${ACCENT}08` : '#fff',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={form.conditions.subscribe}
                  onChange={e => setForm(p => ({ ...p, conditions: { ...p.conditions, subscribe: e.target.checked } }))}
                  style={{ display: 'none' }}
                />
                <span style={{
                  flexShrink: 0,
                  width: 20, height: 20, borderRadius: 6,
                  border: `1.5px solid ${form.conditions.subscribe ? ACCENT : BORDER}`,
                  background: form.conditions.subscribe ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                  boxShadow: form.conditions.subscribe ? `0 2px 6px ${ACCENT}40` : 'none',
                }}>
                  {form.conditions.subscribe && <CheckIcon size={12} color="#fff" strokeWidth={3.5} />}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: DARK }}>
                    Подписка на канал
                  </span>
                  <span style={{ display: 'block', fontSize: '0.76rem', color: MUTED, marginTop: 3 }}>
                    Участвовать смогут только подписчики канала
                  </span>
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Кол-во победителей</label>
                <input type="number" className="gw-input" style={inputStyle} value={form.winner_count} min="1" max="100"
                  onChange={e => setForm(p => ({ ...p, winner_count: parseInt(e.target.value) || 1 }))} />
                <div style={hintStyle}>Сколько победителей будет выбрано случайным образом.</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Дата подведения итогов</label>
                <input type="datetime-local" className="gw-input" style={inputStyle} value={form.ends_at}
                  onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))} />
                <div style={hintStyle}>Необязательно. Итоги можно подвести вручную.</div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>ERID (рекламный идентификатор)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="gw-input" style={{ ...inputStyle, flex: 1 }} placeholder="Введите ERID или получите автоматически"
                  value={form.erid}
                  onChange={e => setForm(p => ({ ...p, erid: e.target.value }))} />
                <button type="button" className="gw-ghost" style={{ ...ghostBtn, whiteSpace: 'nowrap' }}
                  onClick={() => setShowEridModal(true)}>
                  Получить ERID
                </button>
              </div>
              {form.erid && <div style={{ ...hintStyle, color: SUCCESS, fontWeight: 600 }}>ERID: {form.erid}</div>}
            </div>

            <div>
              <label style={labelStyle}>Юр. информация</label>
              <textarea className="gw-input" style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 60 }}
                rows={2} placeholder="ИНН, наименование рекламодателя..." value={form.legal_info}
                onChange={e => setForm(p => ({ ...p, legal_info: e.target.value }))} />
              <div style={hintStyle}>Юридические данные рекламодателя (ИНН, название). Требуется по закону при рекламе.</div>
            </div>

            <MessagePreview
              messageText={form.message_text}
              file={gwImage}
              fileUrl={!gwImage && editingItem?.image_path ? `${API_BASE.replace('/api', '')}${editingItem.image_path}` : ''}
              tc={tc}
              entityType="giveaway"
              entityId={editingItem?.id}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="gw-ghost" style={ghostBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button className="gw-primary" style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : editingItem ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </Modal>

        <EridModal
          isOpen={showEridModal}
          onClose={() => setShowEridModal(false)}
          tc={tc}
          onEridReceived={(erid) => setForm(f => ({ ...f, erid }))}
          defaultText={form.message_text?.replace(/<[^>]+>/g, '').slice(0, 200) || ''}
          defaultName={form.title || ''}
        />
      </div>
    </Paywall>
  );
}
