import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';

const CHANNEL_DISCOUNT_PERCENT = 10;

const AI_PLANS = [
  { id: 1, tokens: 100, price: 300 },
  { id: 2, tokens: 300, price: 800, originalPrice: 900, discount: 11 },
  { id: 3, tokens: 1000, price: 2550, originalPrice: 3000, discount: 15 },
];

export default function BillingPage() {
  const { channels } = useChannels();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [email, setEmail] = useState('');
  const [buyingTokens, setBuyingTokens] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [durations, setDurations] = useState([]);
  // Per-channel config: { [tracking_code]: { selected: bool, users: number } }
  const [channelConfigs, setChannelConfigs] = useState({});
  // Billing status per channel
  const [billingStatuses, setBillingStatuses] = useState({});

  // Init channel configs when channels load
  useEffect(() => {
    if (!channels?.length) return;
    setChannelConfigs(prev => {
      const next = { ...prev };
      for (const ch of channels) {
        if (!next[ch.tracking_code]) {
          next[ch.tracking_code] = { selected: true, users: 1 };
        }
      }
      return next;
    });
  }, [channels]);

  // Load user email + tariffs from API
  useEffect(() => {
    api.get('/auth/me').then(d => { if (d.user?.email) setEmail(d.user.email); }).catch(() => {});
    api.get('/billing/plans').then(d => {
      if (d.success && d.durations) {
        const arr = Object.values(d.durations).sort((a, b) => a.months - b.months);
        if (arr.length) setDurations(arr);
      }
    }).catch(() => {});
  }, []);

  // Load billing status for all channels
  const loadStatuses = useCallback(async () => {
    if (!channels?.length) return;
    setLoading(true);
    try {
      const data = await api.get('/billing/overview');
      if (data.success && data.overview) {
        const statuses = {};
        for (const ch of data.overview) {
          statuses[ch.tracking_code] = ch;
        }
        setBillingStatuses(statuses);
        // Set user counts from existing billing
        setChannelConfigs(prev => {
          const next = { ...prev };
          for (const ch of data.overview) {
            if (next[ch.tracking_code] && ch.max_users > 1) {
              next[ch.tracking_code].users = ch.max_users;
            }
          }
          return next;
        });
      }
    } catch {
      // ok
    } finally {
      setLoading(false);
    }
  }, [channels]);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  const toggleChannel = (tc) => {
    setChannelConfigs(prev => ({
      ...prev,
      [tc]: { ...prev[tc], selected: !prev[tc]?.selected },
    }));
  };

  const setChannelUsers = (tc, count) => {
    setChannelConfigs(prev => ({
      ...prev,
      [tc]: { ...prev[tc], users: Math.max(1, Math.min(50, count)) },
    }));
  };

  const selectedChannels = channels?.filter(ch => channelConfigs[ch.tracking_code]?.selected) || [];
  const selectedCount = selectedChannels.length;

  const calcPrice = () => {
    if (!durations.length) return { basePrice: 0, total: 0, fullPrice: 0, savings: 0, channelDiscountPct: 0, totalUsers: 0, breakdown: [] };
    const dur = durations.find(d => d.months === selectedMonths) || durations[0];
    const basePrice = dur.price;
    // Progressive discount: 1st channel full price, 2nd -10%, 3rd -20%, etc
    let total = 0;
    const breakdown = [];
    selectedChannels.forEach((ch, i) => {
      const users = channelConfigs[ch.tracking_code]?.users || 1;
      const discountPct = Math.min(i * CHANNEL_DISCOUNT_PERCENT, 90);
      const channelPrice = Math.round(basePrice * (1 - discountPct / 100));
      const channelTotal = channelPrice * users;
      total += channelTotal;
      breakdown.push({ title: ch.title, discount: discountPct, price: channelPrice, users, total: channelTotal });
    });
    const totalUsers = selectedChannels.reduce((sum, ch) => sum + (channelConfigs[ch.tracking_code]?.users || 1), 0);
    const fullPrice = basePrice * totalUsers;
    const avgDiscount = totalUsers > 0 ? Math.round((1 - total / fullPrice) * 100) : 0;
    return { basePrice, total, fullPrice, savings: fullPrice - total, channelDiscountPct: avgDiscount, totalUsers, breakdown };
  };

  const handleBuy = async () => {
    if (!selectedCount) {
      showToast('Выберите хотя бы один канал', 'error');
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('Укажите корректный email для получения чека', 'error');
      return;
    }
    setBuying(true);
    try {
      const payload = {
        months: selectedMonths,
        email,
        channels: selectedChannels.map(ch => ({
          tracking_code: ch.tracking_code,
          users: channelConfigs[ch.tracking_code]?.users || 1,
        })),
      };
      const data = await api.post('/billing/pay-multi', payload);
      if (data.success && (data.payment_url || data.paymentUrl)) {
        window.location.href = data.payment_url || data.paymentUrl;
      } else {
        showToast(data.error || 'Ошибка создания платежа', 'error');
      }
    } catch {
      showToast('Ошибка оплаты', 'error');
    } finally {
      setBuying(false);
    }
  };

  const price = calcPrice();

  if (loading) return <Loading />;

  if (!channels?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
        Нет каналов. Добавьте канал для оформления подписки.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Подписка и оплата</h2>

      {/* Channel selection with per-channel users */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px',
      }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Каналы и пользователи</h3>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Выберите каналы и укажите количество пользователей для каждого.
          {selectedCount > 1 && ` Скидка ${Math.min((selectedCount - 1) * CHANNEL_DISCOUNT_PERCENT, 90)}% за ${selectedCount} каналов.`}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels.map(ch => {
            const tc = ch.tracking_code;
            const cfg = channelConfigs[tc] || { selected: false, users: 1 };
            const bs = billingStatuses[tc];
            const isActive = bs?.billing_active;
            const daysLeft = bs?.billing_days_left;

            return (
              <div key={tc} style={{
                background: cfg.selected ? 'var(--bg-glass)' : 'transparent',
                border: cfg.selected ? '2px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px',
                opacity: cfg.selected ? 1 : 0.6,
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Checkbox + title */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: '200px' }}>
                    <input
                      type="checkbox"
                      checked={cfg.selected}
                      onChange={() => toggleChannel(tc)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{ch.title || ch.username || tc}</div>
                      {isActive ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                          Активна — {daysLeft} дн.
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Нет подписки
                        </div>
                      )}
                    </div>
                  </label>

                  {/* User count for this channel */}
                  {cfg.selected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Польз.:</span>
                      <button
                        onClick={() => setChannelUsers(tc, cfg.users - 1)}
                        style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          border: '1px solid var(--border)', background: 'var(--bg-glass)',
                          fontSize: '1rem', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >-</button>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, minWidth: '30px', textAlign: 'center' }}>
                        {cfg.users}
                      </div>
                      <button
                        onClick={() => setChannelUsers(tc, cfg.users + 1)}
                        style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          border: '1px solid var(--border)', background: 'var(--bg-glass)',
                          fontSize: '1rem', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Срок подписки</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {durations.map(dur => {
          const isSelected = selectedMonths === dur.months;
          const perMonth = Math.round(dur.price / dur.months);
          const isBestValue = dur.months === 12;
          return (
            <div
              key={dur.months}
              onClick={() => setSelectedMonths(dur.months)}
              style={{
                background: 'var(--bg-glass)',
                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center',
                cursor: 'pointer', transition: 'border-color 0.2s',
                opacity: isSelected ? 1 : 0.75,
                position: 'relative',
              }}
            >
              {isBestValue && (
                <div style={{
                  position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--primary)',
                  color: '#fff', padding: '2px 10px',
                  borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  Выгодно
                </div>
              )}
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                {dur.label}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                {dur.price.toLocaleString('ru-RU')} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>₽/польз.</span>
              </div>
              {dur.months > 1 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ~{perMonth} ₽/мес.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Price summary */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px',
      }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Расчёт стоимости</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Каналов</span>
            <span style={{ fontWeight: 500 }}>{selectedCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Пользователей всего</span>
            <span style={{ fontWeight: 500 }}>{price.totalUsers}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Срок</span>
            <span style={{ fontWeight: 500 }}>{durations.find(d => d.months === selectedMonths)?.label}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Базовая цена</span>
            <span style={{ fontWeight: 500 }}>{price.basePrice.toLocaleString('ru-RU')} ₽/канал</span>
          </div>
          {/* Per-channel breakdown with progressive discount */}
          {price.breakdown && price.breakdown.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
              {price.breakdown.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {b.title || `Канал ${b.channel || i + 1}`}
                    {b.users > 1 ? ` (${b.users} польз.)` : ''}
                    {b.discount > 0 && <span style={{ color: 'var(--success)', marginLeft: '4px' }}>-{b.discount}%</span>}
                  </span>
                  <span>{b.total.toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
          )}
          {price.savings > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginTop: '4px' }}>
              <span style={{ color: 'var(--success)' }}>Экономия</span>
              <span style={{ fontWeight: 500, color: 'var(--success)' }}>-{price.savings.toLocaleString('ru-RU')} ₽</span>
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--border)', paddingTop: '12px',
        }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Итого:</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
            {price.total.toLocaleString('ru-RU')} ₽
          </span>
        </div>
        {price.savings > 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: '6px', textAlign: 'right' }}>
            Экономия: {price.savings.toLocaleString('ru-RU')} ₽
          </div>
        )}
      </div>

      {/* Email for receipt */}
      <div style={{
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px',
      }}>
        <label style={{ fontSize: '0.92rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
          Email для чека *
        </label>
        <input
          className="form-input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%' }}
        />
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
          На этот адрес будет отправлен фискальный чек об оплате
        </div>
      </div>

      {/* Pay button */}
      <button
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 600 }}
        onClick={handleBuy}
        disabled={buying || !selectedCount}
      >
        {buying ? 'Перенаправление на оплату...' :
          !selectedCount ? 'Выберите каналы' :
          `Оплатить ${price.total.toLocaleString('ru-RU')} ₽`}
      </button>

      {/* AI Tokens */}
      <div style={{ borderTop: '2px solid var(--border)', marginTop: 40, paddingTop: 24 }}>
        <h2 style={{ marginBottom: 16 }}>ИИ Токены</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
          Токены используются для генерации контента с помощью ИИ: аватарки, описания, контент-планы.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          {AI_PLANS.map(plan => (
            <div key={plan.id} style={{
              background: 'var(--bg-glass)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {plan.discount && (
                <div style={{
                  position: 'absolute', top: 8, right: -28, background: '#ef4444', color: '#fff',
                  padding: '2px 30px', fontSize: '0.7rem', fontWeight: 700, transform: 'rotate(45deg)',
                }}>-{plan.discount}%</div>
              )}
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7B68EE' }}>{plan.tokens}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>токенов</div>
              {plan.originalPrice && (
                <div style={{ fontSize: '0.82rem', color: '#aaa', textDecoration: 'line-through' }}>
                  {plan.originalPrice.toLocaleString('ru-RU')} ₽
                </div>
              )}
              <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 12 }}>
                {plan.price.toLocaleString('ru-RU')} ₽
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                {(plan.price / plan.tokens).toFixed(1)} ₽ / токен
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={buyingTokens}
                onClick={async () => {
                  if (!tokenEmail) { showToast('Введите email для чека', 'error'); return; }
                  setBuyingTokens(true);
                  try {
                    const data = await api.post('/billing/ai-tokens/buy', { plan_id: plan.id, email: tokenEmail });
                    if (data.success && data.payment_url) {
                      window.location.href = data.payment_url;
                    } else {
                      showToast(data.detail || 'Ошибка', 'error');
                    }
                  } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
                  finally { setBuyingTokens(false); }
                }}
              >
                {buyingTokens ? '...' : 'Купить'}
              </button>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 400 }}>
          <label className="form-label">Email для чека</label>
          <input className="form-input" value={tokenEmail} onChange={e => setTokenEmail(e.target.value)}
            placeholder="your@email.com" type="email" />
        </div>
      </div>
    </div>
  );
}
