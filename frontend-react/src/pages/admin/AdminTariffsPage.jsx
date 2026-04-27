import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td,
  btnPrimary, btnOutline, btnDanger, emptyState,
  statusBadge, fmtMoney, searchInput,
} from './adminStyles';

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10,
  fontSize: 13, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s',
};

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#bbb' }}>Загрузка...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={pageTitle}>Тарифы</h2>
        <button
          style={btnPrimary}
          onClick={() => { setShowAdd(true); setEditing(null); setForm({ months: '', label: '', price: '' }); }}
        >
          + Добавить тариф
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...card, marginBottom: 24, border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Новый тариф</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 6 }}>Месяцев</label>
              <input style={inputStyle} type="number" min="1" value={form.months}
                onChange={e => setForm(p => ({ ...p, months: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 6 }}>Название</label>
              <input style={inputStyle} value={form.label} placeholder="3 месяца"
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 6 }}>Цена, руб.</label>
              <input style={inputStyle} type="number" min="0" value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={btnPrimary} onClick={handleAdd}>Создать</button>
            <button style={btnOutline} onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* Tariffs table */}
      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Срок</th>
              <th style={th}>Название</th>
              <th style={th}>Цена (руб.)</th>
              <th style={th}>Статус</th>
              <th style={th}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map(t => (
              <tr key={t.id}>
                {editing === t.id ? (
                  <>
                    <td style={td}>{t.months} мес.</td>
                    <td style={td}>
                      <input style={{ ...inputStyle, marginBottom: 0 }} value={form.label}
                        onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
                    </td>
                    <td style={td}>
                      <input style={{ ...inputStyle, marginBottom: 0, width: 100 }} type="number" min="0" value={form.price}
                        onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
                    </td>
                    <td style={td}>
                      <label style={{ fontSize: 13, cursor: 'pointer', color: '#333' }}>
                        <input type="checkbox" checked={form.is_active !== false}
                          onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} /> Активен
                      </label>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btnPrimary} onClick={() => handleSave(t.id)}>Сохранить</button>
                        <button style={btnOutline} onClick={() => setEditing(null)}>Отмена</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={td}>{t.months} мес.</td>
                    <td style={{ ...td, fontWeight: 500 }}>{t.label}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(t.price)}</td>
                    <td style={td}>
                      <span style={statusBadge(t.is_active ? 'active' : 'closed')}>
                        {t.is_active ? 'Активен' : 'Выключен'}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btnOutline} onClick={() => startEdit(t)}>Ред.</button>
                        <button style={btnDanger} onClick={() => handleDelete(t.id)}>Удалить</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!tariffs.length && (
              <tr><td colSpan={5} style={emptyState}>Нет тарифов</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AI Token Plans */}
      <h3 style={{ ...pageTitle, fontSize: 16, margin: '32px 0 6px' }}>Тарифы ИИ Токенов</h3>
      <p style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>Тарифы задаются в коде (billing.py AI_TOKEN_PLANS)</p>
      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Токенов</th>
            <th style={th}>Цена</th>
            <th style={th}>Без скидки</th>
            <th style={th}>Скидка</th>
            <th style={th}>За токен</th>
          </tr></thead>
          <tbody>
            {[
              { tokens: 100, price: 300 },
              { tokens: 300, price: 800, original: 900, discount: '11%' },
              { tokens: 1000, price: 2550, original: 3000, discount: '15%' },
            ].map((p, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 700 }}>{p.tokens}</td>
                <td style={td}>{fmtMoney(p.price)}</td>
                <td style={td}>{p.original ? <span style={{ textDecoration: 'line-through', color: '#bbb' }}>{fmtMoney(p.original)}</span> : '—'}</td>
                <td style={td}>{p.discount ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{p.discount}</span> : '—'}</td>
                <td style={td}>{(p.price / p.tokens).toFixed(1)} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
