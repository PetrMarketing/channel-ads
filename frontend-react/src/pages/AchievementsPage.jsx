import { useState } from 'react';
import { useChannels } from '../contexts/ChannelContext';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const TABS = [
  { id: 'progress', label: 'Прогресс', emoji: '📈' },
  { id: 'badges', label: 'Достижения', emoji: '🏅' },
  { id: 'race', label: 'Гонка каналов', emoji: '🏁' },
];

export default function AchievementsPage() {
  const { currentChannel } = useChannels();
  const [tab, setTab] = useState('progress');

  return (
    <div style={{ animation: 'achFade 0.4s ease' }}>
      <style>{`
        @keyframes achFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes achFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Hero */}
      <section style={{
        position: 'relative',
        marginBottom: 24,
        padding: '28px 28px 24px',
        borderRadius: 18,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${ACCENT}10 0%, ${ACCENT2}14 100%)`,
        border: `1px solid ${ACCENT2}25`,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', fontWeight: 700, color: ACCENT2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          🏆 Достижения канала
        </div>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: DARK, letterSpacing: '-0.03em' }}>
          {currentChannel?.title || 'Канал не выбран'}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: '0.92rem', color: MUTED, maxWidth: 560, lineHeight: 1.5 }}>
          Прокачивайте навыки канала — чем выше уровень, тем дешевле ИИ-генерации и подписка.
        </p>
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

      {tab === 'progress' && <ComingSoon emoji="📈" title="Прогресс канала" desc="Скоро здесь появятся уровни по ИИ Лендингам, Текстам и Картинкам." />}
      {tab === 'badges' && <ComingSoon emoji="🏅" title="Достижения" desc="Награды за активность канала." />}
      {tab === 'race' && <ComingSoon emoji="🏁" title="Гонка каналов" desc="Сезонный рейтинг лучших каналов сервиса." />}
    </div>
  );
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
