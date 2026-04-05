import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const btnPrimary = { background: '#4361ee', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };
const inputStyle = { width: '100%', padding: 6, border: '1px solid #ddd', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' };

export default function AdminLandingsPage() {
  const [landings, setLandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    try {
      const data = await adminApi.get('/landings');
      if (data.success) setLandings(data.landings || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (id) => {
    await adminApi.put(`/landings/${id}`, form);
    setEditing(null);
    load();
  };

  const startEdit = (l) => {
    setEditing(l.id);
    setForm({
      title: l.title, slug: l.slug, is_active: l.is_active,
      ym_counter_id: l.ym_counter_id || '', vk_pixel_id: l.vk_pixel_id || '',
      ym_goal_register: l.ym_goal_register || 'register',
      ym_goal_payment: l.ym_goal_payment || 'payment',
    });
  };

  const del = async (id) => {
    if (!confirm('Удалить?')) return;
    await adminApi.delete(`/landings/${id}`);
    load();
  };

  if (loading) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Лендинги</h2>

      {landings.map(l => (
        <div key={l.id} style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee' }}>
          {editing === l.id ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Название</label>
                  <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Slug (URL)</label>
                  <input style={inputStyle} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>Яндекс Метрика ID</label>
                  <input style={inputStyle} value={form.ym_counter_id} onChange={e => setForm(f => ({ ...f, ym_counter_id: e.target.value }))} placeholder="12345678" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>VK Pixel ID</label>
                  <input style={inputStyle} value={form.vk_pixel_id} onChange={e => setForm(f => ({ ...f, vk_pixel_id: e.target.value }))} placeholder="3751584" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>JS цель — регистрация</label>
                  <input style={inputStyle} value={form.ym_goal_register} onChange={e => setForm(f => ({ ...f, ym_goal_register: e.target.value }))} placeholder="register" />
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Отправляется при клике на CTA-кнопку</div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>JS цель — оплата</label>
                  <input style={inputStyle} value={form.ym_goal_payment} onChange={e => setForm(f => ({ ...f, ym_goal_payment: e.target.value }))} placeholder="payment" />
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Отправляется при успешной оплате тарифа</div>
                </div>
              </div>
              <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Активен
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} onClick={() => save(l.id)}>Сохранить</button>
                <button style={{ ...btnPrimary, background: '#aaa' }} onClick={() => setEditing(null)}>Отмена</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{l.title}</h3>
                  <a href={`/l/${l.slug}`} target="_blank" rel="noreferrer" style={{ color: '#4361ee', fontSize: 13 }}>/l/{l.slug}</a>
                  <span style={{ marginLeft: 12, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: l.is_active ? '#d4edda' : '#f8d7da', color: l.is_active ? '#155724' : '#721c24' }}>
                    {l.is_active ? 'Активен' : 'Выкл'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={btnEdit} onClick={() => startEdit(l)}>Ред.</button>
                  <button style={btnDanger} onClick={() => del(l.id)}>Удалить</button>
                </div>
              </div>

              {/* Analytics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Просмотры', value: l.views_count, color: '#4361ee' },
                  { label: 'Клики CTA', value: l.clicks_count, color: '#7c3aed' },
                  { label: 'Регистрации', value: l.registrations_count || l.users_from_landing || 0, color: '#059669' },
                  { label: 'Оплаты', value: l.payments_from_landing || 0, color: '#f59e0b' },
                  { label: 'Доход', value: `${(l.revenue_from_landing || 0).toLocaleString('ru-RU')} ₽`, color: '#e63946' },
                  { label: 'CTR', value: l.views_count ? `${((l.clicks_count / l.views_count) * 100).toFixed(1)}%` : '—', color: '#888' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Pixel info */}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#999' }}>
                {l.ym_counter_id && <span>YM: {l.ym_counter_id}</span>}
                {l.vk_pixel_id && <span>VK: {l.vk_pixel_id}</span>}
                {l.ym_goal_register && <span>Цель рег: {l.ym_goal_register}</span>}
                {l.ym_goal_payment && <span>Цель оплаты: {l.ym_goal_payment}</span>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
