import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, btnPrimary, btnOutline, btnDanger,
  badge, statCard, fmtDate, fmtMoney, emptyState, modalOverlay, modalBox,
} from './adminStyles';

const pillTab = (active) => ({
  padding: '8px 20px', borderRadius: 20, border: 'none',
  background: active ? '#4361ee' : '#f3f4f6',
  color: active ? '#fff' : '#888',
  fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
  transition: 'all 0.2s',
});

const linkStyle = { color: '#4361ee', cursor: 'pointer', fontWeight: 500 };

export default function AdminUserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('channels');
  const [tabData, setTabData] = useState([]);
  const [extendModal, setExtendModal] = useState(null);
  const [extendDays, setExtendDays] = useState(30);
  const [extendReason, setExtendReason] = useState('');
  const [tokensDelta, setTokensDelta] = useState('');
  const [tokensReason, setTokensReason] = useState('');

  useEffect(() => { adminApi.get(`/users/${userId}`).then(d => { if (d) setData(d); }).catch(() => {}); }, [userId]);

  useEffect(() => {
    const endpoints = {
      channels: `/users/${userId}/channels`, pins: `/users/${userId}/pins`,
      broadcasts: `/users/${userId}/broadcasts`, giveaways: `/users/${userId}/giveaways`,
      leadMagnets: `/users/${userId}/lead-magnets`, referrals: `/users/${userId}/referrals`,
      history: `/users/${userId}/balance-history`,
    };
    adminApi.get(endpoints[tab]).then(d => {
      if (d) setTabData(d.channels || d.pins || d.broadcasts || d.giveaways || d.leadMagnets || d.items || d);
    }).catch(() => setTabData([]));
  }, [tab, userId]);

  if (!data) return <div style={emptyState}>Загрузка...</div>;
  const { user } = data;

  const handleDelete = async (type, id) => {
    if (!confirm('Удалить?')) return;
    await adminApi.delete(`/users/${userId}/${type}/${id}`);
    setTabData(prev => prev.filter(x => x.id !== id));
  };

  const handleExtend = async () => {
    const days = parseInt(extendDays, 10);
    if (!days) { alert('Укажите дни (можно отрицательное число для уменьшения)'); return; }
    try {
      await adminApi.put(`/users/${userId}/extend-tariff`, {
        channel_id: extendModal, days, reason: extendReason,
      });
      setExtendModal(null);
      setExtendReason('');
      adminApi.get(`/users/${userId}/channels`).then(d => setTabData(d.channels || []));
    } catch (e) {
      alert(e?.message || 'Ошибка');
    }
  };

  const handleAdjustTokens = async () => {
    const val = parseInt(tokensDelta, 10);
    if (!val) { alert('Укажите ненулевое значение'); return; }
    try {
      const res = await adminApi.post(`/users/${userId}/add-tokens`, {
        tokens: val, reason: tokensReason,
      });
      setData(prev => ({ ...prev, user: { ...prev.user, ai_tokens: res.after } }));
      setTokensDelta('');
      setTokensReason('');
    } catch (e) {
      alert(e?.message || 'Ошибка');
    }
  };

  const tabs = [
    { key: 'channels', label: 'Каналы' }, { key: 'pins', label: 'Закрепы' },
    { key: 'leadMagnets', label: 'Лид-магниты' }, { key: 'broadcasts', label: 'Рассылки' },
    { key: 'giveaways', label: 'Розыгрыши' }, { key: 'referrals', label: 'Рефералы' },
    { key: 'history', label: '📋 История' },
  ];

  const statusColor = (s) => s === 'active' ? '#22c55e' : '#ef4444';

  return (
    <div>
      {/* Back button */}
      <button onClick={() => navigate('/admin/users')} style={{ ...btnOutline, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        &larr; К списку пользователей
      </button>

      {/* Page title */}
      <h1 style={{ ...pageTitle, marginBottom: 20 }}>{user.first_name || user.username || `User #${user.id}`}</h1>

      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={statCard('#4361ee')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Telegram ID</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{user.telegram_id || '—'}</div>
        </div>
        <div style={statCard('#22c55e')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>AI Токены</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{(user.ai_tokens || 0).toLocaleString('ru-RU')}</div>
        </div>
        <div style={statCard('#f59e0b')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>MAX ID</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{user.max_user_id || '—'}</div>
        </div>
        <div style={statCard('#8b5cf6')}>
          <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Регистрация</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 4 }}>{fmtDate(user.created_at)}</div>
        </div>
      </div>

      {/* User info card */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13 }}>
          <div><span style={{ color: '#999', fontWeight: 500 }}>ID:</span> <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{user.id}</span></div>
          <div><span style={{ color: '#999', fontWeight: 500 }}>Username:</span> <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{user.username || '—'}</span></div>
          <div><span style={{ color: '#999', fontWeight: 500 }}>Telegram ID:</span> <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{user.telegram_id || '—'}</span></div>
          <div><span style={{ color: '#999', fontWeight: 500 }}>MAX ID:</span> <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{user.max_user_id || '—'}</span></div>
          <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#999', fontWeight: 500 }}>Email:</span> <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{user.email || '—'}</span></div>
        </div>

        {/* AI Tokens adjust (положительное и отрицательное) */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 700, marginBottom: 8 }}>
            Изменить ИИ-токены (можно отрицательное число для списания):
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="number"
              value={tokensDelta}
              onChange={e => setTokensDelta(e.target.value)}
              placeholder="±1000"
              style={{ width: 110, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none' }}
            />
            <input
              type="text"
              value={tokensReason}
              onChange={e => setTokensReason(e.target.value)}
              placeholder="Причина (для лога)"
              style={{ flex: 1, minWidth: 200, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none' }}
            />
            <button style={btnPrimary} onClick={handleAdjustTokens}>Применить</button>
          </div>
        </div>
      </div>

      {/* Pill tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={pillTab(tab === t.key)}>{t.label}</button>)}
      </div>

      {/* Tab content */}
      {tab === 'channels' && (
        tabData.length === 0 ? <div style={emptyState}>Нет каналов</div> : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>ID</th><th style={th}>Название</th><th style={th}>Платформа</th>
              <th style={th}>Статус</th><th style={th}>Истекает</th><th style={th}></th>
            </tr></thead>
            <tbody>{tabData.map(ch => (
              <tr key={ch.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={td}>{ch.id}</td>
                <td style={{ ...td, ...linkStyle }} onClick={() => navigate(`/admin/channels/${ch.id}`)}>{ch.title || ch.username}</td>
                <td style={td}><span style={badge('#ede9fe', '#7c3aed')}>{ch.platform}</span></td>
                <td style={td}><span style={badge(ch.billing_status === 'active' ? '#dcfce7' : '#fef2f2', ch.billing_status === 'active' ? '#166534' : '#991b1b')}>{ch.billing_status || 'нет'}</span></td>
                <td style={td}>{fmtDate(ch.billing_expires)}</td>
                <td style={td}><button style={btnPrimary} onClick={() => setExtendModal(ch.id)}>Продлить</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>)
      )}

      {tab === 'pins' && (
        tabData.length === 0 ? <div style={emptyState}>Нет закрепов</div> : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>ID</th><th style={th}>Канал</th><th style={th}>Заголовок</th><th style={th}>Статус</th><th style={th}></th></tr></thead>
            <tbody>{tabData.map(p => (
              <tr key={p.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={td}>{p.id}</td><td style={td}>{p.channel_title}</td><td style={td}>{p.title || '—'}</td>
                <td style={td}><span style={badge('#f3f4f6', '#6b7280')}>{p.status}</span></td>
                <td style={td}><button style={btnDanger} onClick={() => handleDelete('pins', p.id)}>Удалить</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>)
      )}

      {tab === 'leadMagnets' && (
        tabData.length === 0 ? <div style={emptyState}>Нет лид-магнитов</div> : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>ID</th><th style={th}>Канал</th><th style={th}>Заголовок</th><th style={th}>Код</th><th style={th}></th></tr></thead>
            <tbody>{tabData.map(lm => (
              <tr key={lm.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={td}>{lm.id}</td><td style={td}>{lm.channel_title}</td><td style={td}>{lm.title || '—'}</td>
                <td style={td}><code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{lm.code}</code></td>
                <td style={td}><button style={btnDanger} onClick={() => handleDelete('lead-magnets', lm.id)}>Удалить</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>)
      )}

      {tab === 'broadcasts' && (
        tabData.length === 0 ? <div style={emptyState}>Нет рассылок</div> : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>ID</th><th style={th}>Канал</th><th style={th}>Заголовок</th><th style={th}>Статус</th><th style={th}></th></tr></thead>
            <tbody>{tabData.map(b => (
              <tr key={b.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={td}>{b.id}</td><td style={td}>{b.channel_title}</td><td style={td}>{b.title || '—'}</td>
                <td style={td}><span style={badge('#f3f4f6', '#6b7280')}>{b.status || '—'}</span></td>
                <td style={td}><button style={btnDanger} onClick={() => handleDelete('broadcasts', b.id)}>Удалить</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>)
      )}

      {tab === 'giveaways' && (
        tabData.length === 0 ? <div style={emptyState}>Нет розыгрышей</div> : (
        <div style={tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>ID</th><th style={th}>Канал</th><th style={th}>Заголовок</th><th style={th}>Статус</th><th style={th}></th></tr></thead>
            <tbody>{tabData.map(g => (
              <tr key={g.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={td}>{g.id}</td><td style={td}>{g.channel_title}</td><td style={td}>{g.title || g.message_text?.slice(0, 40) || '—'}</td>
                <td style={td}><span style={badge('#f3f4f6', '#6b7280')}>{g.status}</span></td>
                <td style={td}><button style={btnDanger} onClick={() => handleDelete('giveaways', g.id)}>Удалить</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>)
      )}

      {tab === 'referrals' && tabData && (
        <div>
          {/* Referral stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={statCard('#22c55e')}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Баланс</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{fmtMoney(tabData.balance)}</div>
            </div>
            <div style={statCard('#3b82f6')}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Рефералов</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{tabData.signups?.length || 0}</div>
            </div>
          </div>

          {/* Referral links */}
          {tabData.links?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>Ссылки</h4>
              <div style={tableWrap}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Код</th><th style={th}>Название</th><th style={th}>Дата</th></tr></thead>
                  <tbody>{tabData.links.map(l => (
                    <tr key={l.id}>
                      <td style={td}><code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{l.code}</code></td>
                      <td style={td}>{l.name || '—'}</td>
                      <td style={td}>{fmtDate(l.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Referral signups */}
          {tabData.signups?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>Приглашённые</h4>
              <div style={tableWrap}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Имя</th><th style={th}>Username</th><th style={th}>Дата</th></tr></thead>
                  <tbody>{tabData.signups.map(s => (
                    <tr key={s.id}>
                      <td style={td}>{s.referred_name || '—'}</td>
                      <td style={td}>{s.referred_username || '—'}</td>
                      <td style={td}>{fmtDate(s.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Referral earnings */}
          {tabData.earnings?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>Начисления</h4>
              <div style={tableWrap}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Сумма</th><th style={th}>Комиссия</th><th style={th}>Дата</th></tr></thead>
                  <tbody>{tabData.earnings.map(e => (
                    <tr key={e.id}>
                      <td style={td}>{fmtMoney(e.amount)}</td>
                      <td style={{ ...td, color: '#22c55e', fontWeight: 600 }}>+{fmtMoney(e.commission_amount)} ({e.commission_percent}%)</td>
                      <td style={td}>{fmtDate(e.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {!tabData.links?.length && !tabData.signups?.length && (
            <div style={emptyState}>Нет реферальных данных</div>
          )}
        </div>
      )}

      {/* History tab — объединённая история токенов / платежей / админ-операций */}
      {tab === 'history' && (
        Array.isArray(tabData) && tabData.length === 0
          ? <div style={emptyState}>История пуста</div>
          : (
            <div style={tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Когда</th>
                  <th style={th}>Тип</th>
                  <th style={th}>Изменение</th>
                  <th style={th}>Описание</th>
                </tr></thead>
                <tbody>{(Array.isArray(tabData) ? tabData : []).map(it => {
                  const kindBadge = it.kind === 'tokens'
                    ? badge('#ede9fe', '#7c3aed')
                    : it.kind === 'payment'
                      ? badge('#dcfce7', '#166534')
                      : badge('#fee2e2', '#991b1b');
                  const kindLabel = it.kind === 'tokens' ? 'Токены' : it.kind === 'payment' ? 'Платёж' : 'Админ';
                  let deltaCell = '—';
                  if (it.kind === 'tokens') {
                    const v = it.delta;
                    const color = v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#6b7280';
                    deltaCell = <span style={{ color, fontWeight: 700 }}>{v > 0 ? '+' : ''}{v} ИИт</span>;
                  } else if (it.kind === 'payment') {
                    deltaCell = <span style={{ fontWeight: 700, color: it.status === 'paid' ? '#16a34a' : '#6b7280' }}>{it.amount.toLocaleString('ru-RU')} ₽</span>;
                  } else if (it.kind === 'admin') {
                    const dl = it.payload?.delta || it.payload?.delta_days;
                    if (dl !== undefined) deltaCell = <span style={{ fontWeight: 700, color: dl >= 0 ? '#16a34a' : '#dc2626' }}>{dl >= 0 ? '+' : ''}{dl}</span>;
                  }
                  return (
                    <tr key={it.id}>
                      <td style={td}><span style={{ whiteSpace: 'nowrap' }}>{fmtDate(it.created_at)}</span></td>
                      <td style={td}><span style={kindBadge}>{kindLabel}</span></td>
                      <td style={td}>{deltaCell}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 500, color: '#1a1a2e' }}>{it.label}</div>
                        {(it.description || it.reason) && (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{it.description || it.reason}</div>
                        )}
                        {it.kind === 'admin' && it.admin && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>by {it.admin}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )
      )}

      {/* Extend tariff modal — теперь поддерживает дни (положительные и отрицательные) */}
      {extendModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Изменить срок подписки</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
              Положительное значение — продлить, отрицательное — сократить.
              Например: <b>30</b> = +1 месяц, <b>-7</b> = убрать неделю.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[7, 30, 90, 180, 365].map(d => (
                <button key={d} type="button"
                  onClick={() => setExtendDays(d)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: extendDays === d ? '2px solid #4361ee' : '1px solid #e5e7eb',
                    background: extendDays === d ? '#eef2ff' : '#fff', cursor: 'pointer',
                  }}>+{d}</button>
              ))}
            </div>
            <input
              type="number"
              value={extendDays}
              onChange={e => setExtendDays(e.target.value)}
              placeholder="Дней (±)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, marginBottom: 12, outline: 'none', boxSizing: 'border-box' }}
            />
            <input
              type="text"
              value={extendReason}
              onChange={e => setExtendReason(e.target.value)}
              placeholder="Причина (для лога)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, marginBottom: 20, outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setExtendModal(null)} style={btnOutline}>Отмена</button>
              <button onClick={handleExtend} style={btnPrimary}>
                {parseInt(extendDays, 10) >= 0 ? 'Продлить' : 'Сократить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
