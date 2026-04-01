import { useState, useEffect } from 'react';

export default function ButtonBuilder({ value, onChange, leadMagnets = [], showLeadMagnet = true, showComments = true }) {
  const [buttons, setButtons] = useState([]);

  useEffect(() => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : (value || []);
      if (Array.isArray(parsed)) setButtons(parsed);
    } catch {
      setButtons([]);
    }
  }, []);

  const emit = (updated) => {
    setButtons(updated);
    onChange(updated.length > 0 ? JSON.stringify(updated) : '');
  };

  const addButton = () => {
    emit([...buttons, { text: '', type: 'url', url: '', lead_magnet_id: '' }]);
  };

  const removeButton = (idx) => {
    emit(buttons.filter((_, i) => i !== idx));
  };

  const updateButton = (idx, field, val) => {
    const updated = buttons.map((b, i) => i === idx ? { ...b, [field]: val } : b);
    emit(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {buttons.map((btn, idx) => (
        <div key={idx} style={{
          padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="Текст кнопки"
              value={btn.text}
              onChange={e => updateButton(idx, 'text', e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
              onClick={() => removeButton(idx)}>x</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select className="form-input" value={btn.type || 'url'} style={{ width: 'auto', minWidth: '140px' }}
              onChange={e => {
                const newType = e.target.value;
                const updated = buttons.map((b, i) => {
                  if (i !== idx) return b;
                  const patch = { ...b, type: newType };
                  if (newType === 'comments') {
                    patch.text = patch.text || 'Комментарии';
                    patch.url = '';
                    patch.lead_magnet_id = '';
                  }
                  return patch;
                });
                emit(updated);
              }}>
              <option value="url">Ссылка</option>
              {showLeadMagnet && <option value="lead_magnet">Лид-магнит</option>}
              {showComments && <option value="comments">Комментарии</option>}
            </select>
            {(btn.type || 'url') === 'url' ? (() => {
              const urlVal = (btn.url || '').trim();
              const isInvalid = urlVal.length > 0 && !/^https?:\/\//i.test(urlVal);
              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <input className={`form-input${isInvalid ? ' field-error' : ''}`} placeholder="https://..." value={btn.url || ''}
                    onChange={e => updateButton(idx, 'url', e.target.value)} />
                  {isInvalid && <span style={{ fontSize: '0.72rem', color: 'var(--error, #e63946)' }}>Введите ссылку, начинающуюся с http:// или https://</span>}
                </div>
              );
            })() : btn.type === 'lead_magnet' ? (
              <select className="form-input" value={btn.lead_magnet_id || ''} style={{ flex: 1 }}
                onChange={e => updateButton(idx, 'lead_magnet_id', e.target.value)}>
                <option value="">-- Выберите лид-магнит --</option>
                {leadMagnets.map(lm => (
                  <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                ))}
              </select>
            ) : btn.type === 'comments' ? (
              <div style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 6 }}>
                💬 Откроет мини-приложение с комментариями к посту
              </div>
            ) : null}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}
        onClick={addButton}>
        + Добавить кнопку
      </button>
    </div>
  );
}
