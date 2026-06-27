import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { pageTitle, card } from './adminStyles';

// Полный список разделов сервиса (из левого меню Sidebar) — кроме «Обзор» и «Тарифы».
// Группировка для удобства, чтобы админ видел структуру меню.
const SECTIONS = [
  {
    group: 'Маркетинг',
    items: [
      { key: 'ai_design',  label: 'ИИ Оформление' },
      { key: 'links',      label: 'Ссылки' },
      { key: 'pins',       label: 'Закрепы' },
      { key: 'broadcasts', label: 'Рассылки' },
      { key: 'funnels',    label: 'Воронки' },
      { key: 'analytics',  label: 'Аналитика' },
      { key: 'ord',        label: 'Отчёты о рекламе' },
    ],
  },
  {
    group: 'Контент',
    items: [
      { key: 'content',          label: 'Публикации' },
      { key: 'content_polls',    label: 'Опросы' },
      { key: 'content_streams',  label: 'Эфиры' },
      { key: 'giveaways',        label: 'Розыгрыши' },
      { key: 'comments',         label: 'Комментарии' },
    ],
  },
  {
    group: 'Монетизация',
    items: [
      { key: 'paid_chats', label: 'Платные чаты' },
      { key: 'services',   label: 'Услуги и запись' },
      { key: 'shop',       label: 'Магазин' },
    ],
  },
  {
    group: 'ИИ',
    items: [
      { key: 'ai_assistant', label: 'ИИ Помощник' },
    ],
  },
  {
    group: 'Прочее',
    items: [
      { key: 'staff',     label: 'Сотрудники' },
      { key: 'trash',     label: 'Корзина' },
      { key: 'ai_tokens', label: 'ИИ Токены' },
      { key: 'referrals', label: 'Реферальная система' },
    ],
  },
];

export default function AdminVisibilityPage() {
  const [flags, setFlags] = useState({}); // {key: 'visible'|'coming_soon'}
  const [saving, setSaving] = useState({}); // {key: bool}
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminApi.get('/feature-visibility/');
      if (d?.success) {
        const map = {};
        for (const it of (d.items || [])) {
          map[it.feature_key] = it.visibility;
        }
        setFlags(map);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (key, label, value) => {
    setSaving(s => ({ ...s, [key]: true }));
    // Оптимистичное обновление
    setFlags(prev => ({ ...prev, [key]: value }));
    try {
      await adminApi.put(`/feature-visibility/${encodeURIComponent(key)}`, {
        title: label,
        visibility: value,
        coming_soon_message: `${label} скоро появятся`,
      });
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
      load();
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  const renderRow = (item) => {
    const cur = flags[item.key] || 'visible';
    const isSaving = !!saving[item.key];
    return (
      <div key={item.key} style={rowStyle}>
        <div style={{ fontWeight: 500, color: '#1a1a2e' }}>{item.label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            disabled={isSaving}
            onClick={() => toggle(item.key, item.label, 'visible')}
            style={cur === 'visible' ? btnActiveVisible : btnInactive}
          >
            ✓ Видимый
          </button>
          <button
            disabled={isSaving}
            onClick={() => toggle(item.key, item.label, 'coming_soon')}
            style={cur === 'coming_soon' ? btnActiveSoon : btnInactive}
          >
            ⏳ Скоро
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1 style={pageTitle}>Видимость разделов</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14, maxWidth: 760 }}>
        Управляйте отображением разделов сервиса для всех пользователей.
        <b> «Видимый»</b> — раздел работает как обычно.
        <b> «Скоро»</b> — раздел остаётся в меню, но открывается с заглушкой «Этот раздел скоро появится».
        Изменения применяются ко всем каналам.
      </p>

      {loading ? (
        <div style={{ padding: 30, color: '#999' }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {SECTIONS.map(section => (
            <div key={section.group} style={card}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                {section.group}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {section.items.map(renderRow)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const rowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 0', borderBottom: '1px solid #f3f4f6',
};

const btnBase = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  transition: 'all 0.15s',
};

const btnInactive = { ...btnBase, color: '#6b7280' };
const btnActiveVisible = { ...btnBase, background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 700 };
const btnActiveSoon = { ...btnBase, background: '#d97706', borderColor: '#d97706', color: '#fff', fontWeight: 700 };
