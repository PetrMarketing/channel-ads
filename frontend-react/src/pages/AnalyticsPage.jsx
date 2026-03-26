import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';

export default function AnalyticsPage() {
  const { currentChannel } = useChannels();
  const tc = currentChannel?.tracking_code;
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const [aData, sData] = await Promise.all([
        api.get(`/analytics/${tc}?days=${period}`),
        api.get(`/analytics/${tc}/summary`),
      ]);
      if (aData.success) setData(aData.analytics || []);
      if (sData.success) setSummary(sData);
    } catch {}
    finally { setLoading(false); }
  }, [tc, period]);

  useEffect(() => { load(); }, [load]);

  if (!currentChannel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📢</div>
          <h3>Выберите канал</h3>
        </div>
      </div>
    );
  }

  const cardStyle = {
    background: 'var(--bg-glass)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center',
  };
  const numStyle = { fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary, #2AABEE)' };
  const labelStyle = { fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 };

  // Simple SVG line chart
  const renderChart = (values, label, color = '#2AABEE') => {
    if (!values.length) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>Нет данных</div>;
    const max = Math.max(...values, 1);
    const w = 100;
    const h = 40;
    const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * h}`).join(' ');
    return (
      <div style={{ ...cardStyle, padding: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>{label}</div>
        <svg viewBox={`0 0 ${w} ${h + 4}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => (
            <circle key={i} cx={(i / Math.max(values.length - 1, 1)) * w} cy={h - (v / max) * h} r="2" fill={color} />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {data.length > 0 && <span>{data[0].snapshot_date?.slice(5)}</span>}
          {data.length > 1 && <span>{data[data.length - 1].snapshot_date?.slice(5)}</span>}
        </div>
      </div>
    );
  };

  const subscribers = data.map(d => d.subscribers_count || 0);
  const reactions = data.map(d => d.reactions_count || 0);
  const commentsByDay = data.map(d => d.comments_count || 0);

  return (
    <div>
      <div className="page-header">
        <h1>Аналитика</h1>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[7, 14, 30, 90].map(p => (
          <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => setPeriod(p)}>
            {p} дн.
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Загрузка...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.subscribers?.toLocaleString('ru-RU') || 0}</div>
              <div style={labelStyle}>Подписчики</div>
              {summary?.subscribers_growth !== 0 && (
                <div style={{ fontSize: '0.78rem', color: summary?.subscribers_growth > 0 ? '#2a9d8f' : '#e63946', marginTop: 2 }}>
                  {summary?.subscribers_growth > 0 ? '+' : ''}{summary?.subscribers_growth}
                </div>
              )}
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.views_24h || 0}</div>
              <div style={labelStyle}>Просмотры 24ч</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.views_48h || 0}</div>
              <div style={labelStyle}>Просмотры 48ч</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.views_72h || 0}</div>
              <div style={labelStyle}>Просмотры 72ч</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.engagement_rate?.toFixed(2) || 0}%</div>
              <div style={labelStyle}>ER</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.avg_views || 0}</div>
              <div style={labelStyle}>Ср. просмотров на пост</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.reactions_today || 0}</div>
              <div style={labelStyle}>Реакции сегодня</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.comments_today || 0}</div>
              <div style={labelStyle}>Комментарии сегодня</div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {renderChart(subscribers, 'Подписчики', '#2AABEE')}
            {renderChart(reactions, 'Реакции по дням', '#7C3AED')}
            {renderChart(commentsByDay, 'Комментарии по дням', '#059669')}
          </div>
        </>
      )}
    </div>
  );
}
