import { api } from '../../services/api';

export default function AppearanceTab({
  settings, setSettings, tc, showToast,
  saveSettings, savingSettings,
  coverImage, setCoverImage,
  uploadingCover, setUploadingCover,
}) {
  return (
    <div className="pc-section">
      <h2>Внешний вид мини-приложения</h2>

      {/* Cover image */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Обложка (отображается на главном экране мини-приложения)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {(coverImage || settings.logo_url) && (
            <img src={coverImage ? URL.createObjectURL(coverImage) : settings.logo_url}
              alt="" style={{ width: 120, height: 80, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center' }}>
              {settings.logo_url ? 'Заменить обложку' : 'Загрузить обложку'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setCoverImage(e.target.files[0] || null)} />
            </label>
            {coverImage && (
              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} disabled={uploadingCover}
                onClick={async () => {
                  setUploadingCover(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', coverImage);
                    const r = await api.upload(`/services/${tc}/settings/cover`, fd);
                    if (r.success) {
                      showToast('Обложка загружена');
                      setSettings(p => ({ ...p, logo_url: r.cover_url }));
                      setCoverImage(null);
                    }
                  } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                  finally { setUploadingCover(false); }
                }}
              >{uploadingCover ? 'Загрузка...' : 'Сохранить обложку'}</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600 }}>
        <div className="form-group">
          <label className="form-label">Основной цвет</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={settings.primary_color || '#4F46E5'} onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
            <input className="form-input" value={settings.primary_color || ''} onChange={e => setSettings(p => ({ ...p, primary_color: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Шаг слотов (мин)</label>
          <input type="number" className="form-input" value={settings.slot_step_minutes || 30} onChange={e => setSettings(p => ({ ...p, slot_step_minutes: parseInt(e.target.value) || 30 }))} />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Приветственный текст</label>
          <textarea className="form-input" rows={3} value={settings.welcome_text || ''} onChange={e => setSettings(p => ({ ...p, welcome_text: e.target.value }))} placeholder="Добро пожаловать! Выберите услугу для записи." />
        </div>
        <div className="form-group">
          <label className="form-label">Мин. часов до записи</label>
          <input type="number" className="form-input" value={settings.min_booking_hours || 2} onChange={e => setSettings(p => ({ ...p, min_booking_hours: parseInt(e.target.value) || 2 }))} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ marginTop: 16 }}>
        {savingSettings ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  );
}
