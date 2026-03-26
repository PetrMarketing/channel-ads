export default function ChatsTab({ chats, deleteChat, onAddChat }) {
  return (
    <div className="pc-section">
      <h2>Подключённые чаты</h2>
      <div className="pc-info-box">
        <strong>Как подключить платный чат:</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
          <li>Создайте закрытый чат/группу</li>
          <li>Добавьте бота <b>администратором</b> в чат</li>
          <li>Бот пришлёт уведомление — нажмите «Добавить чат» ниже</li>
          <li>Выберите чат из списка</li>
        </ol>
      </div>
      <button className="btn btn-primary" onClick={onAddChat} style={{ marginBottom: 16 }}>
        + Добавить чат
      </button>
      {chats.length === 0 && <p className="pc-empty">Чатов пока нет. Добавьте первый платный чат.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {chats.map(c => {
          const platformColor = c.platform === 'max' ? '#7B68EE' : '#2AABEE';
          const firstLetter = (c.title || c.chat_id || 'Ч')[0].toUpperCase();
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', background: 'var(--bg-glass)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                background: platformColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', fontWeight: 700,
              }}>
                {firstLetter}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{c.title || c.chat_id}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: platformColor, color: '#fff' }}>
                    {c.platform === 'max' ? 'MAX' : 'TG'}
                  </span>
                  <span className="pc-badge info" style={{ fontSize: '0.72rem' }}>{c.active_members || 0} участников</span>
                  <span className={`pc-badge ${c.is_active ? 'success' : 'warning'}`} style={{ fontSize: '0.72rem' }}>
                    {c.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
              </div>
              <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem', flexShrink: 0 }} onClick={() => deleteChat(c)}>
                Удалить
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
