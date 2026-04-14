import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function ShopMainTab({ tc, settings, setSettings, orderStats, products, showToast, currentChannel, saveSettings, savingSettings }) {
  const maxBotUsername = import.meta.env.VITE_MAX_BOT_USERNAME || 'id575307462228_bot';
  const shopLink = `https://max.ru/${maxBotUsername}?startapp=shop_${tc}`;
  const [policyUrl, setPolicyUrl] = useState(currentChannel?.privacy_policy_url || '');
  const [offerUrl, setOfferUrl] = useState(currentChannel?.offer_url || '');
  const [savingLegal, setSavingLegal] = useState(false);

  const saveLegal = async () => {
    if (!tc) return;
    setSavingLegal(true);
    try {
      await api.put(`/channels/${tc}`, { privacy_policy_url: policyUrl, offer_url: offerUrl });
      if (currentChannel) { currentChannel.privacy_policy_url = policyUrl; currentChannel.offer_url = offerUrl; }
      showToast('Сохранено');
    } catch { showToast('Ошибка', 'error'); }
    setSavingLegal(false);
  };

  const validManagerUrl = settings.manager_contact_url && (settings.manager_contact_url.startsWith('https://t.me/') || settings.manager_contact_url.startsWith('https://max.ru/'));
  const hasPolicy = !!policyUrl && !!offerUrl;
  const canShowLink = hasPolicy && settings.manager_user_id && validManagerUrl;

  const [staff, setStaff] = useState([]);
  useEffect(() => {
    if (!tc) return;
    api.get(`/billing/${tc}/staff`).then(d => {
      if (d.success) setStaff(d.staff || []);
    }).catch(() => {});
  }, [tc]);

  // Owner is always an option
  const ownerOption = currentChannel ? { id: currentChannel.user_id, label: 'Владелец канала' } : null;
  const managerOptions = [
    ...(ownerOption ? [ownerOption] : []),
    ...staff.map(s => ({ id: s.user_id, label: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || `PKid ${s.user_id}` })),
  ];

  const copyLink = () => {
    navigator.clipboard.writeText(shopLink);
    showToast('Ссылка скопирована');
  };

  const statCards = [
    { label: 'Товаров', value: products?.length || orderStats.total_products || 0, color: '#4F46E5' },
    { label: 'Заказов', value: orderStats.total_orders || 0, color: '#059669' },
    { label: 'Выручка', value: `${(orderStats.total_revenue || 0).toLocaleString('ru-RU')} р.`, color: '#D97706' },
  ];

  return (
    <div className="pc-section">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Manager selection */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: 20,
      }}>
        <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Менеджер *</label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Контакт менеджера отправляется клиенту после оформления заказа
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-input" style={{ flex: 1, margin: 0 }}
            value={settings.manager_user_id || ''}
            onChange={e => setSettings(s => ({ ...s, manager_user_id: e.target.value ? parseInt(e.target.value) : null }))}
          >
            <option value="">-- Выберите менеджера --</option>
            {managerOptions.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ whiteSpace: 'nowrap' }}>
            {savingSettings ? '...' : 'Сохранить'}
          </button>
        </div>
        {!settings.manager_user_id && (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, #e63946)', marginTop: '6px' }}>
            Выберите менеджера для получения уведомлений о заказах
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Ссылка для связи с менеджером</label>
          <input className="form-input" placeholder="https://t.me/username или https://max.ru/..."
            value={settings.manager_contact_url || ''}
            onChange={e => setSettings(s => ({ ...s, manager_contact_url: e.target.value }))}
          />
          {settings.manager_contact_url && !settings.manager_contact_url.startsWith('https://t.me/') && !settings.manager_contact_url.startsWith('https://max.ru/') && (
            <p style={{ fontSize: '0.75rem', color: 'var(--error, #e63946)', marginTop: 4 }}>Ссылка должна начинаться с https://t.me/ или https://max.ru/</p>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Ссылка на Telegram или MAX. Отправляется клиенту после заказа.
          </p>
        </div>
      </div>

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

      {/* Miniapp link */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: 20,
      }}>
        <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Ссылка на магазин (мини-приложение)</label>
        {canShowLink ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{
              fontSize: '0.78rem', padding: '6px 10px', background: 'var(--bg)',
              borderRadius: 4, flex: 1, wordBreak: 'break-all',
            }}>{shopLink}</code>
            <button className="btn btn-primary" onClick={copyLink} style={{ whiteSpace: 'nowrap' }}>
              Копировать
            </button>
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--error, #e63946)', margin: '8px 0 0' }}>
            {!hasPolicy ? 'Заполните юридические документы' : !settings.manager_user_id ? 'Выберите менеджера' : 'Укажите корректную ссылку менеджера (t.me или max.ru)'}
          </p>
        )}
      </div>
    </div>
  );
}
