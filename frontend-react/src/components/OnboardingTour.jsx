/**
 * Онбординг — пошаговое обучение с привязкой к состоянию пользователя.
 * 1. Нет каналов → только шаг «Добавьте канал»
 * 2. Есть канал, но нет подписки → «Оплатите тариф»
 * 3. Канал + подписка → полный тур по разделам с переходом на страницы
 */
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useChannels } from '../contexts/ChannelContext';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  boxShadow: '0 20px 50px rgba(26,26,46,0.18)',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.9rem', fontWeight: 600,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '12px 22px', borderRadius: 12, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.9rem', fontWeight: 600,
  transition: 'border-color .15s ease, background .15s ease, color .15s ease',
};

const stepPill = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 20,
  background: `linear-gradient(135deg, ${ACCENT}14, ${ACCENT2}14)`,
  border: `1px solid ${ACCENT}28`,
  color: ACCENT, fontSize: '0.72rem', fontWeight: 600,
  letterSpacing: '0.01em',
};

const subtleTextBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontSize: '0.74rem', color: MUTED, fontWeight: 500,
  transition: 'color .15s ease',
};

const STEP_GROUPS = {
  noChannel: [
    { id: 'add-channel', selector: '[data-tour="add-channel"]', title: 'Подключите канал', text: 'Чтобы начать работу, добавьте канал MAX. Нажмите «+ Канал» в правом верхнем углу или следуйте инструкции на дашборде.', placement: 'bottom' },
  ],
  noBilling: [
    { id: 'select-channel', selector: '[data-tour="channel-select"]', title: 'Ваш канал', text: 'Канал подключён! Теперь выберите его в этом списке и оплатите тариф для активации функций.', placement: 'bottom' },
    { id: 'cat-billing', selector: '[data-tour="cat-billing"]', title: 'Оплатите тариф', text: 'Без активной подписки рассылки, воронки и аналитика недоступны. Откройте раздел «Подписка».', placement: 'right', expand: 'billing' },
    { id: 'billing', selector: '[data-tour="billing"]', title: 'Тарифы', text: 'Выберите срок подписки: чем дольше — тем выгоднее. Скидки до 30% за 12 месяцев.', placement: 'right', expand: 'billing', navigate: '/billing' },
  ],
  full: [
    { id: 'dashboard', selector: '[data-tour="dashboard"]', title: 'Обзор', text: 'Главный экран со статистикой канала: подписчики, визиты, конверсии, доход.', placement: 'right', navigate: '/' },
    { id: 'dash-channel', selector: '[data-tour="channel-select"]', title: 'Ваш канал', text: 'Если каналов несколько — переключайтесь между ними здесь.', placement: 'bottom' },

    { id: 'cat-marketing', selector: '[data-tour="cat-marketing"]', title: 'Раздел: Маркетинг', text: 'Инструменты для привлечения и удержания подписчиков.', placement: 'right', expand: 'marketing' },
    { id: 'ai-design-nav', selector: '[data-tour="ai-design"]', title: 'ИИ Оформление', text: 'Начнём с автоматической генерации обложки и описания канала.', placement: 'right', expand: 'marketing', navigate: '/ai-design' },
    { id: 'ai-design-start', selector: '[data-tour-page="design-start"]', title: 'Новая сессия', text: 'Нажмите «Создать оформление» — ИИ сгенерирует 9 аватаров, описание и лид-магнит.', placement: 'top' },

    { id: 'links-nav', selector: '[data-tour="links"]', title: 'Трекинг-ссылки', text: 'Создавайте ссылки с UTM, лид-магниты и ИИ-лендинги с аналитикой Метрики и VK.', placement: 'right', expand: 'marketing', navigate: '/links' },
    { id: 'links-create', selector: '[data-tour-page="links-create"]', title: 'Создание ссылки', text: '«+ Создать ссылку» → выберите тип: Лендинг, Прямая, Лид-магнит или ИИ Лендинг.', placement: 'bottom' },

    { id: 'pins-nav', selector: '[data-tour="pins"]', title: 'Закрепы и лид-магниты', text: 'Закреп — пост с кнопкой подписки. Лид-магнит — файл, который бот отправит после подписки.', placement: 'right', expand: 'marketing', navigate: '/pins' },
    { id: 'pins-create', selector: '[data-tour-page="pins-create"]', title: 'Создать закреп', text: 'Текст, кнопки, медиафайл — бот опубликует и закрепит в канале.', placement: 'bottom' },

    { id: 'broadcasts-nav', selector: '[data-tour="broadcasts"]', title: 'Рассылки', text: 'Массовые личные сообщения подписчикам через бота с таргетингом.', placement: 'right', expand: 'marketing', navigate: '/broadcasts' },
    { id: 'broadcasts-create', selector: '[data-tour-page="broadcasts-create"]', title: 'Новая рассылка', text: 'Текст, кнопки, медиа, таргетинг по сегментам, отложенная отправка.', placement: 'bottom' },

    { id: 'funnels-nav', selector: '[data-tour="funnels"]', title: 'Воронки', text: 'Автоматические цепочки сообщений после подписки на лид-магнит.', placement: 'right', expand: 'marketing', navigate: '/funnels' },

    { id: 'analytics-nav', selector: '[data-tour="analytics"]', title: 'Аналитика', text: 'Графики подписчиков, отписок, визитов и конверсий за выбранный период.', placement: 'right', expand: 'marketing', navigate: '/analytics' },

    { id: 'ord-nav', selector: '[data-tour="ord"]', title: 'Отчёты о рекламе (ОРД)', text: 'Маркировка рекламы по закону РФ. Контрагенты, договоры, креативы с получением ERID.', placement: 'right', expand: 'marketing', navigate: '/ord' },

    { id: 'cat-content', selector: '[data-tour="cat-content"]', title: 'Раздел: Контент', text: 'Создание и планирование контента.', placement: 'right', expand: 'content' },
    { id: 'content-nav', selector: '[data-tour="content"]', title: 'Публикации', text: 'Календарь постов с возможностью планирования.', placement: 'right', expand: 'content', navigate: '/content' },
    { id: 'content-day', selector: '[data-tour-page="content-day"]', title: 'Свободная дата', text: 'Нажмите на любую свободную дату — откроется форма создания поста с этой датой.', placement: 'bottom' },
    { id: 'ai-content-tab', selector: '[data-tour-page="content-ai"]', title: 'ИИ Контент-план', text: 'ИИ создаст 15–60 постов на месяц под вашу нишу с распределением целей (продажи / прогрев / активность). Можно сгенерировать иллюстрации к каждому посту.', placement: 'bottom' },

    { id: 'giveaways-nav', selector: '[data-tour="giveaways"]', title: 'Розыгрыши', text: 'Конкурсы среди подписчиков с автоматическим выбором победителей.', placement: 'right', expand: 'content', navigate: '/giveaways' },

    { id: 'comments-nav', selector: '[data-tour="comments"]', title: 'Комментарии', text: 'Модерация комментариев в канале. Можно отвечать, удалять, кастомизировать страницу.', placement: 'right', expand: 'content', navigate: '/comments' },

    { id: 'cat-monetization', selector: '[data-tour="cat-monetization"]', title: 'Раздел: Монетизация', text: 'Способы заработка: платные чаты, услуги, магазин.', placement: 'right', expand: 'monetization' },
    { id: 'paid-chats-nav', selector: '[data-tour="paid-chats"]', title: 'Платные чаты', text: 'Подписка за деньги на чат. Бот добавляет участников по факту оплаты.', placement: 'right', expand: 'monetization', navigate: '/paid-chats' },
    { id: 'services-nav', selector: '[data-tour="services"]', title: 'Услуги и запись', text: 'Онлайн-запись клиентов: филиалы, специалисты, оплата.', placement: 'right', expand: 'monetization', navigate: '/services' },
    { id: 'shop-nav', selector: '[data-tour="shop"]', title: 'Магазин', text: 'Полный интернет-магазин в MiniApp: каталог, корзина, доставка, промокоды.', placement: 'right', expand: 'monetization', navigate: '/shop' },

    { id: 'staff-nav', selector: '[data-tour="staff"]', title: 'Сотрудники', text: 'Добавьте сотрудников по PKid с ролями: Рекламодатель, Редактор или Администратор.', placement: 'right', navigate: '/staff' },

    { id: 'cat-billing', selector: '[data-tour="cat-billing"]', title: 'Раздел: Подписка', text: 'Управление платежами: тарифы, ИИ-токены, реферальная программа.', placement: 'right', expand: 'billing' },
    { id: 'billing-nav', selector: '[data-tour="billing"]', title: 'Тарифы', text: 'Управление подпиской на сервис. Скидки до 30% за длительный срок.', placement: 'right', expand: 'billing', navigate: '/billing' },
    { id: 'ai-tokens-nav', selector: '[data-tour="ai-tokens"]', title: 'ИИ Токены', text: 'Валюта для ИИ-функций. 100 = 300₽. Тратятся на ИИ Оформление и Лендинги.', placement: 'right', expand: 'billing', navigate: '/ai-tokens' },
    { id: 'referrals-nav', selector: '[data-tour="referrals"]', title: 'Реферальная программа', text: 'Приглашайте друзей по реф-ссылке и получайте до 50% с их платежей.', placement: 'right', expand: 'billing', navigate: '/referrals' },

    { id: 'profile', selector: '[data-tour="profile"]', title: 'Профиль', text: 'Здесь ваш PKid и баланс токенов. Кнопка «Обучение» в хедере — повторный запуск тура в любой момент.', placement: 'bottom' },
  ],
};

const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 480;

// Heuristic: a selector targets a sidebar element if it's a sidebar
// category toggle (`[data-tour="cat-*"]`) or its resolved DOM element lives
// inside `.sidebar`. We confirm via `closest('.sidebar')` after lookup.
const SIDEBAR_CAT_PREFIX = '[data-tour="cat-';
function selectorTargetsSidebar(selector) {
  if (!selector) return false;
  if (selector.startsWith(SIDEBAR_CAT_PREFIX)) return true;
  // Try DOM probe — element may not exist yet (drawer closed) but if it
  // exists and lives inside `.sidebar`, it's a sidebar item.
  try {
    const el = document.querySelector(selector);
    if (el && el.closest('.sidebar')) return true;
  } catch { /* ignore invalid selectors */ }
  return false;
}

const Ctx = createContext(null);

export function useOnboarding() {
  return useContext(Ctx) || { active: false, start: () => {}, completedCount: 0, totalSteps: 0 };
}

export function OnboardingProvider({ children }) {
  const { user, token } = useAuth();
  const { channels } = useChannels();
  const navigate = useNavigate();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [skipped, setSkipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const loadedRef = useRef(false);

  const hasChannel = (channels?.length || 0) > 0;
  const hasActiveBilling = channels?.some(c => c.billing_active) || false;
  const steps = !hasChannel
    ? STEP_GROUPS.noChannel
    : (!hasActiveBilling ? STEP_GROUPS.noBilling : STEP_GROUPS.full);

  useEffect(() => {
    if (!token || loadedRef.current) return;
    loadedRef.current = true;
    api.get('/onboarding/state').then(d => {
      if (d.success) {
        setCompleted(d.completed_steps || []);
        setSkipped(d.skipped);
        setFinished(d.finished);
        if (!d.skipped && !d.finished) {
          setTimeout(() => setShowWelcome(true), 800);
        }
      }
    }).catch(() => {});
  }, [token]);

  const start = useCallback(() => {
    setShowWelcome(false);
    setActive(true);
    const firstIncomplete = steps.findIndex(s => !completed.includes(s.id));
    setStepIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
    if (steps[firstIncomplete >= 0 ? firstIncomplete : 0]?.navigate) {
      navigate(steps[firstIncomplete >= 0 ? firstIncomplete : 0].navigate);
    }
  }, [completed, steps, navigate]);

  const skip = useCallback(async () => {
    setShowWelcome(false);
    setActive(false);
    setSkipped(true);
    try { await api.post('/onboarding/skip', {}); } catch {}
  }, []);

  const finish = useCallback(async () => {
    setActive(false);
    setFinished(true);
    try { await api.post('/onboarding/finish', {}); } catch {}
  }, []);

  const next = useCallback(async () => {
    const cur = steps[stepIndex];
    if (cur && !completed.includes(cur.id)) {
      setCompleted(p => [...p, cur.id]);
      try { await api.post('/onboarding/complete-step', { step_id: cur.id }); } catch {}
    }
    if (stepIndex >= steps.length - 1) {
      finish();
    } else {
      const nextStep = steps[stepIndex + 1];
      setStepIndex(stepIndex + 1);
      if (nextStep?.navigate) {
        navigate(nextStep.navigate);
      }
    }
  }, [stepIndex, completed, steps, finish, navigate]);

  const prev = useCallback(() => {
    if (stepIndex > 0) {
      const prevStep = steps[stepIndex - 1];
      setStepIndex(stepIndex - 1);
      if (prevStep?.navigate) navigate(prevStep.navigate);
    }
  }, [stepIndex, steps, navigate]);

  const value = {
    active, start, skip, finish,
    completedCount: completed.length,
    totalSteps: steps.length,
    skipped, finished,
  };

  if (!user) return <Ctx.Provider value={value}>{children}</Ctx.Provider>;

  return (
    <Ctx.Provider value={value}>
      {children}
      {showWelcome && <WelcomeModal onStart={start} onSkip={skip} userName={user.first_name} hasChannel={hasChannel} hasActiveBilling={hasActiveBilling} />}
      {active && <TourOverlay step={steps[stepIndex]} stepIndex={stepIndex} totalSteps={steps.length} onNext={next} onPrev={prev} onSkip={finish} />}
    </Ctx.Provider>
  );
}

// Иконки для трёх состояний welcome modal
function HeroIcon({ variant }) {
  const common = { width: 40, height: 40, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (variant === 'channel') {
    return (
      <svg {...common}>
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 11-5.8-1.6" />
        <circle cx="19" cy="5" r="3" fill="#fff" stroke="none" />
      </svg>
    );
  }
  if (variant === 'billing') {
    return (
      <svg {...common}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
        <circle cx="12" cy="16" r="1.5" fill="#fff" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4.5 16.5L3 21l4.5-1.5" />
      <path d="M14 6l4 4" />
      <path d="M5 18l11-11a3 3 0 014.24 4.24L9 22.5" />
      <path d="M16 4l4 4" />
    </svg>
  );
}

function WelcomeModal({ onStart, onSkip, userName, hasChannel, hasActiveBilling }) {
  const variant = !hasChannel ? 'channel' : (!hasActiveBilling ? 'billing' : 'tour');

  let title = `Привет, ${userName || 'друг'} 👋`;
  let text = 'Покажу основные функции сервиса за 2 минуты — это поможет быстро освоиться и не потеряться.';
  let startLabel = 'Начать обучение';
  let pillText = 'Полный тур · 2 минуты';
  let highlights = [
    'Все возможности сервиса по полочкам',
    'Понятный путь от канала до продаж',
    'Можно прервать в любой момент',
  ];

  if (!hasChannel) {
    text = 'Для начала подключим ваш первый канал MAX. Покажу как это сделать — займёт меньше минуты.';
    startLabel = 'Подключить канал';
    pillText = 'Шаг 1 из 3 · 1 минута';
    highlights = [
      'Назначим бота администратором',
      'Канал подхватится автоматически',
      'Дальше — настройка и запуск',
    ];
  } else if (!hasActiveBilling) {
    text = 'Канал подключён — отличный старт! Осталось активировать тариф, чтобы открыть рассылки, воронки и аналитику.';
    startLabel = 'Перейти к оплате';
    pillText = 'Шаг 2 из 3 · 1 минута';
    highlights = [
      'Скидки до 30% за длительный срок',
      'Все функции сразу после оплаты',
      'Можно отменить в любой момент',
    ];
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(26,26,46,0.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 20,
      animation: 'tourFadeIn 0.3s ease',
    }}>
      <div className="tour-welcome-modal" style={{
        ...cardBase,
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(26,26,46,0.18)',
        maxWidth: 460, width: '100%',
        padding: 'clamp(28px, 5vw, 40px)',
        textAlign: 'center',
        animation: 'tourPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative gradient blob */}
        <div aria-hidden style={{
          position: 'absolute', top: -80, right: -80, width: 220, height: 220,
          borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT2}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -100, left: -60, width: 220, height: 220,
          borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}16 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          {/* Hero icon with pulsing halo */}
          <div className="tour-welcome-hero" style={{
            position: 'relative',
            width: 96, height: 96, margin: '0 auto 20px',
          }}>
            <div aria-hidden style={{
              position: 'absolute', inset: -12, borderRadius: '50%',
              background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
              animation: 'tourPulseRing 2.4s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              boxShadow: `0 12px 32px ${ACCENT}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HeroIcon variant={variant} />
            </div>
          </div>

          <div style={{ ...stepPill, marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
            {pillText}
          </div>

          <h2 style={{
            margin: 0, fontSize: '1.7rem', fontWeight: 800,
            color: DARK, letterSpacing: '-0.02em', lineHeight: 1.15,
          }}>
            {title}
          </h2>

          <p style={{
            margin: '12px 0 22px',
            fontSize: '0.95rem', color: MUTED, lineHeight: 1.55,
          }}>
            {text}
          </p>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            textAlign: 'left',
            background: SOFT_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 24,
          }}>
            {highlights.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 6px ${ACCENT}30`,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span style={{ fontSize: '0.86rem', color: DARK, fontWeight: 500 }}>{h}</span>
              </div>
            ))}
          </div>

          <div className="tour-welcome-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onSkip}
              style={ghostBtn}
              onMouseEnter={e => { e.currentTarget.style.background = SOFT_BG; e.currentTarget.style.borderColor = `${ACCENT}40`; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = BORDER; }}
            >
              Пропустить
            </button>
            <button
              onClick={onStart}
              style={primaryBtn}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${ACCENT}55`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
            >
              {startLabel}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{tourKeyframes}</style>
    </div>
  );
}

function TourOverlay({ step, stepIndex, totalSteps, onNext, onPrev, onSkip }) {
  const [rect, setRect] = useState(null);

  // When the tour overlay unmounts (skip/finish), make sure the mobile
  // drawer doesn't get stuck open.
  useEffect(() => {
    return () => {
      if (isMobile()) {
        window.dispatchEvent(new Event('onboarding:close-sidebar'));
      }
    };
  }, []);

  useEffect(() => {
    if (!step) return;

    const mobile = isMobile();
    // On mobile, decide whether this step's target lives in the sidebar.
    // If yes -> open the drawer; if no -> close it so page-level targets are
    // visible. Done before the first measurement attempt.
    let sidebarTarget = false;
    if (mobile) {
      sidebarTarget = !!step.expand || selectorTargetsSidebar(step.selector);
      if (sidebarTarget) {
        console.info('[tour] opening sidebar for selector', step.selector);
        window.dispatchEvent(new Event('onboarding:open-sidebar'));
      } else {
        console.info('[tour] closing sidebar for selector', step.selector);
        window.dispatchEvent(new Event('onboarding:close-sidebar'));
      }
    }

    // Expand the sidebar category accordion. On mobile we delay until the
    // drawer slide-in (250ms) has completed so the click hits the visible
    // toggle and lays out the subitems correctly.
    const expandCategory = () => {
      if (!step.expand) return;
      const catEl = document.querySelector(`[data-tour="cat-${step.expand}"]`);
      const catWrap = catEl?.closest('.sidebar-category');
      if (catEl && catWrap && !catWrap.classList.contains('open')) {
        catEl.click();
      }
    };
    const expandDelay = mobile && sidebarTarget ? 280 : 0;
    const tExpand = setTimeout(expandCategory, expandDelay);

    const update = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) {
          setRect(null);
          return;
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setRect(null);
      }
    };
    // On mobile, push the first measurement past the drawer transition + the
    // category accordion expansion so the target has its real bounding rect.
    const baseDelay = mobile && sidebarTarget ? 320 : 50;
    const t1 = setTimeout(update, baseDelay);
    const t2 = setTimeout(update, baseDelay + 350);
    const t3 = setTimeout(update, baseDelay + 750);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(tExpand);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  if (!step) return null;

  const PAD = 8;
  const tooltipPos = rect
    ? calcTooltipPos(rect, step.placement, PAD)
    : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  const tooltipWidth = tooltipPos.width || (isNarrow() ? Math.min(360, window.innerWidth - 24) : 360);

  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      {rect ? (
        (() => {
          const PAD2 = PAD;
          const x = rect.left - PAD2, y = rect.top - PAD2;
          const w = rect.width + PAD2 * 2, h = rect.height + PAD2 * 2;
          const blurStyle = {
            position: 'fixed',
            background: 'rgba(26,26,46,0.35)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
            transition: 'top .35s cubic-bezier(0.4, 0, 0.2, 1), left .35s cubic-bezier(0.4, 0, 0.2, 1), width .35s cubic-bezier(0.4, 0, 0.2, 1), height .35s cubic-bezier(0.4, 0, 0.2, 1), right .35s cubic-bezier(0.4, 0, 0.2, 1), bottom .35s cubic-bezier(0.4, 0, 0.2, 1)',
          };
          return (
            <>
              <div onClick={onSkip} style={{ ...blurStyle, top: 0, left: 0, right: 0, height: Math.max(0, y) }} />
              <div onClick={onSkip} style={{ ...blurStyle, top: y + h, left: 0, right: 0, bottom: 0 }} />
              <div onClick={onSkip} style={{ ...blurStyle, top: y, left: 0, width: Math.max(0, x), height: h }} />
              <div onClick={onSkip} style={{ ...blurStyle, top: y, left: x + w, right: 0, height: h }} />
            </>
          );
        })()
      ) : (
        <div
          onClick={onSkip}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(26,26,46,0.45)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
            animation: 'tourFadeIn 0.25s ease',
          }}
        />
      )}

      {rect && (
        <svg
          style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none' }}
        >
          {/* Outer pulsing ring for delightful focus */}
          <rect
            x={rect.left - PAD - 4} y={rect.top - PAD - 4}
            width={rect.width + PAD * 2 + 8} height={rect.height + PAD * 2 + 8}
            rx="14" fill="none"
            stroke={ACCENT} strokeWidth="2" strokeOpacity="0.35"
            style={{
              transformOrigin: `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`,
              animation: 'tourPulseRing 2s ease-in-out infinite',
              transition: 'x .35s cubic-bezier(0.4, 0, 0.2, 1), y .35s cubic-bezier(0.4, 0, 0.2, 1), width .35s cubic-bezier(0.4, 0, 0.2, 1), height .35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* Inner solid border around target */}
          <rect
            x={rect.left - PAD} y={rect.top - PAD}
            width={rect.width + PAD * 2} height={rect.height + PAD * 2}
            rx="12" fill="none"
            stroke={ACCENT} strokeWidth="2"
            style={{
              filter: `drop-shadow(0 0 16px ${ACCENT}55)`,
              transition: 'x .35s cubic-bezier(0.4, 0, 0.2, 1), y .35s cubic-bezier(0.4, 0, 0.2, 1), width .35s cubic-bezier(0.4, 0, 0.2, 1), height .35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
      )}

      <div
        className="tour-tooltip-card"
        style={{
          position: 'fixed', ...tooltipPos, zIndex: 10001, pointerEvents: 'auto',
          ...cardBase,
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(26,26,46,0.18)',
          width: tooltipWidth, maxWidth: 'calc(100vw - 24px)', minWidth: Math.min(280, tooltipWidth),
          maxHeight: 'calc(100vh - 24px)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'top .35s cubic-bezier(0.4, 0, 0.2, 1), left .35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Candy stripe top */}
        <div style={{
          height: 4,
          background: `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT2} 50%, ${ACCENT} 100%)`,
          backgroundSize: '200% 100%',
          animation: 'tourShimmer 3s linear infinite',
        }} />

        {/* Header */}
        <div style={{ padding: '18px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={stepPill}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
              Шаг {stepIndex + 1} из {totalSteps}
            </div>
            <button
              onClick={onSkip}
              aria-label="Закрыть"
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .15s ease, color .15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${DANGER}10`; e.currentTarget.style.color = DANGER; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          <h3 style={{
            margin: 0, fontSize: '1.05rem', fontWeight: 700,
            color: DARK, letterSpacing: '-0.01em', lineHeight: 1.3,
          }}>
            {step.title}
          </h3>
        </div>

        {/* Body */}
        <div style={{
          padding: '10px 20px 16px',
          fontSize: '0.88rem', color: MUTED, lineHeight: 1.55,
          overflowY: 'auto', flex: '1 1 auto', minHeight: 0,
        }}>
          {step.text}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px 14px', flex: '0 0 auto' }}>
          <div className="tour-footer-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button
              onClick={onPrev}
              disabled={stepIndex === 0}
              style={{
                ...ghostBtn,
                padding: '8px 14px',
                fontSize: '0.82rem',
                opacity: stepIndex === 0 ? 0.45 : 1,
                cursor: stepIndex === 0 ? 'default' : 'pointer',
                color: stepIndex === 0 ? MUTED : DARK,
              }}
              onMouseEnter={e => { if (stepIndex !== 0) { e.currentTarget.style.background = SOFT_BG; e.currentTarget.style.borderColor = `${ACCENT}40`; } }}
              onMouseLeave={e => { if (stepIndex !== 0) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = BORDER; } }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Назад
            </button>

            <StepDots total={totalSteps} current={stepIndex} />

            <button
              onClick={onNext}
              style={{
                ...primaryBtn,
                padding: '8px 16px',
                fontSize: '0.82rem',
                borderRadius: 10,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${ACCENT}55`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 14px ${ACCENT}40`; }}
            >
              {isLastStep ? 'Завершить' : 'Далее'}
              {!isLastStep && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            {!isLastStep ? (
              <button
                onClick={onNext}
                style={subtleTextBtn}
                onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.color = MUTED; }}
              >
                Пропустить шаг
              </button>
            ) : <span />}
            <button
              onClick={onSkip}
              style={subtleTextBtn}
              onMouseEnter={e => { e.currentTarget.style.color = DANGER; }}
              onMouseLeave={e => { e.currentTarget.style.color = MUTED; }}
            >
              Завершить обучение
            </button>
          </div>
        </div>
      </div>

      <style>{tourKeyframes}</style>
    </div>
  );
}

function StepDots({ total, current }) {
  // Cap visible dots so 28-step tour doesn't overflow tooltip width
  const MAX_DOTS = 8;
  if (total <= MAX_DOTS) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{
            width: i === current ? 18 : 4, height: 4, borderRadius: 4,
            background: i <= current ? ACCENT : '#e5e7eb',
            transition: 'all .25s ease',
          }} />
        ))}
      </div>
    );
  }
  // Compressed view: show progress bar + count
  const pct = ((current + 1) / total) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 140 }}>
      <div style={{
        flex: 1, height: 4, borderRadius: 4,
        background: '#e5e7eb', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
          transition: 'width .3s ease',
        }} />
      </div>
    </div>
  );
}

/**
 * Заглушка — использовали раньше для page-level подсказок.
 * Теперь все шаги в едином сценарии главного тура. Хук оставлен для совместимости.
 */
export function usePageOnboarding() {
  return { overlay: null, restart: () => {}, active: false };
}

function calcTooltipPos(rect, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 480;
  const mobile = vw <= 768;
  // On narrow screens shrink the tooltip and force a `bottom` placement so
  // we never try to fit a 360px card next to a 280px-wide drawer.
  const tooltipW = narrow ? Math.min(360, vw - 24) : 360;
  const tooltipH = narrow ? 280 : 240;
  const margin = narrow ? 12 : 16;
  const effectivePlacement = narrow ? 'bottom' : placement;
  let top, left;

  switch (effectivePlacement) {
    case 'right':
      left = rect.left + rect.width + margin;
      top = rect.top + rect.height / 2 - tooltipH / 2;
      if (left + tooltipW > vw - 20) {
        // On mobile the drawer (~280px) covers the left, so prefer below.
        if (mobile) {
          left = Math.max(12, Math.min(vw - tooltipW - 12, rect.left + rect.width / 2 - tooltipW / 2));
          top = rect.top + rect.height + margin;
        } else {
          left = Math.max(20, rect.left + rect.width / 2 - tooltipW / 2);
          top = rect.top + rect.height + margin;
        }
      }
      break;
    case 'bottom':
      left = Math.max(narrow ? 12 : 20, Math.min(vw - tooltipW - (narrow ? 12 : 20), rect.left + rect.width / 2 - tooltipW / 2));
      top = rect.top + rect.height + margin;
      break;
    case 'top':
      left = Math.max(narrow ? 12 : 20, Math.min(vw - tooltipW - (narrow ? 12 : 20), rect.left + rect.width / 2 - tooltipW / 2));
      top = rect.top - tooltipH - margin;
      break;
    case 'left':
    default:
      left = rect.left - tooltipW - margin;
      top = rect.top + rect.height / 2 - tooltipH / 2;
      break;
  }
  top = Math.max(narrow ? 12 : 20, Math.min(vh - tooltipH - (narrow ? 12 : 20), top));
  left = Math.max(narrow ? 12 : 20, Math.min(vw - tooltipW - (narrow ? 12 : 20), left));
  return { left, top, width: tooltipW };
}

const tourKeyframes = `
  @keyframes tourFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes tourPop {
    0% { opacity: 0; transform: scale(0.94) translateY(6px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes tourPulseRing {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.05); opacity: 0.3; }
  }
  @keyframes tourShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* — Mobile tour styling — */
  @media (max-width: 480px) {
    .tour-tooltip-card {
      max-width: calc(100vw - 16px) !important;
      min-width: 0 !important;
      font-size: 0.95em;
    }
    .tour-tooltip-card h3 { font-size: 1rem !important; }
    .tour-tooltip-card .tour-footer-row {
      flex-wrap: wrap;
      gap: 6px !important;
    }
    .tour-tooltip-card .tour-footer-row > button {
      padding: 8px 12px !important;
      font-size: 0.78rem !important;
    }
    .tour-welcome-modal {
      max-width: calc(100vw - 24px) !important;
      padding: 24px 18px !important;
    }
    .tour-welcome-modal h2 { font-size: 1.35rem !important; }
    .tour-welcome-modal .tour-welcome-actions {
      flex-direction: column !important;
      gap: 8px !important;
    }
    .tour-welcome-modal .tour-welcome-actions > button {
      width: 100% !important;
      justify-content: center;
    }
    .tour-welcome-modal .tour-welcome-hero {
      width: 78px !important;
      height: 78px !important;
      margin-bottom: 16px !important;
    }
  }
`;
