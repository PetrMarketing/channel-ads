export default function MembersTab({ members, chats, memberChatFilter, setMemberChatFilter, memberStatusFilter, setMemberStatusFilter }) {
  return (
    <div className="pc-section">
      <h2>Участники</h2>
      <div className="pc-filters">
        <select value={memberChatFilter} onChange={e => setMemberChatFilter(e.target.value)}>
          <option value="">Все чаты</option>
          {chats.map(c => <option key={c.id} value={c.id}>{c.title || c.chat_id}</option>)}
        </select>
        <select value={memberStatusFilter} onChange={e => setMemberStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="expired">Истекшие</option>
          <option value="cancelled">Отменённые</option>
        </select>
      </div>
      {members.length === 0 && <p className="pc-empty">Участников пока нет.</p>}
      {members.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="pc-members-table-wrap pc-desktop-only">
            <table className="pc-members-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Чат</th>
                  <th>Тариф</th>
                  <th>Оплата</th>
                  <th>Статус</th>
                  <th>Истекает</th>
                  <th>Ссылка</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                      {m.username && <div className="pc-text-muted">@{m.username}</div>}
                    </td>
                    <td>{m.chat_title || '—'}</td>
                    <td>
                      {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}
                      {m.price && <div className="pc-text-muted">{Number(m.price).toLocaleString('ru-RU')} RUB</div>}
                    </td>
                    <td>{m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} RUB` : '—'}</td>
                    <td>
                      <span className={`pc-badge ${m.status === 'active' ? 'success' : m.status === 'expired' ? 'warning' : 'danger'}`}>
                        {m.status === 'active' ? 'Активен' : m.status === 'expired' ? 'Истёк' : m.status === 'cancelled' ? 'Отменён' : m.status}
                      </span>
                    </td>
                    <td>{m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}</td>
                    <td>{m.invite_link ? <a href={m.invite_link} target="_blank" rel="noreferrer" className="pc-text-muted" style={{fontSize: 12}}>Ссылка</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Mobile cards */}
          <div className="pc-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {members.map(m => (
              <div key={m.id} className="pc-member-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <strong>{m.first_name || m.username || m.telegram_id || m.max_user_id}</strong>
                    {m.username && <span className="pc-text-muted" style={{ marginLeft: 6 }}>@{m.username}</span>}
                  </div>
                  <span className={`pc-badge ${m.status === 'active' ? 'success' : m.status === 'expired' ? 'warning' : 'danger'}`}>
                    {m.status === 'active' ? 'Активен' : m.status === 'expired' ? 'Истёк' : m.status === 'cancelled' ? 'Отменён' : m.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Чат: {m.chat_title || '—'}</span>
                  <span>Тариф: {m.plan_title || (m.plan_type === 'one_time' ? 'Разовая' : 'Подписка')}</span>
                  <span>Оплата: {m.amount_paid ? `${Number(m.amount_paid).toLocaleString('ru-RU')} ₽` : '—'}</span>
                  <span>До: {m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : 'Бессрочно'}</span>
                </div>
                {m.invite_link && (
                  <a href={m.invite_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', marginTop: 6, display: 'inline-block' }}>Инвайт-ссылка</a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
