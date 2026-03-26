import { DAYS } from './constants';

export default function WorkingHoursEditor({ value, onChange }) {
  const hours = value || {};
  const toggleDay = (dayId) => {
    const updated = { ...hours };
    if (updated[dayId]) { delete updated[dayId]; } else { updated[dayId] = { from: '09:00', to: '18:00' }; }
    onChange(updated);
  };
  const updateTime = (dayId, field, val) => {
    onChange({ ...hours, [dayId]: { ...hours[dayId], [field]: val } });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {DAYS.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, width: 50, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!hours[d.id]} onChange={() => toggleDay(d.id)} />
            {d.label}
          </label>
          {hours[d.id] ? (
            <>
              <input type="time" className="form-input" style={{ width: 110, padding: '4px 8px', fontSize: '0.82rem' }}
                value={hours[d.id].from || '09:00'} onChange={e => updateTime(d.id, 'from', e.target.value)} />
              <span style={{ fontSize: '0.82rem' }}>—</span>
              <input type="time" className="form-input" style={{ width: 110, padding: '4px 8px', fontSize: '0.82rem' }}
                value={hours[d.id].to || '18:00'} onChange={e => updateTime(d.id, 'to', e.target.value)} />
            </>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Выходной</span>
          )}
        </div>
      ))}
    </div>
  );
}
