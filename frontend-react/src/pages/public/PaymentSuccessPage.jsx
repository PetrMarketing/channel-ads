import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  const redirectUrl = searchParams.get('redirect') || '/billing';

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate(redirectUrl);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate, redirectUrl]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '48px', maxWidth: '450px',
        width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '16px' }}>&#10003;</div>
        <h2 style={{ marginBottom: '10px', color: 'var(--success)' }}>Оплата прошла успешно!</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
          Спасибо за оплату. Ваша подписка активирована.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Перенаправление через {countdown} сек...
        </p>
        <button className="btn btn-primary btn-large" onClick={() => navigate(redirectUrl)}>
          Перейти сейчас
        </button>
      </div>
    </div>
  );
}
