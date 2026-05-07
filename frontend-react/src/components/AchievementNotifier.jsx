/**
 * Глобальный поллер новых ачивок. Каждые 30 сек дёргает /achievements/notifications
 * и если есть свежие — показывает модалку (по одной за раз). После закрытия
 * помечает её прочитанной на бэке.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';

const TIER_THEME = {
  bronze:   { bg: '#cd7f32', glow: 'rgba(205,127,50,0.50)', label: 'Бронза' },
  silver:   { bg: '#c0c0c0', glow: 'rgba(192,192,192,0.50)', label: 'Серебро' },
  gold:     { bg: '#ffd700', glow: 'rgba(255,215,0,0.55)', label: 'Золото' },
  platinum: { bg: 'linear-gradient(135deg, #e5e4e2 0%, #b0c4de 100%)', glow: 'rgba(176,196,222,0.55)', label: 'Платина' },
};

export default function AchievementNotifier() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const seenIdsRef = useRef(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await api.get('/achievements/notifications');
      if (!res?.success) return;
      const items = (res.items || []).filter(it => !seenIdsRef.current.has(it.id));
      if (items.length === 0) return;
      items.forEach(it => seenIdsRef.current.add(it.id));
      setQueue(prev => [...prev, ...items]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [poll]);

  // Показываем по одной — следующая после закрытия предыдущей
  useEffect(() => {
    if (active) return;
    if (queue.length === 0) return;
    setActive(queue[0]);
    setQueue(q => q.slice(1));
  }, [queue, active]);

  const close = async () => {
    if (!active) return;
    try { await api.post(`/achievements/notifications/${active.id}/seen`); } catch { /* ignore */ }
    setActive(null);
  };

  const openAchievements = async () => {
    await close();
    navigate('/achievements');
  };

  if (!active) return null;
  const theme = TIER_THEME[active.tier] || TIER_THEME.bronze;

  const node = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(26, 26, 46, 0.55)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'achNotifFade 0.3s ease',
      padding: 16,
    }} onClick={close}>
      <style>{`
        @keyframes achNotifFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes achNotifPop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes achNotifPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes achNotifSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        width: 'min(440px, 100%)',
        background: '#fff', borderRadius: 24,
        padding: '40px 28px 28px',
        boxShadow: `0 24px 60px rgba(0,0,0,0.30), 0 0 60px ${theme.glow}`,
        animation: 'achNotifPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        textAlign: 'center',
      }}>
        {/* Закрыть */}
        <button onClick={close} aria-label="Закрыть" style={{
          position: 'absolute', top: 14, right: 14,
          width: 32, height: 32, borderRadius: 10,
          background: '#f5f5f5', border: 'none', cursor: 'pointer',
          fontSize: '1.2rem', color: MUTED,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Новое достижение
        </div>

        {/* Медаль */}
        <div style={{ position: 'relative', width: 112, height: 112, margin: '0 auto 18px' }}>
          <div style={{
            position: 'absolute', inset: -20, borderRadius: '50%',
            background: `radial-gradient(circle, ${theme.glow} 0%, transparent 65%)`,
            animation: 'achNotifPulse 2s ease-in-out infinite',
          }} />
          <div style={{
            position: 'relative', width: '100%', height: '100%', borderRadius: '50%',
            background: theme.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '3.5rem',
            border: '5px solid #fff',
            boxShadow: `0 10px 30px ${theme.glow}`,
          }}>
            {active.emoji}
          </div>
          <div style={{
            position: 'absolute', bottom: -6, right: -6,
            width: 38, height: 38, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            color: '#fff', fontWeight: 800, fontSize: '0.78rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '3px solid #fff',
            boxShadow: `0 4px 12px ${ACCENT}40`,
          }}>+{active.points}</div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
          {active.label}
        </h2>
        <div style={{ fontSize: '0.94rem', fontWeight: 700, color: MUTED, marginBottom: 4 }}>
          {active.tier_label || theme.label}
        </div>
        <div style={{ fontSize: '0.82rem', color: MUTED, marginBottom: 22 }}>
          Канал «{active.channel_title}» · {active.season_label}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={close} style={{
            padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
            background: '#fff', border: '1px solid #e5e7eb', color: DARK,
            fontSize: '0.88rem', fontWeight: 600,
          }}>Закрыть</button>
          <button onClick={openAchievements} style={{
            padding: '10px 18px', borderRadius: 12, cursor: 'pointer', border: 'none',
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            color: '#fff', fontSize: '0.88rem', fontWeight: 700,
            boxShadow: `0 4px 14px ${ACCENT}40`,
          }}>🏆 К достижениям</button>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
