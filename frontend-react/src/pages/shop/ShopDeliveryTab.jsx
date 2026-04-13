import Modal from '../../components/Modal';
import { api } from '../../services/api';

export default function ShopDeliveryTab({
  deliveryMethods, tc, showToast, loadDeliveryMethods, btnSmall,
  showDeliveryModal, setShowDeliveryModal,
  editingDelivery, setEditingDelivery,
  deliveryForm, setDeliveryForm,
  savingDelivery, saveDelivery,
}) {
  const openCreate = () => {
    setEditingDelivery(null);
    setDeliveryForm({ name: '', price: 0, free_from: '', estimated_days: '' });
    setShowDeliveryModal(true);
  };

  const openEdit = (dm) => {
    setEditingDelivery(dm);
    setDeliveryForm({
      name: dm.name || '',
      price: dm.price || 0,
      free_from: dm.free_from || '',
      estimated_days: dm.estimated_days || '',
    });
    setShowDeliveryModal(true);
  };

  const deleteDelivery = async (id) => {
    if (!window.confirm('Удалить способ доставки?')) return;
    try {
      await api.delete(`/shop/${tc}/delivery/${id}`);
      showToast('Способ доставки удалён');
      loadDeliveryMethods();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Способы доставки</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
      </div>

      {deliveryMethods.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет способов доставки. Добавьте первый.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {deliveryMethods.map(dm => (
          <div key={dm.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{dm.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                <span>Цена: {dm.price} р.</span>
                {dm.free_from && <span>Бесплатно от {dm.free_from} р.</span>}
                {dm.estimated_days && <span>Срок: {dm.estimated_days} дн.</span>}
              </div>
            </div>
            <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(dm)}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={() => deleteDelivery(dm.id)}>Удалить</button>
          </div>
        ))}
      </div>

      <Modal isOpen={showDeliveryModal} onClose={() => setShowDeliveryModal(false)} title={editingDelivery ? 'Редактировать доставку' : 'Новый способ доставки'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={deliveryForm.name} onChange={e => setDeliveryForm(p => ({ ...p, name: e.target.value }))} placeholder="Курьер по Москве" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Стоимость</label>
              <input type="number" className="form-input" value={deliveryForm.price} onChange={e => setDeliveryForm(p => ({ ...p, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Бесплатно от (сумма)</label>
              <input type="number" className="form-input" value={deliveryForm.free_from} onChange={e => setDeliveryForm(p => ({ ...p, free_from: e.target.value }))} placeholder="5000" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Срок доставки (дней)</label>
            <input type="number" className="form-input" value={deliveryForm.estimated_days} onChange={e => setDeliveryForm(p => ({ ...p, estimated_days: e.target.value }))} placeholder="3" />
          </div>
          <button className="btn btn-primary" onClick={saveDelivery} disabled={savingDelivery} style={{ marginTop: 12 }}>
            {savingDelivery ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
