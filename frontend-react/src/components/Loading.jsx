export default function Loading({ text = 'Загрузка...' }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
      color: 'var(--text-secondary)',
      fontSize: '0.9rem'
    }}>
      <span className="spinner" style={{ marginRight: '10px' }} />
      {text}
    </div>
  );
}
