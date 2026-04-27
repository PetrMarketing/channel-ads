import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, periodWrap, periodBtn, statCard, tableWrap, th, td,
  statusBadge, fmtDate, fmtMoney, emptyState,
} from './adminStyles';

const periods = [
  { key: '7d', label: '7 дней' },
  { key: '14d', label: '14 дней' },
  { key: '30d', label: '30 дней' },
  { key: '90d', label: '90 дней' },
  { key: '365d', label: 'Год' },
];

const tabBtn = (active) => ({
  padding: '7px 18px', borderRadius: 20, border: 'none',
  background: active ? '#4361ee' : '#f3f4f6',
  color: active ? '#fff' : '#888',
  fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
  transition: 'all 0.2s',
});

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

  if (loading && !data) return <div style={{ padding: 20, color: '#999' }}>Загрузка...</div>;

  const totals = data?.totals || {};

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={pageTitle}>Финансы</h2>
        <div style={periodWrap}>
          {periods.map(p => (
            <button key={p.key} style={periodBtn(period === p.key)} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ ...statCard('#2a9d8f'), flex: '1 1 180px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Итого</div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '8px 0', color: '#1a1a2e' }}>{fmtMoney(totals.total)}</div>
        </div>
        <div style={{ ...statCard('#4361ee'), flex: '1 1 180px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Подписки на сервис</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0', color: '#1a1a2e' }}>{fmtMoney(totals.billing)}</div>
        </div>
        <div style={{ ...statCard('#7b68ee'), flex: '1 1 180px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Платные чаты</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0', color: '#1a1a2e' }}>{fmtMoney(totals.paid_chat)}</div>
        </div>
        <div style={{ ...statCard('#e76f51'), flex: '1 1 180px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>ИИ Токены</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0', color: '#1a1a2e' }}>{fmtMoney(totals.ai_tokens)}</div>
        </div>
        <div style={{ ...statCard('#f4a261'), flex: '1 1 180px' }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>Ожидают оплаты</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0', color: '#1a1a2e' }}>{fmtMoney(totals.pending)}</div>
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setTab('billing')} style={tabBtn(tab === 'billing')}>
          Подписки ({data?.billing_payments?.length || 0})
        </button>
        <button onClick={() => setTab('paidchat')} style={tabBtn(tab === 'paidchat')}>
          Платные чаты ({data?.paid_chat_payments?.length || 0})
        </button>
        <button onClick={() => setTab('tokens')} style={tabBtn(tab === 'tokens')}>
          ИИ Токены ({data?.token_purchases?.length || 0})
        </button>
      </div>

      {/* Billing payments */}
      {tab === 'billing' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Канал</th>
                <th style={th}>Сумма</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {(data?.billing_payments || []).map(p => (
                <tr key={p.id}>
                  <td style={td}>{p.id}</td>
                  <td style={td}>{fmtDate(p.created_at)}</td>
                  <td style={td}>{p.user_name || p.user_username || '—'}</td>
                  <td style={td}>{p.channel_title || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td style={td}><span style={statusBadge(p.status)}>{p.status}</span></td>
                </tr>
              ))}
              {!(data?.billing_payments?.length) && (
                <tr><td colSpan={6} style={emptyState}>Нет платежей за период</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paid chat payments */}
      {tab === 'paidchat' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Чат</th>
                <th style={th}>Канал</th>
                <th style={th}>Сумма</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {(data?.paid_chat_payments || []).map(p => (
                <tr key={p.id}>
                  <td style={td}>{p.id}</td>
                  <td style={td}>{fmtDate(p.created_at)}</td>
                  <td style={td}>{p.chat_title || '—'}</td>
                  <td style={td}>{p.channel_title || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td style={td}><span style={statusBadge(p.status)}>{p.status}</span></td>
                </tr>
              ))}
              {!(data?.paid_chat_payments?.length) && (
                <tr><td colSpan={6} style={emptyState}>Нет платежей за период</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Token purchases */}
      {tab === 'tokens' && (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Дата</th>
                <th style={th}>Пользователь</th>
                <th style={th}>Токены</th>
                <th style={th}>Сумма</th>
                <th style={th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {(data?.token_purchases || []).map(p => (
                <tr key={p.id}>
                  <td style={td}>{p.id}</td>
                  <td style={td}>{fmtDate(p.created_at || p.paid_at)}</td>
                  <td style={td}>{p.user_name || p.user_username || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.tokens}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                  <td style={td}><span style={statusBadge(p.payment_status)}>{p.payment_status}</span></td>
                </tr>
              ))}
              {!(data?.token_purchases?.length) && (
                <tr><td colSpan={6} style={emptyState}>Нет покупок за период</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
