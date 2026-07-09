export default function UploadProgress({ progress, label = 'Загрузка файла…' }) {
  const ACCENT = '#4F46E5';
  const ACCENT2 = '#7C3AED';
  const MUTED = '#6b7280';
  const BORDER = '#e5e7eb';
  const SOFT_BG = '#f5f5f7';
  const pct = Math.max(0, Math.min(100, progress || 0));
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.78rem', color: MUTED, marginBottom: 6,
      }}>
        <span>{label}</span>
        <span style={{ color: ACCENT, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {pct}%
        </span>
      </div>
      <div style={{
        width: '100%', height: 8, background: SOFT_BG,
        borderRadius: 999, overflow: 'hidden', border: `1px solid ${BORDER}`,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
          borderRadius: 999,
          transition: 'width 0.2s',
          boxShadow: `0 0 12px ${ACCENT}55`,
        }} />
      </div>
    </div>
  );
}
