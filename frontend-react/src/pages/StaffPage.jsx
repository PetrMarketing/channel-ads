import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Loading from '../components/Loading';

const ROLE_INFO = {
  advertiser: { name: 'Рекламодатель', color: '#2196F3', desc: 'Только трекинг-ссылки' },
  editor: { name: 'Редактор', color: '#FF9800', desc: 'Публикации, закрепы, лид-магниты, розыгрыши' },
  admin: { name: 'Администратор', color: '#4CAF50', desc: 'Полный доступ ко всем инструментам' },
};

export default function StaffPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addRole, setAddRole] = useState('editor');
  const [pkId, setPkId] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

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

  const handleChangeRole = async (staffId, newRole) => {
    try {
      const data = await api.put(`/billing/${tc}/staff/${staffId}`, { role: newRole });
      if (data.success) {
        showToast('Роль обновлена');
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
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
        Выберите канал для управления сотрудниками
      </div>
    );
  }

  if (loading) return <Loading />;

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Сотрудники</h2>

      {/* Add by PKid */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: '24px',
      }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Добавить сотрудника</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Введите PKid сотрудника"
            value={pkId}
            onChange={e => setPkId(e.target.value)}
            style={{ flex: 1, minWidth: '140px', padding: '8px 12px', fontSize: '0.88rem' }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(false); }}
          />
          <select
            value={addRole}
            onChange={e => setAddRole(e.target.value)}
            className="input"
            style={{ width: 'auto', padding: '8px 12px', fontSize: '0.84rem' }}
          >
            {Object.entries(ROLE_INFO).map(([key, info]) => (
              <option key={key} value={key}>{info.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => handleAdd(false)} disabled={adding}>
            {adding ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
          PKid можно найти в верхней панели сервиса у каждого пользователя
        </p>
      </div>

      {/* Roles reference */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: '24px',
      }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '10px' }}>Доступные роли:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(ROLE_INFO).map(([key, info]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem' }}>
              <span style={{
                background: info.color, color: '#fff', padding: '2px 10px',
                borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600, minWidth: '120px', textAlign: 'center',
              }}>
                {info.name}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{info.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Staff list */}
      {staff.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px', color: 'var(--text-secondary)',
          background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          Нет добавленных сотрудников. Вы — единственный пользователь.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {staff.map(s => {
            const info = ROLE_INFO[s.role] || ROLE_INFO.editor;
            const displayName = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `PKid ${s.user_id}`;
            return (
              <div key={s.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px',
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{displayName}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    PKid: {s.user_id}
                    {s.username ? ` · @${s.username}` : ''}
                  </div>
                </div>
                <select
                  value={s.role}
                  onChange={e => handleChangeRole(s.id, e.target.value)}
                  className="input"
                  style={{
                    width: 'auto', padding: '4px 10px', fontSize: '0.82rem',
                    borderColor: info.color,
                  }}
                >
                  {Object.entries(ROLE_INFO).map(([key, ri]) => (
                    <option key={key} value={key}>{ri.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setRemoveTarget({ id: s.id, name: displayName }); setShowRemoveModal(true); }}
                  className="btn"
                  style={{
                    padding: '4px 12px', fontSize: '0.82rem',
                    color: 'var(--error)', border: '1px solid var(--error)',
                    background: 'transparent',
                  }}
                >
                  Удалить
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm subscription reduction modal */}
      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Добавление сотрудника">
        {confirmInfo && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: '0.95rem', marginBottom: '16px' }}>
              Ваш срок подписки уменьшится в <strong>{confirmInfo.new_users}/{confirmInfo.current_users}</strong> раза
              после добавления сотрудника.
            </p>
            <div style={{
              background: 'var(--bg-glass)', borderRadius: '10px', padding: '16px', marginBottom: '20px',
              display: 'flex', justifyContent: 'space-around', fontSize: '0.88rem',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Сейчас</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{confirmInfo.remaining_days} дн.</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{confirmInfo.current_users} польз.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.5rem', color: 'var(--text-secondary)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>После</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>{confirmInfo.new_remaining_days} дн.</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{confirmInfo.new_users} польз.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => handleAdd(true)} disabled={adding}>
                {adding ? 'Добавление...' : 'Подтвердить'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowConfirmModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Remove confirmation modal */}
      <Modal isOpen={showRemoveModal} onClose={() => { setShowRemoveModal(false); setRemoveTarget(null); }} title="Удаление сотрудника">
        {removeTarget && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: '0.95rem', marginBottom: '20px' }}>
              Удалить сотрудника <strong>{removeTarget.name}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="btn"
                style={{ background: 'var(--error)', color: '#fff', border: 'none' }}
                onClick={handleRemove}
              >
                Удалить
              </button>
              <button className="btn btn-outline" onClick={() => { setShowRemoveModal(false); setRemoveTarget(null); }}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
