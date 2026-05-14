/**
 * Виджет поддержки в правом нижнем углу.
 * С 2026-05-14 — древо вопросов (без ИИ): пользователь жмёт кнопки → готовый
 * ответ или подменю. Кнопка «Позвать оператора» открывает форму с описанием
 * и скриншотами — создаётся обычный тикет в админке.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(null);     // dict id → node
  const [path, setPath] = useState(['root']);     // навигационный стек
  const [mode, setMode] = useState('tree');       // tree | operator | thanks
  const [operatorTopicId, setOperatorTopicId] = useState(null);

  // Загружаем древо при первом открытии
  useEffect(() => {
    if (open && !topics) {
      api.get('/support/topics').then(d => {
        if (d?.success) setTopics(d.topics);
      }).catch(() => {});
    }
  }, [open, topics]);

  if (!user) return null;

  const currentId = path[path.length - 1];
  const node = topics?.[currentId];

  const goTo = (id) => {
    setPath(p => [...p, id]);
    setMode('tree');
  };
  const goBack = () => {
    setPath(p => p.length > 1 ? p.slice(0, -1) : p);
    setMode('tree');
  };
  const goRoot = () => {
    setPath(['root']);
    setMode('tree');
  };
  const callOperator = () => {
    setOperatorTopicId(currentId !== 'root' ? currentId : null);
    setMode('operator');
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
          <Header onNewChat={goRoot} title={topicTitle(node)} />

          {!topics ? (
            <Body><div style={{ color: '#888', textAlign: 'center', padding: 30 }}>Загрузка…</div></Body>
          ) : mode === 'operator' ? (
            <OperatorForm
              topicId={operatorTopicId}
              topicTitle={operatorTopicId ? topics[operatorTopicId]?.title : null}
              onCancel={() => setMode('tree')}
              onDone={() => setMode('thanks')}
            />
          ) : mode === 'thanks' ? (
            <Body>
              <div style={{
                background: 'rgba(16, 185, 129, 0.10)', border: '1px solid rgba(16, 185, 129, 0.40)',
                color: '#065f46', padding: 16, borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              }}>
                ✅ Готово, заявка отправлена!<br/>
                Оператор свяжется с вами в этом же чате — обычно отвечаем в течение нескольких часов.
              </div>
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button onClick={goRoot} style={btnGhostStyle}>← В главное меню</button>
              </div>
            </Body>
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

// ────────────────────────────────────────────────────────────────────
// Подкомпоненты
// ────────────────────────────────────────────────────────────────────

function Header({ onNewChat, title }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
      color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Поддержка</div>
        <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{title || 'MAX Маркетинг'}</div>
      </div>
      <button onClick={onNewChat} title="В начало" style={{
        background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
        padding: '4px 8px', cursor: 'pointer', color: '#fff', fontSize: '0.72rem',
      }}>В меню</button>
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
      {/* Хлебные крошки + Назад */}
      {pathLen > 1 && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={onBack} style={btnGhostStyle}>← Назад</button>
          <button onClick={onRoot} style={btnGhostStyle}>↺ В меню</button>
        </div>
      )}

      {/* Intro / приветствие узла */}
      {node.intro && (
        <div style={{
          background: 'var(--bg-glass, #f5f5f5)',
          padding: '10px 14px', borderRadius: '4px 12px 12px 12px',
          fontSize: 13, lineHeight: 1.5, marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>{node.intro}</div>
      )}

      {/* Ответ (если есть) */}
      {hasAnswer && (
        <div style={{
          background: 'var(--bg-glass, #f5f5f5)',
          padding: '12px 14px', borderRadius: '4px 12px 12px 12px',
          fontSize: 13, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>{linkifyText(node.answer)}</div>
      )}

      {/* Подкнопки */}
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

      {/* «Позвать оператора» — всегда внизу */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border, #eee)' }}>
        <button onClick={onCallOperator} style={btnOperatorStyle}>
          👨‍💻 Позвать оператора
        </button>
        {hasAnswer && (
          <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 6 }}>
            Не нашли ответ или нужна персональная помощь?
          </div>
        )}
      </div>
    </>
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
      // Отдельно догружаем файлы как фото-сообщения к этому же тикету
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('content', '');
        try { await api.upload(`/support/ticket/${ticketId}/photo`, fd); } catch {}
      }
      onDone();
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
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Опишите ситуацию: что вы делали, что ожидали увидеть, что произошло вместо этого…"
        rows={5}
        style={{
          width: '100%', padding: 10, border: '1px solid var(--border, #ddd)', borderRadius: 8,
          fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
          background: 'var(--bg-primary, #fff)', color: 'inherit', marginBottom: 10,
        }}
      />

      {/* Превью прикреплённых */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              padding: '4px 8px', borderRadius: 6, background: 'var(--bg-glass, #f5f5f5)',
              fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              📎 {f.name.length > 22 ? f.name.slice(0, 19) + '…' : f.name}
              <button onClick={() => setFiles(p => p.filter((_, x) => x !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()} disabled={sending} style={{
          ...btnGhostStyle, padding: '10px 14px', fontSize: 13,
        }}>📎 Прикрепить файл</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => {
            const fs = Array.from(e.target.files || []);
            setFiles(p => [...p, ...fs].slice(0, 5));
            e.target.value = '';
          }} />
        <button onClick={submit} disabled={sending || !text.trim()} style={{
          ...btnTopicStyle, background: '#7B68EE', color: '#fff',
          opacity: (sending || !text.trim()) ? 0.5 : 1, justifyContent: 'center',
        }}>{sending ? 'Отправляем…' : 'Отправить оператору →'}</button>
      </div>
    </Body>
  );
}

// ────────────────────────────────────────────────────────────────────
// Утилиты
// ────────────────────────────────────────────────────────────────────

function topicTitle(node) {
  if (!node) return null;
  if (node.title) return node.title;
  return null;
}

function linkifyText(text) {
  if (!text) return null;
  // Превращаем URL в кликабельные ссылки. Текст остаётся в pre-wrap.
  const re = /\b(https?:\/\/[^\s)]+|max\.pkmarketing\.ru\/[^\s)]*|pkmarketing\.ru\/?[^\s)]*)/g;
  const parts = [];
  let last = 0, m;
  let i = 0;
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
  transition: 'background 0.15s, border-color 0.15s',
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
