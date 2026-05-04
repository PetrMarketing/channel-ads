import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal через React Portal в document.body — обходит проблему с position:fixed
 * под родителями с CSS transform (страничные анимации translateY ломают
 * fixed-позиционирование, модалка прилипает к контейнеру вкладок вместо
 * viewport). + JS-вычисление реальной высоты окна (vh врёт на iOS Safari
 * из-за адресной строки).
 */
export default function Modal({ isOpen, onClose, title, children, wide, footer }) {
  const [vh, setVh] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );

  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    const onResize = () => setVh(window.innerHeight);
    setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // Реальная высота модалки = 85% от настоящего viewport, но не меньше 360px.
  const modalMaxHeight = Math.max(360, Math.floor(vh * 0.85));

  const node = (
    <div
      className="modal-overlay active"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
        overflow: 'hidden',
        background: 'rgba(26, 26, 46, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: wide ? 800 : 520,
          maxHeight: `${modalMaxHeight}px`,
          height: 'auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div
          className="modal-body"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
        {footer && (
          <div className="modal-footer" style={{ flexShrink: 0 }}>{footer}</div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
