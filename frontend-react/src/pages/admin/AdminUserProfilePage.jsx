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
const btnPrimary = { background: '#4361ee', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };

export default function AdminUserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('channels');
  const [tabData, setTabData] = useState([]);
  const [extendModal, setExtendModal] = useState(null);
  const [extendMonths, setExtendMonths] = useState(1);

  useEffect(() => { adminApi.get(`/users/${userId}`).then(d => { if (d) setData(d); }).catch(() => {}); }, [userId]);

  useEffect(() => {
    const endpoints = {
      channels: `/users/${userId}/channels`, pins: `/users/${userId}/pins`,
      broadcasts: `/users/${userId}/broadcasts`, giveaways: `/users/${userId}/giveaways`,
      leadMagnets: `/users/${userId}/lead-magnets`, referrals: `/users/${userId}/referrals`,
    };
    adminApi.get(endpoints[tab]).then(d => {
      if (d) setTabData(d.channels || d.pins || d.broadcasts || d.giveaways || d.leadMagnets || d);
    }).catch(() => setTabData([]));
  }, [tab, userId]);

  if (!data) return <div>Загрузка...</div>;
  const { user } = data;

  const handleDelete = async (type, id) => {
    if (!confirm('Удалить?')) return;
    await adminApi.delete(`/users/${userId}/${type}/${id}`);
    setTabData(prev => prev.filter(x => x.id !== id));
  };

  const handleExtend = async () => {
    await adminApi.put(`/users/${userId}/extend-tariff`, { channel_id: extendModal, months: extendMonths });
    setExtendModal(null);
    adminApi.get(`/users/${userId}/channels`).then(d => setTabData(d.channels || []));
  };

  const tabs = [
    { key: 'channels', label: 'Каналы' }, { key: 'pins', label: 'Закрепы' },
    { key: 'leadMagnets', label: 'Лид-магниты' }, { key: 'broadcasts', label: 'Рассылки' },
    { key: 'giveaways', label: 'Розыгрыши' }, { key: 'referrals', label: 'Рефералы' },
  ];

  return (
    <div>
      <button onClick={() => navigate('/admin/users')} style={{ background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>
        &larr; К списку
      </button>
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>{user.first_name || user.username || `User #${user.id}`}</h3>
        <div style={{ fontSize: 13, color: '#666', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>ID: {user.id}</div>
          <div>Username: {user.username || '-'}</div>
          <div>Telegram ID: {user.telegram_id || '-'}</div>
          <div>MAX ID: {user.max_user_id || '-'}</div>
          <div>Email: {user.email || '-'}</div>
          <div>Дата: {user.created_at ? new Date(user.created_at).toLocaleDateString('ru') : '-'}</div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #ddd', marginBottom: 16, display: 'flex', gap: 4 }}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>)}
      </div>

      {tab === 'channels' && (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Название</th><th style={thS}>Платформа</th><th style={thS}>Статус</th><th style={thS}>Истекает</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(ch => (
            <tr key={ch.id}>
              <td style={tdS}>{ch.id}</td>
              <td style={{...tdS, cursor: 'pointer', color: '#4361ee'}} onClick={() => navigate(`/admin/channels/${ch.id}`)}>{ch.title || ch.username}</td>
              <td style={tdS}>{ch.platform}</td>
              <td style={tdS}><span style={{ color: ch.billing_status === 'active' ? '#2a9d8f' : '#e63946' }}>{ch.billing_status || 'нет'}</span></td>
              <td style={tdS}>{ch.billing_expires ? new Date(ch.billing_expires).toLocaleDateString('ru') : '-'}</td>
              <td style={tdS}><button style={btnPrimary} onClick={() => setExtendModal(ch.id)}>Продлить</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === 'pins' && (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Канал</th><th style={thS}>Заголовок</th><th style={thS}>Статус</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(p => (
            <tr key={p.id}>
              <td style={tdS}>{p.id}</td><td style={tdS}>{p.channel_title}</td><td style={tdS}>{p.title || '-'}</td><td style={tdS}>{p.status}</td>
              <td style={tdS}><button style={btnDanger} onClick={() => handleDelete('pins', p.id)}>Удалить</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === 'leadMagnets' && (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Канал</th><th style={thS}>Заголовок</th><th style={thS}>Код</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(lm => (
            <tr key={lm.id}>
              <td style={tdS}>{lm.id}</td><td style={tdS}>{lm.channel_title}</td><td style={tdS}>{lm.title || '-'}</td><td style={tdS}>{lm.code}</td>
              <td style={tdS}><button style={btnDanger} onClick={() => handleDelete('lead-magnets', lm.id)}>Удалить</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === 'broadcasts' && (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Канал</th><th style={thS}>Заголовок</th><th style={thS}>Статус</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(b => (
            <tr key={b.id}>
              <td style={tdS}>{b.id}</td><td style={tdS}>{b.channel_title}</td><td style={tdS}>{b.title || '-'}</td><td style={tdS}>{b.status || '-'}</td>
              <td style={tdS}><button style={btnDanger} onClick={() => handleDelete('broadcasts', b.id)}>Удалить</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === 'giveaways' && (
        <table style={tableStyle}>
          <thead><tr><th style={thS}>ID</th><th style={thS}>Канал</th><th style={thS}>Заголовок</th><th style={thS}>Статус</th><th style={thS}></th></tr></thead>
          <tbody>{tabData.map(g => (
            <tr key={g.id}>
              <td style={tdS}>{g.id}</td><td style={tdS}>{g.channel_title}</td><td style={tdS}>{g.title || g.message_text?.slice(0, 40) || '-'}</td><td style={tdS}>{g.status}</td>
              <td style={tdS}><button style={btnDanger} onClick={() => handleDelete('giveaways', g.id)}>Удалить</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {tab === 'referrals' && tabData && (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ padding: '12px 20px', background: '#f0fdf4', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{(tabData.balance || 0).toLocaleString('ru-RU')} ₽</div>
              <div style={{ fontSize: 12, color: '#888' }}>Баланс</div>
            </div>
            <div style={{ padding: '12px 20px', background: '#f0f9ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{tabData.signups?.length || 0}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Рефералов</div>
            </div>
          </div>
          {tabData.links?.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Ссылки</h4>
              <table style={tableStyle}>
                <thead><tr><th style={thS}>Код</th><th style={thS}>Название</th><th style={thS}>Дата</th></tr></thead>
                <tbody>{tabData.links.map(l => (
                  <tr key={l.id}><td style={tdS}>{l.code}</td><td style={tdS}>{l.name || '—'}</td><td style={tdS}>{l.created_at ? new Date(l.created_at).toLocaleDateString('ru') : '—'}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {tabData.signups?.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, margin: '16px 0 8px' }}>Приглашённые</h4>
              <table style={tableStyle}>
                <thead><tr><th style={thS}>Имя</th><th style={thS}>Username</th><th style={thS}>Дата</th></tr></thead>
                <tbody>{tabData.signups.map(s => (
                  <tr key={s.id}><td style={tdS}>{s.referred_name || '—'}</td><td style={tdS}>{s.referred_username || '—'}</td><td style={tdS}>{s.created_at ? new Date(s.created_at).toLocaleDateString('ru') : '—'}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {tabData.earnings?.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, margin: '16px 0 8px' }}>Начисления</h4>
              <table style={tableStyle}>
                <thead><tr><th style={thS}>Сумма</th><th style={thS}>Комиссия</th><th style={thS}>Дата</th></tr></thead>
                <tbody>{tabData.earnings.map(e => (
                  <tr key={e.id}><td style={tdS}>{e.amount} ₽</td><td style={{ ...tdS, color: '#22c55e', fontWeight: 600 }}>+{e.commission_amount} ₽ ({e.commission_percent}%)</td><td style={tdS}>{e.created_at ? new Date(e.created_at).toLocaleDateString('ru') : '—'}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {!tabData.links?.length && !tabData.signups?.length && (
            <div style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Нет реферальных данных</div>
          )}
        </div>
      )}

      {extendModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
            <h3 style={{ margin: '0 0 16px' }}>Продлить тариф</h3>
            <select value={extendMonths} onChange={e => setExtendMonths(Number(e.target.value))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', marginBottom: 16 }}>
              <option value={1}>1 месяц</option><option value={3}>3 месяца</option>
              <option value={6}>6 месяцев</option><option value={12}>12 месяцев</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleExtend} style={{ ...btnPrimary, padding: '8px 16px' }}>Продлить</button>
              <button onClick={() => setExtendModal(null)} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
