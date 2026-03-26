import { STATUS_COLORS, STATUS_LABELS } from './constants';

export default function ClientsTab({
  clients, clientSearch, setClientSearch, loadClients,
  selectedClient, setSelectedClient,
  clientBookings, setClientBookings, loadClientBookings,
}) {
  return (
    <div className="pc-section">
      <h2>Клиенты</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" style={{ maxWidth: 300 }} placeholder="Поиск по имени или телефону..."
          value={clientSearch} onChange={e => setClientSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadClients(); }} />
        <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={loadClients}>Найти</button>
      </div>
      {clients.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет клиентов.</p>}

      {!selectedClient ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clients.map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }} onClick={() => { setSelectedClient(c); loadClientBookings(c); }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', background: '#4F46E5', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
              }}>
                {(c.client_name || 'К')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{c.client_name || 'Без имени'}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {c.client_phone || ''}
                  {c.client_email ? ` · ${c.client_email}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <div>{c.total_bookings} {c.total_bookings === 1 ? 'запись' : 'записей'}</div>
                {c.last_booking && <div style={{ fontSize: '0.75rem' }}>Посл.: {new Date(c.last_booking).toLocaleDateString('ru-RU')}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <button className="back-btn" style={{ background: 'none', border: 'none', fontSize: '0.9rem', color: 'var(--primary, #2AABEE)', cursor: 'pointer', padding: '8px 0', fontWeight: 500, marginBottom: 12 }}
            onClick={() => { setSelectedClient(null); setClientBookings([]); }}>
            &larr; Назад к списку
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px', marginBottom: 16,
            background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: '#4F46E5', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem',
            }}>
              {(selectedClient.client_name || 'К')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{selectedClient.client_name || 'Без имени'}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedClient.client_phone || ''}
                {selectedClient.client_email ? ` · ${selectedClient.client_email}` : ''}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Всего записей: {selectedClient.total_bookings}
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>История записей</h3>
          {clientBookings.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Нет записей.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientBookings.map(b => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                borderLeft: `4px solid ${STATUS_COLORS[b.status] || '#888'}`,
              }}>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU') : ''}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{b.start_time?.slice(0,5)} – {b.end_time?.slice(0,5)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{b.service_name || '—'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.specialist_name || ''} {b.branch_name ? `· ${b.branch_name}` : ''}</div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                  background: `${STATUS_COLORS[b.status] || '#888'}20`, color: STATUS_COLORS[b.status] || '#888',
                }}>
                  {STATUS_LABELS[b.status] || b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
