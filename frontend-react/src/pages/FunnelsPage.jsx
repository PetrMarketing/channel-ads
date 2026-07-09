import { useState, useEffect, useCallback, useRef } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';
import UploadProgress from '../components/UploadProgress';
import { usePageOnboarding } from '../components/OnboardingTour';

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

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
  active:  { label: 'Активна',   grad: [SUCCESS, '#34d399'],   soft: 'rgba(16,185,129,0.10)', text: SUCCESS },
  paused:  { label: 'Пауза',     grad: [MUTED, '#9ca3af'],     soft: 'rgba(107,114,128,0.10)', text: MUTED },
  draft:   { label: 'Черновик',  grad: [WARNING, '#f97316'],   soft: 'rgba(245,158,11,0.10)', text: WARNING },
};

const DEFAULT_DELAY = {
  delayType: 'after_seconds',
  delayValue: 60,
  delayUnit: 'minutes',
  delayDays: 1,
  delayTime: '10:00',
  delayWeekday: 1,
  delayDatetime: '',
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

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const animStyle = (i) => ({
  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

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

const previewPanelStyle = {
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: '0.85rem',
  color: DARK,
  lineHeight: 1.55,
  maxHeight: 90,
  overflowY: 'auto',
  wordBreak: 'break-word',
};

const radioCardStyle = (active) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
  border: `1.5px solid ${active ? ACCENT : BORDER}`,
  background: active ? `linear-gradient(135deg, ${ACCENT}08, ${ACCENT2}08)` : '#fff',
  fontSize: '0.84rem', color: DARK, fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease',
});

function delayToMinutes(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime) {
  switch (delayType) {
    case 'after_seconds': {
      const v = delayValue || 0;
      if (delayUnit === 'seconds') return Math.max(1, Math.round(v / 60));
      if (delayUnit === 'minutes') return v;
      if (delayUnit === 'hours') return v * 60;
      if (delayUnit === 'days') return v * 1440;
      return v;
    }
    case 'at_day_time': {
      const d = delayDays || 1;
      const [h, m] = (delayTime || '10:00').split(':').map(Number);
      return d * 1440 + (h || 0) * 60 + (m || 0);
    }
    case 'at_weekday_time': {
      return 1440;
    }
    case 'at_exact_date': {
      if (!delayDatetime) return 60;
      const diff = Math.round((new Date(delayDatetime).getTime() - Date.now()) / 60000);
      return Math.max(1, diff);
    }
    default:
      return 60;
  }
}

function buildDelayConfig(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime) {
  switch (delayType) {
    case 'after_seconds':
      return { type: 'after_seconds', value: delayValue || 0, unit: delayUnit || 'minutes' };
    case 'at_day_time':
      return { type: 'at_day_time', days: delayDays || 1, time: delayTime || '10:00' };
    case 'at_weekday_time':
      return { type: 'at_weekday_time', weekday: delayWeekday ?? 1, time: delayTime || '10:00' };
    case 'at_exact_date':
      return { type: 'at_exact_date', datetime: delayDatetime || '' };
    default:
      return { type: 'after_seconds', value: 60, unit: 'minutes' };
  }
}

function parseDelayConfig(step) {
  if (step.delay_config) {
    const cfg = typeof step.delay_config === 'string' ? JSON.parse(step.delay_config) : step.delay_config;
    switch (cfg.type) {
      case 'after_seconds':
        return {
          delayType: 'after_seconds',
          delayValue: cfg.value ?? 60,
          delayUnit: cfg.unit || 'minutes',
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: DEFAULT_DELAY.delayTime,
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_day_time':
        return {
          delayType: 'at_day_time',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: cfg.days ?? 1,
          delayTime: cfg.time || '10:00',
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_weekday_time':
        return {
          delayType: 'at_weekday_time',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: cfg.time || '10:00',
          delayWeekday: cfg.weekday ?? 1,
          delayDatetime: DEFAULT_DELAY.delayDatetime,
        };
      case 'at_exact_date':
        return {
          delayType: 'at_exact_date',
          delayValue: DEFAULT_DELAY.delayValue,
          delayUnit: DEFAULT_DELAY.delayUnit,
          delayDays: DEFAULT_DELAY.delayDays,
          delayTime: DEFAULT_DELAY.delayTime,
          delayWeekday: DEFAULT_DELAY.delayWeekday,
          delayDatetime: cfg.datetime || '',
        };
      default:
        break;
    }
  }
  const mins = step.delay_minutes ?? 60;
  let unit = 'minutes';
  let value = mins;
  if (mins >= 1440 && mins % 1440 === 0) { unit = 'days'; value = mins / 1440; }
  else if (mins >= 60 && mins % 60 === 0) { unit = 'hours'; value = mins / 60; }
  return { ...DEFAULT_DELAY, delayValue: value, delayUnit: unit };
}

function scrollToRef(ref) {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current.classList.add('field-shake');
    setTimeout(() => ref.current.classList.remove('field-shake'), 500);
  }
}

function getFunnelStatus(lm) {
  const steps = lm.steps || [];
  if (steps.length === 0) return 'draft';
  const hasActive = steps.some(s => s.is_active !== false);
  return hasActive ? 'active' : 'paused';
}

function FunnelIcon({ size = 26, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h18l-7 9v6l-4 2v-8z" />
    </svg>
  );
}

function BranchIcon({ size = 54, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="4" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="20" r="2" />
      <path d="M6 6v12" />
      <path d="M6 12h10" />
      <path d="M6 12c0-4 4-8 10-8" strokeOpacity="0" />
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
      color: '#fff',
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

function EmptyFunnels() {
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
          <BranchIcon size={54} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.85rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>⚡</div>
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 20,
        background: `${ACCENT}10`, color: ACCENT,
        fontSize: '0.72rem', fontWeight: 600,
        letterSpacing: '0.02em', marginBottom: 12,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
        Автоматизация
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Сначала создайте лид-магнит
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 460, lineHeight: 1.55,
      }}>
        Воронки запускаются после получения лид-магнита подписчиком. Создайте лид-магнит в разделе «Закрепы», а затем настройте цепочку автосообщений здесь.
      </p>
    </div>
  );
}

export default function FunnelsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [selectedLm, setSelectedLm] = useState(null);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [form, setForm] = useState({ message_text: '', inline_buttons: '', attach_type: '' });
  const [delayType, setDelayType] = useState(DEFAULT_DELAY.delayType);
  const [delayValue, setDelayValue] = useState(DEFAULT_DELAY.delayValue);
  const [delayUnit, setDelayUnit] = useState(DEFAULT_DELAY.delayUnit);
  const [delayDays, setDelayDays] = useState(DEFAULT_DELAY.delayDays);
  const [delayTime, setDelayTime] = useState(DEFAULT_DELAY.delayTime);
  const [delayWeekday, setDelayWeekday] = useState(DEFAULT_DELAY.delayWeekday);
  const [delayDatetime, setDelayDatetime] = useState(DEFAULT_DELAY.delayDatetime);
  const [stepFile, setStepFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const messageRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const { overlay: pageTour } = usePageOnboarding('funnels', [
    { selector: '[data-tour-page="funnels-add-step"]', title: 'Цепочки автосообщений', text: 'Воронка привязана к лид-магниту. Каждый шаг отправляется подписчику с заданной задержкой после получения лид-магнита.', placement: 'bottom' },
  ]);

  const loadFunnels = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/funnels/${tc}`);
      if (data.success) setFunnels(data.funnels || []);
    } catch {
      showToast('Ошибка загрузки воронок', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/pins/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.lead_magnets || data.leadMagnets || []);
    } catch {
      // silent
    }
  }, [tc]);

  useEffect(() => { loadFunnels(); }, [loadFunnels]);
  useEffect(() => { loadLeadMagnets(); }, [loadLeadMagnets]);

  const resetDelayState = () => {
    setDelayType(DEFAULT_DELAY.delayType);
    setDelayValue(DEFAULT_DELAY.delayValue);
    setDelayUnit(DEFAULT_DELAY.delayUnit);
    setDelayDays(DEFAULT_DELAY.delayDays);
    setDelayTime(DEFAULT_DELAY.delayTime);
    setDelayWeekday(DEFAULT_DELAY.delayWeekday);
    setDelayDatetime(DEFAULT_DELAY.delayDatetime);
  };

  const openCreateStep = (lm) => {
    setSelectedLm(lm);
    setEditingStep(null);
    setForm({ message_text: '', inline_buttons: '', attach_type: '' });
    resetDelayState();
    setStepFile(null);
    setErrors({});
    setShowPreview(false);
    setShowModal(true);
  };

  const openEditStep = (lm, step) => {
    setSelectedLm(lm);
    setEditingStep(step);
    let btns = '';
    if (step.inline_buttons) {
      try {
        btns = typeof step.inline_buttons === 'string' ? step.inline_buttons : JSON.stringify(step.inline_buttons, null, 2);
      } catch { btns = ''; }
    }
    setForm({
      message_text: step.message_text || '',
      inline_buttons: btns,
      attach_type: step.attach_type || '',
    });
    const parsed = parseDelayConfig(step);
    setDelayType(parsed.delayType);
    setDelayValue(parsed.delayValue);
    setDelayUnit(parsed.delayUnit);
    setDelayDays(parsed.delayDays);
    setDelayTime(parsed.delayTime);
    setDelayWeekday(parsed.delayWeekday);
    setDelayDatetime(parsed.delayDatetime);
    setStepFile(null);
    setErrors({});
    setShowPreview(false);
    setShowModal(true);
  };

  const validate = () => {
    const newErrors = {};
    if (!form.message_text.trim()) newErrors.message_text = 'Текст сообщения обязателен';
    if (delayType === 'at_exact_date' && !delayDatetime) newErrors.datetime = 'Укажите дату и время отправки';
    setErrors(newErrors);
    if (newErrors.message_text) scrollToRef(messageRef);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (!selectedLm) return;
    setSaving(true);
    try {
      const computedMinutes = delayToMinutes(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime);
      const delayConfig = buildDelayConfig(delayType, delayValue, delayUnit, delayDays, delayTime, delayWeekday, delayDatetime);

      let inlineButtons = null;
      if (form.inline_buttons && form.inline_buttons.trim()) {
        try {
          inlineButtons = JSON.parse(form.inline_buttons);
        } catch {
          showToast('Неверный формат кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (stepFile) {
        const fd = new FormData();
        fd.append('message_text', form.message_text);
        fd.append('delay_minutes', computedMinutes);
        fd.append('delay_config', JSON.stringify(delayConfig));
        if (inlineButtons) fd.append('inline_buttons', JSON.stringify(inlineButtons));
        if (form.attach_type) fd.append('attach_type', form.attach_type);
        fd.append('file', stepFile);

        const progressCb = (p) => setUploadProgress(p);
        setUploadProgress(0);
        if (editingStep) {
          data = await api.upload(`/funnels/${tc}/${selectedLm.id}/steps/${editingStep.id}`, fd, 'PUT', progressCb);
        } else {
          data = await api.upload(`/funnels/${tc}/${selectedLm.id}/steps`, fd, 'POST', progressCb);
        }
      } else {
        const payload = {
          message_text: form.message_text,
          delay_minutes: computedMinutes,
          delay_config: delayConfig,
        };
        if (inlineButtons) payload.inline_buttons = inlineButtons;
        if (form.attach_type) payload.attach_type = form.attach_type;

        if (editingStep) {
          data = await api.put(`/funnels/${tc}/${selectedLm.id}/steps/${editingStep.id}`, payload);
        } else {
          data = await api.post(`/funnels/${tc}/${selectedLm.id}/steps`, payload);
        }
      }

      if (data.success) {
        showToast(editingStep ? 'Шаг обновлён' : 'Шаг создан');
        setShowModal(false);
        loadFunnels();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteStep = async (lm, step) => {
    if (!window.confirm('Удалить шаг воронки?')) return;
    try {
      const data = await api.delete(`/funnels/${tc}/${lm.id}/steps/${step.id}`);
      if (data.success) { showToast('Шаг удалён'); loadFunnels(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleCopyStep = async (lm, step) => {
    try {
      const data = await api.post(`/funnels/${tc}/${lm.id}/steps/${step.id}/copy`);
      if (data.success) { showToast('Шаг скопирован'); loadFunnels(); }
      else showToast(data.error || 'Ошибка копирования', 'error');
    } catch { showToast('Ошибка копирования', 'error'); }
    setOpenDropdownId(null);
  };

  const formatDelay = (minutes, delayCfg) => {
    if (delayCfg) {
      const cfg = typeof delayCfg === 'string' ? (() => { try { return JSON.parse(delayCfg); } catch { return null; } })() : delayCfg;
      if (cfg) {
        switch (cfg.type) {
          case 'after_seconds': {
            const v = cfg.value || 0;
            const u = cfg.unit || 'minutes';
            const labels = { seconds: 'сек.', minutes: 'мин.', hours: 'ч.', days: 'дн.' };
            return `${v} ${labels[u] || u}`;
          }
          case 'at_day_time':
            return `через ${cfg.days} дн. в ${cfg.time}`;
          case 'at_weekday_time':
            return `${WEEKDAYS[cfg.weekday] || '?'} в ${cfg.time}`;
          case 'at_exact_date':
            if (cfg.datetime) {
              const d = new Date(cfg.datetime);
              return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            }
            return 'дата не задана';
          default:
            break;
        }
      }
    }
    if (minutes < 60) return `${minutes} мин.`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} ч.`;
    return `${Math.round(minutes / 1440)} дн.`;
  };

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .fp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .fp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .fp-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .fp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .fp-input:focus, .fp-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .fp-step:hover {
          border-color: ${ACCENT}40 !important;
          background: #fff !important;
        }
        .fp-step:hover .fp-step-x {
          opacity: 1 !important;
        }
        .fp-radio:hover {
          border-color: ${ACCENT}55 !important;
        }
        .fp-dd-item:hover {
          background: ${SOFT_BG} !important;
          color: ${ACCENT} !important;
        }
        .fp-dd-item-danger:hover {
          background: rgba(230,57,70,0.08) !important;
        }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease' }}>
        <section style={pageHeaderWrap}>
          <div style={pageHeaderBlur1} />
          <div style={pageHeaderBlur2} />
          <div style={pageHeaderRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                Автоворонки
              </div>
              <h1 style={pageTitleStyle}>Воронки</h1>
              <p style={pageSubStyle}>
                Автоматические цепочки сообщений после подписки на лид-магнит
              </p>
            </div>
          </div>
        </section>

        {loading ? <Loading /> : funnels.length === 0 ? (
          <EmptyFunnels />
        ) : (
          <section>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              marginBottom: 14, flexWrap: 'wrap', gap: 10,
            }}>
              <div>
                <h2 style={sectionTitleStyle}>Активные воронки</h2>
                <p style={sectionSubStyle}>Всего: {funnels.length}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {funnels.map((lm, idx) => {
                const status = getFunnelStatus(lm);
                const meta = STATUS_META[status];
                const steps = lm.steps || [];
                const totalSent = steps.reduce((acc, s) => acc + (s.sent_count || 0), 0);

                return (
                  <div
                    key={lm.id}
                    className="fp-card"
                    style={{ ...cardBase, padding: 18, ...animStyle(idx) }}
                  >
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <GradientAvatar from={meta.grad[0]} to={meta.grad[1]}>
                        <FunnelIcon />
                      </GradientAvatar>

                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                            {lm.title || 'Без названия'}
                          </span>
                          <span style={pill(meta.soft, meta.text)}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                            {meta.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{
                            ...pill(SOFT_BG, MUTED),
                            border: `1px solid ${BORDER}`,
                            padding: '4px 10px',
                            fontSize: '0.74rem',
                          }}>
                            <span style={{ fontSize: '0.78rem' }}>🎁</span>
                            Лид-магнит · <b style={{ color: DARK, marginLeft: 2, fontWeight: 700 }}>{lm.code}</b>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: MUTED }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 6px ${ACCENT2}80` }} />
                            Шагов <b style={{ color: DARK, fontWeight: 700, marginLeft: 2 }}>{steps.length}</b>
                          </span>
                          {totalSent > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: MUTED }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: SUCCESS, boxShadow: `0 0 6px ${SUCCESS}80` }} />
                              Отправлено <b style={{ color: DARK, fontWeight: 700, marginLeft: 2 }}>{totalSent.toLocaleString('ru-RU')}</b>
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <button
                          className="fp-primary"
                          style={{ ...primaryBtn, padding: '8px 14px', fontSize: '0.82rem' }}
                          onClick={() => openCreateStep(lm)}
                          data-tour-page="funnels-add-step"
                        >
                          <PlusIcon />
                          Шаг
                        </button>
                      </div>
                    </div>

                    {steps.length === 0 ? (
                      <div style={{
                        marginTop: 14, padding: '20px 16px',
                        background: SOFT_BG, borderRadius: 12,
                        border: `1px dashed ${BORDER}`,
                        textAlign: 'center',
                      }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: MUTED, lineHeight: 1.5 }}>
                          Нет шагов. Добавьте первый шаг, чтобы запустить воронку.
                        </p>
                      </div>
                    ) : (
                      <div style={{ marginTop: 16, position: 'relative' }}>
                        <div style={{
                          position: 'absolute', left: 19, top: 8, bottom: 8,
                          width: 2, borderRadius: 2,
                          backgroundImage: `repeating-linear-gradient(to bottom, ${ACCENT}55 0 4px, transparent 4px 8px)`,
                          pointerEvents: 'none',
                        }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                          {steps.map((step) => (
                            <div
                              key={step.id}
                              className="fp-step"
                              style={{
                                position: 'relative',
                                display: 'flex', gap: 12, alignItems: 'flex-start',
                                padding: '12px 14px',
                                background: SOFT_BG,
                                borderRadius: 12,
                                border: `1px solid ${BORDER}`,
                                transition: 'border-color .15s ease, background .15s ease',
                              }}
                            >
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                                color: '#fff', fontWeight: 800, fontSize: '0.9rem',
                                letterSpacing: '-0.01em',
                                boxShadow: `0 3px 10px ${ACCENT}40`,
                                position: 'relative', overflow: 'hidden',
                                zIndex: 1,
                              }}>
                                <div style={{
                                  position: 'absolute', inset: 0,
                                  backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.28), transparent 60%)',
                                }} />
                                <span style={{ position: 'relative' }}>{step.step_number}</span>
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{
                                    ...pill(`${ACCENT}10`, ACCENT),
                                    padding: '3px 9px',
                                    fontSize: '0.7rem',
                                  }}>
                                    <span style={{ fontSize: '0.72rem' }}>⏱</span>
                                    {formatDelay(step.delay_minutes, step.delay_config)}
                                  </span>
                                  {step.inline_buttons && (
                                    <span style={pill('rgba(123,104,238,0.10)', ACCENT2)}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT2 }} />
                                      Кнопки
                                    </span>
                                  )}
                                  {step.file_url && (
                                    <span style={pill('rgba(245,158,11,0.10)', WARNING)}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: WARNING }} />
                                      Файл
                                    </span>
                                  )}
                                  {step.is_active === false && (
                                    <span style={pill('rgba(230,57,70,0.10)', DANGER)}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: DANGER }} />
                                      Неактивен
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    background: '#fff',
                                    border: `1px solid ${BORDER}`,
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    fontSize: '0.85rem',
                                    color: DARK,
                                    lineHeight: 1.55,
                                    maxHeight: 110,
                                    overflowY: 'auto',
                                    wordBreak: 'break-word',
                                  }}
                                  dangerouslySetInnerHTML={{ __html: step.message_text || '' }}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start', position: 'relative' }}>
                                <button
                                  className="fp-ghost"
                                  style={iconGhostBtn}
                                  onClick={() => openEditStep(lm, step)}
                                  title="Редактировать"
                                >✎</button>
                                <div style={{ position: 'relative' }}>
                                  <button
                                    className="fp-ghost"
                                    style={iconGhostBtn}
                                    onClick={() => setOpenDropdownId(openDropdownId === step.id ? null : step.id)}
                                    title="Ещё"
                                  >⋮</button>
                                  {openDropdownId === step.id && (
                                    <div style={{
                                      position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                                      background: '#fff', border: `1px solid ${BORDER}`,
                                      borderRadius: 12,
                                      boxShadow: '0 12px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)',
                                      zIndex: 100, minWidth: 200, overflow: 'hidden',
                                      padding: 4,
                                      animation: 'dashFadeUp 0.2s ease both',
                                    }}>
                                      <button
                                        className="fp-dd-item"
                                        style={ddItem}
                                        onClick={() => handleCopyStep(lm, step)}
                                      >
                                        <span style={{ width: 18, textAlign: 'center' }}>📋</span> Копировать шаг
                                      </button>
                                      <div style={{ height: 1, background: BORDER, margin: '4px 6px' }} />
                                      <button
                                        className="fp-dd-item-danger"
                                        style={{ ...ddItem, color: DANGER }}
                                        onClick={() => { setOpenDropdownId(null); handleDeleteStep(lm, step); }}
                                      >
                                        <span style={{ width: 18, textAlign: 'center' }}>🗑</span> Удалить
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingStep ? 'Редактировать шаг' : `Добавить шаг: ${selectedLm?.title || ''}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div ref={messageRef}>
              <label style={labelStyle}>Текст сообщения *</label>
              <div className={`fp-input ${errors.message_text ? 'field-error-wrapper' : ''}`}>
                <RichTextEditor
                  value={form.message_text}
                  onChange={(val) => { setForm(p => ({ ...p, message_text: val })); if (val.trim()) setErrors(e => ({ ...e, message_text: '' })); }}
                  placeholder="Текст сообщения воронки... Поддерживает HTML: <b>, <i>, <a href>"
                  rows={5}
                  showEmoji={true}
                  className={errors.message_text ? 'field-error' : ''}
                  hasFile={!!(stepFile || editingStep?.file_url)}
                />
              </div>
              {errors.message_text && <div className="field-error-text">{errors.message_text}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 10 }}>
                <div style={hintStyle}>Это сообщение будет отправлено подписчику после задержки. Поддерживается HTML.</div>
                <button
                  type="button"
                  className={showPreview ? 'fp-primary' : 'fp-ghost'}
                  style={showPreview
                    ? { ...primaryBtn, padding: '6px 12px', fontSize: '0.78rem' }
                    : { ...ghostBtn, padding: '6px 12px', fontSize: '0.78rem' }
                  }
                  onClick={() => setShowPreview(p => !p)}
                >
                  Предпросмотр
                </button>
              </div>
              {showPreview && (
                <div style={{
                  background: '#1e1e2e', color: '#e0e0e0', borderRadius: 12,
                  padding: 16, maxWidth: 420, marginTop: 8,
                  fontSize: '0.9rem', lineHeight: 1.6, wordBreak: 'break-word',
                  boxShadow: '0 6px 18px rgba(30,30,46,0.3)',
                }}>
                  {form.message_text.trim()
                    ? <div dangerouslySetInnerHTML={{ __html: form.message_text }} />
                    : <span style={{ color: '#888' }}>Введите текст для предпросмотра</span>
                  }
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Вложение (опционально)</label>
              <AttachmentPicker
                file={stepFile}
                onFileChange={setStepFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingStep?.file_url ? 'файл прикреплён' : ''}
              />
            </div>

            <div>
              <label style={labelStyle}>Задержка отправки</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 4 }}>
                <label className="fp-radio" style={radioCardStyle(delayType === 'after_seconds')}>
                  <input type="radio" name="delayType" value="after_seconds" checked={delayType === 'after_seconds'}
                    onChange={() => setDelayType('after_seconds')} style={{ accentColor: ACCENT }} />
                  <span>Через N секунд / минут / часов / дней</span>
                </label>
                <label className="fp-radio" style={radioCardStyle(delayType === 'at_day_time')}>
                  <input type="radio" name="delayType" value="at_day_time" checked={delayType === 'at_day_time'}
                    onChange={() => setDelayType('at_day_time')} style={{ accentColor: ACCENT }} />
                  <span>Через N дней в HH:MM</span>
                </label>
                <label className="fp-radio" style={radioCardStyle(delayType === 'at_weekday_time')}>
                  <input type="radio" name="delayType" value="at_weekday_time" checked={delayType === 'at_weekday_time'}
                    onChange={() => setDelayType('at_weekday_time')} style={{ accentColor: ACCENT }} />
                  <span>В день недели в HH:MM</span>
                </label>
                <label className="fp-radio" style={radioCardStyle(delayType === 'at_exact_date')}>
                  <input type="radio" name="delayType" value="at_exact_date" checked={delayType === 'at_exact_date'}
                    onChange={() => setDelayType('at_exact_date')} style={{ accentColor: ACCENT }} />
                  <span>В конкретную дату и время</span>
                </label>
              </div>

              <div style={{
                marginTop: 12, padding: 14,
                background: SOFT_BG, borderRadius: 12,
                border: `1px solid ${BORDER}`,
              }}>
                {delayType === 'after_seconds' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>Через</span>
                    <input
                      className="fp-input"
                      type="number"
                      min={1}
                      value={delayValue}
                      onChange={e => setDelayValue(parseInt(e.target.value) || 1)}
                      style={{ ...inputStyle, width: 90 }}
                    />
                    <select
                      className="fp-input"
                      value={delayUnit}
                      onChange={e => setDelayUnit(e.target.value)}
                      style={{ ...inputStyle, width: 'auto', minWidth: 130 }}
                    >
                      <option value="seconds">секунды</option>
                      <option value="minutes">минуты</option>
                      <option value="hours">часы</option>
                      <option value="days">дни</option>
                    </select>
                  </div>
                )}

                {delayType === 'at_day_time' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>Через</span>
                    <input
                      className="fp-input"
                      type="number"
                      min={1}
                      value={delayDays}
                      onChange={e => setDelayDays(parseInt(e.target.value) || 1)}
                      style={{ ...inputStyle, width: 80 }}
                    />
                    <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>дн. в</span>
                    <input
                      className="fp-input"
                      type="time"
                      value={delayTime}
                      onChange={e => setDelayTime(e.target.value)}
                      style={{ ...inputStyle, width: 'auto' }}
                    />
                  </div>
                )}

                {delayType === 'at_weekday_time' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>В</span>
                    <select
                      className="fp-input"
                      value={delayWeekday}
                      onChange={e => setDelayWeekday(parseInt(e.target.value))}
                      style={{ ...inputStyle, width: 'auto', minWidth: 160 }}
                    >
                      {WEEKDAYS.map((name, i) => (
                        <option key={i} value={i}>{name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>в</span>
                    <input
                      className="fp-input"
                      type="time"
                      value={delayTime}
                      onChange={e => setDelayTime(e.target.value)}
                      style={{ ...inputStyle, width: 'auto' }}
                    />
                  </div>
                )}

                {delayType === 'at_exact_date' && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', color: MUTED, whiteSpace: 'nowrap' }}>Дата и время</span>
                      <input
                        className={`fp-input${errors.datetime ? ' field-error' : ''}`}
                        type="datetime-local"
                        value={delayDatetime}
                        onChange={e => { setDelayDatetime(e.target.value); if (e.target.value) setErrors(er => ({ ...er, datetime: '' })); }}
                        style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 220 }}
                      />
                    </div>
                    {errors.datetime && <div className="field-error-text">{errors.datetime}</div>}
                  </div>
                )}
              </div>
              <div style={hintStyle}>Задержка отсчитывается от момента получения лид-магнита подписчиком.</div>
            </div>

            <div>
              <label style={labelStyle}>Инлайн-кнопки (опционально)</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={(val) => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
            </div>

            {saving && uploadProgress > 0 && (
              <UploadProgress progress={uploadProgress} />
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="fp-ghost" style={ghostBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button
                className="fp-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (uploadProgress > 0 ? `Загрузка ${uploadProgress}%` : 'Сохранение...') : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}

const ddItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 12px',
  fontSize: '0.84rem',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  color: DARK,
  whiteSpace: 'nowrap',
  borderRadius: 8,
  fontWeight: 500,
  transition: 'background .15s ease, color .15s ease',
};
