import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const cardStyle = (color) => ({
  background: '#fff', borderRadius: 12, padding: 20, flex: '1 1 180px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`,
});
const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const periodBtn = (active) => ({
  padding: '6px 14px', border: active ? '2px solid #4361ee' : '1px solid #ddd',
  borderRadius: 6, background: active ? '#eef1ff' : '#fff', cursor: 'pointer',
  fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#4361ee' : '#666',
});
const statusBadge = (status) => {
  const map = { paid: ['#d4edda', '#155724'], success: ['#d4edda', '#155724'], completed: ['#d4edda', '#155724'], pending: ['#fff3cd', '#856404'] };
  const [bg, color] = map[status] || ['#f8d7da', '#721c24'];
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: bg, color };
};

const periods = [
  { key: '7d', label: '7 дней' },
  { key: '14d', label: '14 дней' },
  { key: '30d', label: '30 дней' },
  { key: '90d', label: '90 дней' },
  { key: '365d', label: 'Год' },
];

export default function AdminFinancePage() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('billing');

  useEffect(() => {
    setLoading(true);
    adminApi.get(`/finance?period=${period}`).then(d => {
      if (d?.success) setData(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const fmtDate = (d) => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtMoney = (n) => Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' \u20BD';

  if (loading && !data) return <div style={{ padding: 20 }}>Загрузка...</div>;

  const totals = data?.totals || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Финансы</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {periods.map(p => (
            <button key={p.key} style={periodBtn(period === p.key)} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={cardStyle('#2a9d8f')}>
          <div style={{ fontSize: 13, color: '#888' }}>Итого</div>
          <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{fmtMoney(totals.total)}</div>
        </div>
        <div style={cardStyle('#4361ee')}>
          <div style={{ fontSize: 13, color: '#888' }}>Подписки на сервис</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}>{fmtMoney(totals.billing)}</div>
        </div>
        <div style={cardStyle('#7b68ee')}>
          <div style={{ fontSize: 13, color: '#888' }}>Платные чаты</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}>{fmtMoney(totals.paid_chat)}</div>
        </div>
        <div style={cardStyle('#f4a261')}>
          <div style={{ fontSize: 13, color: '#888' }}>Ожидают оплаты</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}>{fmtMoney(totals.pending)}</div>
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ borderBottom: '1px solid #ddd', marginBottom: 16, display: 'flex', gap: 4 }}>
        <button onClick={() => setTab('billing')} style={{
          padding: '8px 16px', border: 'none', borderBottom: tab === 'billing' ? '2px solid #4361ee' : '2px solid transparent',
          background: 'none', cursor: 'pointer', fontWeight: tab === 'billing' ? 600 : 400, fontSize: 13, color: tab === 'billing' ? '#4361ee' : '#666',
        }}>Подписки ({data?.billing_payments?.length || 0})</button>
        <button onClick={() => setTab('paidchat')} style={{
          padding: '8px 16px', border: 'none', borderBottom: tab === 'paidchat' ? '2px solid #4361ee' : '2px solid transparent',
          background: 'none', cursor: 'pointer', fontWeight: tab === 'paidchat' ? 600 : 400, fontSize: 13, color: tab === 'paidchat' ? '#4361ee' : '#666',
        }}>Платные чаты ({data?.paid_chat_payments?.length || 0})</button>
      </div>

      {/* Billing payments */}
      {tab === 'billing' && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Дата</th>
              <th style={thStyle}>Пользователь</th>
              <th style={thStyle}>Канал</th>
              <th style={thStyle}>Сумма</th>
              <th style={thStyle}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {(data?.billing_payments || []).map(p => (
              <tr key={p.id}>
                <td style={tdStyle}>{p.id}</td>
                <td style={tdStyle}>{fmtDate(p.created_at)}</td>
                <td style={tdStyle}>{p.user_name || p.user_username || '-'}</td>
                <td style={tdStyle}>{p.channel_title || '-'}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                <td style={tdStyle}><span style={statusBadge(p.status)}>{p.status}</span></td>
              </tr>
            ))}
            {!(data?.billing_payments?.length) && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет платежей за период</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Paid chat payments */}
      {tab === 'paidchat' && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Дата</th>
              <th style={thStyle}>Чат</th>
              <th style={thStyle}>Канал</th>
              <th style={thStyle}>Сумма</th>
              <th style={thStyle}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {(data?.paid_chat_payments || []).map(p => (
              <tr key={p.id}>
                <td style={tdStyle}>{p.id}</td>
                <td style={tdStyle}>{fmtDate(p.created_at)}</td>
                <td style={tdStyle}>{p.chat_title || '-'}</td>
                <td style={tdStyle}>{p.channel_title || '-'}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                <td style={tdStyle}><span style={statusBadge(p.status)}>{p.status}</span></td>
              </tr>
            ))}
            {!(data?.paid_chat_payments?.length) && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет платежей за период</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
