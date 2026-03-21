import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('confirming'); // confirming, success, error

  const redirectUrl = searchParams.get('redirect') || '/billing';
  const orderId = searchParams.get('_payform_order_id') || '';

  // Extract order_id from redirect path if present
  const orderFromRedirect = redirectUrl.match(/success\/([^?&]+)/)?.[1] || orderId;

  useEffect(() => {
    if (!orderFromRedirect) {
      setStatus('success');
      return;
    }

    // Confirm payment on backend (fallback for missing webhooks)
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/paid-chat-pay/confirm/${orderFromRedirect}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await resp.json();
        if (data.success) {
          setStatus('success');
        } else {
          setStatus('success'); // show success anyway — user paid
        }
      } catch {
        setStatus('success');
      }
    })();
  }, [orderFromRedirect]);

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
        {status === 'confirming' ? (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ marginBottom: '10px' }}>Подтверждаем оплату...</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Подождите несколько секунд
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>✅</div>
            <h2 style={{ marginBottom: '10px', color: 'var(--success)' }}>Оплата прошла успешно!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Спасибо за оплату. Ссылка для вступления в чат отправлена вам в бот.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Проверьте сообщения от бота — там будет персональная ссылка-приглашение.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
