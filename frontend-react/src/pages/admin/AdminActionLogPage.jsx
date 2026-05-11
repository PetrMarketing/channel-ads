import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { pageTitle, card, tableWrap, th, td, badge, fmtDate, emptyState } from './adminStyles';

const ACTION_LABELS = {
  tokens_adjust:  { label: 'Изменение токенов',     bg: '#ede9fe', fg: '#7c3aed' },
  billing_adjust: { label: 'Изменение подписки',    bg: '#dcfce7', fg: '#166534' },
  channel_freeze: { label: 'Заморозка канала',      bg: '#fef3c7', fg: '#92400e' },
  notification_create: { label: 'Создано уведомление', bg: '#e0e7ff', fg: '#3730a3' },
  broadcast_users: { label: 'Рассылка пользователям', bg: '#fce7f3', fg: '#9d174d' },
};

function actionMeta(action) {
  return ACTION_LABELS[action] || { label: action || '—', bg: '#f3f4f6', fg: '#374151' };
}

function fmtPayload(action, p) {
  if (!p) return '';
  if (action === 'tokens_adjust') {
    const sign = (p.delta || 0) >= 0 ? '+' : '';
    return `${sign}${p.delta} ИИт · ${p.before} → ${p.after}${p.reason ? ` · «${p.reason}»` : ''}`;
  }
  if (action === 'billing_adjust') {
    const sign = (p.delta_days || 0) >= 0 ? '+' : '';
    return `${sign}${p.delta_days} дн. · ${p.channel_title || ''}${p.reason ? ` · «${p.reason}»` : ''}`;
  }
  return JSON.stringify(p);
}

export default function AdminActionLogPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminApi.get('/action-log?limit=200');
      if (d?.success) setItems(d.items || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = filterAction ? items.filter(i => i.action === filterAction) : items;
  const uniqueActions = Array.from(new Set(items.map(i => i.action))).filter(Boolean);

  return (
    <div>
      <h1 style={{ ...pageTitle, marginBottom: 16 }}>Лог действий админов</h1>

      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Фильтр:</span>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
        >
          <option value="">Все действия</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{actionMeta(a).label}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          Показано: {filtered.length} из {items.length}
        </span>
      </div>

      {loading ? <div style={emptyState}>Загрузка…</div>
        : filtered.length === 0 ? <div style={emptyState}>Нет записей</div>
        : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Когда</th>
                  <th style={th}>Админ</th>
                  <th style={th}>Действие</th>
                  <th style={th}>Цель</th>
                  <th style={th}>Детали</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => {
                  const m = actionMeta(it.action);
                  return (
                    <tr key={it.id}>
                      <td style={td}><span style={{ whiteSpace: 'nowrap' }}>{fmtDate(it.created_at)}</span></td>
                      <td style={td}><b>{it.admin_username}</b></td>
                      <td style={td}><span style={badge(m.bg, m.fg)}>{m.label}</span></td>
                      <td style={td}>
                        {it.target_type ? (
                          <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {it.target_type} #{it.target_id}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 13, color: '#1a1a2e' }}>{fmtPayload(it.action, it.payload)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
