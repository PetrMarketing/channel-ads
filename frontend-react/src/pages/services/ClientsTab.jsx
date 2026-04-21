import { useState } from 'react';
import { STATUS_COLORS, STATUS_LABELS } from './constants';
import ClientDialog from '../../components/ClientDialog';

const thS = { padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' };
const tdS = { padding: '8px 12px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' };

export default function ClientsTab({
  clients, clientSearch, setClientSearch, loadClients,
  selectedClient, setSelectedClient,
  clientBookings, setClientBookings, loadClientBookings,
}) {
  const [statusFilter, setStatusFilter] = useState(null);

  // Подсчёт статистики
  const totalClients = clients.length;
  const totalBookings = clients.reduce((s, c) => s + (c.total_bookings || 0), 0);
  const activeClients = clients.filter(c => {
    if (!c.last_booking) return false;
    const d = new Date(c.last_booking);
    const daysAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo < 30;
  }).length;

  const columns = [
    { key: null, label: 'Все', count: totalClients, color: '#8B5CF6' },
    { key: 'active', label: 'Активные (30д)', count: activeClients, color: '#10B981' },
    { key: 'bookings', label: 'Всего записей', count: totalBookings, color: '#3B82F6' },
  ];

  const filteredClients = clients.filter(c => {
    if (!statusFilter) return true;
    if (statusFilter === 'active') {
      if (!c.last_booking) return false;
      return (Date.now() - new Date(c.last_booking).getTime()) / (1000 * 60 * 60 * 24) < 30;
    }
    return true;
  });

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="pc-section">
      {/* Воронка / статистика */}
      <h2 style={{ marginBottom: 16 }}>Клиенты</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        {columns.map(col => (
          <div key={col.label} onClick={() => setStatusFilter(col.key)} style={{
            background: statusFilter === col.key ? `${col.color}15` : 'var(--bg-glass)',
            border: statusFilter === col.key ? `2px solid ${col.color}` : '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 10px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: col.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', fontWeight: 700, margin: '0 auto 6px',
            }}>{col.count}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 500, color: statusFilter === col.key ? col.color : 'var(--text-secondary)' }}>{col.label}</div>
          </div>
        ))}
      </div>

      {/* Поиск */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="form-input" style={{ maxWidth: 300 }} placeholder="Поиск по имени или телефону..."
          value={clientSearch} onChange={e => setClientSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadClients(); }} />
        <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={loadClients}>Найти</button>
      </div>

      {filteredClients.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Клиентов пока нет. Они появятся после первой записи.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Таблица */}
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={thS}>Клиент</th>
                    <th style={thS}>Записей</th>
                    <th style={thS}>Последний визит</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c, i) => (
                    <tr key={i} onClick={() => { setSelectedClient(c); loadClientBookings(c); }}
                      style={{ cursor: 'pointer', background: selectedClient === c ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
                      <td style={tdS}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%', background: '#4F46E5', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                          }}>{(c.client_name || 'К')[0].toUpperCase()}</div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{c.client_name || 'Без имени'}</div>
                            {c.client_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.client_phone}</div>}
                            {c.client_email && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.client_email}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={tdS}>{c.total_bookings}</td>
                      <td style={{ ...tdS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{fmtDate(c.last_booking)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Детали клиента */}
          {selectedClient && (
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: '#4F46E5', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem',
                    }}>{(selectedClient.client_name || 'К')[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selectedClient.client_name || 'Без имени'}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {selectedClient.client_phone || ''}{selectedClient.client_email ? ` · ${selectedClient.client_email}` : ''}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedClient(null); setClientBookings([]); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>&times;</button>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, padding: '10px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4F46E5' }}>{selectedClient.total_bookings}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Записей</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{fmtDate(selectedClient.last_booking)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Последний визит</div>
                  </div>
                </div>

                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>История записей</h4>
                {clientBookings.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Нет записей</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clientBookings.map(b => (
                      <div key={b.id} style={{
                        padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
                        borderLeft: `4px solid ${STATUS_COLORS[b.status] || '#888'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                            {b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU') : '—'}
                            {' '}{b.start_time?.slice(0,5)} – {b.end_time?.slice(0,5)}
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
                            background: `${STATUS_COLORS[b.status] || '#888'}20`, color: STATUS_COLORS[b.status] || '#888',
                          }}>{STATUS_LABELS[b.status] || b.status}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{b.service_name || '—'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {b.specialist_name || ''}{b.branch_name ? ` · ${b.branch_name}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <ClientDialog identifier={selectedClient.client_phone || selectedClient.client_name} phone={selectedClient.client_phone} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
