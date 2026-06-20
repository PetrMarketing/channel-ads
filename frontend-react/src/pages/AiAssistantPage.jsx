import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

const ACCENT = '#7b68ee';
const ACCENT2 = '#4361ee';
const DARK = '#1a1a2e';
const BORDER = '#e5e7eb';
const MUTED = '#6b7280';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DANGER = '#dc2626';
const SOFT_BG = '#f8f9fc';
const REC_RED = '#dc2626';

const SpeechRec = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const TOOL_LABELS = {
  create_post: '📝 Создать пост',
  create_lead_magnet: '🎁 Лид-магнит',
  create_link: '🔗 Трекинг-ссылка',
  start_ai_content: '🧠 ИИ-Контент пакет',
  start_broadcast: '📢 Рассылка',
};

function fmtDt(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return iso; }
}

export default function AiAssistantPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState('input'); // input | pending | done
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Input state
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get('/ai-assistant/tasks?limit=50');
      if (d?.success) setTasks(d.tasks || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Polling: пока есть executing — обновляем каждые 2 сек
  useEffect(() => {
    const hasActive = tasks.some(t => t.status === 'executing');
    if (!hasActive) return;
    const t = setInterval(loadTasks, 2000);
    return () => clearInterval(t);
  }, [tasks, loadTasks]);

  const pending = tasks.filter(t => t.status === 'parsed' || t.status === 'executing');
  const done = tasks.filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled');

  const startListening = () => {
    if (!SpeechRec) { showToast('Голосовой ввод не поддерживается этим браузером', 'error'); return; }
    if (listening) { try { recRef.current?.stop(); } catch {} setListening(false); return; }
    try {
      const rec = new SpeechRec();
      rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
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
        if (ev.error === 'not-allowed') showToast('Разрешите доступ к микрофону', 'error');
        else if (ev.error !== 'no-speech' && ev.error !== 'aborted') showToast('Ошибка: ' + ev.error, 'error');
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
    } catch { setListening(false); showToast('Не удалось включить микрофон', 'error'); }
  };

  const submit = async () => {
    if (!query.trim()) return;
    setSubmitting(true);
    try {
      const d = await api.post('/ai-assistant/parse', { query: query.trim() });
      if (d?.success) {
        setQuery('');
        setTab('pending');
        loadTasks();
        showToast('Задача распознана — подтверди для выполнения');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally { setSubmitting(false); }
  };

  const confirm = async (taskId) => {
    try {
      await api.post(`/ai-assistant/${taskId}/confirm`);
      loadTasks();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 920, margin: '0 auto', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.4)} 50%{box-shadow:0 0 0 8px rgba(220,38,38,0)} }
                @keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: DARK }}>🤖 ИИ-Помощник</h1>
        <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 14 }}>
          Опиши задачу — Помощник разберёт и предложит план. Можно текстом или голосом 🎤.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: `1px solid ${BORDER}` }}>
        {[
          { key: 'input', label: '✏ Новая задача', count: null },
          { key: 'pending', label: '⏳ Ожидание', count: pending.length },
          { key: 'done', label: '✅ Выполнено', count: done.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              borderBottom: tab === t.key ? `3px solid ${ACCENT}` : '3px solid transparent',
              color: tab === t.key ? ACCENT : DARK, fontWeight: tab === t.key ? 700 : 500,
              fontSize: 14, cursor: 'pointer', marginBottom: -1,
            }}>
            {t.label}{t.count != null && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'input' && (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
          <div style={{ position: 'relative' }}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={listening
                ? 'Слушаю… говорите 🎤'
                : 'Например: «Сделай лид-магнит и пост на 22 июня в 10 утра на тему "Лето в Орле" с картинкой»'}
              style={{
                width: '100%', minHeight: 140, padding: '14px 56px 14px 14px',
                border: `1px solid ${listening ? REC_RED : BORDER}`, borderRadius: 12, fontSize: 15,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                transition: 'border-color .15s',
              }} />
            {SpeechRec && (
              <button onClick={startListening}
                title={listening ? 'Остановить' : 'Голос'}
                style={{
                  position: 'absolute', right: 12, top: 12,
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: listening ? REC_RED : '#f3f4f6',
                  color: listening ? '#fff' : '#374151', cursor: 'pointer', fontSize: 18,
                  animation: listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
                }}>
                {listening ? '⏹' : '🎤'}
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            <b>Списание токенов:</b> 1 ИИт за распознавание запроса (parse) + стоимость каждого
            действия. Точная сумма за выполнение покажется на шаге подтверждения, и списывается
            только если ты нажмёшь «Выполнить».
            <ul style={{ margin: '6px 0 0 18px', paddingLeft: 0 }}>
              <li>Пост с готовым текстом — 1 ИИт</li>
              <li>Генерация поста на тему — 10 ИИт</li>
              <li>+ картинка — ещё 20 ИИт (итого 30)</li>
              <li>Лид-магнит — 5 ИИт</li>
              <li>Ссылка / рассылка — 0 ИИт</li>
            </ul>
          </div>
          <button onClick={submit} disabled={!query.trim() || submitting || listening}
            style={{
              marginTop: 16, width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              opacity: (!query.trim() || submitting || listening) ? 0.5 : 1,
            }}>
            {submitting ? 'Думаю…' : (listening ? 'Закончите запись' : 'Распознать задачу →')}
          </button>
        </div>
      )}

      {tab === 'pending' && (
        <div>
          {loading ? <Spinner /> : pending.length === 0 ? (
            <Empty text="Нет задач в ожидании. Создай новую на вкладке «Новая задача»." />
          ) : pending.map(t => <PendingCard key={t.id} task={t} onConfirm={() => confirm(t.id)} />)}
        </div>
      )}

      {tab === 'done' && (
        <div>
          {loading ? <Spinner /> : done.length === 0 ? (
            <Empty text="Пока ничего не выполнено." />
          ) : done.map(t => <DoneCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ width: 32, height: 32, margin: '0 auto', border: `4px solid ${BORDER}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 40, textAlign: 'center', color: MUTED }}>
      {text}
    </div>
  );
}

function PendingCard({ task, onConfirm }) {
  const plan = typeof task.plan_json === 'string' ? JSON.parse(task.plan_json) : task.plan_json;
  const steps = plan?.steps || [];
  const totalEst = steps.reduce((s, x) => s + (x.est_tokens || 0), 0);
  const isExecuting = task.status === 'executing';
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{fmtDt(task.created_at)}</div>
      <div style={{ fontSize: 15, color: DARK, marginBottom: 10 }}>{task.raw_query}</div>
      <div style={{ background: SOFT_BG, padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{task.confirm_summary}</div>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: DARK }}>{i + 1}. {TOOL_LABELS[s.tool] || s.tool}</span>
            {s.est_tokens > 0 && <span style={{ color: ACCENT, fontWeight: 700 }}>{s.est_tokens} ИИт</span>}
          </div>
        ))}
      </div>
      {isExecuting ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: WARNING, fontWeight: 600 }}>
          <div style={{ width: 16, height: 16, border: `3px solid ${BORDER}`, borderTopColor: WARNING, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Выполняю…
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={onConfirm}
            style={{ padding: '10px 18px', border: 'none', borderRadius: 10,
                     background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                     color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            Выполнить ({totalEst} ИИт)
          </button>
          <span style={{ fontSize: 12, color: MUTED }}>1 ИИт уже списан за распознавание</span>
        </div>
      )}
    </div>
  );
}

function DoneCard({ task }) {
  const results = typeof task.steps_results === 'string' ? JSON.parse(task.steps_results) : (task.steps_results || []);
  const failed = task.status === 'failed';
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
            {fmtDt(task.finished_at || task.created_at)}
          </div>
          <div style={{ fontSize: 15, color: DARK }}>{task.raw_query}</div>
        </div>
        <span style={{
          padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: failed ? 'rgba(220,38,38,0.10)' : 'rgba(16,185,129,0.10)',
          color: failed ? DANGER : SUCCESS,
        }}>
          {failed ? 'Ошибка' : 'Готово'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Списано: <b style={{ color: ACCENT }}>{task.tokens_used} ИИт</b>
      </div>
      {results.map((r, i) => (
        <div key={i} style={{
          padding: '8px 12px', marginBottom: 6,
          background: r.ok ? 'rgba(16,185,129,0.05)' : 'rgba(220,38,38,0.05)',
          borderRadius: 8, fontSize: 13,
        }}>
          <div style={{ fontWeight: 600 }}>{TOOL_LABELS[r.tool] || r.tool}</div>
          <div style={{ color: r.ok ? '#065f46' : DANGER, marginTop: 2 }}>
            {r.ok ? (r.message || 'Готово') : (r.error || 'Ошибка')}
          </div>
          {r.link && (
            <a href={r.link} style={{ color: ACCENT, fontSize: 12 }}>Открыть раздел →</a>
          )}
        </div>
      ))}
    </div>
  );
}
