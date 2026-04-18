/**
 * Компонент опроса для ИИ Оформления — сфера, цвета, фото, стиль, контакт.
 */
import { useRef } from 'react';

const STYLES = [
  { id: 'минимализм', label: 'Минимализм' },
  { id: 'мультяшный', label: 'Мультяшный' },
  { id: 'реалистично', label: 'Реалистично' },
];
const DEFAULT_COLORS = ['#7B68EE', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6'];

export default function AiDesignSurvey({ survey, setSurvey, onSubmit, loading }) {
  const fileRef = useRef();
  const { niche, colors, photo, photoPreview, style, contactLink, description } = survey;

  // Обновление поля опроса
  const set = (key, val) => setSurvey(prev => ({ ...prev, [key]: val }));
  const addColor = () => set('colors', [...colors, '#000000']);
  const removeColor = (idx) => set('colors', colors.filter((_, i) => i !== idx));
  const updateColor = (idx, val) => { const n = [...colors]; n[idx] = val; set('colors', n); };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 20 }}>Опрос — оформление канала</h2>

      {/* Сфера */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Ваша сфера *</label>
        <input className="form-input" value={niche} onChange={e => set('niche', e.target.value)} placeholder="Например: фитнес, кулинария, IT..." />
      </div>

      {/* Цвета — палитра с возможностью добавления */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Цвета</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {colors.map((c, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <input type="color" value={c} onChange={e => updateColor(i, e.target.value)}
                style={{ width: 44, height: 44, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
              {colors.length > 1 && (
                <button onClick={() => removeColor(i)} style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                  border: 'none', background: 'var(--error, #e63946)', color: '#fff', fontSize: '0.7rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>&times;</button>
              )}
            </div>
          ))}
          <button onClick={addColor} style={{ width: 44, height: 44, borderRadius: 8, border: '2px dashed var(--border)',
            background: 'transparent', cursor: 'pointer', fontSize: '1.4rem', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {DEFAULT_COLORS.map(c => (
            <button key={c} onClick={() => { if (!colors.includes(c)) set('colors', [...colors, c]); }}
              style={{ width: 24, height: 24, borderRadius: 4, border: colors.includes(c) ? '2px solid #fff' : '1px solid var(--border)',
                background: c, cursor: 'pointer', opacity: colors.includes(c) ? 1 : 0.5 }} />
          ))}
        </div>
      </div>

      {/* Фото */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Фото (необязательно)</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn" onClick={() => fileRef.current?.click()} style={{ padding: '8px 16px' }}>Выбрать фото</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => {
            const f = e.target.files?.[0];
            if (f) { set('photo', f); set('photoPreview', URL.createObjectURL(f)); }
          }} style={{ display: 'none' }} />
          {photoPreview && <img src={photoPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
        </div>
      </div>

      {/* Стиль */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Стиль</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STYLES.map(s => (
            <button key={s.id} onClick={() => set('style', s.id)} className={`btn ${style === s.id ? 'btn-primary' : ''}`}
              style={{ padding: '8px 16px' }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Ссылка для связи */}
      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Ссылка для связи *</label>
        <input className="form-input" value={contactLink} onChange={e => set('contactLink', e.target.value)} placeholder="https://t.me/username или @username" />
      </div>

      {/* Дополнительные пожелания */}
      <div style={{ marginBottom: 24 }}>
        <label className="form-label">Описание (дополнительные пожелания)</label>
        <textarea className="form-input" value={description} onChange={e => set('description', e.target.value)}
          placeholder="Любые пожелания к оформлению..." rows={3} style={{ resize: 'vertical' }} />
      </div>

      <button className="btn btn-primary" onClick={onSubmit} disabled={loading} style={{ width: '100%', padding: '12px' }}>
        {loading ? 'Генерация...' : 'Сгенерировать'}
      </button>
    </div>
  );
}
