import { useRef, useState } from 'react';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const STYLES = [
  { id: 'минимализм', label: 'Минимализм' },
  { id: 'мультяшный', label: 'Мультяшный' },
  { id: 'реалистично', label: 'Реалистично' },
];

const DEFAULT_COLORS = ['#7B68EE', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6'];

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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

export default function AiDesignSurvey({ survey, setSurvey, onSubmit, loading }) {
  const fileRef = useRef();
  const [pendingColor, setPendingColor] = useState('#7B68EE');
  const { niche, colors, photo, photoPreview, style, contactLink, description } = survey;

  const set = (key, val) => setSurvey(prev => ({ ...prev, [key]: val }));
  const removeColor = (idx) => set('colors', colors.filter((_, i) => i !== idx));
  const toggleColor = (c) => {
    if (colors.includes(c)) set('colors', colors.filter(x => x !== c));
    else set('colors', [...colors, c]);
  };
  const addPendingColor = () => {
    if (!pendingColor || colors.includes(pendingColor)) return;
    set('colors', [...colors, pendingColor]);
  };

  const handlePhoto = (e) => {
    const f = e.target.files?.[0];
    if (f) { set('photo', f); set('photoPreview', URL.createObjectURL(f)); }
  };
  const clearPhoto = () => { set('photo', null); set('photoPreview', null); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <style>{`
        @keyframes aidsFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .aids-input:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}15; }
        .aids-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${ACCENT}55 !important; }
        .aids-ghost:hover { background: ${SOFT_BG} !important; border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; transform: translateY(-1px); }
        .aids-style-pill {
          padding: 9px 16px; border-radius: 999px; cursor: pointer;
          border: 1px solid ${BORDER}; background: #fff;
          color: ${DARK}; font-size: 0.84rem; font-weight: 600;
          letter-spacing: -0.005em; transition: all .18s ease;
        }
        .aids-style-pill:hover { border-color: ${ACCENT}55; background: ${SOFT_BG}; }
        .aids-style-pill.active {
          color: #fff;
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          border-color: transparent;
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .aids-color-chip { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .aids-color-chip:hover { transform: scale(1.08); }
        .aids-upload {
          border: 1.5px dashed ${BORDER}; border-radius: 12;
          padding: 22px 18px; text-align: center; cursor: pointer;
          background: ${SOFT_BG};
          transition: all .18s ease;
        }
        .aids-upload:hover { border-color: ${ACCENT}; background: ${ACCENT}06; }
      `}</style>

      <div style={{
        ...cardBase,
        padding: '28px 28px 26px',
        animation: 'aidsFade 0.4s ease both',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionTitleStyle}>Расскажите о канале</h2>
          <p style={sectionSubStyle}>ИИ создаст оформление под вашу нишу</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <label style={labelStyle}>Сфера канала *</label>
            <input
              className="aids-input" style={inputStyle}
              value={niche} onChange={e => set('niche', e.target.value)}
              placeholder="фитнес, кулинария, IT, бизнес…"
            />
            <div style={hintStyle}>Опишите тематику одним-двумя словами</div>
          </div>

          <div>
            <label style={labelStyle}>Цвета бренда</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {DEFAULT_COLORS.map(c => {
                const active = colors.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className="aids-color-chip"
                    onClick={() => toggleColor(c)}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: c, cursor: 'pointer',
                      border: active ? `2px solid ${DARK}` : `1px solid ${BORDER}`,
                      boxShadow: active ? `0 0 0 3px ${c}30, 0 4px 10px ${c}55` : '0 1px 3px rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}
                    aria-label={c}
                  >
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 12, padding: '6px 6px 6px 8px', borderRadius: 999,
              background: SOFT_BG, border: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontSize: '0.78rem', color: MUTED, fontWeight: 500 }}>Свой цвет:</span>
              <label
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: pendingColor, cursor: 'pointer',
                  border: `1px solid rgba(0,0,0,0.08)`,
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
              <span style={{
                fontSize: '0.74rem', color: MUTED, fontFamily: 'ui-monospace, SF Mono, monospace',
                minWidth: 64, letterSpacing: '0.02em',
              }}>{pendingColor.toUpperCase()}</span>
              <button
                type="button"
                onClick={addPendingColor}
                disabled={colors.includes(pendingColor)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 999, border: 'none',
                  background: colors.includes(pendingColor)
                    ? `${BORDER}`
                    : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  color: colors.includes(pendingColor) ? MUTED : '#fff',
                  fontSize: '0.76rem', fontWeight: 600,
                  cursor: colors.includes(pendingColor) ? 'default' : 'pointer',
                  boxShadow: colors.includes(pendingColor) ? 'none' : `0 2px 8px ${ACCENT}40`,
                  transition: 'all .15s ease',
                }}
              >
                {colors.includes(pendingColor) ? 'Уже добавлен' : '+ Добавить'}
              </button>
            </div>
            {colors.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {colors.map((c, i) => (
                  <span
                    key={`sel-${i}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px 4px 6px', borderRadius: 999,
                      background: SOFT_BG, border: `1px solid ${BORDER}`,
                      fontSize: '0.74rem', color: MUTED, fontWeight: 500,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: `1px solid rgba(0,0,0,0.08)` }} />
                    {c.toUpperCase()}
                    {colors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColor(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: MUTED, padding: 0, marginLeft: 2, lineHeight: 1, fontSize: '0.95rem',
                        }}
                      >×</button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div style={hintStyle}>Выберите 1–3 цвета — они будут использованы в аватарках</div>
          </div>

          <div>
            <label style={labelStyle}>Фото (необязательно)</label>
            {photoPreview ? (
              <div style={{
                display: 'flex', gap: 14, alignItems: 'center',
                padding: 12, borderRadius: 12,
                background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}30`,
              }}>
                <img src={photoPreview} alt="" style={{
                  width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                  border: `1px solid ${BORDER}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                    {photo?.name || 'Загружено'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>
                    Будет использовано как референс
                  </div>
                </div>
                <button
                  type="button"
                  className="aids-ghost"
                  style={{ ...ghostBtn, padding: '6px 12px', fontSize: '0.8rem', color: DANGER, borderColor: 'rgba(230,57,70,0.25)' }}
                  onClick={clearPhoto}
                >
                  Убрать
                </button>
              </div>
            ) : (
              <div className="aids-upload" onClick={() => fileRef.current?.click()} style={{
                border: `1.5px dashed ${BORDER}`, borderRadius: 12,
                padding: '24px 18px', textAlign: 'center', cursor: 'pointer',
                background: SOFT_BG,
                transition: 'all .18s ease',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                  background: `linear-gradient(135deg, ${ACCENT}15 0%, ${ACCENT2}15 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ACCENT,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                  Нажмите, чтобы загрузить
                </div>
                <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 4 }}>
                  PNG, JPG до 10 МБ
                </div>
              </div>
            )}
            <input
              ref={fileRef} type="file" accept="image/*"
              onChange={handlePhoto}
              style={{ display: 'none' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Стиль</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STYLES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`aids-style-pill${style === s.id ? ' active' : ''}`}
                  onClick={() => set('style', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Ссылка для связи *</label>
            <input
              className="aids-input" style={inputStyle}
              value={contactLink} onChange={e => set('contactLink', e.target.value)}
              placeholder="https://t.me/username или @username"
            />
            <div style={hintStyle}>Куда писать заинтересованным подписчикам</div>
          </div>

          <div>
            <label style={labelStyle}>Дополнительные пожелания</label>
            <textarea
              className="aids-input" style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 90 }}
              rows={3}
              value={description} onChange={e => set('description', e.target.value)}
              placeholder="Любые пожелания к оформлению, стилистике, аватару…"
            />
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 26, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button
            className="aids-primary"
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? 'Генерация…' : 'Сгенерировать оформление'}
            {!loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
