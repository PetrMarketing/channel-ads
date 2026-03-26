import Modal from '../../components/Modal';
import { api } from '../../services/api';

const SVC_EVENTS = [
  { type: 'booking_created', label: 'Создание записи', desc: 'Сообщение клиенту после бронирования' },
  { type: 'booking_reminder', label: 'Напоминание', desc: 'За час до записи' },
  { type: 'booking_changed', label: 'Изменение записи', desc: 'При переносе времени' },
  { type: 'booking_cancelled', label: 'Отмена записи', desc: 'При отмене записи' },
];

const EVENT_TITLES = {
  booking_created: 'Создание записи',
  booking_reminder: 'Напоминание',
  booking_changed: 'Изменение записи',
  booking_cancelled: 'Отмена записи',
};

export default function SvcNotificationsTab({
  svcNotifs, tc, showToast, loadSvcNotifs,
  editingSvcNotif, setEditingSvcNotif,
  svcNotifForm, setSvcNotifForm,
  savingSvcNotif, setSavingSvcNotif,
}) {
  return (
    <div className="pc-section">
      <h2>Уведомления</h2>
      <div className="pc-info-box">
        Настройка автоматических уведомлений клиентам через бота MAX.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {SVC_EVENTS.map(evt => {
          const existing = svcNotifs.find(n => n.event_type === evt.type);
          const isSet = !!(existing?.message_text?.trim());
          return (
            <div key={evt.type} style={{
              padding: 16, background: 'var(--bg-glass)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.9rem' }}>{evt.label}</strong>
                <span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                  background: isSet ? 'rgba(42,157,143,0.15)' : 'rgba(230,57,70,0.15)',
                  color: isSet ? '#2a9d8f' : '#e63946',
                }}>
                  {isSet ? 'Установлен' : 'Не задан'}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{evt.desc}</div>
              {isSet && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text)', maxHeight: 30, overflow: 'hidden' }}>
                  {existing.message_text.substring(0, 60)}{existing.message_text.length > 60 ? '...' : ''}
                </div>
              )}
              <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', width: '100%' }}
                  onClick={() => {
                    setEditingSvcNotif(evt.type);
                    setSvcNotifForm({ message_text: existing?.message_text || '', is_active: existing?.is_active ?? 1 });
                  }}
                >Редактировать</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Service Notification Edit Modal */}
      <Modal isOpen={!!editingSvcNotif} onClose={() => setEditingSvcNotif(null)} title={editingSvcNotif ? EVENT_TITLES[editingSvcNotif] || 'Уведомление' : 'Уведомление'}>
        {editingSvcNotif && (
          <div className="modal-form">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={svcNotifForm.is_active === 1 || svcNotifForm.is_active === true}
                onChange={e => setSvcNotifForm(p => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} />
              <span>Включено</span>
            </label>
            <div className="form-group">
              <label className="form-label">Текст сообщения</label>
              <textarea className="form-input" rows={5} value={svcNotifForm.message_text}
                onChange={e => setSvcNotifForm(p => ({ ...p, message_text: e.target.value }))}
                placeholder="Здравствуйте! Ваша запись подтверждена на {date} в {time}." />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Переменные: {'{client_name}'}, {'{date}'}, {'{time}'}, {'{service}'}, {'{specialist}'}
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={savingSvcNotif}
              onClick={async () => {
                setSavingSvcNotif(true);
                try {
                  await api.post(`/services/${tc}/notification-templates`, {
                    event_type: editingSvcNotif,
                    message_text: svcNotifForm.message_text,
                    is_active: svcNotifForm.is_active,
                  });
                  showToast('Уведомление сохранено');
                  setEditingSvcNotif(null);
                  loadSvcNotifs();
                } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                finally { setSavingSvcNotif(false); }
              }}
            >{savingSvcNotif ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
