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

  const renderChart = (data, label, color, valueKey = 'count') => {
    if (!data || !data.length) return <div style={{ color: '#aaa', fontSize: 13, padding: 20, textAlign: 'center' }}>Нет данных</div>;
    const values = data.map(d => d[valueKey] || 0);
    const max = Math.max(...values, 1);
    const w = 100, h = 40;
    const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * h}`).join(' ');
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{label}</div>
        <svg viewBox={`0 0 ${w} ${h + 4}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => (
            <circle key={i} cx={(i / Math.max(values.length - 1, 1)) * w} cy={h - (v / max) * h} r="2" fill={color} />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999', marginTop: 4 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        {renderChart(charts?.users_chart, 'Регистрации пользователей', '#4361ee')}
        {renderChart(charts?.revenue_chart, 'Доход (₽)', '#e63946', 'amount')}
      </div>
    </div>
  );
}
