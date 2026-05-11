import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td,
  btnPrimary, btnOutline, btnDanger, badge, emptyState,
  modalOverlay, modalBox, searchInput, fmtDate,
} from './adminStyles';

const emptyForm = { username: '', password: '', display_name: '', role: 'admin', user_pkid: '' };

const roleConfig = {
  superadmin: { label: 'Суперадмин', bg: '#fef2f2', color: '#991b1b' },
  admin:      { label: 'Админ',      bg: '#dbeafe', color: '#1e40af' },
  viewer:     { label: 'Просмотр',   bg: '#f3f4f6', color: '#6b7280' },
};

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState([]);
  const [modal, setModal] = useState(null); // null | 'create' | {id, ...}
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => adminApi.get('/admins').then(d => { if (d) setAdmins(d.admins || []); }).catch(() => {});
  useEffect(load, []);

  const handleSave = async () => {
    setError('');
    try {
      if (modal === 'create') {
        if (!form.username || !form.password) { setError('Логин и пароль обязательны'); return; }
        await adminApi.post('/admins', form);
      } else {
        const body = { display_name: form.display_name, role: form.role, user_pkid: form.user_pkid || null };
        if (form.password) body.password = form.password;
        await adminApi.put(`/admins/${modal.id}`, body);
      }
      setModal(null); setForm(emptyForm); load();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить администратора?')) return;
    try { await adminApi.delete(`/admins/${id}`); load(); } catch (err) { alert(err.message); }
  };

  const openEdit = (a) => {
    setForm({
      username: a.username,
      password: '',
      display_name: a.display_name || '',
      role: a.role,
      user_pkid: a.user_pkid || '',
    });
    setModal(a); setError('');
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10,
    fontSize: 13, boxSizing: 'border-box', marginBottom: 12, outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={pageTitle}>Администраторы панели</h2>
        <button
          onClick={() => { setForm(emptyForm); setModal('create'); setError(''); }}
          style={btnPrimary}
        >
          + Добавить
        </button>
      </div>

      {/* Table */}
      {admins.length === 0 ? (
        <div style={{ ...card, ...emptyState }}>Нет администраторов</div>
      ) : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Логин</th>
                <th style={th}>Имя</th>
                <th style={th}>Роль</th>
                <th style={th}>PKid</th>
                <th style={th}>Последний вход</th>
                <th style={{ ...th, textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a => {
                const rc = roleConfig[a.role] || roleConfig.viewer;
                return (
                  <tr key={a.id} style={{ transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...td, fontWeight: 600, color: '#999', width: 50 }}>{a.id}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{a.username}</td>
                    <td style={td}>{a.display_name || '—'}</td>
                    <td style={td}>
                      <span style={badge(rc.bg, rc.color)}>{rc.label}</span>
                    </td>
                    <td style={td}>
                      {a.user_pkid ? (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 700 }}>#{a.user_pkid}</div>
                          {(a.pkid_first_name || a.pkid_username) && (
                            <div style={{ color: '#6b7280', fontSize: 11 }}>{a.pkid_first_name || a.pkid_username}</div>
                          )}
                          {a.pkid_max_user_id && (
                            <div style={{ color: '#7c3aed', fontSize: 11 }}>MAX: {a.pkid_max_user_id}</div>
                          )}
                        </div>
                      ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...td, color: '#999' }}>{fmtDate(a.last_login_at)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={{ ...btnOutline, marginRight: 6 }} onClick={() => openEdit(a)}>Ред.</button>
                      <button style={btnDanger} onClick={() => handleDelete(a.id)}>Удалить</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={modalOverlay} onClick={() => setModal(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
              {modal === 'create' ? 'Новый администратор' : 'Редактировать'}
            </h3>

            {error && (
              <div style={{
                background: '#fef2f2', color: '#991b1b', padding: '10px 14px',
                borderRadius: 10, marginBottom: 14, fontSize: 12, fontWeight: 500,
                border: '1px solid #fecaca',
              }}>
                {error}
              </div>
            )}

            {modal === 'create' && (
              <input
                placeholder="Логин"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                style={inputStyle}
              />
            )}

            <input
              placeholder={modal === 'create' ? 'Пароль' : 'Новый пароль (оставьте пустым)'}
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              style={inputStyle}
            />

            <input
              placeholder="Отображаемое имя"
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
              style={inputStyle}
            />

            <input
              placeholder="PKid пользователя сервиса (для связки с MAX-аккаунтом)"
              type="number"
              value={form.user_pkid}
              onChange={e => setForm({ ...form, user_pkid: e.target.value })}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: -8, marginBottom: 12 }}>
              💡 PKid виден в шапке сервиса (кнопка «Профиль»). Используется для «Отправить себе» в рассылках и в будущем — для импер-логина.
            </div>

            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              style={{ ...inputStyle, appearance: 'auto' }}
            >
              <option value="superadmin">Суперадмин</option>
              <option value="admin">Админ</option>
              <option value="viewer">Просмотр</option>
            </select>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={handleSave} style={btnPrimary}>Сохранить</button>
              <button onClick={() => setModal(null)} style={btnOutline}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
