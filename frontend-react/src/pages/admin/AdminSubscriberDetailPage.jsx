import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import { pageTitle, card, tableWrap, th, td, badge, fmtDate, emptyState } from './adminStyles';

export default function AdminSubscriberDetailPage() {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    adminApi.get(`/subscribers/${identifier}`).then(d => { if (d) setData(d); }).catch(() => {});
    adminApi.get(`/subscribers/${identifier}/dialog`).then(d => { if (d) setMessages(d.messages || []); }).catch(() => {});
  }, [identifier]);

  const handleDeleteMsg = async (msgId) => {
    await adminApi.delete(`/subscribers/${identifier}/dialog/${msgId}`);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  if (!data) return <div style={{ ...emptyState, marginTop: 60 }}>Загрузка...</div>;
  const { user, subscriptions } = data;

  return (
    <div>
      <button
        onClick={() => navigate('/admin/subscribers')}
        style={{
          background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer',
          marginBottom: 16, fontSize: 13, fontWeight: 600, padding: 0,
        }}
      >
        &larr; К списку
      </button>

      <h1 style={{ ...pageTitle, marginBottom: 20 }}>
        {user.first_name || user.username || `#${user.id}`}
      </h1>

      {/* Info card */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          fontSize: 13, color: '#555',
        }}>
          <div><span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>Telegram ID</span><br />{user.telegram_id || '—'}</div>
          <div><span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>MAX ID</span><br />{user.max_user_id || '—'}</div>
          <div><span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>Username</span><br />{user.username || '—'}</div>
          <div><span style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>Дата регистрации</span><br />{fmtDate(user.created_at)}</div>
        </div>
      </div>

      {/* Subscriptions table */}
      <div style={{ ...tableWrap, marginBottom: 16 }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Подписки на каналы</h2>
        </div>
        {subscriptions.length === 0 ? (
          <div style={emptyState}>Нет подписок</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Канал</th>
                <th style={th}>Платформа</th>
                <th style={th}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s, i) => (
                <tr key={i} style={{ transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={td}>{s.channel_title}</td>
                  <td style={td}>
                    <span style={badge(
                      s.platform === 'telegram' ? '#dbeafe' : '#f3f4f6',
                      s.platform === 'telegram' ? '#1e40af' : '#6b7280',
                    )}>{s.platform}</span>
                  </td>
                  <td style={td}>{fmtDate(s.subscribed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog */}
      <div style={{ ...card }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Диалог с ботом</h2>
        {messages.length === 0 ? (
          <div style={emptyState}>Нет сообщений</div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex',
                justifyContent: msg.direction === 'outgoing' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start', gap: 8,
              }}>
                <div style={{
                  maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                  background: msg.direction === 'outgoing' ? '#4361ee' : '#f3f4f6',
                  color: msg.direction === 'outgoing' ? '#fff' : '#333',
                  fontSize: 13, lineHeight: 1.5,
                  boxShadow: msg.direction === 'outgoing'
                    ? '0 2px 8px rgba(67,97,238,0.25)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <div>{msg.message_text || '(без текста)'}</div>
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>
                    {fmtDate(msg.created_at)}
                    {msg.platform !== 'telegram' && ` [${msg.platform}]`}
                  </div>
                </div>
                <button onClick={() => handleDeleteMsg(msg.id)} style={{
                  background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                  fontSize: 16, padding: 2, alignSelf: 'center', transition: 'color 0.15s',
                  lineHeight: 1,
                }} title="Удалить"
                  onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                  onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                >&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
