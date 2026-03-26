import Modal from '../../components/Modal';
import WorkingHoursEditor from './WorkingHoursEditor';
import { api } from '../../services/api';

export default function SpecialistsTab({
  specialists, branches, services, tc, showToast, loadSpecialists, loadSpecialistServices, btnSmall,
  showSpecialistModal, setShowSpecialistModal,
  editingSpecialist, setEditingSpecialist,
  specialistForm, setSpecialistForm,
  specialistPhoto, setSpecialistPhoto,
  specialistServices, setSpecialistServices,
  specialistCustomPrices, setSpecialistCustomPrices,
  savingSpecialist, saveSpecialist,
}) {
  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Специалисты</h2>
        <button className="btn btn-primary" onClick={() => { setEditingSpecialist(null); setSpecialistForm({ name: '', position: '', phone: '', email: '', branch_id: '', description: '', max_bookings_per_day: 10, working_hours: {} }); setSpecialistPhoto(null); setSpecialistServices([]); setSpecialistCustomPrices({}); setShowSpecialistModal(true); }}>
          + Добавить
        </button>
      </div>
      {specialists.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет специалистов.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {specialists.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} /> :
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{(s.name || 'С')[0]}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.position || ''} {s.branch_name ? `· ${s.branch_name}` : ''}</div>
            </div>
            <span className={`pc-badge ${s.status === 'working' ? 'success' : 'warning'}`}>{s.status === 'working' ? 'Работает' : s.status === 'vacation' ? 'Отпуск' : 'Уволен'}</span>
            <button className="btn btn-outline" style={btnSmall} onClick={() => { setEditingSpecialist(s); setSpecialistForm({ name: s.name || '', position: s.position || '', phone: s.phone || '', email: s.email || '', branch_id: s.branch_id || '', description: s.description || '', max_bookings_per_day: s.max_bookings_per_day || 10, working_hours: s.working_hours || {} }); setSpecialistPhoto(null); loadSpecialistServices(s.id); setShowSpecialistModal(true); }}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={async () => { if (!window.confirm('Удалить?')) return; await api.delete(`/services/${tc}/specialists/${s.id}`); loadSpecialists(); }}>Удалить</button>
          </div>
        ))}
      </div>

      {/* Specialist Modal */}
      <Modal isOpen={showSpecialistModal} onClose={() => setShowSpecialistModal(false)} title={editingSpecialist ? 'Редактировать специалиста' : 'Новый специалист'}>
        <div className="modal-form">
          {/* Photo upload */}
          <div className="form-group">
            <label>Фото</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {(specialistPhoto || editingSpecialist?.photo_url) ? (
                <img src={specialistPhoto ? URL.createObjectURL(specialistPhoto) : editingSpecialist.photo_url}
                  alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                  {(specialistForm.name || 'С')[0]}
                </div>
              )}
              <label className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', cursor: 'pointer' }}>
                Загрузить фото
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setSpecialistPhoto(e.target.files[0] || null)} />
              </label>
              {specialistPhoto && <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '0.78rem' }} onClick={() => setSpecialistPhoto(null)}>Убрать</button>}
            </div>
          </div>
          <div className="form-group"><label>ФИО *</label><input className="form-input" value={specialistForm.name} onChange={e => setSpecialistForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-group"><label>Должность</label><input className="form-input" value={specialistForm.position} onChange={e => setSpecialistForm(p => ({ ...p, position: e.target.value }))} placeholder="Парикмахер" /></div>
          <div className="form-group">
            <label>Филиал</label>
            <select className="form-input" value={specialistForm.branch_id} onChange={e => setSpecialistForm(p => ({ ...p, branch_id: e.target.value }))}>
              <option value="">Не выбран</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Телефон</label><input className="form-input" value={specialistForm.phone} onChange={e => setSpecialistForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input className="form-input" value={specialistForm.email} onChange={e => setSpecialistForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Описание</label><textarea className="form-input" rows={2} value={specialistForm.description} onChange={e => setSpecialistForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="form-group"><label>Макс. записей в день</label><input type="number" className="form-input" value={specialistForm.max_bookings_per_day} onChange={e => setSpecialistForm(p => ({ ...p, max_bookings_per_day: e.target.value }))} /></div>
          <div className="form-group">
            <label>Рабочие часы</label>
            <WorkingHoursEditor value={specialistForm.working_hours} onChange={wh => setSpecialistForm(p => ({ ...p, working_hours: wh }))} />
          </div>
          {/* Specialist services */}
          {services.length > 0 && (
            <div className="form-group">
              <label>Услуги специалиста</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8 }}>
                {services.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={specialistServices.includes(s.id)}
                      onChange={e => {
                        if (e.target.checked) setSpecialistServices(p => [...p, s.id]);
                        else setSpecialistServices(p => p.filter(id => id !== s.id));
                      }} />
                    <span style={{ flex: 1, fontSize: '0.88rem' }}>{s.name} ({Number(s.price).toLocaleString('ru-RU')} ₽)</span>
                    {specialistServices.includes(s.id) && (
                      <input type="number" className="form-input" placeholder="Своя цена"
                        style={{ width: 100, padding: '4px 8px', fontSize: '0.8rem' }}
                        value={specialistCustomPrices[s.id] || ''}
                        onChange={e => setSpecialistCustomPrices(p => ({ ...p, [s.id]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-primary" onClick={saveSpecialist} disabled={savingSpecialist} style={{ marginTop: 12 }}>{savingSpecialist ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </Modal>
    </div>
  );
}
