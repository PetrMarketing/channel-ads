import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const cardStyle = (color) => ({
  background: '#fff', borderRadius: 12, padding: 24, flex: '1 1 180px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`,
});
const numStyle = { fontSize: 28, fontWeight: 700, margin: '8px 0 4px' };
const labelStyle = { fontSize: 13, color: '#888' };

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  useEffect(() => { adminApi.get('/dashboard/stats').then(d => { if (d) setStats(d); }).catch(() => {}); }, []);

  if (!stats) return <div>Загрузка...</div>;
  const items = [
    { label: 'Пользователей', value: stats.users, color: '#4361ee' },
    { label: 'Каналов', value: stats.channels, color: '#2a9d8f' },
    { label: 'Подписчиков', value: stats.subscribers, color: '#e9c46a' },
    { label: 'Активных подписок', value: stats.activeBillings, color: '#f4a261' },
    { label: 'Лидов', value: stats.leads, color: '#e76f51' },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 20px' }}>Дашборд</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {items.map(it => (
          <div key={it.label} style={cardStyle(it.color)}>
            <div style={labelStyle}>{it.label}</div>
            <div style={numStyle}>{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
