/**
 * Финальный дашборд — результаты ИИ оформления: аватар, описание, лид-магнит, пост-закреп.
 */
export default function AiDesignDone({ avatars, chosenAvatar, descriptions, chosenDesc, lmContent, lmPostText, lmBannerUrl, onChangeAvatar, onReset, navigate, showToast }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px' }}>
      {/* Заголовок */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Ваше оформление готово!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Аватар, описание и лид-магнит установлены</p>
      </div>

      {/* Аватарки — выбранная выделена зелёным, можно перевыбрать */}
      {avatars.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Аватарка</h3>
            <button className="btn" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={onChangeAvatar}>Изменить</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {avatars.map((url, i) => (
              <div key={i} style={{
                borderRadius: 10, overflow: 'hidden',
                border: chosenAvatar === i ? '3px solid #10B981' : '2px solid var(--border)',
                opacity: chosenAvatar === i ? 1 : 0.5,
              }}>
                <img src={url} alt={`${i+1}`} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Описание канала с кнопкой копирования */}
      {chosenDesc !== null && descriptions[chosenDesc] && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Описание канала</h3>
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-glass)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
            {descriptions[chosenDesc]}
          </div>
          <button className="btn" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            onClick={() => { navigator.clipboard.writeText(descriptions[chosenDesc]); showToast('Скопировано!', 'success'); }}>
            Копировать описание
          </button>
        </div>
      )}

      {/* Лид-магнит */}
      {lmContent && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Лид-магнит</h3>
            <button className="btn" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => navigate('/pins')}>Все лид-магниты</button>
          </div>
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-glass)', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            maxHeight: 200, overflowY: 'auto' }}>
            {lmContent}
          </div>
        </div>
      )}

      {/* Пост-закреп с баннером */}
      {lmPostText && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Пост-закреп</h3>
            <button className="btn" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => navigate('/pins')}>Все закрепленные посты</button>
          </div>
          {lmBannerUrl && (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 10 }}>
              <img src={lmBannerUrl} alt="Баннер" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-glass)', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {lmPostText}
          </div>
        </div>
      )}

      {/* Кнопка новой сессии */}
      <button className="btn btn-primary" onClick={onReset} style={{ width: '100%', padding: '10px' }}>
        Новая сессия
      </button>
    </div>
  );
}
