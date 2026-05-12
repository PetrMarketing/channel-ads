import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';
import AdminFileInput from './AdminFileInput';
import RichTextEditor from '../../components/RichTextEditor';
import ButtonBuilder from '../../components/ButtonBuilder';

const STATUS_META = {
  draft:     { label: 'Черновик',     bg: '#f3f4f6', fg: '#6b7280' },
  scheduled: { label: 'Запланирована', bg: '#dbeafe', fg: '#1d4ed8' },
  sending:   { label: 'Отправляется',  bg: '#fef3c7', fg: '#92400e' },
  sent:      { label: 'Отправлена',    bg: '#dcfce7', fg: '#166534' },
  failed:    { label: 'Ошибка',        bg: '#fee2e2', fg: '#991b1b' },
  cancelled: { label: 'Отменена',      bg: '#f3f4f6', fg: '#6b7280' },
};

const AUDIENCE_META = {
  all:      { label: 'Все', bg: '#dbeafe', fg: '#1e40af' },
  max:      { label: 'MAX', bg: '#ede9fe', fg: '#7c3aed' },
  telegram: { label: 'Telegram', bg: '#dbeafe', fg: '#0284c7' },
  paid:     { label: 'С подпиской', bg: '#dcfce7', fg: '#166534' },
  free:     { label: 'Без подписки', bg: '#fef3c7', fg: '#92400e' },
};

function emptyForm() {
  return {
    title: '', message_text: '',
    image_url: '', media_type: 'photo',
    button_text: '', button_url: '',
    inline_buttons: '',
    audience: 'all', status: 'draft',
    scheduled_at: '',
  };
}

function nowMskString() {
  const m = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

export default function AdminBroadcastsUsersPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [audCount, setAudCount] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi.get('/broadcasts-users').then(d => { if (d?.success) setItems(d.items || []); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Подсчёт аудитории при изменении audience в форме
  useEffect(() => {
    if (!editing?.audience) return;
    adminApi.post('/broadcasts-users/preview-audience', { audience: editing.audience })
      .then(d => { if (d?.success) setAudCount(d.count); })
      .catch(() => setAudCount(null));
  }, [editing?.audience]);

  const save = async (status) => {
    // Конвертируем datetime-local в МСК → UTC ISO
    let scheduledIso = null;
    if (editing.scheduled_at) {
      const local = new Date(editing.scheduled_at + ':00+03:00');
      scheduledIso = local.toISOString();
    }
    const payload = {
      title: editing.title?.trim(),
      message_text: editing.message_text || '',
      image_url: editing.image_url || null,
      media_type: editing.media_type || null,
      button_text: editing.button_text || null,
      button_url: editing.button_url || null,
      inline_buttons: editing.inline_buttons || null,
      audience: editing.audience || 'all',
      status: status || editing.status || 'draft',
      scheduled_at: scheduledIso,
    };
    if (!payload.title) { alert('Название обязательно'); return null; }
    try {
      if (editing.id) {
        await adminApi.put(`/broadcasts-users/${editing.id}`, payload);
        load();
        return editing.id;
      } else {
        const d = await adminApi.post('/broadcasts-users', payload);
        load();
        return d?.id;
      }
    } catch (e) { alert(e?.message || 'Ошибка'); return null; }
  };

  const sendNow = async () => {
    if (!confirm(`Отправить рассылку "${editing.title}" сразу всем выбранным?`)) return;
    const id = await save('draft');
    if (!id) return;
    try {
      await adminApi.post(`/broadcasts-users/${id}/send-now`);
      setEditing(null);
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const sendTest = async () => {
    const id = await save();
    if (!id) return;
    try {
      const d = await adminApi.post(`/broadcasts-users/${id}/send-test`);
      alert(`Отправлено себе: ${d.sent}, ошибок: ${d.failed}`);
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const schedule = async () => {
    if (!editing.scheduled_at) { alert('Укажите дату/время для планирования'); return; }
    const id = await save('scheduled');
    if (id) setEditing(null);
  };

  const del = async (it) => {
    if (!confirm(`Удалить рассылку «${it.title}»?`)) return;
    try { await adminApi.delete(`/broadcasts-users/${it.id}`); load(); } catch (e) { alert(e?.message); }
  };

  const cancel = async (it) => {
    if (!confirm('Отменить рассылку?')) return;
    try { await adminApi.post(`/broadcasts-users/${it.id}/cancel`); load(); } catch (e) { alert(e?.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ ...pageTitle, margin: 0 }}>Рассылка по базе пользователей</h1>
        <button style={btnPrimary} onClick={() => { setEditing(emptyForm()); setAudCount(null); }}>+ Создать</button>
      </div>

      <div style={{ ...card, marginBottom: 20, fontSize: 13, color: '#6b7280' }}>
        💬 Рассылка отправляется в личку через бота (MAX/Telegram). Можно прикрепить картинку и кнопку,
        отправить сразу, запланировать на дату или сделать тестовую отправку себе.
      </div>

      {loading && items.length === 0 ? <div style={emptyState}>Загрузка…</div>
        : items.length === 0 ? <div style={emptyState}>Рассылок ещё нет</div>
        : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Название</th>
                <th style={th}>Аудитория</th>
                <th style={th}>Статус</th>
                <th style={th}>Когда</th>
                <th style={th}>Прогресс</th>
                <th style={th}>Действия</th>
              </tr></thead>
              <tbody>{items.map(it => {
                const sm = STATUS_META[it.status] || STATUS_META.draft;
                const am = AUDIENCE_META[it.audience] || AUDIENCE_META.all;
                return (
                  <tr key={it.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        {(it.message_text || '').slice(0, 80)}{(it.message_text || '').length > 80 ? '…' : ''}
                      </div>
                    </td>
                    <td style={td}><span style={badge(am.bg, am.fg)}>{am.label}</span></td>
                    <td style={td}><span style={badge(sm.bg, sm.fg)}>{sm.label}</span></td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
                      {it.status === 'sent' && it.completed_at && `Отпр.: ${fmtDate(it.completed_at)}`}
                      {it.status === 'scheduled' && it.scheduled_at && `На: ${fmtDate(it.scheduled_at)}`}
                      {it.status === 'sending' && it.started_at && `Старт: ${fmtDate(it.started_at)}`}
                      {it.status === 'draft' && fmtDate(it.created_at)}
                    </td>
                    <td style={td}>
                      {(it.sent_count || 0) > 0 || (it.failed_count || 0) > 0 ? (
                        <span style={{ fontSize: 12 }}>
                          ✓ <b>{it.sent_count}</b>
                          {it.failed_count > 0 && <> · ✗ <b style={{ color: '#dc2626' }}>{it.failed_count}</b></>}
                          <span style={{ color: '#9ca3af' }}> / {it.total_count}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(it.status === 'draft' || it.status === 'scheduled') && (
                          <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditing({ ...it, scheduled_at: it.scheduled_at?.slice(0, 16) || '' }); }}>Изменить</button>
                        )}
                        {(it.status === 'scheduled' || it.status === 'sending') && (
                          <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} onClick={() => cancel(it)}>Отменить</button>
                        )}
                        {it.status !== 'sending' && (
                          <button style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }} onClick={() => del(it)}>×</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}

      {editing && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700 }}>
              {editing.id ? `Изменить рассылку · #${editing.id}` : 'Новая рассылка'}
            </h3>

            <BField label="Название (внутреннее) *" v={editing.title}
              onChange={v => setEditing(e => ({ ...e, title: v }))}
              placeholder="Промо ИИ-стикеров — мартовская" />

            <div style={{ marginBottom: 12 }}>
              <label style={fieldLabel}>Текст сообщения *</label>
              <RichTextEditor
                value={editing.message_text}
                onChange={v => setEditing(e => ({ ...e, message_text: v }))}
                placeholder="Привет! У нас новая фича — …"
                rows={6}
                showEmoji={true}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <AdminFileInput
                label="Картинка или видео (необязательно)"
                value={editing.image_url}
                accept="image/*,video/mp4,video/quicktime,video/webm"
                onChange={(url, ftype) => setEditing(e => ({
                  ...e,
                  image_url: url,
                  media_type: ftype === 'video' ? 'video' : (ftype === 'photo' ? 'photo' : (e.media_type || 'photo')),
                }))}
              />
              {editing.image_url && (
                <div style={{ marginTop: 6 }}>
                  <label style={fieldLabel}>Тип медиа</label>
                  <select value={editing.media_type || 'photo'} onChange={e => setEditing(p => ({ ...p, media_type: e.target.value }))} style={input}>
                    <option value="photo">Фото</option>
                    <option value="video">Видео</option>
                    <option value="document">Документ</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={fieldLabel}>Кнопки под сообщением (можно несколько)</label>
              <ButtonBuilder
                value={editing.inline_buttons}
                onChange={v => setEditing(e => ({ ...e, inline_buttons: v }))}
                showLeadMagnet={false}
                showComments={false}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={fieldLabel}>
                Аудитория{' '}
                {audCount !== null && (
                  <span style={{ color: '#4361ee' }}>(≈ {audCount} получателей)</span>
                )}
              </label>
              <select value={editing.audience || 'all'}
                onChange={e => setEditing(p => ({ ...p, audience: e.target.value }))}
                style={input}>
                <option value="all">Все пользователи</option>
                <option value="max">Только в MAX</option>
                <option value="telegram">Только в Telegram</option>
                <option value="paid">С активной подпиской</option>
                <option value="free">Без активной подписки</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Запланировать на (МСК)</label>
              <input
                type="datetime-local"
                value={editing.scheduled_at || ''}
                min={nowMskString()}
                onChange={e => setEditing(p => ({ ...p, scheduled_at: e.target.value }))}
                style={input}
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Оставьте пустым — для немедленной отправки. Нельзя планировать в прошедшем времени.
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(null)} style={btnOutline}>Закрыть</button>
                  <button onClick={() => save('draft').then(id => id && setEditing(null))} style={btnOutline}>
                    💾 Черновик
                  </button>
                  <button onClick={sendTest} style={{ ...btnOutline, color: '#4361ee', borderColor: '#4361ee' }}>
                    📨 Себе
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {editing.scheduled_at ? (
                    <button onClick={schedule}
                      style={{ ...btnPrimary, background: '#3b82f6', fontWeight: 700 }}>
                      ⏰ Запланировать
                    </button>
                  ) : (
                    <button onClick={sendNow}
                      style={{ ...btnPrimary, background: '#16a34a', fontWeight: 700, padding: '10px 22px' }}>
                      📢 Отправить ВСЕМ сейчас
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
                {editing.scheduled_at
                  ? '⏰ Режим планирования: рассылка стартует автоматом в указанное время МСК.'
                  : '📢 Без даты: рассылка уйдёт сразу после нажатия зелёной кнопки.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 };

function BField({ label, v, onChange, placeholder, multiline, type }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {multiline
        ? <textarea rows={3} value={v || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...input, resize: 'vertical' }} />
        : <input type={type || 'text'} value={v || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={input} />}
    </div>
  );
}
