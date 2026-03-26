const STATUS_LABELS = { draft: 'Черновик', scheduled: 'Запланировано', sending: 'Отправляется', completed: 'Отправлено' };
const STATUS_COLORS = { draft: '#888', scheduled: '#3b82f6', sending: '#f59e0b', completed: 'var(--success)' };

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };

const dropdownMenuStyle = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: '4px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  zIndex: 100,
  minWidth: '180px',
  overflow: 'hidden',
};

const dropdownItemStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  fontSize: '0.85rem',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

export default function BroadcastCard({
  broadcast: b,
  openDropdownId,
  setOpenDropdownId,
  dropdownRef,
  onEdit,
  onSend,
  onDelete,
  onStats,
  onCopy,
  onEditSentOpen,
  onDeleteSent,
}) {
  const renderMoreDropdown = () => {
    const isOpen = openDropdownId === b.id;
    return (
      <div style={{ position: 'relative' }} ref={isOpen ? dropdownRef : null}>
        <button
          className="btn btn-outline"
          style={btnSmall}
          onClick={() => setOpenDropdownId(isOpen ? null : b.id)}
        >
          Ещё ▾
        </button>
        {isOpen && (
          <div style={dropdownMenuStyle}>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onStats(b); }}
            >
              📊 Статистика
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onCopy(b); }}
            >
              📋 Копировать
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onEdit(b); }}
            >
              ✏️ Редактировать
            </button>
            <button
              style={dropdownItemStyle}
              onClick={() => { setOpenDropdownId(null); onEditSentOpen(b); }}
            >
              ✏️ Редактировать отправленные
            </button>
            <button
              style={{ ...dropdownItemStyle, color: '#ef4444' }}
              onClick={() => { setOpenDropdownId(null); onDeleteSent(b); }}
            >
              🗑️ Удалить отправленные
            </button>
            <button
              style={{ ...dropdownItemStyle, color: '#ef4444' }}
              onClick={() => { setOpenDropdownId(null); onDelete(b.id); }}
            >
              🗑️ Удалить
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: 'var(--bg-glass)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            {b.title && <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{b.title}</span>}
            <span style={{
              fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
              background: STATUS_COLORS[b.status] || '#888', color: '#fff',
            }}>
              {STATUS_LABELS[b.status] || b.status}
            </span>
          </div>
          <div
            style={{ fontSize: '0.88rem', marginBottom: '6px', maxHeight: '80px', overflowY: 'auto', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: b.message_text || '' }}
          />
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {b.scheduled_at && <span>Запланировано: {new Date(b.scheduled_at).toLocaleString('ru-RU')}</span>}
            {b.status === 'completed' && b.sent_count != null && <span>Отправлено: {b.sent_count}/{b.total_count}</span>}
            {b.status !== 'completed' && b.target_type && <span>Цель: {b.target_type === 'all_leads' ? 'Все лиды' : b.target_type === 'specific_lead_magnet' ? 'По лид-магниту' : 'Фильтр'}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {b.status === 'draft' && (
            <>
              <button className="btn btn-outline" style={btnSmall} onClick={() => onEdit(b)}>Ред.</button>
              <button className="btn btn-primary" style={btnSmall} onClick={() => onSend(b)}>Отправить</button>
              <button className="btn btn-danger" style={btnSmall} onClick={() => onDelete(b.id)}>Удалить</button>
            </>
          )}
          {b.status === 'scheduled' && (
            <button className="btn btn-danger" style={btnSmall} onClick={() => onDelete(b.id)}>Удалить</button>
          )}
          {b.status === 'completed' && renderMoreDropdown()}
          {b.status === 'sending' && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Отправляется...</span>
          )}
        </div>
      </div>
    </div>
  );
}
