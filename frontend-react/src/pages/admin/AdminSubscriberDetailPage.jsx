import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

const cardStyle = { background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };

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

  if (!data) return <div>Загрузка...</div>;
  const { user, subscriptions } = data;

  return (
    <div>
      <button onClick={() => navigate('/admin/subscribers')} style={{ background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
        &larr; К списку
      </button>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>{user.first_name || user.username || `#${user.id}`}</h3>
        <div style={{ fontSize: 13, color: '#666', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>Telegram ID: {user.telegram_id || '-'}</div>
          <div>MAX ID: {user.max_user_id || '-'}</div>
          <div>Username: {user.username || '-'}</div>
          <div>Дата: {user.created_at ? new Date(user.created_at).toLocaleDateString('ru') : '-'}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 12px' }}>Подписки на каналы</h4>
        {subscriptions.length === 0 ? <div style={{ fontSize: 13, color: '#999' }}>Нет подписок</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#888', borderBottom: '1px solid #eee', fontSize: 12 }}>Канал</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#888', borderBottom: '1px solid #eee', fontSize: 12 }}>Платформа</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', color: '#888', borderBottom: '1px solid #eee', fontSize: 12 }}>Дата</th>
            </tr></thead>
            <tbody>{subscriptions.map((s, i) => (
              <tr key={i}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{s.channel_title}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{s.platform}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString('ru') : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 12px' }}>Диалог с ботом</h4>
        {messages.length === 0 ? <div style={{ fontSize: 13, color: '#999' }}>Нет сообщений</div> : (
          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex', justifyContent: msg.direction === 'outgoing' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start', gap: 8,
              }}>
                <div style={{
                  maxWidth: '70%', padding: '8px 12px', borderRadius: 12,
                  background: msg.direction === 'outgoing' ? '#4361ee' : '#e8e8e8',
                  color: msg.direction === 'outgoing' ? '#fff' : '#333', fontSize: 13,
                  position: 'relative',
                }}>
                  <div>{msg.message_text || '(без текста)'}</div>
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleString('ru') : ''}
                    {msg.platform !== 'telegram' && ` [${msg.platform}]`}
                  </div>
                </div>
                <button onClick={() => handleDeleteMsg(msg.id)} style={{
                  background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: 2,
                  alignSelf: 'center',
                }} title="Удалить">&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
