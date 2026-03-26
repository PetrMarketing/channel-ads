import { Fragment } from 'react';
import Modal from '../../components/Modal';
import { api } from '../../services/api';
import { STATUS_COLORS, STATUS_LABELS } from './constants';

export default function BookingsTab({
  bookings, specialists, services, tc, showToast, btnSmall,
  bookingDateStart, setBookingDateStart,
  bookingStatus, setBookingStatus,
  bookingSpecialist, setBookingSpecialist,
  updateBookingStatus, loadBookings,
  showManualBooking, setShowManualBooking,
  manualBookingForm, setManualBookingForm,
  savingManualBooking, setSavingManualBooking,
}) {
  // Generate 7 days starting from bookingDateStart
  const startD = new Date(bookingDateStart + 'T00:00:00');
  const calDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startD);
    d.setDate(d.getDate() + i);
    calDays.push(d.toISOString().split('T')[0]);
  }
  // Time slots from 08:00 to 21:00
  const timeSlots = [];
  for (let h = 8; h <= 21; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`);
  }
  // Group bookings by date+time
  const bookingMap = {};
  bookings.forEach(b => {
    const key = `${b.booking_date}_${b.start_time?.slice(0, 5)}`;
    if (!bookingMap[key]) bookingMap[key] = [];
    bookingMap[key].push(b);
  });

  return (
    <div className="pc-section">
      <h2>Бронирования</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-outline" style={btnSmall} onClick={() => {
          const d = new Date(bookingDateStart);
          d.setDate(d.getDate() - 7);
          setBookingDateStart(d.toISOString().split('T')[0]);
        }}>&larr;</button>
        <input type="date" className="form-input" style={{ maxWidth: 180 }} value={bookingDateStart} onChange={e => setBookingDateStart(e.target.value)} />
        <button className="btn btn-outline" style={btnSmall} onClick={() => {
          const d = new Date(bookingDateStart);
          d.setDate(d.getDate() + 7);
          setBookingDateStart(d.toISOString().split('T')[0]);
        }}>&rarr;</button>
        <button className="btn btn-outline" style={btnSmall} onClick={() => setBookingDateStart(new Date().toISOString().split('T')[0])}>Сегодня</button>
        <select className="form-input" style={{ maxWidth: 160 }} value={bookingStatus} onChange={e => setBookingStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 200 }} value={bookingSpecialist} onChange={e => setBookingSpecialist(e.target.value)}>
          <option value="">Все специалисты</option>
          {specialists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Calendar grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${calDays.length}, minmax(120px, 1fr))`, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem' }}>
          {/* Header row */}
          <div style={{ padding: '8px 4px', fontWeight: 600, borderBottom: '1px solid var(--border)', background: 'var(--bg-glass)', textAlign: 'center' }}></div>
          {calDays.map(day => {
            const d = new Date(day + 'T00:00:00');
            const isToday = day === new Date().toISOString().split('T')[0];
            return (
              <div key={day} style={{
                padding: '8px 4px', fontWeight: 600, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                background: isToday ? 'rgba(42,170,238,0.08)' : 'var(--bg-glass)', textAlign: 'center',
              }}>
                <div>{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</div>
                <div style={{ fontSize: '0.85rem' }}>{d.getDate()}.{String(d.getMonth() + 1).padStart(2, '0')}</div>
              </div>
            );
          })}
          {/* Time rows */}
          {timeSlots.map(time => (
            <Fragment key={`row-${time}`}>
              <div style={{ padding: '6px 4px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                {time}
              </div>
              {calDays.map(day => {
                const key = `${day}_${time}`;
                const cellBookings = bookingMap[key] || [];
                const nextH = parseInt(time.split(':')[0]);
                const endTime = `${String(nextH + 1).padStart(2, '0')}:00`;
                return (
                  <div key={key} className={`booking-cell${cellBookings.length ? ' has-bookings' : ''}`} style={{
                    padding: '2px 4px', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                    minHeight: 36,
                  }}
                    onClick={() => {
                      if (!cellBookings.length) {
                        setManualBookingForm(f => ({ ...f, booking_date: day, start_time: time, end_time: endTime, specialist_id: bookingSpecialist || '', service_id: '', client_name: '', client_phone: '', notes: '' }));
                        setShowManualBooking(true);
                      }
                    }}
                  >
                    {cellBookings.map(b => (
                      <div key={b.id} className="booking-item" style={{
                        padding: '2px 4px', borderRadius: 3, fontSize: '0.7rem', marginBottom: 1,
                        background: `${STATUS_COLORS[b.status] || '#888'}20`, borderLeft: `3px solid ${STATUS_COLORS[b.status] || '#888'}`,
                        cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }} title={`${b.client_name || 'Клиент'} — ${b.service_name || ''} (${b.start_time?.slice(0,5)}–${b.end_time?.slice(0,5)})`}
                        onClick={e => {
                          e.stopPropagation();
                          setManualBookingForm({
                            booking_date: b.booking_date || day,
                            start_time: b.start_time?.slice(0,5) || time,
                            end_time: b.end_time?.slice(0,5) || endTime,
                            specialist_id: b.specialist_id ? String(b.specialist_id) : '',
                            service_id: b.service_id ? String(b.service_id) : '',
                            client_name: b.client_name || '',
                            client_phone: b.client_phone || '',
                            notes: b.notes || '',
                            _editId: b.id,
                          });
                          setShowManualBooking(true);
                        }}>
                        <strong>{b.client_name || 'Клиент'}</strong>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{b.service_name || ''}</div>
                        <div className="item-edit-btn">Редактировать</div>
                      </div>
                    ))}
                    <div className="cell-add-btn">+ Запись</div>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* List view below */}
      {bookings.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Список бронирований</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${STATUS_COLORS[b.status] || '#888'}` }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', minWidth: 100 }}>
                  {b.start_time?.slice(0, 5)} – {b.end_time?.slice(0, 5)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{b.client_name || 'Клиент'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {b.service_name || ''} {b.specialist_name ? `· ${b.specialist_name}` : ''}
                    {b.booking_date && ` · ${new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU')}`}
                  </div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, background: `${STATUS_COLORS[b.status]}20`, color: STATUS_COLORS[b.status] }}>
                  {STATUS_LABELS[b.status] || b.status}
                </span>
                <select className="form-input" style={{ maxWidth: 140, fontSize: '0.8rem', padding: '4px 8px' }} value={b.status} onChange={e => updateBookingStatus(b.id, e.target.value)}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Booking Modal */}
      <Modal isOpen={showManualBooking} onClose={() => setShowManualBooking(false)} title={manualBookingForm._editId ? 'Редактировать запись' : 'Новая запись'}>
        <div className="modal-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Дата</label><input type="date" className="form-input" value={manualBookingForm.booking_date} onChange={e => setManualBookingForm(p => ({ ...p, booking_date: e.target.value }))} /></div>
            <div className="form-group"><label>Начало</label><input type="time" className="form-input" value={manualBookingForm.start_time} onChange={e => setManualBookingForm(p => ({ ...p, start_time: e.target.value }))} /></div>
            <div className="form-group"><label>Конец</label><input type="time" className="form-input" value={manualBookingForm.end_time} onChange={e => setManualBookingForm(p => ({ ...p, end_time: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Имя клиента *</label><input className="form-input" value={manualBookingForm.client_name} onChange={e => setManualBookingForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Иван Иванов" /></div>
          <div className="form-group"><label>Телефон</label><input className="form-input" value={manualBookingForm.client_phone} onChange={e => setManualBookingForm(p => ({ ...p, client_phone: e.target.value }))} placeholder="+7..." /></div>
          <div className="form-group">
            <label>Специалист</label>
            <select className="form-input" value={manualBookingForm.specialist_id} onChange={e => setManualBookingForm(p => ({ ...p, specialist_id: e.target.value }))}>
              <option value="">Не выбран</option>
              {specialists.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Услуга</label>
            <select className="form-input" value={manualBookingForm.service_id} onChange={e => setManualBookingForm(p => ({ ...p, service_id: e.target.value }))}>
              <option value="">Не выбрана</option>
              {services.map(s => <option key={s.id} value={String(s.id)}>{s.name} — {Number(s.price).toLocaleString('ru-RU')} ₽</option>)}
            </select>
          </div>
          <div className="form-group"><label>Заметка</label><textarea className="form-input" rows={2} value={manualBookingForm.notes} onChange={e => setManualBookingForm(p => ({ ...p, notes: e.target.value }))} /></div>
          {manualBookingForm._editId && (
            <div className="form-group">
              <label>Статус</label>
              <select className="form-input" value={manualBookingForm.status || 'confirmed'} onChange={e => setManualBookingForm(p => ({ ...p, status: e.target.value }))}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={savingManualBooking}
              onClick={async () => {
                if (!manualBookingForm.client_name.trim()) { showToast('Укажите имя клиента', 'error'); return; }
                setSavingManualBooking(true);
                try {
                  const { _editId, ...rest } = manualBookingForm;
                  const payload = {
                    ...rest,
                    specialist_id: rest.specialist_id ? parseInt(rest.specialist_id) : null,
                    service_id: rest.service_id ? parseInt(rest.service_id) : null,
                  };
                  if (_editId) {
                    await api.put(`/services/${tc}/bookings/${_editId}`, payload);
                    showToast('Запись обновлена');
                  } else {
                    payload.status = 'confirmed';
                    await api.post(`/services/${tc}/bookings`, payload);
                    showToast('Запись создана');
                  }
                  setShowManualBooking(false);
                  setManualBookingForm({ booking_date: '', start_time: '', end_time: '', client_name: '', client_phone: '', specialist_id: '', service_id: '', notes: '' });
                  loadBookings();
                } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                finally { setSavingManualBooking(false); }
              }}
            >{savingManualBooking ? 'Сохранение...' : (manualBookingForm._editId ? 'Сохранить' : 'Создать запись')}</button>
            {manualBookingForm._editId && (
              <button className="btn btn-danger" disabled={savingManualBooking}
                onClick={async () => {
                  if (!window.confirm('Удалить запись?')) return;
                  setSavingManualBooking(true);
                  try {
                    await api.delete(`/services/${tc}/bookings/${manualBookingForm._editId}`);
                    showToast('Запись удалена');
                    setShowManualBooking(false);
                    loadBookings();
                  } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                  finally { setSavingManualBooking(false); }
                }}
              >Удалить</button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
