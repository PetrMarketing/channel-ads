import { useState } from 'react';
import { api } from '../../services/api';

const colorSwatch = (val, onChange) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <div style={{ width: 36, height: 36, borderRadius: 6, background: val, border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
      <input type="color" value={val} onChange={onChange}
        style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 0 }} />
    </div>
    <input className="form-input" value={val} onChange={onChange} style={{ width: 100 }} />
  </div>
);

export default function AppearanceTab({
  settings, setSettings, tc, showToast,
  saveSettings, savingSettings,
  coverImage, setCoverImage,
  uploadingCover, setUploadingCover,
  currentChannel,
}) {
  const [bgFile, setBgFile] = useState(null);
  const [previewScreen, setPreviewScreen] = useState('home');
  const s = settings;

  const bgStyle = s.bg_type === 'gradient'
    ? { background: `linear-gradient(${s.gradient_direction || '135deg'}, ${s.gradient_from || '#4F46E5'}, ${s.gradient_to || '#7C3AED'})` }
    : s.bg_type === 'image' && (bgFile || s.bg_image_url)
      ? { backgroundImage: `url(${bgFile ? URL.createObjectURL(bgFile) : s.bg_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: s.bg_color || '#4F46E5' };

  const overlayStyle = s.bg_type === 'image' ? {
    position: 'absolute', inset: 0, background: `rgba(0,0,0,${(s.overlay_opacity || 40) / 100})`,
    backdropFilter: s.blur ? `blur(${s.blur}px)` : 'none', WebkitBackdropFilter: s.blur ? `blur(${s.blur}px)` : 'none',
  } : null;

  return (
    <div className="pc-section">
      <h2>Внешний вид мини-приложения</h2>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          {/* Cover image */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Обложка</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              {(coverImage || s.logo_url) && (
                <img src={coverImage ? URL.createObjectURL(coverImage) : s.logo_url}
                  alt="" style={{ width: 120, height: 80, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center' }}>
                  {s.logo_url ? 'Заменить' : 'Загрузить'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setCoverImage(e.target.files[0] || null)} />
                </label>
                {coverImage && (
                  <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} disabled={uploadingCover}
                    onClick={async () => {
                      setUploadingCover(true);
                      try {
                        const fd = new FormData(); fd.append('file', coverImage);
                        const r = await api.upload(`/services/${tc}/settings/cover`, fd);
                        if (r.success) { showToast('Обложка загружена'); setSettings(p => ({ ...p, logo_url: r.cover_url })); setCoverImage(null); }
                      } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                      finally { setUploadingCover(false); }
                    }}
                  >{uploadingCover ? 'Загрузка...' : 'Сохранить обложку'}</button>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Основной цвет</label>
            {colorSwatch(s.primary_color || '#4F46E5', e => setSettings(p => ({ ...p, primary_color: e.target.value })))}
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

          {/* Background type */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Тип фона шапки</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }].map(t => (
                <button key={t.id} className={`btn ${s.bg_type === t.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                  onClick={() => setSettings(p => ({ ...p, bg_type: t.id }))}>{t.label}</button>
              ))}
            </div>
          </div>

          {s.bg_type === 'color' && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Цвет фона</label>
              {colorSwatch(s.bg_color || '#4F46E5', e => setSettings(p => ({ ...p, bg_color: e.target.value })))}
            </div>
          )}

          {s.bg_type === 'gradient' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Цвет 1</label>
                {colorSwatch(s.gradient_from || '#4F46E5', e => setSettings(p => ({ ...p, gradient_from: e.target.value })))}
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

          {s.bg_type === 'image' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Фоновое изображение</label>
                <input type="file" accept="image/*" className="form-input" style={{ padding: 8 }}
                  onChange={e => setBgFile(e.target.files?.[0] || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">Цвет затемнения</label>
                {colorSwatch(s.overlay_color || '#000000', e => setSettings(p => ({ ...p, overlay_color: e.target.value })))}
              </div>
              <div className="form-group">
                <label className="form-label">Интенсивность: {s.overlay_opacity || 40}%</label>
                <input type="range" min="20" max="100" value={s.overlay_opacity || 40}
                  onChange={e => setSettings(p => ({ ...p, overlay_opacity: parseInt(e.target.value) }))} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Размытие: {s.blur || 0}px</label>
                <input type="range" min="0" max="20" value={s.blur || 0}
                  onChange={e => setSettings(p => ({ ...p, blur: parseInt(e.target.value) }))} style={{ width: '100%' }} />
              </div>
            </div>
          )}

          {/* Page background */}
          <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Фон страницы</h4>
          <div className="form-group">
            <label className="form-label">Тип фона</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'color', label: 'Цвет' }, { id: 'gradient', label: 'Градиент' }, { id: 'image', label: 'Изображение' }].map(t => (
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
          {s.page_bg_type === 'image' && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">Изображение</label>
                <input type="file" accept="image/*" className="form-input" style={{ padding: 8 }}
                  onChange={e => setBgFile(e.target.files?.[0] || null)} />
                {(bgFile || s.page_bg_image_url) && (
                  <img src={bgFile ? URL.createObjectURL(bgFile) : s.page_bg_image_url} alt=""
                    style={{ width: 120, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Затемнение: {s.page_overlay_opacity || 20}%</label>
                <input type="range" min="0" max="80" value={s.page_overlay_opacity || 20}
                  onChange={e => setSettings(p => ({ ...p, page_overlay_opacity: parseInt(e.target.value) }))} style={{ width: '100%' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, maxWidth: 400 }}>
            <div className="form-group">
              <label className="form-label">Шаг слотов (мин)</label>
              <input type="number" className="form-input" value={s.slot_step_minutes || 30}
                onChange={e => setSettings(p => ({ ...p, slot_step_minutes: parseInt(e.target.value) || 30 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Мин. часов до записи</label>
              <input type="number" className="form-input" value={s.min_booking_hours || 2}
                onChange={e => setSettings(p => ({ ...p, min_booking_hours: parseInt(e.target.value) || 2 }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Приветственный текст</label>
            <textarea className="form-input" rows={3} value={s.welcome_text || ''}
              onChange={e => setSettings(p => ({ ...p, welcome_text: e.target.value }))}
              placeholder="Добро пожаловать! Выберите услугу для записи." />
          </div>

          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ marginTop: 16 }}>
            {savingSettings ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        {/* Preview */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <label className="form-label" style={{ marginBottom: 8 }}>Предпросмотр</label>

          {/* Screen switcher — dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
            {[
              { id: 'home', label: 'Главная' },
              { id: 'services', label: 'Услуги' },
              { id: 'specialists', label: 'Специалисты' },
              { id: 'booking', label: 'Запись' },
              { id: 'success', label: 'Спасибо' },
            ].map(scr => (
              <button key={scr.id} onClick={() => setPreviewScreen(scr.id)} title={scr.label} style={{
                border: 'none', cursor: 'pointer', padding: 0,
                width: previewScreen === scr.id ? 24 : 8,
                height: 8, borderRadius: 4,
                background: previewScreen === scr.id ? (s.primary_color || '#4F46E5') : 'var(--border, #d1d5db)',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', height: 462, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ ...bgStyle, padding: '24px 16px', textAlign: 'center', color: s.header_text_color || '#fff', position: 'relative', minHeight: 90 }}>
              {overlayStyle && <div style={overlayStyle} />}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {(coverImage || s.logo_url) && (
                  <img src={coverImage ? URL.createObjectURL(coverImage) : s.logo_url} alt=""
                    style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px', display: 'block', border: '2px solid rgba(255,255,255,0.5)' }} />
                )}
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {previewScreen === 'home' ? (s.welcome_text?.slice(0, 30) || 'Запись на услуги') :
                   previewScreen === 'services' ? 'Выберите услугу' :
                   previewScreen === 'specialists' ? 'Выберите специалиста' :
                   previewScreen === 'booking' ? 'Запись' : 'Готово!'}
                </div>
              </div>
            </div>

            {/* Content area */}
            <div style={{ padding: 12, flex: 1, overflowY: 'auto', color: s.page_text_color || '#1f2937',
              ...(s.page_bg_type === 'gradient'
                ? { background: `linear-gradient(${s.page_gradient_direction || '180deg'}, ${s.page_gradient_from || '#f5f5f5'}, ${s.page_gradient_to || '#e0e7ff'})` }
                : { background: s.page_bg_color || '#ffffff' })
            }}>
              {/* Home */}
              {previewScreen === 'home' && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Наши услуги</div>
                  {['Стрижка', 'Маникюр', 'Массаж'].map((name, i) => (
                    <div key={i} style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #eee', background: 'rgba(255,255,255,0.7)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{30 + i * 15} мин · {1000 + i * 500} ₽</div>
                    </div>
                  ))}
                </>
              )}

              {/* Services */}
              {previewScreen === 'services' && (
                <>
                  {['Стрижка мужская', 'Стрижка женская', 'Маникюр', 'Педикюр'].map((name, i) => (
                    <div key={i} style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #eee', background: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{30 + i * 10} мин</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.primary_color || '#4F46E5' }}>{800 + i * 400} ₽</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Specialists */}
              {previewScreen === 'specialists' && (
                <>
                  {['Анна Иванова', 'Мария Петрова'].map((name, i) => (
                    <div key={i} style={{ padding: '12px', marginBottom: 6, borderRadius: 8, border: '1px solid #eee', background: 'rgba(255,255,255,0.7)', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: s.primary_color || '#4F46E5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{name[0]}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>Стилист</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Booking form */}
              {previewScreen === 'booking' && (
                <>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Стрижка · Анна Иванова</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
                    {['Пн 14', 'Вт 15', 'Ср 16', 'Чт 17'].map((d, i) => (
                      <div key={i} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #eee', fontSize: 12, textAlign: 'center', background: i === 1 ? (s.primary_color || '#4F46E5') : 'rgba(255,255,255,0.7)', color: i === 1 ? '#fff' : '#333', flexShrink: 0 }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 10 }}>
                    {['10:00', '11:00', '12:00', '14:00', '15:00', '16:00'].map((t, i) => (
                      <div key={i} style={{ padding: '6px', borderRadius: 6, border: '1px solid #eee', fontSize: 12, textAlign: 'center', background: i === 2 ? (s.primary_color || '#4F46E5') : 'rgba(255,255,255,0.7)', color: i === 2 ? '#fff' : '#333' }}>{t}</div>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: 8, fontSize: 11, marginBottom: 8 }}>
                    <div style={{ marginBottom: 4 }}><b>Имя:</b> Иван Иванов</div>
                    <div><b>Тел:</b> +7 900 123-45-67</div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 8, background: s.primary_color || '#4F46E5', color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Подтвердить запись</div>
                </>
              )}

              {/* Success */}
              {previewScreen === 'success' && (
                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Вы записаны!</div>
                  <div style={{ fontSize: 12, color: '#888' }}>Стрижка</div>
                  <div style={{ fontSize: 12, color: '#888' }}>Вт, 15 апреля в 12:00</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Анна Иванова</div>
                  <div style={{ padding: '8px', borderRadius: 8, background: s.primary_color || '#4F46E5', color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: 600, marginTop: 16 }}>Записаться ещё</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
