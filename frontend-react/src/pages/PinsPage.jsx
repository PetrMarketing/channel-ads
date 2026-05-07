import { useState, useEffect, useCallback } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import ButtonBuilder from '../components/ButtonBuilder';
import AttachmentPicker from '../components/AttachmentPicker';
import MessagePreview from '../components/MessagePreview';
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

const STATUS_LABELS = { draft: 'Черновик', published: 'Опубликован' };

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

const animStyle = (i) => ({
  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

const codeChipStyle = {
  display: 'inline-block',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.72rem',
  padding: '3px 9px',
  borderRadius: 6,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color: ACCENT,
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

// SVG icons reused across cards/empty-states
function PinIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

function GiftIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
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

function GradientAvatar({ from, to, children, size = 52, halo = true }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      boxShadow: `0 4px 12px ${from}33`,
      position: 'relative', overflow: 'hidden',
    }}>
      {halo && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.25), transparent 60%)',
          pointerEvents: 'none',
        }} />
      )}
      <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))', display: 'inline-flex' }}>{children}</span>
    </div>
  );
}

// Bespoke empty-state for pins; mirrors LinksPage EmptyLinks pattern with WARNING accent badge
function EmptyPins({ onCreate }) {
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
          <PinIcon size={54} strokeWidth={1.7} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${WARNING}66`,
          border: '3px solid #fff',
        }}>★</div>
      </div>

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Создайте первый закреп
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 440, lineHeight: 1.55,
      }}>
        Закреплённый пост с кнопками подписки и выдачей лид-магнита. Бот опубликует и закрепит его в канале от вашего имени.
      </p>

      <button className="pins-primary" style={primaryBtn} onClick={onCreate}>
        <PlusIcon />
        Создать закреп
      </button>
    </div>
  );
}

// Bespoke empty-state for lead magnets; uses SUCCESS gradient + gift icon + ACCENT accent badge
function EmptyMagnets({ onCreate }) {
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
          background: `radial-gradient(circle, ${SUCCESS}30 0%, transparent 70%)`,
          animation: 'dashPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 14px 36px ${SUCCESS}45`,
          animation: 'heroBlobFloat 5s ease-in-out infinite',
        }}>
          <GiftIcon size={52} strokeWidth={1.7} />
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

      <h3 style={{
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em',
        color: DARK, margin: '0 0 8px',
      }}>
        Создайте первый лид-магнит
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 440, lineHeight: 1.55,
      }}>
        Файл или сообщение, которое бот отправит подписчику после нажатия кнопки в закрепе. Используется для конверсии в подписку.
      </p>

      <button className="pins-primary" style={primaryBtn} onClick={onCreate}>
        <PlusIcon />
        Создать лид-магнит
      </button>
    </div>
  );
}

// Toggle-card row used in lead-magnet modal for boolean settings; checkbox styled square with accent fill when checked
function ToggleCard({ checked, onChange, title, description }) {
  return (
    <label className="pins-toggle" style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px', borderRadius: 12,
      border: `1px solid ${checked ? `${ACCENT}55` : BORDER}`,
      background: checked ? `${ACCENT}08` : '#fff',
      cursor: 'pointer',
      transition: 'border-color .15s ease, background .15s ease',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span style={{
        flexShrink: 0,
        width: 20, height: 20, borderRadius: 6,
        border: `1.5px solid ${checked ? ACCENT : BORDER}`,
        background: checked ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
        transition: 'all .15s ease',
        boxShadow: checked ? `0 2px 6px ${ACCENT}40` : 'none',
      }}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
          {title}
        </span>
        {description && (
          <span style={{ display: 'block', fontSize: '0.76rem', color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function UploadProgress({ progress }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: MUTED, marginBottom: 6 }}>
        <span>Загрузка файла…</span>
        <span style={{ color: ACCENT, fontWeight: 700, letterSpacing: '-0.01em' }}>{progress}%</span>
      </div>
      <div style={{ width: '100%', height: 8, background: SOFT_BG, borderRadius: 999, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          borderRadius: 999,
          transition: 'width 0.2s',
          boxShadow: `0 0 12px ${ACCENT}55`,
        }} />
      </div>
    </div>
  );
}

export default function PinsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [pins, setPins] = useState([]);
  const [leadMagnets, setLeadMagnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showLmModal, setShowLmModal] = useState(false);
  const [editingPin, setEditingPin] = useState(null);
  const [editingLm, setEditingLm] = useState(null);
  const [pinForm, setPinForm] = useState({ title: '', message_text: '', lead_magnet_id: '', inline_buttons: '', attach_type: '' });
  const [pinFile, setPinFile] = useState(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [lmForm, setLmForm] = useState({ title: '', message_text: '', attach_type: '', subscribers_only: false, show_back_button: true });
  const [lmFile, setLmFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('pins');

  const { overlay: pageTour } = usePageOnboarding('pins', [
    { selector: '[data-tour-page="pins-create"]', title: 'Создание закрепа', text: 'Закреплённый пост с кнопками подписки. Бот опубликует и закрепит его в канале от вашего имени.', placement: 'bottom' },
    { selector: '[data-tour-page="pins-magnets-tab"]', title: 'Лид-магниты', text: 'Файлы, которые бот отправляет подписчику после нажатия кнопки в закрепе. Используются для конверсии в подписку.', placement: 'bottom' },
  ]);

  const [showInlineLm, setShowInlineLm] = useState(false);
  const [inlineLmForm, setInlineLmForm] = useState({ title: '', message_text: '', attach_type: '' });
  const [inlineLmFile, setInlineLmFile] = useState(null);

  const tc = currentChannel?.tracking_code;

  const loadPins = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/pins/${tc}`);
      if (data.success) setPins(data.pins || []);
    } catch {
      showToast('Ошибка загрузки пинов', 'error');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  const loadLeadMagnets = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/pins/${tc}/lead-magnets`);
      if (data.success) setLeadMagnets(data.leadMagnets || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadPins(); loadLeadMagnets(); }, [loadPins, loadLeadMagnets]);

  const openCreatePin = () => {
    setEditingPin(null);
    setPinForm({ title: '', message_text: '', lead_magnet_id: '', inline_buttons: '', attach_type: '' });
    setPinFile(null);
    setRemoveExistingFile(false);
    setShowInlineLm(false);
    setInlineLmForm({ title: '', message_text: '', attach_type: '' });
    setInlineLmFile(null);
    setShowPinModal(true);
  };

  const openEditPin = (pin) => {
    setEditingPin(pin);
    let btns = '';
    if (pin.inline_buttons) {
      try {
        btns = typeof pin.inline_buttons === 'string' ? pin.inline_buttons : JSON.stringify(pin.inline_buttons, null, 2);
      } catch { btns = ''; }
    }
    setPinForm({
      title: pin.title || '',
      message_text: pin.message_text || '',
      lead_magnet_id: pin.lead_magnet_id || '',
      inline_buttons: btns,
      attach_type: pin.attach_type || '',
    });
    setPinFile(null);
    setRemoveExistingFile(false);
    setShowInlineLm(false);
    setInlineLmForm({ title: '', message_text: '' });
    setInlineLmFile(null);
    setShowPinModal(true);
  };

  const handleSavePin = async () => {
    const title = pinForm.title.trim() || `Закреп от ${new Date().toLocaleDateString('ru-RU')}`;
    const formToSave = { ...pinForm, title };
    setSaving(true);
    setUploadProgress(0);
    try {
      let parsedButtons = null;
      if (formToSave.inline_buttons.trim()) {
        try {
          parsedButtons = JSON.parse(formToSave.inline_buttons);
        } catch {
          showToast('Неверный формат JSON для кнопок', 'error');
          setSaving(false);
          return;
        }
      }

      let data;
      if (pinFile) {
        const formData = new FormData();
        formData.append('title', formToSave.title);
        formData.append('message_text', formToSave.message_text);
        formData.append('lead_magnet_id', formToSave.lead_magnet_id || '');
        if (parsedButtons) {
          formData.append('inline_buttons', JSON.stringify(parsedButtons));
        }
        if (formToSave.attach_type) formData.append('attach_type', formToSave.attach_type);
        formData.append('file', pinFile);

        const progressCb = (p) => setUploadProgress(p);
        if (editingPin) {
          data = await api.upload(`/pins/${tc}/${editingPin.id}/upload`, formData, 'POST', progressCb);
        } else {
          data = await api.upload(`/pins/${tc}/upload`, formData, 'POST', progressCb);
        }
      } else {
        const payload = {
          title: formToSave.title,
          message_text: formToSave.message_text,
          lead_magnet_id: formToSave.lead_magnet_id || null,
        };
        if (parsedButtons) {
          payload.inline_buttons = parsedButtons;
        }
        if (formToSave.attach_type) payload.attach_type = formToSave.attach_type;
        if (removeExistingFile) payload.remove_file = true;
        if (editingPin) {
          data = await api.put(`/pins/${tc}/${editingPin.id}`, payload);
        } else {
          data = await api.post(`/pins/${tc}`, payload);
        }
      }

      if (data.success) {
        showToast(editingPin ? 'Пин обновлён' : 'Пин создан');
        setShowPinModal(false);
        setPinFile(null);
        loadPins();
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

  const handleDeletePin = async (id) => {
    if (!window.confirm('Удалить пин?')) return;
    try {
      const data = await api.delete(`/pins/${tc}/${id}`);
      if (data.success) { showToast('Пин удалён'); loadPins(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handlePublishPin = async (pin) => {
    try {
      const data = await api.post(`/pins/${tc}/${pin.id}/publish`);
      if (data.success) { showToast('Пин опубликован и закреплён'); loadPins(); }
      else showToast(data.error || 'Ошибка публикации', 'error');
    } catch { showToast('Ошибка публикации', 'error'); }
  };

  const handleUnpinPin = async (pin) => {
    try {
      const data = await api.post(`/pins/${tc}/${pin.id}/unpin`);
      if (data.success) { showToast('Сообщение откреплено'); loadPins(); }
      else showToast(data.error || 'Ошибка', 'error');
    } catch { showToast('Ошибка', 'error'); }
  };

  const openCreateLm = () => {
    setEditingLm(null);
    setLmForm({ title: '', message_text: '', attach_type: '', subscribers_only: false, show_back_button: true });
    setLmFile(null);
    setShowLmModal(true);
  };

  const openEditLm = (lm) => {
    setEditingLm(lm);
    setLmForm({ title: lm.title || '', message_text: lm.message_text || '', attach_type: lm.attach_type || '', subscribers_only: !!lm.subscribers_only, show_back_button: lm.show_back_button !== false });
    setLmFile(null);
    setShowLmModal(true);
  };

  const handleSaveLm = async () => {
    const lmTitle = lmForm.title.trim() || `Лид-магнит от ${new Date().toLocaleDateString('ru-RU')}`;
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('title', lmTitle);
      formData.append('message_text', lmForm.message_text);
      if (lmForm.attach_type) formData.append('attach_type', lmForm.attach_type);
      formData.append('subscribers_only', lmForm.subscribers_only ? 'true' : 'false');
      formData.append('show_back_button', lmForm.show_back_button ? 'true' : 'false');
      if (lmFile) formData.append('file', lmFile);

      const progressCb = lmFile ? (p) => setUploadProgress(p) : null;
      let data;
      if (editingLm) {
        data = await api.upload(`/pins/${tc}/lead-magnets/${editingLm.id}`, formData, 'PUT', progressCb);
      } else {
        data = await api.upload(`/pins/${tc}/lead-magnets`, formData, 'POST', progressCb);
      }
      if (data.success) {
        showToast(editingLm ? 'Лид-магнит обновлён' : 'Лид-магнит создан');
        setShowLmModal(false);
        setLmForm({ title: '', message_text: '', attach_type: '' });
        setLmFile(null);
        setEditingLm(null);
        loadLeadMagnets();
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteLm = async (id) => {
    if (!window.confirm('Удалить лид-магнит? Связанные лиды тоже будут удалены.')) return;
    try {
      const data = await api.delete(`/pins/${tc}/lead-magnets/${id}`);
      if (data.success) { showToast('Лид-магнит удалён'); loadLeadMagnets(); }
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleCreateInlineLm = async () => {
    const inlineTitle = inlineLmForm.title.trim() || `Лид-магнит от ${new Date().toLocaleDateString('ru-RU')}`;
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('title', inlineTitle);
      formData.append('message_text', inlineLmForm.message_text);
      if (inlineLmForm.attach_type) formData.append('attach_type', inlineLmForm.attach_type);
      if (inlineLmFile) formData.append('file', inlineLmFile);

      const progressCb = inlineLmFile ? (p) => setUploadProgress(p) : null;
      const data = await api.upload(`/pins/${tc}/lead-magnets`, formData, 'POST', progressCb);
      if (data.success) {
        showToast('Лид-магнит создан');
        const lmData = await api.get(`/pins/${tc}/lead-magnets`);
        if (lmData.success) {
          const updatedLms = lmData.leadMagnets || [];
          setLeadMagnets(updatedLms);
          // Auto-select the newly created lead magnet (list is DESC by created_at)
          if (updatedLms.length > 0) {
            const newLm = updatedLms[0];
            setPinForm(p => ({ ...p, lead_magnet_id: String(newLm.id) }));
          }
        }
        setShowInlineLm(false);
        setInlineLmForm({ title: '', message_text: '', attach_type: '' });
        setInlineLmFile(null);
      } else {
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Ошибка создания', 'error');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleLeadMagnetDropdownChange = (val) => {
    if (val === 'create_new') {
      setShowInlineLm(true);
      setPinForm(p => ({ ...p, lead_magnet_id: '' }));
    } else {
      setShowInlineLm(false);
      setPinForm(p => ({ ...p, lead_magnet_id: val }));
    }
  };

  const isPinsTab = activeTab === 'pins';
  const headerCtaLabel = isPinsTab ? 'Создать закреп' : 'Создать лид-магнит';
  const headerCtaAction = isPinsTab ? openCreatePin : openCreateLm;

  return (
    <Paywall>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .pins-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .pins-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .pins-ghost-accent:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px ${ACCENT}55 !important;
        }
        .pins-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .pins-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .pins-input:focus,
        .pins-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .pins-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 999px; cursor: pointer;
          background: transparent; border: 1px solid transparent;
          color: ${MUTED}; font-size: 0.86rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .18s ease;
        }
        .pins-tab:hover {
          color: ${DARK};
          background: ${SOFT_BG};
        }
        .pins-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .pins-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: ${SOFT_BG}; color: ${MUTED};
          transition: all .18s ease;
        }
        .pins-tab.active .pins-tab-count {
          background: rgba(255,255,255,0.22);
          color: #fff;
        }
        .pins-toggle:hover {
          border-color: ${ACCENT}55 !important;
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
                Контент канала
              </div>
              <h1 style={pageTitleStyle}>Закрепы</h1>
              <p style={pageSubStyle}>
                Закреплённые посты с кнопками подписки и лид-магниты для подписчиков
              </p>
            </div>
            <button
              data-tour-page={isPinsTab ? 'pins-create' : undefined}
              className="pins-primary"
              style={primaryBtn}
              onClick={headerCtaAction}
            >
              <PlusIcon />
              {headerCtaLabel}
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
            aria-selected={isPinsTab}
            className={`pins-tab${isPinsTab ? ' active' : ''}`}
            onClick={() => setActiveTab('pins')}
          >
            Пин-посты
            <span className="pins-tab-count">{pins.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={!isPinsTab}
            data-tour-page="pins-magnets-tab"
            className={`pins-tab${!isPinsTab ? ' active' : ''}`}
            onClick={() => setActiveTab('magnets')}
          >
            Лид-магниты
            <span className="pins-tab-count">{leadMagnets.length}</span>
          </button>
        </div>

        {isPinsTab && (
          <section>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Пин-посты</h2>
                <p style={sectionSubStyle}>
                  {pins.length === 0 ? 'Создайте первый закреп для канала' : `Всего: ${pins.length}`}
                </p>
              </div>
            </div>

            {loading ? <Loading /> : pins.length === 0 ? (
              <EmptyPins onCreate={openCreatePin} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pins.map((pin, i) => {
                  const isPublished = pin.status === 'published';
                  return (
                    <div
                      key={pin.id}
                      className="pins-card"
                      style={{ ...cardBase, padding: 18, ...animStyle(i) }}
                    >
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <GradientAvatar from={ACCENT} to={ACCENT2}>
                          <PinIcon size={26} />
                        </GradientAvatar>

                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                              {pin.title || 'Без названия'}
                            </span>
                            {isPublished ? (
                              <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                                {STATUS_LABELS.published}
                              </span>
                            ) : (
                              <span style={pill(SOFT_BG, MUTED)}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED }} />
                                {STATUS_LABELS.draft}
                              </span>
                            )}
                          </div>

                          {pin.message_text && (
                            <div
                              style={previewPanelStyle}
                              dangerouslySetInnerHTML={{ __html: pin.message_text }}
                            />
                          )}

                          <div style={{
                            display: 'flex', gap: 10, marginTop: 12, alignItems: 'center',
                            fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
                          }}>
                            {pin.lm_title && (
                              <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                                Лид-магнит · {pin.lm_title}
                              </span>
                            )}
                            {pin.published_at && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                                {new Date(pin.published_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <button className="pins-ghost" style={iconGhostBtn} onClick={() => openEditPin(pin)} title="Редактировать">✎</button>
                          <button
                            className="pins-ghost-accent"
                            style={iconAccentBtn}
                            onClick={() => handlePublishPin(pin)}
                            title={isPublished ? 'Обновить публикацию' : 'Опубликовать и закрепить'}
                          >
                            {isPublished ? '↻' : '▶'}
                          </button>
                          {isPublished && (
                            <button className="pins-ghost" style={iconGhostBtn} onClick={() => handleUnpinPin(pin)} title="Открепить">📌</button>
                          )}
                          <button className="pins-danger" style={dangerGhost} onClick={() => handleDeletePin(pin.id)} title="Удалить">🗑</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!isPinsTab && (
          <section>
            <div style={sectionHeaderRow}>
              <div>
                <h2 style={sectionTitleStyle}>Лид-магниты</h2>
                <p style={sectionSubStyle}>
                  {leadMagnets.length === 0 ? 'Файлы и материалы для подписчиков' : `Всего: ${leadMagnets.length}`}
                </p>
              </div>
            </div>

            {leadMagnets.length === 0 ? (
              <EmptyMagnets onCreate={openCreateLm} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {leadMagnets.map((lm, i) => (
                  <div
                    key={lm.id}
                    className="pins-card"
                    style={{ ...cardBase, padding: 18, ...animStyle(i) }}
                  >
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <GradientAvatar from={SUCCESS} to="#34d399">
                        <GiftIcon size={26} />
                      </GradientAvatar>

                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                            {lm.title}
                          </span>
                          {lm.code && (
                            <code style={codeChipStyle}>{lm.code}</code>
                          )}
                          {lm.file_type && (
                            <span style={pill('rgba(245,158,11,0.10)', WARNING)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING }} />
                              {lm.file_type}
                            </span>
                          )}
                          {lm.subscribers_only ? (
                            <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
                              Только подписчикам
                            </span>
                          ) : null}
                        </div>

                        {lm.message_text && (
                          <div
                            style={previewPanelStyle}
                            dangerouslySetInnerHTML={{ __html: lm.message_text }}
                          />
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <button className="pins-ghost" style={iconGhostBtn} onClick={() => openEditLm(lm)} title="Редактировать">✎</button>
                        <button className="pins-danger" style={dangerGhost} onClick={() => handleDeleteLm(lm.id)} title="Удалить">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <Modal isOpen={showPinModal} onClose={() => setShowPinModal(false)} title={editingPin ? 'Редактировать закреп' : 'Создать закреп'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Название</label>
              <input
                className="pins-input" style={inputStyle}
                placeholder="Закреп с лид-магнитом"
                value={pinForm.title}
                onChange={e => setPinForm(p => ({ ...p, title: e.target.value }))}
              />
              <div style={hintStyle}>Внутреннее название — клиенты его не увидят. Если оставить пустым, подставится дата.</div>
            </div>

            <div>
              <label style={labelStyle}>Текст сообщения</label>
              <RichTextEditor
                value={pinForm.message_text}
                onChange={v => setPinForm(p => ({ ...p, message_text: v }))}
                placeholder="Текст закреплённого сообщения..."
                rows={5}
                showEmoji={true}
                hasFile={!!(pinFile || (!removeExistingFile && editingPin?.file_path))}
              />
            </div>

            <div>
              <label style={labelStyle}>Вложение (опционально)</label>
              <AttachmentPicker
                file={pinFile}
                onFileChange={setPinFile}
                attachType={pinForm.attach_type}
                onAttachTypeChange={v => setPinForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={!removeExistingFile ? (editingPin?.file_type || '') : ''}
                existingFileUrl={!removeExistingFile && editingPin?.file_path ? '/uploads/' + editingPin.file_path.split('/uploads/').pop() : ''}
                onRemoveExisting={editingPin?.file_path ? () => setRemoveExistingFile(true) : undefined}
              />
            </div>

            <div>
              <label style={labelStyle}>Лид-магнит (опционально)</label>
              <select
                className="pins-input" style={inputStyle}
                value={showInlineLm ? 'create_new' : pinForm.lead_magnet_id}
                onChange={e => handleLeadMagnetDropdownChange(e.target.value)}
              >
                <option value="">— Без лид-магнита —</option>
                {leadMagnets.map(lm => (
                  <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                ))}
                <option value="create_new">+ Создать лид-магнит</option>
              </select>
              {!showInlineLm && leadMagnets.length === 0 && (
                <div style={hintStyle}>Нет лид-магнитов. Выберите «Создать лид-магнит» выше.</div>
              )}

              {showInlineLm && (
                <div style={{
                  marginTop: 12, padding: 16, borderRadius: 12,
                  background: 'rgba(16,185,129,0.04)', border: `1px solid ${SUCCESS}25`,
                  display: 'flex', flexDirection: 'column', gap: 12,
                  animation: 'dashFadeUp 0.3s ease both',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GradientAvatar from={SUCCESS} to="#34d399" size={36}>
                      <GiftIcon size={18} />
                    </GradientAvatar>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                        Новый лид-магнит
                      </div>
                      <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: 1 }}>
                        Будет создан и автоматически выбран для пина
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Название</label>
                    <input
                      className="pins-input" style={inputStyle}
                      placeholder="Бесплатный PDF-гайд"
                      value={inlineLmForm.title}
                      onChange={e => setInlineLmForm(p => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Сообщение при выдаче</label>
                    <RichTextEditor
                      value={inlineLmForm.message_text}
                      onChange={v => setInlineLmForm(p => ({ ...p, message_text: v }))}
                      placeholder="Вот ваш гайд! Скачайте файл ниже."
                      rows={3}
                      showEmoji={true}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Вложение</label>
                    <AttachmentPicker
                      file={inlineLmFile}
                      onFileChange={setInlineLmFile}
                      attachType={inlineLmForm.attach_type}
                      onAttachTypeChange={v => setInlineLmForm(p => ({ ...p, attach_type: v }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="pins-ghost" style={ghostBtn} onClick={() => setShowInlineLm(false)}>
                      Отмена
                    </button>
                    <button
                      className="pins-primary"
                      style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                      onClick={handleCreateInlineLm}
                      disabled={saving}
                    >
                      {saving ? 'Создание…' : 'Создать лид-магнит'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Инлайн-кнопки (опционально)</label>
              <ButtonBuilder
                value={pinForm.inline_buttons}
                onChange={v => setPinForm(p => ({ ...p, inline_buttons: v }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={true}
              />
            </div>

            {saving && uploadProgress > 0 && <UploadProgress progress={uploadProgress} />}

            <MessagePreview
              messageText={pinForm.message_text}
              buttons={pinForm.inline_buttons}
              file={pinFile}
              fileUrl={!pinFile && !removeExistingFile && editingPin?.file_path ? '/uploads/' + editingPin.file_path.split('/uploads/').pop() : ''}
              tc={tc}
              entityType="pin"
              entityId={editingPin?.id}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="pins-ghost" style={ghostBtn} onClick={() => setShowPinModal(false)}>
                Отмена
              </button>
              <button
                className="pins-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={handleSavePin}
                disabled={saving}
              >
                {saving ? (uploadProgress > 0 ? `Загрузка ${uploadProgress}%` : 'Сохранение…') : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showLmModal} onClose={() => setShowLmModal(false)} title={editingLm ? 'Редактировать лид-магнит' : 'Создать лид-магнит'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Название</label>
              <input
                className="pins-input" style={inputStyle}
                placeholder="Бесплатный PDF-гайд"
                value={lmForm.title}
                onChange={e => setLmForm(p => ({ ...p, title: e.target.value }))}
              />
              <div style={hintStyle}>Внутреннее название. Если оставить пустым, подставится дата.</div>
            </div>

            <div>
              <label style={labelStyle}>Сообщение при выдаче</label>
              <RichTextEditor
                value={lmForm.message_text}
                onChange={v => setLmForm(p => ({ ...p, message_text: v }))}
                placeholder="Вот ваш гайд! Скачайте файл ниже."
                rows={3}
                showEmoji={true}
                hasFile={!!(lmFile || editingLm?.file_path)}
              />
            </div>

            <div>
              <label style={labelStyle}>Вложение</label>
              <AttachmentPicker
                file={lmFile}
                onFileChange={setLmFile}
                attachType={lmForm.attach_type}
                onAttachTypeChange={v => setLmForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editingLm?.file_type || ''}
              />
            </div>

            {saving && uploadProgress > 0 && <UploadProgress progress={uploadProgress} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ToggleCard
                checked={lmForm.subscribers_only}
                onChange={v => setLmForm(p => ({ ...p, subscribers_only: v }))}
                title="Выдавать только подписчикам канала"
                description="Бот сначала проверит подписку, и только потом отправит файл"
              />
              <ToggleCard
                checked={lmForm.show_back_button}
                onChange={v => setLmForm(p => ({ ...p, show_back_button: v }))}
                title="Кнопка «Вернуться в канал»"
                description="Покажется под сообщением с лид-магнитом для возврата в канал"
              />
            </div>

            <MessagePreview
              messageText={lmForm.message_text}
              file={lmFile}
              tc={tc}
              entityType="lead_magnet"
              entityId={editingLm?.id}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="pins-ghost" style={ghostBtn} onClick={() => setShowLmModal(false)}>
                Отмена
              </button>
              <button
                className="pins-primary"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={handleSaveLm}
                disabled={saving}
              >
                {saving ? (uploadProgress > 0 ? `Загрузка ${uploadProgress}%` : 'Сохранение…') : (editingLm ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}
