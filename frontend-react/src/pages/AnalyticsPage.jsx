import { useState, useEffect, useCallback, useRef } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 365, label: 'Всё время' },
];

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.82rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const POST_TYPE_META = {
  content:  { label: 'Пост',     bg: 'rgba(67,97,238,0.10)',  color: ACCENT },
  giveaway: { label: 'Розыгрыш', bg: 'rgba(123,104,238,0.10)', color: ACCENT2 },
  pin:      { label: 'Закреп',   bg: 'rgba(245,158,11,0.10)',  color: WARNING },
};

const TREND_PERIOD_LABEL = {
  7: 'за неделю',
  30: 'за месяц',
  90: 'за квартал',
  365: 'за период',
};

export default function AnalyticsPage() {
  const { currentChannel } = useChannels();
  const tc = currentChannel?.tracking_code;
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const { overlay: pageTour } = usePageOnboarding('analytics', [
    { selector: '[data-tour-page="analytics-period"]', title: 'Период', text: 'Выберите интервал для отображения графиков подписок, охвата и конверсий. Данные обновляются раз в сутки.', placement: 'bottom' },
  ]);

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
        <EmptyState
          title="Выберите канал"
          desc="Чтобы посмотреть графики и сводку по аналитике, сначала выберите канал в списке слева."
        />
      </div>
    );
  }

  const subscribers = data.map(d => d.subscribers_count || 0);
  const views = data.map(d => d.views_count || 0);
  const commentsByDay = data.map(d => d.comments_count || 0);
  const erByDay = data.map(d => parseFloat(d.engagement_rate || 0));

  const subsTrend = subscribers.length >= 2 ? subscribers[subscribers.length - 1] - subscribers[0] : 0;
  const subsTrendPct = subscribers.length >= 2 && subscribers[0] > 0
    ? ((subsTrend / subscribers[0]) * 100)
    : 0;
  const viewsTotal = views.reduce((a, b) => a + b, 0);
  const commentsTotal = commentsByDay.reduce((a, b) => a + b, 0);
  const erAvg = erByDay.length ? erByDay.reduce((a, b) => a + b, 0) / erByDay.length : 0;

  const subsDynamics = [...data].reverse().slice(0, 14);
  const trendLabel = TREND_PERIOD_LABEL[period] || 'за период';

  return (
    <div style={{ animation: 'anFade 0.4s ease' }}>
      {pageTour}

      <section style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Аналитика</h1>
          <p style={pageSubtitle}>Графики подписчиков, отписок, визитов и конверсий</p>
        </div>
        <div data-tour-page="analytics-period" style={periodWrap}>
          {PERIOD_OPTIONS.map(opt => {
            const active = period === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                style={active ? periodPillActive : periodPill}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = SOFT_BG; e.currentTarget.style.color = DARK; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = MUTED; } }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <div style={loadingWrap}>
          <div style={loadingPulse} />
          <div style={{ color: MUTED, fontSize: '0.85rem', marginTop: 14 }}>Загружаем графики...</div>
        </div>
      ) : data.length === 0 && !summary?.subscribers ? (
        <EmptyState
          title="Пока нет данных"
          desc="Графики появятся здесь, как только мы соберём первый снимок аналитики канала. Снимки делаются раз в сутки."
        />
      ) : (
        <>
          <section style={{ marginBottom: 28 }}>
            <div style={metricGrid}>
              <MetricCard
                label="Подписчики"
                value={summary?.subscribers ?? 0}
                trendValue={summary?.subscribers_growth ?? 0}
                trendLabel="за неделю"
                icon={<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M22 11l-2 2-3-3"/>}
                color={ACCENT}
                delay="0.05s"
              />
              <MetricCard
                label="Просмотры"
                value={viewsTotal || (summary?.views_total ?? 0)}
                trendValue={subsTrendPct ? Math.round(subsTrendPct) : null}
                trendLabel={trendLabel}
                trendIsPercent
                icon={<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z"/>}
                color={ACCENT2}
                delay="0.1s"
              />
              <MetricCard
                label="ER (охват)"
                value={(summary?.engagement_rate ?? erAvg) || 0}
                isPercent
                trendValue={null}
                trendLabel={`Средний ${trendLabel}`}
                trendChip={`Среднее: ${erAvg.toFixed(1)}%`}
                icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>}
                color={SUCCESS}
                delay="0.15s"
              />
              <MetricCard
                label="Комментарии"
                value={summary?.comments_today ?? 0}
                trendValue={commentsTotal}
                trendLabel="всего за период"
                trendIsTotal
                icon={<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>}
                color={WARNING}
                delay="0.2s"
              />
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <SectionHeader
              title="Подписчики и просмотры"
              subtitle={`Динамика ${data.length > 0 ? `за ${data.length} ${pluralDays(data.length)}` : 'за выбранный период'}`}
            />
            <div style={cardBase}>
              <div style={{ padding: 22 }}>
                <ChartLegend items={[
                  { color: ACCENT, label: 'Подписчики', value: subscribers[subscribers.length - 1] || 0 },
                  { color: ACCENT2, label: 'Просмотры', value: viewsTotal },
                ]} />
                <ChartPanel
                  series={[
                    { values: subscribers, color: ACCENT, gradId: 'gSubs', label: 'Подписчики' },
                    { values: views, color: ACCENT2, gradId: 'gViews', label: 'Просмотры' },
                  ]}
                  dates={data.map(d => d.snapshot_date)}
                />
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <div style={chartsTwoCol}>
              <div style={cardBase}>
                <div style={{ padding: 22 }}>
                  <ChartLegend items={[{ color: SUCCESS, label: 'ER %', value: `${erAvg.toFixed(1)}%` }]} />
                  <ChartPanel
                    series={[{ values: erByDay, color: SUCCESS, gradId: 'gEr', label: 'ER %', isPercent: true }]}
                    dates={data.map(d => d.snapshot_date)}
                  />
                </div>
              </div>
              <div style={cardBase}>
                <div style={{ padding: 22 }}>
                  <ChartLegend items={[{ color: WARNING, label: 'Комментарии', value: commentsTotal }]} />
                  <ChartPanel
                    series={[{ values: commentsByDay, color: WARNING, gradId: 'gCom', label: 'Комментарии' }]}
                    dates={data.map(d => d.snapshot_date)}
                  />
                </div>
              </div>
            </div>
          </section>

          {subsDynamics.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <SectionHeader
                title="Динамика подписчиков"
                subtitle="Последние 14 снимков с приростом"
              />
              <div style={cardBase}>
                <div style={{ padding: 6 }}>
                  {subsDynamics.map((d, i) => {
                    const prev = subsDynamics[i + 1];
                    const diff = prev ? (d.subscribers_count || 0) - (prev.subscribers_count || 0) : 0;
                    const isLast = i === subsDynamics.length - 1;
                    return (
                      <div key={d.snapshot_date} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 18px',
                        borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={dateBubble}>
                            {d.snapshot_date?.slice(8, 10)}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: DARK, letterSpacing: '-0.01em' }}>
                              {formatDate(d.snapshot_date)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 1 }}>
                              {d.snapshot_date}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
                            {(d.subscribers_count || 0).toLocaleString('ru-RU')}
                          </span>
                          {diff !== 0 && (
                            <span style={pill(
                              diff > 0 ? `${SUCCESS}15` : `${DANGER}15`,
                              diff > 0 ? SUCCESS : DANGER,
                            )}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: diff > 0 ? SUCCESS : DANGER }} />
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {summary?.top_posts?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <SectionHeader
                title="Топ постов по просмотрам"
                subtitle="10 самых просматриваемых публикаций"
              />
              <div style={cardBase}>
                <div style={{ padding: 6 }}>
                  {summary.top_posts.map((p, i) => {
                    const meta = POST_TYPE_META[p.post_type] || POST_TYPE_META.content;
                    const isLast = i === summary.top_posts.length - 1;
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px',
                        borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
                        gap: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                          <div style={{
                            ...rankBadge,
                            background: i < 3 ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : SOFT_BG,
                            color: i < 3 ? '#fff' : MUTED,
                            boxShadow: i < 3 ? `0 4px 10px ${ACCENT}30` : 'none',
                          }}>
                            {i + 1}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: '0.92rem', fontWeight: 600, color: DARK, letterSpacing: '-0.01em',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {p.title || 'Без названия'}
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                              <span style={pill(meta.bg, meta.color)}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color }} />
                                {meta.label}
                              </span>
                              {p.erid && (
                                <span style={pill(`${SUCCESS}12`, SUCCESS)}>
                                  ERID: {p.erid}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: DARK, letterSpacing: '-0.03em', lineHeight: 1 }}>
                            {(p.views_count || 0).toLocaleString('ru-RU')}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            просмотров
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <style>{`
        @keyframes anFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes anFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes anHalo { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.15); opacity: 0.2; } }
        @keyframes anPulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }
        .an-period-pill:hover { transform: translateY(-1px); }
        .an-metric-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {subtitle && <div style={sectionSubStyle}>{subtitle}</div>}
    </div>
  );
}

function MetricCard({ label, value, trendValue, trendLabel, trendIsPercent, trendIsTotal, trendChip, isPercent, icon, color, delay }) {
  const showTrend = trendValue !== null && trendValue !== undefined && trendValue !== 0;
  const isPositive = (trendValue || 0) >= 0;
  const trendColor = isPositive ? SUCCESS : DANGER;
  const formattedValue = isPercent
    ? `${(value || 0).toFixed(1)}%`
    : (value || 0).toLocaleString('ru-RU');

  return (
    <div className="an-metric-card" style={{
      ...cardBase,
      padding: 20,
      animation: `anFadeUp 0.4s ease ${delay} both`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 12px ${color}30`, marginBottom: 14,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div style={{
        fontSize: '0.7rem', color: MUTED, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '2rem', fontWeight: 800, color: DARK,
        letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        {formattedValue}
      </div>
      {(showTrend || trendChip) && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {showTrend && (
            <span style={pill(`${trendColor}12`, trendColor)}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: trendColor }} />
              {isPositive ? '↑' : '↓'} {trendIsPercent ? `${Math.abs(trendValue)}%` : trendIsTotal ? Math.abs(trendValue).toLocaleString('ru-RU') : `${trendValue > 0 ? '+' : ''}${trendValue}`}
            </span>
          )}
          {trendChip && !showTrend && (
            <span style={pill(SOFT_BG, MUTED)}>{trendChip}</span>
          )}
          <span style={{ fontSize: '0.74rem', color: MUTED }}>
            {trendLabel}
          </span>
        </div>
      )}
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map(it => (
        <span key={it.label} style={pill(`${it.color}12`, it.color)}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color }} />
          {it.label}
          {it.value !== undefined && (
            <b style={{ marginLeft: 4, letterSpacing: '-0.02em', color: DARK }}>
              {typeof it.value === 'number' ? it.value.toLocaleString('ru-RU') : it.value}
            </b>
          )}
        </span>
      ))}
    </div>
  );
}

function ChartPanel({ series, dates }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const allValues = series.flatMap(s => s.values);
  if (allValues.length === 0) {
    return (
      <div style={{
        background: SOFT_BG, borderRadius: 12,
        padding: '60px 20px', textAlign: 'center',
        color: MUTED, fontSize: '0.85rem',
      }}>
        Нет данных за выбранный период
      </div>
    );
  }

  const maxVal = Math.max(...allValues, 1);
  const len = series[0].values.length;
  const w = 600;
  const h = 140;
  const pad = { top: 8, bottom: 18, left: 8, right: 8 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const toX = (i) => pad.left + (i / Math.max(len - 1, 1)) * cw;
  const toY = (v) => pad.top + ch - (v / maxVal) * ch;

  const makePath = (values) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const makeArea = (values) => {
    const line = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' L');
    return `M${toX(0).toFixed(1)},${(pad.top + ch).toFixed(1)} L${line} L${toX(len - 1).toFixed(1)},${(pad.top + ch).toFixed(1)} Z`;
  };

  const xLabelIdx = len > 1
    ? [0, Math.floor(len / 4), Math.floor(len / 2), Math.floor(len * 3 / 4), len - 1]
    : [0];

  return (
    <div style={{
      background: SOFT_BG, borderRadius: 12,
      padding: '14px 14px 8px', position: 'relative',
    }}>
      <div ref={ref} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h + 4}`} style={{ width: '100%', height: 'auto', maxHeight: 220, display: 'block' }}
          onMouseMove={e => {
            const rect = ref.current?.getBoundingClientRect();
            if (!rect) return;
            const x = ((e.clientX - rect.left) / rect.width) * w;
            const idx = Math.round(((x - pad.left) / cw) * (len - 1));
            if (idx >= 0 && idx < len) {
              const pct = (e.clientX - rect.left) / rect.width * 100;
              setHover({ idx, pct });
            }
          }}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75].map(r => (
            <line key={r} x1={pad.left} x2={w - pad.right} y1={pad.top + ch * (1 - r)} y2={pad.top + ch * (1 - r)}
              stroke={BORDER} strokeWidth="0.6" strokeDasharray="3,4" />
          ))}
          {series.map(s => (
            <path key={`area-${s.gradId}`} d={makeArea(s.values)} fill={`url(#${s.gradId})`} />
          ))}
          {series.map(s => (
            <path key={`line-${s.gradId}`} d={makePath(s.values)} fill="none"
              stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {hover && (
            <line x1={toX(hover.idx)} x2={toX(hover.idx)}
              y1={pad.top} y2={pad.top + ch}
              stroke={MUTED} strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6" />
          )}
          {series.map(s => s.values.map((v, i) => {
            const isHovered = hover?.idx === i;
            if (v === 0 && !isHovered) return null;
            return (
              <circle key={`${s.gradId}-${i}`}
                cx={toX(i)} cy={toY(v)}
                r={isHovered ? 4.5 : 2.6}
                fill={s.color}
                stroke="#fff" strokeWidth={isHovered ? 2 : 0}
                opacity={isHovered ? 1 : 0.85} />
            );
          }))}
          {xLabelIdx.map(i => {
            const d = dates[i];
            if (!d) return null;
            return (
              <text key={i} x={toX(i)} y={h - 2} textAnchor="middle"
                fontSize="9" fill={MUTED} fontWeight="500">
                {d.slice(5)}
              </text>
            );
          })}
        </svg>
        {hover && dates[hover.idx] && (
          <div style={{
            position: 'absolute', top: -8,
            left: `${hover.pct}%`,
            transform: hover.pct > 75 ? 'translateX(-100%)' : hover.pct < 12 ? 'translateX(0)' : 'translateX(-50%)',
            background: '#fff', border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
            fontSize: '0.75rem', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: DARK, letterSpacing: '-0.01em' }}>
              {formatDate(dates[hover.idx])}
            </div>
            <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
              {series.map(s => (
                <span key={s.label} style={{ color: s.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                  <span style={{ color: MUTED }}>{s.label}:</span>
                  <b style={{ color: DARK, letterSpacing: '-0.01em' }}>
                    {s.isPercent
                      ? `${Number(s.values[hover.idx] || 0).toFixed(2)}%`
                      : Number(s.values[hover.idx] || 0).toLocaleString('ru-RU')}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, desc }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '64px 24px',
      border: `1px solid ${BORDER}`, textAlign: 'center', position: 'relative', overflow: 'hidden',
      width: '100%',
    }}>
      <div aria-hidden style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 26px' }}>
        <div style={{
          position: 'absolute', inset: -10, borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}25 0%, transparent 70%)`,
          animation: 'anHalo 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          boxShadow: `0 12px 32px ${ACCENT}40`,
          animation: 'anPulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 18, borderRadius: '50%',
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <rect x="7" y="12" width="3" height="6" rx="0.5" fill={`${ACCENT2}30`} />
            <rect x="12" y="8" width="3" height="10" rx="0.5" fill={`${ACCENT}30`} />
            <rect x="17" y="14" width="3" height="4" rx="0.5" fill={`${SUCCESS}30`} />
          </svg>
        </div>
      </div>
      <h3 style={{
        margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800,
        color: DARK, letterSpacing: '-0.03em',
      }}>
        {title}
      </h3>
      <p style={{
        color: MUTED, fontSize: '0.92rem',
        maxWidth: 420, margin: '0 auto', lineHeight: 1.55,
      }}>
        {desc}
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return s;
  }
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

// ─── Style tokens ─────────────────────────────────────────────────────

const pageHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  gap: 16, flexWrap: 'wrap', marginBottom: 24,
};

const pageTitle = {
  margin: 0, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.1,
};

const pageSubtitle = {
  margin: '6px 0 0', fontSize: '0.92rem', color: MUTED, lineHeight: 1.5,
};

const periodWrap = {
  display: 'inline-flex', gap: 4, padding: 4,
  background: '#fff', border: `1px solid ${BORDER}`,
  borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const periodPill = {
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: '#fff', color: MUTED,
  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  transition: 'background .15s ease, color .15s ease, transform .15s ease',
  fontFamily: 'inherit',
};

const periodPillActive = {
  ...periodPill,
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff',
  boxShadow: `0 4px 12px ${ACCENT}35`,
};

const metricGrid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14,
};

const chartsTwoCol = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14,
};

const dateBubble = {
  width: 38, height: 38, borderRadius: 10,
  background: SOFT_BG, color: DARK,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.02em',
  flexShrink: 0,
};

const rankBadge = {
  width: 32, height: 32, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.85rem', fontWeight: 800, letterSpacing: '-0.01em',
  flexShrink: 0,
};

const loadingWrap = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '80px 20px', textAlign: 'center',
};

const loadingPulse = {
  width: 48, height: 48, borderRadius: '50%',
  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
  animation: 'anPulse 1.4s ease-in-out infinite',
  boxShadow: `0 8px 24px ${ACCENT}40`,
};
