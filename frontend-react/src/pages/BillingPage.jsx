import { useState, useEffect, useCallback } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';

const CHANNEL_DISCOUNT_PERCENT = 10;

export default function BillingPage() {
  const { channels } = useChannels();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(12);
  const [email, setEmail] = useState('');
  const [durations, setDurations] = useState([]);
  const [channelConfigs, setChannelConfigs] = useState({});
  const [billingStatuses, setBillingStatuses] = useState({});
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!channels?.length) return;
    setChannelConfigs(prev => {
      const next = { ...prev };
      for (const ch of channels) {
        if (!next[ch.tracking_code]) next[ch.tracking_code] = { selected: true, users: 1 };
      }
      return next;
    });
  }, [channels]);

  useEffect(() => {
    api.get('/auth/me').then(d => { if (d.user?.email) setEmail(d.user.email); }).catch(() => {});
    api.get('/billing/plans').then(d => {
      if (d.success && d.durations) {
        const arr = Object.values(d.durations).sort((a, b) => b.months - a.months);
        if (arr.length) setDurations(arr);
      }
    }).catch(() => {});
  }, []);

  const loadStatuses = useCallback(async () => {
    if (!channels?.length) return;
    setLoading(true);
    try {
      const data = await api.get('/billing/overview');
      if (data.success && data.overview) {
        const statuses = {};
        for (const ch of data.overview) statuses[ch.tracking_code] = ch;
        setBillingStatuses(statuses);
        setChannelConfigs(prev => {
          const next = { ...prev };
          for (const ch of data.overview) {
            if (next[ch.tracking_code] && ch.max_users > 1) next[ch.tracking_code].users = ch.max_users;
          }
          return next;
        });
      }
    } catch {} finally { setLoading(false); }
  }, [channels]);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  const toggleChannel = (tc) => setChannelConfigs(p => ({ ...p, [tc]: { ...p[tc], selected: !p[tc]?.selected } }));
  const setChannelUsers = (tc, n) => setChannelConfigs(p => ({ ...p, [tc]: { ...p[tc], users: Math.max(1, Math.min(50, n)) } }));
  const toggleAll = (val) => setChannelConfigs(p => {
    const next = { ...p };
    channels?.forEach(ch => { next[ch.tracking_code] = { ...next[ch.tracking_code], selected: val }; });
    return next;
  });

  const selectedChannels = channels?.filter(ch => channelConfigs[ch.tracking_code]?.selected) || [];
  const selectedCount = selectedChannels.length;

  const calcPrice = () => {
    if (!durations.length) return { basePrice: 0, total: 0, fullPrice: 0, savings: 0, totalUsers: 0, breakdown: [] };
    const dur = durations.find(d => d.months === selectedMonths) || durations[0];
    const basePrice = dur.price;
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
    const totalUsers = selectedChannels.reduce((s, ch) => s + (channelConfigs[ch.tracking_code]?.users || 1), 0);
    const fullPrice = basePrice * totalUsers;
    return { basePrice, total, fullPrice, savings: fullPrice - total, totalUsers, breakdown };
  };

  const handleBuy = async () => {
    if (!selectedCount) { showToast('Выберите хотя бы один канал', 'error'); return; }
    if (!email || !email.includes('@')) { showToast('Укажите корректный email', 'error'); return; }
    setBuying(true);
    try {
      const data = await api.post('/billing/pay-multi', {
        months: selectedMonths, email,
        channels: selectedChannels.map(ch => ({ tracking_code: ch.tracking_code, users: channelConfigs[ch.tracking_code]?.users || 1 })),
      });
      if (data.success && (data.payment_url || data.paymentUrl)) {
        window.location.href = data.payment_url || data.paymentUrl;
      } else { showToast(data.error || 'Ошибка создания платежа', 'error'); }
    } catch { showToast('Ошибка оплаты', 'error'); }
    finally { setBuying(false); }
  };

  const price = calcPrice();

  if (loading) return <Loading />;
  if (!channels?.length) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
      Нет каналов. Добавьте канал для оформления подписки.
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Подписки и оплата</h2>

      {/* 1. Срок подписки */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 12 }}>Срок подписки</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {durations.map(dur => {
            const active = selectedMonths === dur.months;
            const perMonth = Math.round(dur.price / dur.months);
            return (
              <button key={dur.months} onClick={() => setSelectedMonths(dur.months)} style={{
                flex: 1, padding: '14px 8px', borderRadius: 'var(--radius)', cursor: 'pointer',
                border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: active ? 'rgba(123,104,238,0.08)' : 'var(--bg-glass)',
                transition: 'all 0.15s', textAlign: 'center', position: 'relative',
              }}>
                {dur.months === 12 && (
                  <div style={{
                    position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--primary)', color: '#fff', padding: '1px 8px',
                    borderRadius: 8, fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>Выгодно</div>
                )}
                <div style={{ fontSize: '1rem', fontWeight: 700, color: active ? 'var(--primary)' : 'inherit' }}>
                  {dur.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {dur.price.toLocaleString('ru-RU')} ₽
                </div>
                {dur.months > 1 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ~{perMonth} ₽/мес
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Каналы — аккордеон */}
      <div style={{
        marginBottom: 24, borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--bg-glass)', overflow: 'hidden',
      }}>
        <button onClick={() => setChannelsOpen(!channelsOpen)} style={{
          width: '100%', padding: '14px 16px', border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.95rem', fontWeight: 600, color: 'inherit', textAlign: 'left',
        }}>
          <span>Каналы ({selectedCount} из {channels.length})</span>
          <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: channelsOpen ? 'rotate(180deg)' : 'rotate(0)' }}>&#9660;</span>
        </button>

        {channelsOpen && (
          <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 0 6px', fontSize: '0.78rem' }}>
              <button onClick={() => toggleAll(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '0.78rem', padding: 0 }}>Выбрать все</button>
              <button onClick={() => toggleAll(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', padding: 0 }}>Снять все</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {channels.map(ch => {
                const tc = ch.tracking_code;
                const cfg = channelConfigs[tc] || { selected: false, users: 1 };
                const bs = billingStatuses[tc];
                return (
                  <div key={tc} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, border: `1px solid ${cfg.selected ? 'var(--primary)' : 'var(--border)'}`,
                    background: cfg.selected ? 'rgba(123,104,238,0.04)' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    <input type="checkbox" checked={cfg.selected} onChange={() => toggleChannel(tc)}
                      style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.title || ch.username || tc}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: bs?.billing_active ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {bs?.billing_active ? `Активна — ${bs.billing_days_left} дн.` : 'Нет подписки'}
                      </div>
                    </div>
                    {cfg.selected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setChannelUsers(tc, cfg.users - 1)} style={cntBtn}>-</button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{cfg.users}</span>
                        <button onClick={() => setChannelUsers(tc, cfg.users + 1)} style={cntBtn}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Итого */}
      <div style={{
        marginBottom: 20, padding: '16px 18px', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--bg-glass)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>Итого</span>
          <div style={{ textAlign: 'right' }}>
            {price.savings > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                {price.fullPrice.toLocaleString('ru-RU')} ₽
              </div>
            )}
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
              {price.total.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>
        {price.savings > 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 4 }}>
            Экономия {price.savings.toLocaleString('ru-RU')} ₽
          </div>
        )}

        {/* Расчёт — раскрывающийся блок */}
        <button onClick={() => setDetailsOpen(!detailsOpen)} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0',
          fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          Расчёт стоимости
          <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0)' }}>&#9660;</span>
        </button>

        {detailsOpen && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Каналов</span>
              <span>{selectedCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Пользователей</span>
              <span>{price.totalUsers}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Срок</span>
              <span>{durations.find(d => d.months === selectedMonths)?.label}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Базовая цена</span>
              <span>{price.basePrice.toLocaleString('ru-RU')} ₽/канал</span>
            </div>
            {price.breakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {b.title}{b.users > 1 ? ` (${b.users} п.)` : ''}
                  {b.discount > 0 && <span style={{ color: 'var(--success)', marginLeft: 4 }}>-{b.discount}%</span>}
                </span>
                <span>{b.total.toLocaleString('ru-RU')} ₽</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Email */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: '0.88rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Email для чека
        </label>
        <input className="form-input" type="email" placeholder="you@example.com"
          value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%' }} />
      </div>

      {/* 5. Кнопка оплаты */}
      <button className="btn btn-primary" onClick={handleBuy} disabled={buying || !selectedCount}
        style={{ width: '100%', padding: 14, fontSize: '1rem', fontWeight: 600 }}>
        {buying ? 'Перенаправление на оплату...' :
          !selectedCount ? 'Выберите каналы' :
          `Оплатить ${price.total.toLocaleString('ru-RU')} ₽`}
      </button>
    </div>
  );
}

const cntBtn = {
  width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)',
  background: 'var(--bg)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
};
