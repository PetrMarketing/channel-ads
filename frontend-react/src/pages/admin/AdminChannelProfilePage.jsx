import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

const cardStyle = { background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const tabBtn = (active) => ({
  padding: '8px 14px', border: 'none', borderBottom: active ? '2px solid #4361ee' : '2px solid transparent',
  background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 13, color: active ? '#4361ee' : '#666',
});
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thS = { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' };
const tdS = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5' };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };

// editable: which fields can be edited; deleteEndpoint: endpoint suffix for DELETE
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
  const [editItem, setEditItem] = useState(null); // { ...item, _tab: 'pins' }
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

  if (!data) return <div style={{ padding: 20 }}>Загрузка...</div>;
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

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ru') : '-';

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
      <table style={tableStyle}>
        <thead><tr>{cfg.cols.map(c => <th key={c} style={thS}>{c}</th>)}{hasActions && <th style={thS}></th>}</tr></thead>
        <tbody>
          {rows.map(item => (
            <tr key={item.id}>
              {cfg.cols.map(c => (
                <td key={c} style={tdS}>
                  {c === 'created_at' ? fmtDate(item[c]) :
                   c === 'text' ? (item[c]?.slice(0, 80) || '-') :
                   c === 'message_text' ? (item[c]?.replace(/<[^>]+>/g, '').slice(0, 60) || '-') :
                   (item[c] ?? '-')}
                </td>
              ))}
              {hasActions && (
                <td style={tdS}>
                  {cfg.editable && <button style={btnEdit} onClick={() => openEditItem(item)}>Ред.</button>}
                  {cfg.deleteEndpoint && <button style={btnDanger} onClick={() => handleDeleteItem(item.id)}>Удалить</button>}
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cfg.cols.length + (hasActions ? 1 : 0)} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>Нет данных</td></tr>}
        </tbody>
      </table>
    );
  };

  const renderLinks = () => {
    const rows = tabData?.links || [];
    return (
      <table style={tableStyle}>
        <thead><tr><th style={thS}>ID</th><th style={thS}>Название</th><th style={thS}>Код</th><th style={thS}>UTM Source</th><th style={thS}>Клики</th><th style={thS}>Пауза</th><th style={thS}></th></tr></thead>
        <tbody>{rows.map(l => (
          <tr key={l.id}>
            <td style={tdS}>{l.id}</td><td style={tdS}>{l.name}</td><td style={tdS}>{l.short_code}</td>
            <td style={tdS}>{l.utm_source || '-'}</td><td style={tdS}>{l.clicks}</td>
            <td style={tdS}>{l.is_paused ? 'Да' : 'Нет'}</td>
            <td style={tdS}>
              <button style={btnEdit} onClick={() => setEditLink({ ...l })}>Ред.</button>
              <button style={btnDanger} onClick={() => handleDeleteLink(l.id)}>Удалить</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    );
  };

  const renderSubscribers = () => {
    const rows = tabData?.subscribers || [];
    return (
      <table style={tableStyle}>
        <thead><tr><th style={thS}>ID</th><th style={thS}>Имя</th><th style={thS}>Username</th><th style={thS}>Платформа</th><th style={thS}>Дата</th></tr></thead>
        <tbody>{rows.map((s, i) => (
          <tr key={i}>
            <td style={tdS}>{s.telegram_id || s.max_user_id || '-'}</td>
            <td style={tdS}>{s.first_name || '-'}</td>
            <td style={tdS}>{s.username || '-'}</td>
            <td style={tdS}>{s.platform || (s.telegram_id ? 'telegram' : 'max')}</td>
            <td style={tdS}>{fmtDate(s.subscribed_at)}</td>
          </tr>
        ))}</tbody>
      </table>
    );
  };

  const renderPaidChats = () => {
    const chats = tabData?.chats || [];
    const members = tabData?.members || [];
    const posts = tabData?.posts || [];
    return (
      <div>
        <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Чаты ({chats.length})</h4>
        <table style={{ ...tableStyle, marginBottom: 16 }}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Название</th><th style={thS}>Цена</th><th style={thS}>Статус</th></tr></thead>
          <tbody>{chats.map(c => (
            <tr key={c.id}><td style={tdS}>{c.id}</td><td style={tdS}>{c.title || '-'}</td><td style={tdS}>{c.price || '-'}</td><td style={tdS}>{c.is_active ? 'Активен' : 'Неактивен'}</td></tr>
          ))}</tbody>
        </table>
        <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Участники ({members.length})</h4>
        <table style={{ ...tableStyle, marginBottom: 16 }}>
          <thead><tr><th style={thS}>Чат</th><th style={thS}>User ID</th><th style={thS}>Статус</th><th style={thS}>Дата</th></tr></thead>
          <tbody>{members.map((m, i) => (
            <tr key={i}><td style={tdS}>{m.chat_title || m.paid_chat_id}</td><td style={tdS}>{m.telegram_id || m.max_user_id || '-'}</td><td style={tdS}>{m.status || '-'}</td><td style={tdS}>{fmtDate(m.joined_at)}</td></tr>
          ))}</tbody>
        </table>
        <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Публикации ({posts.length})</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Чат</th><th style={thS}>Текст</th><th style={thS}>Дата</th></tr></thead>
          <tbody>{posts.map(p => (
            <tr key={p.id}><td style={tdS}>{p.id}</td><td style={tdS}>{p.chat_title || p.paid_chat_id}</td><td style={tdS}>{(p.message_text || '').slice(0, 60) || '-'}</td><td style={tdS}>{fmtDate(p.created_at)}</td></tr>
          ))}</tbody>
        </table>
        {!chats.length && !members.length && !posts.length && <div style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Нет данных</div>}
      </div>
    );
  };

  const renderLogs = () => {
    const rows = tabData?.logs || [];
    const typeColors = { visit: '#3b82f6', subscription: '#10b981', pin: '#f59e0b', broadcast: '#8b5cf6', post: '#6366f1', giveaway: '#ef4444', lead: '#14b8a6' };
    const typeLabels = { visit: 'Визит', subscription: 'Подписка', pin: 'Закреп', broadcast: 'Рассылка', post: 'Публикация', giveaway: 'Розыгрыш', lead: 'Лид-магнит' };
    return (
      <div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {rows.map((log, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: 6, borderRadius: 8, fontSize: 13,
              background: '#f8f9fa',
              borderLeft: `3px solid ${typeColors[log.type] || '#aaa'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: (typeColors[log.type] || '#888') + '20', color: typeColors[log.type] || '#888',
                }}>{typeLabels[log.type] || log.type}</span>
                <span style={{ fontSize: 11, color: '#999' }}>{fmtDate(log.created_at)}</span>
              </div>
              <div style={{ color: '#333' }}>{log.text || '-'}</div>
              {log.platform && <span style={{ fontSize: 11, color: '#999' }}>{log.platform}</span>}
            </div>
          ))}
          {!rows.length && <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Нет логов</div>}
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!tabData) return <div style={{ color: '#aaa', padding: 20 }}>Загрузка...</div>;
    if (tab === 'links') return renderLinks();
    if (tab === 'subscribers') return renderSubscribers();
    if (tab === 'paidChats') return renderPaidChats();
    if (tab === 'logs') return renderLogs();
    return renderGenericTable();
  };

  return (
    <div>
      <button onClick={() => navigate('/admin/channels')} style={{ background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
        &larr; К списку
      </button>
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>{channel.title || channel.username}</h3>
        <div style={{ fontSize: 13, color: '#666', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>ID: {channel.id}</div>
          <div>Платформа: {channel.platform}</div>
          <div>Username: {channel.username || '-'}</div>
          <div>Владелец: <span style={{ color: '#4361ee', cursor: 'pointer' }} onClick={() => navigate(`/admin/users/${channel.owner_id}`)}>{channel.owner_name || channel.owner_username}</span></div>
          <div>Подписка: <span style={{ color: channel.billing_status === 'active' ? '#2a9d8f' : '#e63946' }}>{channel.billing_status || 'нет'}</span></div>
          <div>Истекает: {channel.billing_expires ? new Date(channel.billing_expires).toLocaleDateString('ru') : '-'}</div>
        </div>
      </div>

      {staff.length > 0 && (
        <div style={cardStyle}>
          <h4 style={{ margin: '0 0 8px' }}>Сотрудники</h4>
          <table style={tableStyle}>
            <thead><tr><th style={thS}>Имя</th><th style={thS}>Username</th><th style={thS}>Роль</th></tr></thead>
            <tbody>{staff.map(s => (
              <tr key={s.id}><td style={tdS}>{s.first_name || '-'}</td><td style={tdS}>{s.username || '-'}</td><td style={tdS}>{s.role}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div style={{ borderBottom: '1px solid #ddd', marginBottom: 16, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {Object.entries(TAB_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setTab(key)} style={tabBtn(tab === key)}>{cfg.label}</button>
        ))}
      </div>

      {renderTabContent()}

      {editLink && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400 }}>
            <h3 style={{ margin: '0 0 16px' }}>Редактировать ссылку</h3>
            {['name', 'utm_source', 'utm_medium', 'utm_campaign'].map(field => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#666' }}>{field}</label>
                <input value={editLink[field] || ''} onChange={e => setEditLink({ ...editLink, [field]: e.target.value })}
                  style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
              <input type="checkbox" checked={!!editLink.is_paused} onChange={e => setEditLink({ ...editLink, is_paused: e.target.checked })} /> Пауза
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveLink} style={{ background: '#4361ee', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>Сохранить</button>
              <button onClick={() => setEditLink(null)} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 500, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Редактировать #{editItem.id}</h3>
              {editForm.message_text !== undefined && (
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#666' }}>
                  <input type="checkbox" checked={previewMode} onChange={e => setPreviewMode(e.target.checked)} />
                  Предпросмотр
                </label>
              )}
            </div>
            {Object.keys(editForm).map(field => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 2 }}>{field}</label>
                {field === 'message_text' ? (
                  previewMode ? (
                    <div
                      style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, minHeight: 100, fontSize: 14, lineHeight: 1.6, background: '#fafafa', whiteSpace: 'pre-wrap' }}
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
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', minHeight: 100 }}
                    />
                  )
                ) : field === 'status' ? (
                  <select
                    value={editForm[field] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
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
                    style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleSaveItem} style={{ background: '#4361ee', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>Сохранить</button>
              <button onClick={() => setEditItem(null)} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
