/**
 * Компонент выбора аватарки и описания — сетка 3x3 + 3 варианта описаний + перегенерация.
 */
const MAX_REGENS = 2;

export default function AiDesignChoose({ avatars, descriptions, chosenAvatar, chosenDesc, regenCount, onSelectAvatar, onSelectDesc, onApply, onRegenerate, onBack, loading }) {
  const canApply = chosenAvatar !== null && chosenDesc !== null;
  const canRegen = (regenCount || 0) < MAX_REGENS;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px' }}>
      {/* Заголовок с кнопкой назад */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Выберите оформление</h2>
        <button className="btn" onClick={onBack} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Назад</button>
      </div>

      {/* Сетка аватарок */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Аватарка</h3>
          {canRegen && (
            <button className="btn" onClick={onRegenerate} disabled={loading}
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
              {loading ? 'Генерация...' : `Перегенерировать (${MAX_REGENS - (regenCount || 0)} осталось)`}
            </button>
          )}
        </div>
        {avatars.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {avatars.map((url, i) => (
              <div key={i} onClick={() => onSelectAvatar(i)} style={{
                cursor: 'pointer', borderRadius: 12, overflow: 'hidden',
                border: chosenAvatar === i ? '3px solid #7B68EE' : '2px solid var(--border)',
                transition: 'all 0.2s', transform: chosenAvatar === i ? 'scale(1.03)' : 'scale(1)',
              }}><img src={url} alt={`${i+1}`} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} /></div>
            ))}
          </div>
        ) : <p style={{ color: 'var(--error, #e63946)' }}>Не удалось сгенерировать аватарки.</p>}
      </div>

      {/* Варианты описаний */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Описание канала</h3>
        {descriptions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {descriptions.map((desc, i) => (
              <div key={i} onClick={() => onSelectDesc(i)} style={{
                cursor: 'pointer', padding: '14px 18px', borderRadius: 12,
                border: chosenDesc === i ? '2px solid #7B68EE' : '1px solid var(--border)',
                background: chosenDesc === i ? 'rgba(123,104,238,0.08)' : 'var(--bg-glass)',
                transition: 'all 0.2s', lineHeight: 1.6, fontSize: '0.9rem',
              }}>{desc}</div>
            ))}
          </div>
        ) : <p style={{ color: 'var(--error, #e63946)' }}>Не удалось сгенерировать описания.</p>}
      </div>

      {/* Превью выбранного + кнопка применения */}
      {canApply && (
        <div style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(123,104,238,0.3)',
          background: 'rgba(123,104,238,0.05)', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <img src={avatars[chosenAvatar]} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: '2px solid #7B68EE' }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{descriptions[chosenDesc]}</div>
        </div>
      )}

      <button className="btn btn-primary" onClick={onApply} disabled={loading || !canApply}
        style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
        {loading ? 'Применение...' : 'Применить и продолжить'}
      </button>
    </div>
  );
}
