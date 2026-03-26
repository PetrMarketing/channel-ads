import Modal from '../../components/Modal';
import { api } from '../../services/api';

export default function ServicesListTab({
  services, categories, tc, showToast, loadServices, loadCategories, btnSmall,
  showServiceModal, setShowServiceModal,
  editingService, setEditingService,
  serviceForm, setServiceForm,
  serviceImage, setServiceImage,
  savingService, saveService,
  showCategoryModal, setShowCategoryModal,
  categoryForm, setCategoryForm,
}) {
  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2>Услуги</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => { setCategoryForm({ name: '', parent_id: '' }); setShowCategoryModal(true); }}>+ Категория</button>
          <button className="btn btn-primary" onClick={() => { setEditingService(null); setServiceForm({ name: '', description: '', category_id: '', service_type: 'single', duration_minutes: 60, price: '', max_participants: 1, cancel_hours: 24, color: '#4F46E5' }); setShowServiceModal(true); }}>+ Услуга</button>
        </div>
      </div>
      {services.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет услуг.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {services.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${s.color || '#4F46E5'}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {s.duration_minutes} мин · {Number(s.price).toLocaleString('ru-RU')} ₽
                {s.service_type === 'group' && ` · до ${s.max_participants} чел.`}
                {s.service_type === 'subscription' && ' · абонемент'}
                {s.category_name && ` · ${s.category_name}`}
              </div>
            </div>
            <button className="btn btn-outline" style={btnSmall} onClick={() => { setEditingService(s); setServiceForm({ name: s.name || '', description: s.description || '', category_id: s.category_id || '', service_type: s.service_type || 'single', duration_minutes: s.duration_minutes || 60, price: s.price || '', max_participants: s.max_participants || 1, cancel_hours: s.cancel_hours || 24, color: s.color || '#4F46E5' }); setServiceImage(null); setShowServiceModal(true); }}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={async () => { if (!window.confirm('Удалить услугу?')) return; await api.delete(`/services/${tc}/services/${s.id}`); loadServices(); }}>Удалить</button>
          </div>
        ))}
      </div>

      {/* Service Modal */}
      <Modal isOpen={showServiceModal} onClose={() => setShowServiceModal(false)} title={editingService ? 'Редактировать услугу' : 'Новая услуга'}>
        <div className="modal-form">
          {/* Service image */}
          <div className="form-group">
            <label>Обложка</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {(serviceImage || editingService?.image_url) && (
                <img src={serviceImage ? URL.createObjectURL(serviceImage) : editingService.image_url}
                  alt="" style={{ width: 80, height: 56, borderRadius: 8, objectFit: 'cover' }} />
              )}
              <label className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', cursor: 'pointer' }}>
                {serviceImage || editingService?.image_url ? 'Заменить' : 'Загрузить'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setServiceImage(e.target.files[0] || null)} />
              </label>
              {serviceImage && <button className="btn btn-outline" style={{ padding: '6px 10px', fontSize: '0.78rem' }} onClick={() => setServiceImage(null)}>Убрать</button>}
            </div>
          </div>
          <div className="form-group"><label>Название *</label><input className="form-input" value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))} placeholder="Стрижка мужская" /></div>
          <div className="form-group"><label>Описание</label><textarea className="form-input" rows={2} value={serviceForm.description} onChange={e => setServiceForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="form-group">
            <label>Категория</label>
            <select className="form-input" value={serviceForm.category_id} onChange={e => setServiceForm(p => ({ ...p, category_id: e.target.value }))}>
              <option value="">Без категории</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Тип услуги</label>
            <select className="form-input" value={serviceForm.service_type} onChange={e => setServiceForm(p => ({ ...p, service_type: e.target.value }))}>
              <option value="single">Разовая</option>
              <option value="group">Групповая</option>
              <option value="subscription">Абонемент</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Длительность (мин)</label><input type="number" className="form-input" value={serviceForm.duration_minutes} onChange={e => setServiceForm(p => ({ ...p, duration_minutes: e.target.value }))} /></div>
            <div className="form-group"><label>Цена (₽)</label><input type="number" className="form-input" value={serviceForm.price} onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))} /></div>
          </div>
          {serviceForm.service_type === 'group' && (
            <div className="form-group"><label>Макс. участников</label><input type="number" className="form-input" value={serviceForm.max_participants} onChange={e => setServiceForm(p => ({ ...p, max_participants: e.target.value }))} /></div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Отмена за (часов)</label><input type="number" className="form-input" value={serviceForm.cancel_hours} onChange={e => setServiceForm(p => ({ ...p, cancel_hours: e.target.value }))} /></div>
            <div className="form-group">
              <label>Цвет</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={serviceForm.color} onChange={e => setServiceForm(p => ({ ...p, color: e.target.value }))} style={{ width: 36, height: 32, border: 'none' }} />
                <input className="form-input" value={serviceForm.color} onChange={e => setServiceForm(p => ({ ...p, color: e.target.value }))} style={{ flex: 1 }} />
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveService} disabled={savingService} style={{ marginTop: 12 }}>{savingService ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Новая категория">
        <div className="modal-form">
          <div className="form-group"><label>Название *</label><input className="form-input" value={categoryForm.name} onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))} placeholder="Стрижки" /></div>
          <div className="form-group">
            <label>Родительская категория</label>
            <select className="form-input" value={categoryForm.parent_id} onChange={e => setCategoryForm(p => ({ ...p, parent_id: e.target.value }))}>
              <option value="">Корневая</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={async () => {
            if (!categoryForm.name.trim()) return;
            await api.post(`/services/${tc}/categories`, categoryForm);
            showToast('Категория создана');
            setShowCategoryModal(false);
            loadCategories();
          }} style={{ marginTop: 12 }}>Создать</button>
        </div>
      </Modal>
    </div>
  );
}
