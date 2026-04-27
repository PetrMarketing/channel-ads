import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, tableWrap, th, td, statusBadge, statCard, fmtDate, emptyState,
} from './adminStyles';

const statusColors = {
  draft: '#9ca3af', generating: '#7c3aed', generated: '#2563eb',
  published: '#16a34a', choose_avatar: '#7b68ee', done: '#16a34a',
  generating_avatars: '#7c3aed',
};

const pillWrap = {
  display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 12,
  padding: 4, marginBottom: 20, width: 'fit-content',
};

const pillBtn = (active) => ({
  padding: '7px 18px', borderRadius: 10, border: 'none',
  background: active ? '#4361ee' : 'transparent',
  color: active ? '#fff' : '#888',
  fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
  transition: 'all 0.2s',
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

  const s = data?.summary || {};

  if (loading && !data) return <div style={{ padding: 40, color: '#bbb', fontSize: 14 }}>Загрузка...</div>;

  return (
    <div>
      <h2 style={{ ...pageTitle, marginBottom: 24 }}>Генерации</h2>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ ...statCard('#4361ee'), flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>ИИ Дизайн</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 0', color: '#1a1a2e' }}>{s.total_designs || 0}</div>
        </div>
        <div style={{ ...statCard('#7c3aed'), flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>ИИ Лендинги</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 0', color: '#1a1a2e' }}>{s.total_landings || 0}</div>
        </div>
        <div style={{ ...statCard('#16a34a'), flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Токенов потрачено</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 0', color: '#1a1a2e' }}>{(s.total_tokens_used || 0).toLocaleString('ru-RU')}</div>
        </div>
        <div style={{ ...statCard('#e76f51'), flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>В очереди (дизайн)</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 0', color: '#1a1a2e' }}>{s.queue_designs || 0}</div>
        </div>
        <div style={{ ...statCard('#f59e0b'), flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Черновики (лендинг)</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 0', color: '#1a1a2e' }}>{s.queue_landings || 0}</div>
        </div>
      </div>

      {/* Pill tabs */}
      <div style={pillWrap}>
        <button style={pillBtn(tab === 'designs')} onClick={() => setTab('designs')}>
          ИИ Дизайн ({data?.design_sessions?.length || 0})
        </button>
        <button style={pillBtn(tab === 'landings')} onClick={() => setTab('landings')}>
          ИИ Лендинги ({data?.landing_sessions?.length || 0})
        </button>
        <button style={pillBtn(tab === 'usage')} onClick={() => setTab('usage')}>
          Расход токенов ({data?.usage?.length || 0})
        </button>
      </div>

      {/* Design sessions */}
      {tab === 'designs' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Канал</th>
                <th style={th}>Ниша</th>
                <th style={th}>Стиль</th>
                <th style={th}>Токены</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {(data?.design_sessions || []).map(row => (
                <tr key={row.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={td}>{row.id}</td>
                  <td style={td}>{fmtDate(row.created_at)}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{row.user_name || row.user_username || '—'}</td>
                  <td style={td}>{row.channel_title || '—'}</td>
                  <td style={td}>{row.niche || '—'}</td>
                  <td style={td}>{row.style || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{row.tokens_spent || 0}</td>
                  <td style={td}>
                    <span style={statusBadge(row.status)}>{row.status}</span>
                  </td>
                </tr>
              ))}
              {!(data?.design_sessions?.length) && (
                <tr><td colSpan={8} style={emptyState}>Нет генераций</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Landing sessions */}
      {tab === 'landings' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Канал</th>
                <th style={th}>Ниша</th>
                <th style={th}>Стиль</th>
                <th style={th}>Токены</th>
                <th style={th}>Slug</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {(data?.landing_sessions || []).map(row => (
                <tr key={row.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={td}>{row.id}</td>
                  <td style={td}>{fmtDate(row.created_at)}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{row.user_name || row.user_username || '—'}</td>
                  <td style={td}>{row.channel_title || '—'}</td>
                  <td style={td}>{row.niche || '—'}</td>
                  <td style={td}>{row.design_style || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{row.tokens_spent || 0}</td>
                  <td style={td}>
                    {row.slug
                      ? <a href={`/land/${row.slug}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: '#4361ee', fontWeight: 500, textDecoration: 'none' }}>{row.slug}</a>
                      : '—'}
                  </td>
                  <td style={td}>
                    <span style={statusBadge(row.status)}>
                      {row.status}{row.published ? ' (pub)' : ''}
                    </span>
                  </td>
                </tr>
              ))}
              {!(data?.landing_sessions?.length) && (
                <tr><td colSpan={9} style={emptyState}>Нет лендингов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Token usage */}
      {tab === 'usage' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Действие</th>
                <th style={th}>Описание</th>
                <th style={th}>Токены</th>
              </tr>
            </thead>
            <tbody>
              {(data?.usage || []).map(u => (
                <tr key={u.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={td}>{u.id}</td>
                  <td style={td}>{fmtDate(u.created_at)}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{u.user_name || u.user_username || '—'}</td>
                  <td style={td}>{u.action}</td>
                  <td style={td}>{u.description || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{u.tokens_used}</td>
                </tr>
              ))}
              {!(data?.usage?.length) && (
                <tr><td colSpan={6} style={emptyState}>Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
