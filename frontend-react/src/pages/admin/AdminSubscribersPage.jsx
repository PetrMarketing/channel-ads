import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import { pageTitle, tableWrap, th, td, searchInput, emptyState, fmtDate, btnOutline } from './adminStyles';

export default function AdminSubscribersPage() {
  const [subs, setSubs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    adminApi.get(`/subscribers?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then(d => {
        if (d && d.subscribers) {
          setSubs(d.subscribers);
          setTotal(d.total || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <h2 style={pageTitle}>Подписчики</h2>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <input
          placeholder="Поиск по telegram_id, username..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={searchInput}
        />
      </div>

      {loading ? (
        <div style={emptyState}>Загрузка...</div>
      ) : subs.length === 0 ? (
        <div style={emptyState}>Подписчиков не найдено</div>
      ) : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Имя</th>
                <th style={th}>Канал</th>
                <th style={th}>Платформа</th>
                <th style={th}>Дата подписки</th>
              </tr>
            </thead>
            <tbody>
              {subs.map(function(s) {
                var identifier = String(s.telegram_id || s.max_user_id || s.id);
                return (
                  <tr
                    key={String(s.id)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={function() { navigate('/admin/subscribers/' + identifier); }}
                    onMouseEnter={function(e) { e.currentTarget.style.background = '#f8f9ff'; }}
                    onMouseLeave={function(e) { e.currentTarget.style.background = ''; }}
                  >
                    <td style={td}>{identifier}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{s.first_name || s.username || '—'}</td>
                    <td style={td}>{s.channel_title || '—'}</td>
                    <td style={td}>{s.platform || '—'}</td>
                    <td style={td}>{fmtDate(s.subscribed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#999' }}>Всего: {total}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={function() { setPage(function(p) { return p - 1; }); }}
            style={{ ...btnOutline, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}
          >Назад</button>
          <span style={{ fontSize: 13, color: '#666' }}>{'Стр. ' + page + ' из ' + totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={function() { setPage(function(p) { return p + 1; }); }}
            style={{ ...btnOutline, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'default' : 'pointer' }}
          >Далее</button>
        </div>
      </div>
    </div>
  );
}
