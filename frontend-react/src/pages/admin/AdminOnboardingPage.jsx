import React, { useEffect, useState, useMemo } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline,
  badge, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';
import { STEP_GROUPS } from '../../components/OnboardingTour';

const GROUP_LABELS = {
  noChannel: { label: 'Без канала', bg: '#fef3c7', fg: '#92400e' },
  noBilling: { label: 'Без подписки', bg: '#dbeafe', fg: '#1e40af' },
  full:      { label: 'Полный тур', bg: '#dcfce7', fg: '#166534' },
};

export default function AdminOnboardingPage() {
  const [overridesMap, setOverridesMap] = useState({}); // { step_id: {title, text, updated_by_username, updated_at} }
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => {
    adminApi.get('/onboarding/overrides').then(d => {
      if (d?.success) {
        const map = {};
        for (const o of d.overrides || []) map[o.step_id] = o;
        setOverridesMap(map);
      }
    });
  };
  useEffect(() => { load(); }, []);

  // Собираем все шаги из всех групп с дедупликацией по step_id
  const allSteps = useMemo(() => {
    const seen = new Map();
    Object.entries(STEP_GROUPS).forEach(([groupKey, list]) => {
      list.forEach(s => {
        const cur = seen.get(s.id);
        if (cur) {
          cur.groups.push(groupKey);
        } else {
          seen.set(s.id, { ...s, groups: [groupKey] });
        }
      });
    });
    return Array.from(seen.values());
  }, []);

  const filtered = filter
    ? allSteps.filter(s =>
        s.id.toLowerCase().includes(filter.toLowerCase()) ||
        (s.title || '').toLowerCase().includes(filter.toLowerCase()) ||
        (s.text || '').toLowerCase().includes(filter.toLowerCase()))
    : allSteps;

  const save = async () => {
    if (!editing) return;
    try {
      await adminApi.put(`/onboarding/overrides/${encodeURIComponent(editing.id)}`, {
        title: editing.titleOverride || '',
        text: editing.textOverride || '',
      });
      setEditing(null);
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const reset = async (stepId) => {
    if (!confirm('Сбросить оверрайд для этого шага?')) return;
    await adminApi.put(`/onboarding/overrides/${encodeURIComponent(stepId)}`, { title: '', text: '' });
    load();
  };

  return (
    <div>
      <h1 style={{ ...pageTitle, marginBottom: 12 }}>Онбординг — тексты шагов</h1>
      <div style={{ ...card, marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
        💡 Здесь можно переопределить заголовок и текст любого шага обучающего тура без релиза.
        Сами шаги (когда показываются, на какую кнопку указывают, куда ведут) — в коде.
        Чтобы вернуть дефолтный текст — сбросьте оверрайд.
      </div>

      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          placeholder="Поиск по step_id, заголовку или тексту…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} из {allSteps.length} · Изменено: {Object.keys(overridesMap).length}
        </span>
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>step_id</th>
            <th style={th}>Группы</th>
            <th style={th}>Заголовок</th>
            <th style={th}>Текст</th>
            <th style={th}>Действия</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={emptyState}>Шагов не найдено</td></tr>}
            {filtered.map(s => {
              const ov = overridesMap[s.id];
              const isOverridden = !!ov;
              const effectiveTitle = ov?.title || s.title;
              const effectiveText = ov?.text || s.text;
              return (
                <tr key={s.id}>
                  <td style={td}>
                    <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>{s.id}</code>
                    {isOverridden && (
                      <div style={{ marginTop: 4, fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
                        ✏️ изменено {ov.updated_by_username && `· ${ov.updated_by_username}`}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(s.groups || []).map(g => {
                        const m = GROUP_LABELS[g] || { label: g, bg: '#f3f4f6', fg: '#6b7280' };
                        return <span key={g} style={badge(m.bg, m.fg)}>{m.label}</span>;
                      })}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{effectiveTitle || '—'}</div>
                    {isOverridden && ov.title && ov.title !== s.title && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, textDecoration: 'line-through' }}>{s.title}</div>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 12, color: '#374151', maxWidth: 460 }}>
                      {effectiveText?.length > 200 ? effectiveText.slice(0, 200) + '…' : effectiveText}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setEditing({
                          id: s.id, defaultTitle: s.title, defaultText: s.text,
                          titleOverride: ov?.title || '', textOverride: ov?.text || '',
                        })}
                        style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}
                      >Изменить</button>
                      {isOverridden && (
                        <button onClick={() => reset(s.id)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca' }}>↺ Сброс</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: 600 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>Редактировать шаг</h3>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
              <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 6 }}>{editing.id}</code>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Заголовок (по умолчанию: «{editing.defaultTitle}»)
            </label>
            <input
              type="text"
              value={editing.titleOverride}
              onChange={e => setEditing(p => ({ ...p, titleOverride: e.target.value }))}
              placeholder={editing.defaultTitle}
              style={input}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
              Текст (оставьте пустым чтобы вернуть дефолт)
            </label>
            <textarea
              rows={5}
              value={editing.textOverride}
              onChange={e => setEditing(p => ({ ...p, textOverride: e.target.value }))}
              placeholder={editing.defaultText}
              style={{ ...input, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: -8, marginBottom: 14 }}>
              Дефолтный: «{editing.defaultText}»
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={btnOutline}>Отмена</button>
              <button onClick={save} style={btnPrimary}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const input = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 };
