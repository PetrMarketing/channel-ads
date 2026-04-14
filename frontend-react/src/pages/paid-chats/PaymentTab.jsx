import { useState, useEffect } from 'react';
import { PROVIDERS } from './constants';
import { api } from '../../services/api';

export default function PaymentTab({ paymentSettings, openProviderModal, disconnectProvider, currentChannel, onChannelUpdate }) {
  const tc = currentChannel?.tracking_code;
  const [policyUrl, setPolicyUrl] = useState(currentChannel?.privacy_policy_url || '');
  const [offerUrl, setOfferUrl] = useState(currentChannel?.offer_url || '');
  const [savingLegal, setSavingLegal] = useState(false);

  const saveLegal = async () => {
    if (!tc) return;
    setSavingLegal(true);
    try {
      await api.put(`/channels/${tc}`, { privacy_policy_url: policyUrl, offer_url: offerUrl });
      if (currentChannel) { currentChannel.privacy_policy_url = policyUrl; currentChannel.offer_url = offerUrl; }
      if (onChannelUpdate) onChannelUpdate();
    } catch {}
    setSavingLegal(false);
  };

  const [staff, setStaff] = useState([]);
  const [managerUserId, setManagerUserId] = useState(currentChannel?.paid_chat_manager_user_id || '');
  const [managerContactUrl, setManagerContactUrl] = useState(currentChannel?.paid_chat_manager_contact_url || '');
  const [savingManager, setSavingManager] = useState(false);

  useEffect(() => {
    if (!tc) return;
    api.get(`/billing/${tc}/staff`).then(d => {
      if (d.success) setStaff(d.staff || []);
    }).catch(() => {});
  }, [tc]);

  const ownerOption = currentChannel ? { id: currentChannel.user_id, label: 'Владелец канала' } : null;
  const managerOptions = [
    ...(ownerOption ? [ownerOption] : []),
    ...staff.map(s => ({ id: s.user_id, label: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `PKid ${s.user_id}` })),
  ];

  return (
    <div className="pc-section">
      <h2>Настройка оплаты</h2>

      {/* Legal docs */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: 20,
      }}>
        <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Юридические документы</label>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Политика конфиденциальности *</label>
          <input className="form-input" placeholder="https://example.com/privacy"
            value={policyUrl} onChange={e => setPolicyUrl(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 4 }}>Договор оферты *</label>
          <input className="form-input" placeholder="https://example.com/offer"
            value={offerUrl} onChange={e => setOfferUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={saveLegal} disabled={savingLegal} style={{ width: '100%' }}>
          {savingLegal ? '...' : 'Сохранить'}
        </button>
        {(!policyUrl || !offerUrl) && (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, #e63946)', marginTop: '6px' }}>
            Без заполнения этих полей ссылки на оплату и мини-приложения не будут отображаться
          </p>
        )}
      </div>

      <div className="pc-info-box">
        <strong>Инструкция по подключению эквайринга:</strong>
        <ol>
          <li>Выберите платёжную систему из списка ниже</li>
          <li>Зарегистрируйтесь на сайте платёжной системы и получите API-ключи</li>
          <li>Введите полученные данные в форму и нажмите «Сохранить»</li>
          <li>После подключения эквайринга станут доступны остальные разделы</li>
        </ol>
      </div>

      <h3 style={{ marginTop: 24 }}>Платёжные системы</h3>
      <div className="pc-providers-grid">
        {PROVIDERS.map(p => {
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
              {connected && ['yoomoney', 'robokassa', 'getcourse'].includes(p.id) && (
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Webhook URL (добавьте в настройках {p.name}):</span>
                  <code style={{ display: 'block', marginTop: '4px', padding: '6px', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', wordBreak: 'break-all' }}
                    onClick={() => {
                      const url = p.id === 'getcourse'
                        ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                        : `${window.location.origin}/api/paid-chat-pay/webhook/${p.id}`;
                      navigator.clipboard.writeText(url);
                    }}
                    title="Нажмите для копирования">
                    {p.id === 'getcourse'
                      ? `${window.location.origin}/api/paid-chat-pay/webhook/getcourse/${currentChannel?.tracking_code}`
                      : `${window.location.origin}/api/paid-chat-pay/webhook/${p.id}`}
                  </code>
                  <p style={{ marginTop: '4px', fontSize: '0.7rem', opacity: 0.7 }}>
                    {p.id === 'yoomoney' && 'Личный кабинет ЮKassa → Настройки → HTTP-уведомления → URL'}
                    {p.id === 'robokassa' && 'Личный кабинет Робокассы → Технические настройки → Result URL'}
                    {p.id === 'getcourse' && 'Настройки GetCourse → Уведомления об оплате → URL'}
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

    </div>
  );
}
