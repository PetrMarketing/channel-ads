import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';
import AdminFileInput from './AdminFileInput';

const AUDIENCE_LABELS = {
  all:  { label: 'Все пользователи', bg: '#dbeafe', fg: '#1e40af' },
  paid: { label: 'Только с активной подпиской', bg: '#dcfce7', fg: '#166534' },
  free: { label: 'Без активной подписки', bg: '#fef3c7', fg: '#92400e' },
};

function emptyForm() {
  return {
    title: '', body: '',
    image_url: '', button_text: '', button_url: '',
    audience: 'all', is_active: true,
    starts_at: '', ends_at: '',
  };
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | { ...item } | { ...emptyForm() }

  const load = () => {
    setLoading(true);
    adminApi.get('/notifications').then(d => { if (d?.success) setItems(d.items || []); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = {
      title: editing.title?.trim(),
      body: editing.body || '',
      image_url: editing.image_url || null,
      button_text: editing.button_text || null,
      button_url: editing.button_url || null,
      audience: editing.audience || 'all',
      is_active: !!editing.is_active,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
    };
    if (!payload.title) { alert('Заголовок обязателен'); return; }
    try {
      if (editing.id) {
        await adminApi.put(`/notifications/${editing.id}`, payload);
      } else {
        await adminApi.post('/notifications', payload);
      }
      setEditing(null);
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const del = async (it) => {
    if (!confirm(`Удалить уведомление «${it.title}»?`)) return;
    try {
      await adminApi.delete(`/notifications/${it.id}`);
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ ...pageTitle, margin: 0 }}>Уведомления для пользователей</h1>
        <button style={btnPrimary} onClick={() => setEditing(emptyForm())}>+ Создать</button>
      </div>

      <div style={{ ...card, marginBottom: 20, fontSize: 13, color: '#6b7280' }}>
        💡 Уведомление показывается всем пользователям выбранной аудитории при заходе в сервис как модальное окно.
        Один раз закрыв — пользователь больше не увидит его. Можно прикрепить картинку и кнопку с переходом на ссылку
        или раздел сервиса (например, <code>/billing</code>, <code>/achievements</code>).
      </div>

      {loading && items.length === 0 ? <div style={emptyState}>Загрузка…</div>
        : items.length === 0 ? <div style={emptyState}>Уведомлений ещё нет</div>
        : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Заголовок</th>
                <th style={th}>Аудитория</th>
                <th style={th}>Активно</th>
                <th style={th}>Показано</th>
                <th style={th}>Окно</th>
                <th style={th}>Действия</th>
              </tr></thead>
              <tbody>
                {items.map(it => {
                  const aud = AUDIENCE_LABELS[it.audience] || AUDIENCE_LABELS.all;
                  return (
                    <tr key={it.id}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {it.image_url && (
                            <img src={it.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{it.title}</div>
                            {it.button_text && it.button_url && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                🔘 «{it.button_text}» → {it.button_url}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={td}><span style={badge(aud.bg, aud.fg)}>{aud.label}</span></td>
                      <td style={td}>
                        {it.is_active
                          ? <span style={badge('#dcfce7', '#166534')}>● Да</span>
                          : <span style={badge('#f3f4f6', '#6b7280')}>○ Нет</span>}
                      </td>
                      <td style={td}><b>{it.shown_count || 0}</b></td>
                      <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
                        {it.starts_at && <div>с {fmtDate(it.starts_at)}</div>}
                        {it.ends_at && <div>по {fmtDate(it.ends_at)}</div>}
                        {!it.starts_at && !it.ends_at && '—'}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditing(it)}>Изменить</button>
                          <button style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }} onClick={() => del(it)}>Удалить</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {editing && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: 540 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>
              {editing.id ? 'Изменить уведомление' : 'Новое уведомление'}
            </h3>
            <NotifField label="Заголовок *" v={editing.title} onChange={v => setEditing(e => ({ ...e, title: v }))} placeholder="Например: Новая фича — ИИ-стикеры" />
            <NotifField label="Текст" v={editing.body} multiline onChange={v => setEditing(e => ({ ...e, body: v }))} placeholder="Подробнее о том, что нового" />
            <div style={{ marginBottom: 12 }}>
              <AdminFileInput
                label="Картинка (необязательно)"
                value={editing.image_url}
                accept="image/*"
                onChange={(url) => setEditing(e => ({ ...e, image_url: url }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NotifField label="Текст кнопки" v={editing.button_text} onChange={v => setEditing(e => ({ ...e, button_text: v }))} placeholder="Узнать подробнее" />
              <NotifField label="Ссылка кнопки" v={editing.button_url} onChange={v => setEditing(e => ({ ...e, button_url: v }))} placeholder="/achievements или https://…" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={fieldLabel}>Аудитория</label>
                <select value={editing.audience || 'all'} onChange={e => setEditing(p => ({ ...p, audience: e.target.value }))} style={input}>
                  <option value="all">Все</option>
                  <option value="paid">С активной подпиской</option>
                  <option value="free">Без подписки</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Активно</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0' }}>
                  <input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: '#4361ee' }} />
                  <span style={{ fontSize: 13 }}>Показывать пользователям</span>
                </label>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NotifField label="Показывать с" type="datetime-local" v={editing.starts_at?.slice(0, 16) || ''} onChange={v => setEditing(e => ({ ...e, starts_at: v || null }))} />
              <NotifField label="Показывать по" type="datetime-local" v={editing.ends_at?.slice(0, 16) || ''} onChange={v => setEditing(e => ({ ...e, ends_at: v || null }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btnOutline}>Отмена</button>
              <button onClick={save} style={btnPrimary}>{editing.id ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

function NotifField({ label, v, onChange, placeholder, multiline, type }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={fieldLabel}>{label}</label>
      {multiline
        ? <textarea rows={3} value={v || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...input, resize: 'vertical' }} />
        : <input type={type || 'text'} value={v || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={input} />}
    </div>
  );
}
