import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ACCENT = '#4361ee';
const ACCENT2 = '#7b68ee';
const SUCCESS = '#10b981';
const DANGER = '#e63946';
const WARNING = '#f59e0b';
const DARK = '#1a1a2e';
const MUTED = '#6b7280';
const BORDER = '#f0f0f0';
const SOFT_BG = '#f8f9fc';

const cardBase = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
  color: '#fff', fontSize: '0.92rem', fontWeight: 700,
  boxShadow: `0 4px 14px ${ACCENT}40`,
  textDecoration: 'none',
  letterSpacing: '-0.01em',
  transition: 'transform .15s ease, box-shadow .15s ease',
};

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 22px', borderRadius: 12, cursor: 'pointer',
  background: '#fff', border: `1px solid ${BORDER}`,
  color: DARK, fontSize: '0.92rem', fontWeight: 600,
  textDecoration: 'none',
  letterSpacing: '-0.01em',
  transition: 'border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease',
};

const sectionTitleStyle = {
  margin: 0, fontSize: '1.1rem', fontWeight: 700,
  color: DARK, letterSpacing: '-0.01em',
};

const sectionSubStyle = {
  margin: '3px 0 0', fontSize: '0.78rem', color: MUTED,
};

const stepNumberAvatar = (grad) => ({
  width: 56, height: 56, borderRadius: 16, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)`,
  color: '#fff', fontSize: '1.5rem', fontWeight: 800,
  letterSpacing: '-0.02em',
  boxShadow: `0 6px 18px ${grad[0]}38`,
  position: 'relative', overflow: 'hidden',
});

const screenshotImg = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  maxHeight: 480,
  objectFit: 'contain',
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  background: SOFT_BG,
  marginTop: 14,
};

const eyebrowPill = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '7px 14px', borderRadius: 30,
  background: `linear-gradient(135deg, ${ACCENT}10, ${ACCENT2}10)`,
  border: `1px solid ${ACCENT}25`,
  fontSize: '0.78rem', fontWeight: 700,
  color: ACCENT, letterSpacing: '0.01em',
  marginBottom: 22,
};

const codeBlockStyle = {
  display: 'block',
  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  fontSize: '0.85rem',
  padding: '14px 16px',
  borderRadius: 10,
  background: SOFT_BG,
  border: `1px solid ${BORDER}`,
  color: ACCENT,
  marginTop: 10,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const STEPS_CREATE = [
  {
    title: 'Создайте закрытый канал в MAX',
    desc: 'Откройте MAX, создайте новый закрытый канал — он будет основой для вашей аудитории.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/258/h/fc9788f53d94ae47abc3bd4a568142d7.png',
  },
  {
    title: 'Введите название канала',
    desc: 'Придумайте короткое и понятное название — оно будет первым, что увидят подписчики.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/479/h/60a99f27c130128595648d8bb39633f2.png',
  },
  {
    title: 'Авторизуйтесь в MAX Маркетинг',
    desc: 'Перейдите по ссылке max.pkmarketing.ru/login и войдите через MAX.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/55/h/c0053f91797d4036fcc3f6706909c41b.png',
    cta: { label: 'Открыть MAX Маркетинг', to: '/login' },
  },
  {
    title: 'Добавьте канал в сервис',
    desc: 'Во вкладке «Обзор» нажмите «Добавить канал» и следуйте инструкции.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/388/h/9f30ff9dda49c82af3a2c7cb3c4d128e.png',
  },
  {
    title: 'Добавьте бота «ПКРеклама» в подписчики канала',
    desc: 'Найдите бота в MAX и подпишите его на ваш канал.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/203/h/c526cf2ffedb41bc8596829610922fb4.png',
  },
  {
    title: 'Сделайте бота администратором канала',
    desc: 'Это нужно чтобы сервис мог публиковать посты, считать аналитику и управлять закрепами.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/384/h/7fa7785dace1ef321f9c2ac0a8ce742b.png',
  },
];

const FORM_FIELDS = [
  { label: 'Ваша сфера', required: true, color: ACCENT },
  { label: 'Цвета', required: false, color: ACCENT2 },
  { label: 'Фото (необязательно)', required: false, color: WARNING },
  { label: 'Стиль', required: false, color: SUCCESS },
  { label: 'Ссылка для связи', required: true, color: DANGER },
  { label: 'Описание', required: false, color: MUTED },
];

const STEPS_AUTO = [
  {
    title: 'Откройте раздел «ИИ Оформление»',
    desc: 'В сайдбаре найдите «ИИ Оформление» в категории Маркетинг.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/294/h/b813e6ba0ee9d8d91f7b5dba8b471048.png',
  },
  {
    title: 'Заполните анкету о канале',
    desc: 'Укажите сферу, цвета, стиль, ссылку для связи и пожелания. Загрузите фото если хотите чтобы оно было использовано.',
    fields: FORM_FIELDS,
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/178/h/f9d721ef29d8df0879b7348bc7954b81.png',
  },
  {
    title: 'Выберите аватар и описание',
    desc: 'ИИ сгенерирует 9 аватаров и несколько вариантов описания. Нажмите «Применить и продолжить».',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/95/h/7941cf5fd00b0403d880e9f1c9e75021.png',
  },
  {
    title: 'Лид-магнит — подарок за подписку',
    desc: 'Можете загрузить файл с вашими постами из других соцсетей и описать чего хотите. Нажмите «Сгенерировать варианты».',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/62/h/60cbcc092c5251507b2430db13e262a1.png',
  },
  {
    title: 'Выберите лид-магнит',
    desc: '',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/343/h/13f0e91caff513d8dd3b12d5e6ec7e98.png',
  },
  {
    title: 'Получите готовый лид-магнит и пост-закреп. Нажмите «Установить»',
    desc: '',
    images: [
      'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/46/h/2868f0577425ba25b5b2121175a6ce9d.png',
      'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/62/h/22a140894368cbcc26844d9e5d5b1798.png',
    ],
  },
];

const STEPS_MANUAL = [
  {
    title: 'Сгенерируйте 9 аватаров через ПК Маркетинг',
    desc: 'Откройте «Фото 2.0» и используйте промт:',
    code: 'Сгенерируй мне 9 аватарок для канала в тематике (Ваша тематика). Сделай эти картинки сеткой 3х3.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/16/h/9fd325772320a73d389986ea01bb5929.png',
  },
  {
    title: 'Установите аватарку и описание в канале',
    desc: '',
  },
  {
    title: 'Создайте лид-магнит',
    desc: 'Перейдите в раздел «Закрепы» → «Лид-магниты» в MAX Маркетинг.',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/102/h/29d4081f52c297ba0af6517f67a3680f.png',
  },
  {
    title: 'Создайте закреп с кнопкой лид-магнита',
    desc: '',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/280/h/d72817e032b29f22b1d8cbfd0b8f5eb0.png',
  },
  {
    title: 'Нажмите «Опубликовать»',
    desc: '',
    img: 'https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/356/h/1b773db23842303ec920411817685005.png',
  },
];

const stepGradient = (i) => {
  const palette = [
    [ACCENT, ACCENT2],
    [ACCENT2, '#a855f7'],
    ['#06b6d4', ACCENT],
    [SUCCESS, '#34d399'],
    [WARNING, '#f97316'],
    [ACCENT, '#06b6d4'],
  ];
  return palette[i % palette.length];
};

function StepCard({ index, step, animDelay }) {
  const grad = stepGradient(index);
  return (
    <div
      className="cl-card"
      style={{
        ...cardBase,
        padding: 22,
        animation: `dashFadeUp 0.4s ease ${animDelay}s both`,
      }}
    >
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={stepNumberAvatar(grad)}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.30), transparent 60%)',
            pointerEvents: 'none',
          }} />
          <span style={{ position: 'relative', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}>{index + 1}</span>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{
            margin: 0, fontSize: '1.05rem', fontWeight: 700,
            color: DARK, letterSpacing: '-0.01em', lineHeight: 1.35,
          }}>
            {step.title}
          </h3>
          {step.desc && (
            <p style={{
              margin: '8px 0 0', fontSize: '0.92rem', color: MUTED,
              lineHeight: 1.55,
            }}>
              {step.desc}
            </p>
          )}

          {step.fields && (
            <div style={{
              marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8,
              padding: 14, background: SOFT_BG, borderRadius: 12, border: `1px solid ${BORDER}`,
            }}>
              {step.fields.map((f) => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: f.color, boxShadow: `0 0 8px ${f.color}80`,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '0.88rem', color: DARK, fontWeight: 500 }}>
                    {f.label}
                    {f.required && <span style={{ color: DANGER, marginLeft: 4 }}>*</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {step.code && (
            <code style={codeBlockStyle}>{step.code}</code>
          )}

          {step.cta && (
            <div style={{ marginTop: 14 }}>
              <a
                href={step.cta.to}
                className="cl-primary"
                style={{ ...primaryBtn, padding: '10px 18px', fontSize: '0.85rem' }}
              >
                {step.cta.label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>

      {step.img && (
        <img
          src={step.img}
          alt={step.title}
          loading="lazy"
          style={screenshotImg}
        />
      )}
      {step.images && step.images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`${step.title} (${i + 1})`}
          loading="lazy"
          style={screenshotImg}
        />
      ))}
    </div>
  );
}

export default function CheckListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('auto');

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${SOFT_BG} 0%, #fff 60%, ${SOFT_BG} 100%)`,
      fontFamily: '"DM Sans", -apple-system, system-ui, sans-serif',
      color: DARK,
    }}>
      <style>{`
        @keyframes dashFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dashPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.06); } }
        @keyframes blobFloat { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(18px, -14px) scale(1.05); } }
        @keyframes blobFloat2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-22px, 16px) scale(1.08); } }
        @keyframes tabFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .cl-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
          border-color: ${ACCENT}25 !important;
        }
        .cl-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${ACCENT}55 !important;
        }
        .cl-ghost:hover {
          background: ${SOFT_BG} !important;
          border-color: ${ACCENT}55 !important;
          color: ${ACCENT} !important;
          transform: translateY(-1px);
        }
        .cl-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 20px; border-radius: 30px;
          font-size: 0.92rem; font-weight: 700; letter-spacing: -0.01em;
          cursor: pointer; border: 1.5px solid ${BORDER}; background: #fff;
          color: ${MUTED};
          transition: all .2s ease;
        }
        .cl-tab:hover { color: ${DARK}; border-color: ${ACCENT}40; }
        .cl-tab.active {
          background: linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%);
          border-color: transparent; color: #fff;
          box-shadow: 0 4px 14px ${ACCENT}40;
        }
        .cl-tab-flow { animation: tabFade 0.35s ease both; }
        .cl-white-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 22px; border-radius: 12px; cursor: pointer;
          background: #fff; border: none; color: ${ACCENT};
          font-size: 0.92rem; font-weight: 700; letter-spacing: -0.01em;
          text-decoration: none;
          box-shadow: 0 4px 14px rgba(0,0,0,0.10);
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .cl-white-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
        .cl-ghost-on-grad {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 22px; border-radius: 12px; cursor: pointer;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.32);
          color: #fff; font-size: 0.92rem; font-weight: 600; letter-spacing: -0.01em;
          text-decoration: none; backdrop-filter: blur(8px);
          transition: background .15s ease, transform .15s ease, border-color .15s ease;
        }
        .cl-ghost-on-grad:hover { background: rgba(255,255,255,0.20); border-color: rgba(255,255,255,0.55); transform: translateY(-1px); }
        @media (max-width: 768px) {
          .cl-hero { padding: 28px 16px !important; }
          .cl-hero-title { font-size: 1.4rem !important; }
          .cl-hero-sub { font-size: 0.92rem !important; }
          .cl-section { padding: 0 16px !important; }
          .cl-card { padding: 16px !important; }
          .cl-card .cl-step-avatar { width: 44px !important; height: 44px !important; font-size: 1.2rem !important; }
          .cl-cta-card { padding: 28px 20px !important; }
          .cl-cta-title { font-size: 1.4rem !important; }
          .cl-tabs-row { gap: 8px !important; }
          .cl-tab { padding: 10px 14px !important; font-size: 0.82rem !important; }
          .cl-final-card { padding: 18px !important; flex-direction: column !important; align-items: stretch !important; }
        }
      `}</style>

      <div style={{ animation: 'dashFade 0.4s ease', maxWidth: 880, margin: '0 auto', padding: '24px 24px 64px' }}>
        <section
          className="cl-hero"
          style={{
            position: 'relative', overflow: 'hidden',
            textAlign: 'center', maxWidth: 720, margin: '0 auto',
            padding: '52px 32px 40px',
          }}
        >
          <div aria-hidden style={{
            position: 'absolute', top: -40, left: '8%', width: 220, height: 220,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
            pointerEvents: 'none',
            animation: 'blobFloat 7s ease-in-out infinite',
            zIndex: 0,
          }} />
          <div aria-hidden style={{
            position: 'absolute', top: 40, right: '6%', width: 240, height: 240,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ACCENT2}30 0%, transparent 70%)`,
            pointerEvents: 'none',
            animation: 'blobFloat2 9s ease-in-out infinite',
            zIndex: 0,
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={eyebrowPill}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: ACCENT, boxShadow: `0 0 10px ${ACCENT}`,
              }} />
              Чек-лист · 5–10 минут
            </div>

            <h1
              className="cl-hero-title"
              style={{
                margin: 0,
                fontSize: '2rem', fontWeight: 800,
                letterSpacing: '-0.02em', lineHeight: 1.15,
                color: DARK,
              }}
            >
              Как создать и оформить канал в{' '}
              <span style={{
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>MAX</span>
            </h1>

            <p
              className="cl-hero-sub"
              style={{
                margin: '14px auto 0', fontSize: '1rem', color: MUTED,
                lineHeight: 1.55, maxWidth: 560,
              }}
            >
              Самый простой вариант — за 5 минут. Пошаговая инструкция со скриншотами.
            </p>

            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              justifyContent: 'center', marginTop: 28,
            }}>
              <a
                href="/login"
                onClick={(e) => { e.preventDefault(); navigate('/login'); }}
                className="cl-primary"
                style={primaryBtn}
              >
                Перейти в MAX Маркетинг
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              </a>
              <a
                href="https://max.ru"
                target="_blank"
                rel="noopener noreferrer"
                className="cl-ghost"
                style={ghostBtn}
              >
                Перейти в MAX
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M7 17L17 7M9 7h8v8"/>
                </svg>
              </a>
            </div>
          </div>
        </section>

        <section className="cl-section" style={{ marginTop: 36 }}>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ ...sectionTitleStyle, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Создание канала и подключение бота
            </h2>
            <p style={sectionSubStyle}>6 шагов — займёт около 5 минут</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {STEPS_CREATE.map((step, i) => (
              <StepCard key={i} index={i} step={step} animDelay={0.05 + i * 0.04} />
            ))}
          </div>
        </section>

        <section className="cl-section" style={{ marginTop: 48 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h2 style={{
              margin: 0, fontSize: '1.4rem', fontWeight: 800,
              color: DARK, letterSpacing: '-0.02em',
            }}>
              Дальше у вас 2 варианта
            </h2>
            <p style={{ ...sectionSubStyle, marginTop: 6, fontSize: '0.88rem' }}>
              Выберите способ оформления канала
            </p>
          </div>

          <div
            className="cl-tabs-row"
            style={{
              display: 'flex', gap: 12, justifyContent: 'center',
              flexWrap: 'wrap', marginBottom: 26,
            }}
          >
            <button
              className={`cl-tab${tab === 'auto' ? ' active' : ''}`}
              onClick={() => setTab('auto')}
            >
              <span style={{ fontSize: '1rem' }}>⚡</span>
              Автоматически (через ИИ)
              {tab === 'auto' && (
                <span style={{
                  fontSize: '0.66rem', padding: '2px 8px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.22)', color: '#fff',
                  fontWeight: 700, letterSpacing: '0.04em',
                  border: '1px solid rgba(255,255,255,0.28)',
                }}>
                  РЕКОМЕНДУЕМ
                </span>
              )}
            </button>
            <button
              className={`cl-tab${tab === 'manual' ? ' active' : ''}`}
              onClick={() => setTab('manual')}
            >
              <span style={{ fontSize: '1rem' }}>✋</span>
              Вручную
            </button>
          </div>

          {tab === 'auto' ? (
            <div className="cl-tab-flow" key="auto">
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ ...sectionTitleStyle }}>ИИ Оформление</h3>
                <p style={sectionSubStyle}>ИИ создаст аватар, описание и лид-магнит за пару минут</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {STEPS_AUTO.map((step, i) => (
                  <StepCard key={i} index={i} step={step} animDelay={0.05 + i * 0.04} />
                ))}
              </div>
            </div>
          ) : (
            <div className="cl-tab-flow" key="manual">
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ ...sectionTitleStyle }}>Без ИИ</h3>
                <p style={sectionSubStyle}>Дольше, но контроль над каждым шагом</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {STEPS_MANUAL.map((step, i) => (
                  <StepCard key={i} index={i} step={step} animDelay={0.05 + i * 0.04} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="cl-section" style={{ marginTop: 36 }}>
          <div
            className="cl-final-card"
            style={{
              display: 'flex', gap: 18, alignItems: 'flex-start',
              padding: 22, borderRadius: 16,
              background: `linear-gradient(135deg, ${SUCCESS}10 0%, ${ACCENT}08 100%)`,
              border: `1px solid ${SUCCESS}30`,
              animation: 'dashFadeUp 0.4s ease 0.05s both',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${SUCCESS} 0%, #34d399 100%)`,
              boxShadow: `0 6px 18px ${SUCCESS}40`, color: '#fff',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{
                margin: 0, fontSize: '1.1rem', fontWeight: 800,
                color: DARK, letterSpacing: '-0.02em',
              }}>
                Готово на 90%!
              </h3>
              <p style={{
                margin: '6px 0 0', fontSize: '0.92rem', color: DARK,
                lineHeight: 1.55, opacity: 0.78,
              }}>
                Теперь добавьте контент — 3–5 постов для начала будет достаточно. Запланировать публикации можно в разделе «Контент → Публикации».
              </p>
              <img
                src="https://fs.getcourse.ru/fileservice/file/download/a/939699/sc/79/h/9271875cb8a078f681a358f27a7699bd.png"
                alt="Контент - Публикации"
                loading="lazy"
                style={screenshotImg}
              />
            </div>
          </div>
        </section>

        <section className="cl-section" style={{ marginTop: 36 }}>
          <div
            className="cl-cta-card"
            style={{
              position: 'relative', overflow: 'hidden',
              padding: '40px 36px',
              borderRadius: 20,
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
              color: '#fff',
              textAlign: 'center',
              boxShadow: `0 18px 50px ${ACCENT}40`,
              animation: 'dashFadeUp 0.4s ease 0.1s both',
            }}
          >
            <div aria-hidden style={{
              position: 'absolute', top: -60, left: -40, width: 220, height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 70%)',
              animation: 'blobFloat 8s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
            <div aria-hidden style={{
              position: 'absolute', bottom: -80, right: -40, width: 260, height: 260,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
              animation: 'blobFloat2 10s ease-in-out infinite',
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2
                className="cl-cta-title"
                style={{
                  margin: 0, fontSize: '1.85rem', fontWeight: 800,
                  letterSpacing: '-0.02em', color: '#fff',
                  lineHeight: 1.2,
                }}
              >
                Это только начало вашего пути!
              </h2>
              <p style={{
                margin: '14px auto 0', fontSize: '1rem',
                color: 'rgba(255,255,255,0.92)', lineHeight: 1.55,
                maxWidth: 540,
              }}>
                На интенсиве я покажу как продвигать каналы и зарабатывать на них. Не пропустите!
              </p>
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap',
                justifyContent: 'center', marginTop: 26,
              }}>
                <a
                  href="/login"
                  onClick={(e) => { e.preventDefault(); navigate('/login'); }}
                  className="cl-white-btn"
                >
                  Перейти в MAX Маркетинг
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 12h14M13 5l7 7-7 7"/>
                  </svg>
                </a>
                <a
                  href="https://max.ru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cl-ghost-on-grad"
                >
                  Перейти в MAX
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M7 17L17 7M9 7h8v8"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
