import { useState } from 'react';
import { api } from '../../services/api';
import ImageUploadField from '../../components/ImageUploadField';

export default function ShopAppearanceTab({
  settings, setSettings, tc, showToast,
  saveSettings, savingSettings,
  currentChannel,
}) {
  const [policyUrl, setPolicyUrl] = useState(currentChannel?.privacy_policy_url || '');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const hasPolicy = !!policyUrl;

  const savePolicyUrl = async () => {
    if (!tc) return;
    setSavingPolicy(true);
    try {
      await api.put(`/channels/${tc}`, { privacy_policy_url: policyUrl });
      if (currentChannel) currentChannel.privacy_policy_url = policyUrl;
      showToast('Сохранено');
    } catch { showToast('Ошибка', 'error'); }
    setSavingPolicy(false);
  };

  const u = (field) => (e) => setSettings(prev => ({ ...prev, [field]: e.target.value }));
  const uCheck = (field) => (e) => setSettings(prev => ({ ...prev, [field]: e.target.checked }));

  return (
    <div className="pc-section">
      {/* Privacy policy */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px',
      }}>
        <label className="form-label" style={{ marginBottom: '8px', display: 'block', fontWeight: 600 }}>
          Политика конфиденциальности *
        </label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Ссылка на политику обработки персональных данных. Обязательна для работы мини-приложения магазина.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input className="form-input" placeholder="https://example.com/privacy" value={policyUrl}
            onChange={e => setPolicyUrl(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={savePolicyUrl} disabled={savingPolicy} style={{ whiteSpace: 'nowrap' }}>
            {savingPolicy ? '...' : 'Сохранить'}
          </button>
        </div>
        {!hasPolicy && (
          <p style={{ fontSize: '0.78rem', color: 'var(--error, #e63946)', marginTop: '6px' }}>
            Без заполнения этого поля ссылки на мини-приложение не будут отображаться
          </p>
        )}
      </div>

      {/* Shop settings */}
      <h2 style={{ marginBottom: 16 }}>Настройки магазина</h2>

      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px',
      }}>
        <div className="form-group">
          <label className="form-label">Название магазина</label>
          <input className="form-input" value={settings.shop_name || ''} onChange={u('shop_name')} placeholder="Мой магазин" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Основной цвет</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.primary_color || '#4F46E5'} onChange={u('primary_color')}
                style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
              <input className="form-input" value={settings.primary_color || ''} onChange={u('primary_color')} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Валюта</label>
            <select className="form-input" value={settings.currency || 'RUB'} onChange={u('currency')}>
              <option value="RUB">RUB (руб.)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <ImageUploadField
            label="Баннер"
            value={settings.banner_url || ''}
            onChange={v => setSettings(s => ({ ...s, banner_url: v }))}
            uploadUrl={`/shop/${tc}/upload-image`}
            placeholder="https://example.com/banner.jpg"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Приветственный текст</label>
          <textarea className="form-input" rows={3} value={settings.welcome_text || ''} onChange={u('welcome_text')} placeholder="Добро пожаловать в наш магазин!" />
        </div>

        <div className="form-group">
          <label className="form-label">Минимальная сумма заказа</label>
          <input type="number" className="form-input" value={settings.min_order_amount || ''} onChange={u('min_order_amount')} placeholder="0" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!settings.require_phone} onChange={uCheck('require_phone')} />
            Требовать телефон
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!settings.require_email} onChange={uCheck('require_email')} />
            Требовать email
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!settings.require_address} onChange={uCheck('require_address')} />
            Требовать адрес
          </label>
        </div>

        <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ marginTop: 16 }}>
          {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
