import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import RichTextEditor from '../../components/RichTextEditor';
import AttachmentPicker from '../../components/AttachmentPicker';
import ButtonBuilder from '../../components/ButtonBuilder';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const PURPLE = '#a855f7';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.92rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
  letterSpacing: '-0.005em',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.88rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.9rem', color: DARK,
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.82rem', fontWeight: 600,
  color: DARK, marginBottom: 8, letterSpacing: '-0.005em',
};

const hintStyle = { fontSize: '0.76rem', color: MUTED, marginTop: 6, lineHeight: 1.45 };

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '4px 0 0', fontSize: '0.82rem', color: MUTED,
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

function calcCost(n) {
  const c = Math.max(15, Math.min(60, Number(n) || 30));
  return Math.round(150 + ((c - 15) * (300 - 150)) / (60 - 15));
}

function fmtRu(d) {
  if (!d) return '';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const GOAL_META = {
  sales: { label: 'Продажи', bg: 'rgba(67,97,238,0.10)', color: ACCENT },
  warmup: { label: 'Прогрев', bg: 'rgba(245,158,11,0.10)', color: WARNING },
  activity: { label: 'Активность', bg: 'rgba(16,185,129,0.10)', color: SUCCESS },
};

const STATUS_META = {
  draft: { label: 'Черновик', bg: 'rgba(107,114,128,0.10)', color: MUTED },
  generating: { label: 'Генерация…', bg: 'rgba(245,158,11,0.10)', color: WARNING },
  generated: { label: 'Готово к проверке', bg: 'rgba(67,97,238,0.10)', color: ACCENT },
  published: { label: 'Запланировано', bg: 'rgba(16,185,129,0.10)', color: SUCCESS },
};

function SparkleIcon({ size = 56, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
      <path d="M12 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z"/>
    </svg>
  );
}

function ArrowIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}

// =============================================================================
// START STEP
// =============================================================================
function StartStep({ sessions, onCreate, onOpen, loading }) {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{
        ...cardBase, padding: '48px 32px 44px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        animation: 'aicFade 0.4s ease both',
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: -90, right: -60, width: 240, height: 240,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT2}1c 0%, transparent 70%)`,
          pointerEvents: 'none',
          animation: 'aicBlob 6s ease-in-out infinite',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -100, left: -70, width: 260, height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${PURPLE}18 0%, transparent 70%)`,
          pointerEvents: 'none',
          animation: 'aicBlob 8s ease-in-out infinite reverse',
        }} />

        <div aria-hidden style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 26px' }}>
          <div style={{
            position: 'absolute', inset: -18, borderRadius: '50%',
            background: `radial-gradient(circle, ${ACCENT2}38 0%, transparent 70%)`,
            animation: 'aicPulse 3s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 14px 36px ${ACCENT2}55`,
            animation: 'aicBlob 5s ease-in-out infinite',
          }}>
            <SparkleIcon />
          </div>
        </div>

        <h1 style={{
          position: 'relative',
          fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em',
          color: DARK, margin: '0 0 10px', lineHeight: 1.15,
        }}>
          ИИ Контент-план
        </h1>
        <p style={{
          position: 'relative',
          fontSize: '0.95rem', color: MUTED, margin: '0 auto 22px',
          maxWidth: 520, lineHeight: 1.55,
        }}>
          ИИ создаст контент-план на месяц под ваш канал — с учётом стиля, продуктов и целей
        </p>

        <div style={{ position: 'relative', marginBottom: 22 }}>
          <span style={{
            ...pill(`linear-gradient(135deg, ${ACCENT2}10 0%, ${PURPLE}10 100%)`, ACCENT2),
            border: `1px solid ${ACCENT2}30`,
            padding: '7px 16px', fontSize: '0.78rem',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 8px ${ACCENT2}` }} />
            150 ИИ-токенов за 15 постов · 300 за 60 (5₽/пост)
          </span>
        </div>

        <button
          className="aic-primary"
          style={{ ...primaryBtn, position: 'relative', opacity: loading ? 0.7 : 1 }}
          onClick={onCreate} disabled={loading}
        >
          {loading ? 'Создание…' : 'Создать новую сессию'}
          {!loading && <ArrowIcon />}
        </button>
      </div>

      {sessions.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={sectionTitleStyle}>Предыдущие сессии</h2>
            <p style={sectionSubStyle}>Откройте, чтобы посмотреть посты или повторно опубликовать</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map((s, i) => {
              const sm = STATUS_META[s.status] || STATUS_META.draft;
              return (
                <div key={s.id}
                  className="aic-card"
                  onClick={() => onOpen(s)}
                  style={{
                    ...cardBase, padding: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14,
                    animation: `aicFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
                  }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 800, fontSize: '1.05rem',
                    boxShadow: `0 3px 10px ${ACCENT2}40`,
                  }}>
                    {(s.topic || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: DARK, letterSpacing: '-0.01em' }}>
                        {s.topic || 'Без темы'}
                      </span>
                      <span style={pill(sm.bg, sm.color)}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.color }} />
                        {sm.label}
                      </span>
                      <span style={pill(SOFT_BG, MUTED)}>{s.post_count || s.posts_count} постов</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: MUTED }}>
                      {fmtRu(s.created_at)}
                    </div>
                  </div>
                  <ArrowIcon size={18} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// =============================================================================
// BRIEF STEP
// =============================================================================
function GoalSlider({ label, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.86rem', fontWeight: 600, color: DARK }}>{label}</span>
        <span style={{
          ...pill(`${color}15`, color),
          padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700,
        }}>{value}%</span>
      </div>
      <input
        type="range" min="0" max="100" step="10" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="aic-range"
        style={{
          width: '100%', accentColor: color, height: 6, cursor: 'pointer',
        }}
      />
    </div>
  );
}

function BriefStep({ brief, setBrief, onNext, onBack }) {
  const sum = brief.goal_sales + brief.goal_warmup + brief.goal_activity;
  const valid = brief.topic.trim() && sum === 100;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ ...cardBase, padding: '28px 28px 26px', animation: 'aicFade 0.4s ease both' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionTitleStyle}>Расскажите о канале</h2>
          <p style={sectionSubStyle}>Шаг 1 из 4 · Бриф</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <label style={labelStyle}>Тематика канала *</label>
            <input
              className="aic-input" style={inputStyle}
              value={brief.topic} onChange={e => setBrief(p => ({ ...p, topic: e.target.value }))}
              placeholder="Например: онлайн-курсы по SMM для предпринимателей"
            />
            <div style={hintStyle}>Опишите кратко, чему посвящён канал и какая аудитория</div>
          </div>

          <div>
            <label style={labelStyle}>Распределение целей контента</label>
            <GoalSlider
              label="Продажи"
              value={brief.goal_sales}
              onChange={v => setBrief(p => ({ ...p, goal_sales: v }))}
              color={ACCENT}
            />
            <GoalSlider
              label="Прогрев"
              value={brief.goal_warmup}
              onChange={v => setBrief(p => ({ ...p, goal_warmup: v }))}
              color={WARNING}
            />
            <GoalSlider
              label="Активность (вовлечение)"
              value={brief.goal_activity}
              onChange={v => setBrief(p => ({ ...p, goal_activity: v }))}
              color={SUCCESS}
            />
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 10,
              background: sum === 100 ? `${SUCCESS}10` : `${DANGER}10`,
              border: `1px solid ${sum === 100 ? SUCCESS : DANGER}30`,
              fontSize: '0.82rem', color: sum === 100 ? SUCCESS : DANGER,
              fontWeight: 600, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Сумма: {sum}%</span>
              <span>{sum === 100 ? '✓ Всё верно' : `Должно быть 100% (${sum > 100 ? `−${sum - 100}` : `+${100 - sum}`})`}</span>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between',
          marginTop: 26, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aic-ghost" style={ghostBtn} onClick={onBack}>← Назад</button>
          <button
            className="aic-primary" style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}
            onClick={onNext} disabled={!valid}
          >
            Далее <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STYLE STEP
// =============================================================================
function StyleStep({ tc, sessionId, postsAvailable, onDone, onBack }) {
  const { showToast } = useToast();
  const [source, setSource] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const submit = async () => {
    setBusy(true);
    try {
      if (source === 'file') {
        if (!file) { showToast('Загрузите файл', 'error'); setBusy(false); return; }
        const fd = new FormData();
        fd.append('file', file);
        await api.upload(`/ai-content/${tc}/session/${sessionId}/style-file`, fd);
      } else {
        await api.put(`/ai-content/${tc}/session/${sessionId}/style`, { source, text: source === 'text' ? text : '' });
      }
      onDone();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const Card = ({ id, title, subtitle, disabled, children }) => {
    const active = source === id;
    return (
      <div
        className="aic-style-card"
        onClick={() => !disabled && setSource(id)}
        style={{
          ...cardBase,
          padding: 16, cursor: disabled ? 'not-allowed' : 'pointer',
          borderColor: active ? 'transparent' : BORDER,
          opacity: disabled ? 0.5 : 1,
          background: active
            ? `linear-gradient(135deg, ${ACCENT}06 0%, ${ACCENT2}06 100%)`
            : '#fff',
          boxShadow: active
            ? `0 0 0 2px ${ACCENT}80, 0 6px 18px ${ACCENT}25`
            : '0 1px 3px rgba(0,0,0,0.04)',
          flex: 1, minWidth: 200,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: active ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : SOFT_BG,
            border: `2px solid ${active ? 'transparent' : BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
          </span>
          <span style={{ fontWeight: 700, color: DARK, fontSize: '0.92rem' }}>{title}</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: MUTED, lineHeight: 1.45 }}>{subtitle}</div>
        {children}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...cardBase, padding: '28px 28px 26px', animation: 'aicFade 0.4s ease both' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionTitleStyle}>Откуда брать стиль постов?</h2>
          <p style={sectionSubStyle}>Шаг 2 из 4 · ИИ скопирует тон, ритм и форматирование</p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <Card
            id="existing"
            title="Мои посты из канала"
            subtitle={postsAvailable > 0
              ? `Будут проанализированы последние ${Math.min(30, postsAvailable)} постов`
              : 'В канале нет опубликованных постов'}
            disabled={postsAvailable === 0}
          />
          <Card
            id="file"
            title="Загрузить файл"
            subtitle=".txt, .md, .docx до 5 МБ"
          />
          <Card
            id="text"
            title="Вставить текст"
            subtitle="До 10 000 символов"
          />
        </div>

        {source === 'file' && (
          <div style={{ marginBottom: 18 }}>
            <input
              ref={fileRef} type="file" accept=".txt,.md,.docx"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `1.5px dashed ${BORDER}`, borderRadius: 12,
                padding: '24px 18px', textAlign: 'center', cursor: 'pointer',
                background: SOFT_BG, transition: 'all .18s ease',
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: DARK }}>
                {file ? file.name : 'Нажмите, чтобы загрузить файл'}
              </div>
              <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 4 }}>
                .txt / .md / .docx
              </div>
            </div>
          </div>
        )}

        {source === 'text' && (
          <div style={{ marginBottom: 18 }}>
            <textarea
              className="aic-input"
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 180 }}
              maxLength={10000}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Вставьте 3–10 примеров постов из вашего канала или похожего канала-эталона…"
            />
            <div style={{ ...hintStyle, textAlign: 'right' }}>
              {text.length} / 10 000
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between',
          marginTop: 6, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aic-ghost" style={ghostBtn} onClick={onBack}>← Назад</button>
          <button
            className="aic-primary"
            style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
            onClick={submit} disabled={busy}
          >
            {busy ? 'Сохранение…' : 'Далее'} {!busy && <ArrowIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PRODUCTS STEP
// =============================================================================
function ProductsStep({ tc, sessionId, products, setProducts, onNext, onBack, optional }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const addRow = () => setProducts(p => [...p, { name: '', description: '', price: '' }]);
  const updateRow = (i, key, val) => setProducts(p => p.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  const removeRow = (i) => setProducts(p => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!optional && products.filter(p => p.name.trim()).length === 0) {
      showToast('Добавьте хотя бы один продукт', 'error');
      return;
    }
    setBusy(true);
    try {
      const cleaned = products.filter(p => p.name.trim());
      await api.put(`/ai-content/${tc}/session/${sessionId}/products`, { products: cleaned });
      onNext();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCsv = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.upload(`/ai-content/${tc}/session/${sessionId}/products-file`, fd);
      if (res.success) {
        setProducts(res.products || []);
        showToast(`Загружено ${res.count} продуктов`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...cardBase, padding: '28px 28px 26px', animation: 'aicFade 0.4s ease both' }}>
        <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={sectionTitleStyle}>Продукты или услуги {optional && <span style={{ fontWeight: 500, color: MUTED, fontSize: '0.85rem' }}>(необязательно)</span>}</h2>
            <p style={sectionSubStyle}>Шаг 3 из 4 · Будут использованы в продающих постах</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} style={{ display: 'none' }} />
            <button className="aic-ghost" style={{ ...ghostBtn, padding: '9px 14px', fontSize: '0.82rem' }} onClick={() => fileRef.current?.click()} disabled={busy}>
              📂 Загрузить CSV
            </button>
          </div>
        </div>

        {products.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            border: `1.5px dashed ${BORDER}`, borderRadius: 12,
            background: SOFT_BG, marginBottom: 14,
          }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 600, color: DARK, marginBottom: 6 }}>
              Пока нет продуктов
            </div>
            <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 16 }}>
              Добавьте товары/услуги или загрузите CSV (name, description, price)
            </div>
            <button className="aic-primary" style={{ ...primaryBtn, padding: '10px 20px', fontSize: '0.86rem' }} onClick={addRow}>
              + Добавить первый продукт
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {products.map((p, i) => (
              <div key={i} style={{
                ...cardBase, padding: 14, position: 'relative',
                animation: `aicFadeUp 0.3s ease ${i * 0.04}s both`,
              }}>
                <button
                  onClick={() => removeRow(i)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 26, height: 26, borderRadius: 8, cursor: 'pointer',
                    background: 'transparent', border: 'none', color: MUTED,
                    fontSize: '1.1rem', lineHeight: 1,
                  }}
                  title="Удалить"
                >×</button>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <input
                    className="aic-input" style={{ ...inputStyle, flex: 2, minWidth: 200 }}
                    placeholder="Название продукта"
                    value={p.name}
                    onChange={e => updateRow(i, 'name', e.target.value)}
                  />
                  <input
                    className="aic-input" style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                    placeholder="Цена (например: 9 990₽)"
                    value={p.price}
                    onChange={e => updateRow(i, 'price', e.target.value)}
                  />
                </div>
                <textarea
                  className="aic-input"
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 60 }}
                  placeholder="Краткое описание: что это, для кого, какой результат даёт"
                  value={p.description}
                  onChange={e => updateRow(i, 'description', e.target.value)}
                />
              </div>
            ))}
            <button className="aic-ghost" style={{ ...ghostBtn, alignSelf: 'flex-start', padding: '9px 16px', fontSize: '0.84rem' }} onClick={addRow}>
              + Добавить ещё
            </button>
          </div>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between',
          marginTop: 18, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aic-ghost" style={ghostBtn} onClick={onBack}>← Назад</button>
          <button
            className="aic-primary"
            style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
            onClick={submit} disabled={busy}
          >
            {busy ? 'Сохранение…' : 'Далее'} {!busy && <ArrowIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SCHEDULE STEP
// =============================================================================
function ScheduleStep({ schedule, setSchedule, onGenerate, onBack, busy }) {
  const cost = calcCost(schedule.posts_count);
  const perPost = Math.round((cost / schedule.posts_count) * 10) / 10;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ ...cardBase, padding: '28px 28px 26px', animation: 'aicFade 0.4s ease both' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionTitleStyle}>Расписание и количество</h2>
          <p style={sectionSubStyle}>Шаг 4 из 4 · Когда и сколько публиковать</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <label style={labelStyle}>Сколько постов на месяц?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
              <input
                type="range" min="15" max="60" step="1"
                value={schedule.posts_count}
                onChange={e => setSchedule(p => ({ ...p, posts_count: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: ACCENT, height: 6, cursor: 'pointer' }}
              />
              <div style={{
                ...pill(`${ACCENT}15`, ACCENT),
                padding: '5px 14px', fontSize: '0.92rem', fontWeight: 700,
                minWidth: 60, justifyContent: 'center',
              }}>
                {schedule.posts_count}
              </div>
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: `linear-gradient(135deg, ${ACCENT2}08 0%, ${PURPLE}08 100%)`,
              border: `1px solid ${ACCENT2}25`,
              fontSize: '0.84rem', color: DARK,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6,
            }}>
              <span style={{ fontWeight: 600 }}>
                Стоимость: <span style={{ color: ACCENT2 }}>{cost} ИИ-токенов</span>
              </span>
              <span style={{ fontSize: '0.76rem', color: MUTED }}>
                ≈ {perPost}₽/пост · {schedule.posts_count > 30 ? '2 поста в день' : '1 пост в день'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Время первого поста</label>
              <input
                type="time"
                className="aic-input" style={inputStyle}
                value={schedule.first_post_time}
                onChange={e => setSchedule(p => ({ ...p, first_post_time: e.target.value }))}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Время второго поста</label>
              <input
                type="time"
                className="aic-input" style={inputStyle}
                value={schedule.second_post_time}
                onChange={e => setSchedule(p => ({ ...p, second_post_time: e.target.value }))}
                disabled={schedule.posts_count <= 30}
              />
              <div style={hintStyle}>{schedule.posts_count > 30 ? 'Используется при >30 постов' : 'Не нужно при 1 посте в день'}</div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Дата начала</label>
            <input
              type="date"
              className="aic-input" style={inputStyle}
              value={schedule.start_date}
              onChange={e => setSchedule(p => ({ ...p, start_date: e.target.value }))}
            />
            <div style={hintStyle}>Первый пост будет запланирован на эту дату</div>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between',
          marginTop: 26, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aic-ghost" style={ghostBtn} onClick={onBack}>← Назад</button>
          <button
            className="aic-primary"
            style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
            onClick={onGenerate} disabled={busy}
          >
            {busy ? 'Запуск…' : `Сгенерировать (${cost} токенов)`}
            {!busy && <ArrowIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// GENERATING STEP
// =============================================================================
function GeneratingStep({ targetPostCount = 30 }) {
  // Анимированный прогресс: от 0% до 90% за ~45s, дальше держится 90% до резолва.
  // Когда родитель переключит шаг на 'review' — компонент размонтируется автоматически.
  const [pct, setPct] = useState(0);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    startedAtRef.current = Date.now();
    setPct(0);
    const TARGET_MS = 45000; // 45 секунд до 90%
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      // ease-out: быстрее в начале, медленнее к 90%
      const t = Math.min(1, elapsed / TARGET_MS);
      const eased = 1 - Math.pow(1 - t, 2.5);
      const next = Math.min(90, eased * 90);
      setPct(next);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const generated = Math.round((pct / 100) * targetPostCount);

  return (
    <div style={{
      ...cardBase, padding: '48px 32px 40px', textAlign: 'center',
      maxWidth: 560, margin: '0 auto',
      animation: 'aicFade 0.4s ease both',
    }}>
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 18px' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ animation: 'aicSpin 1.5s linear infinite' }}>
          <defs>
            <linearGradient id="aic-loader" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={ACCENT} />
              <stop offset="100%" stopColor={ACCENT2} />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="26" fill="none" stroke={BORDER} strokeWidth="5" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="url(#aic-loader)" strokeWidth="5"
            strokeLinecap="round" strokeDasharray="48 200" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 14px ${ACCENT2}55`,
          }}>
            <SparkleIcon size={14} />
          </div>
        </div>
      </div>
      <h3 style={{
        margin: '0 0 18px', fontSize: '1.15rem', fontWeight: 800,
        color: DARK, letterSpacing: '-0.02em',
      }}>
        ИИ создаёт контент-план
      </h3>

      {/* Progress bar */}
      <div style={{
        position: 'relative',
        width: '100%', height: 14, borderRadius: 999,
        background: SOFT_BG,
        border: `1px solid ${BORDER}`,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
        marginBottom: 14,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          borderRadius: 999,
          transition: 'width 0.5s linear',
          boxShadow: `0 0 8px ${ACCENT2}55`,
        }} />
      </div>

      <div style={{ fontSize: '1rem', color: DARK, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>
        Сгенерировано <strong>{generated}/{targetPostCount}</strong> постов
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: MUTED, lineHeight: 1.55 }}>
        Это занимает 30–60 секунд. Не закрывайте страницу.
      </p>
    </div>
  );
}

// =============================================================================
// REVIEW STEP — generated posts cards
// =============================================================================
const DEFAULT_PALETTE = ['#7B68EE', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6'];
const FORMAT_OPTIONS = [
  { id: '1:1', label: '1:1', hint: 'Квадрат' },
  { id: '4:3', label: '4:3', hint: 'Альбом' },
  { id: '3:4', label: '3:4', hint: 'Портрет' },
];
const MODE_OPTIONS = [
  { id: 'text', emoji: '📝', label: 'По тексту', sub: 'Иллюстрация по тексту поста' },
  { id: 'photo', emoji: '📸', label: 'По фото', sub: 'Реф из фотобанка' },
  { id: 'collage', emoji: '🖼️', label: 'Коллаж', sub: 'Из подборки фото' },
];

function PostCard({ post, onEdit, onDelete, onPublishNow, onSchedule, busyId, onGenerateImage, onRegenerateImage, onDeleteImage, imageBusyId, selected, onToggleSelect, onOpenInPublications }) {
  const [expanded, setExpanded] = useState(false);
  const goalMeta = GOAL_META[post.goal_type] || GOAL_META.warmup;
  const isPublished = !!post.published_post_id;
  const isBusy = busyId === post.id;
  const isImgBusy = imageBusyId === post.id;
  const imageUrl = post.generated_image_url || (post.file_url && post.file_type === 'photo' ? post.file_url : null);

  return (
    <div style={{
      ...cardBase, padding: 16, width: 320, flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative',
      borderColor: selected ? ACCENT : (isPublished ? `${SUCCESS}55` : BORDER),
      boxShadow: selected ? `0 0 0 2px ${ACCENT}40, 0 4px 12px ${ACCENT}25` : '0 1px 3px rgba(0,0,0,0.04)',
      opacity: isPublished ? 0.85 : 1,
    }}>
      {/* Checkbox в правом верхнем углу — только для непубликованных */}
      {!isPublished && onToggleSelect && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(post.id); }}
          aria-label={selected ? 'Снять выбор' : 'Выбрать'}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 24, height: 24, borderRadius: 7, padding: 0, cursor: 'pointer',
            border: selected ? 'none' : `1.5px solid ${BORDER}`,
            background: selected ? ACCENT : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: selected ? `0 2px 8px ${ACCENT}55` : '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'all .15s ease',
            zIndex: 2,
          }}
        >
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          )}
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingRight: isPublished ? 0 : 30 }}>
        {post.rubric && <span style={pill(SOFT_BG, MUTED)}>{post.rubric}</span>}
        <span style={pill(goalMeta.bg, goalMeta.color)}>{goalMeta.label}</span>
        {isPublished && <span style={pill(`${SUCCESS}15`, SUCCESS)}>✓ Опубликовано</span>}
      </div>

      {post.scheduled_at && (
        <div style={{ fontSize: '0.76rem', color: MUTED, fontWeight: 500 }}>
          📅 {fmtRu(post.scheduled_at)}
        </div>
      )}

      <div style={{ fontWeight: 700, color: DARK, fontSize: '0.92rem', letterSpacing: '-0.01em' }}>
        {post.title || 'Без названия'}
      </div>

      <div
        style={{
          fontSize: '0.82rem', color: '#374151', lineHeight: 1.5,
          maxHeight: expanded ? 'none' : 96, overflow: 'hidden',
          position: 'relative',
        }}
        dangerouslySetInnerHTML={{ __html: post.message_text || '' }}
      />
      {(post.message_text || '').length > 200 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: ACCENT, fontSize: '0.78rem', fontWeight: 600, padding: 0, alignSelf: 'flex-start',
          }}
        >
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}

      {/* === Image section === */}
      <div style={{ marginTop: 4 }}>
        {imageUrl ? (
          <div style={{
            position: 'relative',
            borderRadius: 12, overflow: 'hidden',
            border: `1px solid ${BORDER}`,
            background: SOFT_BG,
          }}>
            <img
              src={imageUrl}
              alt=""
              style={{ display: 'block', width: '100%', maxHeight: 200, objectFit: 'cover' }}
            />
            {isImgBusy && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.82rem', color: ACCENT, fontWeight: 600,
              }}>
                Генерация…
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, padding: 8, background: '#fff', borderTop: `1px solid ${BORDER}` }}>
              <button
                onClick={() => onRegenerateImage(post)}
                disabled={isPublished || isImgBusy}
                style={{ ...ghostBtn, padding: '6px 10px', fontSize: '0.76rem', flex: 1, justifyContent: 'center' }}
              >
                🔄 Перегенерировать
              </button>
              <button
                onClick={() => onDeleteImage(post)}
                disabled={isPublished || isImgBusy}
                style={{
                  ...ghostBtn, padding: '6px 10px', fontSize: '0.76rem',
                  color: DANGER, borderColor: 'rgba(230,57,70,0.25)',
                  background: 'rgba(230,57,70,0.04)',
                }}
                title="Удалить картинку"
              >🗑</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => onGenerateImage(post)}
            disabled={isPublished || isImgBusy}
            style={{
              ...primaryBtn,
              padding: '9px 14px', fontSize: '0.82rem', width: '100%',
              opacity: isPublished ? 0.5 : 1,
            }}
          >
            {isImgBusy ? '🪄 Генерация…' : '🪄 Сгенерировать фото'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
        {isPublished ? (
          <>
            <button
              onClick={() => onEdit(post)}
              disabled={isBusy}
              style={{
                ...ghostBtn, padding: '7px 10px', fontSize: '0.78rem', flex: 1, justifyContent: 'center',
              }}
              title="Редактировать опубликованный пост (изменит сообщение в канале)"
            >
              {isBusy ? '…' : '✎ Редактировать'}
            </button>
            <button
              onClick={() => onOpenInPublications && onOpenInPublications(post)}
              style={{
                ...ghostBtn, padding: '7px 10px', fontSize: '0.78rem',
                borderColor: `${SUCCESS}55`, color: SUCCESS,
                background: `${SUCCESS}08`,
              }}
              title="Открыть в Публикациях"
            >
              ↗
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onEdit(post)}
              style={{
                ...ghostBtn, padding: '7px 10px', fontSize: '0.78rem', flex: 1, justifyContent: 'center',
              }}
              title="Редактировать"
            >
              ✎ Изменить
            </button>
            <button
              onClick={() => onPublishNow(post)}
              disabled={isBusy}
              style={{
                ...primaryBtn, padding: '7px 10px', fontSize: '0.78rem', flex: 1,
              }}
              title="Опубликовать сейчас"
            >
              {isBusy ? '…' : '▶ Опубликовать'}
            </button>
            <button
              onClick={() => onDelete(post)}
              style={{
                ...ghostBtn, padding: '7px 10px', fontSize: '0.78rem',
                color: DANGER, borderColor: 'rgba(230,57,70,0.25)',
                background: 'rgba(230,57,70,0.04)',
              }}
              title="Удалить"
            >🗑</button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Палитра-выбор + формат-выбор (общие компоненты)
// =============================================================================
function ColorPaletteSelector({ value, onChange }) {
  const [pendingColor, setPendingColor] = useState('#7B68EE');
  const colors = value || [];
  const toggle = (c) => {
    if (colors.includes(c)) onChange(colors.filter(x => x !== c));
    else onChange([...colors, c]);
  };
  const remove = (i) => onChange(colors.filter((_, idx) => idx !== i));
  const addPending = () => {
    if (!pendingColor || colors.includes(pendingColor)) return;
    onChange([...colors, pendingColor]);
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {DEFAULT_PALETTE.map(c => {
          const active = colors.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              style={{
                width: 30, height: 30, borderRadius: 9, padding: 0,
                background: c, cursor: 'pointer',
                border: active ? `2px solid ${DARK}` : `1px solid ${BORDER}`,
                boxShadow: active ? `0 0 0 3px ${c}30, 0 4px 10px ${c}55` : '0 1px 3px rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform .15s ease',
              }}
              aria-label={c}
            >
              {active && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        marginTop: 10, padding: '6px 6px 6px 8px', borderRadius: 999,
        background: SOFT_BG, border: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: '0.78rem', color: MUTED, fontWeight: 500 }}>Свой:</span>
        <label
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: pendingColor, cursor: 'pointer',
            border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: `0 0 0 2px ${pendingColor}25`,
            position: 'relative', flexShrink: 0,
          }}
          title="Выбрать цвет"
        >
          <input
            type="color"
            value={pendingColor}
            onChange={e => setPendingColor(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
        <span style={{ fontSize: '0.74rem', color: MUTED, fontFamily: 'ui-monospace, monospace', minWidth: 64 }}>
          {pendingColor.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={addPending}
          disabled={colors.includes(pendingColor)}
          style={{
            padding: '6px 12px', borderRadius: 999, border: 'none',
            background: colors.includes(pendingColor) ? BORDER : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
            color: colors.includes(pendingColor) ? MUTED : '#fff',
            fontSize: '0.74rem', fontWeight: 600,
            cursor: colors.includes(pendingColor) ? 'default' : 'pointer',
          }}
        >
          {colors.includes(pendingColor) ? '✓' : '+ Добавить'}
        </button>
      </div>
      {colors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {colors.map((c, i) => (
            <span key={`sel-${i}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px 4px 6px', borderRadius: 999,
              background: SOFT_BG, border: `1px solid ${BORDER}`,
              fontSize: '0.72rem', color: MUTED, fontWeight: 500,
            }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
              {c.toUpperCase()}
              <button
                type="button"
                onClick={() => remove(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, marginLeft: 2, fontSize: '0.95rem', lineHeight: 1 }}
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FORMAT_OPTIONS.map(f => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            style={{
              padding: '8px 18px', borderRadius: 999,
              border: active ? 'none' : `1px solid ${BORDER}`,
              background: active
                ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`
                : '#fff',
              color: active ? '#fff' : DARK,
              fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer',
              boxShadow: active ? `0 4px 12px ${ACCENT}40` : 'none',
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              minWidth: 70,
            }}
          >
            <span>{f.label}</span>
            <span style={{ fontSize: '0.66rem', opacity: 0.8 }}>{f.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// PHOTO BANK MODAL
// =============================================================================
function PhotoBankModal({ isOpen, onClose, tc, photos, onReload, selectMode = false, onPick, multiSelect = false, picked = [] }) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pendingDescription, setPendingDescription] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
  };

  const handleUpload = async () => {
    if (!pendingFile) { showToast('Выберите файл', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('description', pendingDescription || '');
      await api.upload(`/ai-content/${tc}/photos`, fd);
      setPendingFile(null);
      setPendingDescription('');
      if (fileRef.current) fileRef.current.value = '';
      await onReload();
      showToast('Фото загружено', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm('Удалить фото из фотобанка?')) return;
    try {
      await api.delete(`/ai-content/${tc}/photos/${p.id}`);
      await onReload();
      showToast('Удалено', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const startEdit = (p) => { setEditingId(p.id); setEditDesc(p.description || ''); };
  const saveEdit = async () => {
    try {
      await api.put(`/ai-content/${tc}/photos/${editingId}`, { description: editDesc });
      setEditingId(null);
      await onReload();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Фотобанк">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Upload area */}
        <div style={{
          padding: 14, borderRadius: 12,
          background: `linear-gradient(135deg, ${ACCENT}06 0%, ${ACCENT2}06 100%)`,
          border: `1px solid ${ACCENT}25`,
        }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>📤 Загрузить фото</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          {pendingFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <img src={URL.createObjectURL(pendingFile)} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDER}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</div>
                <div style={{ fontSize: '0.74rem', color: MUTED }}>{Math.round(pendingFile.size / 1024)} КБ</div>
              </div>
              <button onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }} style={{ ...ghostBtn, padding: '6px 10px', fontSize: '0.76rem' }}>×</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} style={{ ...ghostBtn, width: '100%', justifyContent: 'center', padding: '14px 16px', borderStyle: 'dashed' }}>
              📎 Выбрать изображение
            </button>
          )}
          <input
            className="aic-input" style={{ ...inputStyle, marginBottom: 10 }}
            placeholder="Описание: что на фото (использует ИИ для подбора)"
            value={pendingDescription}
            onChange={e => setPendingDescription(e.target.value)}
            maxLength={500}
          />
          <button
            className="aic-primary"
            style={{ ...primaryBtn, width: '100%', opacity: (!pendingFile || uploading) ? 0.6 : 1 }}
            onClick={handleUpload}
            disabled={!pendingFile || uploading}
          >
            {uploading ? 'Загрузка…' : '+ Добавить в банк'}
          </button>
        </div>

        {/* Grid */}
        {photos.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            border: `1.5px dashed ${BORDER}`, borderRadius: 12, background: SOFT_BG,
            color: MUTED, fontSize: '0.86rem',
          }}>
            Фотобанк пуст. Загрузите фото — ИИ будет использовать их при генерации иллюстраций.
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
          }}>
            {photos.map(p => {
              const isPicked = picked.includes(p.id);
              return (
                <div key={p.id} style={{
                  ...cardBase, padding: 8, position: 'relative',
                  border: isPicked ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                  cursor: selectMode ? 'pointer' : 'default',
                }}
                  onClick={selectMode ? () => onPick && onPick(p) : undefined}
                >
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: SOFT_BG, marginBottom: 6 }}>
                    <img src={p.file_url} alt="" style={{ display: 'block', width: '100%', height: 110, objectFit: 'cover' }} />
                    {isPicked && (
                      <div style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 22, height: 22, borderRadius: '50%',
                        background: ACCENT, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.74rem', fontWeight: 700,
                      }}>✓</div>
                    )}
                  </div>
                  {editingId === p.id ? (
                    <div onClick={e => e.stopPropagation()}>
                      <textarea
                        className="aic-input"
                        style={{ ...inputStyle, fontSize: '0.76rem', minHeight: 50, padding: 6 }}
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        maxLength={500}
                      />
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => setEditingId(null)} style={{ ...ghostBtn, padding: '4px 8px', fontSize: '0.72rem', flex: 1 }}>Отмена</button>
                        <button onClick={saveEdit} style={{ ...primaryBtn, padding: '4px 8px', fontSize: '0.72rem', flex: 1 }}>OK</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.74rem', color: MUTED, lineHeight: 1.35, minHeight: 30 }}>
                        {p.description || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>без описания</span>}
                      </div>
                      {!selectMode && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => startEdit(p)} style={{ ...ghostBtn, padding: '4px 8px', fontSize: '0.72rem', flex: 1, justifyContent: 'center' }} title="Изменить">✎</button>
                          <button onClick={() => handleDelete(p)} style={{ ...ghostBtn, padding: '4px 8px', fontSize: '0.72rem', color: DANGER, borderColor: 'rgba(230,57,70,0.25)' }} title="Удалить">🗑</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onClose} style={ghostBtn}>Закрыть</button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// IMAGE GENERATION MODAL (per-post)
// =============================================================================
function ImageGenModal({ isOpen, onClose, post, tc, sessionId, photos, onReloadPhotos, onGenerated, sessionPalette = [] }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('text');
  const [palette, setPalette] = useState([]);
  const [format, setFormat] = useState('1:1');
  const [refPhotoId, setRefPhotoId] = useState(null);
  const [collagePhotos, setCollagePhotos] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [genPromptBusy, setGenPromptBusy] = useState(false);
  const [genImageBusy, setGenImageBusy] = useState(false);
  const [showBank, setShowBank] = useState(false);

  // Reset state when modal opens. Палитра: сначала из поста, иначе — последняя из сессии.
  useEffect(() => {
    if (isOpen && post) {
      setMode(post.generated_image_mode || 'text');
      const postPalette = post.generated_image_palette || [];
      setPalette(postPalette.length > 0 ? postPalette : (sessionPalette || []));
      setFormat(post.generated_image_format || '1:1');
      setPrompt(post.generated_image_prompt || '');
      setRefPhotoId(null);
      setCollagePhotos([]);
    }
  }, [isOpen, post, sessionPalette]);

  const handleGenPrompt = async () => {
    setGenPromptBusy(true);
    try {
      const res = await api.post(`/ai-content/${tc}/session/${sessionId}/post/${post.id}/generate-prompt`, {
        mode,
        palette,
        format,
        reference_photo_id: refPhotoId,
      });
      if (res.success) {
        setPrompt(res.prompt);
        showToast(`Промт сгенерирован (-${res.tokens_charged} токен)`, 'success');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setGenPromptBusy(false); }
  };

  const handleGenImage = async () => {
    if (!prompt.trim()) { showToast('Заполните промт', 'error'); return; }
    setGenImageBusy(true);
    try {
      const res = await api.post(`/ai-content/${tc}/session/${sessionId}/post/${post.id}/generate-image`, {
        prompt: prompt.trim(),
        mode,
        format,
        palette,
        reference_photo_id: refPhotoId,
        collage_screenshots: collagePhotos,
      });
      if (res.success) {
        showToast(`Фото сгенерировано (-${res.tokens_charged} токенов)`, 'success');
        onGenerated && onGenerated(res.post);
        onClose();
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setGenImageBusy(false); }
  };

  const pickRefPhoto = (p) => { setRefPhotoId(p.id); };
  const toggleCollagePhoto = (p) => {
    if (collagePhotos.includes(p.id)) setCollagePhotos(collagePhotos.filter(id => id !== p.id));
    else setCollagePhotos([...collagePhotos, p.id]);
  };

  const needsPhoto = mode === 'photo' || mode === 'collage';
  const photoBankEmpty = needsPhoto && photos.length === 0;
  const noPhotoPicked = (mode === 'photo' && !refPhotoId) || (mode === 'collage' && collagePhotos.length === 0);
  const canGenPrompt = !genPromptBusy && !photoBankEmpty && !(needsPhoto && noPhotoPicked);
  const canGenerate = !!prompt.trim() && !!format && !genImageBusy && !photoBankEmpty && !(needsPhoto && noPhotoPicked);
  if (!post) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`🪄 Иллюстрация к посту`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Mode selector */}
          <div>
            <label style={labelStyle}>Режим</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {MODE_OPTIONS.map(m => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    style={{
                      ...cardBase,
                      padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                      borderColor: active ? 'transparent' : BORDER,
                      background: active ? `linear-gradient(135deg, ${ACCENT}06 0%, ${ACCENT2}06 100%)` : '#fff',
                      boxShadow: active ? `0 0 0 2px ${ACCENT}80, 0 4px 12px ${ACCENT}25` : '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{m.emoji}</div>
                    <div style={{ fontWeight: 700, color: DARK, fontSize: '0.84rem' }}>{m.label}</div>
                    <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 2, lineHeight: 1.35 }}>{m.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photo bank picker for photo / collage modes */}
          {(mode === 'photo' || mode === 'collage') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  {mode === 'photo' ? 'Выберите фото' : 'Подберите для коллажа (несколько)'}
                </label>
                <button onClick={() => setShowBank(true)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: '0.74rem' }}>
                  📁 Открыть фотобанк
                </button>
              </div>
              {photos.length === 0 ? (
                <div style={{
                  padding: '20px 14px', textAlign: 'center',
                  border: `1.5px dashed ${BORDER}`, borderRadius: 10, background: SOFT_BG,
                  fontSize: '0.82rem', color: MUTED,
                }}>
                  Фотобанк пуст. <button onClick={() => setShowBank(true)} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Добавить фото →</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                  {photos.map(p => {
                    const picked = mode === 'photo' ? refPhotoId === p.id : collagePhotos.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => mode === 'photo' ? pickRefPhoto(p) : toggleCollagePhoto(p)}
                        style={{
                          position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                          border: picked ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                        }}
                      >
                        <img src={p.file_url} alt="" style={{ display: 'block', width: '100%', height: 80, objectFit: 'cover' }} />
                        {picked && (
                          <div style={{
                            position: 'absolute', top: 3, right: 3,
                            width: 20, height: 20, borderRadius: '50%',
                            background: ACCENT, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700,
                          }}>✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Palette */}
          <div>
            <label style={labelStyle}>Цветовая палитра</label>
            <ColorPaletteSelector value={palette} onChange={setPalette} />
          </div>

          {/* Format */}
          <div>
            <label style={labelStyle}>Формат</label>
            <FormatSelector value={format} onChange={setFormat} />
          </div>

          {/* Prompt */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Промт</label>
              <button
                onClick={handleGenPrompt}
                disabled={!canGenPrompt}
                title={photoBankEmpty ? 'Сначала добавьте хотя бы 1 фото в фотобанк' : noPhotoPicked && needsPhoto ? 'Выберите фото из банка' : ''}
                style={{
                  ...ghostBtn, padding: '6px 12px', fontSize: '0.76rem',
                  borderColor: ACCENT2, color: ACCENT2,
                  background: `linear-gradient(135deg, ${ACCENT}08 0%, ${ACCENT2}08 100%)`,
                  opacity: canGenPrompt ? 1 : 0.5,
                  cursor: canGenPrompt ? 'pointer' : 'not-allowed',
                }}
              >
                {genPromptBusy ? '…' : '🪄 Сгенерировать промт (1 токен)'}
              </button>
            </div>
            <textarea
              className="aic-input"
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 100, fontSize: '0.84rem' }}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Опишите что должно быть на изображении (или нажмите «Сгенерировать промт»)"
              maxLength={3000}
            />
            <div style={{ ...hintStyle, textAlign: 'right' }}>{prompt.length} / 3000</div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
            <button style={ghostBtn} onClick={onClose}>Отмена</button>
            <button
              className="aic-primary"
              style={{ ...primaryBtn, opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
              onClick={handleGenImage}
              disabled={!canGenerate}
              title={photoBankEmpty ? 'Сначала добавьте хотя бы 1 фото в фотобанк' : noPhotoPicked && needsPhoto ? 'Выберите фото из банка' : !prompt.trim() ? 'Заполните промт' : ''}
            >
              {genImageBusy
                ? 'Генерация…'
                : photoBankEmpty
                  ? 'Нужно добавить фото в банк'
                  : 'Сгенерировать (10 токенов)'}
            </button>
          </div>
        </div>
      </Modal>

      <PhotoBankModal
        isOpen={showBank}
        onClose={() => setShowBank(false)}
        tc={tc}
        photos={photos}
        onReload={onReloadPhotos}
      />
    </>
  );
}

// =============================================================================
// BATCH IMAGE GENERATION MODAL
// =============================================================================
function BatchImagesModal({ isOpen, onClose, tc, sessionId, postsToProcess, onComplete, photos = [], onOpenPhotoBank, sessionPalette = [] }) {
  const { showToast } = useToast();
  const [palette, setPalette] = useState([]);
  const [format, setFormat] = useState('1:1');
  const [defaultMode, setDefaultMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [photoScope, setPhotoScope] = useState('all'); // 'all' | 'selected'
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);

  const totalCost = postsToProcess.length * 10;

  useEffect(() => {
    if (isOpen) {
      setProgress(null);
      setBusy(false);
      // Подставляем палитру из сессии, если задана
      setPalette(sessionPalette && sessionPalette.length > 0 ? sessionPalette : []);
      setPhotoScope('all');
      setSelectedPhotoIds([]);
    }
  }, [isOpen, sessionPalette]);

  const modeNeedsPhotos = defaultMode === 'auto' || defaultMode === 'photo' || defaultMode === 'collage';
  const photoBankEmpty = modeNeedsPhotos && photos.length === 0;
  const showPhotoPicker = modeNeedsPhotos && !photoBankEmpty;
  const noPhotosSelected = photoScope === 'selected' && selectedPhotoIds.length === 0;
  const togglePhoto = (id) => {
    setSelectedPhotoIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleStart = async () => {
    if (postsToProcess.length === 0) {
      showToast('Все посты уже имеют картинки', 'info');
      return;
    }
    if (photoBankEmpty) {
      showToast('Сначала добавьте хотя бы 1 фото в фотобанк', 'error');
      return;
    }
    if (showPhotoPicker && noPhotosSelected) {
      showToast('Выберите хотя бы одно фото или переключитесь на «Все из фотобанка»', 'error');
      return;
    }
    setBusy(true);
    setProgress({ status: 'running', total: postsToProcess.length, generated: 0, failed: 0 });

    // Polling прогресса каждые 1500ms
    let pollTimer = setInterval(async () => {
      try {
        const p = await api.get(`/ai-content/${tc}/session/${sessionId}/batch-progress`);
        if (p && p.success) {
          setProgress(prev => prev && prev.status === 'running' ? {
            ...prev,
            total: p.total || prev.total,
            generated: p.generated || 0,
            failed: p.failed || 0,
          } : prev);
          if (!p.in_progress) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      } catch { /* ignore poll errors */ }
    }, 1500);

    try {
      const res = await api.post(`/ai-content/${tc}/session/${sessionId}/generate-images-all`, {
        format,
        palette,
        default_mode: defaultMode,
        photo_ids: photoScope === 'selected' ? selectedPhotoIds : [],
      });
      if (res.success) {
        setProgress({
          status: 'done',
          total: postsToProcess.length,
          generated: res.generated_count,
          failed: res.failed_count,
        });
        showToast(`Сгенерировано ${res.generated_count}/${postsToProcess.length} фото (-${res.tokens_charged} токенов)`, 'success');
        onComplete && onComplete(res);
      }
    } catch (e) {
      showToast(e.message, 'error');
      setProgress(null);
    } finally {
      if (pollTimer) clearInterval(pollTimer);
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="🪄 Сгенерировать фото ко всем постам">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: `linear-gradient(135deg, ${ACCENT2}08 0%, ${PURPLE}08 100%)`,
          border: `1px solid ${ACCENT2}25`,
          fontSize: '0.86rem', color: DARK,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Будет обработано: <span style={{ color: ACCENT2 }}>{postsToProcess.length}</span> постов
          </div>
          <div style={{ fontSize: '0.78rem', color: MUTED }}>
            Стоимость: {totalCost} токенов ({postsToProcess.length}×10). Списываем за каждый успешный пост.
            Генерация займёт несколько минут.
          </div>
        </div>

        {!progress?.status && (
          <>
            <div>
              <label style={labelStyle}>Режим иллюстраций</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { id: 'auto', emoji: '✨', label: 'Авто (ИИ решает)' },
                  ...MODE_OPTIONS,
                ].map(m => {
                  const active = defaultMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDefaultMode(m.id)}
                      style={{
                        ...cardBase, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                        borderColor: active ? 'transparent' : BORDER,
                        background: active ? `linear-gradient(135deg, ${ACCENT}06 0%, ${ACCENT2}06 100%)` : '#fff',
                        boxShadow: active ? `0 0 0 2px ${ACCENT}80` : '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{ fontSize: '1rem' }}>{m.emoji}</div>
                      <div style={{ fontWeight: 700, color: DARK, fontSize: '0.8rem', marginTop: 2 }}>{m.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {photoBankEmpty && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${WARNING}10`, border: `1px solid ${WARNING}40`,
                fontSize: '0.84rem', color: DARK,
              }}>
                <div style={{ fontWeight: 700, color: WARNING, marginBottom: 4 }}>⚠️ Фотобанк пуст</div>
                <div style={{ color: MUTED, marginBottom: 8 }}>
                  Для режима «{defaultMode === 'auto' ? 'Авто' : defaultMode === 'photo' ? 'По фото' : 'Коллаж'}» нужно хотя бы 1 фото в банке.
                </div>
                {onOpenPhotoBank && (
                  <button onClick={onOpenPhotoBank} style={{ ...ghostBtn, padding: '6px 12px', fontSize: '0.78rem' }}>
                    📁 Открыть фотобанк
                  </button>
                )}
              </div>
            )}

            {showPhotoPicker && (
              <div>
                <label style={labelStyle}>Какие фото использовать</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: `Все из фотобанка (${photos.length})` },
                    { id: 'selected', label: `Только выбранные${selectedPhotoIds.length > 0 ? ` (${selectedPhotoIds.length})` : ''}` },
                  ].map(opt => {
                    const active = photoScope === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPhotoScope(opt.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                          fontSize: '0.82rem', fontWeight: 600,
                          border: active ? `1.5px solid ${ACCENT}` : `1.5px solid ${BORDER}`,
                          background: active ? `${ACCENT}10` : '#fff',
                          color: active ? ACCENT : DARK,
                          transition: 'all .15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {photoScope === 'selected' && (
                  <>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                      gap: 6, maxHeight: 220, overflowY: 'auto',
                      padding: 8, border: `1px solid ${BORDER}`, borderRadius: 10, background: SOFT_BG,
                    }}>
                      {photos.map(p => {
                        const picked = selectedPhotoIds.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePhoto(p.id)}
                            style={{
                              position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                              border: picked ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                            }}
                          >
                            <img src={p.file_url} alt="" style={{ display: 'block', width: '100%', height: 70, objectFit: 'cover' }} />
                            {picked && (
                              <div style={{
                                position: 'absolute', top: 3, right: 3,
                                width: 18, height: 18, borderRadius: '50%',
                                background: ACCENT, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 700,
                              }}>✓</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {noPhotosSelected && (
                      <div style={{ ...hintStyle, color: WARNING, fontWeight: 600, marginTop: 6 }}>
                        ⚠️ Выберите хотя бы одно фото
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <label style={labelStyle}>Цветовая палитра</label>
              <ColorPaletteSelector value={palette} onChange={setPalette} />
            </div>

            <div>
              <label style={labelStyle}>Формат</label>
              <FormatSelector value={format} onChange={setFormat} />
            </div>
          </>
        )}

        {progress?.status === 'running' && (() => {
          const total = progress.total || 1;
          const gen = progress.generated || 0;
          const fail = progress.failed || 0;
          const pct = Math.min(100, Math.round(((gen + fail) / total) * 100));
          return (
            <div style={{ padding: '14px 0 6px' }}>
              {/* Progress bar */}
              <div style={{
                position: 'relative',
                width: '100%', height: 14, borderRadius: 999,
                background: SOFT_BG,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                marginBottom: 14,
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  borderRadius: 999,
                  transition: 'width 0.5s ease',
                  boxShadow: `0 0 8px ${ACCENT2}55`,
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '1rem', color: DARK, fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Сгенерировано <strong>{gen}/{total}</strong> картинок
                  </div>
                  {fail > 0 && (
                    <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 4 }}>
                      Неудачных: {fail}
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 4 }}>
                    Это занимает несколько минут. Не закрывайте окно.
                  </div>
                </div>
                <svg width="28" height="28" viewBox="0 0 28 28" style={{ animation: 'aicSpin 1.5s linear infinite', flexShrink: 0 }}>
                  <circle cx="14" cy="14" r="11" fill="none" stroke={BORDER} strokeWidth="3" />
                  <circle cx="14" cy="14" r="11" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeDasharray="22 100" />
                </svg>
              </div>
            </div>
          );
        })()}

        {progress?.status === 'done' && (
          <div style={{ padding: '14px 16px', borderRadius: 12, background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}30` }}>
            <div style={{ fontWeight: 700, color: SUCCESS, marginBottom: 6 }}>✓ Готово!</div>
            <div style={{ fontSize: '0.84rem', color: DARK }}>
              Сгенерировано: <strong>{progress.generated}</strong> · Неудачно: <strong>{progress.failed}</strong>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          {!busy && progress?.status !== 'done' && (
            <button style={ghostBtn} onClick={onClose}>Отмена</button>
          )}
          {progress?.status === 'done' ? (
            <button style={primaryBtn} onClick={onClose}>Закрыть</button>
          ) : (
            <button
              className="aic-primary"
              style={{
                ...primaryBtn,
                opacity: busy || postsToProcess.length === 0 || photoBankEmpty || noPhotosSelected ? 0.5 : 1,
                cursor: busy || postsToProcess.length === 0 || photoBankEmpty || noPhotosSelected ? 'not-allowed' : 'pointer',
              }}
              onClick={handleStart}
              disabled={busy || postsToProcess.length === 0 || photoBankEmpty || noPhotosSelected}
              title={
                photoBankEmpty ? 'Сначала добавьте хотя бы 1 фото в фотобанк'
                  : noPhotosSelected ? 'Выберите хотя бы одно фото'
                  : ''
              }
            >
              {busy
                ? 'Генерация…'
                : photoBankEmpty
                  ? 'Нужно фото в банке'
                  : noPhotosSelected
                    ? 'Выберите фото'
                    : `Запустить (${totalCost} токенов)`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReviewStep({ tc, sessionId, posts, onReload, onPublishAll, onBack, onDone, leadMagnets, sessionPalette, onSwitchView }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', message_text: '', scheduled_at: '', inline_buttons: '', attach_type: '' });
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [postFile, setPostFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Phase 2 — image generation state
  const [photos, setPhotos] = useState([]);
  const [imageBusyId, setImageBusyId] = useState(null);
  const [imageGenPost, setImageGenPost] = useState(null);
  const [showPhotoBank, setShowPhotoBank] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const remaining = posts.filter(p => !p.published_post_id).length;
  const postsWithoutImage = posts.filter(p => !p.published_post_id && !p.generated_image_url);
  const batchCost = postsWithoutImage.length * 10;
  const unpublishedIds = posts.filter(p => !p.published_post_id).map(p => p.id);
  const selectedCount = selectedIds.size;
  const allUnpublishedSelected = unpublishedIds.length > 0 && unpublishedIds.every(id => selectedIds.has(id));

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllUnpublished = () => setSelectedIds(new Set(unpublishedIds));
  const clearSelection = () => setSelectedIds(new Set());

  const loadPhotos = useCallback(async () => {
    try {
      const data = await api.get(`/ai-content/${tc}/photos`);
      if (data.success) setPhotos(data.photos || []);
    } catch { /* ignore */ }
  }, [tc]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const openEdit = (p) => {
    setEditing(p);
    setPostFile(null);
    let btns = '';
    if (p.inline_buttons) {
      try { btns = typeof p.inline_buttons === 'string' ? p.inline_buttons : JSON.stringify(p.inline_buttons, null, 2); }
      catch { /* ignore */ }
    }
    let scheduled = '';
    if (p.scheduled_at) {
      try {
        const d = new Date(p.scheduled_at);
        const pad = (n) => String(n).padStart(2, '0');
        scheduled = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch { /* ignore */ }
    }
    setForm({
      title: p.title || '',
      message_text: p.message_text || '',
      scheduled_at: scheduled,
      inline_buttons: btns,
      attach_type: p.attach_type || '',
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      let parsedButtons = null;
      if (form.inline_buttons && form.inline_buttons.trim()) {
        try { parsedButtons = JSON.parse(form.inline_buttons); }
        catch { showToast('Неверный формат кнопок', 'error'); setSaving(false); return; }
      }
      const payload = {
        title: form.title,
        message_text: form.message_text,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        inline_buttons: parsedButtons,
        attach_type: form.attach_type || null,
      };

      const publishedId = editing.published_post_id;
      if (publishedId) {
        // Опубликованный пост: правим напрямую запись в content_posts
        // и пере-публикуем (это обновит сообщение в канале).
        if (postFile) {
          const fd = new FormData();
          if (payload.title != null) fd.append('title', payload.title || '');
          fd.append('message_text', payload.message_text || '');
          if (payload.scheduled_at) fd.append('scheduled_at', payload.scheduled_at);
          if (payload.attach_type) fd.append('attach_type', payload.attach_type);
          if (parsedButtons) fd.append('inline_buttons', JSON.stringify(parsedButtons));
          fd.append('file', postFile);
          await api.upload(`/content/${tc}/${publishedId}`, fd, 'PUT');
        } else {
          await api.put(`/content/${tc}/${publishedId}`, payload);
        }
        try {
          await api.post(`/content/${tc}/${publishedId}/publish`);
          showToast('Пост обновлён в канале', 'success');
        } catch (pubErr) {
          showToast(`Сохранено, но не удалось обновить канал: ${pubErr.message}`, 'error');
        }
      } else {
        await api.put(`/ai-content/${tc}/session/${sessionId}/post/${editing.id}`, payload);
        if (postFile) {
          const fd = new FormData();
          fd.append('file', postFile);
          await api.upload(`/ai-content/${tc}/session/${sessionId}/post/${editing.id}/file`, fd);
        }
        showToast('Пост обновлён', 'success');
      }
      setEditing(null);
      onReload();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInPublications = (p) => {
    if (onSwitchView) onSwitchView('list');
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Удалить пост "${p.title || ''}"?`)) return;
    try {
      await api.delete(`/ai-content/${tc}/session/${sessionId}/post/${p.id}`);
      onReload();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handlePublishNow = async (p) => {
    if (!window.confirm('Опубликовать пост в канал прямо сейчас?')) return;
    setBusyId(p.id);
    try {
      const res = await api.post(`/ai-content/${tc}/session/${sessionId}/post/${p.id}/publish`, { now: true });
      if (res.success) {
        showToast(res.published ? 'Пост опубликован' : 'Пост добавлен в Публикации', 'success');
        onReload();
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const handlePublishAll = async () => {
    if (remaining === 0) { showToast('Все посты уже добавлены', 'info'); return; }
    if (!window.confirm(`Запланировать ${remaining} постов в Публикации?`)) return;
    setBulkBusy(true);
    try {
      const res = await onPublishAll();
      if (res?.success) {
        showToast(`Запланировано ${res.count} постов`, 'success');
        onDone();
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBulkBusy(false); }
  };

  const handlePublishSelected = async () => {
    const ids = unpublishedIds.filter(id => selectedIds.has(id));
    if (ids.length === 0) { showToast('Не выбраны посты', 'info'); return; }
    if (!window.confirm(`Запланировать ${ids.length} выбранных постов в Публикации?`)) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const pid of ids) {
      try {
        const res = await api.post(`/ai-content/${tc}/session/${sessionId}/post/${pid}/publish`, { now: false });
        if (res?.success) ok += 1; else fail += 1;
      } catch { fail += 1; }
    }
    setBulkBusy(false);
    clearSelection();
    onReload();
    if (fail === 0) showToast(`Запланировано ${ok} постов`, 'success');
    else showToast(`Запланировано ${ok}, не удалось ${fail}`, fail === ids.length ? 'error' : 'info');
  };

  // ---- Phase 2: image generation handlers ----
  const handleOpenImageGen = (p) => setImageGenPost(p);

  const handleRegenerateImage = (p) => setImageGenPost(p);

  const handleDeleteImage = async (p) => {
    if (!window.confirm('Удалить сгенерированное изображение?')) return;
    setImageBusyId(p.id);
    try {
      await api.delete(`/ai-content/${tc}/session/${sessionId}/post/${p.id}/image`);
      showToast('Изображение удалено', 'success');
      onReload();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setImageBusyId(null); }
  };

  const handleImageGenerated = () => { onReload(); };

  const handleBatchComplete = () => { onReload(); };

  return (
    <div style={{ animation: 'aicFade 0.4s ease both' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, marginBottom: 18,
      }}>
        <div>
          <h2 style={sectionTitleStyle}>Сгенерированные посты</h2>
          <p style={sectionSubStyle}>
            Всего: {posts.length} · Осталось добавить: {remaining}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="aic-ghost" style={ghostBtn} onClick={onBack}>← Назад в брифе</button>
          <button
            className="aic-ghost"
            style={ghostBtn}
            onClick={() => setShowPhotoBank(true)}
          >
            📁 Фотобанк {photos.length > 0 && <span style={{ marginLeft: 4, ...pill(`${ACCENT}10`, ACCENT), padding: '2px 8px', fontSize: '0.7rem' }}>{photos.length}</span>}
          </button>
          <button
            className="aic-primary"
            style={{
              ...primaryBtn,
              background: `linear-gradient(135deg, ${ACCENT2} 0%, ${PURPLE} 100%)`,
              boxShadow: `0 4px 14px ${ACCENT2}40`,
              opacity: postsWithoutImage.length === 0 ? 0.5 : 1,
            }}
            onClick={() => setShowBatchModal(true)}
            disabled={postsWithoutImage.length === 0}
            title={postsWithoutImage.length === 0 ? 'У всех постов уже есть картинки' : ''}
          >
            🪄 Сгенерировать фото ко всем ({postsWithoutImage.length}×10 = {batchCost} токенов)
          </button>
          {selectedCount > 0 ? (
            <button
              className="aic-primary"
              style={{ ...primaryBtn, opacity: bulkBusy ? 0.5 : 1 }}
              onClick={handlePublishSelected}
              disabled={bulkBusy}
            >
              {bulkBusy ? 'Планирование…' : `📤 Запланировать выбранные (${selectedCount})`}
            </button>
          ) : (
            <button
              className="aic-primary"
              style={{ ...primaryBtn, opacity: bulkBusy || remaining === 0 ? 0.5 : 1 }}
              onClick={handlePublishAll}
              disabled={bulkBusy || remaining === 0}
            >
              {bulkBusy ? 'Планирование…' : `📤 Запланировать всё (${remaining})`}
            </button>
          )}
        </div>
      </div>

      {/* Toolbar для выбора */}
      {unpublishedIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '8px 0 14px', fontSize: '0.82rem', color: MUTED,
        }}>
          <button
            type="button"
            onClick={allUnpublishedSelected ? clearSelection : selectAllUnpublished}
            style={{
              background: 'none', border: `1px solid ${BORDER}`,
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.78rem', color: DARK, fontWeight: 600,
            }}
          >
            {allUnpublishedSelected ? '☐ Снять все' : `☑ Выбрать все (${unpublishedIds.length})`}
          </button>
          {selectedCount > 0 && (
            <>
              <span>Выбрано: <strong style={{ color: ACCENT }}>{selectedCount}</strong></span>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: ACCENT, fontWeight: 600, fontSize: '0.82rem', padding: 0,
                }}
              >
                Снять выбор
              </button>
            </>
          )}
        </div>
      )}

      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16,
        scrollSnapType: 'x mandatory',
      }}>
        {posts.map(p => (
          <div key={p.id} style={{ scrollSnapAlign: 'start' }}>
            <PostCard
              post={p}
              onEdit={openEdit}
              onDelete={handleDelete}
              onPublishNow={handlePublishNow}
              busyId={busyId}
              onGenerateImage={handleOpenImageGen}
              onRegenerateImage={handleRegenerateImage}
              onDeleteImage={handleDeleteImage}
              imageBusyId={imageBusyId}
              selected={selectedIds.has(p.id)}
              onToggleSelect={toggleSelect}
              onOpenInPublications={handleOpenInPublications}
            />
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Редактировать пост"
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Заголовок (внутренний)</label>
              <input className="aic-input" style={inputStyle}
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div>
              <label style={labelStyle}>Текст поста *</label>
              <RichTextEditor
                value={form.message_text}
                onChange={val => setForm(p => ({ ...p, message_text: val }))}
                placeholder="Текст публикации…"
                rows={8}
                showEmoji={true}
                hasFile={!!(postFile || editing.file_path)}
              />
            </div>

            <div>
              <label style={labelStyle}>Вложение</label>
              <AttachmentPicker
                file={postFile}
                onFileChange={setPostFile}
                attachType={form.attach_type}
                onAttachTypeChange={v => setForm(p => ({ ...p, attach_type: v }))}
                existingFileInfo={editing.file_type || ''}
                existingFileUrl={editing.file_path ? '/uploads/' + editing.file_path.split('/uploads/').pop() : ''}
              />
            </div>

            <div>
              <label style={labelStyle}>Дата публикации</label>
              <input className="aic-input" style={inputStyle} type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
              />
            </div>

            <div>
              <label style={labelStyle}>Инлайн-кнопки</label>
              <ButtonBuilder
                value={form.inline_buttons}
                onChange={val => setForm(p => ({ ...p, inline_buttons: val }))}
                leadMagnets={leadMagnets}
                showLeadMagnet={leadMagnets.length > 0}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="aic-ghost" style={ghostBtn} onClick={() => setEditing(null)}>Отмена</button>
              <button className="aic-primary" style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Phase 2 — Image gen + photo bank + batch modals */}
      <ImageGenModal
        isOpen={!!imageGenPost}
        onClose={() => setImageGenPost(null)}
        post={imageGenPost}
        tc={tc}
        sessionId={sessionId}
        photos={photos}
        onReloadPhotos={loadPhotos}
        onGenerated={handleImageGenerated}
        sessionPalette={sessionPalette}
      />
      <PhotoBankModal
        isOpen={showPhotoBank}
        onClose={() => setShowPhotoBank(false)}
        tc={tc}
        photos={photos}
        onReload={loadPhotos}
      />
      <BatchImagesModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        tc={tc}
        sessionId={sessionId}
        postsToProcess={postsWithoutImage}
        onComplete={handleBatchComplete}
        photos={photos}
        onOpenPhotoBank={() => { setShowBatchModal(false); setShowPhotoBank(true); }}
        sessionPalette={sessionPalette}
      />
    </div>
  );
}

// =============================================================================
// DONE STEP
// =============================================================================
function DoneStep({ count, onGoToList, onReset }) {
  return (
    <div style={{
      ...cardBase, padding: '56px 32px', textAlign: 'center',
      maxWidth: 520, margin: '0 auto',
      animation: 'aicFade 0.4s ease both',
    }}>
      <div style={{
        width: 96, height: 96, margin: '0 auto 22px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 14px 36px ${SUCCESS}55`,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3 style={{
        margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800,
        color: DARK, letterSpacing: '-0.02em',
      }}>
        Готово!
      </h3>
      <p style={{ margin: '0 0 22px', fontSize: '0.92rem', color: MUTED, lineHeight: 1.55 }}>
        {count > 0 ? `${count} постов добавлены в Публикации и будут опубликованы по расписанию.` : 'Все посты добавлены в Публикации.'}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="aic-ghost" style={ghostBtn} onClick={onReset}>Создать новую сессию</button>
        <button className="aic-primary" style={primaryBtn} onClick={onGoToList}>
          Перейти в Публикации <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================
export default function AiContentTab({ tc, channelId, leadMagnets, onSwitchView }) {
  const { showToast } = useToast();
  const [step, setStep] = useState('start');
  const [loading, setLoading] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [doneCount, setDoneCount] = useState(0);
  const [postsAvailable, setPostsAvailable] = useState(0);
  const [sessionPalette, setSessionPalette] = useState([]);

  const [brief, setBrief] = useState({
    topic: '',
    goal_sales: 30,
    goal_warmup: 50,
    goal_activity: 20,
  });

  const [schedule, setSchedule] = useState({
    posts_count: 30,
    first_post_time: '10:00',
    second_post_time: '19:00',
    start_date: tomorrowIso(),
  });

  const [products, setProducts] = useState([]);

  const loadSessions = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ai-content/${tc}/sessions`);
      if (data.success) setPastSessions(data.sessions || []);
    } catch { /* ignore */ }
  }, [tc]);

  // Load count of channel posts (for "use existing" option)
  const loadChannelPosts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/content/${tc}?status=published`);
      if (data.success) setPostsAvailable((data.posts || []).length);
    } catch { /* ignore */ }
  }, [tc]);

  useEffect(() => { if (step === 'start') { loadSessions(); loadChannelPosts(); } }, [step, loadSessions, loadChannelPosts]);

  const reloadPosts = useCallback(async () => {
    if (!tc || !sessionId) return;
    try {
      const data = await api.get(`/ai-content/${tc}/session/${sessionId}`);
      if (data.success) {
        setPosts(data.posts || []);
        if (data.session && Array.isArray(data.session.last_image_palette)) {
          setSessionPalette(data.session.last_image_palette);
        }
      }
    } catch { /* ignore */ }
  }, [tc, sessionId]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const data = await api.post(`/ai-content/${tc}/session`);
      if (data.success) {
        setSessionId(data.session_id);
        setStep('brief');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleOpenSession = async (s) => {
    setLoading(true);
    try {
      const data = await api.get(`/ai-content/${tc}/session/${s.id}`);
      if (data.success) {
        setSessionId(s.id);
        const sess = data.session;
        setBrief({
          topic: sess.topic || '',
          goal_sales: sess.goal_sales || 0,
          goal_warmup: sess.goal_warmup || 0,
          goal_activity: sess.goal_activity || 0,
        });
        setSchedule({
          posts_count: sess.posts_count || 30,
          first_post_time: sess.first_post_time || '10:00',
          second_post_time: sess.second_post_time || '19:00',
          start_date: sess.start_date || tomorrowIso(),
        });
        setProducts(sess.products || []);
        setPosts(data.posts || []);
        setSessionPalette(Array.isArray(sess.last_image_palette) ? sess.last_image_palette : []);
        if ((data.posts || []).length > 0) setStep('review');
        else setStep('brief');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleSaveBrief = async () => {
    try {
      await api.put(`/ai-content/${tc}/session/${sessionId}/brief`, {
        topic: brief.topic,
        goal_sales: brief.goal_sales,
        goal_warmup: brief.goal_warmup,
        goal_activity: brief.goal_activity,
        posts_count: schedule.posts_count,
        first_post_time: schedule.first_post_time,
        second_post_time: schedule.second_post_time,
        start_date: schedule.start_date,
      });
      setStep('style');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleStyleDone = () => {
    if ((brief.goal_sales || 0) >= 10) {
      setStep('products');
    } else {
      setStep('schedule');
    }
  };

  const handleProductsNext = () => setStep('schedule');

  const handleGenerate = async () => {
    // Save schedule fields together with brief in case user changed posts_count
    setLoading(true);
    try {
      await api.put(`/ai-content/${tc}/session/${sessionId}/brief`, {
        topic: brief.topic,
        goal_sales: brief.goal_sales,
        goal_warmup: brief.goal_warmup,
        goal_activity: brief.goal_activity,
        posts_count: schedule.posts_count,
        first_post_time: schedule.first_post_time,
        second_post_time: schedule.second_post_time,
        start_date: schedule.start_date,
      });
      setStep('generating');
      const data = await api.post(`/ai-content/${tc}/session/${sessionId}/generate`);
      if (data.success) {
        setPosts(data.posts || []);
        setStep('review');
      }
    } catch (e) {
      showToast(e.message, 'error');
      setStep('schedule');
    } finally { setLoading(false); }
  };

  const handlePublishAll = async () => {
    const res = await api.post(`/ai-content/${tc}/session/${sessionId}/publish-all`);
    if (res.success) setDoneCount(res.count);
    return res;
  };

  const handleReset = () => {
    setStep('start');
    setSessionId(null);
    setPosts([]);
    setBrief({ topic: '', goal_sales: 30, goal_warmup: 50, goal_activity: 20 });
    setSchedule({ posts_count: 30, first_post_time: '10:00', second_post_time: '19:00', start_date: tomorrowIso() });
    setProducts([]);
    setDoneCount(0);
    setSessionPalette([]);
  };

  const handleGoToList = () => {
    handleReset();
    if (onSwitchView) onSwitchView('list');
  };

  return (
    <div>
      <style>{`
        @keyframes aicFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aicFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aicPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes aicBlob { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        @keyframes aicSpin { to { transform: rotate(360deg); } }
        @keyframes aicDot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.1); } }
        .aic-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .aic-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${ACCENT}55 !important; }
        .aic-ghost:hover { background: ${SOFT_BG} !important; border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; }
        .aic-input:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}15; }
        .aic-style-card:hover { transform: translateY(-1px); border-color: ${ACCENT}55 !important; }
      `}</style>

      {step === 'start' && (
        <StartStep
          sessions={pastSessions}
          onCreate={handleCreate}
          onOpen={handleOpenSession}
          loading={loading}
        />
      )}
      {step === 'brief' && (
        <BriefStep
          brief={brief}
          setBrief={setBrief}
          onNext={handleSaveBrief}
          onBack={handleReset}
        />
      )}
      {step === 'style' && (
        <StyleStep
          tc={tc}
          sessionId={sessionId}
          postsAvailable={postsAvailable}
          onDone={handleStyleDone}
          onBack={() => setStep('brief')}
        />
      )}
      {step === 'products' && (
        <ProductsStep
          tc={tc}
          sessionId={sessionId}
          products={products}
          setProducts={setProducts}
          onNext={handleProductsNext}
          onBack={() => setStep('style')}
          optional={brief.goal_sales < 30}
        />
      )}
      {step === 'schedule' && (
        <ScheduleStep
          schedule={schedule}
          setSchedule={setSchedule}
          onGenerate={handleGenerate}
          onBack={() => setStep(brief.goal_sales >= 10 ? 'products' : 'style')}
          busy={loading}
        />
      )}
      {step === 'generating' && <GeneratingStep targetPostCount={schedule.posts_count || 30} />}
      {step === 'review' && (
        <ReviewStep
          tc={tc}
          sessionId={sessionId}
          posts={posts}
          onReload={reloadPosts}
          onPublishAll={handlePublishAll}
          onBack={() => setStep('brief')}
          onDone={() => setStep('done')}
          leadMagnets={leadMagnets}
          sessionPalette={sessionPalette}
          onSwitchView={onSwitchView}
        />
      )}
      {step === 'done' && (
        <DoneStep
          count={doneCount}
          onGoToList={handleGoToList}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
