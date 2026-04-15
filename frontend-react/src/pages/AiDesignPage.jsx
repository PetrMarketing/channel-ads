export default function AiDesignPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #7B68EE, #4F46E5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z"/>
            <circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>
            <path d="M10 17h4"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 12 }}>ИИ Оформление</h2>
        <span style={{
          display: 'inline-block', padding: '4px 16px', borderRadius: 20,
          background: 'linear-gradient(135deg, #7B68EE, #4F46E5)', color: '#fff',
          fontWeight: 700, fontSize: '0.85rem', marginBottom: 20,
        }}>Скоро</span>
        <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          От генерации Аватарки, Описания и поста-закрепа до готового контент-плана на месяц и его публикация — скоро на MAX Маркетинг
        </p>
      </div>
    </div>
  );
}
