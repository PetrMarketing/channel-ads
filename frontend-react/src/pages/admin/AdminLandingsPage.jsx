import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, btnPrimary, btnOutline, btnDanger, badge,
  searchInput, statCard, emptyState,
} from './adminStyles';

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb',
  borderRadius: 10, fontSize: 13, boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle = { fontSize: 11, color: '#999', fontWeight: 600, marginBottom: 4, display: 'block', letterSpacing: 0.3 };
const hintStyle = { fontSize: 10, color: '#bbb', marginTop: 3 };

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

  if (loading) return <div style={emptyState}>Загрузка...</div>;

  return (
    <div>
      <h2 style={pageTitle}>Лендинги</h2>
      <p style={{ fontSize: 12, color: '#bbb', marginTop: 3, marginBottom: 20 }}>
        Всего: {landings.length}
      </p>

      {landings.length === 0 && (
        <div style={{ ...card, ...emptyState }}>Лендинги не найдены</div>
      )}

      {landings.map(l => (
        <div key={l.id} style={{ ...card, marginBottom: 16 }}>
          {editing === l.id ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Название</label>
                  <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Slug (URL)</label>
                  <input style={inputStyle} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Яндекс Метрика ID</label>
                  <input style={inputStyle} value={form.ym_counter_id} onChange={e => setForm(f => ({ ...f, ym_counter_id: e.target.value }))} placeholder="12345678" />
                </div>
                <div>
                  <label style={labelStyle}>VK Pixel ID</label>
                  <input style={inputStyle} value={form.vk_pixel_id} onChange={e => setForm(f => ({ ...f, vk_pixel_id: e.target.value }))} placeholder="3751584" />
                </div>
                <div>
                  <label style={labelStyle}>JS цель — регистрация</label>
                  <input style={inputStyle} value={form.ym_goal_register} onChange={e => setForm(f => ({ ...f, ym_goal_register: e.target.value }))} placeholder="register" />
                  <div style={hintStyle}>Отправляется при клике на CTA-кнопку</div>
                </div>
                <div>
                  <label style={labelStyle}>JS цель — оплата</label>
                  <input style={inputStyle} value={form.ym_goal_payment} onChange={e => setForm(f => ({ ...f, ym_goal_payment: e.target.value }))} placeholder="payment" />
                  <div style={hintStyle}>Отправляется при успешной оплате тарифа</div>
                </div>
              </div>
              <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, color: '#333' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Активен
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} onClick={() => save(l.id)}>Сохранить</button>
                <button style={btnOutline} onClick={() => setEditing(null)}>Отмена</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#1a1a2e' }}>{l.title}</h3>
                  <a href={`/l/${l.slug}`} target="_blank" rel="noreferrer" style={{ color: '#4361ee', fontSize: 13, textDecoration: 'none' }}>/l/{l.slug}</a>
                  <span style={{ marginLeft: 12, ...badge(l.is_active ? '#dcfce7' : '#fef2f2', l.is_active ? '#166534' : '#991b1b') }}>
                    {l.is_active ? 'Активен' : 'Выкл'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={btnOutline} onClick={() => startEdit(l)}>Ред.</button>
                  <button style={btnDanger} onClick={() => del(l.id)}>Удалить</button>
                </div>
              </div>

              {/* Analytics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Просмотры', value: l.views_count, color: '#4361ee' },
                  { label: 'Клики CTA', value: l.clicks_count, color: '#7c3aed' },
                  { label: 'Регистрации', value: l.registrations_count || l.users_from_landing || 0, color: '#059669' },
                  { label: 'Оплаты', value: l.payments_from_landing || 0, color: '#f59e0b' },
                  { label: 'Доход', value: `${(l.revenue_from_landing || 0).toLocaleString('ru-RU')} ₽`, color: '#e63946' },
                  { label: 'CTR', value: l.views_count ? `${((l.clicks_count / l.views_count) * 100).toFixed(1)}%` : '—', color: '#6b7280' },
                ].map((s, i) => (
                  <div key={i} style={statCard(s.color)}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Pixel info */}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#bbb', flexWrap: 'wrap' }}>
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
