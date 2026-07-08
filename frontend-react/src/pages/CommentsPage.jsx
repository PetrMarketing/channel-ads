import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
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

const AVATAR_GRADIENTS = [
  [ACCENT, ACCENT2],
  ['#3b82f6', '#06b6d4'],
  [SUCCESS, '#34d399'],
  [WARNING, '#f97316'],
  [DANGER, '#ef4444'],
  ['#a855f7', ACCENT2],
  ['#ec4899', '#f43f5e'],
];

const PALETTE_COLORS = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626'];

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
  fontSize: '0.88rem',
  color: DARK,
  lineHeight: 1.55,
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

function ChatBubbleIcon({ size = 24, color = '#fff', strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CheckIcon({ size = 16, color = '#fff', strokeWidth = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PaintIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill={color} />
      <circle cx="17.5" cy="10.5" r=".5" fill={color} />
      <circle cx="8.5" cy="7.5" r=".5" fill={color} />
      <circle cx="6.5" cy="12.5" r=".5" fill={color} />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.688-1.688h1.996c3.051 0 5.543-2.492 5.543-5.543C21.5 6.5 17 2 12 2z" />
    </svg>
  );
}

function ModerateIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function pickAvatarGradient(name) {
  const idx = (name || 'А').charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function GradientAvatar({ name, size = 44 }) {
  const [from, to] = pickAvatarGradient(name || 'А');
  const initial = (name || 'А')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      color: '#fff', fontWeight: 700, fontSize: size > 36 ? '1rem' : '0.85rem',
      letterSpacing: '-0.01em',
      boxShadow: `0 4px 12px ${from}33`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.28), transparent 60%)',
        pointerEvents: 'none',
      }} />
      <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>{initial}</span>
    </div>
  );
}

function ColorSwatch({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: value, border: `1px solid ${BORDER}`,
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        boxShadow: `0 2px 6px ${value}33`,
      }}>
        <input type="color" value={value} onChange={onChange}
          style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
      </div>
      <input
        className="cm-input"
        style={{ ...inputStyle, width: 110, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: '0.82rem' }}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function PaletteRow({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {PALETTE_COLORS.map(c => {
        const active = (value || '').toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ target: { value: c } })}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: c, border: active ? `2px solid ${DARK}` : `2px solid #fff`,
              boxShadow: active ? `0 0 0 2px ${c}, 0 4px 10px ${c}55` : `0 2px 6px ${c}55`,
              cursor: 'pointer',
              transition: 'transform .15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            title={c}
          />
        );
      })}
    </div>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex',
      padding: 4,
      gap: 4,
      borderRadius: 10,
      background: SOFT_BG,
      border: `1px solid ${BORDER}`,
    }}>
      {options.map(opt => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              color: active ? '#fff' : MUTED,
              background: active ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : 'transparent',
              boxShadow: active ? `0 3px 10px ${ACCENT}40` : 'none',
              transition: 'all .15s ease',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}

function EmptyComments() {
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
          <ChatBubbleIcon size={56} strokeWidth={1.7} />
        </div>
        <div style={{
          position: 'absolute', right: -4, bottom: -4,
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1.1rem', fontWeight: 800,
          boxShadow: `0 4px 12px ${SUCCESS}55`,
          border: '3px solid #fff',
        }}>✓</div>
      </div>

      <h3 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: DARK, margin: '0 0 8px' }}>
        Пока нет комментариев
      </h3>
      <p style={{ fontSize: '0.92rem', color: MUTED, margin: '0 auto', maxWidth: 440, lineHeight: 1.55 }}>
        Добавьте кнопку «Комментарии» к постам — здесь появятся комментарии подписчиков для модерации.
      </p>
    </div>
  );
}

function NoChannelStub() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{
          width: 92, height: 92, borderRadius: '50%', margin: '0 auto 18px',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 30px ${ACCENT}45`,
        }}>
          <ChatBubbleIcon size={42} strokeWidth={1.7} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: DARK, letterSpacing: '-0.02em', margin: 0 }}>
          Выберите канал
        </h3>
        <p style={{ fontSize: '0.88rem', color: MUTED, marginTop: 8 }}>
          Чтобы открыть модерацию комментариев, выберите канал в шапке.
        </p>
      </div>
    </div>
  );
}

const DIRECTION_OPTIONS = [
  { value: '0deg', label: 'Сверху вниз' },
  { value: '90deg', label: 'Слева направо' },
  { value: '135deg', label: 'По диагонали' },
  { value: '180deg', label: 'Снизу вверх' },
  { value: '45deg', label: 'Обратная диагональ' },
];

export default function CommentsPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;

  const [tab, setTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [settings, setSettings] = useState({
    primary_color: '#4F46E5', header_text: '',
    header_text_color: '#ffffff', page_text_color: '#1f2937',
    bg_type: 'color', bg_color: '#4F46E5',
    gradient_from: '#4F46E5', gradient_to: '#7C3AED', gradient_direction: '135deg',
    bg_image_url: '', overlay_opacity: 40, overlay_color: '#000000', blur: 0,
    page_bg_type: 'color', page_bg_color: '#ffffff',
    page_gradient_from: '#f5f5f5', page_gradient_to: '#e0e7ff', page_gradient_direction: '180deg',
    page_bg_image_url: '', page_overlay_opacity: 20, page_blur: 0,
  });
  const [bgFile, setBgFile] = useState(null);
  const [pageBgFile, setPageBgFile] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const { overlay: pageTour } = usePageOnboarding('comments', [
    { selector: '[data-tour-page="comments-tab"]', title: 'Модерация', text: 'Все комментарии в канале с возможностью ответить или удалить.', placement: 'bottom' },
    { selector: '[data-tour-page="settings-tab"]', title: 'Дизайн страницы', text: 'Кастомизация цвета фона, шапки и текста.', placement: 'bottom' },
  ]);

  const loadComments = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/comments/${tc}`);
      if (data.success) setComments(data.comments || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [tc]);

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/comments/${tc}/settings`);
      if (data.success && data.settings) {
        const clean = {};
        for (const [k, v] of Object.entries(data.settings)) {
          if (!/^\d+$/.test(k)) clean[k] = v;
        }
        setSettings(s => ({ ...s, ...clean }));
      }
    } catch { /* ignore */ }
  }, [tc]);

  useEffect(() => {
    if (tab === 'comments') loadComments();
  }, [tab, tc]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const deleteComment = async (id) => {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      await api.delete(`/comments/${tc}/${id}`);
      showToast('Комментарий удалён');
      loadComments();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    setReplying(true);
    try {
      await api.post(`/comments/${tc}/${replyTo.id}/reply`, { text: replyText });
      showToast('Ответ отправлен');
      setReplyTo(null);
      setReplyText('');
      loadComments();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setReplying(false); }
  };

  const saveSettings = async () => {
    if (!tc) { showToast('Канал не выбран', 'error'); return; }
    setSavingSettings(true);
    try {
      if (bgFile) {
        const fd = new FormData(); fd.append('file', bgFile); fd.append('target', 'header');
        const r = await api.upload(`/comments/${tc}/settings/upload-bg`, fd);
        if (r.success) { setSettings(s => ({ ...s, bg_image_url: r.url })); settings.bg_image_url = r.url; }
        setBgFile(null);
      }
      if (pageBgFile) {
        const fd = new FormData(); fd.append('file', pageBgFile); fd.append('target', 'page');
        const r = await api.upload(`/comments/${tc}/settings/upload-bg`, fd);
        if (r.success) { setSettings(s => ({ ...s, page_bg_image_url: r.url })); settings.page_bg_image_url = r.url; }
        setPageBgFile(null);
      }
      await api.put(`/comments/${tc}/settings`, settings);
      showToast('Настройки сохранены');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setSavingSettings(false); }
  };

  if (!currentChannel) {
    return <NoChannelStub />;
  }

  const isComments = tab === 'comments';
  const s = settings;
  const hexToRgb = (hex) => {
    const m = (hex || '#000000').replace('#', '').match(/.{2}/g);
    return m ? m.map(x => parseInt(x, 16)).join(',') : '0,0,0';
  };

  const bgStyle = s.bg_type === 'gradient'
    ? { background: `linear-gradient(${s.gradient_direction || '135deg'}, ${s.gradient_from || '#4F46E5'}, ${s.gradient_to || '#7C3AED'})` }
    : s.bg_type === 'image' && (bgFile || s.bg_image_url)
      ? { backgroundImage: `url(${bgFile ? URL.createObjectURL(bgFile) : s.bg_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: s.bg_color || '#ffffff' };
  const overlayStyle = s.bg_type === 'image' ? {
    position: 'absolute', inset: 0, background: `rgba(${hexToRgb(s.overlay_color)},${(s.overlay_opacity || 40) / 100})`,
    backdropFilter: s.blur ? `blur(${s.blur}px)` : 'none', WebkitBackdropFilter: s.blur ? `blur(${s.blur}px)` : 'none',
  } : null;

  const pageBgImg = pageBgFile ? URL.createObjectURL(pageBgFile) : s.page_bg_image_url;
  const pageBg = s.page_bg_type === 'gradient'
    ? { background: `linear-gradient(${s.page_gradient_direction || '180deg'}, ${s.page_gradient_from || '#f5f5f5'}, ${s.page_gradient_to || '#e0e7ff'})` }
    : s.page_bg_type === 'image' && pageBgImg
      ? { backgroundImage: `url(${pageBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: s.page_bg_color || '#ffffff' };
  const pageOverlay = s.page_bg_type === 'image' && pageBgImg ? {
    position: 'absolute', inset: 0, background: `rgba(0,0,0,${(s.page_overlay_opacity || 20) / 100})`,
    backdropFilter: s.page_blur ? `blur(${s.page_blur}px)` : 'none',
  } : null;

  return (
    <div>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .cm-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .cm-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .cm-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .cm-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .cm-input:focus,
        .cm-input:focus-within {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .cm-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 999px; cursor: pointer;
          background: transparent; border: 1px solid transparent;
          color: ${MUTED}; font-size: 0.86rem; font-weight: 600;
          letter-spacing: -0.005em;
          transition: all .18s ease;
        }
        .cm-tab:hover { color: ${DARK}; background: ${SOFT_BG}; }
        .cm-tab.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .cm-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 700; letter-spacing: -0.01em;
          background: ${SOFT_BG}; color: ${MUTED};
          transition: all .18s ease;
        }
        .cm-tab.active .cm-tab-count { background: rgba(255,255,255,0.22); color: #fff; }
        .cm-reply-btn {
          background: none; border: none; cursor: pointer; padding: 4px 0;
          color: ${ACCENT}; font-size: 0.78rem; font-weight: 600;
          display: inline-flex; align-items: center; gap: 4px;
          transition: color .15s ease;
        }
        .cm-reply-btn:hover { color: ${ACCENT2}; }
        .cm-toggle-card {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px; border-radius: 12px;
          border: 1px solid ${BORDER};
          background: #fff;
          transition: border-color .15s ease, background .15s ease;
        }
        .cm-toggle-card:hover { border-color: ${ACCENT}55; }
        .cm-toggle-card.checked {
          border-color: ${ACCENT}55;
          background: ${ACCENT}06;
        }
        .cm-range {
          width: 100%;
          accent-color: ${ACCENT};
          height: 6px;
        }
        .cm-fileinput {
          padding: 8px;
          font-size: 0.84rem;
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
                Сообщество канала
              </div>
              <h1 style={pageTitleStyle}>Комментарии</h1>
              <p style={pageSubStyle}>
                Модерация комментариев в канале и кастомизация страницы
              </p>
            </div>
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
            aria-selected={isComments}
            data-tour-page="comments-tab"
            className={`cm-tab${isComments ? ' active' : ''}`}
            onClick={() => setTab('comments')}
          >
            <ModerateIcon /> Модерация
            <span className="cm-tab-count">{comments.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={!isComments}
            data-tour-page="settings-tab"
            className={`cm-tab${!isComments ? ' active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <PaintIcon /> Оформление
          </button>
        </div>

        {isComments && (
          <>
            <div className={`cm-toggle-card${settings.notify_comments ? ' checked' : ''}`} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              border: `1px solid ${settings.notify_comments ? `${ACCENT}55` : BORDER}`,
              background: settings.notify_comments ? `${ACCENT}06` : '#fff',
              marginBottom: 12,
              cursor: 'pointer',
            }}
            onClick={async () => {
              const val = !settings.notify_comments;
              setSettings(p => ({ ...p, notify_comments: val }));
              try { await api.put(`/comments/${tc}/settings`, { ...settings, notify_comments: val }); showToast(val ? 'Уведомления включены' : 'Уведомления выключены'); } catch { /* ignore */ }
            }}>
              <span style={{
                flexShrink: 0,
                width: 22, height: 22, borderRadius: 7,
                border: `1.5px solid ${settings.notify_comments ? ACCENT : BORDER}`,
                background: settings.notify_comments ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
                boxShadow: settings.notify_comments ? `0 2px 6px ${ACCENT}40` : 'none',
              }}>
                {settings.notify_comments && <CheckIcon size={13} color="#fff" strokeWidth={3.5} />}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                  Уведомлять о новых комментариях
                </div>
                <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                  Новые комментарии будут приходить в MAX бота
                </div>
              </div>
            </div>

            <div className={`cm-toggle-card${settings.auto_attach ? ' checked' : ''}`} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              border: `1px solid ${settings.auto_attach ? `${ACCENT}55` : BORDER}`,
              background: settings.auto_attach ? `${ACCENT}06` : '#fff',
              marginBottom: 18,
              cursor: 'pointer',
            }}
            onClick={async () => {
              const val = !settings.auto_attach;
              setSettings(p => ({ ...p, auto_attach: val }));
              try {
                await api.put(`/comments/${tc}/settings`, { ...settings, auto_attach: val });
                showToast(val ? 'Кнопка «Комментарии» будет добавляться ко всем новым постам' : 'Авто-прикрепление отключено');
              } catch { /* ignore */ }
            }}>
              <span style={{
                flexShrink: 0,
                width: 22, height: 22, borderRadius: 7,
                border: `1.5px solid ${settings.auto_attach ? ACCENT : BORDER}`,
                background: settings.auto_attach ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
                boxShadow: settings.auto_attach ? `0 2px 6px ${ACCENT}40` : 'none',
              }}>
                {settings.auto_attach && <CheckIcon size={13} color="#fff" strokeWidth={3.5} />}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                  Включить комментарии ко всем новым постам
                </div>
                <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                  Кнопка «Комментарии» будет автоматически прикрепляться к каждому новому посту.
                  Существующие посты не изменятся. Даже с выключенным ползунком можно
                  вручную добавить кнопку через редактор.
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ ...cardBase, padding: 40, textAlign: 'center', color: MUTED }}>Загрузка...</div>
            ) : comments.length === 0 ? (
              <EmptyComments />
            ) : (
              <section>
                <div style={sectionHeaderRow}>
                  <div>
                    <h2 style={sectionTitleStyle}>Все комментарии</h2>
                    <p style={sectionSubStyle}>Всего: {comments.length}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.map((c, i) => (
                    <div key={c.id} className="cm-card" style={{ ...cardBase, padding: 16, ...animStyle(i) }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <GradientAvatar name={c.user_name || 'А'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                              {c.user_name || 'Аноним'}
                            </span>
                            {c.created_at && (
                              <span style={pill(SOFT_BG, MUTED)}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                                {new Date(c.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {c.reply_to_name && (
                              <span style={pill('rgba(67,97,238,0.10)', ACCENT)}>
                                ↩ {c.reply_to_name}
                              </span>
                            )}
                            {c.post_title && (
                              <span style={pill('rgba(123,104,238,0.10)', ACCENT2)}>
                                Пост · {c.post_title}
                              </span>
                            )}
                          </div>

                          <div style={previewPanelStyle}>{c.comment_text}</div>

                          <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                              className="cm-reply-btn"
                              onClick={() => { setReplyTo({ id: c.id, user_name: c.user_name }); setReplyText(''); }}
                            >
                              ↩ Ответить
                            </button>
                          </div>

                          {replyTo?.id === c.id && (
                            <div style={{
                              marginTop: 10, padding: 12,
                              background: SOFT_BG, borderRadius: 10,
                              border: `1px solid ${BORDER}`,
                              display: 'flex', gap: 8,
                              animation: 'dashFadeUp 0.3s ease both',
                            }}>
                              <input
                                className="cm-input"
                                style={{ ...inputStyle, flex: 1, padding: '8px 12px' }}
                                placeholder={`Ответ для ${c.user_name}...`}
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                                autoFocus
                              />
                              <button
                                className="cm-primary"
                                style={{ ...primaryBtn, padding: '8px 16px', opacity: (replying || !replyText.trim()) ? 0.7 : 1 }}
                                onClick={sendReply}
                                disabled={replying || !replyText.trim()}
                              >
                                {replying ? '…' : '→'}
                              </button>
                              <button className="cm-ghost" style={ghostBtn} onClick={() => setReplyTo(null)}>✕</button>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button className="cm-danger" style={dangerGhost} onClick={() => deleteComment(c.id)} title="Удалить">🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!isComments && (
          <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{
                ...cardBase,
                padding: 20,
                animation: 'dashFadeUp 0.4s ease 0.05s both',
              }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 4 }}>Основные параметры</h3>
                <p style={{ ...sectionSubStyle, marginBottom: 16 }}>Заголовок и базовые цвета мини-приложения</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Заголовок страницы</label>
                    <input
                      className="cm-input" style={inputStyle}
                      value={s.header_text || ''}
                      onChange={e => setSettings(p => ({ ...p, header_text: e.target.value }))}
                      placeholder="Комментарии"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Основной цвет (кнопки, акценты)</label>
                    <ColorSwatch value={s.primary_color || '#4F46E5'} onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))} />
                    <PaletteRow value={s.primary_color} onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Цвет текста шапки</label>
                      <ColorSwatch value={s.header_text_color || '#ffffff'} onChange={e => setSettings(p => ({ ...p, header_text_color: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Цвет текста страницы</label>
                      <ColorSwatch value={s.page_text_color || '#1f2937'} onChange={e => setSettings(p => ({ ...p, page_text_color: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                ...cardBase,
                padding: 20,
                animation: 'dashFadeUp 0.4s ease 0.1s both',
              }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 4 }}>Фон шапки</h3>
                <p style={{ ...sectionSubStyle, marginBottom: 16 }}>Цвет, градиент или изображение</p>

                <div style={{ marginBottom: 14 }}>
                  <SegmentedControl
                    value={s.bg_type}
                    onChange={v => setSettings(p => ({ ...p, bg_type: v }))}
                    options={[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }]}
                  />
                </div>

                {s.bg_type === 'color' && (
                  <div>
                    <label style={labelStyle}>Цвет фона</label>
                    <ColorSwatch value={s.bg_color || '#ffffff'} onChange={e => setSettings(p => ({ ...p, bg_color: e.target.value }))} />
                  </div>
                )}

                {s.bg_type === 'gradient' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Цвет 1</label>
                      <ColorSwatch value={s.gradient_from || '#4F46E5'} onChange={e => setSettings(p => ({ ...p, gradient_from: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Цвет 2</label>
                      <ColorSwatch value={s.gradient_to || '#7C3AED'} onChange={e => setSettings(p => ({ ...p, gradient_to: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Направление</label>
                      <select className="cm-input" style={inputStyle} value={s.gradient_direction || '135deg'}
                        onChange={e => setSettings(p => ({ ...p, gradient_direction: e.target.value }))}>
                        {DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {s.bg_type === 'image' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Фоновое изображение</label>
                      <input
                        type="file" accept="image/*"
                        className="cm-input cm-fileinput" style={{ ...inputStyle, padding: 8 }}
                        onChange={e => setBgFile(e.target.files?.[0] || null)}
                      />
                      {s.bg_image_url && !bgFile && (
                        <img src={s.bg_image_url} alt="" style={{ width: 140, height: 70, objectFit: 'cover', borderRadius: 8, marginTop: 8, border: `1px solid ${BORDER}` }} />
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Цвет затемнения</label>
                      <ColorSwatch value={s.overlay_color || '#000000'} onChange={e => setSettings(p => ({ ...p, overlay_color: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Интенсивность затемнения · {s.overlay_opacity || 40}%</label>
                      <input className="cm-range" type="range" min="20" max="100" value={s.overlay_opacity || 40}
                        onChange={e => setSettings(p => ({ ...p, overlay_opacity: parseInt(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Размытие · {s.blur || 0}px</label>
                      <input className="cm-range" type="range" min="0" max="20" value={s.blur || 0}
                        onChange={e => setSettings(p => ({ ...p, blur: parseInt(e.target.value) }))} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                ...cardBase,
                padding: 20,
                animation: 'dashFadeUp 0.4s ease 0.15s both',
              }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 4 }}>Фон страницы</h3>
                <p style={{ ...sectionSubStyle, marginBottom: 16 }}>Заполнение области с комментариями</p>

                <div style={{ marginBottom: 14 }}>
                  <SegmentedControl
                    value={s.page_bg_type}
                    onChange={v => setSettings(p => ({ ...p, page_bg_type: v }))}
                    options={[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }]}
                  />
                </div>

                {s.page_bg_type === 'color' && (
                  <div>
                    <label style={labelStyle}>Цвет фона</label>
                    <ColorSwatch value={s.page_bg_color || '#ffffff'} onChange={e => setSettings(p => ({ ...p, page_bg_color: e.target.value }))} />
                  </div>
                )}

                {s.page_bg_type === 'gradient' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Цвет 1</label>
                      <ColorSwatch value={s.page_gradient_from || '#f5f5f5'} onChange={e => setSettings(p => ({ ...p, page_gradient_from: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Цвет 2</label>
                      <ColorSwatch value={s.page_gradient_to || '#e0e7ff'} onChange={e => setSettings(p => ({ ...p, page_gradient_to: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Направление</label>
                      <select className="cm-input" style={inputStyle} value={s.page_gradient_direction || '180deg'}
                        onChange={e => setSettings(p => ({ ...p, page_gradient_direction: e.target.value }))}>
                        {DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {s.page_bg_type === 'image' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Изображение</label>
                      <input
                        type="file" accept="image/*"
                        className="cm-input cm-fileinput" style={{ ...inputStyle, padding: 8 }}
                        onChange={e => setPageBgFile(e.target.files?.[0] || null)}
                      />
                      {(pageBgFile || s.page_bg_image_url) && (
                        <img src={pageBgFile ? URL.createObjectURL(pageBgFile) : s.page_bg_image_url} alt=""
                          style={{ width: 140, height: 70, objectFit: 'cover', borderRadius: 8, marginTop: 8, border: `1px solid ${BORDER}` }} />
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Затемнение · {s.page_overlay_opacity || 20}%</label>
                      <input className="cm-range" type="range" min="0" max="80" value={s.page_overlay_opacity || 20}
                        onChange={e => setSettings(p => ({ ...p, page_overlay_opacity: parseInt(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Размытие · {s.page_blur || 0}px</label>
                      <input className="cm-range" type="range" min="0" max="20" value={s.page_blur || 0}
                        onChange={e => setSettings(p => ({ ...p, page_blur: parseInt(e.target.value) }))} />
                    </div>
                  </div>
                )}

                <button
                  className="cm-primary"
                  style={{ ...primaryBtn, marginTop: 18, opacity: savingSettings ? 0.7 : 1 }}
                  onClick={saveSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>

            <div style={{ width: 300, flexShrink: 0, position: 'sticky', top: 80 }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Предпросмотр</label>
              <div style={{
                ...cardBase,
                padding: 0,
                overflow: 'hidden',
                animation: 'dashFadeUp 0.4s ease 0.1s both',
                boxShadow: '0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
              }}>
                <div style={{ ...bgStyle, padding: '22px 18px', textAlign: 'center', color: s.header_text_color || '#fff', position: 'relative', minHeight: 80 }}>
                  {overlayStyle && <div style={overlayStyle} />}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {s.header_text || 'Комментарии'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                      {currentChannel?.title || 'Канал'}
                    </div>
                  </div>
                </div>
                <div style={{ ...pageBg, minHeight: 140, position: 'relative' }}>
                  {pageOverlay && <div style={pageOverlay} />}
                  <div style={{ position: 'relative', zIndex: 1, padding: 14 }}>
                    {[
                      { name: 'Иван', text: 'Отличная статья!' },
                      { name: 'Мария', text: 'Спасибо за контент' },
                    ].map((c, i) => {
                      const [from, to] = pickAvatarGradient(c.name);
                      return (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${from}, ${to})`,
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                            boxShadow: `0 3px 8px ${from}40`,
                          }}>{c.name[0]}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: s.page_text_color || '#1f2937' }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: s.page_text_color ? s.page_text_color + 'aa' : '#666', marginTop: 1 }}>{c.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{
                  display: 'flex', gap: 8, padding: '12px 14px',
                  borderTop: '1px solid rgba(0,0,0,0.06)',
                  background: 'rgba(255,255,255,0.95)',
                }}>
                  <div style={{
                    flex: 1, padding: '7px 14px',
                    border: `1px solid ${BORDER}`, borderRadius: 999,
                    fontSize: 12, color: '#999', background: '#fff',
                  }}>Написать…</div>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: s.primary_color || '#4F46E5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 15,
                    boxShadow: `0 4px 12px ${(s.primary_color || '#4F46E5')}55`,
                  }}>→</div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
