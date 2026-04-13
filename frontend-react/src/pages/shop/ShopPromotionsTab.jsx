import Modal from '../../components/Modal';
import { api } from '../../services/api';

const PROMO_TYPE_LABELS = {
  percent: 'Процент',
  fixed: 'Фиксированная',
  free_delivery: 'Бесплатная доставка',
};

const PROMO_TYPE_BADGE = {
  percent: 'info',
  fixed: 'success',
  free_delivery: 'warning',
};

export default function ShopPromotionsTab({
  promotions, tc, showToast, loadPromotions, btnSmall,
  showPromoModal, setShowPromoModal,
  editingPromo, setEditingPromo,
  promoForm, setPromoForm,
  savingPromo, savePromo,
}) {
  const openCreate = () => {
    setEditingPromo(null);
    setPromoForm({ name: '', promo_type: 'percent', code: '', discount_value: '', min_order_amount: '', max_uses: '', starts_at: '', expires_at: '' });
    setShowPromoModal(true);
  };

  const openEdit = (promo) => {
    setEditingPromo(promo);
    setPromoForm({
      name: promo.name || '',
      promo_type: promo.promo_type || 'percent',
      code: promo.code || '',
      discount_value: promo.discount_value || '',
      min_order_amount: promo.min_order_amount || '',
      max_uses: promo.max_uses || '',
      starts_at: promo.starts_at ? promo.starts_at.split('T')[0] : '',
      expires_at: promo.expires_at ? promo.expires_at.split('T')[0] : '',
    });
    setShowPromoModal(true);
  };

  const deletePromo = async (id) => {
    if (!window.confirm('Удалить акцию?')) return;
    try {
      await api.delete(`/shop/${tc}/promotions/${id}`);
      showToast('Акция удалена');
      loadPromotions();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('ru-RU');
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Акции и промокоды</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
      </div>

      {promotions.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Нет акций. Создайте первую.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {promotions.map(promo => (
          <div key={promo.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                {promo.name}
                <span className={`pc-badge ${PROMO_TYPE_BADGE[promo.promo_type] || 'info'}`}>
                  {PROMO_TYPE_LABELS[promo.promo_type] || promo.promo_type}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                {promo.code && <span>Код: <b>{promo.code}</b></span>}
                {promo.promo_type !== 'free_delivery' && <span>Скидка: {promo.discount_value}{promo.promo_type === 'percent' ? '%' : ' р.'}</span>}
                {promo.starts_at && <span>С {formatDate(promo.starts_at)}</span>}
                {promo.expires_at && <span>До {formatDate(promo.expires_at)}</span>}
                <span>Использовано: {promo.used_count || 0}{promo.max_uses ? `/${promo.max_uses}` : ''}</span>
              </div>
            </div>
            <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(promo)}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={() => deletePromo(promo.id)}>Удалить</button>
          </div>
        ))}
      </div>

      <Modal isOpen={showPromoModal} onClose={() => setShowPromoModal(false)} title={editingPromo ? 'Редактировать акцию' : 'Новая акция'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={promoForm.name} onChange={e => setPromoForm(p => ({ ...p, name: e.target.value }))} placeholder="Скидка на первый заказ" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Тип скидки</label>
              <select className="form-input" value={promoForm.promo_type} onChange={e => setPromoForm(p => ({ ...p, promo_type: e.target.value }))}>
                <option value="percent">Процент</option>
                <option value="fixed">Фиксированная сумма</option>
                <option value="free_delivery">Бесплатная доставка</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Промокод</label>
              <input className="form-input" value={promoForm.code} onChange={e => setPromoForm(p => ({ ...p, code: e.target.value }))} placeholder="SALE10" />
            </div>
          </div>
          {promoForm.promo_type !== 'free_delivery' && (
            <div className="form-group">
              <label className="form-label">Размер скидки {promoForm.promo_type === 'percent' ? '(%)' : '(руб.)'}</label>
              <input type="number" className="form-input" value={promoForm.discount_value} onChange={e => setPromoForm(p => ({ ...p, discount_value: e.target.value }))} placeholder="10" />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Минимальная сумма заказа</label>
              <input type="number" className="form-input" value={promoForm.min_order_amount} onChange={e => setPromoForm(p => ({ ...p, min_order_amount: e.target.value }))} placeholder="1000" />
            </div>
            <div className="form-group">
              <label className="form-label">Максимум использований</label>
              <input type="number" className="form-input" value={promoForm.max_uses} onChange={e => setPromoForm(p => ({ ...p, max_uses: e.target.value }))} placeholder="100" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Дата начала</label>
              <input type="date" className="form-input" value={promoForm.starts_at} onChange={e => setPromoForm(p => ({ ...p, starts_at: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Дата окончания</label>
              <input type="date" className="form-input" value={promoForm.expires_at} onChange={e => setPromoForm(p => ({ ...p, expires_at: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={savePromo} disabled={savingPromo} style={{ marginTop: 12 }}>
            {savingPromo ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
