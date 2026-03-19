import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';

const cardStyle = { background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const tabBtn = (active) => ({
  padding: '8px 16px', border: 'none', borderBottom: active ? '2px solid #4361ee' : '2px solid transparent',
  background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 13, color: active ? '#4361ee' : '#666',
});
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thS = { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' };
const tdS = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5' };
const btnDanger = { background: '#e63946', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
const btnEdit = { background: '#f4a261', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 };

export default function AdminChannelProfilePage() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('pins');
  const [tabData, setTabData] = useState([]);
  const [editLink, setEditLink] = useState(null);

  useEffect(() => { adminApi.get(`/channels/${channelId}`).then(d => { if (d) setData(d); }).catch(() => {}); }, [channelId]);

  useEffect(() => {
    const map = { pins: 'pins', leadMagnets: 'lead-magnets', content: 'content', giveaways: 'giveaways', links: 'links' };
    adminApi.get(`/channels/${channelId}/${map[tab]}`).then(d => {
      if (d) setTabData(d.pins || d.leadMagnets || d.posts || d.giveaways || d.links || []);
    }).catch(() => setTabData([]));
  }, [tab, channelId]);

  if (!data) return <div>Загрузка...</div>;
  const { channel, staff } = data;

  const handleDeleteLink = async (linkId) => {
    if (!confirm('Удалить ссылку?')) return;
    await adminApi.delete(`/channels/${channelId}/links/${linkId}`);
    setTabData(prev => prev.filter(x => x.id !== linkId));
  };

  const handleSaveLink = async () => {
    await adminApi.put(`/channels/${channelId}/links/${editLink.id}`, editLink);
    setEditLink(null);
    adminApi.get(`/channels/${channelId}/links`).then(d => setTabData(d.links || []));
  };

  const tabs = [
    { key: 'pins', label: 'Закрепы' }, { key: 'leadMagnets', label: 'Лид-магниты' },
    { key: 'content', label: 'Посты' }, { key: 'giveaways', label: 'Розыгрыши' }, { key: 'links', label: 'Ссылки' },
  ];

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

      <div style={{ borderBottom: '1px solid #ddd', marginBottom: 16, display: 'flex', gap: 4 }}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>)}
      </div>

      {tab === 'links' ? (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Название</th><th style={thS}>Код</th><th style={thS}>UTM Source</th><th style={thS}>Клики</th><th style={thS}>Пауза</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(l => (
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
      ) : (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Заголовок</th><th style={thS}>Статус</th><th style={thS}>Дата</th></tr></thead>
          <tbody>{tabData.map(item => (
            <tr key={item.id}>
              <td style={tdS}>{item.id}</td>
              <td style={tdS}>{item.title || item.name || item.message_text?.slice(0, 50) || '-'}</td>
              <td style={tdS}>{item.status || '-'}</td>
              <td style={tdS}>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru') : '-'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

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
    </div>
  );
}
