import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const rowHover = { cursor: 'pointer' };

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = () => {
    adminApi.get(`/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`).then(d => {
      if (d) { setUsers(d.users || []); setTotal(d.total || 0); }
    }).catch(() => {});
  };
  useEffect(load, [page, search]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Пользователи</h2>
      <input placeholder="Поиск по PKid, username, имени..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: 360, padding: 8, border: '1px solid #ddd', borderRadius: 6, marginBottom: 16, fontSize: 13 }} />
      <table style={tableStyle}>
        <thead><tr>
          <th style={thStyle}>PKid</th><th style={thStyle}>Username</th><th style={thStyle}>Имя</th>
          <th style={thStyle}>TG / MAX ID</th><th style={thStyle}>Каналов</th><th style={thStyle}>Дата</th>
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={rowHover} onClick={() => navigate(`/admin/users/${u.id}`)}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f8ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={tdStyle}>{u.id}</td>
              <td style={tdStyle}>{u.username || '-'}</td>
              <td style={tdStyle}>{u.first_name || '-'}</td>
              <td style={tdStyle}>{u.telegram_id || u.max_user_id || '-'}</td>
              <td style={tdStyle}>{u.channel_count}</td>
              <td style={tdStyle}>{u.created_at ? new Date(u.created_at).toLocaleDateString('ru') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Назад</button>
          <span style={{ padding: '6px 8px', fontSize: 13 }}>Стр. {page} из {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Далее</button>
        </div>
      )}
    </div>
  );
}
