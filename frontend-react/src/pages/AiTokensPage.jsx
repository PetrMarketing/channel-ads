import { useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

const AI_PLANS = [
  { id: 1, tokens: 100, price: 300 },
  { id: 2, tokens: 300, price: 800, originalPrice: 900, discount: 11 },
  { id: 3, tokens: 1000, price: 2550, originalPrice: 3000, discount: 15 },
];

export default function AiTokensPage() {
  const { showToast } = useToast();
  const [buying, setBuying] = useState(false);
  const [email, setEmail] = useState('');

  const handleBuy = async (plan) => {
    if (!email) { showToast('Введите email для чека', 'error'); return; }
    setBuying(true);
    try {
      const data = await api.post('/billing/ai-tokens/buy', { plan_id: plan.id, email });
      if (data.success && data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        showToast(data.detail || 'Ошибка', 'error');
      }
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
    finally { setBuying(false); }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>ИИ Токены</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 24 }}>
        Токены используются для генерации контента с помощью ИИ: аватарки, описания канала, контент-планы, публикации.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
        {AI_PLANS.map(plan => (
          <div key={plan.id} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '24px 20px', textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {plan.discount && (
              <div style={{
                position: 'absolute', top: 10, right: -30, background: '#ef4444', color: '#fff',
                padding: '3px 34px', fontSize: '0.72rem', fontWeight: 700, transform: 'rotate(45deg)',
              }}>-{plan.discount}%</div>
            )}
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#7B68EE' }}>{plan.tokens}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 12 }}>токенов</div>
            {plan.originalPrice && (
              <div style={{ fontSize: '0.88rem', color: '#aaa', textDecoration: 'line-through' }}>
                {plan.originalPrice.toLocaleString('ru-RU')} ₽
              </div>
            )}
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
              {plan.price.toLocaleString('ru-RU')} ₽
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              {(plan.price / plan.tokens).toFixed(1)} ₽ за токен
            </div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '10px' }} disabled={buying}
              onClick={() => handleBuy(plan)}>
              {buying ? 'Оплата...' : 'Купить'}
            </button>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px', maxWidth: 400,
      }}>
        <label className="form-label">Email для чека</label>
        <input className="form-input" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com" type="email" />
      </div>
    </div>
  );
}
