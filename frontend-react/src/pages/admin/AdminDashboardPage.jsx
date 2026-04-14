import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const cardStyle = (color) => ({
  background: '#fff', borderRadius: 12, padding: 20, flex: '1 1 150px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`,
});
const numStyle = { fontSize: 24, fontWeight: 700, margin: '6px 0 2px' };
const labelStyle = { fontSize: 12, color: '#888' };

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [period, setPeriod] = useState(30);

  useEffect(() => { adminApi.get('/dashboard/stats').then(d => { if (d) setStats(d); }).catch(() => {}); }, []);
  useEffect(() => { adminApi.get(`/dashboard/charts?days=${period}`).then(d => { if (d?.success) setCharts(d); }).catch(() => {}); }, [period]);

  if (!stats) return <div>Загрузка...</div>;

  const items = [
    { label: 'Пользователей', value: stats.users, color: '#4361ee' },
    { label: 'Каналов', value: stats.channels, color: '#2a9d8f' },
    { label: 'Подписчиков', value: stats.subscribers, color: '#e9c46a' },
    { label: 'Активных подписок', value: stats.activeBillings, color: '#f4a261' },
    { label: 'Доход', value: `${(stats.totalRevenue || 0).toLocaleString('ru-RU')} ₽`, color: '#e63946' },
    { label: 'Закрепов', value: stats.pins, color: '#264653' },
    { label: 'Рассылок', value: stats.broadcasts, color: '#7b68ee' },
    { label: 'Розыгрышей', value: stats.giveaways, color: '#ef4444' },
    { label: 'Лид-магнитов', value: stats.leadMagnets, color: '#a8dadc' },
  ];

  const renderBarChart = (data, label, color, valueKey = 'count', suffix = '') => {
    if (!data || !data.length) return <div style={{ color: '#aaa', fontSize: 13, padding: 20, textAlign: 'center' }}>Нет данных</div>;
    const values = data.map(d => d[valueKey] || 0);
    const max = Math.max(...values, 1);
    const chartH = 140;
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: chartH }}>
          {values.map((v, i) => {
            var h = Math.max(2, (v / max) * (chartH - 20));
            return (
              <div key={i} title={(data[i]?.date || '') + ': ' + Number(v).toLocaleString('ru-RU') + suffix}
                style={{
                  flex: 1, height: h, borderRadius: '2px 2px 0 0', cursor: 'pointer',
                  background: color, opacity: 0.75, transition: 'opacity 0.15s',
                }}
                onMouseEnter={function(e) { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={function(e) { e.currentTarget.style.opacity = '0.75'; }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999', marginTop: 6 }}>
          <span>{data[0]?.date?.slice(5)}</span>
          <span>{data[data.length - 1]?.date?.slice(5)}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 20px' }}>Дашборд</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {items.map(it => (
          <div key={it.label} style={cardStyle(it.color)}>
            <div style={labelStyle}>{it.label}</div>
            <div style={numStyle}>{it.value}</div>
          </div>
        ))}
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 14, 30, 90].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{
              padding: '6px 14px', border: period === p ? '2px solid #4361ee' : '1px solid #ddd',
              borderRadius: 6, background: period === p ? '#eef1ff' : '#fff', cursor: 'pointer',
              fontSize: 13, fontWeight: period === p ? 600 : 400, color: period === p ? '#4361ee' : '#666',
            }}>{p} дн.</button>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {renderBarChart(charts?.users_chart, 'Регистрации пользователей', '#4361ee')}
        {renderBarChart(charts?.revenue_chart, 'Доход', '#e63946', 'amount', ' ₽')}
      </div>
    </div>
  );
}
