import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import WorkingHoursEditor from './WorkingHoursEditor';
import AddressMapPicker from '../../components/AddressMapPicker';
import { api } from '../../services/api';

export default function BranchesTab({
  branches, tc, showToast, loadBranches, btnSmall,
  showBranchModal, setShowBranchModal,
  editingBranch, setEditingBranch,
  branchForm, setBranchForm,
  savingBranch, saveBranch,
  currentChannel,
}) {
  const [policyUrl, setPolicyUrl] = useState(currentChannel?.privacy_policy_url || '');
  const [offerUrl, setOfferUrl] = useState(currentChannel?.offer_url || '');
  const [savingLegal, setSavingLegal] = useState(false);
  const hasPolicy = !!policyUrl && !!offerUrl;

  const saveLegal = async () => {
    if (!tc) return;
    setSavingLegal(true);
    try {
      await api.put(`/channels/${tc}`, { privacy_policy_url: policyUrl, offer_url: offerUrl });
      if (currentChannel) { currentChannel.privacy_policy_url = policyUrl; currentChannel.offer_url = offerUrl; }
      showToast('Сохранено');
    } catch { showToast('Ошибка', 'error'); }
    setSavingLegal(false);
  };

  const [staff, setStaff] = useState([]);
  const [managerUserId, setManagerUserId] = useState(currentChannel?.services_manager_user_id || '');
  const [managerContactUrl, setManagerContactUrl] = useState(currentChannel?.services_manager_contact_url || '');
  const [savingManager, setSavingManager] = useState(false);

  useEffect(() => {
    if (!tc) return;
    api.get(`/billing/${tc}/staff`).then(d => {
      if (d.success) setStaff(d.staff || []);
    }).catch(() => {});
  }, [tc]);

  const ownerOption = currentChannel ? { id: currentChannel.user_id, label: 'Владелец канала' } : null;
  const managerOptions = [
    ...(ownerOption ? [ownerOption] : []),
    ...staff.map(s => ({ id: s.user_id, label: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `PKid ${s.user_id}` })),
  ];

  return (
    <div className="pc-section">
      {/* Legal docs */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: 20,
      }}>
        <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Юридические документы</label>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Политика конфиденциальности *</label>
          <input className="form-input" placeholder="https://example.com/privacy"
            value={policyUrl} onChange={e => setPolicyUrl(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Договор оферты *</label>
          <input className="form-input" placeholder="https://example.com/offer"
            value={offerUrl} onChange={e => setOfferUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={saveLegal} disabled={savingLegal} style={{ width: '100%' }}>
          {savingLegal ? '...' : 'Сохранить'}
        </button>
        {(!policyUrl || !offerUrl) && (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, #e63946)', marginTop: '6px' }}>
            Без заполнения этих полей ссылки на оплату и мини-приложения не будут отображаться
          </p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Филиалы</h2>
        <button className="btn btn-primary"
          disabled={branches.some(b => b.is_online)}
          title={branches.some(b => b.is_online) ? 'Онлайн-филиал уже создан' : ''}
          onClick={() => { setEditingBranch(null); setBranchForm({ name: '', city: '', address: '', phone: '', email: '', buffer_time: 0, working_hours: {}, is_online: false, privacy_policy_url: '', offer_url: '', manager_user_id: '', manager_contact_url: '' }); setShowBranchModal(true); }}>
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
              {b.is_online && <span className="pc-badge info">Онлайн</span>}
              <span className={`pc-badge ${b.is_active ? 'success' : 'warning'}`}>{b.is_active ? 'Активен' : 'Неактивен'}</span>
              <button className="btn btn-outline" style={btnSmall} onClick={() => { setEditingBranch(b); setBranchForm({ name: b.name || '', city: b.city || '', address: b.address || '', phone: b.phone || '', email: b.email || '', buffer_time: b.buffer_time || 0, working_hours: b.working_hours || {}, is_online: !!b.is_online, privacy_policy_url: b.privacy_policy_url || '', offer_url: b.offer_url || '', manager_user_id: b.manager_user_id || '', manager_contact_url: b.manager_contact_url || '' }); setShowBranchModal(true); }}>Ред.</button>
              <button className="btn btn-danger" style={btnSmall} onClick={async () => { if (!window.confirm('Удалить филиал?')) return; await api.delete(`/services/${tc}/branches/${b.id}`); loadBranches(); }}>Удалить</button>
            </div>
            {hasPolicy && b.manager_user_id && b.manager_contact_url && (b.manager_contact_url.startsWith('https://t.me/') || b.manager_contact_url.startsWith('https://max.ru/')) ? (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Miniapp:</span>
                <code style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'var(--bg)', borderRadius: 4, cursor: 'pointer', wordBreak: 'break-all' }}
                  onClick={() => { navigator.clipboard.writeText(branchLink); showToast('Ссылка скопирована'); }}
                  title="Нажмите для копирования"
                >{branchLink}</code>
              </div>
            ) : (
              <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--error, #e63946)' }}>
                {!hasPolicy ? 'Заполните юридические документы выше' : !b.manager_user_id ? 'Назначьте менеджера в настройках филиала' : 'Укажите корректную ссылку менеджера (t.me или max.ru)'}
              </p>
            )}
          </div>
          );
        })}
      </div>

      {/* Branch Modal */}
      <Modal isOpen={showBranchModal} onClose={() => setShowBranchModal(false)} title={editingBranch ? 'Редактировать филиал' : 'Новый филиал'}>
        <div className="modal-form">
          <div className="form-group"><label>Название *</label><input className="form-input" value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} placeholder={branchForm.is_online ? 'Онлайн-консультация' : 'Салон на Невском'} /></div>

          {/* Online toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem', marginBottom: 12 }}>
            <input type="checkbox" checked={branchForm.is_online}
              disabled={!branchForm.is_online && branches.some(b => b.is_online && b.id !== editingBranch?.id)}
              onChange={e => setBranchForm(p => ({ ...p, is_online: e.target.checked }))} />
            Онлайн (без физического адреса)
          </label>

          {!branchForm.is_online && (
            <>
              <div className="form-group"><label>Город</label><input className="form-input" value={branchForm.city} onChange={e => setBranchForm(p => ({ ...p, city: e.target.value }))} placeholder="Москва" /></div>
              <div className="form-group"><label>Адрес</label><AddressMapPicker value={branchForm.address} onChange={v => setBranchForm(p => ({ ...p, address: v }))} city={branchForm.city} placeholder="Начните вводить адрес..." /></div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Телефон</label><input className="form-input" value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input className="form-input" value={branchForm.email} onChange={e => setBranchForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Буферное время между записями (мин)</label><input type="number" className="form-input" value={branchForm.buffer_time} onChange={e => setBranchForm(p => ({ ...p, buffer_time: e.target.value }))} /></div>
          <div className="form-group">
            <label>Рабочие часы</label>
            <WorkingHoursEditor value={branchForm.working_hours} onChange={wh => setBranchForm(p => ({ ...p, working_hours: wh }))} />
          </div>

          {/* Manager */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
            <div className="form-group">
              <label>Менеджер филиала *</label>
              <select className="form-input" value={branchForm.manager_user_id || ''} onChange={e => setBranchForm(p => ({ ...p, manager_user_id: e.target.value ? parseInt(e.target.value) : '' }))}>
                <option value="">-- Выберите менеджера --</option>
                {managerOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Ссылка для связи с менеджером</label>
              <input className="form-input" value={branchForm.manager_contact_url || ''} onChange={e => setBranchForm(p => ({ ...p, manager_contact_url: e.target.value }))} placeholder="https://t.me/username или https://max.ru/..." />
              {branchForm.manager_contact_url && !branchForm.manager_contact_url.startsWith('https://t.me/') && !branchForm.manager_contact_url.startsWith('https://max.ru/') && (
                <p style={{ fontSize: '0.72rem', color: 'var(--error, #e63946)', marginTop: 2 }}>Ссылка должна начинаться с https://t.me/ или https://max.ru/</p>
              )}
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>Отправляется клиенту после записи</p>
            </div>
          </div>

          {/* Legal docs per branch (optional override) */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
            <div className="form-group">
              <label>Политика конфиденциальности филиала (необязательно)</label>
              <input className="form-input" value={branchForm.privacy_policy_url} onChange={e => setBranchForm(p => ({ ...p, privacy_policy_url: e.target.value }))} placeholder="Если отличается от основной" />
            </div>
            <div className="form-group">
              <label>Договор оферты филиала (необязательно)</label>
              <input className="form-input" value={branchForm.offer_url} onChange={e => setBranchForm(p => ({ ...p, offer_url: e.target.value }))} placeholder="Если отличается от основного" />
            </div>
          </div>

          <button className="btn btn-primary" onClick={saveBranch} disabled={savingBranch} style={{ marginTop: 12 }}>{savingBranch ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </Modal>
    </div>
  );
}
