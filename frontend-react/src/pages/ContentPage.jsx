import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';
import AiPostGenModal from '../components/AiPostGenModal';
import MessagePreview from '../components/MessagePreview';
import EridModal from '../components/EridModal';
import { usePageOnboarding } from '../components/OnboardingTour';
import AiContentTab from './content/AiContentTab';
import FilesLibraryTab from './content/FilesLibraryTab';
import PollsTab from './content/PollsTab';
import ComingSoonStub from '../components/ComingSoonStub';
import { useFeatureVisibility } from '../hooks/useFeatureVisibility';
// streams loaded for ButtonBuilder dropdown

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
  draft:      { label: 'Черновик',          grad: [MUTED, '#9ca3af'],   soft: 'rgba(107,114,128,0.10)', text: MUTED },
  scheduled:  { label: 'Ожидает публикации', grad: ['#3b82f6', ACCENT],  soft: 'rgba(59,130,246,0.10)',  text: '#3b82f6' },
  publishing: { label: 'Публикуется…',       grad: [WARNING, '#f97316'], soft: 'rgba(245,158,11,0.10)',  text: WARNING },
  published:  { label: 'Опубликовано',       grad: [SUCCESS, '#34d399'], soft: 'rgba(16,185,129,0.10)',  text: SUCCESS },
  failed:     { label: 'Ошибка публикации',  grad: [DANGER, '#fb7185'],  soft: 'rgba(230,57,70,0.10)',   text: DANGER },
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

const previewPanelStyle = {
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: '0.85rem',
  color: MUTED,
  lineHeight: 1.55,
  maxHeight: 110,
  overflowY: 'auto',
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
  lineHeight: 1.5, maxWidth: 560,
};

const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function parseUtc(s) {
  if (!s) return null;
  const str = s.includes('T') ? s : s.replace(' ', 'T');
  const withTz = str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str) ? str : str + 'Z';
  const d = new Date(withTz);
  return isNaN(d.getTime()) ? null : d;
}

function toLocalDatetime(utcStr) {
  const d = parseUtc(utcStr);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtLocal(utcStr) {
  const d = parseUtc(utcStr);
  return d ? d.toLocaleString('ru-RU') : '';
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;
  const days = [];
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({ day: prevMonthLast - i, month: month - 1, year, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, otherMonth: false });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, month: month + 1, year, otherMonth: true });
    }
  }
  return days;
}

function toDateKey(dateStr) {
  if (!dateStr) return null;
  const d = parseUtc(dateStr) || new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

function CalendarIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function DocIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

function ListIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function GridIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
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

function AiIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
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

function EmptyContent({ onCreate }) {
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
          <CalendarIcon size={56} strokeWidth={1.7} />
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

      <h3 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: DARK, margin: '0 0 8px' }}>
        Создайте первую публикацию
      </h3>
      <p style={{ fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px', maxWidth: 440, lineHeight: 1.55 }}>
        Запланируйте посты в канал на любую дату — бот опубликует их автоматически в указанное время.
      </p>
      <button className="cp-primary" style={primaryBtn} onClick={() => onCreate()}>
        <PlusIcon /> Создать пост
      </button>
    </div>
  );
}

const comingBadgeStyle = {
  marginLeft: 6, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
  background: 'rgba(245,158,11,0.18)', color: '#92400e',
  padding: '1px 6px', borderRadius: 6, textTransform: 'uppercase',
};

export default function ContentPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const { get: getVisibility } = useFeatureVisibility();
  const pollsVis = getVisibility('content_polls');
  const streamsVis = getVisibility('content_streams');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [form, setForm] = useState({ title: '', message_text: '', scheduled_at: '', inline_buttons: '', attach_type: '', erid: '' });
  const [showEridModal, setShowEridModal] = useState(false);
  const [postFile, setPostFile] = useState(null);
  // Доп. файлы поверх postFile (вместе до 10 фото — медиа-группа в канале)
  const [extraFiles, setExtraFiles] = useState([]);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [polls, setPolls] = useState([]);
  const [streams, setStreams] = useState([]);
  const [viewMode, setViewMode] = useState('calendar');
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [stripOffset, setStripOffset] = useState(0); // сдвиг 14-дневной полосы
  const [aiGenMode, setAiGenMode] = useState(null); // 'text' | 'image' | null
  const [listStatus, setListStatus] = useState('scheduled'); // 'scheduled' | 'published' | 'draft'

  const { overlay: pageTour } = usePageOnboarding('content', [
    { selector: '[data-tour-page="content-day"]', title: 'Календарь публикаций', text: 'Нажмите на любую свободную дату — откроется форма создания запланированного поста с выбранной датой.', placement: 'bottom' },
  ]);
  const [errors, setErrors] = useState({});

  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const loadPosts = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/content/${tc}`);
      if (data.success) setPosts(data.posts || []);
    } catch {
      showToast('Ошибка загрузки контента', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/pins/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.lead_magnets || data.leadMagnets || []);
    } catch { /* ignore */ }
  }, [tc]);

  const loadPolls = useCallback(async () => {
    if (!tc || pollsVis.visibility !== 'visible') return;
    try {
      const data = await api.get(`/polls/${tc}`);
      if (data.success) setPolls(data.polls || []);
    } catch { /* ignore */ }
  }, [tc, pollsVis.visibility]);

  const loadStreams = useCallback(async () => {
    if (!tc || streamsVis.visibility !== 'visible') return;
    try {
      const data = await api.get(`/streams/${tc}`);
      if (data.success) setStreams(data.streams || []);
    } catch { /* ignore */ }
  }, [tc, streamsVis.visibility]);

  useEffect(() => { loadPosts(); loadLeadMagnets(); loadPolls(); loadStreams(); }, [loadPosts, loadLeadMagnets, loadPolls, loadStreams]);

  // Дата (YYYY-MM-DD) уже прошла по МСК — нельзя создать пост на эту дату
  const isPastDate = (dateStr) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return false;
    const msk = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const todayMsk = `${msk.getUTCFullYear()}-${String(msk.getUTCMonth() + 1).padStart(2, '0')}-${String(msk.getUTCDate()).padStart(2, '0')}`;
    return dateStr.slice(0, 10) < todayMsk;
  };

  const openCreate = (prefillDate) => {
    if (prefillDate && isPastDate(prefillDate)) {
      showToast('Нельзя создать пост на прошедшую дату', 'error');
      return;
    }
    setEditingPost(null);
    setPostFile(null); setExtraFiles([]);
    setRemoveExistingFile(false);
    setErrors({});
    let scheduledAt;
    // Дефолт по МСК (UTC+3): now+30 минут — чтобы валидация "не в прошлом"
    // не срабатывала сразу при открытии модалки.
    const mskNowPlus30 = new Date(Date.now() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const mskFmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (prefillDate) {
      scheduledAt = `${prefillDate}T10:00`;
    } else {
      scheduledAt = mskFmt(mskNowPlus30);
    }
    setForm({ title: '', message_text: '', scheduled_at: scheduledAt, inline_buttons: '', attach_type: '', erid: '' });
    setShowModal(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setPostFile(null); setExtraFiles([]);
    setRemoveExistingFile(false);
    setErrors({});
    let btns = '';
    if (post.inline_buttons) {
      try { btns = typeof post.inline_buttons === 'string' ? post.inline_buttons : JSON.stringify(post.inline_buttons, null, 2); } catch { /* ignore */ }
    }
    // scheduled_at у published/failed постов = NULL (мы его зануляем
    // при публикации и при фейле). Чтобы юзер мог сохранить через
    // валидацию — подставляем дефолт «сейчас + 30 мин МСК» (как в
    // openCreate). Так редактирование не блокируется пустой датой.
    let scheduledAt = '';
    if (post.scheduled_at) {
      scheduledAt = toLocalDatetime(post.scheduled_at);
    } else {
      const mskNowPlus30 = new Date(Date.now() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      scheduledAt = `${mskNowPlus30.getUTCFullYear()}-${pad(mskNowPlus30.getUTCMonth() + 1)}-${pad(mskNowPlus30.getUTCDate())}T${pad(mskNowPlus30.getUTCHours())}:${pad(mskNowPlus30.getUTCMinutes())}`;
    }
    setForm({
      title: post.title || '',
      message_text: post.message_text || '',
      scheduled_at: scheduledAt,
      inline_buttons: btns,
      attach_type: post.attach_type || '',
      erid: post.erid || '',
    });
    setShowModal(true);
  };

  // Текущее время по МСК (UTC+3) в формате datetime-local строки.
  // Используем для сравнения и валидации поля scheduled_at.
  // ВАЖНО: считаем через UTC-компоненты сдвинутого момента (Date.now() + 3ч),
  // независимо от того, в какой TZ сидит браузер пользователя.
  const nowMskString = () => {
    const m = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
  };

  const isScheduledInPast = () => {
    if (!form.scheduled_at) return false;
    return form.scheduled_at < nowMskString();
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст поста обязателен';
    if (!form.scheduled_at) {
      newErrors.scheduled_at = 'Укажите дату публикации';
    } else if (isScheduledInPast()) {
      newErrors.scheduled_at = 'Нельзя запланировать в прошедшем времени (МСК)';
    }
    setErrors(newErrors);
    if (newErrors.message_text) scrollToRef(messageRef);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const defaultTitle = form.title.trim() || `Публикация от ${new Date().toLocaleDateString('ru-RU')}`;
      let parsedButtons = null;
      if (form.inline_buttons && form.inline_buttons.trim()) {
        try {
          parsedButtons = JSON.parse(form.inline_buttons);
        } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      // datetime-local трактуем как локальное МСК-время (UTC+3) — конвертим
      // в реальный UTC-момент явно, чтобы серверный sched чётко совпал с
      // выбранным временем на часах пользователя.
      const scheduledUtc = (() => {
        if (!form.scheduled_at) return '';
        const local = new Date(form.scheduled_at + ':00+03:00');
        return local.toISOString();
      })();

      if (postFile || extraFiles.length > 0) {
        const fd = new FormData();
        fd.append('title', defaultTitle);
        fd.append('message_text', form.message_text);
        fd.append('scheduled_at', scheduledUtc);
        fd.append('status', 'scheduled');
        if (parsedButtons) fd.append('inline_buttons', JSON.stringify(parsedButtons));
        if (form.attach_type) fd.append('attach_type', form.attach_type);
        // Главный файл + до 9 дополнительных = до 10 файлов как `files[]`
        const allFiles = [postFile, ...extraFiles].filter(Boolean).slice(0, 10);
        for (const f of allFiles) fd.append('files', f);

        if (editingPost) {
          data = await api.upload(`/content/${tc}/${editingPost.id}`, fd, 'PUT');
        } else {
          data = await api.upload(`/content/${tc}`, fd);
        }
      } else {
        const payload = {
          title: defaultTitle,
          message_text: form.message_text,
          scheduled_at: scheduledUtc || null,
          status: 'scheduled',
        };
        if (parsedButtons) payload.inline_buttons = parsedButtons;
        if (form.attach_type) payload.attach_type = form.attach_type;
        if (form.erid) payload.erid = form.erid;
        if (removeExistingFile) payload.remove_file = true;

        if (editingPost) {
          data = await api.put(`/content/${tc}/${editingPost.id}`, payload);
        } else {
          data = await api.post(`/content/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingPost ? 'Пост обновлён, ждёт публикации' : 'Пост запланирован');
        setShowModal(false);
        loadPosts();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Confirm-удаление (вместо window.confirm) — { id, title } или null
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ---- Авто-сохранение черновика ----
  // Как только пользователь напечатал текст или приложил файл, в фоне
  // создаём draft (status='draft'). Каждое следующее изменение — debounced PUT.
  // Очищаются автоматически серверным кроном через 30 дней.
  const [draftSavingState, setDraftSavingState] = useState('idle'); // 'idle'|'saving'|'saved'
  const draftTimerRef = useRef(null);
  const draftSavingRef = useRef(false);
  const draftIdRef = useRef(null);

  useEffect(() => {
    if (showModal) {
      // При каждом открытии модалки — чистый стейт авто-сейва
      draftIdRef.current = editingPost?.id || null;
      setDraftSavingState('idle');
    } else {
      // Закрыли модалку — отменяем активный таймер
      if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    }
  }, [showModal, editingPost]);

  const saveDraft = useCallback(async () => {
    if (!showModal || !tc) return;
    if (draftSavingRef.current) return;
    const hasText = !!(form.message_text || '').trim();
    const hasFile = !!postFile;
    if (!hasText && !hasFile) return; // пусто — нечего сохранять
    draftSavingRef.current = true;
    setDraftSavingState('saving');
    try {
      // Существующий пост (или ранее созданный draft этой сессии) → PUT
      const existingId = draftIdRef.current;
      if (existingId) {
        // Не трогаем явно установленный пользователем status (если он
        // в этой сессии планирует/публикует — handleSave сделает явный PUT).
        const payload = {
          title: form.title || '',
          message_text: form.message_text || '',
          attach_type: form.attach_type || null,
          erid: form.erid || null,
        };
        if (form.inline_buttons && form.inline_buttons.trim()) {
          try { payload.inline_buttons = JSON.parse(form.inline_buttons); } catch { /* ignore */ }
        }
        await api.put(`/content/${tc}/${existingId}`, payload);
      } else {
        // Создаём новый draft (без scheduled_at — статус 'draft' автоматом).
        // Файлы сюда не отправляем (они большие); файл прилетит при handleSave.
        const payload = {
          title: form.title || '',
          message_text: form.message_text || '',
          attach_type: form.attach_type || null,
          erid: form.erid || null,
        };
        if (form.inline_buttons && form.inline_buttons.trim()) {
          try { payload.inline_buttons = JSON.parse(form.inline_buttons); } catch { /* ignore */ }
        }
        const data = await api.post(`/content/${tc}`, payload);
        if (data?.success && data?.post?.id) {
          draftIdRef.current = data.post.id;
          // Подменяем editingPost, чтобы handleSave работал в режиме PUT.
          setEditingPost(data.post);
        }
      }
      setDraftSavingState('saved');
      // Перезагружаем список постов в фоне, чтобы черновик появился сразу
      loadPosts();
    } catch (e) {
      // Тихо: не пугаем пользователя, в идеале next try-сейв дойдёт.
      console.warn('[ContentPage] draft autosave failed:', e?.message);
      setDraftSavingState('idle');
    } finally {
      draftSavingRef.current = false;
    }
  }, [showModal, tc, form, postFile, editingPost, loadPosts]);

  // Debounce 1.5s после последнего изменения текста/полей.
  useEffect(() => {
    if (!showModal) return undefined;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => { saveDraft(); }, 1500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.message_text, form.title, form.attach_type, form.inline_buttons, form.erid, showModal]);

  // Файл прилетел — сохраняем сразу (без debounce).
  useEffect(() => {
    if (!showModal || !postFile) return;
    saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postFile]);

  const handleDelete = (post) => {
    setDeleteConfirm({ id: post.id, title: post.title || post.message_text?.replace(/<[^>]+>/g, '').slice(0, 60) || 'Пост' });
  };

  const performDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    try {
      const data = await api.delete(`/content/${tc}/${id}`);
      if (data.success) { showToast('Пост удалён'); loadPosts(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublish = async (post) => {
    const isUpdate = post.status === 'published';
    const confirmMsg = isUpdate
      ? 'Обновить уже опубликованный пост в канале?'
      : 'Опубликовать пост в канал?';
    if (!window.confirm(confirmMsg)) return;
    try {
      const data = await api.post(`/content/${tc}/${post.id}/publish`);
      if (data.success) {
        showToast(isUpdate ? 'Пост обновлён в канале' : 'Пост опубликован');
        loadPosts();
      } else showToast(data.error || 'Ошибка', 'error');
    } catch { showToast(isUpdate ? 'Ошибка обновления' : 'Ошибка публикации', 'error'); }
  };

  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);

  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach(post => {
      const key = toDateKey(post.scheduled_at) || toDateKey(post.published_at) || toDateKey(post.created_at);
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(post);
      }
    });
    return map;
  }, [posts]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
    return fmt.format(new Date(calYear, calMonth, 1));
  }, [calYear, calMonth]);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const selectedDayPosts = selectedDate ? (postsByDate[selectedDate] || []) : [];

  // 14-дневная горизонтальная полоса дат под календарём.
  // Центрируем на выбранной дате с учётом текущего сдвига (stripOffset).
  const stripDays = useMemo(() => {
    const anchorStr = selectedDate || (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const [ay, am, ad] = anchorStr.split('-').map(Number);
    const anchor = new Date(ay, am - 1, ad);
    const days = [];
    // 7 дней до и 7 после якоря, плюс смещение
    for (let i = -6; i <= 7; i += 1) {
      const d = new Date(anchor);
      d.setDate(d.getDate() + i + stripOffset);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: d,
        key,
        weekday: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
        day: d.getDate(),
        month: d.toLocaleDateString('ru-RU', { month: 'short' }),
        count: (postsByDate[key] || []).length,
      });
    }
    return days;
  }, [selectedDate, stripOffset, postsByDate]);

  const renderDayCard = (post, i) => {
    const meta = STATUS_META[post.status] || STATUS_META.draft;
    const Icon = post.status === 'published' ? DocIcon : CalendarIcon;
    return (
      <div
        key={post.id}
        className="cp-card"
        style={{ ...cardBase, padding: 18, ...animStyle(i) }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <GradientAvatar from={meta.grad[0]} to={meta.grad[1]}>
            <Icon size={26} />
          </GradientAvatar>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                {post.title || 'Без названия'}
              </span>
              <span style={pill(meta.soft, meta.text)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                {meta.label}
              </span>
              {post.ai_generated && (
                <span style={pill('rgba(139,92,246,0.10)', '#8b5cf6')}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6' }} />
                  AI
                </span>
              )}
              {post.erid && (
                <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>ERID · {post.erid}</span>
              )}
            </div>

            {post.message_text && (
              <div style={previewPanelStyle} dangerouslySetInnerHTML={{ __html: post.message_text }} />
            )}

            <div style={{
              display: 'flex', gap: 10, marginTop: 12, alignItems: 'center',
              fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
            }}>
              {post.scheduled_at && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f680' }} />
                  Запланировано · {fmtLocal(post.scheduled_at)}
                </span>
              )}
              {post.published_at && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS, boxShadow: `0 0 6px ${SUCCESS}80` }} />
                  Опубликовано · {fmtLocal(post.published_at)}
                </span>
              )}
            </div>
            {post.status === 'failed' && post.last_error && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(230,57,70,0.08)', border: `1px solid ${DANGER}40`,
                color: DANGER, fontSize: '0.82rem', lineHeight: 1.45,
              }}>
                ❌ Ошибка: {post.last_error}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button className="cp-ghost" style={iconGhostBtn} onClick={() => openEdit(post)} title={post.status === 'published' ? 'Изменить текст / медиа поста' : 'Редактировать'}>✎</button>
            <button
              className="cp-ghost-accent"
              style={iconAccentBtn}
              onClick={() => handlePublish(post)}
              title={post.status === 'published' ? 'Обновить публикацию в канале (отредактирует уже опубликованное сообщение)' : 'Опубликовать в канал'}
            >
              {post.status === 'published' ? '↻' : '▶'}
            </button>
            <button className="cp-danger" style={dangerGhost} onClick={() => handleDelete(post)} title="Удалить">🗑</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .cp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .cp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .cp-ghost-accent:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px ${ACCENT}55 !important;
        }
        .cp-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .cp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .cp-input:focus,
        .cp-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .cp-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 999px; cursor: pointer;
          background: transparent; border: 1px solid transparent;
          color: ${MUTED}; font-size: 0.82rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .18s ease;
        }
        .cp-tab:hover { color: ${DARK}; background: ${SOFT_BG}; }
        .cp-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .cp-cal-cell {
          position: relative;
          background: #fff;
          border: 1px solid ${BORDER};
          border-radius: 12px;
          min-height: 96px;
          padding: 8px 8px 6px;
          cursor: pointer;
          transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .cp-cal-cell:hover {
          background: ${SOFT_BG};
          border-color: ${ACCENT}55;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        .cp-cal-cell.other-month { opacity: 0.45; }
        .cp-cal-cell.today {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 1px ${ACCENT}55, 0 4px 12px ${ACCENT}1f;
          background: linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06);
        }
        .cp-cal-cell.selected {
          border-color: ${ACCENT2};
          box-shadow: 0 0 0 2px ${ACCENT2}40, 0 6px 18px ${ACCENT2}25;
        }
        .cp-cal-day {
          font-size: 0.84rem; font-weight: 700; color: ${DARK};
          letter-spacing: -0.01em; line-height: 1;
          margin-bottom: 4px;
        }
        .cp-cal-cell.today .cp-cal-day { color: ${ACCENT}; }
        .cp-cal-pill {
          display: block;
          font-size: 0.66rem; font-weight: 600;
          color: #fff;
          padding: 2px 6px; border-radius: 6px;
          margin-top: 3px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.35;
          box-shadow: 0 2px 6px rgba(0,0,0,0.10);
          cursor: pointer;
          transition: transform .12s ease;
        }
        .cp-cal-pill:hover { transform: translateY(-1px); }
        .cp-cal-more {
          font-size: 0.66rem;
          color: ${MUTED};
          font-weight: 600;
          margin-top: 3px;
        }
        .cp-cal-nav {
          background: #fff; border: 1px solid ${BORDER}; border-radius: 10px;
          width: 34px; height: 34px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; color: ${MUTED};
          transition: all .15s ease;
        }
        .cp-cal-nav:hover { color: ${ACCENT}; border-color: ${ACCENT}55; background: ${SOFT_BG}; }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Контент-план
              </div>
              <h1 style={pageTitleStyle}>Публикации</h1>
              <p style={pageSubStyle}>
                Календарь постов с планированием на месяц
              </p>
            </div>
            <button className="cp-primary" style={primaryBtn} onClick={() => openCreate()}>
              <PlusIcon /> Создать пост
            </button>
          </div>
        </section>

        <div role="tablist" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: 5, borderRadius: 999,
          background: '#fff', border: `1px solid ${BORDER}`,
          marginBottom: 22,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <button
            role="tab"
            aria-selected={viewMode === 'calendar'}
            className={`cp-tab${viewMode === 'calendar' ? ' active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <GridIcon /> Календарь
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'list'}
            className={`cp-tab${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <ListIcon /> Список
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'ai-content'}
            data-tour-page="content-ai"
            className={`cp-tab${viewMode === 'ai-content' ? ' active' : ''}`}
            onClick={() => setViewMode('ai-content')}
            style={{ position: 'relative' }}
          >
            <AiIcon /> ИИ Контент
            <span style={{
              position: 'absolute',
              top: -7, right: -10,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#fff',
              background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
              padding: '2px 7px',
              borderRadius: 8,
              boxShadow: '0 2px 6px rgba(239,68,68,0.40)',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}>Хит</span>
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'files'}
            className={`cp-tab${viewMode === 'files' ? ' active' : ''}`}
            onClick={() => setViewMode('files')}
          >
            📁 Мои файлы
          </button>
        </div>

        {loading ? <Loading /> : (
          <>
            {viewMode === 'calendar' && (
              <>
                <section style={{ ...cardBase, padding: 20, marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 16, flexWrap: 'wrap', gap: 10,
                  }}>
                    <div>
                      <h2 style={sectionTitleStyle}>
                        <span style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
                      </h2>
                      <p style={sectionSubStyle}>Нажмите на дату — создайте пост или просмотрите запланированные</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="cp-cal-nav" onClick={prevMonth} title="Предыдущий месяц">‹</button>
                      <button
                        className="cp-cal-nav"
                        onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()); }}
                        title="Текущий месяц"
                        style={{ width: 'auto', padding: '0 14px', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        Сегодня
                      </button>
                      <button className="cp-cal-nav" onClick={nextMonth} title="Следующий месяц">›</button>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 8,
                    marginBottom: 8,
                  }}>
                    {WEEKDAYS.map(wd => (
                      <div key={wd} style={{
                        textAlign: 'center',
                        fontSize: '0.72rem', fontWeight: 700,
                        color: MUTED, letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        padding: '6px 0',
                      }}>{wd}</div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {calendarDays.map((cell, idx) => {
                      const nKey = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
                      const dayPosts = postsByDate[nKey] || [];
                      const isToday = nKey === today;
                      const isSelected = nKey === selectedDate;
                      const visiblePosts = dayPosts.slice(0, 3);
                      const more = dayPosts.length - visiblePosts.length;
                      return (
                        <div
                          key={idx}
                          className={`cp-cal-cell${cell.otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                          onClick={() => {
                            setSelectedDate(nKey);
                            if (dayPosts.length === 0) openCreate(nKey);
                          }}
                          data-tour-page={idx === 7 && !cell.otherMonth ? 'content-day' : undefined}
                        >
                          <div className="cp-cal-day">{cell.day}</div>
                          {visiblePosts.map(post => {
                            const meta = STATUS_META[post.status] || STATUS_META.draft;
                            return (
                              <span
                                key={post.id}
                                className="cp-cal-pill"
                                style={{ background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)` }}
                                title={post.title || (post.message_text || '').replace(/<[^>]+>/g, '').slice(0, 80)}
                                onClick={(e) => { e.stopPropagation(); openEdit(post); }}
                              >
                                {post.title || (post.message_text || '').replace(/<[^>]+>/g, '').slice(0, 18) || 'Пост'}
                              </span>
                            );
                          })}
                          {more > 0 && <div className="cp-cal-more">+{more}</div>}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Горизонтальная полоса дат под основным календарём */}
                <section style={{ ...cardBase, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="cp-cal-nav" onClick={() => setStripOffset(o => o - 7)} title="Раньше">‹</button>
                    <div style={{
                      flex: 1, display: 'flex', gap: 6, overflowX: 'auto',
                      scrollSnapType: 'x mandatory',
                      paddingBottom: 2,
                    }}>
                      {stripDays.map(d => {
                        const active = d.key === selectedDate;
                        const isToday = d.key === today;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => setSelectedDate(d.key)}
                            style={{
                              flexShrink: 0, scrollSnapAlign: 'start',
                              minWidth: 64, padding: '8px 6px',
                              borderRadius: 12, cursor: 'pointer',
                              border: active ? 'none' : `1px solid ${BORDER}`,
                              background: active
                                ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`
                                : '#fff',
                              color: active ? '#fff' : DARK,
                              boxShadow: active ? `0 4px 12px ${ACCENT}40` : 'none',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              transition: 'all .15s ease',
                              position: 'relative',
                            }}
                          >
                            <span style={{
                              fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              opacity: active ? 0.9 : 0.65,
                            }}>{d.weekday}</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{d.day}</span>
                            <span style={{ fontSize: '0.62rem', opacity: active ? 0.85 : 0.5 }}>{d.month}</span>
                            {d.count > 0 && (
                              <span style={{
                                position: 'absolute', top: 4, right: 4,
                                minWidth: 16, height: 16, padding: '0 4px',
                                borderRadius: 8,
                                background: active ? 'rgba(255,255,255,0.85)' : ACCENT2,
                                color: active ? ACCENT : '#fff',
                                fontSize: '0.62rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                lineHeight: 1,
                              }}>{d.count}</span>
                            )}
                            {isToday && !active && (
                              <span style={{
                                position: 'absolute', bottom: 3,
                                width: 4, height: 4, borderRadius: '50%',
                                background: ACCENT,
                              }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button className="cp-cal-nav" onClick={() => setStripOffset(o => o + 7)} title="Позже">›</button>
                    {stripOffset !== 0 && (
                      <button
                        className="cp-cal-nav"
                        style={{ width: 'auto', padding: '0 12px', fontSize: '0.78rem', fontWeight: 600 }}
                        onClick={() => setStripOffset(0)}
                        title="К сегодня"
                      >Сегодня</button>
                    )}
                  </div>
                </section>

                {selectedDate && (
                  <section style={{ marginBottom: 8 }}>
                    <div style={sectionHeaderRow}>
                      <div>
                        <h2 style={sectionTitleStyle}>
                          {(() => {
                            const [y, m, d] = selectedDate.split('-').map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                          })()}
                        </h2>
                        <p style={sectionSubStyle}>
                          {selectedDayPosts.length === 0 ? 'На этот день постов нет' : `Постов на день: ${selectedDayPosts.length}`}
                        </p>
                      </div>
                      <button className="cp-ghost"
                        style={{ ...ghostBtn, opacity: isPastDate(selectedDate) ? 0.45 : 1, cursor: isPastDate(selectedDate) ? 'not-allowed' : 'pointer' }}
                        disabled={isPastDate(selectedDate)}
                        title={isPastDate(selectedDate) ? 'Дата уже прошла — нельзя создать пост' : undefined}
                        onClick={() => openCreate(selectedDate)}>
                        <PlusIcon /> {selectedDayPosts.length === 0 ? 'Создать пост' : 'Добавить пост'}
                      </button>
                    </div>
                    {selectedDayPosts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {selectedDayPosts.map((p, i) => renderDayCard(p, i))}
                      </div>
                    ) : (
                      <div style={{
                        ...cardBase,
                        padding: '32px 24px',
                        textAlign: 'center',
                        background: SOFT_BG,
                        borderStyle: 'dashed',
                      }}>
                        <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>📅</div>
                        <p style={{ margin: '0 0 16px', color: MUTED, fontSize: '0.92rem', lineHeight: 1.5 }}>
                          {isPastDate(selectedDate)
                            ? 'Эта дата уже прошла — пост создать нельзя.'
                            : 'На выбранную дату пока нет запланированных публикаций.'}
                        </p>
                        <button className="cp-primary"
                          style={{ ...primaryBtn, opacity: isPastDate(selectedDate) ? 0.45 : 1, cursor: isPastDate(selectedDate) ? 'not-allowed' : 'pointer' }}
                          disabled={isPastDate(selectedDate)}
                          onClick={() => openCreate(selectedDate)}>
                          <PlusIcon /> Создать пост
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {posts.length === 0 && (
                  <EmptyContent onCreate={openCreate} />
                )}
              </>
            )}

            {viewMode === 'list' && (() => {
              const counts = {
                scheduled: posts.filter(p => p.status === 'scheduled').length,
                published: posts.filter(p => p.status === 'published').length,
                draft:     posts.filter(p => p.status === 'draft').length,
              };
              const STATUS_TABS = [
                { id: 'scheduled', label: 'Ожидание',   emoji: '📅', color: ACCENT },
                { id: 'published', label: 'Опубликовано', emoji: '✓',  color: SUCCESS },
                { id: 'draft',     label: 'Черновики',  emoji: '📝', color: WARNING },
              ];
              const filtered = posts
                .filter(p => p.status === listStatus)
                .sort((a, b) => {
                  // Ожидание: ближайшая дата сверху; Опубликовано/Черновик: новые сверху
                  if (listStatus === 'scheduled') {
                    return new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0);
                  }
                  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                });
              const emptyByStatus = {
                scheduled: 'Нет запланированных постов',
                published: 'Здесь появятся опубликованные посты',
                draft:     'Черновики появятся, как только начнёте писать новый пост',
              };
              return (
                <section>
                  <div style={{ ...sectionHeaderRow, marginBottom: 14 }}>
                    <div>
                      <h2 style={sectionTitleStyle}>Все публикации</h2>
                      <p style={sectionSubStyle}>
                        {posts.length === 0 ? 'Создайте первую публикацию' : `Всего: ${posts.length}`}
                      </p>
                    </div>
                  </div>

                  {/* Status sub-tabs */}
                  <div role="tablist" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: 4, borderRadius: 12,
                    background: SOFT_BG, border: `1px solid ${BORDER}`,
                    marginBottom: 16, flexWrap: 'wrap',
                  }}>
                    {STATUS_TABS.map(t => {
                      const active = listStatus === t.id;
                      const cnt = counts[t.id];
                      return (
                        <button
                          key={t.id}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setListStatus(t.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', borderRadius: 8, border: 'none',
                            cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
                            color: active ? '#fff' : DARK,
                            background: active ? t.color : 'transparent',
                            boxShadow: active ? `0 3px 10px ${t.color}40` : 'none',
                            transition: 'all .15s ease',
                          }}
                        >
                          <span>{t.emoji}</span>
                          {t.label}
                          <span style={{
                            minWidth: 22, padding: '1px 7px', borderRadius: 10,
                            fontSize: '0.72rem', fontWeight: 700,
                            background: active ? 'rgba(255,255,255,0.25)' : `${t.color}15`,
                            color: active ? '#fff' : t.color,
                          }}>{cnt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {filtered.length === 0 ? (
                    posts.length === 0
                      ? <EmptyContent onCreate={openCreate} />
                      : <div style={{
                          padding: '40px 24px', textAlign: 'center',
                          borderRadius: 14, background: '#fff', border: `1px solid ${BORDER}`,
                        }}>
                          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>{STATUS_TABS.find(t => t.id === listStatus)?.emoji}</div>
                          <div style={{ fontSize: '0.92rem', color: MUTED, marginBottom: 16 }}>{emptyByStatus[listStatus]}</div>
                          <button className="cp-primary" style={primaryBtn} onClick={() => openCreate()}>
                            <PlusIcon /> Создать пост
                          </button>
                        </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {filtered.map((p, i) => renderDayCard(p, i))}
                    </div>
                  )}
                </section>
              );
            })()}

            {viewMode === 'ai-content' && (
              <AiContentTab
                tc={tc}
                channelId={currentChannel?.id}
                leadMagnets={leadMagnets}
                onSwitchView={(mode) => {
                  setViewMode(mode);
                  loadPosts();
                }}
              />
            )}

            {viewMode === 'files' && (
              <FilesLibraryTab tc={tc} />
            )}

          </>
        )}

        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {editingPost && editingPost.status === 'draft' ? 'Черновик'
                : editingPost ? 'Редактировать пост'
                : 'Создать пост'}
              {(draftSavingState === 'saving' || draftSavingState === 'saved') && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600,
                  padding: '3px 8px', borderRadius: 10,
                  background: draftSavingState === 'saving' ? 'rgba(245, 158, 11, 0.10)' : 'rgba(16, 185, 129, 0.10)',
                  color: draftSavingState === 'saving' ? '#f59e0b' : '#10b981',
                  letterSpacing: '0.02em',
                }}>
                  {draftSavingState === 'saving' ? '⏳ Сохраняем…' : '✓ Черновик сохранён'}
                </span>
              )}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Заголовок</label>
              <input className="cp-input" style={inputStyle} placeholder="Заголовок поста (необязательно)" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <div style={hintStyle}>Внутренний заголовок для навигации. В канал отправляется только текст поста.</div>
            </div>

            <div ref={messageRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Текст поста *</label>
                <button
                  type="button"
                  onClick={() => setAiGenMode('text')}
                  disabled={!tc}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    cursor: tc ? 'pointer' : 'not-allowed',
                    background: 'linear-gradient(135deg, #4361ee 0%, #7b68ee 100%)',
                    color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                    boxShadow: '0 3px 10px rgba(67, 97, 238, 0.30)',
                    opacity: tc ? 1 : 0.5,
                  }}
                >🪄 Сгенерировать</button>
              </div>
              <div className={errors.message_text ? 'field-error-wrapper' : ''}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={val => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст публикации... Поддерживает HTML: <b>жирный</b>, <i>курсив</i>, <a href='URL'>ссылка</a>"
                  rows={6}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                  hasFile={!!(postFile || (!removeExistingFile && editingPost?.file_path))}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Вложение</label>
                <button
                  type="button"
                  onClick={() => setAiGenMode('image')}
                  disabled={!tc}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    cursor: tc ? 'pointer' : 'not-allowed',
                    background: 'linear-gradient(135deg, #7b68ee 0%, #a855f7 100%)',
                    color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                    boxShadow: '0 3px 10px rgba(123, 104, 238, 0.30)',
                    opacity: tc ? 1 : 0.5,
                  }}
                >🖼 ИИ Картинка</button>
              </div>
              <AttachmentPicker
                file={postFile}
                onFileChange={setPostFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={!removeExistingFile ? (editingPost?.file_type || '') : ''}
                existingFileUrl={!removeExistingFile && editingPost?.file_path ? '/uploads/' + editingPost.file_path.split('/uploads/').pop() : ''}
                onRemoveExisting={editingPost?.file_path ? () => setRemoveExistingFile(true) : undefined}
              />
              <div style={hintStyle}>Фото, видео или документ. Максимум 50 МБ.</div>

              {/* Доп. фото для медиа-группы (всего до 10) */}
              {(postFile || extraFiles.length > 0) && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(67, 97, 238, 0.04)', border: '1px dashed rgba(67, 97, 238, 0.30)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#4361ee' }}>
                      📷 Доп. фото к альбому ({1 + extraFiles.length} / 10)
                    </span>
                    {1 + extraFiles.length < 10 && (
                      <button type="button"
                        onClick={() => document.getElementById('extra-files-input')?.click()}
                        style={{
                          background: 'none', border: '1px solid #4361ee', color: '#4361ee',
                          borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                        }}>+ Добавить фото</button>
                    )}
                  </div>
                  <input id="extra-files-input" type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => {
                      const fs = Array.from(e.target.files || []);
                      setExtraFiles(prev => {
                        const slots = 10 - 1 - prev.length;
                        return [...prev, ...fs.slice(0, slots)];
                      });
                      e.target.value = '';
                    }} />
                  {extraFiles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {extraFiles.map((f, i) => (
                        <div key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: '#fff', borderRadius: 8, padding: '4px 8px',
                          fontSize: 11, border: '1px solid #e5e7eb',
                        }}>
                          📎 {f.name.length > 22 ? f.name.slice(0, 19) + '…' : f.name}
                          <button type="button" onClick={() => setExtraFiles(p => p.filter((_, x) => x !== i))}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                    При публикации все фото уйдут одним альбомом (медиа-группой). Текст — общим caption.
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Дата публикации (МСК)</label>
              <input
                className="cp-input"
                type="datetime-local"
                value={form.scheduled_at}
                min={nowMskString()}
                onChange={e => {
                  setForm(p => ({ ...p, scheduled_at: e.target.value }));
                  if (e.target.value) setErrors(er => ({ ...er, scheduled_at: '' }));
                }}
                style={{
                  ...inputStyle,
                  borderColor: (errors.scheduled_at || isScheduledInPast()) ? '#e63946' : inputStyle.border?.split(' ')[2] || '#f0f0f0',
                  boxShadow: (errors.scheduled_at || isScheduledInPast()) ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
                }}
              />
              {(errors.scheduled_at || isScheduledInPast()) ? (
                <div style={{ ...hintStyle, color: '#e63946', fontWeight: 600 }}>
                  ⚠️ {errors.scheduled_at || 'Нельзя запланировать в прошедшем времени (МСК)'}
                </div>
              ) : (
                <div style={hintStyle}>Пост будет опубликован автоматически в указанное время по МСК.</div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Инлайн-кнопки</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={leadMagnets.length > 0}
                polls={polls}
                showPoll={pollsVis.visibility === 'visible' && polls.length > 0}
                streams={streams}
                showStream={streamsVis.visibility === 'visible' && streams.length > 0}
              />
              <div style={hintStyle}>Кнопки под постом: ссылки, выдача лид-магнитов и др.</div>
            </div>

            <div>
              <label style={labelStyle}>Маркировка рекламы (ERID)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="cp-input" style={{ ...inputStyle, flex: 1 }} placeholder="Введите ERID или получите автоматически" value={form.erid}
                  onChange={e => setForm(p => ({ ...p, erid: e.target.value }))} />
                <button type="button" className="cp-ghost" style={{ ...ghostBtn, whiteSpace: 'nowrap' }}
                  onClick={() => setShowEridModal(true)}>
                  Получить ERID
                </button>
              </div>
              {form.erid && (
                <div style={{ ...hintStyle, color: SUCCESS, fontWeight: 600 }}>
                  ERID: {form.erid} — будет добавлен к посту при публикации
                </div>
              )}
            </div>

            <MessagePreview
              messageText={form.message_text}
              buttons={form.inline_buttons}
              file={postFile}
              extraFiles={extraFiles}
              fileUrl={!postFile && !removeExistingFile && editingPost?.file_path ? '/uploads/' + editingPost.file_path.split('/uploads/').pop() : ''}
              tc={tc}
              entityType="content"
              entityId={editingPost?.id}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="cp-ghost" style={ghostBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button
                className="cp-primary"
                style={{ ...primaryBtn, opacity: saving || isScheduledInPast() ? 0.6 : 1, cursor: saving || isScheduledInPast() ? 'not-allowed' : 'pointer' }}
                onClick={handleSave}
                disabled={saving || isScheduledInPast()}
                title={isScheduledInPast() ? 'Нельзя запланировать в прошедшем времени' : ''}
              >
                {saving ? 'Сохранение...' : 'Запланировать'}
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

        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Удалить пост?"
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                  background: '#fff', border: '1px solid #e5e7eb', color: '#1a1a2e',
                  fontSize: '0.88rem', fontWeight: 600,
                }}
              >Отмена</button>
              <button
                onClick={performDelete}
                style={{
                  padding: '10px 18px', borderRadius: 10, cursor: 'pointer', border: 'none',
                  background: 'linear-gradient(135deg, #e63946, #b71c1c)',
                  color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(230,57,70,0.40)',
                }}
              >Удалить безвозвратно</button>
            </div>
          }
        >
          <div style={{ padding: '6px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 48, height: 48, borderRadius: 12,
                background: 'rgba(230,57,70,0.10)', color: '#e63946',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem',
              }}>⚠️</div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600, color: '#1a1a2e' }}>
                  Вы точно хотите удалить этот пост? Он удалится безвозвратно.
                </p>
                {deleteConfirm?.title && (
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    «{deleteConfirm.title}»
                  </p>
                )}
              </div>
            </div>
          </div>
        </Modal>

        <AiPostGenModal
          isOpen={!!aiGenMode}
          onClose={() => setAiGenMode(null)}
          mode={aiGenMode || 'text'}
          tc={tc}
          onSuccess={async (result) => {
            if (aiGenMode === 'text') {
              // Подставляем текст в основное поле
              setForm(p => ({ ...p, message_text: result }));
              setErrors(e => ({ ...e, message_text: '' }));
            } else if (aiGenMode === 'image') {
              // result = /uploads/ai_post_img_*.png — скачиваем как File
              try {
                const resp = await fetch(result);
                const blob = await resp.blob();
                const filename = result.split('/').pop() || 'ai_image.png';
                const f = new File([blob], filename, { type: blob.type || 'image/png' });
                setPostFile(f);
                setForm(p => ({ ...p, attach_type: 'photo' }));
                setRemoveExistingFile(false);
              } catch (e) {
                showToast('Не удалось приложить картинку: ' + (e.message || ''), 'error');
              }
            }
          }}
        />
      </div>
    </Paywall>
  );
}
