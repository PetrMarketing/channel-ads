import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

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

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleDateString('ru-RU'); } catch { return '-'; }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Подписчики</h2>
      <input
        placeholder="Поиск по telegram_id, username..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width: 360, padding: 8, border: '1px solid #ddd', borderRadius: 6, marginBottom: 16, fontSize: 13 }}
      />

      {loading ? (
        <div style={{ padding: 20, color: '#888' }}>Загрузка...</div>
      ) : subs.length === 0 ? (
        <div style={{ padding: 20, color: '#888' }}>Подписчиков не найдено</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 }}>ID</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 }}>Имя</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 }}>Канал</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 }}>Платформа</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 }}>Дата подписки</th>
            </tr>
          </thead>
          <tbody>
            {subs.map(function(s) {
              var identifier = String(s.telegram_id || s.max_user_id || s.id);
              return (
                <tr
                  key={String(s.id)}
                  style={{ cursor: 'pointer' }}
                  onClick={function() { navigate('/admin/subscribers/' + identifier); }}
                  onMouseEnter={function(e) { e.currentTarget.style.background = '#f8f8ff'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.background = ''; }}
                >
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}>{identifier}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}>{s.first_name || s.username || '-'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}>{s.channel_title || '-'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}>{s.platform || '-'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}>{formatDate(s.subscribed_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#888' }}>Всего: {total}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={function() { setPage(function(p) { return p - 1; }); }}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
          >Назад</button>
          <span style={{ fontSize: 13 }}>{'Стр. ' + page + ' из ' + totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={function() { setPage(function(p) { return p + 1; }); }}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
          >Далее</button>
        </div>
      </div>
    </div>
  );
}
