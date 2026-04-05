import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f5f5f5' };
const btnPrimary = { background: '#4361ee', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };
const inputStyle = { width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 10 };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Лендинги</h2>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Название</th>
            <th style={thStyle}>Slug</th>
            <th style={thStyle}>YM</th>
            <th style={thStyle}>VK</th>
            <th style={thStyle}>Просмотры</th>
            <th style={thStyle}>Клики</th>
            <th style={thStyle}>Рег-ции</th>
            <th style={thStyle}>Конверсия</th>
            <th style={thStyle}>Статус</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {landings.map(l => (
            <tr key={l.id}>
              {editing === l.id ? (
                <>
                  <td style={tdStyle}><input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></td>
                  <td style={tdStyle}><input style={inputStyle} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></td>
                  <td style={tdStyle}><input style={{ ...inputStyle, width: 80 }} value={form.ym_counter_id} onChange={e => setForm(f => ({ ...f, ym_counter_id: e.target.value }))} placeholder="ID" /></td>
                  <td style={tdStyle}><input style={{ ...inputStyle, width: 80 }} value={form.vk_pixel_id} onChange={e => setForm(f => ({ ...f, vk_pixel_id: e.target.value }))} placeholder="ID" /></td>
                  <td style={tdStyle}>{l.views_count}</td>
                  <td style={tdStyle}>{l.clicks_count}</td>
                  <td style={tdStyle}>{l.registrations_count}</td>
                  <td style={tdStyle}>{l.views_count ? ((l.clicks_count / l.views_count) * 100).toFixed(1) + '%' : '—'}</td>
                  <td style={tdStyle}>
                    <label style={{ fontSize: 12 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Активен</label>
                  </td>
                  <td style={tdStyle}>
                    <button style={btnPrimary} onClick={() => save(l.id)}>Сохранить</button>
                  </td>
                </>
              ) : (
                <>
                  <td style={tdStyle}><strong>{l.title}</strong></td>
                  <td style={tdStyle}>
                    <a href={`/l/${l.slug}`} target="_blank" rel="noreferrer" style={{ color: '#4361ee', fontSize: 12 }}>
                      /l/{l.slug}
                    </a>
                  </td>
                  <td style={tdStyle}>{l.ym_counter_id || '—'}</td>
                  <td style={tdStyle}>{l.vk_pixel_id || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.views_count}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.clicks_count}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.registrations_count}</td>
                  <td style={tdStyle}>{l.views_count ? ((l.clicks_count / l.views_count) * 100).toFixed(1) + '%' : '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: l.is_active ? '#d4edda' : '#f8d7da', color: l.is_active ? '#155724' : '#721c24' }}>
                      {l.is_active ? 'Активен' : 'Выкл'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button style={btnEdit} onClick={() => startEdit(l)}>Ред.</button>
                    <button style={btnDanger} onClick={() => del(l.id)}>Удалить</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
