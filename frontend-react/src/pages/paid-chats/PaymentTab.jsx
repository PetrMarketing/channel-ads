import { useState } from 'react';
import { PROVIDERS } from './constants';
import { api } from '../../services/api';

export default function PaymentTab({ paymentSettings, openProviderModal, disconnectProvider, currentChannel, onChannelUpdate }) {
  const [policyUrl, setPolicyUrl] = useState(currentChannel?.privacy_policy_url || '');
  const [saving, setSaving] = useState(false);

  const savePolicyUrl = async () => {
    if (!currentChannel?.tracking_code) return;
    setSaving(true);
    try {
      await api.put(`/channels/${currentChannel.tracking_code}`, { privacy_policy_url: policyUrl });
      if (onChannelUpdate) onChannelUpdate();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="pc-section">
      <h2>Настройка оплаты</h2>

      {/* Privacy policy */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px',
      }}>
        <label className="form-label" style={{ marginBottom: '8px', display: 'block', fontWeight: 600 }}>
          Политика конфиденциальности *
        </label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Ссылка на политику обработки персональных данных. Обязательна для приёма платежей и работы мини-приложений.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="https://example.com/privacy"
            value={policyUrl}
            onChange={e => setPolicyUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={savePolicyUrl} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
            {saving ? '...' : 'Сохранить'}
          </button>
        </div>
        {!policyUrl && (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, #e63946)', marginTop: '6px' }}>
            Без заполнения этого поля ссылки на оплату и мини-приложения не будут отображаться
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
