import { useState } from 'react';

const STATUS_LABELS = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const STATUS_BADGE = {
  new: 'info',
  confirmed: 'success',
  shipped: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

const PAYMENT_STATUS_LABELS = {
  pending: 'Ожидает',
  paid: 'Оплачен',
  refunded: 'Возврат',
};

const PAYMENT_BADGE = {
  pending: 'warning',
  paid: 'success',
  refunded: 'danger',
};

export default function ShopOrdersTab({
  orders, tc, showToast, btnSmall,
  orderStatusFilter, setOrderStatusFilter,
  updateOrderStatus,
}) {
  const [expandedOrder, setExpandedOrder] = useState(null);

  const toggleExpand = (id) => {
    setExpandedOrder(expandedOrder === id ? null : id);
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getItemsSummary = (order) => {
    if (!order.items || !order.items.length) return 'Нет товаров';
    const count = order.items.length;
    return `${count} товар${count === 1 ? '' : count < 5 ? 'а' : 'ов'}`;
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2>Заказы</h2>
        <select className="form-input" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {orders.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет заказов.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map(order => (
          <div key={order.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}
              onClick={() => toggleExpand(order.id)}>
              <div style={{ fontWeight: 600, minWidth: 80 }}>#{order.order_number || order.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>{order.client_name || 'Без имени'}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 10 }}>{getItemsSummary(order)}</span>
              </div>
              <div style={{ fontWeight: 600 }}>{order.total || 0} р.</div>
              <span className={`pc-badge ${STATUS_BADGE[order.status] || 'info'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className={`pc-badge ${PAYMENT_BADGE[order.payment_status] || 'warning'}`}>
                {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status || 'Ожидает'}
              </span>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 100, textAlign: 'right' }}>
                {formatDate(order.created_at)}
              </div>
            </div>

            {/* Expanded details */}
            {expandedOrder === order.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 500, marginBottom: 6, fontSize: '0.85rem' }}>Товары:</div>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '2px 0' }}>
                        <span>{item.product_name || item.name} x{item.quantity}</span>
                        <span>{item.price} р.</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Delivery & address */}
                {order.delivery_method && (
                  <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                    <b>Доставка:</b> {order.delivery_method}
                    {order.delivery_price ? ` (${order.delivery_price} р.)` : ''}
                  </div>
                )}
                {order.address && (
                  <div style={{ fontSize: '0.82rem', marginBottom: 8 }}>
                    <b>Адрес:</b> {order.address}
                  </div>
                )}
                {order.client_phone && (
                  <div style={{ fontSize: '0.82rem', marginBottom: 8 }}>
                    <b>Телефон:</b> {order.client_phone}
                  </div>
                )}

                {/* Status change buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {order.status === 'new' && (
                    <button className="btn btn-primary" style={btnSmall} onClick={() => updateOrderStatus(order.id, 'confirmed')}>
                      Подтвердить
                    </button>
                  )}
                  {order.status === 'confirmed' && (
                    <button className="btn btn-primary" style={btnSmall} onClick={() => updateOrderStatus(order.id, 'shipped')}>
                      Отправлен
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button className="btn btn-primary" style={btnSmall} onClick={() => updateOrderStatus(order.id, 'delivered')}>
                      Доставлен
                    </button>
                  )}
                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <button className="btn btn-danger" style={btnSmall} onClick={() => updateOrderStatus(order.id, 'cancelled')}>
                      Отменён
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
