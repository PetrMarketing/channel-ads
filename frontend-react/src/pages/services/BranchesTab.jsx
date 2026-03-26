import Modal from '../../components/Modal';
import WorkingHoursEditor from './WorkingHoursEditor';
import { api } from '../../services/api';

export default function BranchesTab({
  branches, tc, showToast, loadBranches, btnSmall,
  showBranchModal, setShowBranchModal,
  editingBranch, setEditingBranch,
  branchForm, setBranchForm,
  savingBranch, saveBranch,
}) {
  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Филиалы</h2>
        <button className="btn btn-primary" onClick={() => { setEditingBranch(null); setBranchForm({ name: '', city: '', address: '', phone: '', email: '', buffer_time: 0, working_hours: {} }); setShowBranchModal(true); }}>
          + Добавить
        </button>
      </div>
      {branches.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет филиалов. Добавьте первый.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {branches.map(b => {
          const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
          const branchLink = `https://max.ru/${maxBotUsername}?startapp=book_${tc}_${b.id}`;
          return (
          <div key={b.id} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#4F46E5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                {(b.name || 'Ф')[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{b.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{[b.city, b.address].filter(Boolean).join(', ')}</div>
              </div>
              <span className={`pc-badge ${b.is_active ? 'success' : 'warning'}`}>{b.is_active ? 'Активен' : 'Неактивен'}</span>
              <button className="btn btn-outline" style={btnSmall} onClick={() => { setEditingBranch(b); setBranchForm({ name: b.name || '', city: b.city || '', address: b.address || '', phone: b.phone || '', email: b.email || '', buffer_time: b.buffer_time || 0, working_hours: b.working_hours || {} }); setShowBranchModal(true); }}>Ред.</button>
              <button className="btn btn-danger" style={btnSmall} onClick={async () => { if (!window.confirm('Удалить филиал?')) return; await api.delete(`/services/${tc}/branches/${b.id}`); loadBranches(); }}>Удалить</button>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Miniapp:</span>
              <code style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'var(--bg)', borderRadius: 4, cursor: 'pointer', wordBreak: 'break-all' }}
                onClick={() => { navigator.clipboard.writeText(branchLink); showToast('Ссылка скопирована'); }}
                title="Нажмите для копирования"
              >{branchLink}</code>
            </div>
          </div>
          );
        })}
      </div>

      {/* Branch Modal */}
      <Modal isOpen={showBranchModal} onClose={() => setShowBranchModal(false)} title={editingBranch ? 'Редактировать филиал' : 'Новый филиал'}>
        <div className="modal-form">
          <div className="form-group"><label>Название *</label><input className="form-input" value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} placeholder="Салон на Невском" /></div>
          <div className="form-group"><label>Город</label><input className="form-input" value={branchForm.city} onChange={e => setBranchForm(p => ({ ...p, city: e.target.value }))} placeholder="Москва" /></div>
          <div className="form-group"><label>Адрес</label><input className="form-input" value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} placeholder="ул. Примерная, 1" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Телефон</label><input className="form-input" value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input className="form-input" value={branchForm.email} onChange={e => setBranchForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Буферное время между записями (мин)</label><input type="number" className="form-input" value={branchForm.buffer_time} onChange={e => setBranchForm(p => ({ ...p, buffer_time: e.target.value }))} /></div>
          <div className="form-group">
            <label>Рабочие часы</label>
            <WorkingHoursEditor value={branchForm.working_hours} onChange={wh => setBranchForm(p => ({ ...p, working_hours: wh }))} />
          </div>
          <button className="btn btn-primary" onClick={saveBranch} disabled={savingBranch} style={{ marginTop: 12 }}>{savingBranch ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </Modal>
    </div>
  );
}
