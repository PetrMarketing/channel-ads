import { useState } from 'react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';

function statusLabel(m) {
  if (m.status === 'pending') return 'Ожидает оплату';
  if (m.status === 'active') {
    if (m.expires_at) {
      return `Оплатил до ${new Date(m.expires_at).toLocaleDateString('ru-RU')} г.`;
    }
    return 'Оплатил (бессрочно)';
  }
  if (m.status === 'expired') return 'Истёк';
  if (m.status === 'cancelled') return 'Отменён';
  return m.status;
}

function statusBadgeClass(status) {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'info';
  if (status === 'expired') return 'warning';
  return 'danger';
}

export default function MembersTab({ members, chats, memberChatFilter, setMemberChatFilter, memberStatusFilter, setMemberStatusFilter, tc, onReload }) {
  const [markingPaid, setMarkingPaid] = useState(null);
  const [confirmPayment, setConfirmPayment] = useState(null);

  const handleMarkPaid = async (paymentId) => {
    setMarkingPaid(paymentId);
    setConfirmPayment(null);
    try {
      const res = await api.post(`/paid-chats/${tc}/members/mark-paid/${paymentId}`);
      if (res.success) {
        if (onReload) onReload();
      }
    } catch (e) {
      alert('Ошибка: ' + (e.message || 'Не удалось подтвердить'));
    } finally {
      setMarkingPaid(null);
    }
  };

  return (
    <div className="pc-section">
      <h2>Участники</h2>
      <div className="pc-filters">
        <select value={memberChatFilter} onChange={e => setMemberChatFilter(e.target.value)}>
          <option value="">Все чаты</option>
          {chats.map(c => <option key={c.id} value={c.id}>{c.title || c.chat_id}</option>)}
        </select>
        <select value={memberStatusFilter} onChange={e => setMemberStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="pending">Ожидают оплату</option>
          <option value="active">Активные</option>
          <option value="expired">Истекшие</option>
          <option value="cancelled">Отменённые</option>
        </select>
      </div>
      {members.length === 0 && <p className="pc-empty">Участников пока нет.</p>}
      {members.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="pc-members-table-wrap pc-desktop-only">
            <table className="pc-members-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Чат</th>
                  <th>Тариф</th>
                  <th>Оплата</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                      {m.username && <div className="pc-text-muted">@{m.username}</div>}
                    </td>
                    <td>{m.chat_title || '—'}</td>
                    <td>
                      {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}
                      {m.price && <div className="pc-text-muted">{Number(m.price).toLocaleString('ru-RU')} RUB</div>}
                    </td>
                    <td>{m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} RUB` : '—'}</td>
                    <td>
                      <span className={`pc-badge ${statusBadgeClass(m.status)}`}>
                        {statusLabel(m)}
                      </span>
                    </td>
                    <td>
                      {m.status === 'pending' && m.payment_id ? (
                        <button
                          className="pc-btn-sm pc-btn-success"
                          disabled={markingPaid === m.payment_id}
                          onClick={() => setConfirmPayment(m)}
                        >
                          {markingPaid === m.payment_id ? '...' : 'Внёс оплату'}
                        </button>
                      ) : m.invite_link ? (
                        <a href={m.invite_link} target="_blank" rel="noreferrer" className="pc-text-muted" style={{fontSize: 12}}>Ссылка</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="pc-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {members.map(m => (
              <div key={m.id} className="pc-member-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                    {m.username && <span className="pc-text-muted" style={{ marginLeft: 6 }}>@{m.username}</span>}
                  </div>
                  <span className={`pc-badge ${statusBadgeClass(m.status)}`}>
                    {statusLabel(m)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Чат: {m.chat_title || '—'}</span>
                  <span>Тариф: {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}</span>
                  <span>Оплата: {m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} ₽` : '—'}</span>
                  {m.status !== 'pending' && (
                    <span>До: {m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}</span>
                  )}
                </div>
                {m.status === 'pending' && m.payment_id ? (
                  <button
                    className="pc-btn-sm pc-btn-success"
                    style={{ marginTop: 8, width: '100%' }}
                    disabled={markingPaid === m.payment_id}
                    onClick={() => setConfirmPayment(m)}
                  >
                    {markingPaid === m.payment_id ? 'Подтверждение...' : 'Внёс оплату'}
                  </button>
                ) : m.invite_link ? (
                  <a href={m.invite_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', marginTop: 6, display: 'inline-block' }}>Инвайт-ссылка</a>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirm payment modal */}
      <Modal isOpen={!!confirmPayment} onClose={() => setConfirmPayment(null)} title="Подтверждение оплаты">
        {confirmPayment && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: '0.95rem', marginBottom: '8px' }}>
              Подтвердить оплату для <strong>{confirmPayment.first_name || confirmPayment.username || 'пользователя'}</strong>?
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Пользователю будет отправлена ссылка на вход в чат.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                disabled={markingPaid === confirmPayment.payment_id}
                onClick={() => handleMarkPaid(confirmPayment.payment_id)}
              >
                {markingPaid === confirmPayment.payment_id ? 'Подтверждение...' : 'Подтвердить'}
              </button>
              <button className="btn btn-outline" onClick={() => setConfirmPayment(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
