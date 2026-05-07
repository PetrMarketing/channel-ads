/**
 * Универсальная мини-модалка генерации текста или картинки для одного поста.
 * mode: 'text' | 'image'
 * onSuccess: текст → (text); картинка → (imageUrl)
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useToast } from './Toast';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function plurGen(n) {
  const last = n % 10;
  const teen = n % 100;
  if (teen >= 11 && teen <= 14) return 'генераций';
  if (last === 1) return 'генерация';
  if (last >= 2 && last <= 4) return 'генерации';
  return 'генераций';
}

export default function AiPostGenModal({ isOpen, onClose, mode = 'text', tc, onSuccess }) {
  const { showToast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [useStyle, setUseStyle] = useState(true);
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('1:1');
  const [busy, setBusy] = useState(false);
  const [skill, setSkill] = useState({ current_cost: mode === 'text' ? 10 : 10, next_cost: null, period_count: 0, next_threshold: null, is_max: false });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setPrompt(''); setDescription(''); setFile(null); setBusy(false);
      return;
    }
    let cancelled = false;
    api.get(`/channels/${tc}/levels`).then(d => {
      if (cancelled || !d?.success) return;
      const sk = (d.skills || []).find(s => s.skill === (mode === 'image' ? 'image' : 'text'));
      if (sk) setSkill(sk);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, tc, mode]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      showToast('Файл больше 20 МБ', 'error');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    const p = prompt.trim();
    if (!p) {
      showToast('Введите промт', 'error');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'text') {
        const fd = new FormData();
        fd.append('prompt', p);
        if (description.trim()) fd.append('description', description.trim());
        fd.append('use_channel_style', useStyle ? 'true' : 'false');
        if (file) fd.append('file', file);
        const res = await api.upload(`/ai-post/${tc}/generate-text`, fd, 'POST');
        if (!res?.success) throw new Error(res?.error || 'Ошибка генерации');
        showToast(`Текст готов (-${res.tokens_charged} ИИт)`, 'success');
        onSuccess && onSuccess(res.message_text);
        onClose && onClose();
      } else {
        const res = await api.post(`/ai-post/${tc}/generate-image`, { prompt: p, format });
        if (!res?.success) throw new Error(res?.error || 'Ошибка генерации');
        showToast(`Картинка готова (-${res.tokens_charged} ИИт)`, 'success');
        onSuccess && onSuccess(res.image_url);
        onClose && onClose();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;
  const isImage = mode === 'image';
  const remaining = !skill.is_max && skill.next_threshold != null
    ? Math.max(0, skill.next_threshold - skill.period_count)
    : null;

  const node = (
    <div onClick={() => !busy && onClose && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(26, 26, 46, 0.55)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, animation: 'apFade 0.25s ease',
    }}>
      <style>{`
        @keyframes apFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes apPop { from { transform: scale(0.92) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        width: 'min(560px, 100%)',
        maxHeight: '92vh', overflowY: 'auto',
        background: '#fff', borderRadius: 18,
        padding: '22px 22px 18px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
        animation: 'apPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <button onClick={() => !busy && onClose && onClose()} aria-label="Закрыть" style={{
          position: 'absolute', top: 14, right: 14,
          width: 30, height: 30, borderRadius: 8,
          background: '#f5f5f5', border: 'none', cursor: 'pointer',
          fontSize: '1.2rem', color: MUTED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '1.2rem',
          }}>{isImage ? '🖼' : '🪄'}</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
              {isImage ? 'Сгенерировать ИИ-картинку' : 'Сгенерировать текст поста'}
            </h2>
            <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 2 }}>
              Цена: <b style={{ color: ACCENT2 }}>{skill.current_cost} ИИ-токенов</b>
              {!skill.is_max && skill.next_cost != null && (
                <span style={{ marginLeft: 6, color: SUCCESS, fontWeight: 600 }}>
                  → {skill.next_cost} на следующем уровне
                  {remaining != null && (
                    <span style={{ color: MUTED, fontWeight: 500, marginLeft: 4 }}>
                      ({remaining} {plurGen(remaining)} до следующего уровня)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Промт *</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={isImage
                ? 'Например: молодая женщина-предприниматель работает за ноутбуком в светлой кофейне, утренний свет'
                : 'Например: пост-анонс новой услуги уборки квартир с УТП и призывом записаться'
              }
              style={inputStyle}
            />
          </div>

          {!isImage && (
            <>
              <div>
                <label style={labelStyle}>Доп. пожелания (опц.)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Тон, длина, что обязательно упомянуть…"
                  style={inputStyle}
                />
              </div>

              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${useStyle ? `${ACCENT}40` : BORDER}`,
                background: useStyle ? `${ACCENT}06` : '#fff',
              }}>
                <input
                  type="checkbox" checked={useStyle}
                  onChange={e => setUseStyle(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: ACCENT }}
                />
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: DARK }}>
                    Подражать стилю прошлых постов
                  </div>
                  <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>
                    Возьмём 20 последних опубликованных постов как образец стиля.
                  </div>
                </div>
              </label>

              <div>
                <label style={labelStyle}>Файл-контекст (опц., до 20 МБ)</label>
                <input
                  ref={fileRef}
                  type="file"
                  onChange={handleFile}
                  style={{ ...inputStyle, padding: 8 }}
                />
                {file && (
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 8 }}>
                    📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} МБ)
                    <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                      style={{ background: 'none', border: 'none', color: DANGER, cursor: 'pointer', fontWeight: 700 }}>✕</button>
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 4 }}>
                  Текст из .txt/.md/.csv/.json подгружается как контекст. Бинарные файлы — только название.
                </div>
              </div>
            </>
          )}

          {isImage && (
            <div>
              <label style={labelStyle}>Формат</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['1:1', '4:3', '3:4'].map(f => {
                  const active = format === f;
                  return (
                    <button key={f} type="button" onClick={() => setFormat(f)} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                      border: active ? 'none' : `1.5px solid ${BORDER}`,
                      background: active ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : '#fff',
                      color: active ? '#fff' : DARK,
                      fontSize: '0.86rem', fontWeight: 700,
                      boxShadow: active ? `0 3px 10px ${ACCENT}30` : 'none',
                    }}>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 18, paddingTop: 14, borderTop: `1px solid ${BORDER}`,
        }}>
          <button onClick={() => !busy && onClose && onClose()} disabled={busy} style={{
            padding: '10px 16px', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer',
            background: '#fff', border: `1px solid ${BORDER}`, color: DARK,
            fontSize: '0.86rem', fontWeight: 600,
          }}>Отмена</button>
          <button onClick={submit} disabled={busy || !prompt.trim()} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            cursor: busy || !prompt.trim() ? 'not-allowed' : 'pointer',
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            color: '#fff', fontSize: '0.88rem', fontWeight: 700,
            boxShadow: `0 4px 14px ${ACCENT}40`,
            opacity: busy || !prompt.trim() ? 0.6 : 1,
          }}>
            {busy ? 'Генерируем…' : `Сгенерировать (${skill.current_cost} ИИт)`}
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

const labelStyle = {
  display: 'block', fontSize: '0.82rem', fontWeight: 600,
  color: DARK, marginBottom: 6, letterSpacing: '-0.005em',
};
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.88rem', color: DARK,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', resize: 'vertical',
};
