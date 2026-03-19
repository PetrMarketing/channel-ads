import { useState, useEffect } from 'react';

export default function ButtonBuilder({ value, onChange, leadMagnets = [], showLeadMagnet = true }) {
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
            <select className="form-input" value={btn.type || 'url'} style={{ width: 'auto', minWidth: '120px' }}
              onChange={e => updateButton(idx, 'type', e.target.value)}>
              <option value="url">Ссылка</option>
              {showLeadMagnet && <option value="lead_magnet">Лид-магнит</option>}
            </select>
            {(btn.type || 'url') === 'url' ? (
              <input className="form-input" placeholder="https://..." value={btn.url || ''}
                onChange={e => updateButton(idx, 'url', e.target.value)} style={{ flex: 1 }} />
            ) : (
              <select className="form-input" value={btn.lead_magnet_id || ''} style={{ flex: 1 }}
                onChange={e => updateButton(idx, 'lead_magnet_id', e.target.value)}>
                <option value="">-- Выберите лид-магнит --</option>
                {leadMagnets.map(lm => (
                  <option key={lm.id} value={lm.id}>{lm.title} ({lm.code})</option>
                ))}
              </select>
            )}
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
