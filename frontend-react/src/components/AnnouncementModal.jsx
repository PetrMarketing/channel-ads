/**
 * Модалка уведомления от админа. При заходе пользователя в сервис
 * проверяет /api/announcements/active и показывает по одной непросмотренной
 * за раз. После закрытия помечает на бэке как seen.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';

export default function AnnouncementModal() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const seenRef = useRef(new Set());

  const poll = useCallback(async () => {
    try {
      const d = await api.get('/announcements/active');
      if (!d?.success) return;
      const fresh = (d.items || []).filter(it => !seenRef.current.has(it.id));
      if (fresh.length === 0) return;
      fresh.forEach(it => seenRef.current.add(it.id));
      setQueue(prev => [...prev, ...fresh]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60000); // 1 раз в минуту
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (active) return;
    if (queue.length === 0) return;
    setActive(queue[0]);
    setQueue(q => q.slice(1));
  }, [queue, active]);

  const close = async () => {
    if (!active) return;
    try { await api.post(`/announcements/${active.id}/seen`); } catch { /* ignore */ }
    setActive(null);
  };

  const onButton = async () => {
    if (!active?.button_url) return;
    const url = active.button_url;
    await close();
    if (url.startsWith('/')) {
      navigate(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!active) return null;
  const hasButton = !!(active.button_text && active.button_url);

  const node = (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(26,26,46,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      animation: 'annFade 0.25s ease',
    }}>
      <style>{`
        @keyframes annFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes annPop { from { transform: scale(0.95) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        width: 'min(480px, 100%)',
        maxHeight: '92vh', overflowY: 'auto',
        background: '#fff', borderRadius: 18,
        boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
        animation: 'annPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        overflow: 'hidden',
      }}>
        {active.image_url && (
          <img src={active.image_url} alt="" style={{
            display: 'block', width: '100%', maxHeight: 280, objectFit: 'cover',
          }} />
        )}
        <div style={{ padding: '22px 22px 20px' }}>
          <button onClick={close} aria-label="Закрыть" style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.92)', border: 'none', cursor: 'pointer',
            fontSize: '1.3rem', color: MUTED, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}>×</button>

          <h2 style={{ margin: '0 0 10px', fontSize: '1.35rem', fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>
            {active.title}
          </h2>
          {active.body && (
            <div style={{ fontSize: '0.94rem', color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {active.body}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={close} style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: '#fff', border: '1px solid #e5e7eb', color: DARK,
              fontSize: '0.88rem', fontWeight: 600,
            }}>Закрыть</button>
            {hasButton && (
              <button onClick={onButton} style={{
                padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                boxShadow: `0 4px 14px ${ACCENT}40`,
              }}>{active.button_text}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
