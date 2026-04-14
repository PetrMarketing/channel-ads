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
            <circle key={i} cx={(i / Math.max(values.length - 1, 1)) * w} cy={h - (v / max) * h} r="3" fill={color} stroke="var(--bg-primary, #fff)" strokeWidth="1" style={{ cursor: 'pointer' }}>
              <title>{(data[i]?.snapshot_date || '') + ': ' + (typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : Number(v).toLocaleString('ru-RU'))}</title>
            </circle>
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
  const views = data.map(d => d.views_count || 0);
  const commentsByDay = data.map(d => d.comments_count || 0);
  const erByDay = data.map(d => parseFloat(d.engagement_rate || 0));

  // Subscriber dynamics table
  const subsDynamics = [...data].reverse().slice(0, 14);

  return (
    <div>
      <div className="page-header">
        <h1>Аналитика</h1>
      </div>

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
              <div style={numStyle}>{summary?.views_total?.toLocaleString('ru-RU') || 0}</div>
              <div style={labelStyle}>Просмотры (сегодня)</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.engagement_rate?.toFixed(1) || 0}%</div>
              <div style={labelStyle}>ER (охват)</div>
            </div>
            <div style={cardStyle}>
              <div style={numStyle}>{summary?.comments_today || 0}</div>
              <div style={labelStyle}>Комментарии</div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
            {renderChart(subscribers, 'Подписчики', '#2AABEE')}
            {renderChart(views, 'Просмотры', '#7C3AED')}
            {renderChart(erByDay, 'ER %', '#059669')}
            {renderChart(commentsByDay, 'Комментарии', '#f59e0b')}
          </div>

          {/* Subscriber dynamics */}
          {subsDynamics.length > 0 && (
            <div style={{ ...cardStyle, textAlign: 'left', padding: 20 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Динамика подписчиков</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {subsDynamics.map((d, i) => {
                  const prev = subsDynamics[i + 1];
                  const diff = prev ? (d.subscribers_count || 0) - (prev.subscribers_count || 0) : 0;
                  return (
                    <div key={d.snapshot_date} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                      <span>{d.snapshot_date}</span>
                      <span>
                        <strong>{(d.subscribers_count || 0).toLocaleString('ru-RU')}</strong>
                        {diff !== 0 && (
                          <span style={{ marginLeft: 8, color: diff > 0 ? '#2a9d8f' : '#e63946', fontWeight: 600 }}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top posts */}
          {summary?.top_posts?.length > 0 && (
            <div style={{ ...cardStyle, textAlign: 'left', padding: 20, marginTop: 16 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Топ постов по просмотрам</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summary.top_posts.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{p.title || 'Без названия'}</span>
                      <span style={{ marginLeft: 8, fontSize: '0.72rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                        {p.post_type === 'content' ? 'Пост' : p.post_type === 'giveaway' ? 'Розыгрыш' : 'Закреп'}
                      </span>
                      {p.erid && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: 'var(--success)' }}>ERID: {p.erid}</span>}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{(p.views_count || 0).toLocaleString('ru-RU')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
