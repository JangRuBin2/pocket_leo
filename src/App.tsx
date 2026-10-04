import { useEffect, useRef, useState } from 'react';
import { Game, type Action, type EventGame, type Stats } from './game/engine';

const EVENTS: Record<EventGame, { name: string; go: string }> = {
  cake: { name: '레오 생일 케이크 만들기', go: '케이크 만들러 가기' },
  trick: { name: '개인기 연습하기', go: '개인기 연습하러 가기' },
  sock: { name: '양말 물기', go: '양말 사냥하러 가기' },
};

const METERS: { key: keyof Stats; label: string; color: string }[] = [
  { key: 'hunger', label: '배부름', color: 'var(--orange)' },
  { key: 'mood', label: '기분', color: 'var(--pink)' },
  { key: 'clean', label: '깨끗함', color: 'var(--blue)' },
  { key: 'energy', label: '쌩쌩함', color: 'var(--green)' },
];

const ACTIONS: { kind: Action; label: string; icon: JSX.Element }[] = [
  {
    kind: 'feed',
    label: '밥 주기',
    icon: (
      <>
        <path d="M5 15c1 7 5 9 11 9s10-2 11-9z" fill="var(--blue)" />
        <path d="M8 15c1-5 15-5 16 0z" fill="var(--brown)" />
      </>
    ),
  },
  {
    kind: 'treat',
    label: '쌩쌩이',
    icon: (
      <>
        <path d="M16 26C3 17 6 6 16 12c10-6 13 5 0 14z" fill="var(--brown)" stroke="var(--ink)" strokeWidth="1.2" strokeLinejoin="round" />
      </>
    ),
  },
  {
    kind: 'ball',
    label: '공놀이',
    icon: (
      <>
        <circle cx="16" cy="16" r="10" fill="var(--red)" />
        <path d="M8 13c5-4 11-4 16 0" stroke="var(--paper)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    kind: 'mom',
    label: '엄마 왔다',
    icon: (
      <>
        <rect x="9" y="5" width="14" height="23" rx="1.5" fill="var(--tan)" stroke="var(--brown)" strokeWidth="1.6" />
        <circle cx="19.5" cy="17" r="1.6" fill="var(--brown)" />
      </>
    ),
  },
  {
    kind: 'walk',
    label: '산책',
    icon: (
      <>
        <ellipse cx="16" cy="21" rx="6.5" ry="5.5" fill="var(--brown)" />
        <circle cx="7.5" cy="14" r="3" fill="var(--brown)" />
        <circle cx="13" cy="9" r="3" fill="var(--brown)" />
        <circle cx="19" cy="9" r="3" fill="var(--brown)" />
        <circle cx="24.5" cy="14" r="3" fill="var(--brown)" />
      </>
    ),
  },
  {
    kind: 'bath',
    label: '목욕',
    icon: (
      <>
        <path d="M4 16h24c0 7-4 10-12 10S4 23 4 16z" fill="var(--blue)" />
        <circle cx="11" cy="10" r="3.5" fill="var(--paper)" stroke="var(--blue)" strokeWidth="1.5" />
        <circle cx="18" cy="7" r="2.5" fill="var(--paper)" stroke="var(--blue)" strokeWidth="1.5" />
        <circle cx="22" cy="12" r="3" fill="var(--paper)" stroke="var(--blue)" strokeWidth="1.5" />
      </>
    ),
  },
  {
    kind: 'vet',
    label: '병원',
    icon: (
      <>
        <rect x="5" y="5" width="22" height="22" rx="4" fill="var(--paper)" stroke="var(--green)" strokeWidth="2" />
        <path d="M16 10v12M10 16h12" stroke="var(--green)" strokeWidth="4.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    kind: 'sleep',
    label: '재우기',
    icon: <path d="M21 5a11 11 0 1 0 6 16A9 9 0 0 1 21 5z" fill="var(--orange)" stroke="var(--ink)" strokeWidth="1.2" />,
  },
];

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const timer = useRef(0);
  const [stats, setStats] = useState<Stats>({ hunger: 55, mood: 60, clean: 80, energy: 70 });
  const [toast, setToast] = useState('');
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [prog, setProg] = useState({ level: 1, xp: 0, need: 150 });
  const [event, setEvent] = useState<{ level: number; game: EventGame } | null>(null);
  const [menu, setMenu] = useState(false);
  const [unlocked, setUnlocked] = useState<EventGame[]>([]);

  useEffect(() => {
    const g = new Game(canvas.current!);
    g.onChange = setStats;
    g.onToast = (m) => {
      setToast(m);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(''), 2800);
    };
    g.onProgress = (level, xp, need) => setProg({ level, xp, need });
    g.onLevelUp = (level, game) => setEvent({ level, game });
    game.current = g;
    setStats({ ...g.stats });
    setProg({ level: g.level, xp: g.xp, need: g.need() });
    setUnlocked([...g.unlocked]);
    return () => {
      clearTimeout(timer.current);
      g.destroy();
    };
  }, []);

  const start = () => {
    game.current?.sound.start();
    setStarted(true);
    game.current?.onToast('레오를 쓰다듬어 보세요');
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    game.current?.sound.setMuted(m);
  };

  return (
    <div className="stage">
      <canvas ref={canvas} className="world" />

      <header className="hud">
        <div className="meters">
          {METERS.map((m) => (
            <div className="meter" key={m.key}>
              <span className="meter-label">{m.label}</span>
              <span className="meter-track">
                <span
                  className={'meter-fill' + (stats[m.key] < 25 ? ' low' : '')}
                  style={{ width: `${Math.round(stats[m.key])}%`, background: m.color }}
                />
              </span>
            </div>
          ))}
          <div className="level">
            <span className="level-chip">Lv.{prog.level}</span>
            <span className="meter-track">
              <span className="meter-fill" style={{ width: `${Math.round((prog.xp / prog.need) * 100)}%`, background: 'var(--yellow)' }} />
            </span>
            <span className="level-num">
              {Math.floor(prog.xp)}/{prog.need}
            </span>
          </div>
        </div>
        <div className="side">
          <button id="mute" className="mute" onClick={toggleMute} aria-pressed={muted}>
            {muted ? '소리 꺼짐' : '소리 켜짐'}
          </button>
          <button
            id="open-games"
            className="mute"
            onClick={() => {
              setUnlocked([...(game.current?.unlocked ?? [])]);
              setMenu(true);
            }}
          >
            미니게임
          </button>
        </div>
      </header>

      <div className={'toast' + (toast ? ' show' : '')} role="status">
        {toast}
      </div>

      <footer className="dock">
        <div className="dock-row">
          {ACTIONS.map((a) => (
            <button id={`act-${a.kind}`} key={a.kind} className="act" onClick={() => game.current?.action(a.kind)}>
              <svg viewBox="0 0 32 32" aria-hidden="true">
                {a.icon}
              </svg>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </footer>

      {event && (
        <div className="intro event">
          <p className="event-eyebrow">레벨 업!</p>
          <h1>Lv.{event.level}</h1>
          <p>
            이벤트 미니게임이 열렸어요
            <br />
            <b>{EVENTS[event.game].name}</b>
          </p>
          <button
            id="event-start"
            className="start"
            onClick={() => {
              const g = event.game;
              setEvent(null);
              game.current?.startEvent(g);
              setUnlocked([...(game.current?.unlocked ?? [])]);
            }}
          >
            {EVENTS[event.game].go}
          </button>
          <button id="event-later" className="later" onClick={() => setEvent(null)}>
            이번엔 건너뛰기
          </button>
        </div>
      )}

      {menu && (
        <div className="intro event games">
          <h2>미니게임</h2>
          <ul>
            {(Object.keys(EVENTS) as EventGame[]).map((k) => {
              const open = unlocked.includes(k);
              return (
                <li key={k} className={open ? '' : 'locked'}>
                  <span className="game-name">{open ? EVENTS[k].name : '???'}</span>
                  {open ? (
                    <button
                      id={`replay-${k}`}
                      className="mute"
                      onClick={() => {
                        setMenu(false);
                        game.current?.startEvent(k, true);
                      }}
                    >
                      다시하기
                    </button>
                  ) : (
                    <span className="game-lock">레벨업하면 열려요</span>
                  )}
                </li>
              );
            })}
          </ul>
          <button id="close-games" className="later" onClick={() => setMenu(false)}>
            닫기
          </button>
        </div>
      )}

      {!started && (
        <div className="intro">
          <h1>Pocket Leo</h1>
          <p>주머니 속 레오 키우기</p>
          <button id="start" className="start" onClick={start}>
            레오 만나러 가기
          </button>
        </div>
      )}
    </div>
  );
}
