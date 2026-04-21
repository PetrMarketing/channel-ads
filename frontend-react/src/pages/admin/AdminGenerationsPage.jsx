import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const cardStyle = (color) => ({
  background: '#fff', borderRadius: 12, padding: 20, flex: '1 1 150px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`,
});
const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const statusColors = {
  draft: '#f4a261', generating: '#e76f51', generated: '#4361ee', published: '#2a9d8f',
  choose_avatar: '#7b68ee', done: '#2a9d8f', generating_avatars: '#e76f51',
};
const tabBtn = (active) => ({
  padding: '8px 16px', border: 'none', borderBottom: active ? '2px solid #4361ee' : '2px solid transparent',
  background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 13,
  color: active ? '#4361ee' : '#666',
});

export default function AdminGenerationsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('designs');

  useEffect(() => {
    setLoading(true);
    adminApi.get('/generations').then(d => {
      if (d?.success) setData(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const s = data?.summary || {};

  if (loading && !data) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Генерации</h2>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={cardStyle('#4361ee')}>
          <div style={{ fontSize: 13, color: '#888' }}>ИИ Дизайн</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{s.total_designs || 0}</div>
        </div>
        <div style={cardStyle('#7b68ee')}>
          <div style={{ fontSize: 13, color: '#888' }}>ИИ Лендинги</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{s.total_landings || 0}</div>
        </div>
        <div style={cardStyle('#2a9d8f')}>
          <div style={{ fontSize: 13, color: '#888' }}>Токенов потрачено</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{(s.total_tokens_used || 0).toLocaleString('ru-RU')}</div>
        </div>
        <div style={cardStyle('#e76f51')}>
          <div style={{ fontSize: 13, color: '#888' }}>В очереди (дизайн)</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{s.queue_designs || 0}</div>
        </div>
        <div style={cardStyle('#f4a261')}>
          <div style={{ fontSize: 13, color: '#888' }}>Черновики (лендинг)</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{s.queue_landings || 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #ddd', marginBottom: 16, display: 'flex', gap: 4 }}>
        <button style={tabBtn(tab === 'designs')} onClick={() => setTab('designs')}>
          ИИ Дизайн ({data?.design_sessions?.length || 0})
        </button>
        <button style={tabBtn(tab === 'landings')} onClick={() => setTab('landings')}>
          ИИ Лендинги ({data?.landing_sessions?.length || 0})
        </button>
        <button style={tabBtn(tab === 'usage')} onClick={() => setTab('usage')}>
          Расход токенов ({data?.usage?.length || 0})
        </button>
      </div>

      {/* Design sessions */}
      {tab === 'designs' && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Дата</th>
              <th style={thStyle}>Пользователь</th>
              <th style={thStyle}>Канал</th>
              <th style={thStyle}>Ниша</th>
              <th style={thStyle}>Стиль</th>
              <th style={thStyle}>Токены</th>
              <th style={thStyle}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {(data?.design_sessions || []).map(s => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.id}</td>
                <td style={tdStyle}>{fmtDate(s.created_at)}</td>
                <td style={tdStyle}>{s.user_name || s.user_username || '-'}</td>
                <td style={tdStyle}>{s.channel_title || '-'}</td>
                <td style={tdStyle}>{s.niche || '-'}</td>
                <td style={tdStyle}>{s.style || '-'}</td>
                <td style={tdStyle}>{s.tokens_spent || 0}</td>
                <td style={tdStyle}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${statusColors[s.status] || '#888'}20`, color: statusColors[s.status] || '#888' }}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
            {!(data?.design_sessions?.length) && (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет генераций</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Landing sessions */}
      {tab === 'landings' && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Дата</th>
              <th style={thStyle}>Пользователь</th>
              <th style={thStyle}>Канал</th>
              <th style={thStyle}>Ниша</th>
              <th style={thStyle}>Стиль</th>
              <th style={thStyle}>Токены</th>
              <th style={thStyle}>Slug</th>
              <th style={thStyle}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {(data?.landing_sessions || []).map(s => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.id}</td>
                <td style={tdStyle}>{fmtDate(s.created_at)}</td>
                <td style={tdStyle}>{s.user_name || s.user_username || '-'}</td>
                <td style={tdStyle}>{s.channel_title || '-'}</td>
                <td style={tdStyle}>{s.niche || '-'}</td>
                <td style={tdStyle}>{s.design_style || '-'}</td>
                <td style={tdStyle}>{s.tokens_spent || 0}</td>
                <td style={tdStyle}>{s.slug ? <a href={`/land/${s.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4361ee' }}>{s.slug}</a> : '-'}</td>
                <td style={tdStyle}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${statusColors[s.status] || '#888'}20`, color: statusColors[s.status] || '#888' }}>
                    {s.status}{s.published ? ' (pub)' : ''}
                  </span>
                </td>
              </tr>
            ))}
            {!(data?.landing_sessions?.length) && (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет лендингов</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Token usage */}
      {tab === 'usage' && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Дата</th>
              <th style={thStyle}>Пользователь</th>
              <th style={thStyle}>Действие</th>
              <th style={thStyle}>Описание</th>
              <th style={thStyle}>Токены</th>
            </tr>
          </thead>
          <tbody>
            {(data?.usage || []).map(u => (
              <tr key={u.id}>
                <td style={tdStyle}>{u.id}</td>
                <td style={tdStyle}>{fmtDate(u.created_at)}</td>
                <td style={tdStyle}>{u.user_name || u.user_username || '-'}</td>
                <td style={tdStyle}>{u.action}</td>
                <td style={tdStyle}>{u.description || '-'}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{u.tokens_used}</td>
              </tr>
            ))}
            {!(data?.usage?.length) && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет данных</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
