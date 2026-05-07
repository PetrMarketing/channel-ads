import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const TABS = [
  { id: 'progress', label: 'Прогресс', emoji: '📈' },
  { id: 'badges', label: 'Достижения', emoji: '🏅' },
  { id: 'race', label: 'Гонка каналов', emoji: '🏁' },
];

const SKILL_EMOJI = {
  landing: '🌐',
  text: '📝',
  image: '🖼',
};

export default function AchievementsPage() {
  const { currentChannel } = useChannels();
  const [tab, setTab] = useState('progress');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const tc = currentChannel?.tracking_code;

  const load = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const res = await api.get(`/channels/${tc}/levels`);
      if (res.success) setData(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [tc]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ animation: 'achFade 0.4s ease' }}>
      <style>{`
        @keyframes achFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes achFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes achPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(123,104,238,0.5); } 50% { box-shadow: 0 0 0 10px rgba(123,104,238,0); } }
        @keyframes achShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* Hero */}
      <section style={{
        position: 'relative',
        marginBottom: 24,
        padding: '24px 26px',
        borderRadius: 18,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${ACCENT}10 0%, ${ACCENT2}14 100%)`,
        border: `1px solid ${ACCENT2}25`,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', fontWeight: 700, color: ACCENT2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            🏆 Достижения канала
          </div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: DARK, letterSpacing: '-0.03em' }}>
            {currentChannel?.title || 'Канал не выбран'}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '0.92rem', color: MUTED, maxWidth: 560, lineHeight: 1.5 }}>
            Прокачивайте навыки канала — чем выше уровень, тем дешевле ИИ-генерации и подписка.
          </p>
        </div>
        {data && (
          <OverallLevelBadge
            level={data.overall_level}
            price={data.subscription_price}
            priceNext={data.subscription_price_next}
            priceDefault={data.subscription_price_default}
          />
        )}
      </section>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 20,
        padding: 4, borderRadius: 12,
        background: SOFT_BG, border: `1px solid ${BORDER}`,
        width: 'fit-content',
        flexWrap: 'wrap',
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600,
                color: active ? '#fff' : DARK,
                background: active ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : 'transparent',
                boxShadow: active ? `0 3px 10px ${ACCENT}30` : 'none',
                transition: 'all .15s ease',
              }}
            >
              <span>{t.emoji}</span>{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'progress' && (
        !tc ? <ComingSoon emoji="📺" title="Выберите канал" desc="В шапке выберите канал, чтобы увидеть прогресс." />
        : loading ? <ComingSoon emoji="⏳" title="Загружаем" desc="Минутку…" />
        : data ? <ProgressTab data={data} /> : <ComingSoon emoji="📈" title="Прогресс канала" desc="Не удалось загрузить данные." />
      )}
      {tab === 'badges' && <ComingSoon emoji="🏅" title="Достижения" desc="Награды за активность канала." />}
      {tab === 'race' && <ComingSoon emoji="🏁" title="Гонка каналов" desc="Сезонный рейтинг лучших каналов сервиса." />}
    </div>
  );
}

function OverallLevelBadge({ level, price, priceNext, priceDefault }) {
  const discount = priceDefault > 0 ? Math.round(((priceDefault - price) / priceDefault) * 100) : 0;
  return (
    <div style={{
      padding: '14px 18px',
      borderRadius: 14,
      background: '#fff',
      border: `1px solid ${ACCENT}30`,
      boxShadow: `0 4px 16px ${ACCENT}15`,
      display: 'flex', alignItems: 'center', gap: 14,
      minWidth: 240,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: 14,
        background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '1.3rem', fontWeight: 800,
        boxShadow: `0 4px 12px ${ACCENT}40`,
        animation: 'achPulse 2.5s ease-in-out infinite',
        flexShrink: 0,
      }}>
        {level}
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Уровень канала</div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: DARK }}>
          {price} ₽<span style={{ fontSize: '0.78rem', fontWeight: 500, color: MUTED }}> /мес</span>
        </div>
        {priceNext != null ? (
          <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: 2 }}>
            На {level + 1} уровне → <span style={{ color: SUCCESS, fontWeight: 700 }}>{priceNext} ₽/мес</span>
          </div>
        ) : (
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: SUCCESS, marginTop: 2 }}>
            🎉 Максимальный уровень
          </div>
        )}
        {discount > 0 && (
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: SUCCESS, marginTop: 2 }}>−{discount}% к подписке</div>
        )}
      </div>
    </div>
  );
}

function ProgressTab({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.skills.map((s, i) => (
        <SkillCard key={s.skill} s={s} delay={`${0.05 + i * 0.05}s`} />
      ))}
      <div style={{
        marginTop: 6, padding: '12px 16px', borderRadius: 12,
        background: SOFT_BG, border: `1px dashed ${BORDER}`,
        fontSize: '0.84rem', color: MUTED, lineHeight: 1.5,
      }}>
        💡 Уровень канала = минимум по всем 3 навыкам. Чтобы получить максимум — качайте все три.
        Создание ТЗ за 1 токен в счёт прокачки <b>не идёт</b>.
      </div>
    </div>
  );
}

function SkillCard({ s, delay }) {
  const isMax = s.is_max;
  const period = s.period_count || 0;
  const thr = s.next_threshold || 1;
  const pct = isMax ? 100 : Math.min(100, Math.round((period / thr) * 100));
  return (
    <div style={{
      padding: '18px 20px',
      borderRadius: 16,
      background: '#fff',
      border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      animation: `achFadeUp 0.4s ease ${delay} both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `linear-gradient(135deg, ${ACCENT}15, ${ACCENT2}20)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', flexShrink: 0,
        }}>{SKILL_EMOJI[s.skill] || '⚡'}</div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: DARK, letterSpacing: '-0.01em' }}>
            {s.label}
          </div>
          <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 2 }}>
            Всего сгенерировано: <b style={{ color: DARK }}>{s.total_count}</b>
          </div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 20,
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          color: '#fff', fontSize: '0.78rem', fontWeight: 700,
          letterSpacing: '0.02em',
          boxShadow: `0 2px 8px ${ACCENT}30`,
        }}>
          Уровень {s.level}/5
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'relative', width: '100%', height: 12, borderRadius: 999,
        background: SOFT_BG, border: `1px solid ${BORDER}`,
        overflow: 'hidden', marginBottom: 10,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: isMax
            ? `linear-gradient(90deg, ${SUCCESS}, #34d399)`
            : `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
          borderRadius: 999,
          transition: 'width 0.5s ease',
          boxShadow: isMax ? `0 0 8px ${SUCCESS}55` : `0 0 8px ${ACCENT2}55`,
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.82rem', color: DARK }}>
          {isMax ? (
            <span style={{ color: SUCCESS, fontWeight: 700 }}>🎉 Максимальный уровень</span>
          ) : (
            <>
              <b>{period}</b> / {thr} {pluralize(s.unit, thr)} до уровня {s.level + 1}
              <span style={{ color: MUTED, marginLeft: 8 }}>(осталось {Math.max(0, thr - period)})</span>
            </>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem',
        }}>
          <span style={{
            padding: '3px 10px', borderRadius: 16,
            background: `${ACCENT}10`, color: ACCENT, fontWeight: 700,
          }}>
            {s.current_cost} ИИ-токенов
          </span>
          {!isMax && s.next_cost != null && (
            <span style={{ color: MUTED }}>
              → <span style={{ color: SUCCESS, fontWeight: 700 }}>{s.next_cost}</span> на следующем
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function pluralize(word, n) {
  // "лендинг" / "лендингов", "текст" / "текстов", "картинка" / "картинок"
  const last = n % 10;
  const teen = n % 100;
  if (teen >= 11 && teen <= 14) return word + (word.endsWith('а') ? '' : 'ов');
  if (last === 1) return word;
  if (word === 'картинка') return last >= 2 && last <= 4 ? 'картинки' : 'картинок';
  return last >= 2 && last <= 4 ? word + 'а' : word + 'ов';
}

function ComingSoon({ emoji, title, desc }) {
  return (
    <div style={{
      padding: '56px 32px', textAlign: 'center',
      borderRadius: 16, background: '#fff',
      border: `1px solid ${BORDER}`,
      animation: 'achFadeUp 0.4s ease both',
    }}>
      <div style={{ fontSize: '3.4rem', marginBottom: 14 }}>{emoji}</div>
      <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
        {title}
      </h3>
      <p style={{ margin: '0 auto', fontSize: '0.92rem', color: MUTED, maxWidth: 420, lineHeight: 1.55 }}>
        {desc}
      </p>
      <div style={{
        display: 'inline-block', marginTop: 18,
        padding: '6px 14px', borderRadius: 20,
        background: `${WARNING}15`, color: WARNING,
        fontSize: '0.78rem', fontWeight: 700,
      }}>
        Скоро
      </div>
    </div>
  );
}
