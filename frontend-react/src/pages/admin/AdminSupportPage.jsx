import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, statusBadge,
  searchInput, btnPrimary, btnOutline, fmtDate, emptyState,
} from './adminStyles';

const statusLabels = {
  ai: 'ИИ',
  escalated: 'Ожидание человека',
  waiting_human: 'Ожидание человека',
  answered: 'Отвечен',
  closed: 'Закрыт',
};

const filterOptions = [
  { value: '', label: 'Все' },
  { value: 'waiting_human', label: 'Ожидание человека' },
  { value: 'escalated', label: 'Эскалация' },
  { value: 'answered', label: 'Отвечен' },
  { value: 'ai', label: 'ИИ' },
  { value: 'closed', label: 'Закрыт' },
];

const pillFilter = (active) => ({
  padding: '6px 16px', borderRadius: 20, border: 'none',
  background: active ? '#4361ee' : '#f3f4f6',
  color: active ? '#fff' : '#888',
  fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
  transition: 'all 0.2s',
});

const avatarStyle = (role) => ({
  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
  background: role === 'user' ? '#4361ee' : role === 'admin' ? '#10B981' : '#7C3AED',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 10, color: '#fff', fontWeight: 700,
});

const bubbleStyle = (role) => ({
  borderRadius: role === 'user' ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
  padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
  maxWidth: 440, whiteSpace: 'pre-wrap',
  background: role === 'user' ? '#eef1ff' : role === 'admin' ? '#dcfce7' : '#f3f4f6',
  color: '#1a1a2e',
});

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

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

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(t.id).includes(q) ||
      (t.user_name || '').toLowerCase().includes(q) ||
      (t.user_username || '').toLowerCase().includes(q) ||
      (t.last_message || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={pageTitle}>Обращения</h2>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 3 }}>
            {tickets.length} тикет(ов)
          </div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по тикетам..."
          style={searchInput}
        />
      </div>

      {/* Pill filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {filterOptions.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} style={pillFilter(filter === f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: 20, minHeight: 520 }}>
        {/* Ticket list */}
        <div style={{ ...tableWrap, flex: '0 0 440px', overflow: 'auto', maxHeight: 620 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Статус</th>
                <th style={th}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => openTicket(t)}
                  style={{
                    cursor: 'pointer',
                    background: selected?.id === t.id ? '#eef1ff' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={td}>
                    {t.escalated && <span title="Эскалация" style={{ marginRight: 4, color: '#dc2626' }}>!</span>}
                    {t.id}
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13 }}>
                      {t.user_name || t.user_username || `#${t.user_id}`}
                    </div>
                    <div style={{
                      fontSize: 11, color: '#aaa', marginTop: 3,
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.last_message || '\u2014'}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={statusBadge(t.status)}>
                      {statusLabels[t.status] || t.status}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: '#999' }}>{fmtDate(t.updated_at)}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={4} style={emptyState}>Нет обращений</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Chat detail */}
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          {selected ? (
            <>
              {/* Chat header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#fafbfc',
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14 }}>
                    {selected.user_name || selected.user_username || `Пользователь #${selected.user_id}`}
                  </span>
                  <span style={{ fontSize: 12, color: '#bbb', marginLeft: 10 }}>Тикет #{selected.id}</span>
                  <span style={{ ...statusBadge(selected.status), marginLeft: 10 }}>
                    {statusLabels[selected.status] || selected.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(selected.escalated || ['waiting_human', 'escalated', 'answered'].includes(selected.status)) && selected.status !== 'closed' && (
                    <button onClick={async () => {
                      if (!confirm('Вернуть диалог ИИ-ассистенту?')) return;
                      await adminApi.post(`/support/tickets/${selected.id}/return-to-ai`, {});
                      openTicket(selected);
                      loadTickets();
                    }} style={btnOutline}>↩ Вернуть ИИ</button>
                  )}
                  {selected.status !== 'closed' && (
                    <button onClick={closeTicket} style={btnOutline}>Закрыть тикет</button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxHeight: 420, background: '#fafbfc' }}>
                {messages.map(m => (
                  <div key={m.id} style={{
                    marginBottom: 16, display: 'flex', gap: 10,
                    flexDirection: m.role === 'user' ? 'row' : 'row-reverse',
                  }}>
                    <div style={avatarStyle(m.role)}>
                      {m.role === 'user' ? 'U' : m.role === 'admin' ? 'A' : 'AI'}
                    </div>
                    <div style={{ maxWidth: 440 }}>
                      {m.image_url && (
                        <img
                          src={m.image_url} alt=""
                          style={{
                            maxWidth: 280, maxHeight: 180, borderRadius: 12,
                            marginBottom: 6, display: 'block', cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          }}
                          onClick={() => window.open(m.image_url, '_blank')}
                        />
                      )}
                      <div style={bubbleStyle(m.role)}>{m.content}</div>
                      <div style={{ fontSize: 10, color: '#ccc', marginTop: 4, textAlign: m.role === 'user' ? 'left' : 'right' }}>
                        {m.role === 'admin' ? 'Админ' : m.role === 'ai' ? 'ИИ' : ''}{' '}
                        {fmtDate(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
                {!messages.length && (
                  <div style={emptyState}>Нет сообщений</div>
                )}
              </div>

              {/* Reply input */}
              {selected.status !== 'closed' && (
                <div style={{
                  padding: '14px 20px', borderTop: '1px solid #f0f0f0',
                  display: 'flex', gap: 10, background: '#fff',
                }}>
                  <input
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                    placeholder="Ответ от администратора..."
                    style={{ ...searchInput, flex: 1, width: 'auto' }}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    style={{
                      ...btnPrimary,
                      opacity: sending || !reply.trim() ? 0.5 : 1,
                    }}
                  >{sending ? '...' : 'Отправить'}</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ ...emptyState, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Выберите обращение из списка
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
