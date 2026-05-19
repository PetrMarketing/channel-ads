/**
 * Админка → Промокоды для тарифа.
 * CRUD: создать/редактировать/удалить промокод. У промо есть тип скидки
 * (% или фикс), бонусные ИИ-токены при оплате, лимит использований, срок.
 */
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';

export default function AdminPromoCodesPage() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    adminApi.get('/promocodes').then(d => {
      if (d?.success) setItems(d.promocodes || []);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (p) => {
    if (!confirm(`Удалить промокод «${p.code}»?`)) return;
    try { await adminApi.delete(`/promocodes/${p.id}`); load(); } catch (e) { alert(e?.message); }
  };

  const toggle = async (p) => {
    try { await adminApi.put(`/promocodes/${p.id}`, { is_active: !p.is_active }); load(); }
    catch (e) { alert(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h1 style={pageTitle}>Промокоды</h1>
        <button style={btnPrimary} onClick={() => setEditing({
          code: '', description: '', discount_type: 'percent',
          discount_value: 10, bonus_ai_tokens: 0, max_uses: '',
          valid_until: '', is_active: true,
        })}>+ Создать промокод</button>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, padding: 10, background: '#f9fafb', borderRadius: 8 }}>
        💡 Промокод вводится пользователем на странице оплаты тарифа («Подписки»).
        Можно задать скидку % или фиксированную сумму + бонусные ИИ-токены,
        которые начисляются после успешной оплаты.
      </div>

      {items === null ? <div style={emptyState}>Загрузка…</div>
        : items.length === 0 ? <div style={emptyState}>Промокодов ещё нет</div>
        : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Код</th>
                <th style={th}>Скидка</th>
                <th style={th}>Бонус</th>
                <th style={th}>Применим к тарифам</th>
                <th style={th}>Использовано</th>
                <th style={th}>Срок</th>
                <th style={th}>Статус</th>
                <th style={th}>Действия</th>
              </tr></thead>
              <tbody>{items.map(p => (
                <tr key={p.id}>
                  <td style={td}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{p.code}</div>
                    {p.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{p.description}</div>}
                  </td>
                  <td style={td}>
                    {p.discount_type === 'percent'
                      ? <b>−{p.discount_value}%</b>
                      : <b>−{Number(p.discount_value).toLocaleString('ru-RU')} ₽</b>}
                  </td>
                  <td style={td}>
                    {p.bonus_ai_tokens > 0
                      ? <span style={badge('#e0e7ff', '#3730a3')}>+{p.bonus_ai_tokens} ток.</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={td}>
                    {p.applicable_months && p.applicable_months.length > 0
                      ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {p.applicable_months.map(m => (
                            <span key={m} style={badge('#fef3c7', '#92400e')}>{m} мес.</span>
                          ))}
                        </div>
                      : <span style={{ color: '#9ca3af', fontSize: 11 }}>все сроки</span>}
                  </td>
                  <td style={td}>
                    {p.used_count}{p.max_uses ? ` / ${p.max_uses}` : <span style={{ color: '#9ca3af' }}> (∞)</span>}
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {p.valid_until ? fmtDate(p.valid_until) : <span style={{ color: '#9ca3af' }}>бессрочно</span>}
                  </td>
                  <td style={td}>
                    <button onClick={() => toggle(p)} style={{
                      ...badge(p.is_active ? '#dcfce7' : '#f3f4f6', p.is_active ? '#166534' : '#6b7280'),
                      border: 'none', cursor: 'pointer',
                    }}>
                      {p.is_active ? 'Активен' : 'Выключен'}
                    </button>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditing(p)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>Изменить</button>
                      <button onClick={() => del(p)} style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }}>×</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

      {editing && (
        <PromoEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PromoEditor({ editing, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: editing.id || null,
    code: editing.code || '',
    description: editing.description || '',
    discount_type: editing.discount_type || 'percent',
    discount_value: editing.discount_value ?? 10,
    bonus_ai_tokens: editing.bonus_ai_tokens ?? 0,
    max_uses: editing.max_uses ?? '',
    valid_until: editing.valid_until ? editing.valid_until.slice(0, 16) : '',
    is_active: editing.is_active !== false,
    applicable_months: editing.applicable_months || [],
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.code.trim()) { alert('Введите код'); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        discount_value: Number(form.discount_value) || 0,
        bonus_ai_tokens: Number(form.bonus_ai_tokens) || 0,
        max_uses: form.max_uses === '' ? null : Number(form.max_uses),
        valid_until: form.valid_until || null,
        applicable_months: form.applicable_months.length > 0 ? form.applicable_months : null,
      };
      if (form.id) await adminApi.put(`/promocodes/${form.id}`, payload);
      else await adminApi.post('/promocodes', payload);
      onSaved();
    } catch (e) { alert(e?.message); }
    finally { setBusy(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalBox, maxWidth: 540 }}>
        <h4 style={{ margin: '0 0 16px' }}>{form.id ? `Изменить промокод #${form.id}` : 'Новый промокод'}</h4>

        <Field label="Код *" v={form.code} onChange={v => set('code', v.toUpperCase())} mono
          placeholder="например: SUMMER10" />
        <Field label="Описание (для админа)" v={form.description}
          onChange={v => set('description', v)} placeholder="Летняя акция: −10% и бонус 50 ИИ-токенов" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={fieldLabel}>Тип скидки</label>
            <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)} style={input}>
              <option value="percent">Процент (%)</option>
              <option value="fixed">Фиксированная (₽)</option>
            </select>
          </div>
          <Field label={form.discount_type === 'percent' ? 'Размер %' : 'Размер ₽'}
            v={String(form.discount_value)} onChange={v => set('discount_value', v)} />
        </div>

        <Field label="Бонусных ИИ-токенов при оплате" v={String(form.bonus_ai_tokens)}
          onChange={v => set('bonus_ai_tokens', v)} placeholder="0 = без бонуса" />

        <div style={{ marginBottom: 12 }}>
          <label style={fieldLabel}>Применим к тарифам (срокам подписки)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 3, 6, 12].map(m => {
              const checked = form.applicable_months.includes(m);
              return (
                <label key={m} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10,
                  border: `1px solid ${checked ? '#4361ee' : '#e5e7eb'}`,
                  background: checked ? '#eef2ff' : '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  color: checked ? '#3730a3' : '#1a1a2e',
                  userSelect: 'none',
                }}>
                  <input type="checkbox" checked={checked}
                    onChange={() => set('applicable_months',
                      checked
                        ? form.applicable_months.filter(x => x !== m)
                        : [...form.applicable_months, m].sort((a, b) => a - b)
                    )}
                    style={{ accentColor: '#4361ee' }} />
                  {m} мес.
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
            Если ни одна галочка не выбрана — промокод действует для всех сроков.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Макс. использований (пусто = безлимит)"
            v={String(form.max_uses)} onChange={v => set('max_uses', v)} placeholder="∞" />
          <div>
            <label style={fieldLabel}>Действует до</label>
            <input type="datetime-local" value={form.valid_until}
              onChange={e => set('valid_until', e.target.value)} style={input} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 14, fontSize: 13 }}>
          <input type="checkbox" checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)} />
          Активен
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <button onClick={onClose} style={btnOutline}>Отмена</button>
          <button onClick={save} disabled={busy} style={btnPrimary}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 };

function Field({ label, v, onChange, placeholder, mono }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input type="text" value={v} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...input, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }} />
    </div>
  );
}
