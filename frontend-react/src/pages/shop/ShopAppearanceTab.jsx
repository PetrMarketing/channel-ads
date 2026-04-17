import { useState, useEffect } from 'react';
import ImageUploadField from '../../components/ImageUploadField';

const colorSwatch = (val, onChange) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <div style={{ width: 36, height: 36, borderRadius: 6, background: val, border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
      <input type="color" value={val} onChange={onChange}
        style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
    </div>
    <input className="form-input" value={val} onChange={onChange} style={{ width: 100 }} />
  </div>
);

export default function ShopAppearanceTab({
  settings, setSettings, tc, showToast,
  saveSettings, savingSettings,
  currentChannel,
}) {
  const [previewScreen, setPreviewScreen] = useState('home');
  const [previewBanner, setPreviewBanner] = useState(0);
  const u = (field) => (e) => setSettings(prev => ({ ...prev, [field]: e.target.value }));
  const uCheck = (field) => (e) => setSettings(prev => ({ ...prev, [field]: e.target.checked }));
  const s = settings;
  const pc = s.primary_color || '#4F46E5';
  const banners = (s.banners && Array.isArray(s.banners) ? s.banners : []).filter(Boolean);
  // Also include legacy banner_url
  const allBanners = s.banner_url && !banners.includes(s.banner_url) ? [s.banner_url, ...banners] : banners;

  // Auto-rotate banners every 10s
  useEffect(() => {
    if (allBanners.length <= 1) return;
    const t = setInterval(() => setPreviewBanner(p => (p + 1) % allBanners.length), 10000);
    return () => clearInterval(t);
  }, [allBanners.length]);

  const screens = [
    { id: 'home', label: 'Главная' },
    { id: 'categories', label: 'Категории' },
    { id: 'category', label: 'Категория' },
    { id: 'product', label: 'Товар' },
    { id: 'cart', label: 'Корзина' },
    { id: 'checkout', label: 'Форма' },
  ];

  // Header background style
  const headerBgStyle = s.bg_type === 'gradient'
    ? { background: `linear-gradient(${s.gradient_direction || '135deg'}, ${s.gradient_from || pc}, ${s.gradient_to || '#7C3AED'})` }
    : { background: s.bg_color || pc };

  // Page background style
  const pageBgStyle = s.page_bg_type === 'gradient'
    ? { background: `linear-gradient(${s.page_gradient_direction || '180deg'}, ${s.page_gradient_from || '#f5f5f5'}, ${s.page_gradient_to || '#e0e7ff'})` }
    : { background: s.page_bg_color || '#ffffff' };

  const headerTextColor = s.header_text_color || '#ffffff';
  const pageTextColor = s.page_text_color || '#1f2937';

  return (
    <div className="pc-section">
      <h2 style={{ marginBottom: 16 }}>Настройки магазина</h2>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Settings form */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div className="form-group">
            <label className="form-label">Название магазина</label>
            <input className="form-input" value={s.shop_name || ''} onChange={u('shop_name')} placeholder="Мой магазин" />
          </div>

          <div className="form-group">
            <label className="form-label">Валюта</label>
            <select className="form-input" value={s.currency || 'RUB'} onChange={u('currency')} style={{ maxWidth: 200 }}>
              <option value="RUB">RUB</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Основной цвет</label>
            {colorSwatch(pc, e => setSettings(p => ({ ...p, primary_color: e.target.value })))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">Цвет текста шапки</label>
              {colorSwatch(s.header_text_color || '#ffffff', e => setSettings(p => ({ ...p, header_text_color: e.target.value })))}
            </div>
            <div className="form-group">
              <label className="form-label">Цвет текста страницы</label>
              {colorSwatch(s.page_text_color || '#1f2937', e => setSettings(p => ({ ...p, page_text_color: e.target.value })))}
            </div>
          </div>

          {/* Header background type */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Тип фона шапки</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }].map(t => (
                <button key={t.id} className={`btn ${s.bg_type === t.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                  onClick={() => setSettings(p => ({ ...p, bg_type: t.id }))}>{t.label}</button>
              ))}
            </div>
          </div>

          {s.bg_type === 'color' && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Цвет фона</label>
              {colorSwatch(s.bg_color || pc, e => setSettings(p => ({ ...p, bg_color: e.target.value })))}
            </div>
          )}

          {s.bg_type === 'gradient' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Цвет 1</label>
                {colorSwatch(s.gradient_from || pc, e => setSettings(p => ({ ...p, gradient_from: e.target.value })))}
              </div>
              <div className="form-group">
                <label className="form-label">Цвет 2</label>
                {colorSwatch(s.gradient_to || '#7C3AED', e => setSettings(p => ({ ...p, gradient_to: e.target.value })))}
              </div>
              <div className="form-group">
                <label className="form-label">Направление</label>
                <select className="form-input" value={s.gradient_direction || '135deg'}
                  onChange={e => setSettings(p => ({ ...p, gradient_direction: e.target.value }))}>
                  <option value="0deg">Сверху вниз</option>
                  <option value="90deg">Слева направо</option>
                  <option value="135deg">По диагонали</option>
                  <option value="180deg">Снизу вверх</option>
                </select>
              </div>
            </div>
          )}

          {/* Page background */}
          <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Фон страницы</h4>
          <div className="form-group">
            <label className="form-label">Тип фона</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }].map(t => (
                <button key={t.id} className={`btn ${s.page_bg_type === t.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                  onClick={() => setSettings(p => ({ ...p, page_bg_type: t.id }))}>{t.label}</button>
              ))}
            </div>
          </div>
          {s.page_bg_type === 'color' && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Цвет фона</label>
              {colorSwatch(s.page_bg_color || '#ffffff', e => setSettings(p => ({ ...p, page_bg_color: e.target.value })))}
            </div>
          )}
          {s.page_bg_type === 'gradient' && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">Цвет 1</label>
                {colorSwatch(s.page_gradient_from || '#f5f5f5', e => setSettings(p => ({ ...p, page_gradient_from: e.target.value })))}
              </div>
              <div className="form-group">
                <label className="form-label">Цвет 2</label>
                {colorSwatch(s.page_gradient_to || '#e0e7ff', e => setSettings(p => ({ ...p, page_gradient_to: e.target.value })))}
              </div>
              <div className="form-group">
                <label className="form-label">Направление</label>
                <select className="form-input" value={s.page_gradient_direction || '180deg'}
                  onChange={e => setSettings(p => ({ ...p, page_gradient_direction: e.target.value }))}>
                  <option value="0deg">Сверху вниз</option>
                  <option value="90deg">Слева направо</option>
                  <option value="135deg">По диагонали</option>
                  <option value="180deg">Снизу вверх</option>
                </select>
              </div>
            </div>
          )}

          {/* Banners */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Баннеры (слайдер)</label>
            {allBanners.map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <img src={url} alt="" style={{ width: 60, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.split('/').pop()}</span>
                <button type="button" className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={() => {
                    const updated = allBanners.filter((_, j) => j !== i);
                    setSettings(prev => ({ ...prev, banners: updated, banner_url: updated[0] || '' }));
                  }}>&#10005;</button>
              </div>
            ))}
            <ImageUploadField label="" value="" placeholder="Добавить баннер..."
              onChange={v => { if (v) { const updated = [...allBanners, v]; setSettings(prev => ({ ...prev, banners: updated, banner_url: updated[0] || '' })); } }}
              uploadUrl={`/shop/${tc}/upload-image`} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>Баннеры переключаются каждые 10 секунд. Рекомендуемый размер: 1080x540</p>
          </div>

          <div className="form-group">
            <label className="form-label">Приветственный текст</label>
            <textarea className="form-input" rows={2} value={s.welcome_text || ''} onChange={u('welcome_text')} placeholder="Добро пожаловать!" />
          </div>

          <div className="form-group">
            <label className="form-label">Мин. сумма заказа</label>
            <input type="number" className="form-input" value={s.min_order_amount || ''} onChange={u('min_order_amount')} placeholder="0" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[['require_phone', 'Требовать телефон'], ['require_email', 'Требовать email'], ['require_address', 'Требовать адрес']].map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!s[k]} onChange={uCheck(k)} /> {l}
              </label>
            ))}
          </div>

          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ marginTop: 16 }}>
            {savingSettings ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        {/* Preview */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <label className="form-label" style={{ marginBottom: 8 }}>Предпросмотр</label>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
            {screens.map(scr => (
              <button key={scr.id} onClick={() => setPreviewScreen(scr.id)} title={scr.label} style={{
                border: 'none', cursor: 'pointer', padding: 0,
                width: previewScreen === scr.id ? 24 : 8, height: 8, borderRadius: 4,
                background: previewScreen === scr.id ? pc : 'var(--border, #d1d5db)',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', height: 462, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ ...headerBgStyle, padding: '14px 16px', color: headerTextColor, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {previewScreen !== 'home' && <span style={{ cursor: 'pointer' }}>&#8592;</span>}
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                {previewScreen === 'home' ? (s.shop_name || 'Магазин') :
                 previewScreen === 'categories' ? 'Категории' :
                 previewScreen === 'category' ? 'Электроника' :
                 previewScreen === 'product' ? 'Смартфон Pro' :
                 previewScreen === 'cart' ? 'Корзина' : 'Оформление'}
              </span>
              <span style={{ fontSize: 16, position: 'relative' }}>&#128722;<span style={{ position: 'absolute', top: -4, right: -6, background: '#ef4444', color: '#fff', fontSize: 9, padding: '0 4px', borderRadius: 8, fontWeight: 700 }}>2</span></span>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', fontSize: 12, color: pageTextColor, ...pageBgStyle }}>
              {/* Home */}
              {previewScreen === 'home' && (
                <div>
                  {allBanners.length > 0 && (
                    <div style={{ position: 'relative', overflow: 'hidden' }}>
                      <img src={allBanners[previewBanner % allBanners.length]} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                      {allBanners.length > 1 && (
                        <>
                          <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
                            {allBanners.map((_, i) => (
                              <div key={i} onClick={() => setPreviewBanner(i)} style={{
                                width: i === previewBanner % allBanners.length ? 16 : 6, height: 6, borderRadius: 3,
                                background: i === previewBanner % allBanners.length ? '#fff' : 'rgba(255,255,255,0.5)',
                                cursor: 'pointer', transition: 'all 0.2s',
                              }} />
                            ))}
                          </div>
                          <div style={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', cursor: 'pointer', color: '#fff', fontSize: 16, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                            onClick={() => setPreviewBanner(p => (p - 1 + allBanners.length) % allBanners.length)}>&#8249;</div>
                          <div style={{ position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)', cursor: 'pointer', color: '#fff', fontSize: 16, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                            onClick={() => setPreviewBanner(p => (p + 1) % allBanners.length)}>&#8250;</div>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    {s.welcome_text && <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{s.welcome_text.slice(0, 60)}</p>}
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Хиты</div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'hidden', marginBottom: 12 }}>
                      {['Смартфон', 'Наушники'].map((n, i) => (
                        <div key={i} style={{ width: 90, flexShrink: 0, borderRadius: 8, border: '1px solid #eee', overflow: 'hidden' }}>
                          <div style={{ height: 60, background: '#f3f4f6' }} />
                          <div style={{ padding: '4px 6px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{n}</div>
                            <div style={{ fontSize: 10, color: pc, fontWeight: 700 }}>{(2000 + i * 1500).toLocaleString('ru-RU')} &#8381;</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Категории</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {['Электроника', 'Одежда', 'Дом', 'Спорт'].map((c, i) => (
                        <div key={i} style={{ padding: '12px 8px', borderRadius: 8, border: '1px solid #eee', textAlign: 'center', fontSize: 11, fontWeight: 600 }}>{c}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Categories */}
              {previewScreen === 'categories' && (
                <div style={{ padding: 12 }}>
                  {['Электроника', 'Одежда', 'Для дома', 'Спорт'].map((c, i) => (
                    <div key={i} style={{ padding: '14px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><div style={{ fontWeight: 600, fontSize: 13 }}>{c}</div><div style={{ fontSize: 10, color: '#888' }}>{3 + i * 2} товаров</div></div>
                      <span style={{ color: '#ccc' }}>&#8250;</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Category (product grid) */}
              {previewScreen === 'category' && (
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto' }}>
                    {['Все', 'Телефоны', 'Планшеты'].map((t, i) => (
                      <span key={i} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: i === 0 ? pc : '#f3f4f6', color: i === 0 ? '#fff' : '#555', flexShrink: 0 }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['Смартфон Pro', 'Планшет Air', 'Наушники X', 'Чехол'].map((n, i) => (
                      <div key={i} style={{ borderRadius: 8, border: '1px solid #eee', overflow: 'hidden' }}>
                        <div style={{ height: 70, background: '#f3f4f6' }} />
                        <div style={{ padding: '6px 8px' }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{n}</div>
                          <div style={{ fontSize: 11, color: pc, fontWeight: 700 }}>{(500 + i * 800).toLocaleString('ru-RU')} &#8381;</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product */}
              {previewScreen === 'product' && (
                <div>
                  <div style={{ height: 140, background: '#f3f4f6' }} />
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Смартфон Pro</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', margin: '4px 0 8px' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: pc }}>2 500 &#8381;</span>
                      <span style={{ fontSize: 12, color: '#aaa', textDecoration: 'line-through' }}>3 200 &#8381;</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>Мощный смартфон с отличной камерой и длительной батареей.</p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {['128 GB', '256 GB'].map((v, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, border: `1px solid ${i === 0 ? pc : '#eee'}`, color: i === 0 ? pc : '#555', fontWeight: 600 }}>{v}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <button style={{ width: 28, height: 28, border: '1px solid #eee', borderRadius: 6, background: '#fff', fontSize: 14, cursor: 'pointer' }}>-</button>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>1</span>
                      <button style={{ width: 28, height: 28, border: '1px solid #eee', borderRadius: 6, background: '#fff', fontSize: 14, cursor: 'pointer' }}>+</button>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: pc, color: '#fff', textAlign: 'center', fontWeight: 600, fontSize: 13 }}>Добавить в корзину</div>
                  </div>
                </div>
              )}

              {/* Cart */}
              {previewScreen === 'cart' && (
                <div style={{ padding: 12 }}>
                  {['Смартфон Pro', 'Наушники X'].map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 6, background: '#f3f4f6', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{n}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>x{i + 1}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: pc, fontSize: 12 }}>{(2500 - i * 2000).toLocaleString('ru-RU')} &#8381;</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: 13, borderTop: '2px solid #eee', marginTop: 8 }}>
                    <span>Итого:</span><span style={{ color: pc }}>3 000 &#8381;</span>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: pc, color: '#fff', textAlign: 'center', fontWeight: 600, fontSize: 13, marginTop: 8 }}>Оформить заказ</div>
                </div>
              )}

              {/* Checkout */}
              {previewScreen === 'checkout' && (
                <div style={{ padding: 12 }}>
                  {[['Имя', 'Иван Иванов'], ['Телефон', '+7 900 123-45-67'], ['Адрес', 'г. Москва, ул. Примерная, 1']].map(([l, v], i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 2 }}>{l}</div>
                      <div style={{ padding: '8px 10px', border: '1px solid #eee', borderRadius: 6, fontSize: 12, color: '#333', background: '#fafafa' }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 4, marginTop: 4 }}>Доставка</div>
                  {['Курьер — 300 &#8381;', 'Самовывоз — бесплатно'].map((d, i) => (
                    <div key={i} style={{ padding: '8px 10px', border: `1px solid ${i === 0 ? pc : '#eee'}`, borderRadius: 6, marginBottom: 4, fontSize: 11, color: i === 0 ? pc : '#555', fontWeight: i === 0 ? 600 : 400 }} dangerouslySetInnerHTML={{ __html: d }} />
                  ))}
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности</div>
                  <div style={{ padding: 10, borderRadius: 8, background: pc, color: '#fff', textAlign: 'center', fontWeight: 600, fontSize: 13, marginTop: 8 }}>Оплатить</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
