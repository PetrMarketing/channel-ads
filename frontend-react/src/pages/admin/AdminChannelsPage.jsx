import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, tableWrap, th, td, searchInput, badge, emptyState, fmtDate,
  btnOutline, statusBadge,
} from './adminStyles';

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const navigate = useNavigate();

  const load = () => {
    let url = `/channels?page=${page}&limit=20&search=${encodeURIComponent(search)}`;
    if (platform) url += `&platform=${platform}`;
    adminApi.get(url).then(d => { if (d) { setChannels(d.channels || []); setTotal(d.total || 0); } }).catch(() => {});
  };
  useEffect(load, [page, search, platform]);

  const totalPages = Math.ceil(total / 20);

  const platformBadge = (p) => {
    if (p === 'max') return badge('#dbeafe', '#1e40af');
    return badge('#dcfce7', '#166534');
  };

  const selectStyle = {
    padding: '8px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
    fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
  };

  return (
    <div>
      <h2 style={pageTitle}>Каналы</h2>
      <p style={{ fontSize: 12, color: '#bbb', marginTop: 3, marginBottom: 20 }}>
        Всего: {total}
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Поиск по названию..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={searchInput}
        />
        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Все платформы</option>
          <option value="telegram">Telegram</option>
          <option value="max">MAX</option>
        </select>
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Название</th>
              <th style={th}>Username</th>
              <th style={th}>Платформа</th>
              <th style={th}>Владелец</th>
              <th style={th}>Подписка</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr><td colSpan={6} style={emptyState}>Каналы не найдены</td></tr>
            )}
            {channels.map(ch => (
              <tr
                key={ch.id}
                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => navigate(`/admin/channels/${ch.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ ...td, fontWeight: 600, color: '#6b7280' }}>{ch.id}</td>
                <td style={{ ...td, fontWeight: 600 }}>{ch.title || '—'}</td>
                <td style={{ ...td, color: '#6b7280' }}>{ch.username || '—'}</td>
                <td style={td}>
                  <span style={platformBadge(ch.platform)}>{ch.platform}</span>
                </td>
                <td style={td}>{ch.owner_name || ch.owner_username || '—'}</td>
                <td style={td}>
                  <span style={statusBadge(ch.billing_status === 'active' ? 'active' : 'closed')}>
                    {ch.billing_status || 'нет'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ ...btnOutline, opacity: page <= 1 ? 0.4 : 1 }}
          >
            Назад
          </button>
          <span style={{ padding: '6px 10px', fontSize: 13, color: '#888' }}>
            Стр. {page} из {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ ...btnOutline, opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Далее
          </button>
        </div>
      )}
    </div>
  );
}
