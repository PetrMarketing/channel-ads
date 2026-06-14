import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, emptyState,
} from './adminStyles';

const STATUS_LABEL = {
  visible:     { label: 'Видимый',      color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
  coming_soon: { label: 'Скоро',        color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
  hidden:      { label: 'Скрыт',        color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
};

// Подсказка для админа: какие ключи имеют смысл и куда они подвязываются в UI
const SUGGESTED_KEYS = [
  { key: 'content_polls',   title: 'Опросы (вкладка в Контенте)' },
  { key: 'content_streams', title: 'Эфиры (вкладка в Контенте)' },
];

export default function AdminVisibilityPage() {
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminApi.get('/feature-visibility/');
      if (d?.success) setItems(d.items || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (item) => {
    try {
      await adminApi.put(`/feature-visibility/${encodeURIComponent(item.feature_key)}`, {
        title: item.title || '',
        visibility: item.visibility || 'visible',
        coming_soon_message: item.coming_soon_message || 'Этот раздел скоро появится',
      });
      setEditing(null);
      setCreating(null);
      load();
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  };

  const remove = async (key) => {
    if (!confirm(`Удалить флаг «${key}»?`)) return;
    await adminApi.delete(`/feature-visibility/${encodeURIComponent(key)}`);
    load();
  };

  const renderRow = (item, isEdit) => {
    const st = STATUS_LABEL[item.visibility] || STATUS_LABEL.visible;
    if (isEdit) {
      return (
        <tr key={item.feature_key}>
          <td style={td}>
            <input value={item.feature_key} disabled style={inputStyle} />
          </td>
          <td style={td}>
            <input value={item.title || ''} onChange={e => setEditing({ ...item, title: e.target.value })}
              placeholder="Название раздела" style={inputStyle} />
          </td>
          <td style={td}>
            <select value={item.visibility} onChange={e => setEditing({ ...item, visibility: e.target.value })}
              style={inputStyle}>
              <option value="visible">Видимый</option>
              <option value="coming_soon">Скоро</option>
              <option value="hidden">Скрыт</option>
            </select>
          </td>
          <td style={td}>
            <input value={item.coming_soon_message || ''}
              onChange={e => setEditing({ ...item, coming_soon_message: e.target.value })}
              placeholder="Текст заглушки" style={inputStyle} />
          </td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            <button style={btnPrimary} onClick={() => save(item)}>Сохранить</button>
            <button style={{ ...btnOutline, marginLeft: 6 }} onClick={() => setEditing(null)}>Отмена</button>
          </td>
        </tr>
      );
    }
    return (
      <tr key={item.feature_key}>
        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{item.feature_key}</td>
        <td style={td}>{item.title}</td>
        <td style={td}>
          <span style={{ background: st.bg, color: st.color, padding: '2px 10px', borderRadius: 999, fontWeight: 600, fontSize: 12 }}>
            {st.label}
          </span>
        </td>
        <td style={{ ...td, color: '#666', fontSize: 13 }}>{item.coming_soon_message}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <button style={btnOutline} onClick={() => setEditing({ ...item })}>Изменить</button>
          <button style={{ ...btnOutline, marginLeft: 6, color: '#dc2626' }} onClick={() => remove(item.feature_key)}>×</button>
        </td>
      </tr>
    );
  };

  const usedKeys = new Set(items.map(i => i.feature_key));
  const suggested = SUGGESTED_KEYS.filter(s => !usedKeys.has(s.key));

  return (
    <div>
      <h1 style={pageTitle}>Видимость разделов</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        Глобальные флаги для всех каналов. Используйте «Скоро» — раздел будет показан как заглушка
        «Этот раздел скоро появится», но останется виден в меню. «Скрыт» — раздел исчезнет.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, alignItems: 'center' }}>
          <div>
            <b>Известные разделы</b>
            <span style={{ color: '#999', marginLeft: 8 }}>({items.length})</span>
          </div>
          <button style={btnPrimary} onClick={() => setCreating({
            feature_key: '', title: '', visibility: 'visible', coming_soon_message: 'Этот раздел скоро появится',
          })}>+ Добавить флаг</button>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>Загрузка…</div>
        ) : items.length === 0 && !creating ? (
          <div style={emptyState}>Пока нет флагов. Добавьте первый.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Ключ</th>
                  <th style={th}>Название</th>
                  <th style={th}>Статус</th>
                  <th style={th}>Сообщение заглушки</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {creating && (
                  <tr key="__new__">
                    <td style={td}>
                      <input value={creating.feature_key}
                        onChange={e => setCreating({ ...creating, feature_key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
                        placeholder="content_polls" style={inputStyle} />
                    </td>
                    <td style={td}>
                      <input value={creating.title} onChange={e => setCreating({ ...creating, title: e.target.value })}
                        placeholder="Название" style={inputStyle} />
                    </td>
                    <td style={td}>
                      <select value={creating.visibility} onChange={e => setCreating({ ...creating, visibility: e.target.value })}
                        style={inputStyle}>
                        <option value="visible">Видимый</option>
                        <option value="coming_soon">Скоро</option>
                        <option value="hidden">Скрыт</option>
                      </select>
                    </td>
                    <td style={td}>
                      <input value={creating.coming_soon_message}
                        onChange={e => setCreating({ ...creating, coming_soon_message: e.target.value })}
                        style={inputStyle} />
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button style={btnPrimary} onClick={() => creating.feature_key && save(creating)}>Создать</button>
                      <button style={{ ...btnOutline, marginLeft: 6 }} onClick={() => setCreating(null)}>×</button>
                    </td>
                  </tr>
                )}
                {items.map(it => renderRow(editing?.feature_key === it.feature_key ? editing : it, editing?.feature_key === it.feature_key))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suggested.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <b>Подсказки — известные UI-разделы:</b>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suggested.map(s => (
              <button key={s.key} style={{ ...btnOutline, fontSize: 13 }}
                onClick={() => setCreating({
                  feature_key: s.key, title: s.title, visibility: 'coming_soon',
                  coming_soon_message: `${s.title} скоро появятся`,
                })}>
                + {s.title} <span style={{ fontFamily: 'monospace', color: '#999', marginLeft: 4 }}>({s.key})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
};
