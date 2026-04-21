import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';

const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5', cursor: 'pointer' };
const statusMap = {
  ai: { label: 'ИИ', bg: '#eef1ff', color: '#4361ee' },
  escalated: { label: '❗Эскалация', bg: '#fff3cd', color: '#856404' },
  answered: { label: 'Отвечен', bg: '#d4edda', color: '#155724' },
  closed: { label: 'Закрыт', bg: '#f0f0f0', color: '#666' },
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');

  const loadTickets = useCallback(async () => {
    const data = await adminApi.get(`/support/tickets${filter ? `?status=${filter}` : ''}`);
    if (data?.success) setTickets(data.tickets || []);
  }, [filter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openTicket = async (t) => {
    setSelected(t);
    const data = await adminApi.get(`/support/tickets/${t.id}`);
    if (data?.success) setMessages(data.messages || []);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const data = await adminApi.post(`/support/tickets/${selected.id}/reply`, { content: reply });
      if (data?.success) {
        setReply('');
        openTicket(selected);
        loadTickets();
      }
    } catch {} finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!selected) return;
    await adminApi.post(`/support/tickets/${selected.id}/close`, {});
    setSelected(null);
    setMessages([]);
    loadTickets();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Обращения</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['', 'escalated', 'ai', 'answered', 'closed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 12px', border: filter === f ? '2px solid #4361ee' : '1px solid #ddd',
              borderRadius: 6, background: filter === f ? '#eef1ff' : '#fff', cursor: 'pointer',
              fontSize: 12, fontWeight: filter === f ? 600 : 400, color: filter === f ? '#4361ee' : '#666',
            }}>{f === '' ? 'Все' : f === 'escalated' ? '❗Эскалация' : statusMap[f]?.label || f}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
        {/* Ticket list */}
        <div style={{ flex: '0 0 420px', background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'auto', maxHeight: 600 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Пользователь</th>
                <th style={thStyle}>Статус</th>
                <th style={thStyle}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const st = statusMap[t.status] || statusMap.ai;
                return (
                  <tr key={t.id} onClick={() => openTicket(t)}
                    style={{ background: selected?.id === t.id ? '#f0f0ff' : 'transparent' }}>
                    <td style={tdStyle}>
                      {t.escalated && <span title="Эскалация" style={{ marginRight: 4 }}>❗</span>}
                      {t.id}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{t.user_name || t.user_username || `#${t.user_id}`}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.last_message || '—'}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>{fmtDate(t.updated_at)}</td>
                  </tr>
                );
              })}
              {!tickets.length && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет обращений</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Chat detail */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
          {selected ? (
            <>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{selected.user_name || selected.user_username || `Пользователь #${selected.user_id}`}</span>
                  <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>Тикет #{selected.id}</span>
                </div>
                <button onClick={closeTicket} style={{
                  padding: '4px 12px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6,
                  background: '#fff', cursor: 'pointer', color: '#666',
                }}>Закрыть тикет</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxHeight: 400 }}>
                {messages.map(m => (
                  <div key={m.id} style={{ marginBottom: 12, display: 'flex', gap: 8, flexDirection: m.role === 'user' ? 'row' : 'row' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: m.role === 'user' ? '#4361ee' : m.role === 'admin' ? '#10B981' : '#7B68EE',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#fff', fontWeight: 700,
                    }}>{m.role === 'user' ? 'U' : m.role === 'admin' ? 'A' : 'AI'}</div>
                    <div>
                      {m.image_url && (
                        <img src={m.image_url} alt="" style={{ maxWidth: 280, maxHeight: 180, borderRadius: 8, marginBottom: 4, display: 'block', cursor: 'pointer' }}
                          onClick={() => window.open(m.image_url, '_blank')} />
                      )}
                      <div style={{
                        background: m.role === 'user' ? '#eef1ff' : m.role === 'admin' ? '#d4edda' : '#f5f5f5',
                        borderRadius: 8, padding: '8px 12px', fontSize: 13, lineHeight: 1.5,
                        maxWidth: 400, whiteSpace: 'pre-wrap',
                      }}>{m.content}</div>
                      <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>{fmtDate(m.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {selected.status !== 'closed' && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
                  <input value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                    placeholder="Ответ от администратора..."
                    style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '8px 12px', fontSize: 13 }} />
                  <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
                    padding: '8px 16px', background: '#4361ee', color: '#fff', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    opacity: sending || !reply.trim() ? 0.5 : 1,
                  }}>{sending ? '...' : 'Отправить'}</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 14 }}>
              Выберите обращение из списка
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
