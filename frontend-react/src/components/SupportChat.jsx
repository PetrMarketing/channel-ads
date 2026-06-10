/**
 * Виджет поддержки в правом нижнем углу.
 * Логика:
 *   - При открытии запрашиваем активный тикет
 *   - Есть открытый тикет (не closed) → mode='chat' — показываем переписку
 *     с поллингом 5с, юзер может писать новые сообщения. Древо/новый тикет
 *     заблокированы пока поддержка не закроет тикет
 *   - Нет тикета → mode='tree' — древо вопросов. «Позвать оператора» создаёт
 *     тикет → переключаемся в mode='chat'
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(null);
  const [path, setPath] = useState(['root']);
  const [mode, setMode] = useState('tree');     // tree | operator | chat
  const [operatorTopicId, setOperatorTopicId] = useState(null);
  const [ticket, setTicket] = useState(null);   // {ticket_id, status, escalated, messages}
  const pollRef = useRef(null);

  // Загружаем древо при первом открытии
  useEffect(() => {
    if (open && !topics) {
      api.get('/support/topics').then(d => {
        if (d?.success) setTopics(d.topics);
      }).catch(() => {});
    }
  }, [open, topics]);

  // При открытии — проверяем активный тикет
  const loadTicket = useCallback(async () => {
    try {
      const d = await api.get('/support/ticket');
      if (d?.success && d.ticket_id && d.status !== 'closed') {
        setTicket(d);
        setMode('chat');
      } else {
        setTicket(null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) loadTicket();
  }, [open, loadTicket]);

  // Polling сообщений в chat-режиме
  useEffect(() => {
    if (mode !== 'chat' || !ticket?.ticket_id) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const d = await api.get(`/support/ticket/${ticket.ticket_id}/messages`);
        if (d?.success) {
          setTicket(prev => prev ? { ...prev, messages: d.messages || [], status: d.status } : prev);
          // Если поддержка закрыла тикет — сбрасываем chat и даём древо
          if (d.status === 'closed') {
            setTicket(null);
            setMode('tree');
            setPath(['root']);
          }
        }
      } catch {}
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mode, ticket?.ticket_id]);

  if (!user) return null;

  const currentId = path[path.length - 1];
  const node = topics?.[currentId];

  const goTo = (id) => { setPath(p => [...p, id]); setMode('tree'); };
  const goBack = () => { setPath(p => p.length > 1 ? p.slice(0, -1) : p); setMode('tree'); };
  const goRoot = () => { setPath(['root']); setMode('tree'); };
  const callOperator = () => {
    setOperatorTopicId(currentId !== 'root' ? currentId : null);
    setMode('operator');
  };
  const onOperatorRequestSent = (newTicketId) => {
    // После создания тикета — сразу в chat-режим
    setTicket({ ticket_id: newTicketId, status: 'waiting_human', messages: [] });
    setMode('chat');
    loadTicket();
  };

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

      {open && (
        <div style={panelStyle}>
          <Header
            mode={mode}
            ticket={ticket}
            title={mode === 'chat' ? `Диалог с поддержкой` : topicTitle(node)}
            onNewChat={mode === 'chat' ? null : goRoot}
          />

          {mode === 'chat' && ticket ? (
            <ChatView ticket={ticket} onUpdate={setTicket} />
          ) : !topics ? (
            <Body><div style={{ color: '#888', textAlign: 'center', padding: 30 }}>Загрузка…</div></Body>
          ) : mode === 'operator' ? (
            <OperatorForm
              topicId={operatorTopicId}
              topicTitle={operatorTopicId ? topics[operatorTopicId]?.title : null}
              onCancel={() => setMode('tree')}
              onDone={onOperatorRequestSent}
            />
          ) : (
            <Body>
              <TreeView
                node={node}
                topics={topics}
                pathLen={path.length}
                onPick={goTo}
                onBack={goBack}
                onRoot={goRoot}
                onCallOperator={callOperator}
              />
            </Body>
          )}
        </div>
      )}
    </>
  );
}

function Header({ mode, ticket, onNewChat, title }) {
  const statusLabel = ticket && mode === 'chat'
    ? ({ ai: 'ИИ', waiting_human: 'Ждём оператора', escalated: 'Передан оператору', answered: 'Оператор ответил', closed: 'Закрыт' }[ticket.status] || ticket.status)
    : null;
  return (
    <div style={{
      padding: '14px 16px', background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
      color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Поддержка</div>
        <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>
          {title || 'MAX Маркетинг'}
          {statusLabel && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.18)' }}>{statusLabel}</span>}
        </div>
      </div>
      {onNewChat && (
        <button onClick={onNewChat} title="В начало" style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
          padding: '4px 8px', cursor: 'pointer', color: '#fff', fontSize: '0.72rem',
        }}>В меню</button>
      )}
    </div>
  );
}

function Body({ children }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 320, maxHeight: 420 }}>
      {children}
    </div>
  );
}

function TreeView({ node, topics, pathLen, onPick, onBack, onRoot, onCallOperator }) {
  if (!node) return <div style={{ color: '#888' }}>Раздел не найден</div>;
  const hasChildren = (node.children || []).length > 0;
  const hasAnswer = !!node.answer;

  return (
    <>
      {pathLen > 1 && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={onBack} style={btnGhostStyle}>← Назад</button>
          <button onClick={onRoot} style={btnGhostStyle}>↺ В меню</button>
        </div>
      )}
      {node.intro && (
        <div style={{
          background: 'var(--bg-glass, #f5f5f5)',
          padding: '10px 14px', borderRadius: '4px 12px 12px 12px',
          fontSize: 13, lineHeight: 1.5, marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>{node.intro}</div>
      )}
      {hasAnswer && (
        <div style={{
          background: 'var(--bg-glass, #f5f5f5)',
          padding: '12px 14px', borderRadius: '4px 12px 12px 12px',
          fontSize: 13, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>{linkifyText(node.answer)}</div>
      )}
      {hasChildren && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {node.children.map(c => (
            <button key={c.id} onClick={() => onPick(c.id)} style={btnTopicStyle}>
              <span style={{ flex: 1 }}>{c.title}</span>
              <span style={{ opacity: 0.4, fontSize: 14 }}>›</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border, #eee)' }}>
        <button onClick={onCallOperator} style={btnOperatorStyle}>
          👨‍💻 Позвать оператора
        </button>
      </div>
    </>
  );
}

// Чат: переписка юзера с поддержкой
function ChatView({ ticket, onUpdate }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [ticket.messages?.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api.post(`/support/ticket/${ticket.ticket_id}/message`, { content: t });
      setText('');
      // Сразу подгружаем актуальные сообщения
      const d = await api.get(`/support/ticket/${ticket.ticket_id}/messages`);
      if (d?.success) onUpdate({ ...ticket, messages: d.messages || [], status: d.status });
    } catch (e) { alert(e?.message || 'Ошибка'); }
    finally { setSending(false); }
  };

  const sendPhoto = async (file) => {
    if (!file || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('content', text.trim());
      setText('');
      await api.upload(`/support/ticket/${ticket.ticket_id}/photo`, fd);
      const d = await api.get(`/support/ticket/${ticket.ticket_id}/messages`);
      if (d?.success) onUpdate({ ...ticket, messages: d.messages || [], status: d.status });
    } catch (e) { alert(e?.message || 'Ошибка'); }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const messages = ticket.messages || [];

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 300, maxHeight: 380, background: 'var(--bg-glass, #fafbfc)' }}>
        {messages.length === 0 ? (
          <div style={{ color: '#888', textAlign: 'center', fontSize: 12, padding: 20 }}>
            Ваше сообщение отправлено. Оператор скоро ответит — обычно в течение нескольких часов.
          </div>
        ) : (
          messages.map((m) => <Msg key={m.id} m={m} />)
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--border, #eee)', padding: 10, background: 'var(--bg-primary, #fff)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => fileRef.current?.click()} title="Прикрепить файл"
            style={{ background: 'transparent', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '0 10px', cursor: 'pointer', fontSize: 16, color: 'var(--text-secondary, #6b7280)' }}>📎</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => sendPhoto(e.target.files?.[0])} />
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Сообщение оператору…"
            rows={2}
            style={{ flex: 1, padding: 8, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', background: 'var(--bg-primary, #fff)', color: 'inherit' }}
          />
          <button onClick={send} disabled={!text.trim() || sending}
            style={{ background: text.trim() ? '#7B68EE' : '#e5e7eb', color: text.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, padding: '0 14px', cursor: text.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
            ➤
          </button>
        </div>
      </div>
    </>
  );
}

function Msg({ m }) {
  const isUser = m.role === 'user';
  const isAdmin = m.role === 'admin';
  return (
    <div style={{ marginBottom: 10, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '78%',
        padding: '8px 12px', borderRadius: 12,
        background: isUser ? '#7B68EE' : (isAdmin ? '#fff' : 'rgba(245,158,11,0.08)'),
        color: isUser ? '#fff' : 'inherit',
        border: isAdmin ? '1px solid var(--border, #e5e7eb)' : 'none',
        fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
      }}>
        {isAdmin && (
          <div style={{ fontSize: 10, color: '#7B68EE', fontWeight: 700, marginBottom: 2 }}>👨‍💻 Оператор</div>
        )}
        {m.image_url && (
          <img src={m.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4 }} />
        )}
        {m.content}
      </div>
    </div>
  );
}

function OperatorForm({ topicId, topicTitle, onCancel, onDone }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.post('/support/operator-request', {
        description: text.trim(),
        topic_id: topicId,
      });
      if (!r?.success) throw new Error('fail');
      const ticketId = r.ticket_id;
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('content', '');
        try { await api.upload(`/support/ticket/${ticketId}/photo`, fd); } catch {}
      }
      onDone(ticketId);
    } catch (e) {
      alert('Не удалось отправить, попробуйте ещё раз');
    } finally { setSending(false); }
  };

  return (
    <Body>
      <button onClick={onCancel} style={{ ...btnGhostStyle, marginBottom: 10 }}>← Отмена</button>
      <div style={{
        background: 'rgba(67, 97, 238, 0.08)', border: '1px solid rgba(67, 97, 238, 0.20)',
        padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.5,
      }}>
        Опишите подробно ваш вопрос и приложите скриншоты (снимок экрана) с вашей проблемой.
        Оператор ответит в этом же чате.
        {topicTitle && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
            📂 Тема: <b>{topicTitle}</b>
          </div>
        )}
      </div>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        placeholder="Опишите ситуацию: что вы делали, что ожидали, что произошло вместо этого…"
        rows={5}
        style={{ width: '100%', padding: 10, border: '1px solid var(--border, #ddd)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-primary, #fff)', color: 'inherit', marginBottom: 10 }}
      />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--bg-glass, #f5f5f5)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              📎 {f.name.length > 22 ? f.name.slice(0, 19) + '…' : f.name}
              <button onClick={() => setFiles(p => p.filter((_, x) => x !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()} disabled={sending} style={{ ...btnGhostStyle, padding: '10px 14px', fontSize: 13 }}>📎 Прикрепить</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { const fs = Array.from(e.target.files || []); setFiles(p => [...p, ...fs].slice(0, 5)); e.target.value = ''; }} />
        <button onClick={submit} disabled={sending || !text.trim()} style={{ ...btnTopicStyle, background: '#7B68EE', color: '#fff', opacity: (sending || !text.trim()) ? 0.5 : 1, justifyContent: 'center' }}>
          {sending ? 'Отправляем…' : 'Отправить оператору →'}
        </button>
      </div>
    </Body>
  );
}

function topicTitle(node) { return node?.title || null; }

function linkifyText(text) {
  if (!text) return null;
  const re = /\b(https?:\/\/[^\s)]+|max\.pkmarketing\.ru\/[^\s)]*|pkmarketing\.ru\/?[^\s)]*)/g;
  const parts = [];
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t${i}`}>{text.slice(last, m.index)}</span>);
    const url = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
    parts.push(<a key={`l${i}`} href={url} target="_blank" rel="noreferrer" style={{ color: '#4361ee' }}>{m[0]}</a>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(<span key={`t${i}`}>{text.slice(last)}</span>);
  return parts;
}

const panelStyle = {
  position: 'fixed', bottom: 90, right: 24, width: 380, maxHeight: 560,
  borderRadius: 16, zIndex: 9999, display: 'flex', flexDirection: 'column',
  background: 'var(--bg-primary, #fff)', border: '1px solid var(--border, #e0e0e0)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
  color: 'var(--text-primary, #1a1a2e)',
};
const btnTopicStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  width: '100%', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
  background: 'var(--bg-glass, #f5f5f5)', color: 'inherit',
  border: '1px solid var(--border, #e5e7eb)',
  fontSize: 13, lineHeight: 1.4, textAlign: 'left', fontFamily: 'inherit',
};
const btnOperatorStyle = {
  display: 'block', width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
  background: 'linear-gradient(135deg, #7B68EE, #4F46E5)', color: '#fff', border: 'none',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};
const btnGhostStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
  borderRadius: 6, background: 'transparent', color: 'var(--text-secondary, #6b7280)',
  border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit',
};
