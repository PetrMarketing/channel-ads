/**
 * Dashboard Pro — общие стили для всех админ-страниц.
 */
export const pageTitle = {
  margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e', letterSpacing: -0.5,
};

export const pageSubtitle = {
  fontSize: 12, color: '#bbb', marginTop: 3,
};

export const card = {
  background: '#fff', borderRadius: 14, padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

export const tableWrap = {
  background: '#fff', borderRadius: 14, overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

export const th = {
  padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#999',
  fontWeight: 600, borderBottom: '1px solid #f0f0f0', letterSpacing: 0.3,
  textTransform: 'uppercase', background: '#fafbfc',
};

export const td = {
  padding: '12px 16px', fontSize: 13, borderBottom: '1px solid #f5f5f5',
  color: '#333',
};

export const badge = (bg, color) => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: 20,
  fontSize: 11, fontWeight: 600, background: bg, color,
});

export const statusBadge = (status) => {
  const map = {
    paid: ['#dcfce7', '#166534'], success: ['#dcfce7', '#166534'], completed: ['#dcfce7', '#166534'],
    active: ['#dcfce7', '#166534'], published: ['#dcfce7', '#166534'], answered: ['#dcfce7', '#166534'],
    pending: ['#fef3c7', '#92400e'], draft: ['#f3f4f6', '#6b7280'],
    escalated: ['#fef2f2', '#991b1b'], failed: ['#fef2f2', '#991b1b'],
    closed: ['#f3f4f6', '#6b7280'], generating: ['#ede9fe', '#5b21b6'],
    generated: ['#dbeafe', '#1e40af'], done: ['#dcfce7', '#166534'],
  };
  const [bg, color] = map[status] || ['#f3f4f6', '#6b7280'];
  return badge(bg, color);
};

export const periodBtn = (active) => ({
  padding: '6px 14px', borderRadius: 8, border: 'none',
  background: active ? '#4361ee' : 'transparent',
  color: active ? '#fff' : '#aaa',
  fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
  transition: 'all 0.2s',
});

export const periodWrap = {
  display: 'flex', gap: 4, background: '#fff', borderRadius: 10,
  padding: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

export const searchInput = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
  fontSize: 13, outline: 'none', background: '#fff', width: 260,
  transition: 'border-color 0.2s',
};

export const btnPrimary = {
  padding: '8px 18px', borderRadius: 10, border: 'none',
  background: '#4361ee', color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', transition: 'all 0.15s',
};

export const btnOutline = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
  background: '#fff', color: '#666', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
};

export const btnDanger = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca',
  background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
};

export const statCard = (color) => ({
  ...card, borderLeft: `3px solid ${color}`, padding: '16px 18px',
});

export const emptyState = {
  padding: '40px 20px', textAlign: 'center', color: '#bbb', fontSize: 13,
};

export const fmtDate = (d) => d ? new Date(d).toLocaleString('ru', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';

export const fmtMoney = (n) => Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0 }) + ' ₽';

export const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

export const modalBox = {
  background: '#fff', borderRadius: 16, padding: 24, minWidth: 380, maxWidth: 500,
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
};
