import { useEffect, useState } from 'react';
import { api } from '../services/api';

const card = { background: 'var(--bg-card, white)', padding: 20, borderRadius: 14, border: '1px solid #e5e7eb', marginBottom: 20 };
const input = { padding: 10, border: '1px solid #d1d5db', borderRadius: 8, maxWidth: '100%' };

export default function IntegrationsPage() {
  const [keys, setKeys] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [name, setName] = useState('Моя интеграция');
  const [days, setDays] = useState(90);
  const [modules, setModules] = useState(['*']);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const reload = async () => setKeys((await api.get('/integration/keys')).keys);
  useEffect(() => {
    Promise.all([reload(), api.get('/integration/catalog').then(setCatalog)])
      .catch(e => setError(e.message));
  }, []);
  async function create(e) {
    e.preventDefault(); setBusy(true); setError(''); setCopied(false);
    try {
      const result = await api.post('/integration/keys', { name, expires_in_days: Number(days), modules });
      setSecret(result.key);
      await reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function revoke(key) {
    if (!window.confirm(`Отозвать ключ «${key.name}»? Интеграция перестанет работать.`)) return;
    setBusy(true); setError('');
    try { await api.delete(`/integration/keys/${key.id}`); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const allowed = catalog?.modules.filter(m => m.operations.some(o => o.access === 'user') && !['integration', 'admin', 'auth'].includes(m.id)) || [];
  return <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
    <h1>API и интеграции</h1>
    <p>Управление функциями сервиса из вашей программы. Ключ действует с правами вашего аккаунта и сотрудников; доступ к чужим каналам не добавляется.</p>
    <div style={card}>
      <a href="/api/integration/docs" target="_blank" rel="noreferrer">Открыть Swagger — все методы</a>{' · '}
      <a href="/api/integration/openapi.json" target="_blank" rel="noreferrer">OpenAPI JSON</a>{' · '}
      <a href="/api/integration/postman.json">Скачать Postman</a>
      <p>Заголовок: <code>Authorization: Bearer mmk_…</code>. Храните ключ только на сервере своей интеграции.</p>
      <p>Публикации и рассылки отправляют реальные сообщения, ИИ расходует токены по тарифу. Автоматический повтор POST может дублировать действие. Админские методы требуют отдельный admin JWT.</p>
    </div>
    {error && <p role="alert" style={{ color: '#dc2626' }}>{error}</p>}
    <form onSubmit={create} style={card}>
      <h2>Создать API-ключ</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>Название<br /><input style={input} value={name} onChange={e => setName(e.target.value)} maxLength={120} required /></label>
        <label>Срок, дней<br /><input style={input} type="number" value={days} onChange={e => setDays(e.target.value)} min={1} max={365} required /></label>
      </div>
      <p><label><input type="checkbox" checked={modules.includes('*')} onChange={e => setModules(e.target.checked ? ['*'] : [])} /> Все доступные разделы (включая новые)</label></p>
      {!modules.includes('*') && <fieldset style={{ ...input, display: 'flex', gap: 12, flexWrap: 'wrap' }}><legend>Разделы</legend>
        {allowed.map(m => <label key={m.id}><input type="checkbox" checked={modules.includes(m.id)} onChange={e => setModules(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} /> {m.title}</label>)}
      </fieldset>}
      <button style={{ ...input, marginTop: 12 }} disabled={busy || !modules.length || !!secret}>Создать ключ</button>
    </form>
    {secret && <div role="status" style={{ ...card, borderColor: '#eab308' }}>
      <strong>Сохраните ключ сейчас. Повторно показать его нельзя.</strong>
      <p><code style={{ overflowWrap: 'anywhere' }}>{secret}</code></p>
      <button style={input} onClick={async () => {
        try { await navigator.clipboard.writeText(secret); setCopied(true); }
        catch { setError('Не удалось скопировать. Выделите и сохраните ключ вручную.'); }
      }}>{copied ? 'Скопировано' : 'Скопировать'}</button>{' '}
      <button style={input} onClick={() => setSecret('')}>Сохранил — скрыть</button>
    </div>}
    <section style={card}><h2>Ключи</h2>
      {!keys.length && <p>Ключей пока нет.</p>}
      {keys.map(k => {
        const active = !k.revoked_at && new Date(k.expires_at) > new Date();
        return <div key={k.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1 }}><strong>{k.name}</strong> <code>{k.key_prefix}…</code><br />
            <small>{k.revoked_at ? 'Отозван' : active ? 'Активен' : 'Истёк'} · до {new Date(k.expires_at).toLocaleDateString()} · {k.modules.join(', ')}<br />
              Последнее использование: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'ещё не использовался'}</small></div>
          {active && <button style={input} disabled={busy} onClick={() => revoke(k)}>Отозвать</button>}
        </div>;
      })}
    </section>
    <section style={card}><h2>Список API {catalog && `— ${catalog.total} методов`}</h2>
      <input style={{ ...input, width: '100%' }} aria-label="Поиск метода" placeholder="Раздел, путь или действие" value={search} onChange={e => setSearch(e.target.value)} />
      <p>У legacy-методов подсказки полей извлечены из кода: вложенные структуры и условная обязательность не всегда описаны типами.</p>
      {catalog?.modules.map(m => {
        const ops = m.operations.filter(o => `${m.title} ${o.path} ${o.summary}`.toLowerCase().includes(search.toLowerCase()));
        return ops.length ? <details key={m.id} style={{ marginTop: 14 }}>
          <summary>{m.title} — {ops.length}</summary>
          <p><a href={m.openapi_url} target="_blank" rel="noreferrer">Отдельная спецификация {m.id}</a></p>
          {ops.map(o => <div key={`${o.method}:${o.path}`} style={{ margin: '10px 0', overflowWrap: 'anywhere' }}>
            <code>{o.method} {o.path}</code><br /><small>{o.summary} · доступ: {o.access}</small>
          </div>)}
        </details> : null;
      })}
    </section>
  </div>;
}
