import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const btnPrimary = { background: '#4361ee', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };
const inputStyle = { width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

const emptyForm = { username: '', password: '', display_name: '', role: 'admin' };

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
        const body = { display_name: form.display_name, role: form.role };
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
    setForm({ username: a.username, password: '', display_name: a.display_name || '', role: a.role });
    setModal(a); setError('');
  };

  const roleLabels = { superadmin: 'Суперадмин', admin: 'Админ', viewer: 'Просмотр' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Администраторы панели</h2>
        <button onClick={() => { setForm(emptyForm); setModal('create'); setError(''); }} style={btnPrimary}>Добавить</button>
      </div>

      <table style={tableStyle}>
        <thead><tr>
          <th style={thStyle}>ID</th><th style={thStyle}>Логин</th><th style={thStyle}>Имя</th>
          <th style={thStyle}>Роль</th><th style={thStyle}>Последний вход</th><th style={thStyle}></th>
        </tr></thead>
        <tbody>
          {admins.map(a => (
            <tr key={a.id}>
              <td style={tdStyle}>{a.id}</td>
              <td style={tdStyle}>{a.username}</td>
              <td style={tdStyle}>{a.display_name || '-'}</td>
              <td style={tdStyle}><span style={{
                background: a.role === 'superadmin' ? '#ffe0e0' : a.role === 'admin' ? '#e0e8ff' : '#e8e8e8',
                padding: '2px 8px', borderRadius: 4, fontSize: 11,
              }}>{roleLabels[a.role] || a.role}</span></td>
              <td style={tdStyle}>{a.last_login_at ? new Date(a.last_login_at).toLocaleString('ru') : '-'}</td>
              <td style={tdStyle}>
                <button style={btnEdit} onClick={() => openEdit(a)}>Ред.</button>
                <button style={btnDanger} onClick={() => handleDelete(a.id)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360 }}>
            <h3 style={{ margin: '0 0 16px' }}>{modal === 'create' ? 'Новый администратор' : 'Редактировать'}</h3>
            {error && <div style={{ background: '#fee', color: '#c00', padding: 8, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>{error}</div>}
            {modal === 'create' && (
              <input placeholder="Логин" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={inputStyle} />
            )}
            <input placeholder={modal === 'create' ? 'Пароль' : 'Новый пароль (оставьте пустым)'} type="password"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
            <input placeholder="Отображаемое имя" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} style={inputStyle} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="superadmin">Суперадмин</option>
              <option value="admin">Админ</option>
              <option value="viewer">Просмотр</option>
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleSave} style={btnPrimary}>Сохранить</button>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
