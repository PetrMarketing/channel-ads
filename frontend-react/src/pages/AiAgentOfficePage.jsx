import { useEffect, useMemo, useState } from 'react';

const steps = [
  ['brief', 'Входящие', 'получает задачу', '✉'],
  ['research', 'Архив', 'изучает источники', '⌕'],
  ['strategy', 'Доска', 'собирает стратегию', '▦'],
  ['content', 'Компьютер', 'готовит материалы', '▣'],
  ['check', 'Контроль', 'проверяет результат', '✓'],
];

export default function AiAgentOfficePage() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setStep(current => {
      if (current >= steps.length - 1) { clearInterval(timer); setRunning(false); setDone(true); return current; }
      return current + 1;
    }), 1350);
    return () => clearInterval(timer);
  }, [running]);

  const progress = step < 0 ? 0 : Math.round(((step + 1) / steps.length) * 100);
  const status = running ? 'РАБОТАЕТ' : done ? 'ГОТОВО' : 'ОЖИДАЕТ ЗАДАЧУ';
  const log = useMemo(() => step < 0 ? ['Система: агент находится на рабочем месте'] : steps.slice(0, step + 1).map(([, title, detail]) => `${title}: ${detail}`), [step]);
  const start = () => { setStep(-1); setDone(false); setRunning(true); };

  return <div className="agent-game">
    <div className="game-topbar"><div><span className="game-logo">MAX</span><span className="game-title">MARKETING OFFICE</span></div><div className="top-meta">СМЕНА 01 / 1994 &nbsp; ● СИСТЕМА ОНЛАЙН</div></div>
    <div className="game-layout">
      <main className="game-stage">
        <div className="scene-bg" /><div className="scanlines" />
        <div className="scene-caption"><span>ОФИС №01</span><span>{status}</span></div>
        <div className={`agent-sprite ${running ? 'working' : ''} ${done ? 'finished' : ''}`} aria-label="ИИ Агент" />
        <div className="speech">{running ? `> ${steps[Math.max(0, step)][1]}...` : done ? '> ЗАДАЧА ВЫПОЛНЕНА' : '> ЖДУ НОВУЮ ЗАДАЧУ'}</div>
        <div className="room-tag tag-archive">АРХИВ</div><div className="room-tag tag-board">СТРАТЕГИЯ</div><div className="room-tag tag-pc">AGENT_OS</div>
        <div className="desk-readout"><span>ЗАДАЧА</span><b>{running ? steps[Math.max(0, step)][2].toUpperCase() : done ? 'ПЕРЕДАНО НА ПРОВЕРКУ' : 'НЕ НАЗНАЧЕНА'}</b><i>{progress}%</i></div>
      </main>
      <aside className="game-panel">
        <section className="panel-section agent-card"><div className="panel-kicker">СОТРУДНИК 01 / ACTIVE</div><div className="agent-name"><span className="mini-face">☺</span><div><h1>Офис-менеджер</h1><small>универсальный агент</small></div></div><p>Оркестрирует разделы сервиса и собирает результат в один проект.</p><button onClick={start} disabled={running}>{running ? 'АГЕНТ РАБОТАЕТ...' : done ? 'ЗАПУСТИТЬ СНОВА' : 'ДАТЬ ЗАДАЧУ  ▶'}</button></section>
        <section className="panel-section"><div className="panel-line"><span>ПРОТОКОЛ ВЫПОЛНЕНИЯ</span><b>{progress}%</b></div><div className="pixel-progress"><span style={{ width: `${progress}%` }} /></div><div className="quest-list">{steps.map(([key, title, detail, icon], i) => <div className={`quest ${i <= step ? 'active' : ''}`} key={key}><span>{i <= step ? '✓' : icon}</span><div><b>{title}</b><small>{i <= step ? detail : 'ожидание'}</small></div></div>)}</div></section>
        <section className="panel-section log-panel"><div className="panel-kicker">ЖУРНАЛ СИСТЕМЫ</div>{log.map((item, i) => <div className="log-row" key={`${item}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span>{item}<em>{i === log.length - 1 && running ? '...' : 'OK'}</em></div>)}</section>
      </aside>
    </div>
    <div className="future-strip"><div className="strip-title">ОСТАЛЬНЫЕ МЕСТА <small>РАЗБЛОКИРУЮТСЯ ПОСЛЕ ПОДКЛЮЧЕНИЯ АГЕНТОВ</small></div>{['ИССЛЕДОВАТЕЛЬ', 'КОНТЕНТ', 'КОНТРОЛЬ'].map((name, i) => <div className="future-agent" key={name}><span>A0{i + 2}</span><b>{name}</b><em>LOCKED</em></div>)}</div>
  </div>;
}

