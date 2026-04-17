import Modal from '../../components/Modal';
import { api } from '../../services/api';

export default function ShopCategoriesTab({
  categories, tc, showToast, loadCategories, btnSmall,
  showCategoryModal, setShowCategoryModal,
  editingCategory, setEditingCategory,
  categoryForm, setCategoryForm,
  savingCategory, saveCategory,
}) {
  const openCreate = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', parent_id: '', sort_order: 0 });
    setShowCategoryModal(true);
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      name: cat.name || '',
      description: cat.description || '',
      parent_id: cat.parent_id || '',
      sort_order: cat.sort_order || 0,
    });
    setShowCategoryModal(true);
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Удалить категорию?')) return;
    try {
      await api.delete(`/shop/${tc}/categories/${id}`);
      showToast('Категория удалена');
      loadCategories();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Категории</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
      </div>

      {categories.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Нет категорий</div>
          <p style={{ fontSize: '0.85rem', maxWidth: 300, margin: '0 auto' }}>Создайте категории для организации товаров в каталоге</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map(cat => (
          <div key={cat.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{cat.name}</div>
              {cat.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{cat.description}</div>}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Порядок: {cat.sort_order || 0}
                {cat.parent_id ? ` | Родитель: ${(categories.find(c => c.id === cat.parent_id) || {}).name || cat.parent_id}` : ''}
              </div>
            </div>
            <span className={`pc-badge ${cat.is_active !== 0 ? 'success' : 'warning'}`}>
              {cat.is_active !== 0 ? 'Активна' : 'Неактивна'}
            </span>
            <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(cat)}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={() => deleteCategory(cat.id)}>Удалить</button>
          </div>
        ))}
      </div>

      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title={editingCategory ? 'Редактировать категорию' : 'Новая категория'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={categoryForm.name} onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))} placeholder="Электроника" />
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <textarea className="form-input" rows={3} value={categoryForm.description} onChange={e => setCategoryForm(p => ({ ...p, description: e.target.value }))} placeholder="Описание категории" />
          </div>
          <div className="form-group">
            <label className="form-label">Родительская категория</label>
            <select className="form-input" value={categoryForm.parent_id} onChange={e => setCategoryForm(p => ({ ...p, parent_id: e.target.value }))}>
              <option value="">-- Нет --</option>
              {categories.filter(c => !editingCategory || c.id !== editingCategory.id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Порядок сортировки</label>
            <input type="number" className="form-input" value={categoryForm.sort_order} onChange={e => setCategoryForm(p => ({ ...p, sort_order: e.target.value }))} />
          </div>
          <button className="btn btn-primary" onClick={saveCategory} disabled={savingCategory} style={{ marginTop: 12 }}>
            {savingCategory ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
