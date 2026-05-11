import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [ticketStatus, setTicketStatus] = useState('ai');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEnd = useRef(null);
  const pollRef = useRef(null);
  const fileRef = useRef(null);

  const scrollBottom = () => {
    setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const loadTicket = useCallback(async () => {
    try {
      const data = await api.get('/support/ticket');
      if (data.success) {
        setTicketId(data.ticket_id);
        setTicketStatus(data.status);
        setMessages(data.messages || []);
        setLoaded(true);
      }
    } catch {}
  }, []);

  useEffect(() => { if (open && !loaded) loadTicket(); }, [open, loaded, loadTicket]);
  useEffect(() => { if (open) scrollBottom(); }, [messages, open]);

  // Поллинг новых сообщений + статуса (статус может смениться, если админ
  // подключился или вернул диалог ИИ — без перезагрузки чата это не видно).
  useEffect(() => {
    if (!open || !ticketId) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get(`/support/ticket/${ticketId}/messages`);
        if (data.success) {
          if (data.messages?.length > messages.length) setMessages(data.messages);
          if (data.status && data.status !== ticketStatus) setTicketStatus(data.status);
        }
      } catch {}
    }, 6000);
    return () => clearInterval(pollRef.current);
  }, [open, ticketId, messages.length, ticketStatus]);

  const handleEscalate = async () => {
    if (!ticketId || sending) return;
    setSending(true);
    try {
      await api.post(`/support/ticket/${ticketId}/escalate`);
      setTicketStatus('waiting_human');
      // Перезапросим сообщения — там должно появиться системное «Пользователь нажал…»
      const d = await api.get(`/support/ticket/${ticketId}/messages`);
      if (d?.success) setMessages(d.messages || []);
    } catch (e) {
      // ignore
    } finally { setSending(false); }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const tempMsg = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    scrollBottom();

    try {
      const data = await api.post(`/support/ticket/${ticketId}/message`, { content: text });
      if (data.success && data.ai_reply) {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: data.ai_reply, created_at: new Date().toISOString() }]);
        if (data.escalated) setTicketStatus('escalated');
      }
    } catch {}
    finally { setSending(false); scrollBottom(); }
  };

  const handleSendPhoto = async (file) => {
    if (!file || sending) return;
    setSending(true);

    const tempMsg = { id: Date.now(), role: 'user', content: 'Отправлено изображение', image_url: URL.createObjectURL(file), created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMsg]);
    scrollBottom();

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('content', input.trim() || '');
      setInput('');
      const data = await api.upload(`/support/ticket/${ticketId}/photo`, fd);
      if (data.success && data.ai_reply) {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: data.ai_reply, created_at: new Date().toISOString() }]);
        if (data.escalated) setTicketStatus('escalated');
      }
    } catch {}
    finally { setSending(false); scrollBottom(); }
  };

  const handleNewTicket = async () => {
    if (ticketId && ticketStatus !== 'closed') {
      try { await api.post(`/support/ticket/${ticketId}/close`); } catch {}
    }
    setLoaded(false); setTicketId(null); setMessages([]); setTicketStatus('ai');
    loadTicket();
  };

  const greeting = `Здравствуйте, ${user?.first_name || user?.username || ''}! Какой у Вас вопрос?`;

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen(!open)} style={{
        position: 'fixed', bottom: 24, right: 24, width: 56, height: 56,
        borderRadius: '50%', border: 'none', cursor: 'pointer', zIndex: 9999,
        background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
        boxShadow: '0 4px 16px rgba(123,104,238,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        {open
          ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>
        }
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, width: 370, maxHeight: 520,
          borderRadius: 16, zIndex: 9999, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary, #fff)', border: '1px solid var(--border, #e0e0e0)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
            color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Поддержка</div>
              <div style={{ fontSize: '0.72rem', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 6 }}>
                {ticketStatus === 'closed' ? 'Тикет закрыт'
                  : ticketStatus === 'answered' ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Чат с админом</>
                  : ticketStatus === 'escalated' || ticketStatus === 'waiting_human' ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} /> Ожидание человека</>
                  : 'ИИ-ассистент'}
              </div>
            </div>
            {(ticketStatus === 'closed' || messages.length > 2) && (
              <button onClick={handleNewTicket} title="Новый диалог" style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
                padding: '4px 8px', cursor: 'pointer', color: '#fff', fontSize: '0.72rem',
              }}>Новый</button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 300, maxHeight: 380 }}>
            {/* Greeting */}
            <MsgBubble role="ai" content={greeting} />

            {messages.map(msg => (
              <MsgBubble key={msg.id} role={msg.role} content={msg.content} imageUrl={msg.image_url} />
            ))}

            {sending && (
              <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                <AvatarCircle role="ai" />
                <div style={{
                  background: 'var(--bg-glass, #f5f5f5)', borderRadius: '4px 12px 12px 12px',
                  padding: '8px 16px', fontSize: '0.85rem',
                }}>
                  <span style={{ display: 'inline-flex', gap: 3 }}>
                    <span style={{ animation: 'dotBounce 1.4s infinite 0s' }}>.</span>
                    <span style={{ animation: 'dotBounce 1.4s infinite 0.2s' }}>.</span>
                    <span style={{ animation: 'dotBounce 1.4s infinite 0.4s' }}>.</span>
                  </span>
                </div>
              </div>
            )}

            {/* Кнопка эскалации — показывается пока разговор с ИИ и есть хоть одно сообщение */}
            {ticketId && ticketStatus === 'ai' && messages.length >= 2 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                <button
                  onClick={handleEscalate}
                  disabled={sending}
                  style={{
                    background: 'rgba(251, 191, 36, 0.10)', border: '1px solid rgba(251, 191, 36, 0.40)',
                    color: '#92400e', padding: '6px 12px', borderRadius: 8,
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >👤 Позвать человека</button>
              </div>
            )}

            {/* Подсказка-плашка когда ждём ответа админа */}
            {(ticketStatus === 'waiting_human' || ticketStatus === 'escalated') && (
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(251, 191, 36, 0.10)', border: '1px solid rgba(251, 191, 36, 0.40)',
                fontSize: '0.78rem', color: '#92400e', textAlign: 'center', lineHeight: 1.4,
              }}>
                ⏳ Ожидаем ответа специалиста. Обычно отвечаем в течение нескольких часов.
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          {ticketStatus !== 'closed' && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border, #e0e0e0)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => fileRef.current?.click()} title="Прикрепить фото" style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, opacity: 0.6,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleSendPhoto(f); e.target.value = ''; }} />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Напишите сообщение..."
                style={{
                  flex: 1, border: '1px solid var(--border, #ddd)', borderRadius: 8,
                  padding: '8px 12px', fontSize: '0.85rem', outline: 'none',
                  background: 'var(--bg-primary, #fff)', color: 'inherit',
                }}
              />
              <button onClick={handleSend} disabled={sending || !input.trim()} style={{
                background: '#7B68EE', color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                opacity: sending || !input.trim() ? 0.5 : 1, flexShrink: 0,
              }}>&#10148;</button>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes dotBounce { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }`}</style>
    </>
  );
}

function AvatarCircle({ role }) {
  const bg = role === 'admin' ? '#10B981' : 'linear-gradient(135deg, #7B68EE, #4F46E5)';
  const label = role === 'admin' ? 'A' : role === 'ai' ? '' : '';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {role === 'admin'
        ? <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>A</span>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
      }
    </div>
  );
}

function MsgBubble({ role, content, imageUrl }) {
  const isUser = role === 'user';
  return (
    <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <AvatarCircle role={role} />}
      <div style={{ maxWidth: '80%' }}>
        {imageUrl && (
          <img src={imageUrl} alt="" style={{
            maxWidth: '100%', maxHeight: 180, borderRadius: 8, marginBottom: content ? 4 : 0,
            display: 'block', cursor: 'pointer',
          }} onClick={() => window.open(imageUrl, '_blank')} />
        )}
        {content && (
          <div style={{
            background: isUser ? '#7B68EE' : 'var(--bg-glass, #f5f5f5)',
            color: isUser ? '#fff' : 'inherit',
            borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
            padding: '8px 12px', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>{content}</div>
        )}
      </div>
    </div>
  );
}
