import { useState, useRef } from 'react';
import Modal from '../../components/Modal';
import { api } from '../../services/api';
import ImageUploadField from '../../components/ImageUploadField';

export default function ShopProductsTab({
  products, categories, tc, showToast, loadProducts, btnSmall,
  showProductModal, setShowProductModal,
  editingProduct, setEditingProduct,
  productForm, setProductForm,
  savingProduct, saveProduct,
  productFilter, setProductFilter,
}) {
  const [unlimitedStock, setUnlimitedStock] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedFile, setFeedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [feedResult, setFeedResult] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);

  const handleImportFeed = async () => {
    if (!feedUrl.trim() && !feedFile) { showToast('Введите URL или выберите файл', 'error'); return; }
    setImporting(true);
    setFeedResult(null);
    try {
      let res;
      if (feedFile) {
        const fd = new FormData();
        fd.append('file', feedFile);
        const resp = await fetch(`/api/shop/${tc}/import-feed-file`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: fd,
        });
        res = await resp.json();
      } else {
        res = await api.post(`/shop/${tc}/import-feed`, { url: feedUrl.trim() });
      }
      if (res.success) {
        setFeedResult({ ok: true, imported: res.imported, categories: res.categories_imported });
        loadProducts();
      } else {
        setFeedResult({ ok: false, error: res.detail || res.error || 'Ошибка' });
      }
    } catch (e) {
      setFeedResult({ ok: false, error: e.message || 'Ошибка импорта' });
    } finally {
      setImporting(false);
    }
  };

  const loadProductImages = async (productId) => {
    try {
      const data = await api.get(`/shop/${tc}/products/${productId}/images`);
      if (data.success) setProductImages(data.images || []);
      else setProductImages([]);
    } catch {
      setProductImages([]);
    }
  };

  const uploadProductImage = async (file) => {
    if (!editingProduct) return;
    if (file.size > 10 * 1024 * 1024) { showToast('Максимум 10 МБ', 'error'); return; }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload(`/shop/${tc}/products/${editingProduct.id}/images`, fd);
      if (data.success) {
        await loadProductImages(editingProduct.id);
        showToast('Изображение загружено');
      } else {
        showToast(data.detail || 'Ошибка загрузки', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка загрузки', 'error');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const setMainImage = async (imageIndex) => {
    if (!editingProduct) return;
    try {
      await api.put(`/shop/${tc}/products/${editingProduct.id}/main-image`, { index: imageIndex });
      await loadProductImages(editingProduct.id);
      loadProducts();
      showToast('Главное изображение установлено');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const deleteProductImage = async (imageIndex) => {
    if (!editingProduct) return;
    try {
      await api.delete(`/shop/${tc}/products/${editingProduct.id}/images/${imageIndex}`);
      await loadProductImages(editingProduct.id);
      loadProducts();
      showToast('Изображение удалено');
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const openCreate = () => {
    setEditingProduct(null);
    setProductForm({ name: '', description: '', category_id: '', price: '', compare_at_price: '', sku: '', stock: -1, is_hit: false, is_new: false, image_url: '' });
    setUnlimitedStock(true);
    setProductImages([]);
    setShowProductModal(true);
  };

  const openEdit = (prod) => {
    setEditingProduct(prod);
    const isUnlimited = prod.stock === -1 || prod.stock === null;
    setUnlimitedStock(isUnlimited);
    setProductForm({
      name: prod.name || '',
      description: prod.description || '',
      category_id: prod.category_id || '',
      price: prod.price || '',
      compare_at_price: prod.compare_at_price || '',
      sku: prod.sku || '',
      stock: isUnlimited ? -1 : (prod.stock || 0),
      is_hit: !!prod.is_hit,
      is_new: !!prod.is_new,
      image_url: prod.image_url || '',
    });
    setProductImages([]);
    loadProductImages(prod.id);
    setShowProductModal(true);
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Удалить товар?')) return;
    try {
      await api.delete(`/shop/${tc}/products/${id}`);
      showToast('Товар удалён');
      loadProducts();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : '';
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2>Товары</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-input" value={productFilter} onChange={e => setProductFilter(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
            <option value="">Все категории</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={() => { setFeedUrl(''); setFeedResult(null); setShowFeedModal(true); }}>Импортировать фид</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
        </div>
      </div>

      {products.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Нет товаров</div>
          <p style={{ fontSize: '0.85rem', maxWidth: 300, margin: '0 auto' }}>Добавьте товары вручную или импортируйте из фида</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {products.map(prod => (
          <div key={prod.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            {prod.image_url && (
              <img src={prod.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            )}
            {!prod.image_url && (
              <div style={{ width: 48, height: 48, borderRadius: 6, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#9ca3af', fontSize: '0.7rem' }}>
                Нет фото
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {prod.name}
                {!!prod.is_hit && <span className="pc-badge success">Хит</span>}
                {!!prod.is_new && <span className="pc-badge info">Новинка</span>}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                <span>{prod.price} р.</span>
                {prod.compare_at_price && <span style={{ textDecoration: 'line-through' }}>{prod.compare_at_price} р.</span>}
                <span>Остаток: {prod.stock === -1 || prod.stock === null ? 'Не ограничен' : prod.stock}</span>
                {getCategoryName(prod.category_id) && <span>{getCategoryName(prod.category_id)}</span>}
              </div>
            </div>
            <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(prod)}>Ред.</button>
            <button className="btn btn-danger" style={btnSmall} onClick={() => deleteProduct(prod.id)}>Удалить</button>
          </div>
        ))}
      </div>

      <Modal isOpen={showProductModal} onClose={() => setShowProductModal(false)} title={editingProduct ? 'Редактировать товар' : 'Новый товар'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} placeholder="Название товара" />
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <textarea className="form-input" rows={3} value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} placeholder="Описание товара" />
          </div>
          <div className="form-group">
            <label className="form-label">Категория</label>
            <select className="form-input" value={productForm.category_id} onChange={e => setProductForm(p => ({ ...p, category_id: e.target.value }))}>
              <option value="">-- Без категории --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Цена *</label>
              <input type="number" className="form-input" value={productForm.price} onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Цена до скидки</label>
              <input type="number" className="form-input" value={productForm.compare_at_price} onChange={e => setProductForm(p => ({ ...p, compare_at_price: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Артикул (SKU)</label>
              <input className="form-input" value={productForm.sku} onChange={e => setProductForm(p => ({ ...p, sku: e.target.value }))} placeholder="ART-001" />
            </div>
            <div className="form-group">
              <label className="form-label">Остаток</label>
              <input type="number" className="form-input" value={unlimitedStock ? '' : productForm.stock}
                disabled={unlimitedStock}
                onChange={e => setProductForm(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={unlimitedStock} onChange={e => {
                  setUnlimitedStock(e.target.checked);
                  if (e.target.checked) setProductForm(p => ({ ...p, stock: -1 }));
                  else setProductForm(p => ({ ...p, stock: 0 }));
                }} />
                Не ограничен
              </label>
            </div>
          </div>
          {/* Multiple images section (available after product creation) */}
          {editingProduct && (
            <div className="form-group">
              <label className="form-label">Изображения (до 5)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {productImages.map((img, idx) => (
                  <div key={idx} style={{
                    position: 'relative', width: 72, height: 72,
                    borderRadius: 8, overflow: 'hidden',
                    border: img.is_main ? '2px solid #3b82f6' : '1px solid var(--border)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                    onClick={() => setMainImage(idx)}
                    title={img.is_main ? 'Главное изображение' : 'Нажмите, чтобы сделать главным'}
                  >
                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); deleteProductImage(idx); }}
                      style={{
                        position: 'absolute', top: 2, right: 2,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1, padding: 0,
                      }}
                    >&times;</button>
                    {img.is_main && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(59,130,246,0.85)', color: '#fff',
                        fontSize: '0.6rem', textAlign: 'center', padding: '1px 0',
                      }}>главная</div>
                    )}
                  </div>
                ))}
                {productImages.length < 5 && (
                  <div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadProductImage(f); }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: 72, height: 72, fontSize: '1.5rem', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? '...' : '+'}
                    </button>
                  </div>
                )}
              </div>
              {!editingProduct && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Загрузка изображений доступна после создания товара
                </p>
              )}
            </div>
          )}

          <div className="form-group">
            <ImageUploadField
              label={editingProduct ? 'Изображение (URL)' : 'Изображение'}
              value={productForm.image_url}
              onChange={v => setProductForm(p => ({ ...p, image_url: v }))}
              uploadUrl={`/shop/${tc}/upload-image`}
            />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={productForm.is_hit} onChange={e => setProductForm(p => ({ ...p, is_hit: e.target.checked }))} />
              Хит продаж
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={productForm.is_new} onChange={e => setProductForm(p => ({ ...p, is_new: e.target.checked }))} />
              Новинка
            </label>
          </div>
          <button className="btn btn-primary" onClick={saveProduct} disabled={savingProduct} style={{ marginTop: 12 }}>
            {savingProduct ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>

      {/* Feed import modal */}
      <Modal isOpen={showFeedModal} onClose={() => setShowFeedModal(false)} title="Импортировать фид">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Вставьте ссылку на YML/XML фид или загрузите файл
          </p>
          <input className="form-input" placeholder="https://example.com/feed.yml" value={feedUrl}
            onChange={e => { setFeedUrl(e.target.value); setFeedFile(null); }} disabled={!!feedFile} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>или</span>
            <label className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', cursor: 'pointer' }}>
              {feedFile ? feedFile.name : 'Выбрать файл'}
              <input type="file" accept=".yml,.yaml,.xml" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFeedFile(f); setFeedUrl(''); } }} />
            </label>
            {feedFile && <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setFeedFile(null)}>x</button>}
          </div>
          {feedResult && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem',
              background: feedResult.ok ? 'rgba(42,157,143,0.1)' : 'rgba(230,57,70,0.1)',
              color: feedResult.ok ? '#2a9d8f' : '#e63946',
            }}>
              {feedResult.ok
                ? `Импортировано: ${feedResult.imported} товаров, ${feedResult.categories} категорий`
                : feedResult.error}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleImportFeed} disabled={importing}>
            {importing ? 'Импорт...' : 'Импортировать'}
          </button>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
            Поддерживаемые форматы: YML (Яндекс.Маркет), XML. Существующие товары с совпадающим SKU будут обновлены.
          </p>
        </div>
      </Modal>
    </div>
  );
}
