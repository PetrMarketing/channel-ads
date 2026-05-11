import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import { pageTitle, card, tableWrap, th, td, badge, statCard, fmtDate, fmtMoney, emptyState } from './adminStyles';

export default function AdminReferralsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.get('/referrals/overview').then(d => { if (d?.success) setData(d); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={emptyState}>Загрузка…</div>;
  if (!data) return <div style={emptyState}>Не удалось загрузить</div>;

  const t = data.totals || {};

  return (
    <div>
      <h1 style={{ ...pageTitle, marginBottom: 16 }}>Рефералы</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        <div style={statCard('#4361ee')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Всего регистраций по рефам</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{(t.total_signups || 0).toLocaleString('ru-RU')}</div>
        </div>
        <div style={statCard('#22c55e')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Конверсия в оплату</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>
            {(t.converted_signups || 0)} <span style={{ fontSize: 13, color: '#6b7280' }}>({t.total_signups ? Math.round(100 * t.converted_signups / t.total_signups) : 0}%)</span>
          </div>
        </div>
        <div style={statCard('#f59e0b')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Выплачено комиссий</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{fmtMoney(t.total_paid_out)}</div>
        </div>
        <div style={statCard('#8b5cf6')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Реф-ссылок создано</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{(t.total_links || 0).toLocaleString('ru-RU')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Топ рефереров</h3>
          {(data.top_referrers || []).length === 0 ? <div style={emptyState}>Пока никого</div> : (
            <div style={tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Имя</th><th style={th}>Регистраций</th><th style={th}>Заработано</th><th style={th}>Баланс</th>
                </tr></thead>
                <tbody>{(data.top_referrers || []).map(u => (
                  <tr key={u.id} onClick={() => navigate(`/admin/users/${u.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={td}><b>{u.first_name || u.username || `User #${u.id}`}</b><div style={{ fontSize: 11, color: '#6b7280' }}>{u.email || u.username || ''}</div></td>
                    <td style={td}><span style={badge('#dbeafe', '#1d4ed8')}>{u.signups}</span></td>
                    <td style={td}>{fmtMoney(u.total_earned)}</td>
                    <td style={td}>{fmtMoney(u.referral_balance)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Последние регистрации</h3>
          {(data.recent_signups || []).length === 0 ? <div style={emptyState}>Пока никого</div> : (
            <div style={tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Когда</th><th style={th}>Реферер</th><th style={th}>Реферал</th><th style={th}>Оплатил</th>
                </tr></thead>
                <tbody>{(data.recent_signups || []).map(s => (
                  <tr key={s.id}>
                    <td style={td}>{fmtDate(s.created_at)}</td>
                    <td style={td}>
                      <a onClick={() => navigate(`/admin/users/${s.referrer_user_id}`)} style={{ color: '#4361ee', cursor: 'pointer' }}>
                        {s.referrer_name || s.referrer_username || `#${s.referrer_user_id}`}
                      </a>
                    </td>
                    <td style={td}>
                      <a onClick={() => navigate(`/admin/users/${s.referred_user_id}`)} style={{ color: '#4361ee', cursor: 'pointer' }}>
                        {s.referred_name || s.referred_username || `#${s.referred_user_id}`}
                      </a>
                    </td>
                    <td style={td}>{s.has_paid ? <span style={badge('#dcfce7', '#166534')}>да</span> : <span style={badge('#f3f4f6', '#6b7280')}>нет</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
