import { useState, useEffect, useCallback, useRef } from 'react';
import { useChannels } from '../contexts/ChannelContext';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const CHANNEL_DISCOUNT_PERCENT = 10;

const PLAN_META = {
  1: { features: ['1 месяц доступа ко всем функциям', 'Безлимит каналов и сотрудников', 'Поддержка 24/7'] },
  3: { features: ['3 месяца доступа', 'Все функции без ограничений', 'Скидка к месячному тарифу'] },
  6: { features: ['6 месяцев — полгода спокойствия', 'Все функции без ограничений', 'Заметная экономия'] },
  12: { features: ['12 месяцев — максимальная выгода', 'Все функции без ограничений', 'Скидка 30% к месячному'] },
};

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.82rem', fontWeight: 500,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const pill = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 20,
  fontSize: '0.7rem', fontWeight: 600,
  background: bg, color,
  whiteSpace: 'nowrap',
});

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${BORDER}`, background: '#fff',
  fontSize: '0.88rem', color: DARK,
  outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: DARK, marginBottom: 6,
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};
const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const cntBtn = {
  width: 28, height: 28, borderRadius: 8,
  border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.95rem', color: DARK, fontWeight: 600,
  transition: 'all .15s ease',
};

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SUCCESS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Crown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h20 M3 17l3-9 4 6 2-10 2 10 4-6 3 9" />
  </svg>
);

export default function BillingPage() {
  const { channels } = useChannels();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(12);
  const [email, setEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');       // что юзер ввёл
  const [appliedPromo, setAppliedPromo] = useState(''); // что отправляется на сервер
  const [durations, setDurations] = useState([]);
  const [channelConfigs, setChannelConfigs] = useState({});
  const [billingStatuses, setBillingStatuses] = useState({});

  const { overlay: pageTour } = usePageOnboarding('billing', [
    { selector: '[data-tour-page="billing-duration"]', title: 'Срок подписки', text: 'Чем дольше срок — тем больше скидка. 12 мес = −30%.', placement: 'bottom' },
    { selector: '[data-tour-page="billing-channels"]', title: 'Каналы для оплаты', text: 'Выберите каналы — можно несколько сразу со скидкой за каждый дополнительный.', placement: 'bottom' },
  ]);

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
        const arr = Object.values(d.durations).sort((a, b) => a.months - b.months);
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

  const MAX_PAY_CHANNELS = 10;
  const toggleChannel = (tc) => setChannelConfigs(p => {
    const cur = !!p[tc]?.selected;
    if (!cur) {
      // Хотим выделить — проверим лимит
      const sel = Object.values(p).filter(v => v?.selected).length;
      if (sel >= MAX_PAY_CHANNELS) {
        showToast(`Можно выбрать максимум ${MAX_PAY_CHANNELS} каналов за один платёж`, 'error');
        return p;
      }
    }
    return { ...p, [tc]: { ...p[tc], selected: !cur } };
  });
  const setChannelUsers = (tc, n) => setChannelConfigs(p => ({ ...p, [tc]: { ...p[tc], users: Math.max(1, Math.min(50, n)) } }));
  const toggleAll = (val) => setChannelConfigs(p => {
    const next = { ...p };
    if (val) {
      // "Выбрать все" — лимит 10
      const list = (channels || []).slice(0, MAX_PAY_CHANNELS);
      list.forEach(ch => { next[ch.tracking_code] = { ...next[ch.tracking_code], selected: true }; });
      // Остальным выбор снимаем чтобы не быть > 10
      (channels || []).slice(MAX_PAY_CHANNELS).forEach(ch => { next[ch.tracking_code] = { ...next[ch.tracking_code], selected: false }; });
      if ((channels || []).length > MAX_PAY_CHANNELS) {
        showToast(`Выбраны первые ${MAX_PAY_CHANNELS} каналов (лимит за один платёж)`, 'info');
      }
    } else {
      channels?.forEach(ch => { next[ch.tracking_code] = { ...next[ch.tracking_code], selected: false }; });
    }
    return next;
  });

  const selectedChannels = channels?.filter(ch => channelConfigs[ch.tracking_code]?.selected) || [];
  const selectedCount = selectedChannels.length;

  // Серверная цена (с учётом уровней каналов). Локальный fallback ниже.
  const [serverPrice, setServerPrice] = useState(null);
  const priceFetchTimer = useRef(null);

  useEffect(() => {
    if (priceFetchTimer.current) clearTimeout(priceFetchTimer.current);
    if (selectedChannels.length === 0) {
      setServerPrice(null);
      return;
    }
    priceFetchTimer.current = setTimeout(async () => {
      try {
        const data = await api.post('/billing/calculate-multi', {
          months: selectedMonths,
          channels: selectedChannels.map(ch => ({
            tracking_code: ch.tracking_code,
            users: channelConfigs[ch.tracking_code]?.users || 1,
          })),
          promo_code: appliedPromo || undefined,
        });
        if (data?.success) setServerPrice(data);
      } catch { /* ignore */ }
    }, 300);
    return () => { if (priceFetchTimer.current) clearTimeout(priceFetchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonths, selectedChannels.length, JSON.stringify(channelConfigs), appliedPromo]);

  const calcPrice = () => {
    // Если сервер ответил — используем его данные (учитывают уровни каналов)
    if (serverPrice && serverPrice.items) {
      const totalUsers = serverPrice.items.reduce((s, it) => s + (it.users || 1), 0);
      const basePrice = serverPrice.base_price || 0;
      const fullPrice = basePrice * totalUsers;
      const breakdown = serverPrice.items.map(it => ({
        title: it.title || '—',
        level: it.level,
        levelDiscount: it.level_multiplier_pct || 0,
        discount: it.multi_discount_pct || 0,
        price: it.price_per_user || 0,
        users: it.users || 1,
        total: it.amount || 0,
      }));
      return {
        basePrice, total: serverPrice.total || 0, fullPrice,
        savings: Math.max(0, fullPrice - (serverPrice.total || 0)),
        totalUsers, breakdown,
      };
    }
    // Fallback — локальный расчёт без знания уровня (1й уровень для всех)
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
      breakdown.push({ title: ch.title, level: 1, levelDiscount: 0, discount: discountPct, price: channelPrice, users, total: channelTotal });
    });
    const totalUsers = selectedChannels.reduce((s, ch) => s + (channelConfigs[ch.tracking_code]?.users || 1), 0);
    const fullPrice = basePrice * totalUsers;
    return { basePrice, total, fullPrice, savings: fullPrice - total, totalUsers, breakdown };
  };

  const handleBuy = async () => {
    if (!selectedCount) { showToast('Выберите хотя бы один канал', 'error'); return; }
    if (!email || !email.includes('@')) { showToast('Укажите корректный email', 'error'); return; }
    // Если применён промо, но он невалиден — отказываем
    if (appliedPromo && serverPrice?.promo && !serverPrice.promo.valid) {
      showToast(serverPrice.promo.reason || 'Промокод не действителен', 'error');
      return;
    }
    setBuying(true);
    try {
      const data = await api.post('/billing/pay-multi', {
        months: selectedMonths, email,
        channels: selectedChannels.map(ch => ({ tracking_code: ch.tracking_code, users: channelConfigs[ch.tracking_code]?.users || 1 })),
        promo_code: appliedPromo || undefined,
      });
      if (data.success && (data.payment_url || data.paymentUrl)) {
        window.location.href = data.payment_url || data.paymentUrl;
      } else { showToast(data.error || 'Ошибка создания платежа', 'error'); }
    } catch { showToast('Ошибка оплаты', 'error'); }
    finally { setBuying(false); }
  };

  const price = calcPrice();
  const monthlyDur = durations.find(d => d.months === 1);
  const monthlyBase = monthlyDur?.price || 0;

  const [channelsOpen, setChannelsOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // По умолчанию список каналов свёрнут — раскрывается только по клику
  // на "Каналы для оплаты". Никаких автораскрытий.

  if (loading) return <Loading />;

  if (!channels?.length) return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
      `}</style>
      <section style={pageHeaderWrap}>
        <div style={pageHeaderBlur1} />
        <div style={pageHeaderBlur2} />
        <div style={pageHeaderRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={eyebrowStyle}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
              Подписки и оплата
            </div>
            <h1 style={pageTitleStyle}>Тарифы</h1>
            <p style={pageSubStyle}>Подключите канал, чтобы оформить подписку.</p>
          </div>
        </div>
      </section>
    </div>
  );

  const channelsWithSubs = Object.values(billingStatuses).filter(s => s.billing_active);

  return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .bp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .bp-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .bp-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .bp-input:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
        .bp-plan {
          position: relative; display: flex; flex-direction: column;
          background: #fff; border: 1.5px solid ${BORDER}; border-radius: 16px;
          overflow: hidden; cursor: pointer;
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }
        .bp-plan:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.08);
          border-color: ${ACCENT}40;
        }
        .bp-plan.active {
          border-color: ${ACCENT};
          box-shadow: 0 12px 32px ${ACCENT}25;
        }
        .bp-plan.featured {
          border-color: ${ACCENT};
          box-shadow: 0 14px 36px ${ACCENT}28;
        }
        .bp-cnt:hover { border-color: ${ACCENT}55 !important; color: ${ACCENT} !important; background: ${SOFT_BG} !important; }
        .bp-channel-row:hover { border-color: ${ACCENT}40 !important; }
      `}</style>

      <section style={pageHeaderWrap}>
        <div style={pageHeaderBlur1} />
        <div style={pageHeaderBlur2} />
        <div style={pageHeaderRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={eyebrowStyle}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
              Подписки и оплата
            </div>
            <h1 style={pageTitleStyle}>Тарифы</h1>
            <p style={pageSubStyle}>
              Чем больше срок — тем выгоднее. Активируйте подписку и откройте все маркетинговые инструменты.
            </p>
          </div>
          {channelsWithSubs.length > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 20,
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              color: '#fff', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '-0.01em',
              boxShadow: `0 4px 14px ${ACCENT}40`,
            }}>
              <Crown />
              Активна на {channelsWithSubs.length} {channelsWithSubs.length === 1 ? 'канале' : 'каналах'}
            </div>
          )}
        </div>
      </section>

      <section data-tour-page="billing-duration" style={{ marginBottom: 26 }}>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitleStyle}>Выберите срок</h2>
            <p style={sectionSubStyle}>Скидки за длительность и за каждый дополнительный канал</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {durations.map((dur, i) => {
            const active = selectedMonths === dur.months;
            const featured = dur.months === 12;
            const perMonth = monthlyBase ? Math.round(dur.price / dur.months) : Math.round(dur.price / dur.months);
            const monthlyEquivalent = monthlyBase * dur.months;
            const discountPct = monthlyEquivalent > 0 ? Math.round(100 - (dur.price / monthlyEquivalent) * 100) : 0;
            const features = PLAN_META[dur.months]?.features || [];
            return (
              <div
                key={dur.months}
                className={`bp-plan${active ? ' active' : ''}${featured ? ' featured' : ''}`}
                onClick={() => setSelectedMonths(dur.months)}
                style={{ animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both` }}
              >
                {featured && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
                    color: '#fff', textAlign: 'center',
                    padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                    boxShadow: `0 2px 8px ${WARNING}40`,
                  }}>
                    Лучший выбор
                  </div>
                )}
                <div style={{
                  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                  padding: featured ? '34px 18px 22px' : '22px 18px',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.18), transparent 60%)',
                    pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.01em' }}>{dur.label}</div>
                    {discountPct > 0 && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 20,
                        background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
                        color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                        boxShadow: `0 3px 10px rgba(0,0,0,0.18)`,
                      }}>
                        −{discountPct}%
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                    <span style={{ fontSize: '2.1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {dur.price.toLocaleString('ru-RU')}
                    </span>
                    <span style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>₽</span>
                  </div>
                  {dur.months > 1 && (
                    <div style={{ position: 'relative', fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>
                      ~{perMonth.toLocaleString('ru-RU')} ₽/мес
                    </div>
                  )}
                </div>

                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {features.map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.84rem', color: DARK, lineHeight: 1.45 }}>
                      <span style={{ flexShrink: 0, marginTop: 2 }}><Check /></span>
                      <span>{f}</span>
                    </div>
                  ))}
                  <button
                    style={{
                      ...primaryBtn, marginTop: 'auto',
                      ...(active ? { background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`, boxShadow: `0 4px 14px ${SUCCESS}40` } : {}),
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedMonths(dur.months); }}
                  >
                    {active ? '✓ Выбрано' : 'Выбрать тариф'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section data-tour-page="billing-channels" style={{ marginBottom: 22 }}>
        <div
          style={{
            ...sectionHeaderRow,
            cursor: 'pointer', userSelect: 'none',
            padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${BORDER}`, background: '#fff',
            marginBottom: channelsOpen ? 14 : 0,
            transition: 'border-color .15s ease, background .15s ease',
          }}
          onClick={() => setChannelsOpen(o => !o)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, color: MUTED,
              transform: channelsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform .2s ease',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={sectionTitleStyle}>Каналы для оплаты</h2>
              <p style={sectionSubStyle}>Каждый дополнительный — со скидкой · до 10 за платёж</p>
            </div>
            <span style={{ ...pill(`${ACCENT}12`, ACCENT), marginLeft: 4 }}>
              {selectedCount}/{MAX_PAY_CHANNELS} выбрано
            </span>
          </div>
          {channelsOpen && (
            <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
              <button className="bp-ghost" style={ghostBtn} onClick={() => toggleAll(true)}>Выбрать все</button>
              <button className="bp-ghost" style={ghostBtn} onClick={() => toggleAll(false)}>Снять все</button>
            </div>
          )}
        </div>
        <div style={{ display: channelsOpen ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
          {channels.map((ch, i) => {
            const tc = ch.tracking_code;
            const cfg = channelConfigs[tc] || { selected: false, users: 1 };
            const bs = billingStatuses[tc];
            return (
              <div
                key={tc}
                className="bp-channel-row"
                style={{
                  ...cardBase,
                  padding: '14px 16px',
                  borderColor: cfg.selected ? ACCENT : BORDER,
                  background: cfg.selected ? `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)` : '#fff',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  cursor: 'pointer',
                  animation: `dashFadeUp 0.4s ease ${0.05 + i * 0.04}s both`,
                }}
                onClick={() => toggleChannel(tc)}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `1.5px solid ${cfg.selected ? ACCENT : BORDER}`,
                  background: cfg.selected ? `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)` : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all .15s ease',
                }}>
                  {cfg.selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: DARK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ch.title || ch.username || tc}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {bs?.billing_active ? (
                      <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                        Активна · {bs.billing_days_left} дн.
                      </span>
                    ) : (
                      <span style={pill('rgba(245,158,11,0.10)', WARNING)}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: WARNING }} />
                        Нет подписки
                      </span>
                    )}
                  </div>
                </div>
                {cfg.selected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '0.74rem', color: MUTED, marginRight: 4 }}>Польз.</span>
                    <button className="bp-cnt" style={cntBtn} onClick={() => setChannelUsers(tc, cfg.users - 1)}>−</button>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, minWidth: 24, textAlign: 'center', color: DARK, letterSpacing: '-0.02em' }}>{cfg.users}</span>
                    <button className="bp-cnt" style={cntBtn} onClick={() => setChannelUsers(tc, cfg.users + 1)}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 22 }}>
        <div
          style={{
            ...cardBase,
            padding: '20px 22px',
            background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
            borderColor: `${ACCENT}25`,
          }}
        >
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 16, flexWrap: 'wrap',
              cursor: price.breakdown.length > 0 ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            onClick={() => price.breakdown.length > 0 && setBreakdownOpen(o => !o)}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                Расчёт стоимости
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                  {price.total.toLocaleString('ru-RU')}
                </span>
                <span style={{ fontSize: '1rem', color: MUTED, fontWeight: 600 }}>₽</span>
                {price.savings > 0 && (
                  <>
                    <span style={{ fontSize: '0.85rem', color: MUTED, textDecoration: 'line-through' }}>
                      {price.fullPrice.toLocaleString('ru-RU')} ₽
                    </span>
                    <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS }} />
                      Экономия {price.savings.toLocaleString('ru-RU')} ₽
                    </span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={pill(SOFT_BG, MUTED)}>Каналов · {selectedCount}</span>
                <span style={pill(SOFT_BG, MUTED)}>Польз. · {price.totalUsers}</span>
                <span style={pill(SOFT_BG, MUTED)}>Срок · {durations.find(d => d.months === selectedMonths)?.label}</span>
              </div>
            </div>
            {price.breakdown.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, color: MUTED, marginTop: 4,
                transform: breakdownOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform .2s ease',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </span>
            )}
          </div>

          {breakdownOpen && price.breakdown.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${ACCENT}20`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {price.breakdown.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ color: DARK, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT2 }} />
                    {b.title} <span style={{ color: MUTED, fontWeight: 500 }}>({b.level || 1} ур.)</span>
                    {b.users > 1 ? ` (${b.users} п.)` : ''}
                    {b.level && b.level > 1 && b.levelDiscount > 0 && (
                      <span style={pill('rgba(123,104,238,0.10)', ACCENT2)}>🏆 −{b.levelDiscount}%</span>
                    )}
                    {b.discount > 0 && (
                      <span style={pill('rgba(16,185,129,0.10)', SUCCESS)}>объём −{b.discount}%</span>
                    )}
                  </span>
                  <span style={{ fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                    {b.total.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              ))}
              <div style={{
                marginTop: 6, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(123,104,238,0.08)', border: `1px dashed ${ACCENT2}40`,
                fontSize: '0.76rem', color: MUTED, lineHeight: 1.5,
              }}>
                💡 Чем выше уровень канала (раздел «Достижения» → «Прогресс»),
                тем дешевле его подписка: 1 ур → 490 ₽, 5 ур → 375 ₽ за месяц.
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={cardBase}>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Email для чека</label>
              <input
                className="bp-input"
                style={inputStyle}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Промокод (если есть)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="bp-input"
                  style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace', flex: 1 }}
                  placeholder="SUMMER10"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && promoCode.trim()) { e.preventDefault(); setAppliedPromo(promoCode.trim()); } }}
                  disabled={!!appliedPromo}
                />
                {appliedPromo ? (
                  <button onClick={() => { setAppliedPromo(''); setPromoCode(''); }}
                    style={{
                      padding: '0 16px', borderRadius: 10, border: `1px solid ${BORDER}`,
                      background: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: MUTED,
                    }}>× Сбросить</button>
                ) : (
                  <button onClick={() => promoCode.trim() && setAppliedPromo(promoCode.trim())}
                    disabled={!promoCode.trim()}
                    style={{
                      padding: '0 18px', borderRadius: 10, border: 'none',
                      background: promoCode.trim() ? '#4361ee' : '#e5e7eb',
                      color: promoCode.trim() ? '#fff' : '#9ca3af',
                      cursor: promoCode.trim() ? 'pointer' : 'not-allowed',
                      fontSize: '0.85rem', fontWeight: 600,
                    }}>Применить</button>
                )}
              </div>
              {appliedPromo && serverPrice?.promo && (
                <div style={{ marginTop: 8, fontSize: '0.86rem' }}>
                  {serverPrice.promo.valid ? (
                    <span style={{ color: SUCCESS, fontWeight: 600 }}>
                      ✓ Промокод применён — скидка {serverPrice.promo.discount_type === 'percent'
                        ? `${serverPrice.promo.discount_value}%`
                        : `${serverPrice.promo.discount_value.toLocaleString('ru-RU')} ₽`}
                      {serverPrice.promo.bonus_ai_tokens > 0 && (
                        <> + бонус <b>{serverPrice.promo.bonus_ai_tokens} ИИ-токенов</b> после оплаты</>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: DANGER, fontWeight: 600 }}>✗ {serverPrice.promo.reason || 'Промокод недействителен'}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {serverPrice?.promo?.valid && serverPrice.promo.discount_amount > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ ...cardBase, background: 'rgba(16,185,129,0.05)', border: `1px solid ${SUCCESS}40` }}>
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
              <span>До скидки: <s style={{ color: MUTED }}>{price.total.toLocaleString('ru-RU')} ₽</s></span>
              <span style={{ color: SUCCESS, fontWeight: 700 }}>−{serverPrice.promo.discount_amount.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        </section>
      )}

      <button
        className="bp-primary"
        style={{
          ...primaryBtn,
          width: '100%',
          padding: '14px 20px',
          fontSize: '0.95rem',
          opacity: buying || !selectedCount ? 0.7 : 1,
          cursor: buying || !selectedCount ? 'not-allowed' : 'pointer',
        }}
        onClick={handleBuy}
        disabled={buying || !selectedCount}
      >
        {buying ? 'Перенаправление на оплату...' :
          !selectedCount ? 'Выберите каналы' :
          (() => {
            const finalAmount = serverPrice?.total_after_promo ?? price.total;
            return `Оплатить ${finalAmount.toLocaleString('ru-RU')} ₽`;
          })()}
      </button>
    </div>
  );
}

const pageHeaderWrap = {
  position: 'relative', overflow: 'hidden',
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  padding: '26px 28px 24px', marginBottom: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const pageHeaderBlur1 = {
  position: 'absolute', top: -50, right: -30, width: 180, height: 180,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}24 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 6s ease-in-out infinite',
};
const pageHeaderBlur2 = {
  position: 'absolute', bottom: -70, left: -50, width: 200, height: 200,
  borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}1c 0%, transparent 70%)`,
  pointerEvents: 'none', animation: 'heroBlobFloat 8s ease-in-out infinite reverse',
};
const pageHeaderRow = {
  position: 'relative', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', gap: 16, flexWrap: 'wrap',
};
const eyebrowStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: '0.72rem', fontWeight: 600, color: MUTED,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
};
const pageTitleStyle = {
  margin: 0, fontSize: 'clamp(1.6rem, 2.4vw, 2rem)', fontWeight: 800,
  color: DARK, letterSpacing: '-0.04em', lineHeight: 1.05,
};
const pageSubStyle = {
  margin: '8px 0 0', fontSize: '0.92rem', color: MUTED,
  lineHeight: 1.5, maxWidth: 540,
};
const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};
