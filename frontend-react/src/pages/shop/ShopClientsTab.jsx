export default function ShopClientsTab({ clients }) {
  const visited = clients.filter(c => c.stage === 'visited').length;
  const cart = clients.filter(c => c.stage === 'cart').length;
  const ordered = clients.filter(c => c.stage === 'ordered').length;
  const paid = clients.filter(c => c.stage === 'paid').length;

  const columns = [
    { label: 'Посетили', count: visited || clients.length || 0, color: '#6366F1' },
    { label: 'Корзина', count: cart, color: '#F59E0B' },
    { label: 'Заказ', count: ordered, color: '#3B82F6' },
    { label: 'Оплатили', count: paid, color: '#10B981' },
  ];

  return (
    <div className="pc-section">
      <h2 style={{ marginBottom: 16 }}>Воронка клиентов</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {columns.map(col => (
          <div key={col.label} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '24px 16px', textAlign: 'center',
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: col.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', fontWeight: 700,
              margin: '0 auto 12px',
            }}>
              {col.count}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {col.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
