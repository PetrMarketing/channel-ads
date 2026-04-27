import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, statusBadge, statCard, fmtDate, emptyState, modalOverlay, modalBox,
} from './adminStyles';

const tabBtn = (active) => ({
  padding: '8px 16px', border: 'none',
  borderBottom: active ? '2px solid #4361ee' : '2px solid transparent',
  background: 'none', cursor: 'pointer', fontWeight: active ? 700 : 400,
  fontSize: 13, color: active ? '#4361ee' : '#999', transition: 'all 0.2s',
});

const tableStyle = { width: '100%', borderCollapse: 'collapse' };

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
  borderRadius: 10, fontSize: 13, boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.2s',
};
const selectStyle = { ...inputStyle };
const textareaStyle = { ...inputStyle, minHeight: 100, resize: 'vertical' };

const labelStyle = { fontSize: 11, color: '#999', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', display: 'block', marginBottom: 4 };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px' };

const TAB_CONFIG = {
  pins: { endpoint: 'pins', key: 'pins', label: 'Закрепы', cols: ['id', 'title', 'status', 'created_at'], editable: ['title', 'message_text', 'status', 'erid'], deleteEndpoint: 'pins' },
  leadMagnets: { endpoint: 'lead-magnets', key: 'leadMagnets', label: 'Лид-магниты', cols: ['id', 'name', 'status', 'created_at'], editable: ['name', 'title', 'message_text'], deleteEndpoint: 'lead-magnets' },
  content: { endpoint: 'content', key: 'posts', label: 'Посты', cols: ['id', 'title', 'status', 'created_at'], editable: ['title', 'message_text', 'status', 'scheduled_at', 'erid'], deleteEndpoint: 'content' },
  broadcasts: { endpoint: 'broadcasts', key: 'broadcasts', label: 'Рассылки', cols: ['id', 'title', 'status', 'created_at'], editable: ['title', 'message_text', 'status'], deleteEndpoint: 'broadcasts' },
  giveaways: { endpoint: 'giveaways', key: 'giveaways', label: 'Розыгрыши', cols: ['id', 'title', 'status', 'created_at'], editable: ['title', 'message_text', 'status', 'erid', 'legal_info'], deleteEndpoint: 'giveaways' },
  funnels: { endpoint: 'funnels', key: 'funnels', label: 'Воронки', cols: ['id', 'name', 'delay_minutes', 'step_order'] },
  subscribers: { endpoint: 'subscribers', key: 'subscribers', label: 'Подписчики' },
  paidChats: { endpoint: 'paid-chats', key: null, label: 'Платные чаты' },
  comments: { endpoint: 'comments', key: 'comments', label: 'Комментарии', cols: ['id', 'author_name', 'text', 'created_at'] },
  links: { endpoint: 'links', key: 'links', label: 'Ссылки' },
  logs: { endpoint: 'logs', key: 'logs', label: 'Логи' },
};

export default function AdminChannelProfilePage() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('pins');
  const [tabData, setTabData] = useState(null);
  const [editLink, setEditLink] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => { adminApi.get(`/channels/${channelId}`).then(d => { if (d) setData(d); }).catch(() => {}); }, [channelId]);

  useEffect(() => {
    setTabData(null);
    const cfg = TAB_CONFIG[tab];
    if (!cfg) return;
    adminApi.get(`/channels/${channelId}/${cfg.endpoint}`).then(d => {
      if (d) setTabData(d);
    }).catch(() => setTabData({}));
  }, [tab, channelId]);

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#bbb' }}>Загрузка...</div>;
  const { channel, staff } = data;

  const handleDeleteLink = async (linkId) => {
    if (!confirm('Удалить ссылку?')) return;
    await adminApi.delete(`/channels/${channelId}/links/${linkId}`);
    setTabData(prev => ({ ...prev, links: (prev?.links || []).filter(x => x.id !== linkId) }));
  };

  const handleSaveLink = async () => {
    await adminApi.put(`/channels/${channelId}/links/${editLink.id}`, editLink);
    setEditLink(null);
    adminApi.get(`/channels/${channelId}/links`).then(d => setTabData(d));
  };

  const reloadTab = () => {
    const cfg = TAB_CONFIG[tab];
    if (!cfg) return;
    adminApi.get(`/channels/${channelId}/${cfg.endpoint}`).then(d => { if (d) setTabData(d); }).catch(() => {});
  };

  const handleDeleteItem = async (itemId) => {
    const cfg = TAB_CONFIG[tab];
    if (!cfg?.deleteEndpoint || !confirm('Удалить?')) return;
    await adminApi.delete(`/channels/${channelId}/${cfg.deleteEndpoint}/${itemId}`);
    reloadTab();
  };

  const handleSaveItem = async () => {
    if (!editItem) return;
    const cfg = TAB_CONFIG[editItem._tab];
    if (!cfg?.deleteEndpoint) return;
    await adminApi.put(`/channels/${channelId}/${cfg.deleteEndpoint}/${editItem.id}`, editForm);
    setEditItem(null);
    reloadTab();
  };

  const openEditItem = (item) => {
    const cfg = TAB_CONFIG[tab];
    const form = {};
    (cfg.editable || []).forEach(f => { form[f] = item[f] || ''; });
    setEditForm(form);
    setEditItem({ ...item, _tab: tab });
    setPreviewMode(false);
  };

  const renderGenericTable = () => {
    const cfg = TAB_CONFIG[tab];
    if (!cfg?.cols) return null;
    const rows = tabData?.[cfg.key] || [];
    const hasActions = cfg.editable || cfg.deleteEndpoint;
    return (
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr>{cfg.cols.map(c => <th key={c} style={th}>{c}</th>)}{hasActions && <th style={th}></th>}</tr></thead>
          <tbody>
            {rows.map(item => (
              <tr key={item.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                {cfg.cols.map(c => (
                  <td key={c} style={td}>
                    {c === 'created_at' ? fmtDate(item[c]) :
                     c === 'status' ? <span style={statusBadge(item[c])}>{item[c] || '-'}</span> :
                     c === 'text' ? (item[c]?.slice(0, 80) || '-') :
                     c === 'message_text' ? (item[c]?.replace(/<[^>]+>/g, '').slice(0, 60) || '-') :
                     (item[c] ?? '-')}
                  </td>
                ))}
                {hasActions && (
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {cfg.editable && <button style={{ ...btnOutline, marginRight: 6, fontSize: 11, padding: '4px 12px' }} onClick={() => openEditItem(item)}>Ред.</button>}
                    {cfg.deleteEndpoint && <button style={{ ...btnDanger, fontSize: 11, padding: '4px 12px' }} onClick={() => handleDeleteItem(item.id)}>Удалить</button>}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cfg.cols.length + (hasActions ? 1 : 0)} style={emptyState}>Нет данных</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLinks = () => {
    const rows = tabData?.links || [];
    return (
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr><th style={th}>ID</th><th style={th}>Название</th><th style={th}>Код</th><th style={th}>UTM Source</th><th style={th}>Клики</th><th style={th}>Пауза</th><th style={th}></th></tr></thead>
          <tbody>{rows.map(l => (
            <tr key={l.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={td}>{l.id}</td><td style={{ ...td, fontWeight: 600 }}>{l.name}</td><td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{l.short_code}</td>
              <td style={td}>{l.utm_source || '—'}</td><td style={{ ...td, fontWeight: 600 }}>{l.clicks}</td>
              <td style={td}><span style={statusBadge(l.is_paused ? 'failed' : 'active')}>{l.is_paused ? 'Да' : 'Нет'}</span></td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <button style={{ ...btnOutline, marginRight: 6, fontSize: 11, padding: '4px 12px' }} onClick={() => setEditLink({ ...l })}>Ред.</button>
                <button style={{ ...btnDanger, fontSize: 11, padding: '4px 12px' }} onClick={() => handleDeleteLink(l.id)}>Удалить</button>
              </td>
            </tr>
          ))}{!rows.length && <tr><td colSpan={7} style={emptyState}>Нет ссылок</td></tr>}</tbody>
        </table>
      </div>
    );
  };

  const renderSubscribers = () => {
    const rows = tabData?.subscribers || [];
    return (
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr><th style={th}>ID</th><th style={th}>Имя</th><th style={th}>Username</th><th style={th}>Платформа</th><th style={th}>Дата</th></tr></thead>
          <tbody>{rows.map((s, i) => (
            <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{s.telegram_id || s.max_user_id || '—'}</td>
              <td style={{ ...td, fontWeight: 600 }}>{s.first_name || '—'}</td>
              <td style={td}>{s.username || '—'}</td>
              <td style={td}><span style={badge(s.telegram_id ? '#dbeafe' : '#ede9fe', s.telegram_id ? '#1e40af' : '#5b21b6')}>{s.platform || (s.telegram_id ? 'telegram' : 'max')}</span></td>
              <td style={td}>{fmtDate(s.subscribed_at)}</td>
            </tr>
          ))}{!rows.length && <tr><td colSpan={5} style={emptyState}>Нет подписчиков</td></tr>}</tbody>
        </table>
      </div>
    );
  };

  const renderPaidChats = () => {
    const chats = tabData?.chats || [];
    const members = tabData?.members || [];
    const posts = tabData?.posts || [];
    const paymentSettings = tabData?.payment_settings || [];
    const plans = tabData?.plans || [];
    const payments = tabData?.payments || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Payment Settings */}
        <div style={card}>
          <h4 style={sectionTitle}>Эквайринги ({paymentSettings.length})</h4>
          {paymentSettings.length > 0 ? (
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Провайдер</th><th style={th}>Активен</th><th style={th}>Ключи</th></tr></thead>
                <tbody>{paymentSettings.map(ps => {
                  let creds = ps.credentials;
                  if (typeof creds === 'string') try { creds = JSON.parse(creds); } catch { creds = {}; }
                  const keys = Object.keys(creds || {}).filter(k => k !== 'password' && k !== 'secret_key').map(k => `${k}: ${String(creds[k]).slice(0, 20)}...`).join(', ');
                  return (
                    <tr key={ps.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{ps.provider}</td>
                      <td style={td}><span style={statusBadge(ps.is_active ? 'active' : 'failed')}>{ps.is_active ? 'Да' : 'Нет'}</span></td>
                      <td style={{ ...td, fontSize: 11, color: '#999' }}>{keys || '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <div style={emptyState}>Не подключены</div>}
        </div>

        {/* Plans */}
        <div style={card}>
          <h4 style={sectionTitle}>Тарифы ({plans.length})</h4>
          {plans.length > 0 ? (
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>ID</th><th style={th}>Название</th><th style={th}>Цена</th><th style={th}>Тип</th><th style={th}>Дни</th><th style={th}>Активен</th></tr></thead>
                <tbody>{plans.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.id}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.title || '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#166534' }}>{p.price} {p.currency || 'RUB'}</td>
                    <td style={td}><span style={badge(p.plan_type === 'one_time' ? '#dbeafe' : '#ede9fe', p.plan_type === 'one_time' ? '#1e40af' : '#5b21b6')}>{p.plan_type === 'one_time' ? 'Разовый' : 'Подписка'}</span></td>
                    <td style={td}>{p.duration_days || '—'}</td>
                    <td style={td}><span style={statusBadge(p.is_active ? 'active' : 'failed')}>{p.is_active ? 'Да' : 'Нет'}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div style={emptyState}>Нет тарифов</div>}
        </div>

        {/* Chats */}
        <div style={card}>
          <h4 style={sectionTitle}>Чаты ({chats.length})</h4>
          {chats.length > 0 ? (
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>ID</th><th style={th}>Название</th><th style={th}>Chat ID</th><th style={th}>Статус</th></tr></thead>
                <tbody>{chats.map(c => (
                  <tr key={c.id}>
                    <td style={td}>{c.id}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.title || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{c.chat_id}</td>
                    <td style={td}><span style={statusBadge(c.is_active ? 'active' : 'failed')}>{c.is_active ? 'Активен' : 'Неактивен'}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div style={emptyState}>Нет чатов</div>}
        </div>

        {/* Members */}
        <div style={card}>
          <h4 style={sectionTitle}>Участники ({members.length})</h4>
          {members.length > 0 ? (
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Чат</th><th style={th}>User ID</th><th style={th}>Имя</th><th style={th}>Статус</th><th style={th}>Истекает</th><th style={th}>Дата</th></tr></thead>
                <tbody>{members.map((m, i) => (
                  <tr key={i}>
                    <td style={td}>{m.chat_title || m.paid_chat_id}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{m.telegram_id || m.max_user_id || '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{m.first_name || m.username || '—'}</td>
                    <td style={td}><span style={statusBadge(m.status)}>{m.status}</span></td>
                    <td style={td}>{m.expires_at ? fmtDate(m.expires_at) : 'Бессрочно'}</td>
                    <td style={td}>{fmtDate(m.joined_at || m.starts_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div style={emptyState}>Нет участников</div>}
        </div>

        {/* Payments */}
        <div style={card}>
          <h4 style={sectionTitle}>Платежи ({payments.length})</h4>
          {payments.length > 0 ? (
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>ID</th><th style={th}>Дата</th><th style={th}>Провайдер</th><th style={th}>Тариф</th><th style={th}>Сумма</th><th style={th}>Статус</th><th style={th}>User</th></tr></thead>
                <tbody>{payments.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.id}</td>
                    <td style={td}>{fmtDate(p.created_at)}</td>
                    <td style={td}>{p.provider}</td>
                    <td style={td}>{p.plan_title || '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#166534' }}>{p.amount} {p.currency || 'RUB'}</td>
                    <td style={td}><span style={statusBadge(p.status)}>{p.status}</span></td>
                    <td style={{ ...td, fontSize: 11 }}>{p.first_name || p.username || p.telegram_id || p.max_user_id || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div style={emptyState}>Нет платежей</div>}
        </div>

        {/* Posts */}
        {posts.length > 0 && (
          <div style={card}>
            <h4 style={sectionTitle}>Публикации ({posts.length})</h4>
            <div style={{ ...tableWrap, boxShadow: 'none', border: '1px solid #f0f0f0' }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>ID</th><th style={th}>Чат</th><th style={th}>Текст</th><th style={th}>Дата</th></tr></thead>
                <tbody>{posts.map(p => (
                  <tr key={p.id}><td style={td}>{p.id}</td><td style={td}>{p.chat_title || p.paid_chat_id}</td><td style={td}>{(p.message_text || '').slice(0, 60) || '—'}</td><td style={td}>{fmtDate(p.created_at)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLogs = () => {
    const rows = tabData?.logs || [];
    const typeColors = { visit: '#3b82f6', subscription: '#10b981', pin: '#f59e0b', broadcast: '#8b5cf6', post: '#6366f1', giveaway: '#ef4444', lead: '#14b8a6' };
    const typeLabels = { visit: 'Визит', subscription: 'Подписка', pin: 'Закреп', broadcast: 'Рассылка', post: 'Публикация', giveaway: 'Розыгрыш', lead: 'Лид-магнит' };
    return (
      <div style={card}>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {rows.map((log, i) => (
            <div key={i} style={{
              padding: '12px 16px', marginBottom: 8, borderRadius: 10, fontSize: 13,
              background: '#fafbfc',
              borderLeft: `3px solid ${typeColors[log.type] || '#ccc'}`,
              transition: 'background 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={badge((typeColors[log.type] || '#888') + '18', typeColors[log.type] || '#888')}>{typeLabels[log.type] || log.type}</span>
                <span style={{ fontSize: 11, color: '#bbb' }}>{fmtDate(log.created_at)}</span>
              </div>
              <div style={{ color: '#333', lineHeight: 1.5 }}>{log.text || '—'}</div>
              {log.platform && <span style={{ fontSize: 11, color: '#bbb', marginTop: 2, display: 'inline-block' }}>{log.platform}</span>}
            </div>
          ))}
          {!rows.length && <div style={emptyState}>Нет логов</div>}
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!tabData) return <div style={{ ...emptyState, padding: 40 }}>Загрузка...</div>;
    if (tab === 'links') return renderLinks();
    if (tab === 'subscribers') return renderSubscribers();
    if (tab === 'paidChats') return renderPaidChats();
    if (tab === 'logs') return renderLogs();
    return renderGenericTable();
  };

  return (
    <div>
      <button onClick={() => navigate('/admin/channels')} style={{ background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', marginBottom: 16, fontSize: 13, fontWeight: 600, padding: 0 }}>
        &larr; К списку каналов
      </button>

      {/* Channel header card */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h3 style={{ ...pageTitle, marginBottom: 16 }}>{channel.title || channel.username}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={statCard('#4361ee')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>ID</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{channel.id}</div>
          </div>
          <div style={statCard('#10b981')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Платформа</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{channel.platform}</div>
          </div>
          <div style={statCard('#f59e0b')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Username</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{channel.username || '—'}</div>
          </div>
          <div style={statCard('#8b5cf6')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Владелец</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#4361ee', cursor: 'pointer' }} onClick={() => navigate(`/admin/users/${channel.owner_id}`)}>{channel.owner_name || channel.owner_username}</div>
          </div>
          <div style={statCard(channel.billing_status === 'active' ? '#10b981' : '#ef4444')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Подписка</div>
            <div><span style={statusBadge(channel.billing_status === 'active' ? 'active' : 'failed')}>{channel.billing_status || 'нет'}</span></div>
          </div>
          <div style={statCard('#6366f1')}>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Истекает</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{channel.billing_expires ? new Date(channel.billing_expires).toLocaleDateString('ru') : '—'}</div>
          </div>
        </div>
      </div>

      {/* Staff */}
      {staff.length > 0 && (
        <div style={{ ...tableWrap, marginBottom: 20 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Сотрудники</h4>
          </div>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Имя</th><th style={th}>Username</th><th style={th}>Роль</th></tr></thead>
            <tbody>{staff.map(s => (
              <tr key={s.id}><td style={{ ...td, fontWeight: 600 }}>{s.first_name || '—'}</td><td style={td}>{s.username || '—'}</td><td style={td}><span style={statusBadge(s.role === 'admin' ? 'active' : 'draft')}>{s.role}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 20, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {Object.entries(TAB_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setTab(key)} style={tabBtn(tab === key)}>{cfg.label}</button>
        ))}
      </div>

      {renderTabContent()}

      {/* Edit Link Modal */}
      {editLink && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ ...pageTitle, fontSize: 18, marginBottom: 20 }}>Редактировать ссылку</h3>
            {['name', 'utm_source', 'utm_medium', 'utm_campaign'].map(field => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{field}</label>
                <input value={editLink[field] || ''} onChange={e => setEditLink({ ...editLink, [field]: e.target.value })}
                  style={inputStyle} />
              </div>
            ))}
            <label style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!editLink.is_paused} onChange={e => setEditLink({ ...editLink, is_paused: e.target.checked })} /> Пауза
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveLink} style={btnPrimary}>Сохранить</button>
              <button onClick={() => setEditLink(null)} style={btnOutline}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editItem && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ ...pageTitle, fontSize: 18, margin: 0 }}>Редактировать #{editItem.id}</h3>
              {editForm.message_text !== undefined && (
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#999' }}>
                  <input type="checkbox" checked={previewMode} onChange={e => setPreviewMode(e.target.checked)} />
                  Предпросмотр
                </label>
              )}
            </div>
            {Object.keys(editForm).map(field => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{field}</label>
                {field === 'message_text' ? (
                  previewMode ? (
                    <div
                      style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, minHeight: 100, fontSize: 14, lineHeight: 1.6, background: '#fafbfc', whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ __html: (editForm[field] || '')
                        .replace(/<br[^>]*\/?>/gi, '\n')
                        .replace(/<\/(?:div|p)>/gi, '\n')
                        .replace(/<(?:div|p|span)[^>]*>/gi, '')
                        .replace(/<\/?span[^>]*>/gi, '')
                      }}
                    />
                  ) : (
                    <textarea
                      value={editForm[field] || ''}
                      onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                      style={textareaStyle}
                    />
                  )
                ) : field === 'status' ? (
                  <select
                    value={editForm[field] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="draft">Черновик</option>
                    <option value="scheduled">Запланирован</option>
                    <option value="published">Опубликован</option>
                    <option value="active">Активен</option>
                    <option value="finished">Завершён</option>
                    <option value="sent">Отправлено</option>
                  </select>
                ) : (
                  <input
                    value={editForm[field] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={handleSaveItem} style={btnPrimary}>Сохранить</button>
              <button onClick={() => setEditItem(null)} style={btnOutline}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
