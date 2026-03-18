import { useState, useEffect, useCallback, useRef } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
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
  const [showForm, setShowForm] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState('editor');
  const [identifierError, setIdentifierError] = useState('');
  const identifierRef = useRef(null);

  const tc = currentChannel?.tracking_code;

  const loadStaff = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await api.get(`/billing/${tc}/staff`);
      if (data.success) setStaff(data.staff || []);
    } catch {
      // no staff
    } finally {
      setLoading(false);
    }
  }, [tc]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setIdentifierError('Укажите Telegram ID, MAX ID или @username');
      if (identifierRef.current) {
        identifierRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        identifierRef.current.classList.add('field-shake');
        setTimeout(() => identifierRef.current.classList.remove('field-shake'), 500);
      }
      return;
    }
    setIdentifierError('');
    setAdding(true);
    try {
      const data = await api.post(`/billing/${tc}/staff`, { identifier, role });
      if (data.success) {
        showToast('Сотрудник добавлен');
        setIdentifier('');
        setShowForm(false);
        loadStaff();
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

  const handleRemove = async (staffId, name) => {
    if (!confirm(`Удалить сотрудника ${name}?`)) return;
    try {
      const data = await api.delete(`/billing/${tc}/staff/${staffId}`);
      if (data.success) {
        showToast('Сотрудник удалён');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Сотрудники</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Добавить'}
        </button>
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

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{
          background: 'var(--bg-glass)', border: '1px solid var(--primary)',
          borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px',
        }}>
          <div style={{ marginBottom: '14px' }} ref={identifierRef}>
            <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Telegram ID, MAX ID или @username *
            </label>
            <input
              type="text"
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); if (e.target.value.trim()) setIdentifierError(''); }}
              placeholder="@username или 123456789"
              className={`input${identifierError ? ' field-error' : ''}`}
              style={{ width: '100%' }}
            />
            {identifierError && <div className="field-error-text">{identifierError}</div>}
            <div className="form-hint">
              Пользователь должен быть авторизован в системе. Telegram ID можно узнать через @userinfobot.
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Роль
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            >
              {Object.entries(ROLE_INFO).map(([key, info]) => (
                <option key={key} value={key}>{info.name} — {info.desc}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={adding} style={{ width: '100%' }}>
            {adding ? 'Добавление...' : 'Добавить сотрудника'}
          </button>
        </form>
      )}

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
            const displayName = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `ID ${s.user_id}`;
            return (
              <div key={s.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px',
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{displayName}</div>
                  {s.username && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>@{s.username}</div>
                  )}
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
                  onClick={() => handleRemove(s.id, displayName)}
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
    </div>
  );
}
