import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
  pageTitle, card, tableWrap, th, td, searchInput, btnPrimary,
  btnOutline, btnDanger, badge, emptyState, fmtDate,
} from './adminStyles';

const input = { ...searchInput, width: '100%', boxSizing: 'border-box' };

export default function AdminIntegrationsPage() {
  const [keys, setKeys] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [name, setName] = useState('Новая интеграция');
  const [days, setDays] = useState(90);
  const [modules, setModules] = useState(['*']);
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadKeys = useCallback(async (value = search) => {
    const result = await adminApi.get(`/integration/keys?search=${encodeURIComponent(value.trim())}`);
    setKeys(result?.keys || []);
  }, [search]);

  useEffect(() => {
    Promise.all([loadKeys(''), adminApi.get('/integration/catalog').then(setCatalog)])
      .catch(e => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      adminApi.get(`/users?page=1&limit=20&search=${encodeURIComponent(userSearch.trim())}`)
        .then(result => setUsers(result?.users || []))
        .catch(e => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const allowed = useMemo(() => catalog?.modules.filter(module =>
    module.operations.some(operation => operation.access === 'user')
      && !['integration', 'admin', 'auth'].includes(module.id)
  ) || [], [catalog]);

  async function createKey(event) {
    event.preventDefault();
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await adminApi.post('/integration/keys', {
        user_id: Number(ownerId), name, expires_in_days: Number(days), modules,
      });
      setSecret(result.key);
      await loadKeys('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function revokeKey(key) {
    if (!window.confirm(`Отозвать ключ «${key.name}»? Интеграция сразу перестанет работать.`)) return;
    setBusy(true); setError('');
    try { await adminApi.delete(`/integration/keys/${key.id}`); await loadKeys(search); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div>
    <h1 style={pageTitle}>API и интеграции</h1>
    <p style={{ fontSize: 12, color: '#888', margin: '5px 0 18px' }}>
      Ключи создаются только администраторами и действуют с правами выбранного пользователя.
    </p>

    <div style={{ ...card, marginBottom: 16 }}>
      <a href="/api/integration/docs" target="_blank" rel="noreferrer">Swagger — все методы</a>{' · '}
      <a href="/api/integration/openapi.json" target="_blank" rel="noreferrer">OpenAPI JSON</a>{' · '}
      <a href="/api/integration/postman.json">Postman</a>
      <p style={{ marginBottom: 0, fontSize: 12, color: '#6b7280' }}>
        Заголовок: <code>Authorization: Bearer mmk_…</code>. Секрет показывается один раз после создания.
      </p>
    </div>

    {error && <div role="alert" style={{ padding: 12, marginBottom: 16, borderRadius: 10, color: '#991b1b', background: '#fef2f2' }}>{error}</div>}

    <form onSubmit={createKey} style={{ ...card, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 14px' }}>Создать ключ</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(180px, 1fr) 120px', gap: 12 }}>
        <label style={{ fontSize: 12 }}>Пользователь
          <input style={input} placeholder="Поиск по PKid, имени или username" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          <select style={{ ...input, marginTop: 6 }} value={ownerId} onChange={e => setOwnerId(e.target.value)} required>
            <option value="">Выберите владельца</option>
            {users.map(user => <option key={user.id} value={user.id}>
              PKid {user.id} · {user.first_name || user.username || user.email || 'без имени'}{user.username ? ` (@${user.username})` : ''}
            </option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Название
          <input style={input} value={name} onChange={e => setName(e.target.value)} maxLength={120} required />
        </label>
        <label style={{ fontSize: 12 }}>Срок, дней
          <input style={input} type="number" value={days} onChange={e => setDays(e.target.value)} min={1} max={365} required />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 14, fontSize: 13 }}>
        <input type="checkbox" checked={modules.includes('*')} onChange={e => setModules(e.target.checked ? ['*'] : [])} /> Все пользовательские разделы, включая новые
      </label>
      {!modules.includes('*') && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {allowed.map(module => <label key={module.id} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <input type="checkbox" checked={modules.includes(module.id)} onChange={e => setModules(previous => e.target.checked ? [...previous, module.id] : previous.filter(item => item !== module.id))} /> {module.title}
        </label>)}
      </div>}
      <button style={{ ...btnPrimary, marginTop: 14 }} disabled={busy || !ownerId || !modules.length || !!secret}>Создать ключ</button>
    </form>

    {secret && <div role="status" style={{ ...card, marginBottom: 16, border: '1px solid #facc15' }}>
      <strong>Сохраните ключ сейчас — повторно он не показывается.</strong>
      <p><code style={{ overflowWrap: 'anywhere' }}>{secret}</code></p>
      <button style={btnOutline} onClick={async () => {
        try { await navigator.clipboard.writeText(secret); setCopied(true); }
        catch { setError('Не удалось скопировать. Сохраните ключ вручную.'); }
      }}>{copied ? 'Скопировано' : 'Скопировать'}</button>{' '}
      <button style={btnOutline} onClick={() => setSecret('')}>Скрыть</button>
    </div>}

    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input aria-label="Поиск ключей" style={{ ...searchInput, width: 360 }} placeholder="Ключ, владелец, email или PKid" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadKeys(search).catch(err => setError(err.message)); }} />
      <button style={btnOutline} onClick={() => loadKeys(search).catch(e => setError(e.message))}>Найти</button>
    </div>

    {keys === null ? <div style={emptyState}>Загрузка…</div> : <div style={{ ...tableWrap, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead><tr>
          <th style={th}>Ключ</th><th style={th}>Владелец</th><th style={th}>Разделы</th>
          <th style={th}>Создан / истекает</th><th style={th}>Последний запрос</th><th style={th}>Статус</th><th style={th}>Действия</th>
        </tr></thead>
        <tbody>
          {!keys.length && <tr><td colSpan={7} style={emptyState}>Ключи не найдены</td></tr>}
          {keys.map(key => {
            const active = !key.revoked_at && new Date(key.expires_at) > new Date();
            return <tr key={key.id}>
              <td style={td}><b>{key.name}</b><br /><code>{key.key_prefix}…</code></td>
              <td style={td}><b>PKid {key.user_id}</b><br /><span style={{ color: '#777' }}>{key.owner_name || key.owner_username || key.owner_email || '—'}</span></td>
              <td style={{ ...td, maxWidth: 220, overflowWrap: 'anywhere' }}>{key.modules.join(', ')}</td>
              <td style={{ ...td, fontSize: 12 }}>{fmtDate(key.created_at)}<br />до {fmtDate(key.expires_at)}</td>
              <td style={{ ...td, fontSize: 12 }}>{key.last_used_at ? fmtDate(key.last_used_at) : 'Не использовался'}</td>
              <td style={td}><span style={badge(active ? '#dcfce7' : '#f3f4f6', active ? '#166534' : '#6b7280')}>{key.revoked_at ? 'Отозван' : active ? 'Активен' : 'Истёк'}</span></td>
              <td style={td}>{active && <button style={btnDanger} disabled={busy} onClick={() => revokeKey(key)}>Отозвать</button>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
  </div>;
}
