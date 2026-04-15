import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';

const SERVICES_PROVIDERS = [
  { id: 'yoomoney', name: 'ЮMoney', fields: [{ key: 'shop_id', label: 'Shop ID' }, { key: 'secret_key', label: 'Секретный ключ' }] },
  { id: 'prodamus', name: 'Продамус', fields: [{ key: 'api_key', label: 'API-ключ' }, { key: 'shop_url', label: 'URL магазина' }] },
  { id: 'tinkoff', name: 'Тинькофф', fields: [{ key: 'terminal_key', label: 'Terminal Key' }, { key: 'password', label: 'Пароль' }] },
  { id: 'robokassa', name: 'Робокасса', fields: [{ key: 'merchant_login', label: 'Merchant Login' }, { key: 'password1', label: 'Пароль #1' }, { key: 'password2', label: 'Пароль #2' }] },
];

export default function PaymentTab({ tc, showToast, currentChannel }) {
  const [paymentSettings, setPaymentSettings] = useState([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerCreds, setProviderCreds] = useState({});
  const [savingProvider, setSavingProvider] = useState(false);

  const loadPaymentSettings = useCallback(async () => {
    if (!tc) return;
    try {
      const data = await api.get(`/services/${tc}/payment-settings`);
      if (data.success) setPaymentSettings(data.settings || []);
    } catch {}
  }, [tc]);

  useEffect(() => { loadPaymentSettings(); }, [loadPaymentSettings]);

  const openProviderModal = (provider) => {
    setSelectedProvider(provider);
    setProviderCreds({});
    setShowProviderModal(true);
  };

  const saveProvider = async () => {
    if (!selectedProvider) return;
    setSavingProvider(true);
    try {
      const data = await api.post(`/services/${tc}/payment-settings`, {
        provider: selectedProvider.id,
        credentials: providerCreds,
        is_active: 1,
      });
      if (data.success) {
        if (data.test?.test_payment_url) {
          const goTest = window.confirm(
            `${selectedProvider.name} подключён!\n\nСоздан тестовый платёж на 10 ₽ для проверки.\nОткрыть страницу тестового платежа?`
          );
          if (goTest) window.open(data.test.test_payment_url, '_blank');
        } else if (data.test?.message) {
          showToast(data.test.message, data.test.success ? 'success' : 'error');
        } else {
          showToast(`${selectedProvider.name} подключён`);
        }
        setShowProviderModal(false);
        loadPaymentSettings();
      }
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const disconnectProvider = async (setting) => {
    if (!window.confirm('Отключить платёжную систему?')) return;
    try {
      await api.delete(`/services/${tc}/payment-settings/${setting.id}`);
      showToast('Платёжная система отключена');
      loadPaymentSettings();
    } catch (e) {
      showToast(e.message || 'Ошибка', 'error');
    }
  };

  return (
    <div className="pc-section">
      <h2>Настройка оплаты</h2>

      <div className="pc-info-box">
        <strong>Инструкция по подключению эквайринга:</strong>
        <ol>
          <li>Выберите платёжную систему из списка ниже</li>
          <li>Зарегистрируйтесь на сайте платёжной системы и получите API-ключи</li>
          <li>Введите полученные данные в форму и нажмите «Сохранить»</li>
          <li>После подключения эквайринга клиенты смогут оплачивать услуги онлайн</li>
        </ol>
      </div>

      <h3 style={{ marginTop: 24 }}>Платёжные системы</h3>
      <div className="pc-providers-grid">
        {SERVICES_PROVIDERS.map(p => {
          const connected = paymentSettings.find(s => s.provider === p.id);
          return (
            <div key={p.id} className={`pc-provider-card ${connected ? 'connected' : ''}`}>
              <div className="pc-provider-header">
                <strong>{p.name}</strong>
                {connected && <span className="pc-badge success">Подключён</span>}
              </div>
              <div className="pc-provider-actions">
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openProviderModal(p)}>
                  {connected ? 'Изменить' : 'Подключить'}
                </button>
                {connected && (
                  <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => disconnectProvider(connected)}>
                    Отключить
                  </button>
                )}
              </div>
              {connected && ['yoomoney', 'robokassa'].includes(p.id) && (
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Webhook URL (добавьте в настройках {p.name}):</span>
                  <code style={{ display: 'block', marginTop: '4px', padding: '6px', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', wordBreak: 'break-all' }}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/payments/webhook/${p.id}`);
                      showToast('URL скопирован');
                    }}
                    title="Нажмите для копирования">
                    {`${window.location.origin}/api/payments/webhook/${p.id}`}
                  </code>
                  <p style={{ marginTop: '4px', fontSize: '0.7rem', opacity: 0.7 }}>
                    {p.id === 'yoomoney' && 'Личный кабинет ЮKassa → Настройки → HTTP-уведомления → URL'}
                    {p.id === 'robokassa' && 'Личный кабинет Робокассы → Технические настройки → Result URL'}
                  </p>
                </div>
              )}
              {connected && ['tinkoff', 'prodamus'].includes(p.id) && (
                <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--success, #2a9d8f)' }}>
                  Webhook настраивается автоматически при каждом платеже
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Provider modal */}
      <Modal isOpen={showProviderModal} onClose={() => setShowProviderModal(false)} title={selectedProvider ? `Подключить ${selectedProvider.name}` : 'Эквайринг'}>
        {selectedProvider && (
          <div className="modal-form">
            <div className="pc-info-box" style={{ marginBottom: 16 }}>
              Заполните данные из личного кабинета <b>{selectedProvider.name}</b>.
              Убедитесь, что указали корректные ключи для рабочего режима (не тестового).
            </div>

            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)', borderRadius: '8px', fontSize: '0.82rem' }}>
              <strong>Webhook URL для уведомлений об оплате:</strong>
              <p style={{ margin: '6px 0 4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {selectedProvider.id === 'tinkoff' && 'Тинькофф: URL передаётся автоматически в каждом запросе. Дополнительно можно указать в ЛК:'}
                {selectedProvider.id === 'yoomoney' && 'ЮKassa: ЛК → Интеграция → HTTP-уведомления, укажите URL:'}
                {selectedProvider.id === 'prodamus' && 'Prodamus: Настройки платёжной страницы → URL для уведомлений:'}
                {selectedProvider.id === 'robokassa' && 'Robokassa: ЛК → Мои магазины → Технические настройки → Result URL (POST):'}
              </p>
              <code style={{ display: 'block', padding: '6px 8px', background: 'var(--bg-glass)', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', wordBreak: 'break-all' }}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/payments/webhook/${selectedProvider.id}`);
                  showToast('URL скопирован');
                }}
                title="Нажмите для копирования">
                {`${window.location.origin}/api/payments/webhook/${selectedProvider.id}`}
              </code>
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Нажмите на URL, чтобы скопировать</p>
            </div>
            {['tinkoff', 'prodamus'].includes(selectedProvider.id) && (
              <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(42,157,143,0.08)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--success, #2a9d8f)' }}>
                Webhook настроится автоматически при каждом платеже
              </div>
            )}

            {selectedProvider.fields.map(f => {
              const existing = paymentSettings.find(s => s.provider === selectedProvider.id);
              const masked = existing?.credentials?.[f.key];
              return (
                <div key={f.key} className="form-group">
                  <label>{f.label} {masked && <span style={{ fontSize: '0.72rem', color: 'var(--success, #2a9d8f)' }}>(сохранено: {masked})</span>}</label>
                  <input
                    type={f.key.includes('password') || f.key.includes('secret') ? 'password' : 'text'}
                    value={providerCreds[f.key] || ''}
                    onChange={e => setProviderCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={masked ? 'Оставьте пустым, чтобы не менять' : f.label}
                  />
                </div>
              );
            })}
            <button className="btn btn-primary" onClick={saveProvider} disabled={savingProvider} style={{ marginTop: 12 }}>
              {savingProvider ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
