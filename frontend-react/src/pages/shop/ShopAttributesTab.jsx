import { useState } from 'react';
import Modal from '../../components/Modal';
import { api } from '../../services/api';

export default function ShopAttributesTab({ tc, showToast, attributes, loadAttributes }) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', values: [] });
  const [expanded, setExpanded] = useState({});

  const btnSmall = { padding: '6px 14px', fontSize: '0.82rem' };

  const isColorAttr = (name) => {
    const n = (name || '').toLowerCase();
    return n.includes('цвет') || n.includes('color');
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', values: [{ value: '', color_hex: '', image_url: '' }] });
    setShowModal(true);
  };

  const openEdit = (attr) => {
    setEditing(attr);
    setForm({
      name: attr.name || '',
      values: (attr.values && attr.values.length > 0)
        ? attr.values.map(v => ({ value: v.value || '', color_hex: v.color_hex || '', image_url: v.image_url || '' }))
        : [{ value: '', color_hex: '', image_url: '' }],
    });
    setShowModal(true);
  };

  const addValue = () => {
    setForm(f => ({ ...f, values: [...f.values, { value: '', color_hex: '', image_url: '' }] }));
  };

  const removeValue = (idx) => {
    setForm(f => ({ ...f, values: f.values.filter((_, i) => i !== idx) }));
  };

  const updateValue = (idx, field, val) => {
    setForm(f => ({
      ...f,
      values: f.values.map((v, i) => i === idx ? { ...v, [field]: val } : v),
    }));
  };

  const saveAttribute = async () => {
    if (!form.name.trim()) { showToast('Введите название', 'error'); return; }
    const filteredValues = form.values.filter(v => v.value.trim());
    if (filteredValues.length === 0) { showToast('Добавьте хотя бы одно значение', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        values: filteredValues.map(v => ({
          value: v.value.trim(),
          color_hex: v.color_hex || null,
          image_url: v.image_url || null,
        })),
      };
      if (editing) {
        await api.put(`/shop/${tc}/attributes/${editing.id}`, payload);
        showToast('Параметр обновлён');
      } else {
        await api.post(`/shop/${tc}/attributes`, payload);
        showToast('Параметр создан');
      }
      setShowModal(false);
      loadAttributes();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteAttribute = async (id) => {
    if (!window.confirm('Удалить параметр?')) return;
    try {
      await api.delete(`/shop/${tc}/attributes/${id}`);
      showToast('Параметр удалён');
      loadAttributes();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="pc-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Параметры</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
      </div>

      {attributes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏷</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Нет параметров</div>
          <p style={{ fontSize: '0.85rem', maxWidth: 300, margin: '0 auto' }}>Создайте параметры товаров (Цвет, Размер, Память и т.д.)</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {attributes.map(attr => (
          <div key={attr.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleExpand(attr.id)}>
                <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: expanded[attr.id] ? 'rotate(90deg)' : 'none', fontSize: '0.75rem' }}>&#9654;</span>
                  {attr.name}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                    ({(attr.values || []).length} знач.)
                  </span>
                </div>
              </div>
              <button className="btn btn-outline" style={btnSmall} onClick={() => openEdit(attr)}>Ред.</button>
              <button className="btn btn-danger" style={btnSmall} onClick={() => deleteAttribute(attr.id)}>Удалить</button>
            </div>

            {expanded[attr.id] && (attr.values || []).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {attr.values.map((v, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--bg-secondary)', fontSize: '0.82rem',
                  }}>
                    {v.color_hex && (
                      <span style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: v.color_hex, border: '1px solid var(--border)',
                        flexShrink: 0,
                      }} />
                    )}
                    {v.image_url && (
                      <img src={v.image_url} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <span>{v.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Редактировать параметр' : 'Новый параметр'}>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Цвет, Размер, Память..." />
          </div>

          <div className="form-group">
            <label className="form-label">Значения</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.values.map((v, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    value={v.value}
                    onChange={e => updateValue(idx, 'value', e.target.value)}
                    placeholder="Значение"
                    style={{ flex: 1, margin: 0 }}
                  />
                  {isColorAttr(form.name) && (
                    <input
                      type="color"
                      value={v.color_hex || '#000000'}
                      onChange={e => updateValue(idx, 'color_hex', e.target.value)}
                      title="Цвет"
                      style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                    />
                  )}
                  <input
                    className="form-input"
                    value={v.image_url}
                    onChange={e => updateValue(idx, 'image_url', e.target.value)}
                    placeholder="URL картинки (необяз.)"
                    style={{ width: 180, margin: 0, fontSize: '0.8rem' }}
                  />
                  {form.values.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: '0.82rem', flexShrink: 0 }}
                      onClick={() => removeValue(idx)}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-outline" style={{ marginTop: 8, ...btnSmall }} onClick={addValue}>
              + Добавить значение
            </button>
          </div>

          <button className="btn btn-primary" onClick={saveAttribute} disabled={saving} style={{ marginTop: 12 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
