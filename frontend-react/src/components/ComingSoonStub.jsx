import React from 'react';

/** Заглушка «раздел скоро появится» — единый стиль для всех мест.
 *  Используется когда feature_visibility[key].visibility === 'coming_soon'.
 */
export default function ComingSoonStub({ title = 'Раздел', message, icon = '🚀' }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: '60px 30px',
      textAlign: 'center',
      border: '1px solid rgba(67,97,238,0.10)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
    }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
      <h2 style={{
        fontSize: '1.4rem', fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px',
      }}>{title}</h2>
      <p style={{
        color: '#666', fontSize: '0.95rem', maxWidth: 480, margin: '0 auto', lineHeight: 1.5,
      }}>
        {message || 'Этот раздел скоро появится. Мы уже работаем над ним.'}
      </p>
      <div style={{
        marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 999,
        background: 'rgba(245,158,11,0.10)', color: '#d97706',
        fontSize: '0.82rem', fontWeight: 600,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />
        Скоро
      </div>
    </div>
  );
}
