import { useEffect, useMemo, useRef, useState } from 'react';

const steps = [
  ['post', 'Посты', 'пишет пост для канала', '✎'],
  ['image', 'Изображения', 'генерирует изображение', '▣'],
  ['schedule', 'Планирование', 'ставит публикацию в план', '◷'],
  ['topics', 'Темы видео', 'подбирает темы для видео', '◉'],
  ['scripts', 'Сценарии', 'готовит сценарий ролика', '▶'],
  ['comments', 'Комментарии', 'настраивает автоответы', '☵'],
];

const skills = [
  'Писать посты',
  'Генерировать картинки',
  'Планировать публикации',
  'Придумывать темы для видео',
  'Писать сценарии видео и Shorts',
  'Отвечать на новые комментарии',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const animationTimings = {
  idle: 210,
  walk: 105,
  work: 130,
  reaction: 115,
};

export default function AiAgentOfficePage() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [position, setPosition] = useState({ x: 51, y: 82 });
  const [target, setTarget] = useState(null);
  const [moving, setMoving] = useState(false);
  const [direction, setDirection] = useState('right');
  const [reacting, setReacting] = useState(false);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [agentMessage, setAgentMessage] = useState('> КЛИКНИТЕ НА ПОЛ — Я ПОДОЙДУ');
  const movementTimer = useRef(null);
  const reactionTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(movementTimer.current);
    clearTimeout(reactionTimer.current);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setStep(current => {
      if (current >= steps.length - 1) {
        clearInterval(timer);
        setRunning(false);
        setDone(true);
        setAgentMessage('> SMM-ЗАДАЧА ВЫПОЛНЕНА');
        return current;
      }
      return current + 1;
    }), 1350);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (running && step >= 0) setAgentMessage(`> ${steps[step][1].toUpperCase()}...`);
  }, [running, step]);

  const animationState = reacting ? 'reaction' : moving ? 'walk' : running ? 'work' : 'idle';

  useEffect(() => {
    setAnimationFrame(0);
    const timer = setInterval(() => {
      setAnimationFrame(current => animationState === 'reaction'
        ? Math.min(current + 1, 7)
        : (current + 1) % 8);
    }, animationTimings[animationState]);
    return () => clearInterval(timer);
  }, [animationState]);

  const progress = step < 0 ? 0 : Math.round(((step + 1) / steps.length) * 100);
  const status = moving ? 'ИДЁТ' : running ? 'РАБОТАЕТ' : done ? 'ГОТОВО' : 'ОЖИДАЕТ ЗАДАЧУ';
  const log = useMemo(() => step < 0
    ? ['SMM-специалист на рабочем месте']
    : steps.slice(0, step + 1).map(([, title, detail]) => `${title}: ${detail}`), [step]);

  const start = () => {
    setStep(-1);
    setDone(false);
    setRunning(true);
    setAgentMessage('> ПРИНЯЛ SMM-ЗАДАЧУ');
  };

  const walkTo = event => {
    if (event.target.closest('.agent-avatar') || event.target.closest('.scene-ui')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 12, 88);
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 58, 84);

    clearTimeout(movementTimer.current);
    setDirection(x < position.x ? 'left' : 'right');
    setTarget({ x, y });
    setMoving(true);
    setReacting(false);
    setPosition({ x, y });
    setAgentMessage('> ИДУ ТУДА');
    movementTimer.current = setTimeout(() => {
      setMoving(false);
      setTarget(null);
      setAgentMessage(running ? '> ПРОДОЛЖАЮ РАБОТУ' : '> Я НА МЕСТЕ!');
    }, 950);
  };

  const reactToClick = event => {
    event.stopPropagation();
    clearTimeout(reactionTimer.current);
    setReacting(false);
    requestAnimationFrame(() => setReacting(true));
    setAgentMessage('> ПРИВЕТ! Я ВАШ SMM-СПЕЦИАЛИСТ');
    reactionTimer.current = setTimeout(() => {
      setReacting(false);
      setAgentMessage(running ? '> ВОЗВРАЩАЮСЬ К ЗАДАЧЕ' : '> ГОТОВ К РАБОТЕ');
    }, animationTimings.reaction * 8);
  };

  const spriteStyle = {
    '--sprite-column': `${(animationFrame / 7) * 100}%`,
    '--sprite-row': `${({ idle: 0, walk: 1, work: 2, reaction: 3 }[animationState] / 3) * 100}%`,
  };
  const spriteState = `${animationState} ${animationState === 'walk' ? `facing-${direction}` : ''} ${done ? 'finished' : ''}`;

  return <div className="agent-game">
    <div className="game-topbar"><div><span className="game-logo">MAX</span><span className="game-title">MARKETING OFFICE</span></div><div className="top-meta">СМЕНА 01 / 1994 &nbsp; ● СИСТЕМА ОНЛАЙН</div></div>
    <div className="game-layout">
      <main className="game-stage" onClick={walkTo} aria-label="Офис. Нажмите на пол, чтобы переместить агента">
        <div className="scene-bg" /><div className="floor-hit-area" /><div className="scanlines" />
        <div className="scene-caption scene-ui"><span>ОФИС №01</span><span>{status}</span></div>
        {target && <span className="walk-target" style={{ left: `${target.x}%`, top: `${target.y}%` }} aria-hidden="true" />}
        <button type="button" className="agent-avatar" style={{ left: `${position.x}%`, top: `${position.y}%`, '--agent-scale': 0.84 + ((position.y - 58) / 26) * 0.16 }} onClick={reactToClick} aria-label="SMM-специалист. Нажмите, чтобы поздороваться">
          <span className={`agent-sprite ${spriteState}`} style={spriteStyle} /><span className="speech">{agentMessage}</span>
        </button>
        <div className="movement-hint scene-ui">◎ НАЖМИТЕ НА ПОЛ, ЧТОБЫ ПЕРЕМЕСТИТЬСЯ</div>
        <div className="room-tag tag-archive scene-ui">АРХИВ</div><div className="room-tag tag-board scene-ui">КОНТЕНТ-ПЛАН</div><div className="room-tag tag-pc scene-ui">SMM_DESK</div>
        <div className="desk-readout scene-ui"><span>ЗАДАЧА</span><b>{running ? steps[Math.max(0, step)][2].toUpperCase() : done ? 'ПЕРЕДАНО НА ПРОВЕРКУ' : 'НЕ НАЗНАЧЕНА'}</b><i>{progress}%</i></div>
      </main>
      <aside className="game-panel">
        <section className="panel-section agent-card"><div className="panel-kicker">СОТРУДНИК 01 / ACTIVE</div><div className="agent-name"><span className="mini-face">☺</span><div><h1>SMM-специалист</h1><small>контент и коммуникации</small></div></div><p>Ведёт контент от идеи до публикации и общается с аудиторией.</p><div className="skill-list">{skills.map(skill => <span key={skill}>{skill}</span>)}</div><button onClick={start} disabled={running}>{running ? 'АГЕНТ РАБОТАЕТ...' : done ? 'ЗАПУСТИТЬ СНОВА' : 'ДАТЬ SMM-ЗАДАЧУ  ▶'}</button></section>
        <section className="panel-section"><div className="panel-line"><span>ПРОТОКОЛ ВЫПОЛНЕНИЯ</span><b>{progress}%</b></div><div className="pixel-progress"><span style={{ width: `${progress}%` }} /></div><div className="quest-list">{steps.map(([key, title, detail, icon], i) => <div className={`quest ${i <= step ? 'active' : ''}`} key={key}><span>{i <= step ? '✓' : icon}</span><div><b>{title}</b><small>{i <= step ? detail : 'ожидание'}</small></div></div>)}</div></section>
        <section className="panel-section log-panel"><div className="panel-kicker">ЖУРНАЛ СИСТЕМЫ</div>{log.map((item, i) => <div className="log-row" key={`${item}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span>{item}<em>{i === log.length - 1 && running ? '...' : 'OK'}</em></div>)}</section>
      </aside>
    </div>
    <div className="future-strip"><div className="strip-title">ОСТАЛЬНЫЕ МЕСТА <small>РАЗБЛОКИРУЮТСЯ ПОСЛЕ ПОДКЛЮЧЕНИЯ АГЕНТОВ</small></div>{['ИССЛЕДОВАТЕЛЬ', 'ДИЗАЙНЕР', 'КОНТРОЛЬ'].map((name, i) => <div className="future-agent" key={name}><span>A0{i + 2}</span><b>{name}</b><em>LOCKED</em></div>)}</div>
  </div>;
}
