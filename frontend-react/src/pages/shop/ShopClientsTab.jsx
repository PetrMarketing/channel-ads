import { useState } from 'react';
import { api } from '../../services/api';
import { useChannels } from '../../contexts/ChannelContext';
import ClientDialog from '../../components/ClientDialog';

const thS = { padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' };
const tdS = { padding: '8px 12px', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' };

export default function ShopClientsTab({ clients, funnel, visitors, carts }) {
  const { currentChannel } = useChannels();
  const tc = currentChannel?.tracking_code;
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [stage, setStage] = useState('ordered');
  const [search, setSearch] = useState('');

  const f = funnel || {};
  const columns = [
    { key: 'visited', label: 'Посетили', count: f.visited || 0, color: '#6366F1' },
    { key: 'cart', label: 'Корзина', count: f.cart || 0, color: '#F59E0B' },
    { key: 'ordered', label: 'Заказ', count: f.ordered || 0, color: '#3B82F6' },
    { key: 'paid', label: 'Оплатили', count: f.paid || 0, color: '#10B981' },
  ];

  const applySearch = (list, fields) => {
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(c => fields.some(f => (c[f] || '').toLowerCase().includes(s)));
  };

  const openClient = async (client) => {
    setSelected(client);
    setLoadingOrders(true);
    try {
      const identifier = client.phone || client.name || '';
      const data = await api.get(`/shop/${tc}/clients/${encodeURIComponent(identifier)}/orders`);
      if (data.success) setOrders(data.orders || []);
    } catch { setOrders([]); }
    finally { setLoadingOrders(false); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtMoney = (n) => Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' ₽';

  // Данные в зависимости от выбранного этапа
  const renderList = () => {
    if (stage === 'visited') {
      const filtered = applySearch(visitors || [], ['name']);
      return (
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>
              <th style={thS}>Пользователь</th><th style={thS}>Визитов</th><th style={thS}>Первый</th><th style={thS}>Последний</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ ...tdS, textAlign: 'center', color: 'var(--text-secondary)' }}>Нет посетителей</td></tr>
              ) : filtered.map((v, i) => (
                <tr key={i}>
                  <td style={tdS}>{v.name || '—'}</td>
                  <td style={tdS}>{v.visit_count}</td>
                  <td style={{ ...tdS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{fmtDate(v.first_visit)}</td>
                  <td style={{ ...tdS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{fmtDate(v.last_visit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (stage === 'cart') {
      const filtered = applySearch(carts || [], ['name']);
      return (
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>
              <th style={thS}>Пользователь</th><th style={thS}>Товаров</th><th style={thS}>Обновлено</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={3} style={{ ...tdS, textAlign: 'center', color: 'var(--text-secondary)' }}>Нет корзин</td></tr>
              ) : filtered.map((c, i) => (
                <tr key={i}>
                  <td style={tdS}>{c.name || '—'}</td>
                  <td style={tdS}>{c.items_count}</td>
                  <td style={{ ...tdS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{fmtDate(c.last_update)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ordered / paid — таблица клиентов
    const allClients = clients || [];
    const filtered = applySearch(
      stage === 'paid' ? allClients.filter(c => c.paid_count > 0) : allClients,
      ['name', 'phone', 'email']
    );

    return (
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={thS}>Клиент</th><th style={thS}>Заказов</th><th style={thS}>Оплачено</th><th style={thS}>Сумма</th><th style={thS}>Последний</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ ...tdS, textAlign: 'center', color: 'var(--text-secondary)' }}>Нет клиентов</td></tr>
                ) : filtered.map((c, i) => (
                  <tr key={i} onClick={() => openClient(c)}
                    style={{ cursor: 'pointer', background: selected === c ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
                    <td style={tdS}>
                      <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{c.name || '—'}</div>
                      {c.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.phone}</div>}
                      {c.email && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.email}</div>}
                    </td>
                    <td style={tdS}>{c.orders_count}</td>
                    <td style={tdS}>{c.paid_count}</td>
                    <td style={{ ...tdS, fontWeight: 600 }}>{fmtMoney(c.total_spent)}</td>
                    <td style={{ ...tdS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{fmtDate(c.last_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div style={{ flex: '1 1 350px', minWidth: 0 }}>
            <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Заказы: {selected.name || '—'}</h4>
                <button onClick={() => { setSelected(null); setOrders([]); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>&times;</button>
              </div>
              {selected.phone && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{selected.phone}</div>}
              {selected.email && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{selected.email}</div>}
              {loadingOrders ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Загрузка...</div>
              ) : orders.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Нет заказов</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {orders.map(o => (
                    <div key={o.id} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>#{o.order_number}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
                          background: o.payment_status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color: o.payment_status === 'paid' ? '#10B981' : '#F59E0B',
                        }}>{o.payment_status === 'paid' ? 'Оплачен' : o.status || 'Новый'}</span>
                      </div>
                      {(o.items || []).map((item, j) => (
                        <div key={j} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                          {item.product_name} x{item.quantity} — {fmtMoney(item.price * item.quantity)}
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(o.created_at)}</span>
                        <span style={{ fontWeight: 600 }}>{fmtMoney(o.total)}</span>
                      </div>
                      {o.delivery_method_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>Доставка: {o.delivery_method_name}</div>}
                      {o.client_address && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>Адрес: {o.client_address}</div>}
                    </div>
                  ))}
                </div>
              )}

              <ClientDialog identifier={selected.phone || selected.name} phone={selected.phone} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pc-section">
      <h2 style={{ marginBottom: 16 }}>Воронка клиентов</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
        {columns.map(col => (
          <div key={col.key} onClick={() => { setStage(col.key); setSelected(null); }} style={{
            background: stage === col.key ? `${col.color}15` : 'var(--bg-glass)',
            border: stage === col.key ? `2px solid ${col.color}` : '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 10px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: col.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', fontWeight: 700, margin: '0 auto 6px',
            }}>{col.count}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 500, color: stage === col.key ? col.color : 'var(--text-secondary)' }}>{col.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          {stage === 'visited' ? 'Посетители' : stage === 'cart' ? 'Корзины' : stage === 'paid' ? 'Оплатившие' : 'Клиенты'}
        </h3>
        <input className="form-input" style={{ maxWidth: 280, marginLeft: 'auto' }} placeholder="Поиск..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {renderList()}
    </div>
  );
}
