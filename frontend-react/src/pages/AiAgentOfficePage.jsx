import { useEffect, useMemo, useState } from 'react';

const purple = '#6d5dfc';
const ink = '#17172b';
const muted = '#73758a';
const border = '#e6e7ef';

const steps = [
  ['brief', 'Получает задачу', 'Читает бриф и ограничения', '📨'],
  ['research', 'Изучает источники', 'Сайт, соцсети и каталог', '🔎'],
  ['strategy', 'Собирает стратегию', 'Связывает цели и продукты', '🧠'],
  ['content', 'Готовит материалы', 'Лид-магнит и контент-план', '📝'],
  ['check', 'Проверяет результат', 'Ссылки, структура и качество', '✅'],
];

export default function AiAgentOfficePage() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setStep(current => {
        if (current >= steps.length - 1) {
          clearInterval(timer);
          setRunning(false);
          setDone(true);
          return current;
        }
        return current + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [running]);

  const progress = step < 0 ? 0 : Math.round(((step + 1) / steps.length) * 100);
  const status = running ? 'Работает над задачей' : done ? 'Задача выполнена' : 'Готов к работе';
  const log = useMemo(() => {
    if (step < 0) return ['Агент ждёт первую задачу'];
    return steps.slice(0, step + 1).map(([, title, detail, icon]) => `${icon} ${title} — ${detail}`);
  }, [step]);

  const start = () => { setStep(-1); setDone(false); setRunning(true); };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ИИ АГЕНТ · ПРОТОТИП ОФИСА</div>
          <h1 style={styles.title}>Офис агентов</h1>
          <p style={styles.subtitle}>Так агент будет выполнять задачи внутри сервиса. Сейчас работает только первый сотрудник.</p>
        </div>
        <div style={styles.status}><span style={{ ...styles.dot, background: running ? '#f5a623' : done ? '#28b47a' : '#aeb1c1' }} />{status}</div>
      </header>

      <div style={styles.layout}>
        <main style={styles.office}>
          <div style={styles.officeTop}><span>MAX MARKETING OFFICE</span><span>смена 01 · онлайн</span></div>
          <div style={styles.scene}>
            <div style={styles.window}><i /><i /><i /><div>Идеи становятся системой</div></div>
            <div style={styles.plant}>🌿</div>
            <div style={styles.shelf}>▣ ▣ ▣<small>АРХИВ</small></div>
            <div style={styles.desk}><div style={styles.monitor}><div style={styles.monitorBar}>AGENT_OS <b>{progress}%</b></div><div style={styles.monitorScreen}>{running ? steps[Math.max(0, step)][1] : done ? 'Готово к проверке' : 'Новая задача'}</div></div><div style={styles.keyboard}>▰ ▰ ▰ ▰ ▰</div></div>
            <div style={{ ...styles.agent, animation: running ? 'bob 1s ease-in-out infinite' : 'none' }}><div style={styles.agentHead}>◉‿◉</div><div style={styles.agentBody}>▣</div><div style={styles.agentBadge}>A1</div></div>
            <div style={styles.taskBubble}>{running ? `Шаг ${step + 1} из ${steps.length}` : done ? 'Результат готов' : 'Жду задачу'}</div>
            <div style={styles.floorLine} />
          </div>
          <div style={styles.futureAgents}>
            {['Исследователь', 'Контент', 'Контроль'].map((name, i) => <div key={name} style={styles.future}><span>▣</span><div><b>{name}</b><small>Агент {i + 2} · скоро</small></div><em>заблокирован</em></div>)}
          </div>
        </main>

        <aside style={styles.sidebar}>
          <section style={styles.card}><div style={styles.cardLabel}>АКТИВНЫЙ СОТРУДНИК</div><div style={styles.person}><div style={styles.avatar}>A1</div><div><h2 style={{ margin: 0 }}>Офис-менеджер</h2><span style={{ color: '#28a878', fontSize: 13 }}>● готов принимать задачи</span></div></div><p style={styles.text}>Оркестрирует разделы сервиса и передаёт результат на согласование владельцу.</p><button style={styles.button} onClick={start} disabled={running}>{running ? 'Агент работает…' : done ? 'Запустить снова' : 'Дать тестовую задачу →'}</button></section>
          <section style={styles.card}><div style={styles.row}><b>Текущий процесс</b><strong>{progress}%</strong></div><div style={styles.progress}><span style={{ ...styles.progressFill, width: `${progress}%` }} /></div><div style={styles.steps}>{steps.map(([key, title, detail, icon], i) => <div key={key} style={{ ...styles.step, opacity: i <= step || (i === 0 && step < 0) ? 1 : .42 }}><span style={styles.stepIcon}>{icon}</span><div><b>{title}</b><small style={styles.small}>{i <= step ? detail : 'ожидает очереди'}</small></div><span style={styles.check}>{i <= step ? '✓' : '·'}</span></div>)}</div></section>
          <section style={styles.card}><div style={styles.cardLabel}>ЖУРНАЛ ДЕЙСТВИЙ</div>{log.map((item, i) => <div key={`${item}-${i}`} style={styles.log}>{item}<time>{i === log.length - 1 && running ? 'сейчас' : 'готово'}</time></div>)}</section>
        </aside>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f6f7fb', color: ink, padding: '30px clamp(18px, 4vw, 58px)', fontFamily: "'DM Sans', system-ui, sans-serif" },
  header: { maxWidth: 1320, margin: '0 auto 24px', display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'end', flexWrap: 'wrap' },
  eyebrow: { color: purple, fontWeight: 800, fontSize: 12, letterSpacing: '.12em' },
  title: { fontSize: 'clamp(28px, 4vw, 44px)', margin: '7px 0 6px', letterSpacing: '-.04em' },
  subtitle: { color: muted, margin: 0, maxWidth: 670, lineHeight: 1.5 },
  status: { background: '#fff', border: `1px solid ${border}`, borderRadius: 999, padding: '10px 14px', fontSize: 13, fontWeight: 700 },
  dot: { width: 8, height: 8, display: 'inline-block', borderRadius: '50%', marginRight: 8 },
  layout: { maxWidth: 1320, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, .75fr)', gap: 20 },
  office: { background: '#29264e', borderRadius: 22, overflow: 'hidden', boxShadow: '0 15px 45px rgba(31,25,80,.16)' },
  officeTop: { color: '#bcb8e8', display: 'flex', justifyContent: 'space-between', padding: '16px 20px', fontSize: 11, letterSpacing: '.1em', fontWeight: 800 },
  scene: { minHeight: 470, position: 'relative', overflow: 'hidden', background: 'linear-gradient(#4a467a 0 70%, #322f5b 70%)' },
  window: { position: 'absolute', left: '8%', top: '9%', width: '44%', height: 170, background: '#b9e1ec', border: '12px solid #65619a', boxShadow: 'inset 0 0 0 5px #403d70', color: '#3d5a79', padding: 16, boxSizing: 'border-box', fontSize: 15, fontWeight: 800 },
  plant: { position: 'absolute', right: '8%', top: '17%', fontSize: 50 }, shelf: { position: 'absolute', right: '8%', top: '45%', color: '#e8bd80', fontSize: 28, letterSpacing: 8, background: '#47426e', padding: '12px 18px', borderBottom: '7px solid #75523e' },
  floorLine: { position: 'absolute', bottom: 84, left: 0, right: 0, borderTop: '5px solid #4b477b' },
  desk: { position: 'absolute', left: '21%', bottom: 83, width: '48%', height: 26, background: '#bc754e', borderRadius: 5, boxShadow: '0 10px 0 #70455b' },
  monitor: { position: 'absolute', left: '30%', bottom: 28, width: 170, height: 112, background: '#20203e', border: '8px solid #827caf', borderRadius: 8, color: '#91e6bb', boxShadow: '0 8px 0 #3b3150' },
  monitorBar: { fontSize: 9, padding: 6, background: '#302d55', display: 'flex', justifyContent: 'space-between' },
  monitorScreen: { padding: '22px 10px', textAlign: 'center', fontSize: 13, fontWeight: 800 },
  keyboard: { position: 'absolute', left: '35%', top: 7, color: '#3e2c4c', fontSize: 12 },
  agent: { position: 'absolute', left: '65%', bottom: 81, width: 80, textAlign: 'center', color: '#fff' },
  agentHead: { margin: 'auto', width: 53, height: 43, paddingTop: 11, boxSizing: 'border-box', borderRadius: '15px 15px 10px 10px', background: '#f0ad65', color: '#4d3557', fontWeight: 900, fontSize: 17 },
  agentBody: { margin: '2px auto 0', width: 64, height: 58, borderRadius: '15px 15px 5px 5px', background: purple, paddingTop: 15, boxSizing: 'border-box', fontSize: 21 },
  agentBadge: { position: 'absolute', right: 0, top: -9, background: '#28b47a', borderRadius: 99, padding: '3px 6px', fontSize: 10, fontWeight: 900 },
  taskBubble: { position: 'absolute', right: '8%', bottom: 203, color: '#302d55', background: '#fff3ce', padding: '9px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800 },
  futureAgents: { padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: '#211f41' },
  future: { display: 'flex', alignItems: 'center', gap: 8, background: '#302d55', color: '#c8c5e6', borderRadius: 10, padding: 10, fontSize: 11 },
  sidebar: { display: 'grid', gap: 14, alignContent: 'start' }, card: { background: '#fff', border: `1px solid ${border}`, borderRadius: 16, padding: 18, boxShadow: '0 4px 15px rgba(20,25,50,.04)' }, cardLabel: { color: muted, fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }, person: { display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0' }, avatar: { width: 45, height: 45, borderRadius: 13, background: 'linear-gradient(135deg,#806fff,#4e48b8)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900 }, text: { color: muted, fontSize: 13, lineHeight: 1.5 }, button: { width: '100%', border: 0, borderRadius: 10, padding: 13, background: `linear-gradient(135deg,${purple},#4361ee)`, color: '#fff', fontWeight: 800, cursor: 'pointer' }, row: { display: 'flex', justifyContent: 'space-between', fontSize: 13 }, progress: { height: 8, background: '#edeefa', borderRadius: 99, overflow: 'hidden', margin: '12px 0 16px' }, progressFill: { display: 'block', height: '100%', background: `linear-gradient(90deg,${purple},#32b8ff)`, borderRadius: 99, transition: 'width .4s' }, steps: { display: 'grid', gap: 12 }, step: { display: 'grid', gridTemplateColumns: '29px 1fr 18px', alignItems: 'center', gap: 8 }, stepIcon: { width: 29, height: 29, display: 'grid', placeItems: 'center', background: '#f2f0ff', borderRadius: 9, fontSize: 14 }, small: { display: 'block', color: muted, fontSize: 11, marginTop: 3 }, check: { color: '#28a878', fontWeight: 900 }, log: { borderTop: `1px solid ${border}`, padding: '9px 0', fontSize: 12, lineHeight: 1.4 },
};
