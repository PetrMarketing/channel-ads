import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { usePageOnboarding } from '../components/OnboardingTour';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';

const AI_PLANS = [
  { id: 1, tokens: 100,  price: 300,  perToken: 3.0 },
  { id: 2, tokens: 300,  price: 800,  perToken: 2.67, originalPrice: 900,  discount: 11 },
  { id: 3, tokens: 1000, price: 2550, perToken: 2.55, originalPrice: 3000, discount: 15 },
];

const PACK_GRADS = [
  [ACCENT, ACCENT2],
  [ACCENT2, '#a855f7'],
  [WARNING, '#f97316'],
];

const USAGE_ITEMS = [
  { label: 'ИИ Оформление канала', cost: '150 токенов', desc: 'Аватар, описание и контент-план' },
  { label: 'ИИ Лендинг', cost: '500 токенов', desc: 'Генерация страницы под нишу' },
  { label: 'Генерация публикации', cost: '20 токенов', desc: 'Текст поста по теме' },
  { label: 'Лид-магнит ИИ', cost: '100 токенов', desc: 'PDF-материал по нише' },
];

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

const SparkleIcon = ({ size = 22, stroke = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="2" fill={stroke} />
  </svg>
);

const DiamondIcon = ({ size = 22, stroke = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12l4 6-10 12L2 9l4-6z" />
    <path d="M11 3l-2 6h6l-2-6 M2 9h20" />
  </svg>
);

export default function AiTokensPage() {
  const { showToast } = useToast();
  const [buying, setBuying] = useState(false);
  const [email, setEmail] = useState('');
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const { overlay: pageTour } = usePageOnboarding('ai-tokens', [
    { selector: '[data-tour-page="tokens-pack"]', title: 'Покупка токенов', text: 'Выберите пакет: 100 = 300₽, 300 = 800₽, 1000 = 2550₽.', placement: 'bottom' },
  ]);

  const loadBalance = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/billing/ai-tokens');
      if (data.success) setBalance(data.balance || 0);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadBalance();
    api.get('/auth/me').then(d => { if (d.user?.email) setEmail(d.user.email); }).catch(() => {});
  }, [loadBalance]);

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

  const balanceRub = Math.round(balance * 3); // приблизительная стоимость

  return (
    <div style={{ animation: 'dashFade 0.4s ease' }}>
      {pageTour}
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes heroBlobFloat { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
        .ai-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .ai-pack:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}40 !important;
        }
        .ai-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .ai-input:focus {
          border-color: ${ACCENT} !important;
          box-shadow: 0 0 0 3px ${ACCENT}15;
        }
      `}</style>

      <section style={pageHeaderWrap}>
        <div style={pageHeaderBlur1} />
        <div style={pageHeaderBlur2} />
        <div style={pageHeaderRow}>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              boxShadow: `0 6px 18px ${ACCENT}40`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.28), transparent 60%)',
              }} />
              <span style={{ position: 'relative', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>
                <SparkleIcon size={26} />
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT2, boxShadow: `0 0 8px ${ACCENT2}` }} />
                Энергия для нейросетей
              </div>
              <h1 style={pageTitleStyle}>ИИ Токены</h1>
              <p style={pageSubStyle}>
                Тратятся на генерацию контента: оформление канала, лендинги, публикации и лид-магниты.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 22 }}>
        {balance > 0 || !loading ? (
          <div
            style={{
              ...cardBase,
              padding: '24px 26px',
              background: `linear-gradient(135deg, ${ACCENT}06, ${ACCENT2}06)`,
              borderColor: `${ACCENT}25`,
              animation: 'dashFadeUp 0.4s ease 0.05s both',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 18, flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                Баланс
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '2.6rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                  {balance.toLocaleString('ru-RU')}
                </span>
                <span style={{ fontSize: '1rem', color: MUTED, fontWeight: 600 }}>токенов</span>
              </div>
              {balance > 0 && (
                <div style={{ marginTop: 8, fontSize: '0.82rem', color: MUTED }}>
                  ≈ {balanceRub.toLocaleString('ru-RU')} ₽ по текущему курсу
                </div>
              )}
            </div>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: `linear-gradient(135deg, ${ACCENT2} 0%, #a855f7 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 24px ${ACCENT2}45`,
              position: 'relative', overflow: 'hidden', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.32), transparent 65%)',
              }} />
              <span style={{ position: 'relative', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.28))' }}>
                <SparkleIcon size={32} />
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ marginBottom: 26 }}>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitleStyle}>Купить пакет</h2>
            <p style={sectionSubStyle}>Чем больше пакет, тем выгоднее токен</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {AI_PLANS.map((plan, idx) => {
            const grad = PACK_GRADS[idx % PACK_GRADS.length];
            return (
              <div
                key={plan.id}
                data-tour-page={idx === 0 ? 'tokens-pack' : undefined}
                className="ai-pack"
                style={{
                  ...cardBase,
                  padding: 22,
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  animation: `dashFadeUp 0.4s ease ${0.05 + idx * 0.04}s both`,
                }}
              >
                {plan.discount && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 20,
                    background: `linear-gradient(135deg, ${WARNING} 0%, #f97316 100%)`,
                    color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                    boxShadow: `0 3px 10px ${WARNING}40`,
                  }}>
                    −{plan.discount}%
                  </div>
                )}

                <div style={{
                  width: 48, height: 48, borderRadius: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)`,
                  boxShadow: `0 4px 14px ${grad[0]}40`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.25), transparent 60%)',
                  }} />
                  <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>
                    {idx === 2 ? <DiamondIcon size={22} /> : <SparkleIcon size={22} />}
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, color: DARK, letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {plan.tokens.toLocaleString('ru-RU')}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: MUTED, fontWeight: 600 }}>токенов</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 700, color: DARK, letterSpacing: '-0.02em' }}>
                    {plan.price.toLocaleString('ru-RU')} ₽
                  </span>
                  {plan.originalPrice && (
                    <span style={{ fontSize: '0.82rem', color: MUTED, textDecoration: 'line-through' }}>
                      {plan.originalPrice.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: -6 }}>
                  {plan.perToken.toFixed(2)} ₽ за токен
                </div>

                <button
                  className="ai-primary"
                  style={{ ...primaryBtn, marginTop: 'auto', opacity: buying ? 0.7 : 1 }}
                  onClick={() => handleBuy(plan)}
                  disabled={buying}
                >
                  {buying ? 'Оплата...' : 'Купить'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 22 }}>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitleStyle}>Куда расходуются токены</h2>
            <p style={sectionSubStyle}>Ориентировочная стоимость операций</p>
          </div>
        </div>
        <div className="ai-card" style={{ ...cardBase, padding: 8 }}>
          {USAGE_ITEMS.map((item, i) => (
            <div
              key={item.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${ACCENT}15 0%, ${ACCENT2}15 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ACCENT,
              }}>
                <SparkleIcon size={18} stroke={ACCENT} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: DARK, letterSpacing: '-0.01em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: MUTED, marginTop: 2 }}>{item.desc}</div>
              </div>
              <span style={pill(`${ACCENT2}10`, ACCENT2)}>{item.cost}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={cardBase}>
          <div style={{ padding: 18 }}>
            <label style={labelStyle}>Email для чека</label>
            <input
              className="ai-input"
              style={inputStyle}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </div>
      </section>
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
  lineHeight: 1.5, maxWidth: 520,
};
const sectionHeaderRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
  marginBottom: 14, flexWrap: 'wrap', gap: 10,
};
