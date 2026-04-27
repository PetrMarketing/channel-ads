import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, tableWrap, th, td, searchInput,
  btnPrimary, btnOutline, emptyState, fmtDate,
} from './adminStyles';

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
      <h2 style={pageTitle}>Пользователи</h2>
      <p style={{ fontSize: 12, color: '#bbb', marginTop: 3, marginBottom: 16 }}>
        Всего: {total}
      </p>

      <input
        placeholder="Поиск по PKid, username, имени..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ ...searchInput, width: 360, marginBottom: 16 }}
      />

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>PKid</th>
              <th style={th}>Username</th>
              <th style={th}>Имя</th>
              <th style={th}>TG / MAX ID</th>
              <th style={th}>Токены</th>
              <th style={th}>Каналов</th>
              <th style={th}>Дата</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={7} style={emptyState}>Пользователи не найдены</td></tr>
            )}
            {users.map(u => (
              <tr
                key={u.id}
                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={td}>{u.id}</td>
                <td style={td}>{u.username || '—'}</td>
                <td style={td}>{u.first_name || '—'}</td>
                <td style={td}>{u.telegram_id || u.max_user_id || '—'}</td>
                <td style={{ ...td, color: '#4361ee', fontWeight: 700 }}>{u.ai_tokens || 0}</td>
                <td style={td}>{u.channel_count}</td>
                <td style={{ ...td, color: '#999' }}>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              ...btnOutline,
              opacity: page <= 1 ? 0.4 : 1,
              pointerEvents: page <= 1 ? 'none' : 'auto',
            }}
          >
            Назад
          </button>
          <span style={{ padding: '6px 10px', fontSize: 13, color: '#888' }}>
            Стр. {page} из {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              ...btnPrimary,
              opacity: page >= totalPages ? 0.4 : 1,
              pointerEvents: page >= totalPages ? 'none' : 'auto',
            }}
          >
            Далее
          </button>
        </div>
      )}
    </div>
  );
}
