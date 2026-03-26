import Loading from '../../components/Loading';
import BroadcastCard from './BroadcastCard';

export default function BroadcastList({
  loading,
  broadcasts,
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
  onCreateClick,
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Рассылки</h2>
        <button className="btn btn-primary" onClick={onCreateClick}>+ Создать рассылку</button>
      </div>

      {loading ? <Loading /> : broadcasts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Нет рассылок. Создайте первую рассылку.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {broadcasts.map(b => (
            <BroadcastCard
              key={b.id}
              broadcast={b}
              openDropdownId={openDropdownId}
              setOpenDropdownId={setOpenDropdownId}
              dropdownRef={dropdownRef}
              onEdit={onEdit}
              onSend={onSend}
              onDelete={onDelete}
              onStats={onStats}
              onCopy={onCopy}
              onEditSentOpen={onEditSentOpen}
              onDeleteSent={onDeleteSent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
