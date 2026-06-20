import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

const ACCENT = '#7b68ee';
const ACCENT2 = '#4361ee';
const DARK = '#1a1a2e';
const BORDER = '#e5e7eb';
const MUTED = '#6b7280';
const REC_RED = '#dc2626';

// Web Speech API — поддержка в Chrome/Edge/Yandex/Safari iOS
const SpeechRec = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

/** Глобальный виджет ИИ-Помощника в правом нижнем углу.
 *  3 экрана: ввод запроса → подтверждение плана → результат. */
export default function AiAssistantWidget() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('input'); // input | review | executing | done
  const [query, setQuery] = useState('');
  const [task, setTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const pollRef = useRef(null);
  const recRef = useRef(null);

  const reset = () => {
    setStage('input'); setQuery(''); setTask(null); setSubmitting(false); setBusy(false);
    stopListening();
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const stopListening = () => {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    setListening(false);
  };

  const startListening = () => {
    if (!SpeechRec) {
      showToast('Голосовой ввод не поддерживается этим браузером', 'error');
      return;
    }
    if (listening) { stopListening(); return; }
    try {
      const rec = new SpeechRec();
      rec.lang = 'ru-RU';
      rec.continuous = true;       // не останавливаем после первой паузы
      rec.interimResults = true;   // показываем по ходу диктовки
      let finalText = '';
      rec.onstart = () => setListening(true);
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        setQuery((finalText + interim).trim());
      };
      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'permission-denied') {
          showToast('Разрешите доступ к микрофону', 'error');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          showToast('Ошибка распознавания: ' + ev.error, 'error');
        }
        stopListening();
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
    } catch (e) {
      showToast('Не удалось включить микрофон', 'error');
      setListening(false);
    }
  };

  const submit = async () => {
    if (!query.trim()) return;
    setSubmitting(true);
    try {
      const d = await api.post('/ai-assistant/parse', { query: query.trim() });
      if (d?.success) {
        setTask(d);
        setStage('review');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка распознавания', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (!task?.task_id) return;
    setBusy(true);
    try {
      const d = await api.post(`/ai-assistant/${task.task_id}/confirm`);
      if (d?.success) {
        setStage('executing');
        pollRef.current = setInterval(async () => {
          try {
            const t = await api.get(`/ai-assistant/${task.task_id}`);
            if (t?.success && t.task) {
              const s = t.task.status;
              if (s === 'done' || s === 'failed' || s === 'cancelled') {
                setTask(prev => ({ ...prev, finalTask: t.task }));
                setStage('done');
                clearInterval(pollRef.current); pollRef.current = null;
              }
            }
          } catch {}
        }, 1500);
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
      setBusy(false);
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // На странице /ai-assistant виджет не показываем — там полная версия
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/ai-assistant')) {
    return null;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="ИИ-Помощник"
        style={{
          position: 'fixed', right: 20, bottom: 90, zIndex: 9000,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          color: '#fff', boxShadow: '0 8px 24px rgba(123,104,238,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, transition: 'transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
      >🤖</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 90, zIndex: 9000,
      width: 'min(420px, calc(100vw - 40px))', maxHeight: 'min(640px, calc(100vh - 40px))',
      background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
      boxShadow: '0 20px 60px rgba(26,26,46,0.18)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px',
        background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
        color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🤖 ИИ-Помощник</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>MAX Маркетинг</div>
        </div>
        <button onClick={() => { reset(); setOpen(false); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ padding: 18, flex: 1, overflowY: 'auto' }}>
        {stage === 'input' && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.45 }}>
              Опишите задачу — что нужно сделать. Можно текстом или голосом 🎤.
            </p>
            <div style={{ position: 'relative' }}>
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={listening
                  ? 'Слушаю… говорите 🎤'
                  : 'Например: «Сделай лид-магнит и пост на 21 июня на тему "Кому на Руси жить хорошо" с картинкой»'}
                style={{
                  width: '100%', minHeight: 100, padding: '10px 50px 10px 10px',
                  border: `1px solid ${listening ? REC_RED : BORDER}`, borderRadius: 10, fontSize: 14,
                  fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }} />
              {SpeechRec && (
                <button onClick={startListening}
                  title={listening ? 'Остановить запись' : 'Голосовой ввод'}
                  style={{
                    position: 'absolute', right: 8, top: 8,
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: listening ? REC_RED : '#f3f4f6',
                    color: listening ? '#fff' : '#374151',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                    animation: listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
                  }}>
                  {listening ? '⏹' : '🎤'}
                </button>
              )}
              <style>{`@keyframes micPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); } 50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); } }`}</style>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: MUTED }}>
              1 ИИ-токен за распознавание + стоимость каждого действия.
              {!SpeechRec && ' Голосовой ввод не поддерживается этим браузером.'}
            </div>
            <button onClick={submit} disabled={!query.trim() || submitting || listening}
              style={{
                marginTop: 12, width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                opacity: (!query.trim() || submitting || listening) ? 0.5 : 1,
              }}>
              {submitting ? 'Думаю…' : (listening ? 'Закончите запись…' : 'Распознать задачу →')}
            </button>
          </>
        )}

        {stage === 'review' && task && (
          <>
            <div style={{ background: '#f8f9fc', padding: 12, borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Запрос:</div>
              <div style={{ fontSize: 13, color: DARK }}>{query}</div>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, color: DARK }}>План:</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
              {task.summary}
            </p>
            {(task.steps || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {task.steps.map((s, i) => (
                  <div key={i} style={{
                    padding: '8px 10px', marginBottom: 6,
                    background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
                    fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ color: DARK, fontWeight: 600 }}>{i + 1}. {labelTool(s.tool)}</span>
                    {s.est_tokens > 0 && (
                      <span style={{ color: ACCENT, fontWeight: 700 }}>{s.est_tokens} ИИт</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{
              padding: 10, background: 'rgba(123,104,238,0.08)', borderRadius: 8,
              fontSize: 13, color: DARK, marginBottom: 12,
            }}>
              <b>Списано:</b> 1 ИИт (распознавание)<br/>
              <b>Будет списано:</b> {task.total_estimated_tokens} ИИт за выполнение
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset}
                style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                Отмена
              </button>
              <button onClick={confirm} disabled={busy}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  color: '#fff', fontWeight: 700, cursor: 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}>
                {busy ? '…' : 'Выполнить'}
              </button>
            </div>
          </>
        )}

        {stage === 'executing' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{
              width: 48, height: 48, margin: '0 auto 16px',
              border: `4px solid ${BORDER}`, borderTopColor: ACCENT,
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ fontSize: 14, color: DARK, fontWeight: 600 }}>Выполняю задачу…</p>
            <p style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Когда закончу, придёт уведомление в бот.</p>
          </div>
        )}

        {stage === 'done' && task?.finalTask && (
          <>
            <div style={{
              padding: 12, background: task.finalTask.status === 'done' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
              borderRadius: 10, marginBottom: 12,
            }}>
              <div style={{ fontWeight: 700, color: task.finalTask.status === 'done' ? '#10b981' : '#dc2626' }}>
                {task.finalTask.status === 'done' ? '✅ Готово' : '⚠️ Завершено с ошибкой'}
              </div>
            </div>
            {(task.finalTask.steps_results || []).map((r, i) => (
              <div key={i} style={{ padding: 10, marginBottom: 6, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{labelTool(r.tool)}</div>
                <div style={{ fontSize: 12, color: r.ok ? '#10b981' : '#dc2626', marginTop: 2 }}>
                  {r.ok ? (r.message || 'Готово') : (r.error || 'Ошибка')}
                </div>
                {r.link && (
                  <a href={r.link} target="_blank" rel="noopener"
                     style={{ fontSize: 12, color: ACCENT, marginTop: 4, display: 'inline-block' }}>
                    Открыть раздел →
                  </a>
                )}
              </div>
            ))}
            <button onClick={reset}
              style={{
                marginTop: 12, width: '100%', padding: '10px 16px', borderRadius: 10,
                border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', fontWeight: 600,
              }}>
              Новый запрос
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function labelTool(name) {
  return {
    create_post: '📝 Создать пост',
    create_lead_magnet: '🎁 Создать лид-магнит',
    create_link: '🔗 Создать трекинг-ссылку',
    start_ai_content: '🧠 ИИ-Контент сессия',
    start_broadcast: '📢 Запустить рассылку',
  }[name] || name;
}
