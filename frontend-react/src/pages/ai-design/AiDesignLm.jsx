import { useRef } from 'react';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
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
  color: DARK, fontSize: '0.86rem', fontWeight: 500,
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

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '4px 0 0', fontSize: '0.82rem', color: MUTED,
};

const animStyle = (i) => ({
  animation: `aidlFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

const lmStyleBlock = (
  <style>{`
    @keyframes aidlFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .aidl-input:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}15; }
    .aidl-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${ACCENT}55 !important; }
    .aidl-ghost:hover { background: ${SOFT_BG} !important; border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; transform: translateY(-1px); }
    .aidl-mode-card {
      flex: 1; min-width: 240px;
      padding: 16px; border-radius: 14px; cursor: pointer;
      border: 1.5px solid ${BORDER}; background: #fff;
      transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
      display: flex; flex-direction: column; gap: 10px;
    }
    .aidl-mode-card:hover { border-color: ${ACCENT}55; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
    .aidl-upload {
      border: 1.5px dashed ${BORDER}; border-radius: 12px;
      padding: 22px 16px; text-align: center; cursor: pointer;
      background: ${SOFT_BG}; transition: all .18s ease;
    }
    .aidl-upload:hover { border-color: ${ACCENT}; background: ${ACCENT}06; }
    .aidl-idea { transition: all .18s ease; }
    .aidl-idea:hover { border-color: ${ACCENT}40 !important; background: ${ACCENT}04 !important; }
  `}</style>
);

export function LmSurvey({ lmPdf, lmPdfUploaded, lmUploading, lmWishes, setLmWishes, onUploadPdf, onSubmit, onSkip, loading }) {
  const lmFileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) onUploadPdf(f);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {lmStyleBlock}
      <div style={{
        ...cardBase,
        padding: '28px 28px 26px',
        animation: 'aidlFadeUp 0.4s ease both',
      }}>
        <div style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>Лид-магнит</h2>
          <p style={sectionSubStyle}>Подарок для подписчиков (PDF/файл) или ИИ создаст с нуля</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Загрузить готовый файл</label>
            {lmPdf ? (
              <div style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: 14, borderRadius: 12,
                background: lmPdfUploaded ? `${SUCCESS}08` : SOFT_BG,
                border: `1px solid ${lmPdfUploaded ? `${SUCCESS}30` : BORDER}`,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: lmPdfUploaded
                    ? `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`
                    : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                  boxShadow: lmPdfUploaded ? `0 4px 12px ${SUCCESS}40` : `0 4px 12px ${ACCENT}40`,
                }}>
                  {lmPdfUploaded ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lmPdf.name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>
                    {lmUploading ? 'Загружается…' : lmPdfUploaded ? 'Загружено' : 'Готово к загрузке'}
                    {lmPdf.size && ` · ${(lmPdf.size / 1024).toFixed(0)} КБ`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="aidl-upload" onClick={() => lmFileRef.current?.click()}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                  background: `linear-gradient(135deg, ${ACCENT}15 0%, ${ACCENT2}15 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ACCENT,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>
                  </svg>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.005em' }}>
                  Загрузите PDF или DOC
                </div>
                <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 4 }}>
                  ИИ использует файл как референс
                </div>
              </div>
            )}
            <input
              ref={lmFileRef} type="file" accept=".pdf,.doc,.docx,.txt"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ position: 'relative', textAlign: 'center', margin: '4px 0' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: BORDER }} />
            <span style={{
              position: 'relative', display: 'inline-block',
              padding: '0 12px', background: '#fff',
              fontSize: '0.74rem', color: MUTED, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>или</span>
          </div>

          <div>
            <label style={labelStyle}>Сгенерировать с нуля — пожелания</label>
            <textarea
              className="aidl-input" style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 100 }}
              rows={4}
              value={lmWishes}
              onChange={e => setLmWishes(e.target.value)}
              placeholder="Какой подарок вы хотите предложить подписчикам? Тематика, формат, объём…"
            />
            <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
              Можно оставить пустым — ИИ сам подберёт варианты под вашу нишу
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
          marginTop: 26, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aidl-ghost" style={ghostBtn} onClick={onSkip}>
            Пропустить
          </button>
          <button
            className="aidl-primary"
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? 'Генерация…' : 'Сгенерировать идеи'}
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

export function LmChooseIdea({ ideas, chosenIdea, onChoose, loading }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {lmStyleBlock}
      <div style={{
        ...cardBase,
        padding: '28px 28px 26px',
        animation: 'aidlFadeUp 0.4s ease both',
      }}>
        <div style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>Выберите идею лид-магнита</h2>
          <p style={sectionSubStyle}>ИИ предложил варианты — выберите тот, что подходит</p>
        </div>

        {ideas.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ideas.map((idea, i) => {
              const selected = chosenIdea === i;
              const fading = loading && chosenIdea !== i;
              return (
                <div
                  key={i}
                  className="aidl-idea"
                  onClick={() => !loading && onChoose(i)}
                  style={{
                    cursor: loading ? 'wait' : 'pointer',
                    padding: '16px 18px',
                    borderRadius: 12,
                    border: `1px solid ${selected ? `${ACCENT}55` : BORDER}`,
                    background: selected ? `${ACCENT}06` : '#fff',
                    borderLeft: selected ? `3px solid ${ACCENT}` : `1px solid ${BORDER}`,
                    paddingLeft: 18,
                    opacity: fading ? 0.45 : 1,
                    position: 'relative',
                    ...animStyle(i),
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: selected
                        ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`
                        : `linear-gradient(135deg, ${ACCENT}15 0%, ${ACCENT2}15 100%)`,
                      color: selected ? '#fff' : ACCENT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.92rem',
                      boxShadow: selected ? `0 4px 12px ${ACCENT}40` : 'none',
                      transition: 'all .18s ease',
                      letterSpacing: '-0.02em',
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: '0.95rem', color: DARK,
                        letterSpacing: '-0.01em', marginBottom: 4,
                      }}>
                        {idea.title}
                      </div>
                      <div style={{
                        fontSize: '0.86rem', color: MUTED, lineHeight: 1.55,
                      }}>
                        {idea.description}
                      </div>
                    </div>
                    {selected && (
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 3px 8px ${ACCENT}50`,
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: 24, borderRadius: 12,
            background: 'rgba(230,57,70,0.06)', border: `1px solid ${DANGER}25`,
            color: DANGER, fontSize: '0.86rem', textAlign: 'center',
          }}>
            Не удалось получить варианты идей
          </div>
        )}
      </div>
    </div>
  );
}

export function LmPreview({ lmContent, lmPostText, lmBannerUrl, onInstall, loading }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {lmStyleBlock}
      <div style={{
        ...cardBase,
        padding: '28px 28px 26px',
        animation: 'aidlFadeUp 0.4s ease both',
      }}>
        <div style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>Превью лид-магнита</h2>
          <p style={sectionSubStyle}>Проверьте материалы перед установкой</p>
        </div>

        {lmBannerUrl && (
          <div style={{
            marginBottom: 20, borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${BORDER}`, position: 'relative',
            ...animStyle(0),
          }}>
            <img src={lmBannerUrl} alt="Баннер" style={{
              width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block',
            }} />
            <div style={{
              position: 'absolute', top: 12, left: 12,
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(6px)',
              fontSize: '0.7rem', fontWeight: 700, color: DARK, letterSpacing: '-0.005em',
              border: `1px solid ${BORDER}`,
            }}>
              Баннер 16:9
            </div>
          </div>
        )}

        <div style={{ marginBottom: 18, ...animStyle(1) }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: `0 3px 8px ${ACCENT}40`,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5"/>
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
              </svg>
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
              Пост-закреп
            </h3>
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: SOFT_BG, border: `1px solid ${BORDER}`,
            fontSize: '0.9rem', lineHeight: 1.6, color: DARK,
            whiteSpace: 'pre-wrap',
          }}>
            {lmPostText || '—'}
          </div>
        </div>

        <div style={{ marginBottom: 6, ...animStyle(2) }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: `0 3px 8px ${SUCCESS}40`,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="4" rx="1"/>
                <path d="M12 8v13"/>
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
              </svg>
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
              Контент лид-магнита
            </h3>
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: SOFT_BG, border: `1px solid ${BORDER}`,
            fontSize: '0.86rem', lineHeight: 1.6, color: DARK,
            whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto',
          }}>
            {lmContent || '—'}
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
          marginTop: 26, paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button
            className="aidl-primary"
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}
            onClick={onInstall}
            disabled={loading}
          >
            {loading ? 'Установка…' : 'Установить лид-магнит'}
            {!loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
