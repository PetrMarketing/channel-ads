import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [period, setPeriod] = useState(30);

  // Stats тоже зависят от периода (новые регистрации/доход/etc за выбранный период)
  useEffect(() => { adminApi.get(`/dashboard/stats?days=${period}`).then(d => { if (d) setStats(d); }).catch(() => {}); }, [period]);
  useEffect(() => { adminApi.get(`/dashboard/charts?days=${period}`).then(d => { if (d?.success) setCharts(d); }).catch(() => {}); }, [period]);

  if (!stats) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, margin: '0 auto 12px', border: '3px solid #e0e0e0', borderTop: '3px solid #4361ee', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ color: '#aaa', fontSize: 13 }}>Загрузка данных...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const periodLabel = period >= 3650 ? 'за всё время' : `за ${period}д`;
  const metrics = [
    // Онлайн в сервисе (15 мин активности) — независимо от периода
    { label: 'Онлайн сейчас', value: stats.online ?? 0, color: '#10b981', icon: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3', sublabel: 'активны последние 15 мин', staticVal: true },
    { label: `Новые юзеры ${periodLabel}`, value: stats.users, color: '#4361ee', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z', sublabel: `всего ${(stats.users_total || 0).toLocaleString('ru-RU')}` },
    { label: `Каналы ${periodLabel}`, value: stats.channels, color: '#2a9d8f', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', sublabel: `всего ${(stats.channels_total || 0).toLocaleString('ru-RU')}` },
    { label: `Подписчики ${periodLabel}`, value: stats.subscribers, color: '#e9c46a', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8z', sublabel: `всего ${(stats.subscribers_total || 0).toLocaleString('ru-RU')}` },
    { label: 'Активные тарифы', value: stats.activeBillings, color: '#f4a261', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', staticVal: true },
    { label: `Доход ${periodLabel}`, value: stats.revenue_total || 0, color: '#e63946', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', isMoney: true, sublabel: 'подписки + токены' },
    { label: `Подписки ${periodLabel}`, value: stats.revenue_subs || 0, color: '#7b68ee', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', isMoney: true },
    { label: `Токены ${periodLabel}`, value: stats.revenue_tokens || 0, color: '#06b6d4', icon: 'M13 10V3L4 14h7v7l9-11h-7z', isMoney: true },
    { label: `ИИ Оформление ${periodLabel}`, value: stats.aiDesign, color: '#8b5cf6', icon: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586' },
    { label: `ИИ Контент ${periodLabel}`, value: stats.aiContent, color: '#ec4899', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
    { label: `Закрепы ${periodLabel}`, value: stats.pins, color: '#264653', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
    { label: `Рассылки ${periodLabel}`, value: stats.broadcasts, color: '#7b68ee', icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
    { label: `Розыгрыши ${periodLabel}`, value: stats.giveaways, color: '#ef4444', icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4' },
    { label: `Лид-магниты ${periodLabel}`, value: stats.leadMagnets, color: '#06b6d4', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ];

  const renderSparkArea = (data, valueKey, color, w = 72, h = 28) => {
    if (!data?.length) return null;
    const vals = data.slice(-14).map(d => d[valueKey] || 0);
    const max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * (h - 2)}`);
    const line = pts.join(' ');
    const area = `0,${h} ${line} ${w},${h}`;
    return (
      <svg width={w} height={h} style={{ display: 'block', opacity: 0.8 }}>
        <defs><linearGradient id={`g-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient></defs>
        <polygon points={area} fill={`url(#g-${color.slice(1)})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  const renderChart = (data, label, color, valueKey = 'count', suffix = '') => {
    if (!data?.length) return (
      <div style={chartCard}><div style={{ color: '#ccc', fontSize: 13, padding: 30, textAlign: 'center' }}>Нет данных за период</div></div>
    );
    const values = data.map(d => d[valueKey] || 0);
    const max = Math.max(...values, 1);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / values.length);
    const chartH = 150;
    return (
      <div style={chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#999', fontWeight: 500, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', letterSpacing: -0.5 }}>
              {total.toLocaleString('ru-RU')}{suffix}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#bbb', marginBottom: 2 }}>В среднем/день</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#666' }}>{avg.toLocaleString('ru-RU')}{suffix}</div>
          </div>
        </div>
        {/* Average line */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', top: chartH - (avg / max) * (chartH - 20) - 10, left: 0, right: 0,
            borderTop: '1px dashed rgba(0,0,0,0.08)', zIndex: 1,
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: chartH }}>
            {values.map((v, i) => {
              const h = Math.max(2, (v / max) * (chartH - 20));
              return (
                <div key={i} title={`${data[i]?.date || ''}: ${Number(v).toLocaleString('ru-RU')}${suffix}`}
                  style={{
                    flex: 1, height: h, borderRadius: '4px 4px 0 0', cursor: 'pointer',
                    background: color, opacity: 0.6,
                    transition: 'opacity 0.15s, box-shadow 0.15s',
                    animation: `barGrow 0.4s ease-out ${i * 0.01}s both`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = `0 -4px 12px ${color}40`; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#ccc', marginTop: 8 }}>
          <span>{data[0]?.date?.slice(5)}</span>
          <span>{data[Math.floor(data.length / 2)]?.date?.slice(5)}</span>
          <span>{data[data.length - 1]?.date?.slice(5)}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e', letterSpacing: -0.5 }}>Дашборд</h2>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 3 }}>Общая статистика сервиса</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, padding: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {[
            { v: 7, label: '7д' },
            { v: 30, label: '30д' },
            { v: 90, label: '90д' },
            { v: 36500, label: 'Всё' },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => setPeriod(v)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: period === v ? '#4361ee' : 'transparent',
              color: period === v ? '#fff' : '#aaa',
              fontSize: 12, fontWeight: period === v ? 600 : 400, cursor: 'pointer',
              transition: 'all 0.2s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {metrics.map((m, i) => (
          <div key={m.label} style={{
            ...metricCard,
            animation: `adminFadeIn 0.3s ease-out ${i * 0.04}s both`,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${m.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={m.icon} />
                </svg>
              </div>
              {charts?.users_chart && renderSparkArea(charts.users_chart, 'count', m.color)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', letterSpacing: -0.5, marginBottom: 2 }}>
              {m.isMoney ? Number(m.value || 0).toLocaleString('ru-RU') : (typeof m.value === 'number' ? m.value.toLocaleString('ru-RU') : m.value)}
              {m.isMoney && <span style={{ fontSize: 13, fontWeight: 500, color: '#aaa', marginLeft: 2 }}>₽</span>}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>{m.label}</div>
            {m.sublabel && (
              <div style={{ fontSize: 10, color: '#bbb', fontWeight: 400, marginTop: 2 }}>{m.sublabel}</div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        {renderChart(charts?.users_chart, 'Регистрации пользователей', '#4361ee')}
        {renderChart(charts?.revenue_subs_chart, 'Доход с подписок', '#7b68ee', 'amount', ' ₽')}
        {renderChart(charts?.revenue_tokens_chart, 'Доход с токенов', '#06b6d4', 'amount', ' ₽')}
        {renderChart(charts?.ai_design_chart, 'Сессии ИИ Оформления', '#8b5cf6')}
        {renderChart(charts?.ai_content_chart, 'Сессии ИИ Контента', '#ec4899')}
      </div>

      <style>{`
        @keyframes adminFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes barGrow { from { transform: scaleY(0); transform-origin: bottom; } to { transform: scaleY(1); } }
      `}</style>
    </div>
  );
}

const metricCard = {
  background: '#fff', borderRadius: 14, padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform 0.2s, box-shadow 0.2s',
  cursor: 'default',
};

const chartCard = {
  background: '#fff', borderRadius: 14, padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
