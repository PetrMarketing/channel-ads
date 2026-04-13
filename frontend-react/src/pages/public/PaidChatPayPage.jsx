import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Loading from '../../components/Loading';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function apiFetch(url, options = {}) {
  const resp = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await resp.json();
  if (!resp.ok && !data.success) throw new Error(data.error || data.detail || 'Ошибка');
  return data;
}

export default function PaidChatPayPage() {
  const { tc } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  // Selection
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);

  // User info
  const [platform, setPlatform] = useState('telegram');
  const [contactId, setContactId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [username, setUsername] = useState('');

  // Payment state
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [orderId, setOrderId] = useState(null);
  const [paymentDone, setPaymentDone] = useState(false);

  const loadInfo = useCallback(async () => {
    if (!tc) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/paid-chat-pay/${tc}/info`);
      if (data.success) {
        setInfo(data);
        if (data.plans?.length === 1) setSelectedPlan(data.plans[0]);
        if (data.chats?.length === 1) setSelectedChat(data.chats[0]);
      } else {
        setError(data.error || 'Не найдено');
      }
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [tc]);

  // Parse URL params for auto-fill
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const autoFilled = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('platform');
    const tid = params.get('tid');
    const mid = params.get('mid');
    const name = params.get('name');
    const user = params.get('user');
    const ph = params.get('phone');
    const em = params.get('email');
    if (p) setPlatform(p);
    if (tid) setContactId(tid);
    if (ph) setPhone(ph);
    if (em) setEmail(em);
    if (mid) setContactId(mid);
    if (name) setFirstName(name);
    if (user) setUsername(user);
    if (tid || mid) autoFilled.current = true;
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // Auto-submit when all data is pre-filled from URL
  // Auto-fill fields from URL but do NOT auto-submit — let user review and click Pay

  // Poll for payment status after redirect back
  useEffect(() => {
    if (!orderId || paymentDone) return;
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch(`/paid-chat-pay/status/${orderId}`);
        if (data.paid) {
          setPaymentDone(true);
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [orderId, paymentDone]);

  const handlePay = async () => {
    setPayError('');
    if (!selectedPlan) { setPayError('Выберите тариф'); return; }
    if (!selectedChat) { setPayError('Выберите чат'); return; }
    if (!contactId.trim()) {
      setPayError(platform === 'telegram' ? 'Укажите ваш Telegram ID' : 'Укажите ваш MAX ID');
      return;
    }

    setPaying(true);
    try {
      const body = {
        plan_id: selectedPlan.id,
        paid_chat_id: selectedChat.id,
        platform,
        username: username.trim(),
        first_name: firstName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
      if (platform === 'telegram') {
        body.telegram_id = parseInt(contactId.trim(), 10);
      } else {
        body.max_user_id = contactId.trim();
      }

      const data = await apiFetch(`/paid-chat-pay/${tc}/create`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (data.success && data.payment_url) {
        setOrderId(data.order_id);
        window.location.href = data.payment_url;
      } else {
        setPayError(data.error || 'Не удалось создать платёж');
      }
    } catch (e) {
      setPayError(e.message || 'Ошибка оплаты');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div style={styles.page}><Loading /></div>
  );

  if (error) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={{ color: 'var(--error, #e74c3c)', marginBottom: 8 }}>Ошибка</h2>
        <p style={styles.muted}>{error}</p>
      </div>
    </div>
  );

  if (paymentDone) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>&#10003;</div>
        <h2 style={{ color: 'var(--success, #27ae60)', marginBottom: 8 }}>Оплата прошла!</h2>
        <p style={styles.muted}>
          Спасибо за оплату! Ссылка-приглашение отправлена вам в личные сообщения бота.
        </p>
      </div>
    </div>
  );

  const channel = info?.channel;
  const plans = info?.plans || [];
  const chats = info?.chats || [];
  const description = info?.description || '';

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 520 }}>
        {/* Header */}
        <h2 style={{ fontSize: '1.3rem', marginBottom: 4 }}>
          {channel?.title || 'Платный чат'}
        </h2>
        {description && (
          <p style={{ ...styles.muted, marginBottom: 20 }}>{description}</p>
        )}

        {/* Plans */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Выберите тариф</h3>
          <div style={styles.grid}>
            {plans.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p)}
                style={{
                  ...styles.selectCard,
                  borderColor: selectedPlan?.id === p.id ? 'var(--primary, #3498db)' : 'var(--border, #333)',
                  background: selectedPlan?.id === p.id ? 'var(--primary-alpha, rgba(52,152,219,0.1))' : 'var(--bg-glass, #1a1a2e)',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>{p.title || (p.plan_type === 'one_time' ? 'Разовая' : `Подписка ${p.duration_days} дн.`)}</strong>
                <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {Number(p.price).toLocaleString('ru-RU')} {p.currency || 'RUB'}
                </span>
                {p.plan_type === 'recurring' && (
                  <span style={{ ...styles.muted, fontSize: '0.78rem', display: 'block', marginTop: 4 }}>
                    на {p.duration_days} дней
                  </span>
                )}
                {p.plan_type === 'one_time' && (
                  <span style={{ ...styles.muted, fontSize: '0.78rem', display: 'block', marginTop: 4 }}>
                    навсегда
                  </span>
                )}
                {p.description && (
                  <span style={{ ...styles.muted, fontSize: '0.78rem', display: 'block', marginTop: 4 }}>
                    {p.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chats (only if multiple) */}
        {chats.length > 1 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Выберите чат</h3>
            <div style={styles.grid}>
              {chats.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChat(c)}
                  style={{
                    ...styles.selectCard,
                    borderColor: selectedChat?.id === c.id ? 'var(--primary, #3498db)' : 'var(--border, #333)',
                    background: selectedChat?.id === c.id ? 'var(--primary-alpha, rgba(52,152,219,0.1))' : 'var(--bg-glass, #1a1a2e)',
                  }}
                >
                  <strong>{c.title || c.username || 'Чат'}</strong>
                  {c.username && <span style={styles.muted}>@{c.username}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User info */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Ваши данные</h3>

          <div style={styles.formGroup}>
            <label style={styles.label}>Платформа</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPlatform('telegram')}
                style={{
                  ...styles.toggleBtn,
                  background: platform === 'telegram' ? 'var(--primary, #3498db)' : 'transparent',
                  color: platform === 'telegram' ? '#fff' : 'var(--text, #ccc)',
                }}
              >Telegram</button>
              <button
                onClick={() => setPlatform('max')}
                style={{
                  ...styles.toggleBtn,
                  background: platform === 'max' ? 'var(--primary, #3498db)' : 'transparent',
                  color: platform === 'max' ? '#fff' : 'var(--text, #ccc)',
                }}
              >MAX</button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              {platform === 'telegram' ? 'Ваш Telegram ID *' : 'Ваш MAX ID *'}
            </label>
            <input
              type="text"
              value={contactId}
              onChange={e => setContactId(e.target.value)}
              placeholder={platform === 'telegram' ? 'Например: 123456789' : 'Ваш MAX ID'}
              style={styles.input}
            />
            <span style={{ ...styles.muted, fontSize: '0.75rem' }}>
              {platform === 'telegram'
                ? 'Узнать можно у @userinfobot в Telegram'
                : 'Узнать можно в настройках MAX'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>Имя</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Имя"
                style={styles.input}
              />
            </div>
            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="@username"
                style={styles.input}
              />
            </div>
          </div>
        </div>

        {/* Summary & pay */}
        {selectedPlan && (
          <div style={{ ...styles.section, background: 'var(--bg-glass, #1a1a2e)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span>Тариф:</span>
              <strong>{selectedPlan.title || 'Подписка'}</strong>
            </div>
            {selectedChat && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span>Чат:</span>
                <strong>{selectedChat.title || selectedChat.username || 'Чат'}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem' }}>
              <span>К оплате:</span>
              <strong style={{ color: 'var(--primary, #3498db)' }}>
                {Number(selectedPlan.price).toLocaleString('ru-RU')} {selectedPlan.currency || 'RUB'}
              </strong>
            </div>
          </div>
        )}

        {payError && (
          <div style={{ color: 'var(--error, #e74c3c)', fontSize: '0.88rem', marginTop: 12 }}>
            {payError}
          </div>
        )}

        {info?.privacy_policy_url && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #888)', textAlign: 'center', marginTop: 12 }}>
            Нажимая «Оплатить», вы соглашаетесь с{' '}
            <a href={info.privacy_policy_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary, #4361ee)' }}>
              политикой обработки персональных данных
            </a>
          </p>
        )}

        <button
          onClick={handlePay}
          disabled={paying || !selectedPlan}
          style={{
            ...styles.payBtn,
            opacity: paying || !selectedPlan ? 0.6 : 1,
            cursor: paying || !selectedPlan ? 'not-allowed' : 'pointer',
          }}
        >
          {paying ? 'Перенаправление на оплату...' : `Оплатить ${selectedPlan ? Number(selectedPlan.price).toLocaleString('ru-RU') + ' ' + (selectedPlan.currency || 'RUB') : ''}`}
        </button>

        <p style={{ ...styles.muted, fontSize: '0.75rem', textAlign: 'center', marginTop: 12 }}>
          После оплаты вы получите персональную ссылку для вступления в чат
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'var(--bg, #0f0f23)',
  },
  card: {
    background: 'var(--bg-card, #16163a)',
    border: '1px solid var(--border, #333)',
    borderRadius: 'var(--radius, 12px)',
    padding: 32,
    maxWidth: 450,
    width: '100%',
    textAlign: 'center',
  },
  muted: {
    color: 'var(--text-secondary, #888)',
    fontSize: '0.88rem',
  },
  section: {
    marginTop: 24,
    textAlign: 'left',
  },
  sectionTitle: {
    fontSize: '0.95rem',
    marginBottom: 12,
    fontWeight: 600,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  selectCard: {
    border: '2px solid var(--border, #333)',
    borderRadius: 8,
    padding: '12px 16px',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
    transition: 'border-color 0.15s, background 0.15s',
    fontSize: '0.9rem',
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: '0.82rem',
    marginBottom: 4,
    color: 'var(--text-secondary, #888)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    background: 'var(--bg, #0f0f23)',
    color: 'var(--text, #eee)',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  toggleBtn: {
    flex: 1,
    padding: '8px 16px',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'background 0.15s',
  },
  payBtn: {
    width: '100%',
    padding: '14px 20px',
    background: 'var(--primary, #3498db)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    marginTop: 16,
    transition: 'opacity 0.15s',
  },
};
