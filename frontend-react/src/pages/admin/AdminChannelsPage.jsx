import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, tableWrap, th, td, searchInput, badge, emptyState, fmtDate,
  btnOutline, btnPrimary, btnDanger, statusBadge, modalOverlay, modalBox,
} from './adminStyles';

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [statusModal, setStatusModal] = useState(null); // { channel }
  const [delModal, setDelModal] = useState(null); // { channel }
  const [actionReason, setActionReason] = useState('');
  const navigate = useNavigate();

  const load = () => {
    let url = `/channels?page=${page}&limit=20&search=${encodeURIComponent(search)}`;
    if (platform) url += `&platform=${platform}`;
    if (billingStatus) url += `&billing_status=${billingStatus}`;
    adminApi.get(url).then(d => { if (d) { setChannels(d.channels || []); setTotal(d.total || 0); } }).catch(() => {});
  };
  useEffect(load, [page, search, platform, billingStatus]);

  const setStatus = async (channel, newStatus) => {
    if (!actionReason.trim() && newStatus !== 'active') {
      alert('Укажите причину');
      return;
    }
    try {
      await adminApi.put(`/channels/${channel.id}/billing-status`, {
        status: newStatus, reason: actionReason || `Установлен статус "${newStatus}"`,
      });
      setStatusModal(null);
      setActionReason('');
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const deleteChannel = async () => {
    if (!actionReason.trim()) { alert('Укажите причину удаления'); return; }
    try {
      await adminApi.delete(`/channels/${delModal.channel.id}`, { reason: actionReason });
      setDelModal(null);
      setActionReason('');
      load();
    } catch (e) { alert(e?.message || 'Ошибка'); }
  };

  const totalPages = Math.ceil(total / 20);

  const platformBadge = (p) => {
    if (p === 'max') return badge('#dbeafe', '#1e40af');
    return badge('#dcfce7', '#166534');
  };

  const selectStyle = {
    padding: '8px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
    fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
  };

  return (
    <div>
      <h2 style={pageTitle}>Каналы</h2>
      <p style={{ fontSize: 12, color: '#bbb', marginTop: 3, marginBottom: 20 }}>
        Всего: {total}
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Название, username, email или имя владельца..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ ...searchInput, minWidth: 300, flex: 1 }}
        />
        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Все платформы</option>
          <option value="telegram">Telegram</option>
          <option value="max">MAX</option>
        </select>
        <select
          value={billingStatus}
          onChange={e => { setBillingStatus(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="trial">Триал</option>
          <option value="expired">Просрочены</option>
          <option value="frozen">Заморожены</option>
          <option value="none">Без подписки</option>
        </select>
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Название</th>
              <th style={th}>Платформа</th>
              <th style={th}>Владелец</th>
              <th style={th}>Подписка</th>
              <th style={th}>Истекает</th>
              <th style={th}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr><td colSpan={7} style={emptyState}>Каналы не найдены</td></tr>
            )}
            {channels.map(ch => (
              <tr
                key={ch.id}
                style={{ transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ ...td, fontWeight: 600, color: '#6b7280' }}>{ch.id}</td>
                <td style={{ ...td, cursor: 'pointer' }} onClick={() => navigate(`/admin/channels/${ch.id}`)}>
                  <div style={{ fontWeight: 600 }}>{ch.title || '—'}</div>
                  {ch.username && <div style={{ fontSize: 11, color: '#9ca3af' }}>{ch.username}</div>}
                </td>
                <td style={td}>
                  <span style={platformBadge(ch.platform)}>{ch.platform}</span>
                </td>
                <td style={td}>
                  <div>{ch.owner_name || ch.owner_username || '—'}</div>
                  {ch.owner_email && <div style={{ fontSize: 11, color: '#9ca3af' }}>{ch.owner_email}</div>}
                </td>
                <td style={td}>
                  <span style={statusBadge(ch.billing_status === 'active' ? 'active' : 'closed')}>
                    {ch.billing_status || 'нет'}
                  </span>
                </td>
                <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{fmtDate(ch.billing_expires)}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => { setStatusModal({ channel: ch }); setActionReason(''); }}
                      style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>
                      Статус
                    </button>
                    <button onClick={() => { setDelModal({ channel: ch }); setActionReason(''); }}
                      style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }}>
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status modal */}
      {statusModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>Изменить статус канала</h3>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              «{statusModal.channel.title || statusModal.channel.username}» — текущий: <b>{statusModal.channel.billing_status || 'нет'}</b>
            </div>
            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Причина (для лога)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setStatus(statusModal.channel, 'active')} style={{ ...btnPrimary, background: '#16a34a' }}>✓ Активный</button>
              <button onClick={() => setStatus(statusModal.channel, 'trial')} style={{ ...btnPrimary, background: '#3b82f6' }}>Триал</button>
              <button onClick={() => setStatus(statusModal.channel, 'frozen')} style={{ ...btnPrimary, background: '#f59e0b' }}>❄ Заморозить</button>
              <button onClick={() => setStatus(statusModal.channel, 'expired')} style={{ ...btnPrimary, background: '#6b7280' }}>Истекший</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStatusModal(null)} style={btnOutline}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {delModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700, color: '#dc2626' }}>⚠️ Удалить канал?</h3>
            <div style={{ fontSize: 13, color: '#1a1a2e', marginBottom: 8 }}>
              «<b>{delModal.channel.title || delModal.channel.username}</b>» (id={delModal.channel.id}) будет удалён
              <b> безвозвратно</b> вместе со всеми постами, рассылками, подписчиками и биллингом.
            </div>
            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Причина удаления (обязательно)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, margin: '12px 0 16px', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelModal(null)} style={btnOutline}>Отмена</button>
              <button onClick={deleteChannel} style={btnDanger}>Удалить навсегда</button>
            </div>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ ...btnOutline, opacity: page <= 1 ? 0.4 : 1 }}
          >
            Назад
          </button>
          <span style={{ padding: '6px 10px', fontSize: 13, color: '#888' }}>
            Стр. {page} из {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ ...btnOutline, opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Далее
          </button>
        </div>
      )}
    </div>
  );
}
