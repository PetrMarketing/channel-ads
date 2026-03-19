import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };

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

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Каналы</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input placeholder="Поиск по названию..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 300, padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
        <select value={platform} onChange={e => { setPlatform(e.target.value); setPage(1); }}
          style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
          <option value="">Все платформы</option>
          <option value="telegram">Telegram</option>
          <option value="max">MAX</option>
        </select>
      </div>
      <table style={tableStyle}>
        <thead><tr>
          <th style={thStyle}>ID</th><th style={thStyle}>Название</th><th style={thStyle}>Username</th>
          <th style={thStyle}>Платформа</th><th style={thStyle}>Владелец</th><th style={thStyle}>Подписка</th>
        </tr></thead>
        <tbody>
          {channels.map(ch => (
            <tr key={ch.id} style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/admin/channels/${ch.id}`)}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f8ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={tdStyle}>{ch.id}</td>
              <td style={tdStyle}>{ch.title || '-'}</td>
              <td style={tdStyle}>{ch.username || '-'}</td>
              <td style={tdStyle}><span style={{ background: ch.platform === 'max' ? '#e0f0ff' : '#e0ffe0', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{ch.platform}</span></td>
              <td style={tdStyle}>{ch.owner_name || ch.owner_username || '-'}</td>
              <td style={tdStyle}><span style={{ color: ch.billing_status === 'active' ? '#2a9d8f' : '#999' }}>{ch.billing_status || 'нет'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Назад</button>
          <span style={{ padding: '6px 8px', fontSize: 13 }}>Стр. {page} из {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Далее</button>
        </div>
      )}
    </div>
  );
}
