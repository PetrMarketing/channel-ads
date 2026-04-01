import { useState, useEffect, useCallback } from 'react';
import Paywall from '../components/Paywall';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import Modal from '../components/Modal';

const TABS = [
  { key: 'settings', label: 'Настройки' },
  { key: 'persons', label: 'Контрагенты' },
  { key: 'contracts', label: 'Договоры' },
  { key: 'creatives', label: 'Креативы (ERID)' },
  { key: 'stats', label: 'Статистика' },
];

const btnSmall = { padding: '4px 10px', fontSize: '0.8rem' };

export default function OrdPage() {
  const { currentChannel } = useChannels();
  const { showToast } = useToast();
  const tc = currentChannel?.tracking_code;
  const [tab, setTab] = useState('settings');
  const [loading, setLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState(null);
  const [tokenInput, setTokenInput] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Persons
  const [persons, setPersons] = useState([]);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState({ external_id: '', name: '', inn: '', role: 'advertiser', person_type: 'juridical' });

  // Contracts
  const [contracts, setContracts] = useState([]);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({ external_id: '', client_external_id: '', contractor_external_id: '', date: '', serial: '', amount: '', subject_type: 'distribution' });

  // Creatives
  const [creatives, setCreatives] = useState([]);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [creativeForm, setCreativeForm] = useState({ external_id: '', contract_external_id: '', person_external_id: '', form: 'text_block', texts: '', brand: '', target_urls: '', kktus: '1.1.1', name: '', self_promo: false });

  // Stats
  const [markedPosts, setMarkedPosts] = useState([]);
  const [statsForm, setStatsForm] = useState({ creative_external_id: '', pad_external_id: '', date_start: '', date_end: '', shows_count: '' });

  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/settings`);
      if (data.settings) {
        setSettings(data.settings);
        setTokenInput(data.settings.api_token || '');
        setSandbox(data.settings.sandbox || false);
      }
    } catch {}
  }, [tc]);

  const loadPersons = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/persons`);
      setPersons(data.persons || []);
    } catch {}
  }, [tc]);

  const loadContracts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/contracts`);
      setContracts(data.contracts || []);
    } catch {}
  }, [tc]);

  const loadCreatives = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/creatives`);
      setCreatives(data.creatives || []);
    } catch {}
  }, [tc]);

  const loadMarkedPosts = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/ord/${tc}/marked-posts`);
      setMarkedPosts(data.posts || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === 'persons') loadPersons(); }, [tab, loadPersons]);
  useEffect(() => { if (tab === 'contracts') loadContracts(); }, [tab, loadContracts]);
  useEffect(() => { if (tab === 'creatives') loadCreatives(); }, [tab, loadCreatives]);
  useEffect(() => { if (tab === 'stats') { loadMarkedPosts(); loadCreatives(); } }, [tab, loadMarkedPosts, loadCreatives]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const data = await api.post(`/ord/${tc}/settings`, { api_token: tokenInput, sandbox });
      if (data.success) {
        showToast('API-токен сохранён и проверен');
        loadSettings();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const savePerson = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/persons`, personForm);
      if (data.success) {
        showToast('Контрагент создан в ORD');
        setShowPersonModal(false);
        loadPersons();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveContract = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/contracts`, contractForm);
      if (data.success) {
        showToast('Договор создан в ORD');
        setShowContractModal(false);
        loadContracts();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCreative = async () => {
    setSaving(true);
    try {
      const texts = creativeForm.texts.split('\n').filter(t => t.trim());
      const target_urls = creativeForm.target_urls.split('\n').filter(u => u.trim());
      const kktus = creativeForm.kktus.split(',').map(k => k.trim()).filter(Boolean);
      const payload = {
        external_id: creativeForm.external_id,
        form: creativeForm.form,
        texts,
        target_urls,
        kktus,
        brand: creativeForm.brand,
        name: creativeForm.name,
        pay_type: 'other',
      };
      if (creativeForm.self_promo) {
        payload.person_external_id = creativeForm.person_external_id;
      } else {
        payload.contract_external_id = creativeForm.contract_external_id;
      }
      const data = await api.post(`/ord/${tc}/creatives`, payload);
      if (data.success) {
        showToast(`ERID получен: ${data.erid}`);
        setShowCreativeModal(false);
        loadCreatives();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendStats = async () => {
    setSaving(true);
    try {
      const data = await api.post(`/ord/${tc}/statistics`, {
        items: [{
          creative_external_id: statsForm.creative_external_id,
          pad_external_id: statsForm.pad_external_id,
          date_start_actual: statsForm.date_start,
          date_end_actual: statsForm.date_end,
          shows_count: parseInt(statsForm.shows_count) || 0,
        }],
      });
      if (data.success) {
        showToast('Статистика отправлена в ORD');
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paywall>
      <div>
        <h2 style={{ marginBottom: '16px' }}>Отчёты о рекламе (ORD)</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>
          Маркировка рекламы через VK ORD. Получение ERID-токенов, регистрация креативов и отправка статистики.
        </p>

        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={tab === t.key ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ borderRadius: '8px 8px 0 0', ...btnSmall }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Settings Tab */}
        {tab === 'settings' && (
          <div style={{ maxWidth: 500 }}>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">API-токен VK ORD</label>
              <input className="form-input" type="password" value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Вставьте токен из ord.vk.com" />
              <div className="form-hint">Получите токен в личном кабинете ord.vk.com → API</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.88rem' }}>
              <input type="checkbox" checked={sandbox} onChange={e => setSandbox(e.target.checked)} />
              Песочница (тестовый режим)
            </label>
            <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings || !tokenInput.trim()}>
              {savingSettings ? 'Проверка...' : 'Сохранить и проверить'}
            </button>
            {settings && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(42,157,143,0.1)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--success)' }}>
                API подключён {settings.sandbox ? '(песочница)' : '(продакшен)'}
              </div>
            )}
          </div>
        )}

        {/* Persons Tab */}
        {tab === 'persons' && (
          <div>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => {
              setPersonForm({ external_id: '', name: '', inn: '', role: 'advertiser', person_type: 'juridical' });
              setShowPersonModal(true);
            }}>+ Добавить контрагента</button>
            {persons.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
                Нет контрагентов. Добавьте рекламодателя и площадку (издателя).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {persons.map(p => (
                  <div key={p.id} style={{ padding: 14, background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{p.name}</strong>
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, background: p.role === 'advertiser' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)', color: p.role === 'advertiser' ? '#3b82f6' : '#8b5cf6' }}>
                          {p.role === 'advertiser' ? 'Рекламодатель' : p.role === 'publisher' ? 'Площадка' : p.role}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ИНН: {p.inn}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>ID: {p.external_id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contracts Tab */}
        {tab === 'contracts' && (
          <div>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => {
              setContractForm({ external_id: '', client_external_id: '', contractor_external_id: '', date: '', serial: '', amount: '', subject_type: 'distribution' });
              setShowContractModal(true);
            }}>+ Создать договор</button>
            {contracts.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>Нет договоров.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contracts.map(c => (
                  <div key={c.id} style={{ padding: 14, background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <strong>{c.serial || c.external_id}</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      {c.client_external_id} → {c.contractor_external_id} | {c.date} {c.amount && `| ${c.amount} ₽`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Creatives Tab */}
        {tab === 'creatives' && (
          <div>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => {
              setCreativeForm({ external_id: '', contract_external_id: '', person_external_id: '', form: 'text_block', texts: '', brand: '', target_urls: '', kktus: '1.1.1', name: '', self_promo: false });
              setShowCreativeModal(true);
            }}>+ Получить ERID</button>
            {creatives.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>Нет креативов. Создайте креатив для получения ERID-токена.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {creatives.map(c => (
                  <div key={c.id} style={{ padding: 14, background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <strong>{c.external_id}</strong>
                        {c.brand && <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{c.brand}</span>}
                      </div>
                      {c.erid && (
                        <code style={{ padding: '4px 10px', background: 'rgba(42,157,143,0.1)', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: 'var(--success)' }}
                          onClick={() => { navigator.clipboard.writeText(c.erid); showToast('ERID скопирован'); }}
                          title="Нажмите, чтобы скопировать">
                          ERID: {c.erid}
                        </code>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Формат: {c.form} | Договор: {c.contract_external_id || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Statistics Tab */}
        {tab === 'stats' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
              Промаркированные посты. Отправляйте статистику показов ежемесячно до 30 числа следующего месяца.
            </p>

            {/* Marked posts table */}
            {markedPosts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {markedPosts.map((p, i) => (
                  <div key={i} style={{ padding: 14, background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{p.title || 'Без названия'}</span>
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, background: p.post_type === 'content' ? 'rgba(59,130,246,0.15)' : p.post_type === 'giveaway' ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)', color: p.post_type === 'content' ? '#3b82f6' : p.post_type === 'giveaway' ? '#ef4444' : '#8b5cf6' }}>
                          {p.post_type === 'content' ? 'Публикация' : p.post_type === 'giveaway' ? 'Розыгрыш' : 'Закреп'}
                        </span>
                      </div>
                      <code style={{ padding: '2px 8px', background: 'rgba(42,157,143,0.1)', borderRadius: 4, fontSize: '0.82rem', color: 'var(--success)', cursor: 'pointer' }}
                        onClick={() => { navigator.clipboard.writeText(p.erid); showToast('ERID скопирован'); }}>
                        {p.erid}
                      </code>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span>Просмотры: <b>{p.views_count || 0}</b></span>
                      <span>Статус: {p.status}</span>
                      {p.published_at && <span>Опубликован: {new Date(p.published_at).toLocaleDateString('ru')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Нет промаркированных постов. Добавьте ERID при создании публикации или розыгрыша.
              </div>
            )}

            {/* Manual stats form */}
            <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Отправить статистику вручную</h3>
            <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">ID креатива</label>
                <select className="form-input" value={statsForm.creative_external_id}
                  onChange={e => setStatsForm(f => ({ ...f, creative_external_id: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {creatives.map(c => <option key={c.external_id} value={c.external_id}>{c.external_id} {c.erid ? `(${c.erid})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ID площадки</label>
                <input className="form-input" value={statsForm.pad_external_id}
                  onChange={e => setStatsForm(f => ({ ...f, pad_external_id: e.target.value }))}
                  placeholder="pad-telegram-channel" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Начало периода</label>
                  <input className="form-input" type="date" value={statsForm.date_start}
                    onChange={e => setStatsForm(f => ({ ...f, date_start: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Конец периода</label>
                  <input className="form-input" type="date" value={statsForm.date_end}
                    onChange={e => setStatsForm(f => ({ ...f, date_end: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">Количество показов</label>
                <input className="form-input" type="number" value={statsForm.shows_count}
                  onChange={e => setStatsForm(f => ({ ...f, shows_count: e.target.value }))}
                  placeholder="15000" />
              </div>
              <button className="btn btn-primary" onClick={sendStats} disabled={saving}>
                {saving ? 'Отправка...' : 'Отправить статистику в ORD'}
              </button>
            </div>
          </div>
        )}

        {/* Person Modal */}
        <Modal isOpen={showPersonModal} onClose={() => setShowPersonModal(false)} title="Добавить контрагента">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">ID (ваш уникальный идентификатор)</label>
              <input className="form-input" value={personForm.external_id}
                onChange={e => setPersonForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="advertiser-roga-kopyta" />
            </div>
            <div>
              <label className="form-label">Название организации</label>
              <input className="form-input" value={personForm.name}
                onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ООО Рога и Копыта" />
            </div>
            <div>
              <label className="form-label">ИНН</label>
              <input className="form-input" value={personForm.inn}
                onChange={e => setPersonForm(f => ({ ...f, inn: e.target.value }))}
                placeholder="7707049388" />
            </div>
            <div>
              <label className="form-label">Роль</label>
              <select className="form-input" value={personForm.role}
                onChange={e => setPersonForm(f => ({ ...f, role: e.target.value }))}>
                <option value="advertiser">Рекламодатель</option>
                <option value="publisher">Площадка (издатель)</option>
                <option value="agency">Агентство</option>
              </select>
            </div>
            <div>
              <label className="form-label">Тип</label>
              <select className="form-input" value={personForm.person_type}
                onChange={e => setPersonForm(f => ({ ...f, person_type: e.target.value }))}>
                <option value="juridical">Юридическое лицо</option>
                <option value="ip">ИП</option>
                <option value="physical">Физическое лицо</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowPersonModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={savePerson} disabled={saving}>
                {saving ? 'Создание...' : 'Создать в ORD'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Contract Modal */}
        <Modal isOpen={showContractModal} onClose={() => setShowContractModal(false)} title="Создать договор">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">ID договора</label>
              <input className="form-input" value={contractForm.external_id}
                onChange={e => setContractForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="contract-2024-001" />
            </div>
            <div>
              <label className="form-label">Заказчик (ID контрагента)</label>
              <select className="form-input" value={contractForm.client_external_id}
                onChange={e => setContractForm(f => ({ ...f, client_external_id: e.target.value }))}>
                <option value="">— Выберите —</option>
                {persons.map(p => <option key={p.external_id} value={p.external_id}>{p.name} ({p.role})</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Исполнитель (ID контрагента)</label>
              <select className="form-input" value={contractForm.contractor_external_id}
                onChange={e => setContractForm(f => ({ ...f, contractor_external_id: e.target.value }))}>
                <option value="">— Выберите —</option>
                {persons.map(p => <option key={p.external_id} value={p.external_id}>{p.name} ({p.role})</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Дата договора</label>
              <input className="form-input" type="date" value={contractForm.date}
                onChange={e => setContractForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Номер договора</label>
              <input className="form-input" value={contractForm.serial}
                onChange={e => setContractForm(f => ({ ...f, serial: e.target.value }))}
                placeholder="РК-001/2024" />
            </div>
            <div>
              <label className="form-label">Сумма (руб.)</label>
              <input className="form-input" value={contractForm.amount}
                onChange={e => setContractForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="100000" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowContractModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={saveContract} disabled={saving}>
                {saving ? 'Создание...' : 'Создать в ORD'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Creative Modal */}
        <Modal isOpen={showCreativeModal} onClose={() => setShowCreativeModal(false)} title="Получить ERID-токен">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">ID креатива</label>
              <input className="form-input" value={creativeForm.external_id}
                onChange={e => setCreativeForm(f => ({ ...f, external_id: e.target.value }))}
                placeholder="creative-post-001" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
              <input type="checkbox" checked={creativeForm.self_promo}
                onChange={e => setCreativeForm(f => ({ ...f, self_promo: e.target.checked }))} />
              Самореклама (без договора)
            </label>
            {creativeForm.self_promo ? (
              <div>
                <label className="form-label">Контрагент (саморекламодатель)</label>
                <select className="form-input" value={creativeForm.person_external_id}
                  onChange={e => setCreativeForm(f => ({ ...f, person_external_id: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {persons.map(p => <option key={p.external_id} value={p.external_id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">Договор</label>
                <select className="form-input" value={creativeForm.contract_external_id}
                  onChange={e => setCreativeForm(f => ({ ...f, contract_external_id: e.target.value }))}>
                  <option value="">— Выберите —</option>
                  {contracts.map(c => <option key={c.external_id} value={c.external_id}>{c.serial || c.external_id}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="form-label">Формат</label>
              <select className="form-input" value={creativeForm.form}
                onChange={e => setCreativeForm(f => ({ ...f, form: e.target.value }))}>
                <option value="text_block">Текст</option>
                <option value="text_graphic_block">Текст + изображение</option>
                <option value="banner">Баннер (изображение)</option>
                <option value="video">Видео</option>
                <option value="text_video_block">Текст + видео</option>
              </select>
            </div>
            <div>
              <label className="form-label">Название креатива</label>
              <input className="form-input" value={creativeForm.name}
                onChange={e => setCreativeForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Весенняя акция" />
            </div>
            <div>
              <label className="form-label">Бренд</label>
              <input className="form-input" value={creativeForm.brand}
                onChange={e => setCreativeForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="Название бренда" />
            </div>
            <div>
              <label className="form-label">Текст рекламы (каждая строка — отдельный текст)</label>
              <textarea className="form-input" rows={4} value={creativeForm.texts}
                onChange={e => setCreativeForm(f => ({ ...f, texts: e.target.value }))}
                placeholder="Купите наш товар со скидкой 50%!" />
            </div>
            <div>
              <label className="form-label">Ссылки (каждая строка — отдельная ссылка)</label>
              <textarea className="form-input" rows={2} value={creativeForm.target_urls}
                onChange={e => setCreativeForm(f => ({ ...f, target_urls: e.target.value }))}
                placeholder="https://shop.example.com" />
            </div>
            <div>
              <label className="form-label">Коды ККТУ (через запятую)</label>
              <input className="form-input" value={creativeForm.kktus}
                onChange={e => setCreativeForm(f => ({ ...f, kktus: e.target.value }))}
                placeholder="1.1.1" />
              <div className="form-hint">Коды товаров/услуг. По умолчанию 1.1.1 (общая категория)</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowCreativeModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={saveCreative} disabled={saving}>
                {saving ? 'Создание...' : 'Получить ERID'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Paywall>
  );
}
