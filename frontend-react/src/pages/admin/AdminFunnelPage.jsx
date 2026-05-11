import React, { useEffect, useState, useMemo } from 'react';
import { adminApi } from '../../services/adminApi';
import { pageTitle, card, statCard, fmtDate, emptyState } from './adminStyles';

const FUNNEL_COLORS = ['#4361ee', '#7b68ee', '#22c55e', '#f59e0b'];

export default function AdminFunnelPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = (d) => {
    setLoading(true);
    adminApi.get(`/funnel/registrations?days=${d}`).then(r => { if (r?.success) setData(r); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(days); }, [days]);

  const maxByDay = useMemo(() => Math.max(1, ...((data?.by_day || []).map(d => d.n))), [data]);

  return (
    <div>
      <h1 style={{ ...pageTitle, marginBottom: 16 }}>Воронка регистраций</h1>

      <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Период:</span>
        {[7, 14, 30, 60, 90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: days === d ? '2px solid #4361ee' : '1px solid #e5e7eb',
            background: days === d ? '#eef2ff' : '#fff', color: days === d ? '#4361ee' : '#1a1a2e',
          }}>{d} дн</button>
        ))}
      </div>

      {loading && !data ? <div style={emptyState}>Загрузка…</div>
       : !data ? <div style={emptyState}>Нет данных</div>
       : (
        <>
          {/* Funnel bars */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.funnel.map((step, i) => {
                const widthPct = data.funnel[0].count > 0 ? (step.count * 100 / data.funnel[0].count) : 0;
                return (
                  <div key={step.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>
                        <span style={{ color: '#9ca3af', marginRight: 8 }}>{i + 1}.</span>{step.label}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>{step.count.toLocaleString('ru-RU')}</div>
                        {i > 0 && (
                          <div style={{ fontSize: 12, color: step.pct_of_prev >= 50 ? '#16a34a' : step.pct_of_prev >= 20 ? '#f59e0b' : '#dc2626', fontWeight: 700 }}>
                            {step.pct_of_prev}% от прошлого
                          </div>
                        )}
                        {i > 0 && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>
                            {step.pct_of_total}% от общих
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 26, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0,
                        width: `${widthPct}%`,
                        background: `linear-gradient(135deg, ${FUNNEL_COLORS[i]}, ${FUNNEL_COLORS[i]}dd)`,
                        borderRadius: 8,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily registrations chart */}
          <div style={{ ...card }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: '0 0 14px' }}>Регистрации по дням</h3>
            {(data.by_day || []).length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>Нет регистраций за период</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, overflowX: 'auto' }}>
                {(data.by_day || []).map(d => {
                  const h = (d.n / maxByDay) * 100;
                  return (
                    <div key={d.day} title={`${d.day}: ${d.n}`} style={{
                      flex: '0 0 auto', minWidth: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{d.n}</div>
                      <div style={{
                        width: 16, height: `${h}%`, background: '#4361ee', borderRadius: 4,
                        minHeight: d.n > 0 ? 4 : 0,
                      }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
