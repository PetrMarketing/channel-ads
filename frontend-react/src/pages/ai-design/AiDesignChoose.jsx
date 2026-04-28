const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const MAX_REGENS = 2;

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

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '4px 0 0', fontSize: '0.82rem', color: MUTED,
};

const animStyle = (i) => ({
  animation: `aidcFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

export default function AiDesignChoose({ avatars, descriptions, chosenAvatar, chosenDesc, regenCount, onSelectAvatar, onSelectDesc, onApply, onRegenerate, onBack, loading }) {
  const canApply = chosenAvatar !== null && chosenDesc !== null;
  const canRegen = (regenCount || 0) < MAX_REGENS;
  const remaining = MAX_REGENS - (regenCount || 0);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <style>{`
        @keyframes aidcFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .aidc-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${ACCENT}55 !important; }
        .aidc-ghost:hover { background: ${SOFT_BG} !important; border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; transform: translateY(-1px); }
        .aidc-avatar { transition: transform .2s ease, box-shadow .2s ease; }
        .aidc-avatar:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(0,0,0,0.12); }
        .aidc-desc:hover { border-color: ${ACCENT}40 !important; background: ${ACCENT}04 !important; }
      `}</style>

      <div style={{
        ...cardBase,
        padding: '28px 28px 26px',
        animation: 'aidcFadeUp 0.4s ease both',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          marginBottom: 22, gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={sectionTitleStyle}>Выберите аватарку</h2>
            <p style={sectionSubStyle}>ИИ сгенерировал {avatars.length} вариант{avatars.length === 1 ? '' : avatars.length < 5 ? 'а' : 'ов'} под вашу нишу</p>
          </div>
          {canRegen && (
            <button
              className="aidc-ghost"
              style={{ ...ghostBtn, padding: '8px 14px', fontSize: '0.8rem' }}
              onClick={onRegenerate}
              disabled={loading}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Перегенерировать ({remaining}/{MAX_REGENS})
            </button>
          )}
        </div>

        {avatars.length > 0 ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12,
            marginBottom: 32,
          }}>
            {avatars.map((url, i) => {
              const selected = chosenAvatar === i;
              return (
                <div
                  key={i}
                  className="aidc-avatar"
                  onClick={() => onSelectAvatar(i)}
                  style={{
                    cursor: 'pointer', position: 'relative',
                    borderRadius: 14, overflow: 'hidden',
                    background: '#fff',
                    boxShadow: selected ? `0 8px 24px ${ACCENT2}40` : '0 1px 3px rgba(0,0,0,0.06)',
                    ...animStyle(i),
                  }}
                >
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 14, padding: 3,
                    background: selected
                      ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`
                      : `1px solid ${BORDER}`,
                    pointerEvents: 'none', zIndex: 1,
                    ...(selected ? {} : { background: 'transparent', border: `1px solid ${BORDER}` }),
                  }} />
                  <img
                    src={url}
                    alt={`Вариант ${i + 1}`}
                    style={{
                      position: 'relative',
                      width: '100%', aspectRatio: '1/1', objectFit: 'cover',
                      display: 'block', borderRadius: 12,
                      transform: selected ? 'scale(0.94)' : 'scale(1)',
                      transition: 'transform .2s ease',
                    }}
                  />
                  {selected && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8, zIndex: 2,
                      width: 28, height: 28, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 4px 12px ${ACCENT}55`,
                      border: '2px solid #fff',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: 24, borderRadius: 12, marginBottom: 32,
            background: 'rgba(230,57,70,0.06)', border: `1px solid ${DANGER}25`,
            color: DANGER, fontSize: '0.86rem', textAlign: 'center',
          }}>
            Не удалось сгенерировать аватарки — попробуйте перегенерировать
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>Выберите описание</h2>
          <p style={sectionSubStyle}>Текст для шапки канала</p>
        </div>

        {descriptions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {descriptions.map((desc, i) => {
              const selected = chosenDesc === i;
              return (
                <div
                  key={i}
                  className="aidc-desc"
                  onClick={() => onSelectDesc(i)}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px 14px 18px',
                    borderRadius: 12,
                    border: `1px solid ${selected ? `${ACCENT}55` : BORDER}`,
                    background: selected ? `${ACCENT}06` : '#fff',
                    borderLeft: selected ? `3px solid ${ACCENT}` : `1px solid ${BORDER}`,
                    paddingLeft: selected ? 18 : 18,
                    fontSize: '0.9rem', lineHeight: 1.6, color: DARK,
                    position: 'relative',
                    transition: 'all .18s ease',
                    ...animStyle(i),
                  }}
                >
                  {desc}
                  {selected && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      width: 22, height: 22, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 3px 8px ${ACCENT}50`,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: 24, borderRadius: 12, marginBottom: 28,
            background: 'rgba(230,57,70,0.06)', border: `1px solid ${DANGER}25`,
            color: DANGER, fontSize: '0.86rem', textAlign: 'center',
          }}>
            Не удалось сгенерировать описания
          </div>
        )}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
          paddingTop: 22, borderTop: `1px solid ${BORDER}`,
        }}>
          <button className="aidc-ghost" style={ghostBtn} onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Назад
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canRegen && (
              <button
                className="aidc-ghost"
                style={ghostBtn}
                onClick={onRegenerate}
                disabled={loading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
                Перегенерировать ({remaining}/{MAX_REGENS})
              </button>
            )}
            <button
              className="aidc-primary"
              style={{ ...primaryBtn, opacity: (loading || !canApply) ? 0.55 : 1, cursor: (loading || !canApply) ? 'not-allowed' : 'pointer' }}
              onClick={onApply}
              disabled={loading || !canApply}
            >
              {loading ? 'Применение…' : 'Применить и продолжить'}
              {!loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
