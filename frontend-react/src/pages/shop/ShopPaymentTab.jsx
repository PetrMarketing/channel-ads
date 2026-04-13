export default function ShopPaymentTab() {
  return (
    <div className="pc-section">
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '24px', textAlign: 'center',
      }}>
        <p style={{ fontSize: '1rem', marginBottom: 12 }}>
          Настройки оплаты берутся из раздела Платные чаты
        </p>
        <a href="/paid-chats" className="btn btn-primary" style={{ display: 'inline-block' }}>
          Перейти в Платные чаты
        </a>
      </div>
    </div>
  );
}
