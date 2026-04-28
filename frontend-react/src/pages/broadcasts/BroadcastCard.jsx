const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
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

const previewPanelStyle = {
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: '0.85rem',
  color: MUTED,
  lineHeight: 1.5,
  maxHeight: 80,
  overflowY: 'auto',
};

function EditIcon({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function ClockIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PaperPlaneIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function CheckIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const STATUS_META = {
  draft: {
    label: 'Черновик',
    icon: <EditIcon />,
    grad: [MUTED, '#9ca3af'],
    soft: 'rgba(107,114,128,0.10)',
    text: MUTED,
  },
  scheduled: {
    label: 'Запланировано',
    icon: <ClockIcon />,
    grad: ['#3b82f6', ACCENT],
    soft: 'rgba(59,130,246,0.10)',
    text: '#3b82f6',
  },
  sending: {
    label: 'Отправляется',
    icon: <PaperPlaneIcon />,
    grad: [WARNING, '#f97316'],
    soft: 'rgba(245,158,11,0.10)',
    text: WARNING,
  },
  completed: {
    label: 'Отправлено',
    icon: <CheckIcon />,
    grad: [SUCCESS, '#34d399'],
    soft: 'rgba(16,185,129,0.10)',
    text: SUCCESS,
  },
};

const TARGET_LABELS = {
  all_leads: { icon: '🎯', label: 'Все лиды' },
  specific_lead_magnet: { icon: '🎁', label: 'По лид-магниту' },
  custom_filter: { icon: '⚙', label: 'Фильтр' },
};

const dropdownMenuStyle = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 6px)',
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: '0 12px 28px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)',
  zIndex: 100,
  minWidth: 220,
  overflow: 'hidden',
  padding: 4,
  animation: 'dashFadeUp 0.2s ease both',
};

const dropdownItemStyle = {
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

function GradientAvatar({ from, to, children, size = 52, pulse = false }) {
  return (
    <div
      className={pulse ? 'bc-avatar-pulse' : ''}
      style={{
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

function SendIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function PencilIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function ChevronDownIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CalendarIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

export default function BroadcastCard({
  broadcast: b,
  openDropdownId,
  setOpenDropdownId,
  dropdownRef,
  onEdit,
  onSend,
  onDelete,
  onStats,
  onCopy,
  onEditSentOpen,
  onDeleteSent,
}) {
  const meta = STATUS_META[b.status] || STATUS_META.draft;
  const target = TARGET_LABELS[b.target_type] || TARGET_LABELS.all_leads;
  const isSending = b.status === 'sending';
  const isCompleted = b.status === 'completed';
  const isDraft = b.status === 'draft';
  const isScheduled = b.status === 'scheduled';

  const renderMoreDropdown = () => {
    const isOpen = openDropdownId === b.id;
    return (
      <div style={{ position: 'relative' }} ref={isOpen ? dropdownRef : null}>
        <button
          className="bc-ghost"
          style={{ ...ghostBtn, padding: '7px 12px', gap: 6 }}
          onClick={() => setOpenDropdownId(isOpen ? null : b.id)}
        >
          Ещё
          <ChevronDownIcon />
        </button>
        {isOpen && (
          <div style={dropdownMenuStyle}>
            <button
              className="bc-dd-item"
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onStats(b); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>📊</span> Статистика
            </button>
            <button
              className="bc-dd-item"
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onCopy(b); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>📋</span> Копировать
            </button>
            <button
              className="bc-dd-item"
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onEdit(b); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>✏️</span> Редактировать
            </button>
            <button
              className="bc-dd-item"
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onEditSentOpen(b); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>📝</span> Редактировать отправленные
            </button>
            <div style={{ height: 1, background: BORDER, margin: '4px 6px' }} />
            <button
              className="bc-dd-item-danger"
              style={{ ...dropdownItemStyle, color: DANGER }}
              onClick={() => { setOpenDropdownId(null); onDeleteSent(b); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>🗑</span> Удалить отправленные
            </button>
            <button
              className="bc-dd-item-danger"
              style={{ ...dropdownItemStyle, color: DANGER }}
              onClick={() => { setOpenDropdownId(null); onDelete(b.id); }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>🗑</span> Удалить рассылку
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        .bc-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .bc-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .bc-ghost-accent:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px ${ACCENT}55 !important;
        }
        .bc-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .bc-dd-item:hover {
          background: ${SOFT_BG} !important;
          color: ${ACCENT} !important;
        }
        .bc-dd-item-danger:hover {
          background: rgba(230,57,70,0.08) !important;
        }
        .bc-avatar-pulse::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 16px;
          background: inherit;
          opacity: 0.45;
          animation: bcPulse 1.6s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }
        @keyframes bcPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0; transform: scale(1.18); }
        }
        @keyframes bcDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>

      <div className="bc-card" style={{ ...cardBase, padding: 18 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <GradientAvatar from={meta.grad[0]} to={meta.grad[1]} pulse={isSending}>
            {meta.icon}
          </GradientAvatar>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: DARK, letterSpacing: '-0.01em' }}>
                {b.title || 'Без названия'}
              </span>
              <span style={pill(meta.soft, meta.text)}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: meta.text,
                  ...(isSending ? { animation: 'bcDot 1.2s ease-in-out infinite' } : {}),
                }} />
                {meta.label}
              </span>
            </div>

            {b.message_text && (
              <div
                style={previewPanelStyle}
                dangerouslySetInnerHTML={{ __html: b.message_text }}
              />
            )}

            <div style={{
              display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
              fontSize: '0.78rem', color: MUTED, flexWrap: 'wrap',
            }}>
              {b.scheduled_at && isScheduled && (
                <span style={pill('rgba(59,130,246,0.10)', '#3b82f6')}>
                  <CalendarIcon />
                  {new Date(b.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {isCompleted && b.sent_count != null && (
                <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                  Отправлено {b.sent_count}/{b.total_count ?? b.sent_count}
                </span>
              )}
              {!isCompleted && b.target_type && (
                <span style={pill(SOFT_BG, MUTED)}>
                  <span style={{ fontSize: '0.78rem' }}>{target.icon}</span>
                  {target.label}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {isDraft && (
              <>
                <button className="bc-ghost" style={iconGhostBtn} onClick={() => onEdit(b)} title="Редактировать">
                  <PencilIcon />
                </button>
                <button className="bc-ghost-accent" style={iconAccentBtn} onClick={() => onSend(b)} title="Отправить сейчас">
                  <SendIcon />
                </button>
                <button className="bc-danger" style={dangerGhost} onClick={() => onDelete(b.id)} title="Удалить">
                  <TrashIcon />
                </button>
              </>
            )}
            {isScheduled && (
              <button className="bc-danger" style={dangerGhost} onClick={() => onDelete(b.id)} title="Удалить">
                <TrashIcon />
              </button>
            )}
            {isCompleted && renderMoreDropdown()}
            {isSending && (
              <span style={{
                ...pill('rgba(245,158,11,0.10)', WARNING),
                padding: '6px 12px', fontSize: '0.78rem',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: WARNING,
                  animation: 'bcDot 1.2s ease-in-out infinite',
                }} />
                Отправляется…
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
