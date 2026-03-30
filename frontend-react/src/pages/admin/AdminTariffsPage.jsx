import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const btnPrimary = { background: '#4361ee', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };
const inputStyle = { width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

export default function AdminTariffsPage() {
  const [tariffs, setTariffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ months: '', label: '', price: '' });
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      const data = await adminApi.get('/tariffs');
      if (data.success) setTariffs(data.tariffs || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (id) => {
    try {
      await adminApi.put(`/tariffs/${id}`, {
        price: parseInt(form.price),
        label: form.label,
        is_active: form.is_active !== false,
      });
      setEditing(null);
      load();
    } catch (e) { alert('Ошибка сохранения'); }
  };

  const handleAdd = async () => {
    if (!form.months || !form.label || !form.price) {
      alert('Заполните все поля');
      return;
    }
    try {
      await adminApi.post('/tariffs', {
        months: parseInt(form.months),
        label: form.label,
        price: parseInt(form.price),
      });
      setShowAdd(false);
      setForm({ months: '', label: '', price: '' });
      load();
    } catch (e) { alert('Ошибка создания'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить тариф?')) return;
    try {
      await adminApi.delete(`/tariffs/${id}`);
      load();
    } catch (e) { alert('Ошибка удаления'); }
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setForm({ months: t.months, label: t.label, price: t.price, is_active: t.is_active });
    setShowAdd(false);
  };

  if (loading) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Тарифы</h2>
        <button style={btnPrimary} onClick={() => { setShowAdd(true); setEditing(null); setForm({ months: '', label: '', price: '' }); }}>
          + Добавить тариф
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid #eee' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Новый тариф</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>Месяцев</label>
              <input style={inputStyle} type="number" min="1" value={form.months}
                onChange={e => setForm(p => ({ ...p, months: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>Название</label>
              <input style={inputStyle} value={form.label} placeholder="3 месяца"
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>Цена, руб.</label>
              <input style={inputStyle} type="number" min="0" value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnPrimary} onClick={handleAdd}>Создать</button>
            <button style={{ ...btnPrimary, background: '#aaa' }} onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </div>
      )}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Срок</th>
            <th style={thStyle}>Название</th>
            <th style={thStyle}>Цена (руб.)</th>
            <th style={thStyle}>Статус</th>
            <th style={thStyle}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {tariffs.map(t => (
            <tr key={t.id}>
              {editing === t.id ? (
                <>
                  <td style={tdStyle}>{t.months} мес.</td>
                  <td style={tdStyle}>
                    <input style={{ ...inputStyle, marginBottom: 0 }} value={form.label}
                      onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
                  </td>
                  <td style={tdStyle}>
                    <input style={{ ...inputStyle, marginBottom: 0, width: 100 }} type="number" min="0" value={form.price}
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
                  </td>
                  <td style={tdStyle}>
                    <label style={{ fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_active !== false}
                        onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} /> Активен
                    </label>
                  </td>
                  <td style={tdStyle}>
                    <button style={btnPrimary} onClick={() => handleSave(t.id)}>Сохранить</button>{' '}
                    <button style={{ ...btnPrimary, background: '#aaa' }} onClick={() => setEditing(null)}>Отмена</button>
                  </td>
                </>
              ) : (
                <>
                  <td style={tdStyle}>{t.months} мес.</td>
                  <td style={tdStyle}>{t.label}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{t.price.toLocaleString('ru-RU')} ₽</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: t.is_active ? '#d4edda' : '#f8d7da',
                      color: t.is_active ? '#155724' : '#721c24',
                    }}>
                      {t.is_active ? 'Активен' : 'Выключен'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button style={btnEdit} onClick={() => startEdit(t)}>Ред.</button>
                    <button style={btnDanger} onClick={() => handleDelete(t.id)}>Удалить</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {!tariffs.length && (
            <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#aaa' }}>Нет тарифов</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
