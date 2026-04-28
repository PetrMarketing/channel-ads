import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Loading from '../components/Loading';
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

const ROLE_META = {
  admin: {
    name: 'Администратор',
    desc: 'Полный доступ ко всем инструментам и настройкам',
    grad: [DANGER, '#f97316'],
    soft: 'rgba(230,57,70,0.10)',
    text: DANGER,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  editor: {
    name: 'Редактор',
    desc: 'Публикации, закрепы, лид-магниты и розыгрыши',
    grad: [ACCENT, ACCENT2],
    soft: 'rgba(67,97,238,0.10)',
    text: ACCENT,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  advertiser: {
    name: 'Рекламодатель',
    desc: 'Только трекинг-ссылки и аналитика трафика',
    grad: [SUCCESS, '#34d399'],
    soft: 'rgba(16,185,129,0.10)',
    text: SUCCESS,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 11-5.8-1.6" />
      </svg>
    ),
  },
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

const monoInputStyle = {
  ...inputStyle,
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.92rem',
  letterSpacing: '0.02em',
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

const codePillStyle = {
  display: 'inline-block',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.76rem',
  padding: '4px 10px',
  borderRadius: 8,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color: ACCENT,
};

const initialsFrom = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export default function StaffPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addRole, setAddRole] = useState('editor');
  const [pkId, setPkId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);

  const { overlay: pageTour } = usePageOnboarding('staff', [
    { selector: '[data-tour-page="staff-add"]', title: 'Сотрудник по PKid', text: 'Введите PKid и роль: Рекламодатель, Редактор или Администратор.', placement: 'bottom' },
  ]);

  const tc = currentChannel?.tracking_code;

  const loadStaff = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/billing/${tc}/staff`);
      if (data.success) setStaff(data.staff || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const openAdd = () => {
    setPkId('');
    setAddRole('editor');
    setShowAddModal(true);
  };

  const handleAdd = async (confirmed = false) => {
    if (!pkId.trim()) {
      showToast('Введите PKid сотрудника', 'error');
      return;
    }
    setAdding(true);
    try {
      const data = await api.post(`/billing/${tc}/staff`, {
        identifier: pkId.trim(),
        role: addRole,
        confirm: confirmed,
      });
      if (data.success) {
        showToast('Сотрудник добавлен');
        setPkId('');
        setShowAddModal(false);
        setShowConfirmModal(false);
        loadStaff();
      } else if (data.needs_confirm) {
        setConfirmInfo(data);
        setShowConfirmModal(true);
      } else {
        showToast(data.detail || data.error || 'Ошибка', 'error');
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Ошибка добавления';
      showToast(msg, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleChangeRole = async (newRole) => {
    if (!roleTarget) return;
    try {
      const data = await api.put(`/billing/${tc}/staff/${roleTarget.id}`, { role: newRole });
      if (data.success) {
        showToast('Роль обновлена');
        setShowRoleModal(false);
        setRoleTarget(null);
        loadStaff();
      }
    } catch {
      showToast('Ошибка обновления роли', 'error');
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      const data = await api.delete(`/billing/${tc}/staff/${removeTarget.id}`);
      if (data.success) {
        showToast('Сотрудник удалён');
        setShowRemoveModal(false);
        setRemoveTarget(null);
        loadStaff();
      }
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  if (!currentChannel) {
    return (
      <div style={{ ...cardBase, padding: '56px 32px', textAlign: 'center', color: MUTED, fontSize: '0.92rem' }}>
        Выберите канал для управления сотрудниками
      </div>
    );
  }

  if (loading) return <Loading />;

  const counts = staff.reduce((acc, s) => { acc[s.role] = (acc[s.role] || 0) + 1; return acc; }, {});

  return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .sp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .sp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .sp-danger:hover {
          background: rgba(230,57,70,0.10) !important;
          border-color: ${DANGER} !important;
          color: ${DANGER} !important;
          transform: translateY(-1px);
        }
        .sp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .sp-input:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .sp-rolecard {
          flex: 1; min-width: 150px;
          display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
          padding: 16px 14px; border-radius: 14px; cursor: pointer;
          border: 1.5px solid ${BORDER}; background: #fff;
          transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
          text-align: left;
        }
        .sp-rolecard:hover { border-color: ${ACCENT}55; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
        .sp-rolecard.active {
          border-color: ${ACCENT};
          background: linear-gradient(135deg, ${ACCENT}08, ${ACCENT2}08);
          box-shadow: 0 4px 14px ${ACCENT}1f;
          transform: translateY(-1px);
        }
        .sp-code:hover { background: ${ACCENT}10 !important; border-color: ${ACCENT}40 !important; }
      `}</style>

      <section style={pageHeaderWrap} data-tour-page="staff-add">
        <div style={pageHeaderBlur1} />
        <div style={pageHeaderBlur2} />
        <div style={pageHeaderRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={eyebrowStyle}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
              Команда канала
            </div>
            <h1 style={pageTitleStyle}>Сотрудники</h1>
            <p style={pageSubStyle}>
              Добавьте сотрудников по PKid с ролями для совместного управления каналом и его инструментами.
            </p>
          </div>
          <button className="sp-primary" style={primaryBtn} onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Пригласить сотрудника
          </button>
        </div>
      </section>

      {staff.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <StatTile label="Всего сотрудников" value={staff.length} grad={[ACCENT, ACCENT2]} delay={0.05} />
            {Object.entries(ROLE_META).map(([key, meta], i) => (
              <StatTile key={key} label={meta.name} value={counts[key] || 0} grad={meta.grad} delay={0.05 + (i + 1) * 0.04} />
            ))}
          </div>
        </section>
      )}

      {staff.length === 0 ? (
        <EmptyStaff onAdd={openAdd} />
      ) : (
        <section>
          <div style={sectionHeaderRow}>
            <div>
              <h2 style={sectionTitleStyle}>Команда</h2>
              <p style={sectionSubStyle}>Активных участников: {staff.length}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {staff.map((s, i) => {
              const meta = ROLE_META[s.role] || ROLE_META.editor;
              const displayName = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `PKid ${s.user_id}`;
              const initials = initialsFrom(displayName);
              const status = s.status === 'pending' ? { bg: 'rgba(245,158,11,0.10)', color: WARNING, label: 'Ожидает' } : { bg: 'rgba(16,185,129,0.10)', color: SUCCESS, label: 'Активен' };
              return (
                <div
                  key={s.id}
                  className="sp-card"
                  style={{ ...cardBase, padding: 18, animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                      color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em',
                      boxShadow: `0 4px 12px ${meta.grad[0]}33`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.22), transparent 60%)',
                        pointerEvents: 'none',
                      }} />
                      <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>{initials}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.98rem', color: DARK, letterSpacing: '-0.01em' }}>
                          {displayName}
                        </span>
                        <span style={pill(meta.soft, meta.text)}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.text }} />
                          {meta.name}
                        </span>
                        <span style={pill(status.bg, status.color)}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
                          {status.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <code style={codePillStyle}>PKid · {s.user_id}</code>
                        {s.username && (
                          <span style={{ fontSize: '0.78rem', color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, opacity: 0.5 }} />
                            @{s.username}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <button className="sp-ghost" style={iconGhostBtn} onClick={() => { setRoleTarget({ id: s.id, name: displayName, role: s.role }); setShowRoleModal(true); }} title="Изменить роль">✎</button>
                      <button className="sp-danger" style={dangerGhost} onClick={() => { setRemoveTarget({ id: s.id, name: displayName }); setShowRemoveModal(true); }} title="Удалить">🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Пригласить сотрудника">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>PKid сотрудника</label>
            <input
              className="sp-input"
              style={monoInputStyle}
              placeholder="000000000"
              value={pkId}
              onChange={e => setPkId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(false); }}
            />
            <div style={hintStyle}>PKid отображается в верхней панели сервиса у каждого пользователя.</div>
          </div>

          <div>
            <label style={labelStyle}>Роль</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(ROLE_META).map(([key, meta]) => {
                const active = addRole === key;
                return (
                  <label key={key} className={`sp-rolecard${active ? ' active' : ''}`}>
                    <input type="radio" name="staff_role" value={key} checked={active}
                      onChange={() => setAddRole(key)} style={{ display: 'none' }} />
                    <div style={{
                      width: 40, height: 40, borderRadius: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                      boxShadow: `0 3px 10px ${meta.grad[0]}33`,
                    }}>{meta.icon}</div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: DARK, letterSpacing: '-0.01em' }}>{meta.name}</span>
                    <span style={{ fontSize: '0.74rem', color: MUTED, lineHeight: 1.4 }}>{meta.desc}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="sp-ghost" style={ghostBtn} onClick={() => setShowAddModal(false)}>Отмена</button>
            <button className="sp-primary" style={{ ...primaryBtn, opacity: adding ? 0.7 : 1 }} onClick={() => handleAdd(false)} disabled={adding}>
              {adding ? 'Добавление...' : 'Пригласить'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showRoleModal} onClose={() => { setShowRoleModal(false); setRoleTarget(null); }} title="Изменить роль">
        {roleTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: '0.88rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
              Сотрудник: <strong>{roleTarget.name}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(ROLE_META).map(([key, meta]) => {
                const active = roleTarget.role === key;
                return (
                  <div key={key}
                    className={`sp-rolecard${active ? ' active' : ''}`}
                    onClick={() => handleChangeRole(key)}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${meta.grad[0]} 0%, ${meta.grad[1]} 100%)`,
                      boxShadow: `0 3px 10px ${meta.grad[0]}33`,
                    }}>{meta.icon}</div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: DARK, letterSpacing: '-0.01em' }}>{meta.name}</span>
                    <span style={{ fontSize: '0.74rem', color: MUTED, lineHeight: 1.4 }}>{meta.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Подтвердите добавление">
        {confirmInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: '0.92rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
              При добавлении сотрудника срок подписки уменьшится в{' '}
              <strong>{confirmInfo.new_users}/{confirmInfo.current_users}</strong> раза.
            </p>
            <div style={{
              display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 14,
              padding: 18, borderRadius: 12,
              background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
              border: `1px solid ${ACCENT}25`,
            }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Сейчас</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>{confirmInfo.remaining_days}</div>
                <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 6 }}>дн. · {confirmInfo.current_users} польз.</div>
              </div>
              <div style={{ color: MUTED, fontSize: '1.4rem' }}>→</div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>После</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: ACCENT, letterSpacing: '-0.04em', lineHeight: 1 }}>{confirmInfo.new_remaining_days}</div>
                <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 6 }}>дн. · {confirmInfo.new_users} польз.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sp-ghost" style={ghostBtn} onClick={() => setShowConfirmModal(false)}>Отмена</button>
              <button className="sp-primary" style={{ ...primaryBtn, opacity: adding ? 0.7 : 1 }} onClick={() => handleAdd(true)} disabled={adding}>
                {adding ? 'Добавление...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showRemoveModal} onClose={() => { setShowRemoveModal(false); setRemoveTarget(null); }} title="Удаление сотрудника">
        {removeTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: '0.92rem', color: DARK, margin: 0, lineHeight: 1.55 }}>
              Удалить сотрудника <strong>{removeTarget.name}</strong>? Доступ будет немедленно отозван.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sp-ghost" style={ghostBtn} onClick={() => { setShowRemoveModal(false); setRemoveTarget(null); }}>Отмена</button>
              <button
                className="sp-danger"
                style={{ ...ghostBtn, color: '#fff', background: `linear-gradient(135deg, ${DANGER} 0%, #f97316 100%)`, border: 'none', boxShadow: `0 4px 14px ${DANGER}40`, padding: '10px 20px', fontSize: '0.88rem', fontWeight: 600 }}
                onClick={handleRemove}>
                Удалить
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
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

function StatTile({ label, value, grad, delay }) {
  return (
    <div
      className="sp-card"
      style={{ ...cardBase, padding: 16, animation: `dashFadeUp 0.4s ease ${delay}s both`, position: 'relative', overflow: 'hidden' }}
    >
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 36, height: 36, borderRadius: 10,
        background: `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 12px ${grad[0]}33`,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      </div>
      <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function EmptyStaff({ onAdd }) {
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
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
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
        Пригласите первого сотрудника
      </h3>
      <p style={{
        fontSize: '0.92rem', color: MUTED, margin: '0 auto 26px',
        maxWidth: 420, lineHeight: 1.55,
      }}>
        Делегируйте часть работы команде: добавьте редактора для публикаций, рекламодателя — для трекинг-ссылок.
      </p>

      <button className="sp-primary" style={primaryBtn} onClick={onAdd}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Пригласить сотрудника
      </button>
    </div>
  );
}
