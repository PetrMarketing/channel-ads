const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
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
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.82rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.05rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};

const animStyle = (i) => ({
  animation: `aiddFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
});

const TRANSPARENT_BORDER = `1px solid ${BORDER}`;

function ActionCard({ from, to, icon, title, subtitle, onClick }) {
  return (
    <div
      className="aidd-action"
      onClick={onClick}
      style={{
        ...cardBase,
        padding: 16,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        flex: '1 1 200px',
        minWidth: 0,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        boxShadow: `0 4px 12px ${from}40`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.25), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <span style={{ position: 'relative', display: 'inline-flex', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: DARK, letterSpacing: '-0.005em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        )}
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </div>
  );
}

export default function AiDesignDone({ avatars, chosenAvatar, descriptions, chosenDesc, lmContent, lmPostText, lmBannerUrl, onChangeAvatar, onReset, navigate, showToast }) {
  const avatarUrl = chosenAvatar !== null ? avatars[chosenAvatar] : null;
  const description = chosenDesc !== null ? descriptions[chosenDesc] : null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <style>{`
        @keyframes aiddFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aiddPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes aiddPop { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        .aidd-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .aidd-ghost:hover { background: ${SOFT_BG} !important; border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; transform: translateY(-1px); }
        .aidd-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${ACCENT}55 !important; }
      `}</style>

      <div style={{
        ...cardBase,
        padding: '40px 28px 36px',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        animation: 'aiddFadeUp 0.4s ease both',
        marginBottom: 22,
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: -90, right: -60, width: 240, height: 240,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${SUCCESS}1c 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -100, left: -70, width: 260, height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}14 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div aria-hidden style={{
          position: 'relative', width: 96, height: 96, margin: '0 auto 22px',
        }}>
          <div style={{
            position: 'absolute', inset: -14, borderRadius: '50%',
            background: `radial-gradient(circle, ${SUCCESS}38 0%, transparent 70%)`,
            animation: 'aiddPulse 3s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 14px 36px ${SUCCESS}55`,
            animation: 'aiddPop 0.6s ease-out both',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </div>
        </div>

        <h1 style={{
          position: 'relative',
          fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em',
          color: DARK, margin: '0 0 8px', lineHeight: 1.15,
        }}>
          Оформление готово!
        </h1>
        <p style={{
          position: 'relative',
          fontSize: '0.92rem', color: MUTED, margin: '0 auto',
          maxWidth: 440, lineHeight: 1.55,
        }}>
          Аватар, описание и лид-магнит установлены в ваш канал
        </p>
      </div>

      <div style={{
        ...cardBase,
        padding: 22, marginBottom: 22,
        ...animStyle(1),
      }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{
              width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
              border: `3px solid ${SUCCESS}`,
              boxShadow: `0 4px 14px ${SUCCESS}30`, flexShrink: 0,
            }} />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${ACCENT2} 0%, #a855f7 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '1.4rem',
              boxShadow: `0 4px 14px ${ACCENT2}40`,
            }}>?</div>
          )}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              marginBottom: 10,
            }}>
              <h3 style={sectionTitleStyle}>Аватар и описание</h3>
              <button className="aidd-ghost" style={ghostBtn} onClick={onChangeAvatar}>
                Изменить
              </button>
            </div>
            {description ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: SOFT_BG, border: TRANSPARENT_BORDER,
                fontSize: '0.88rem', lineHeight: 1.6, color: DARK,
              }}>
                {description}
              </div>
            ) : (
              <div style={{ fontSize: '0.84rem', color: MUTED }}>Описание не выбрано</div>
            )}
            {description && (
              <button
                className="aidd-ghost"
                style={{ ...ghostBtn, marginTop: 10, fontSize: '0.78rem' }}
                onClick={() => { navigator.clipboard.writeText(description); showToast('Описание скопировано', 'success'); }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Копировать
              </button>
            )}
          </div>
        </div>
      </div>

      {(lmPostText || lmContent || lmBannerUrl) && (
        <div style={{
          ...cardBase,
          padding: 22, marginBottom: 22,
          ...animStyle(2),
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: `0 4px 12px ${SUCCESS}40`,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="8" width="18" height="4" rx="1"/>
                  <path d="M12 8v13"/>
                  <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
                </svg>
              </div>
              <h3 style={sectionTitleStyle}>Лид-магнит и закреп</h3>
            </div>
            <button className="aidd-ghost" style={ghostBtn} onClick={() => navigate('/pins')}>
              Все закрепы
            </button>
          </div>

          {lmBannerUrl && (
            <div style={{
              borderRadius: 12, overflow: 'hidden',
              border: TRANSPARENT_BORDER, marginBottom: 12,
            }}>
              <img src={lmBannerUrl} alt="Баннер" style={{
                width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block',
              }} />
            </div>
          )}

          {lmPostText && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: SOFT_BG, border: TRANSPARENT_BORDER,
              fontSize: '0.88rem', lineHeight: 1.6, color: DARK,
              whiteSpace: 'pre-wrap', marginBottom: lmContent ? 10 : 0,
            }}>
              {lmPostText}
            </div>
          )}

          {lmContent && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: SOFT_BG, border: TRANSPARENT_BORDER,
              fontSize: '0.84rem', lineHeight: 1.6, color: MUTED,
              whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto',
            }}>
              {lmContent}
            </div>
          )}
        </div>
      )}

      <div style={{ ...animStyle(3), marginBottom: 6 }}>
        <h3 style={{ ...sectionTitleStyle, marginBottom: 12 }}>Что дальше</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ActionCard
            from="#3b82f6" to="#06b6d4"
            title="Перейти на канал"
            subtitle="Посмотреть результат"
            onClick={() => navigate('/dashboard')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 8.5v7a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 15.5v-7A4.5 4.5 0 0 1 6.5 4h11A4.5 4.5 0 0 1 22 8.5Z"/>
                <path d="m10 9 5 3-5 3z"/>
              </svg>
            }
          />
          <ActionCard
            from={ACCENT} to={ACCENT2}
            title="Создать ссылки"
            subtitle="Трекинг с UTM-метками"
            onClick={() => navigate('/links')}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            }
          />
          <ActionCard
            from={WARNING} to="#f97316"
            title="Новая сессия"
            subtitle="Сгенерировать заново"
            onClick={onReset}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}
