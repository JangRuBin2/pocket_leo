import { useEffect, useRef, useState } from 'react';
import { Game, type Action, type Stats } from './game/engine';

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
        <rect x="8" y="13" width="16" height="6" rx="3" fill="var(--brown)" />
        <circle cx="7" cy="12" r="3.4" fill="var(--tan)" />
        <circle cx="7" cy="20" r="3.4" fill="var(--tan)" />
        <circle cx="25" cy="12" r="3.4" fill="var(--tan)" />
        <circle cx="25" cy="20" r="3.4" fill="var(--tan)" />
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
];

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const timer = useRef(0);
  const [stats, setStats] = useState<Stats>({ hunger: 55, mood: 60, clean: 80, energy: 70 });
  const [toast, setToast] = useState('');
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const g = new Game(canvas.current!);
    g.onChange = setStats;
    g.onToast = (m) => {
      setToast(m);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(''), 2800);
    };
    game.current = g;
    setStats({ ...g.stats });
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
        </div>
        <button id="mute" className="mute" onClick={toggleMute} aria-pressed={muted}>
          {muted ? '소리 꺼짐' : '소리 켜짐'}
        </button>
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
        <p className="soon">산책 · 목욕 · 병원은 다음 버전에 들어와요</p>
      </footer>

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
