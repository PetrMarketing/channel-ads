export default function PlansTab({ setup, plans, openPlanCreate, openPlanEdit, deletePlan }) {
  return (
    <div className="pc-section">
      <h2>Тарифы</h2>
      {!setup.has_payment && (
        <div className="pc-info-box warning">
          Сначала подключите платёжную систему на вкладке «Оплата».
        </div>
      )}
      {setup.has_payment && (
        <>
          <div className="pc-info-box">
            <strong>Инструкция по тарифам:</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
              <li><b>Разовая оплата</b> — пользователь платит один раз и получает доступ навсегда</li>
              <li><b>Регулярная подписка</b> — выберите срок и стоимость. По истечении доступ закрывается</li>
            </ul>
          </div>
          <button className="btn btn-primary" onClick={openPlanCreate} style={{ marginBottom: 16 }}>
            + Новый тариф
          </button>
          {plans.length === 0 && <p className="pc-empty">Тарифов пока нет. Создайте первый тариф.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {plans.map(p => (
              <div key={p.id} style={{
                padding: 16, background: 'var(--bg-glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ fontSize: '0.95rem' }}>{p.title || (p.plan_type === 'one_time' ? 'Разовая оплата' : `Подписка на ${p.duration_days} дн.`)}</strong>
                  <span className={`pc-badge ${p.plan_type === 'recurring' ? 'info' : 'success'}`}>
                    {p.plan_type === 'recurring' ? 'Регулярная' : 'Разовая'}
                  </span>
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary, #2AABEE)' }}>
                  {Number(p.price).toLocaleString('ru-RU')} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.currency || 'RUB'}</span>
                </div>
                {p.plan_type === 'recurring' && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Срок: {p.duration_days} дн.</div>
                )}
                {p.description && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.description}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '0.82rem', flex: 1 }} onClick={() => openPlanEdit(p)}>Редактировать</button>
                  <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => deletePlan(p)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
