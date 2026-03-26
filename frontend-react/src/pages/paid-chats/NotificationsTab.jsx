import { EVENT_LABELS } from './constants';

export default function NotificationsTab({ notifForms, setEditingNotifType }) {
  return (
    <div className="pc-section">
      <h2>Уведомления</h2>
      <div className="pc-info-box">
        <strong>Настройка уведомлений:</strong>
        <ul>
          <li><b>Перед подпиской</b> — описание канала, что получит пользователь</li>
          <li><b>После подписки</b> — приветственное сообщение после оплаты</li>
          <li><b>За 3 дня до конца</b> — напоминание о скором окончании подписки</li>
          <li><b>За 1 день до конца</b> — последнее напоминание перед отключением</li>
        </ul>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {Object.entries(EVENT_LABELS).map(([eventType, label]) => {
          const form = notifForms[eventType] || { message_text: '', is_active: 1 };
          const isSet = !!(form.message_text && form.message_text.trim());
          return (
            <div key={eventType} style={{
              padding: 16, background: 'var(--bg-glass)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: '0.9rem' }}>{label}</strong>
                <span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                  background: isSet ? 'rgba(42,157,143,0.15)' : 'rgba(230,57,70,0.15)',
                  color: isSet ? '#2a9d8f' : '#e63946',
                }}>
                  {isSet ? 'Установлен' : 'Не задан'}
                </span>
              </div>
              {isSet && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxHeight: 40, overflow: 'hidden', lineHeight: 1.4 }}
                  dangerouslySetInnerHTML={{ __html: form.message_text.substring(0, 80) + (form.message_text.length > 80 ? '...' : '') }}
                />
              )}
              {form.file_path && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>📎 Изображение прикреплено</div>}
              <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', width: '100%' }} onClick={() => setEditingNotifType(eventType)}>
                  Редактировать
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
