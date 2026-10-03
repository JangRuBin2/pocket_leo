import { Crayon, PAPER } from './crayon';
import { Leo, LEO_SCALE } from './leo';
import { Sound, buzz } from './audio';
import { clamp, rand } from './spring';

export interface Stats {
  hunger: number;
  mood: number;
  clean: number;
  energy: number;
}
export type Action = 'feed' | 'treat' | 'ball' | 'mom' | 'walk' | 'bath' | 'vet' | 'sleep';
type Mode = 'idle' | 'feed' | 'treat' | 'zoom' | 'ball' | 'mom' | 'sulk' | 'walk' | 'bath' | 'vet' | 'sleep' | 'angry' | 'cake' | 'trick' | 'sock';
export type EventGame = 'cake' | 'trick' | 'sock';
const GAMES: EventGame[] = ['cake', 'trick', 'sock'];
const SOCK_COLORS = ['#7fa8c9', '#ee8a8a', '#9dbf7a', '#f2c84b', '#b79ad6'];

interface Part {
  kind: 'heart' | 'dust' | 'line' | 'crumb' | 'drop' | 'bubble';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
}
interface FText {
  text: string;
  x: number;
  y: number;
  t: number;
  life: number;
  size: number;
  color: string;
  rot: number;
}
interface P {
  x: number;
  y: number;
}

const SAVE_KEY = 'pocket-leo-v1';
const W = 390;
const INK = '#2a2622';
const CAKE_X = 236;
const CAKE_W = [128, 106, 84];

export class Game {
  ctx: CanvasRenderingContext2D;
  crayon: Crayon;
  sound = new Sound();
  leo = new Leo();
  stats: Stats = { hunger: 55, mood: 60, clean: 80, energy: 70 };
  onChange: (s: Stats) => void = () => {};
  onToast: (m: string) => void = () => {};

  private H = 700;
  private scale = 1;
  private groundY = 480;
  private bg: HTMLCanvasElement[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private boilT = 0;
  private emitT = 0;
  private saveT = 0;
  private mode: Mode = 'idle';
  private modeT = 0;
  private tickT = 0;
  private idleT = 3;
  private barksLeft = 0;
  private barkT = 0;
  private eating = false;
  private poopAt = 0;
  private poops: number[] = [];
  private bowl: number | null = null;
  private treat: { x: number; y: number; vy: number; held: boolean; dropped: boolean } | null = null;
  private ball: { x: number; y: number; vx: number; vy: number; held: boolean; live: boolean; liveT: number } | null = null;
  private parts: Part[] = [];
  private texts: FText[] = [];
  private ptr: (P & { sx: number; sy: number; moved: number; t: number; onLeo: boolean }) | null = null;
  private petDist = 0;
  private petNote = 0;
  private chestPet = 0;
  private pokes: number[] = [];
  private vel: P = { x: 0, y: 0 };
  private bgVet: HTMLCanvasElement[] = [];
  private sub = 0;
  private foam = 0;
  private calm = 0;
  private dist = 0;
  private scroll = 0;
  private hold = 0;
  private ev = 0;
  private otherX = W + 80;
  private other = 0;
  private walkPoop: number | null = null;
  private handle = { x: 0, y: 0, held: false };
  private wet: number[] = [];
  level = 1;
  xp = 0;
  onProgress: (level: number, xp: number, need: number) => void = () => {};
  onLevelUp: (level: number, game: EventGame) => void = () => {};
  private lastGame: EventGame | null = null;
  private kisses = 0;
  private sockN = 0;
  private sockT = 0;
  private socks: { x: number; y: number; vx: number; vy: number; t: number; c: number; tissue: boolean }[] = [];
  private pendingEvent = false;
  private cake = {
    layers: [] as number[],
    mx: 0,
    fall: null as number | null,
    acc: 0,
    cream: 0,
    lit: false,
    strokes: [] as P[][],
    drawing: false,
    tops: [] as { kind: number; x: number; y: number; hx: number; hy: number; placed: boolean; held: boolean }[],
  };
  private tool: { kind: 'steth' | 'syringe'; x: number; y: number; held: boolean } | null = null;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.crayon = new Crayon(this.ctx);
    this.load();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    document.addEventListener('visibilitychange', this.vis);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    document.removeEventListener('visibilitychange', this.vis);
    this.save();
    this.sound.destroy();
  }

  private vis = () => {
    if (document.hidden) {
      this.save();
      void this.sound.ctx?.suspend();
    } else {
      this.last = performance.now();
      if (this.sound.ctx) void this.sound.ctx.resume();
    }
  };

  // ---------- 저장 ----------
  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { stats: Stats; ts: number; poops: number; level?: number; xp?: number; lastGame?: EventGame };
      this.lastGame = d.lastGame ?? null;
      this.level = d.level ?? 1;
      this.xp = d.xp ?? 0;
      const sec = clamp((Date.now() - d.ts) / 1000, 0, 3600 * 48);
      this.stats = d.stats;
      this.poops = Array.from({ length: Math.min(d.poops || 0, 3) }, () => rand(60, W - 110));
      this.decay(sec, 15); // 꺼둔 동안에는 15 밑으로는 안 떨어진다
    } catch {
      /* 저장소를 못 쓰는 환경이면 기본값으로 시작 */
    }
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ stats: this.stats, ts: Date.now(), poops: this.poops.length, level: this.level, xp: this.xp, lastGame: this.lastGame }));
    } catch {
      /* 무시 */
    }
  }

  /** 수치가 가득에서 바닥까지 걸리는 시간(분) */
  private static readonly DRAIN_MIN = { hunger: 45, mood: 60, clean: 90, energy: 75 };

  private decay(sec: number, floor = 0) {
    const s = this.stats;
    const d = Game.DRAIN_MIN;
    const drop = (v: number, min: number, mul = 1) => Math.max(Math.min(v, floor), v - (100 / (min * 60)) * mul * sec);
    s.hunger = drop(s.hunger, d.hunger);
    s.mood = drop(s.mood, d.mood);
    s.clean = drop(s.clean, d.clean, 1 + this.poops.length * 2);
    if (this.mode !== 'sleep') s.energy = drop(s.energy, d.energy);
    this.clampStats();
  }

  /** 다음 레벨까지 필요한 경험치 */
  need(level = this.level) {
    void level;
    return 150;
  }

  private gainXp(n: number) {
    this.xp += n;
    this.say(`+${n} 경험치`, this.leo.x, this.gy - 250, 20, '#6b8f5a');
    while (this.xp >= this.need()) {
      this.xp -= this.need();
      this.level++;
      this.pendingEvent = true;
    }
    this.onProgress(this.level, this.xp, this.need());
    this.save();
  }

  private clampStats() {
    const s = this.stats;
    s.hunger = clamp(s.hunger, 0, 100);
    s.mood = clamp(s.mood, 0, 100);
    s.clean = clamp(s.clean, 0, 100);
    s.energy = clamp(s.energy, 0, 100);
  }

  private bump(d: Partial<Stats>) {
    const s = this.stats;
    s.hunger += d.hunger ?? 0;
    s.mood += d.mood ?? 0;
    s.clean += d.clean ?? 0;
    s.energy += d.energy ?? 0;
    this.clampStats();
    this.onChange({ ...s });
  }

  // ---------- 화면 ----------
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.scale = r.width / W;
    this.H = r.height / this.scale;
    this.groundY = this.H - 275;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    this.bg = [0, 1, 2].map((b) => this.paintBg(b, dpr));
    this.bgVet = [0, 1, 2].map((b) => this.paintBg(b, dpr, true));
  }

  private paintBg(boil: number, dpr: number, vet = false) {
    const cv = document.createElement('canvas');
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    const c = new Crayon(ctx);
    c.boil = boil;
    const g = this.groundY;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, this.H);
    if (vet) {
      // 동물병원: 초록 십자 간판, 진찰대
      const sy = Math.max(120, g - 330);
      c.rect(34, sy, 84, 84, '#5f8f6a', 140, '#dcebd9');
      c.rect(66, sy + 14, 20, 56, '#5f8f6a', 141, '#7fb08a');
      c.rect(48, sy + 32, 56, 20, '#5f8f6a', 142, '#7fb08a');
      c.rect(W - 120, sy + 10, 86, 60, '#8a9aa8', 143);
      c.line([[W - 110, sy + 30], [W - 46, sy + 30]], '#8a9aa8', 2, 144);
      c.line([[W - 110, sy + 46], [W - 64, sy + 46]], '#8a9aa8', 2, 145);
      const ty = g + 22;
      c.rect(50, ty, 250, 16, '#6f8496', 146, '#c9d9e4');
      c.line([[70, ty + 16], [62, ty + 62]], '#6f8496', 2.4, 147);
      c.line([[280, ty + 16], [288, ty + 62]], '#6f8496', 2.4, 148);
      return cv;
    }
    // 창문
    const wy = Math.max(120, g - 330);
    c.rect(34, wy, 104, 112, '#8a9aa8', 100, '#bcd6e6');
    c.line([[86, wy], [86, wy + 112]], '#8a9aa8', 2, 101);
    c.line([[34, wy + 56], [138, wy + 56]], '#8a9aa8', 2, 102);
    // 현관문
    c.rect(W - 84, g - 196, 66, 206, '#9a6a3c', 110, '#e2c08e');
    ctx.fillStyle = '#9a6a3c';
    ctx.beginPath();
    ctx.arc(W - 72, g - 86, 4, 0, Math.PI * 2);
    ctx.fill();
    // 바닥선
    const pts: number[][] = [];
    for (let x = -5; x <= W + 5; x += 26) pts.push([x, g + 10]);
    c.line(pts, '#b9a98a', 2.2, 120, 2.2);
    // 러그
    c.blob(W / 2 - 20, g + 26, 150, 26, { fill: '#e2714c', edge: '#b9502f', seed: 130, hatch: 0.5 });
    c.blob(W / 2 - 20, g + 26, 96, 14, { fill: '#f0a36c', seed: 131, hatch: -0.5 });
    return cv;
  }

  private toLocal(e: PointerEvent): P {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  private get gy() {
    return this.groundY + 26;
  }

  private hitLeo(p: P) {
    const dx = (p.x - this.leo.x) / (72 * LEO_SCALE);
    const dy = (p.y - (this.gy - 88 * LEO_SCALE)) / (104 * LEO_SCALE);
    return dx * dx + dy * dy < 1;
  }

  // ---------- 입력 ----------
  private down = (e: PointerEvent) => {
    this.sound.start();
    const p = this.toLocal(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    this.ptr = { ...p, sx: p.x, sy: p.y, moved: 0, t: this.t, onLeo: false };
    this.vel = { x: 0, y: 0 };

    if (this.mode === 'cake') {
      this.cakeDown(p);
      return;
    }
    if (this.mode === 'trick') {
      this.trickDown(p);
      return;
    }
    if (this.mode === 'sock') {
      this.sockDown(p);
      return;
    }
    if (this.mode === 'sleep') {
      // 자는데 깨우면 엄청 화내면서 물려고 한다
      const leo = this.leo;
      leo.squash.target = 1;
      leo.happyT = 0;
      this.mode = 'angry';
      this.modeT = 2.8;
      this.tickT = 0.35;
      this.sound.growl();
      buzz(120);
      leo.boop(1.2);
      this.say('으르르르!!', leo.x, this.gy - 215, 30, '#b3261e');
      this.onToast('자는데 깨워서 엄청 화났어요. 물려요, 도망쳐요!');
      return;
    }
    if (this.mode === 'walk' && Math.hypot(p.x - this.handle.x, p.y - this.handle.y) < 50) {
      this.handle.held = true;
      return;
    }
    if (this.tool && Math.hypot(p.x - this.tool.x, p.y - this.tool.y) < 52) {
      this.tool.held = true;
      return;
    }
    if (this.walkPoop !== null && Math.hypot(p.x - this.walkPoop, p.y - (this.gy - 10)) < 40) {
      const x = this.walkPoop;
      this.walkPoop = null;
      this.sub = 0;
      this.sound.pop();
      buzz(15);
      for (let i = 0; i < 8; i++) this.emit('dust', x, this.gy - 12, rand(-90, 90), rand(-140, -30), 0.6);
      this.say('매너 견주!', x, this.gy - 50, 22, '#6b8f5a');
      return;
    }
    if (this.treat && !this.treat.dropped && Math.hypot(p.x - this.treat.x, p.y - this.treat.y) < 48) {
      this.treat.held = true;
      return;
    }
    if (this.ball && !this.ball.live && Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < 50) {
      this.ball.held = true;
      return;
    }
    const pi = this.poops.findIndex((x) => Math.hypot(p.x - x, p.y - (this.gy - 10)) < 34);
    if (pi >= 0) {
      const x = this.poops[pi];
      this.poops.splice(pi, 1);
      this.sound.pop();
      buzz(15);
      for (let i = 0; i < 8; i++) this.emit('dust', x, this.gy - 12, rand(-90, 90), rand(-140, -30), 0.6);
      this.say('깔끔!', x, this.gy - 50, 22, '#6b8f5a');
      this.bump({ clean: 8, mood: 2 });
          this.gainXp(4);
      return;
    }
    if (this.hitLeo(p)) {
      this.ptr.onLeo = true;
      this.petDist = 0;
      this.chestPet = 0;
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.ptr) return;
    const p = this.toLocal(e);
    const dx = p.x - this.ptr.x;
    const dy = p.y - this.ptr.y;
    const dist = Math.hypot(dx, dy);
    this.ptr.moved += dist;
    this.vel = { x: this.vel.x * 0.6 + dx * 24, y: this.vel.y * 0.6 + dy * 24 };
    this.ptr.x = p.x;
    this.ptr.y = p.y;

    if (this.mode === 'sock') return;
    if (this.mode === 'trick') return;
    if (this.mode === 'cake') {
      const ck = this.cake;
      const g = this.gy;
      if (this.sub === 1 && Math.abs(p.x - CAKE_X) < 95 && p.y > g - 150 && p.y < g - 25) {
        ck.cream = Math.min(1, ck.cream + dist / 1500);
        this.petDist += dist;
        if (this.petDist > 30) {
          this.petDist = 0;
          this.sound.bubble();
          buzz(5);
        }
      }
      const held = ck.tops.find((o) => o.held);
      if (held) {
        held.x = p.x;
        held.y = p.y;
      }
      if (this.sub === 3 && ck.drawing) {
        const b = this.plaque();
        const st = ck.strokes[ck.strokes.length - 1];
        const q = { x: clamp(p.x - b.x, 4, b.w - 4), y: clamp(p.y - b.y, 4, b.h - 4) };
        const lastQ = st[st.length - 1];
        if (Math.hypot(q.x - lastQ.x, q.y - lastQ.y) > 2) st.push(q);
      }
      return;
    }
    if (this.handle.held) {
      this.handle.x = clamp(p.x, 30, W - 20);
      this.handle.y = clamp(p.y, this.gy - 260, this.gy - 40);
      return;
    }
    if (this.mode === 'walk' && this.sub === 4 && this.ptr.onLeo && this.ptr.sy - p.y > 50) {
      // 안아주기
      const leo = this.leo;
      this.sub = 5;
      leo.lift.target = -64;
      leo.squash.target = 1;
      leo.happy(5);
      this.sound.jingle();
      buzz(40);
      this.say('헤헤', leo.x, this.gy - 250, 28, '#d1483a');
      for (let i = 0; i < 5; i++) this.emit('heart', leo.x + rand(-40, 40), this.gy - 180, rand(-40, 40), rand(-110, -60), 1.2);
      this.onToast('결국 안겨서 가요. 약았다 약았어');
      return;
    }
    if (this.tool?.held) {
      this.tool.x = p.x;
      this.tool.y = p.y;
      return;
    }
    if (this.treat?.held) {
      this.treat.x = p.x;
      this.treat.y = p.y;
      return;
    }
    if (this.ball?.held) {
      this.ball.x = p.x;
      this.ball.y = p.y;
      return;
    }
    if (this.ptr.onLeo && this.hitLeo(p)) this.pet(p, dist);
  };

  private up = () => {
    const ptr = this.ptr;
    this.ptr = null;
    if (!ptr) return;
    if (this.mode === 'sock') return;
    if (this.mode === 'trick') {
      this.trickUp(ptr.y - ptr.sy);
      return;
    }
    if (this.mode === 'cake') {
      const ck = this.cake;
      ck.drawing = false;
      const held = ck.tops.find((o) => o.held);
      if (held) {
        held.held = false;
        const topX = ck.layers[2] ?? CAKE_X;
        const topY = this.gy - 34 - 90;
        if (Math.abs(held.x - topX) < 46 && held.y > topY - 60 && held.y < topY + 25) {
          held.placed = true;
          held.y = topY - 7;
          this.sound.pop();
          buzz(12);
          this.leo.boop(0.4);
        } else {
          held.x = held.hx;
          held.y = held.hy;
        }
      }
      return;
    }
    if (this.handle.held) {
      this.handle.held = false;
      return;
    }
    if (this.tool?.held) {
      this.tool.held = false;
      return;
    }
    if (this.treat?.held) {
      this.treat.held = false;
      this.treat.dropped = true;
      this.treat.vy = 0;
      return;
    }
    if (this.ball?.held) {
      const b = this.ball;
      b.held = false;
      b.live = true;
      b.liveT = 0;
      b.vx = clamp(this.vel.x, -900, 900);
      b.vy = clamp(this.vel.y, -1100, 500);
      if (Math.hypot(b.vx, b.vy) < 120) b.vy = -350;
      this.sound.whoosh();
      return;
    }
    if (ptr.onLeo && ptr.moved < 10) this.poke();
  };

  private pet(p: P, dist: number) {
    if (this.mode === 'bath') {
      if (this.sub === 0) {
        this.foam = Math.min(1, this.foam + dist / 1100);
        this.petDist += dist;
        if (this.petDist > 26) {
          this.petDist = 0;
          this.sound.bubble();
          buzz(5);
          this.leo.boop(0.25);
          this.emit('bubble', p.x + rand(-14, 14), p.y, rand(-20, 20), rand(-60, -25), 1.2);
        }
      }
      return;
    }
    if ((this.mode === 'vet' && this.sub === 1) || (this.mode === 'walk' && this.sub === 2)) {
      this.calm = Math.min(1, this.calm + dist / 800);
      this.petDist += dist;
      if (this.petDist > 30) {
        this.petDist = 0;
        this.sound.note(this.petNote++ % 14);
        buzz(8);
        this.leo.boop(0.3);
        this.emit('heart', p.x + rand(-12, 12), p.y - 14, rand(-25, 25), rand(-95, -60), 1.1);
      }
      return;
    }
    if (this.mode === 'sulk') {
      if (Math.random() < 0.03) this.say('흥', this.leo.x, this.gy - 190, 24, INK);
      return;
    }
    if (this.mode !== 'idle') return;
    this.leo.targetX = null;
    this.idleT = 3;
    this.petDist += dist;
    const relY = (this.gy - p.y) / LEO_SCALE;
    if (relY > 35 && relY < 100) this.chestPet += dist;
    if (this.petDist > 30) {
      this.petDist = 0;
      this.sound.note(this.petNote++ % 14);
      buzz(8);
      this.leo.boop(0.35);
      this.leo.happy(1.2);
      this.leo.tilt.kick((p.x - this.leo.x) * 0.03);
      this.emit('heart', p.x + rand(-12, 12), p.y - 14, rand(-25, 25), rand(-95, -60), 1.1);
      this.bump({ mood: 0.7 });
    }
    if (this.chestPet > 520) {
      this.chestPet = 0;
      this.leo.kick = 1.4;
      this.say('거기! 거기!', this.leo.x, this.gy - 200, 24, '#c9632a');
      this.sound.jingle();
      buzz(40);
      this.bump({ mood: 5 });
          this.gainXp(3);
    }
  }

  private poke() {
    if (this.mode === 'angry') {
      this.say('앙!', this.leo.x, this.gy - 200, 34, '#b3261e');
      this.sound.bark(0.85);
      buzz(150);
      return;
    }
    if (this.mode === 'sulk') {
      this.say('흥', this.leo.x, this.gy - 190, 24, INK);
      return;
    }
    if (this.mode !== 'idle') return;
    this.pokes = this.pokes.filter((x) => this.t - x < 2.2);
    this.pokes.push(this.t);
    if (this.pokes.length >= 5) {
      // 예민한 레오: 자꾸 찌르면 삐진다
      this.pokes = [];
      this.mode = 'sulk';
      this.modeT = 3.8;
      this.leo.back = true;
      this.leo.targetX = null;
      this.sound.growl();
      buzz(60);
      this.say('으르르…', this.leo.x, this.gy - 200, 24, INK);
      this.onToast('레오가 삐졌어요. 살살 다뤄주세요');
      this.bump({ mood: -6 });
      return;
    }
    this.leo.boop(1);
    this.sound.boing();
    buzz(10);
    if (Math.random() < 0.5) this.bark();
  }

  // ---------- 활동 ----------
  action(kind: Action) {
    this.sound.start();
    if (this.mode !== 'idle') {
      this.onToast(this.mode === 'sulk' ? '레오가 삐져서 등 돌리고 있어요' : '레오가 지금 바빠요');
      return;
    }
    const leo = this.leo;
    this.barksLeft = 0;
    this.sub = 0;
    this.calm = 0;
    if (kind === 'walk') {
      if (this.stats.energy < 10) {
        this.onToast('레오가 지쳤어요. 재우거나 쌩쌩이를 주세요');
        return;
      }
      this.mode = 'walk';
      this.dist = 0;
      this.scroll = 0;
      this.ev = 0;
      this.other = 0;
      this.otherX = W + 80;
      this.walkPoop = null;
      leo.x = 130;
      leo.dir = 1;
      leo.targetX = null;
      leo.happy(2);
      leo.harness = true;
      this.handle = { x: leo.x + 105, y: this.gy - 150, held: false };
      this.sound.jingle();
      this.onToast('목줄 채우고 산책 출발');
      return;
    }
    if (kind === 'bath') {
      this.mode = 'bath';
      this.foam = 0;
      leo.goTo(W / 2 - 20, undefined, 200);
      this.sound.pop();
      this.onToast('레오를 문질러서 거품을 내주세요');
      return;
    }
    if (kind === 'vet') {
      this.mode = 'vet';
      this.hold = 0;
      leo.x = 175;
      leo.dir = 1;
      leo.targetX = null;
      this.tool = { kind: 'steth', x: W - 70, y: this.gy - 250, held: false };
      this.sound.pop();
      this.onToast('청진기를 레오 가슴에 대주세요');
      return;
    }
    if (kind === 'sleep') {
      if (this.stats.energy > 95) {
        this.onToast('쌩쌩해서 잘 생각이 없어요');
        return;
      }
      this.mode = 'sleep';
      this.modeT = 0;
      leo.targetX = null;
      leo.squash.target = 0.84;
      this.onToast('쉿, 레오가 자요. 화면을 누르면 깨워요');
      return;
    }
    if (kind === 'feed') {
      if (this.stats.hunger > 92) {
        this.onToast('배불러서 밥그릇은 쳐다도 안 봐요');
        return;
      }
      this.mode = 'feed';
      this.bowl = 58;
      this.eating = false;
      this.sound.pop();
      leo.goTo(142, () => {
        leo.dir = -1;
        this.eating = true;
        this.modeT = 2.8;
        this.tickT = 0;
      }, 190);
    } else if (kind === 'treat') {
      this.mode = 'treat';
      this.treat = { x: W / 2, y: this.gy - 290, vy: 0, held: false, dropped: false };
      leo.targetX = null;
      this.sound.pop();
      this.onToast('쌩쌩이를 끌어다 레오 입에 넣어주세요');
    } else if (kind === 'ball') {
      if (this.stats.energy < 10) {
        this.onToast('레오가 지쳤어요. 쌩쌩이가 필요해요');
        return;
      }
      this.mode = 'ball';
      this.ball = { x: W / 2, y: this.gy - 290, vx: 0, vy: 0, held: false, live: false, liveT: 0 };
      this.sound.pop();
      this.onToast('공을 잡고 휙 던져주세요');
    } else {
      this.mode = 'mom';
      this.modeT = 0;
      this.sound.dingdong();
      this.say('엄마다!!!', leo.x, this.gy - 205, 30, '#d1483a');
      leo.happy(6);
      leo.goTo(W - 130, () => {
        this.sub = 1;
        this.modeT = 0;
        this.tickT = 0;
      }, 400);
    }
  }

  /** 말려야 하는 부위: 머리, 가슴, 옆구리, 꼬리, 발 */
  private zones(): P[] {
    const S = LEO_SCALE;
    const x = this.leo.x;
    const g = this.gy;
    return [
      { x, y: g - 128 * S },
      { x, y: g - 76 * S },
      { x: x - 42 * S, y: g - 56 * S },
      { x: x + 46 * S, y: g - 106 * S },
      { x, y: g - 14 * S },
    ];
  }

  private tubPath(front: boolean) {
    const ctx = this.ctx;
    const x = this.leo.x;
    const y = this.gy - 62;
    ctx.beginPath();
    if (!front) {
      ctx.ellipse(x, y, 108, 16, 0, 0, Math.PI * 2);
      return;
    }
    ctx.moveTo(x - 108, y);
    ctx.ellipse(x, y, 108, 16, 0, Math.PI, 0, true);
    ctx.bezierCurveTo(x + 104, y + 60, x + 84, y + 78, x + 60, y + 78);
    ctx.lineTo(x - 60, y + 78);
    ctx.bezierCurveTo(x - 84, y + 78, x - 104, y + 60, x - 108, y);
    ctx.closePath();
  }

  startEvent(game: EventGame) {
    if (this.mode !== 'idle') return;
    if (game === 'cake') this.startCake();
    else if (game === 'trick') this.startTrick();
    else this.startSock();
  }

  private guide(text: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '400 16px Gaegu, "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8c8272';
    ctx.fillText(text, W / 2, this.gy + 56);
    ctx.restore();
  }

  private banner(text: string, size = 44, color = INK) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${size}px Gaegu, "Comic Sans MS", cursive`;
    ctx.textAlign = 'center';
    ctx.translate(W / 2, Math.max(200, this.gy - 300));
    ctx.rotate(-0.04);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private heartTreat(x: number, y: number, k: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.bezierCurveTo(-27, -4, -15, -24, 0, -9);
    ctx.bezierCurveTo(15, -24, 27, -4, 0, 15);
    ctx.fillStyle = '#a8703c';
    ctx.fill();
    ctx.strokeStyle = '#6b3f1c';
    ctx.lineWidth = 2 / Math.max(k, 0.3);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 이벤트 미니게임: 개인기 연습 ----------
  private startTrick() {
    const leo = this.leo;
    this.mode = 'trick';
    this.sub = 0;
    this.hold = 0;
    this.kisses = 0;
    this.barksLeft = 0;
    leo.x = 150;
    leo.dir = 1;
    leo.targetX = null;
    this.sound.jingle();
    this.onToast('개인기 연습 시간! 앉아부터 뽀뽀까지 성공해 봐요');
  }

  private trickDown(p: P) {
    const leo = this.leo;
    const g = this.gy;
    if (this.sub === 2) {
      if (Math.hypot(p.x - (leo.x + 36), p.y - (g - 52 * LEO_SCALE)) < 56) {
        if (leo.paw.target > 0.5) {
          this.sub = 3;
          this.sound.jingle();
          buzz(30);
          leo.happy(1.2);
          this.say('손!', leo.x + 60, g - 120, 34, '#6b8f5a');
          this.onToast('마지막 개인기! 레오 주둥이를 눌러 뽀뽀 3번');
        } else {
          this.say('아직!', leo.x + 60, g - 110, 22, INK);
        }
      }
    } else if (this.sub === 3) {
      if (Math.hypot(p.x - leo.x, p.y - (g - 116 * LEO_SCALE)) < 52) {
        this.kisses++;
        this.sound.bubble();
        this.sound.note(6 + this.kisses);
        buzz(25);
        leo.happy(1.2);
        leo.boop(0.5);
        this.say('쪽!', leo.x + rand(-40, 40), g - 200, 32, '#d1483a');
        for (let i = 0; i < 3; i++) this.emit('heart', leo.x + rand(-30, 30), g - 150, rand(-40, 40), rand(-110, -60), 1.1);
        if (this.kisses >= 3) {
          this.sub = 4;
          this.modeT = 0;
          this.tickT = 0;
          this.sound.fanfare();
          this.onToast('개인기 전부 성공! 왕큰 쌩쌩이 받아라');
        }
      }
    }
  }

  private trickUp(dy: number) {
    const leo = this.leo;
    if (this.sub === 0) {
      if (dy > 60) {
        this.sub = 1;
        this.hold = 0;
        leo.squash.target = 0.84;
        leo.boop(0.6);
        this.sound.jingle();
        buzz(20);
        this.say('앉았다!', leo.x, this.gy - 215, 28, '#6b8f5a');
        this.onToast('이번엔 기다려! 화면을 꾹 누른 채 3초 버텨요');
      }
    } else if (this.sub === 1 && this.hold > 0.25 && this.hold < 3) {
      this.hold = 0;
      leo.barkPose();
      this.sound.boing();
      this.sound.munch();
      this.say('못 참고 먹어버렸다!', W / 2, this.gy - 215, 24, INK);
    }
  }

  private updateTrick(dt: number) {
    const leo = this.leo;
    const g = this.gy;
    leo.pant = this.sub !== 1;
    leo.paw.target = 0;
    if (this.sub === 1) {
      if (this.ptr) {
        this.hold += dt;
        leo.tremble = (this.hold / 3) * 1.4;
        if (this.hold >= 3) {
          this.sub = 2;
          this.sound.jingle();
          buzz(30);
          leo.happy(1.2);
          this.say('잘 기다렸어!', leo.x, g - 215, 28, '#6b8f5a');
          this.onToast('손! 레오가 발을 번쩍 들 때 앞발을 눌러요');
        }
      }
    } else if (this.sub === 2) {
      leo.paw.target = this.t % 1.6 < 0.85 ? 1 : 0;
    } else if (this.sub === 4) {
      this.modeT += dt;
      if (this.modeT > 0.7) {
        this.tickT -= dt;
        leo.headX.target = 9;
        leo.headY.target = 8 + Math.sin(this.t * 16) * 5;
        if (this.tickT <= 0) {
          this.tickT = 0.22;
          this.sound.munch();
          buzz(8);
          for (let i = 0; i < 2; i++) this.emit('crumb', leo.x + 80 + rand(-20, 20), g - 50, rand(-90, 90), rand(-140, -40), 0.6);
        }
      }
      if (this.modeT > 3.1) {
        this.endScene('개인기 완벽! 왕큰 쌩쌩이까지 다 먹었어요', { mood: 35, hunger: 20, energy: 15 }, 0);
      }
    }
  }

  private drawTrick() {
    const ctx = this.ctx;
    const c = this.crayon;
    const leo = this.leo;
    const g = this.gy;
    this.banner(['앉아!', '기다려!', '손!', '뽀뽀!', '왕큰 쌩쌩이!'][this.sub] ?? '', 46, this.sub === 4 ? '#d1483a' : INK);
    if (this.sub === 0) {
      // 아래로 쓸어내리라는 화살표
      const ax = leo.x + 110;
      const ay = g - 170 + ((this.t * 60) % 40);
      c.line([[ax, ay - 30], [ax, ay + 20]], '#8c8272', 3.4, 500, 1);
      c.line([[ax - 12, ay + 6], [ax, ay + 22], [ax + 12, ay + 6]], '#8c8272', 3.4, 501, 1);
    }
    if (this.sub === 1) {
      const tx = leo.x + 95;
      const ty = g - 16;
      this.heartTreat(tx, ty, 0.9);
      ctx.save();
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#e6dcc6';
      ctx.beginPath();
      ctx.arc(tx, ty, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#9dbf7a';
      ctx.beginPath();
      ctx.arc(tx, ty, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.hold / 3));
      ctx.stroke();
      ctx.restore();
    }
    if (this.sub === 2) {
      const up = leo.paw.target > 0.5;
      c.blob(leo.x + 72, g - 62 * LEO_SCALE, 24, 13, { fill: '#f1c9a5', edge: '#b98a63', seed: 502 });
      if (up) {
        ctx.save();
        ctx.strokeStyle = '#9dbf7a';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(leo.x + 36, g - 52 * LEO_SCALE, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.sub === 3) {
      ctx.save();
      ctx.font = '700 24px Gaegu, "Comic Sans MS", cursive';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d1483a';
      ctx.fillText(`뽀뽀 ${this.kisses}/3`, leo.x + 105, g - 120);
      ctx.restore();
    }
    if (this.sub === 4) {
      const fall = Math.min(g - 62, g - 340 + 900 * this.modeT * this.modeT);
      const k = 3 * (1 - clamp((this.modeT - 0.7) / 2.3, 0, 0.95));
      this.heartTreat(leo.x + 100, fall + (3 - k) * 14, k);
    }
    this.guide(
      [
        '손짓하듯 화면을 아래로 쓸어내려요',
        '꾹 누른 채로 버텨요. 떼면 먹어버려요',
        '발을 들었을 때 앞발을 눌러요',
        '레오 주둥이를 눌러요',
        '',
      ][this.sub] ?? '',
    );
  }

  // ---------- 이벤트 미니게임: 양말 물기 ----------
  /** 10초 안에 양말 10개 이상. 휴지는 함정. 실패하면 재도전 */
  private startSock() {
    const leo = this.leo;
    this.mode = 'sock';
    this.barksLeft = 0;
    leo.x = W / 2 - 20;
    leo.dir = 1;
    leo.targetX = null;
    this.sound.jingle();
    this.onToast('양말 사냥! 10초 안에 양말 10개를 물어요. 휴지는 물면 안 돼요');
    this.sockRound();
  }

  private sockRound() {
    this.sub = 0;
    this.modeT = 1.4;
    this.sockN = 0;
    this.sockT = 0;
    this.socks = [];
  }

  private sockDown(p: P) {
    if (this.sub !== 1) return;
    const leo = this.leo;
    const i = this.socks.findIndex((s) => Math.hypot(p.x - s.x, p.y - s.y) < 38);
    if (i < 0) return;
    const s = this.socks[i];
    this.socks.splice(i, 1);
    leo.goTo(clamp(s.x, 45, W - 45), undefined, 620);
    leo.jump(-260);
    leo.barkPose();
    if (s.tissue) {
      this.sockN = Math.max(0, this.sockN - 1);
      this.sound.boing();
      buzz(60);
      this.say('퉤! 휴지잖아 -1', s.x, s.y - 18, 24, INK);
      for (let k = 0; k < 6; k++) this.emit('bubble', s.x, s.y, rand(-120, 120), rand(-120, 40), 0.5);
      return;
    }
    this.sockN++;
    this.sound.munch();
    this.sound.note(this.sockN % 14);
    buzz(15);
    this.say('앙!', s.x, s.y - 18, 28, '#d1483a');
    for (let k = 0; k < 3; k++) this.emit('dust', s.x, s.y, rand(-90, 90), rand(-120, -20), 0.5);
  }

  private updateSock(dt: number) {
    const leo = this.leo;
    const g = this.gy;
    leo.pant = true;
    this.modeT -= dt;
    if (this.sub === 0) {
      if (this.modeT <= 0) {
        this.sub = 1;
        this.modeT = 10;
        this.sound.pop();
      }
    } else if (this.sub === 1) {
      const prog = 1 - this.modeT / 10; // 뒤로 갈수록 빨라진다
      this.sockT -= dt;
      if (this.sockT <= 0) {
        this.sockT = 0.42;
        const sp = 90 + prog * 150;
        const a = rand(0, Math.PI * 2);
        this.socks.push({
          x: rand(40, W - 40),
          y: g - rand(30, 250),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          t: 0,
          c: Math.floor(Math.random() * SOCK_COLORS.length),
          tissue: Math.random() < 0.3,
        });
      }
      for (const s of this.socks) {
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 28 || s.x > W - 28) {
          s.vx *= -1;
          s.x = clamp(s.x, 28, W - 28);
        }
        if (s.y < g - 265 || s.y > g - 16) {
          s.vy *= -1;
          s.y = clamp(s.y, g - 265, g - 16);
        }
      }
      this.socks = this.socks.filter((s) => s.t < 2);
      if (this.modeT <= 0) {
        this.sub = 2;
        this.modeT = 1.8;
        this.socks = [];
        leo.targetX = null;
        if (this.sockN >= 10) {
          this.sound.fanfare();
          leo.happy(2);
          leo.jump(-380);
          this.say('성공!', W / 2, g - 230, 40, '#d1483a');
        } else {
          this.sound.growl();
          this.say('실패… 다시!', W / 2, g - 230, 34, INK);
          this.onToast(`${this.sockN}개밖에 못 물었어요. 10개 넘길 때까지 재도전`);
        }
      }
    } else if (this.modeT <= 0) {
      if (this.sockN >= 10) this.endScene(`양말 ${this.sockN}개 사냥 성공!`, { mood: 35, energy: -10 }, 0);
      else this.sockRound();
    }
  }

  private sockItem(x: number, y: number, rot: number, color: string, seed: number) {
    const ctx = this.ctx;
    const c = this.crayon;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    c.blob(0, -9, 9.5, 16, { fill: color, edge: INK, seed });
    c.blob(8, 8, 14, 8.5, { fill: color, edge: INK, seed: seed + 1 });
    c.line([[-9, -18], [9, -18]], '#fbf3de', 3.4, seed + 2, 0.6);
    c.line([[-9, -12], [9, -12]], '#fbf3de', 2.2, seed + 3, 0.6);
    ctx.restore();
  }

  private drawSockGame() {
    const ctx = this.ctx;
    const c = this.crayon;
    for (const s of this.socks) {
      ctx.save();
      ctx.globalAlpha = s.t > 1.6 ? (2 - s.t) / 0.4 : Math.min(1, s.t * 8);
      const rot = Math.sin(this.t * 5 + s.c + s.vx) * 0.35;
      if (s.tissue) {
        // 두루마리 휴지
        ctx.translate(s.x, s.y);
        ctx.rotate(rot);
        c.rect(6, -4, 12, 26, '#a39c8e', 540, '#ffffff');
        c.blob(0, 0, 14, 14, { fill: '#ffffff', edge: '#a39c8e', seed: 541, hatch: 0.4 });
        c.blob(0, 0, 5, 5, { fill: '#c9bda4', edge: '#a39c8e', seed: 542 });
      } else {
        this.sockItem(s.x, s.y, rot, SOCK_COLORS[s.c], 530 + s.c * 5);
      }
      ctx.restore();
    }
    if (this.sub === 0) this.banner('준비…', 44);
    else if (this.sub === 1) this.banner(`${Math.max(0, Math.ceil(this.modeT))}초 · 양말 ${this.sockN}/10`, 30, this.sockN >= 10 ? '#6b8f5a' : INK);
    else this.banner(`양말 ${this.sockN}/10`, 30);
    this.guide('움직이는 양말만 눌러요. 휴지를 물면 1개 깎여요');
  }

  // ---------- 이벤트 미니게임: 레오 생일 케이크 ----------
  private startCake() {
    if (this.mode !== 'idle') return;
    const leo = this.leo;
    this.mode = 'cake';
    this.sub = 0;
    this.barksLeft = 0;
    leo.x = 62;
    leo.dir = 1;
    leo.targetX = null;
    const ty = this.gy - 290;
    this.cake = {
      layers: [],
      mx: CAKE_X,
      fall: null,
      acc: 0,
      cream: 0,
      lit: false,
      strokes: [],
      drawing: false,
      tops: [0, 0, 1, 2].map((kind, i) => ({ kind, x: 160 + i * 52, y: ty, hx: 160 + i * 52, hy: ty, placed: false, held: false })),
    };
    this.sound.jingle();
    this.onToast('레오 생일이에요! 강아지 케이크를 만들어요');
  }

  /** 레터링용 초코판 위치 */
  private plaque() {
    return { x: 45, y: Math.max(150, this.gy - 350), w: 300, h: 140 };
  }

  private cakeDown(p: P) {
    const ck = this.cake;
    if (this.sub === 0) {
      if (ck.fall === null) {
        ck.fall = this.gy - 34 - (ck.layers.length + 1) * 30 - 110;
        this.sound.whoosh();
      }
    } else if (this.sub === 2) {
      const o = ck.tops.find((t) => !t.placed && Math.hypot(p.x - t.x, p.y - t.y) < 34);
      if (o) o.held = true;
    } else if (this.sub === 3) {
      const b = this.plaque();
      const by = b.y + b.h + 8;
      if (p.y > by && p.y < by + 34 && p.x > 262 && p.x < 345) {
        if (!ck.strokes.length) this.onToast('한 글자라도 써주세요');
        else {
          this.sub = 4;
          this.sound.jingle();
          this.onToast('마지막! 화면을 눌러 초에 불을 붙여주세요');
        }
      } else if (p.y > by && p.y < by + 34 && p.x > 184 && p.x < 254) {
        ck.strokes = [];
        this.sound.pop();
      } else if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
        ck.drawing = true;
        ck.strokes.push([{ x: p.x - b.x, y: p.y - b.y }]);
      }
    } else if (this.sub === 4) {
      ck.lit = true;
      this.sub = 5;
      this.modeT = 0;
      this.tickT = 0;
      this.leo.hat = true;
      this.leo.happy(5);
      this.sound.fanfare();
      buzz(80);
      this.say('생일 축하해 레오!', W / 2, this.gy - 300, 34, '#d1483a');
    }
  }

  private updateCake(dt: number) {
    const ck = this.cake;
    const leo = this.leo;
    const g = this.gy;
    leo.pant = true;
    if (this.sub === 0) {
      const i = ck.layers.length;
      if (ck.fall === null) ck.mx = CAKE_X + Math.sin(this.t * (2.2 + i * 0.7)) * 100;
      else {
        ck.fall += dt * 900;
        const land = g - 34 - (i + 1) * 30;
        if (ck.fall >= land) {
          ck.fall = null;
          const off = ck.mx - (i ? ck.layers[i - 1] : CAKE_X);
          if (Math.abs(off) > CAKE_W[i] * 0.5 || Math.abs(ck.mx - CAKE_X) > 62) {
            this.sound.boing();
            this.say('앗! 다시', ck.mx, land - 20, 24, INK);
          } else {
            ck.layers.push(ck.mx);
            ck.acc += 1 - Math.min(1, Math.abs(off) / 55);
            this.sound.pop();
            buzz(20);
            leo.boop(0.6);
            this.say(Math.abs(off) < 12 ? '딱!' : '오케이', ck.mx, land - 20, 24, '#6b8f5a');
            if (ck.layers.length === 3) {
              this.sub = 1;
              this.onToast('시트 완성! 문질러서 크림을 발라주세요');
            }
          }
        }
      }
    } else if (this.sub === 1) {
      if (ck.cream >= 1) {
        this.sub = 2;
        this.sound.jingle();
        this.onToast('토핑을 끌어다 케이크 위에 올려주세요');
      }
    } else if (this.sub === 2) {
      if (ck.tops.every((o) => o.placed)) {
        this.sub = 3;
        this.sound.jingle();
        this.onToast('초코판에 축하 글씨를 써주세요');
      }
    } else if (this.sub === 5) {
      this.modeT += dt;
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.45;
        leo.jump(-340);
        if (this.modeT < 2.4) this.bark();
        for (let k = 0; k < 3; k++) this.emit('heart', rand(40, W - 40), g - rand(120, 300), rand(-40, 40), rand(-110, -50), 1.3);
      }
      if (this.modeT > 4) {
        const stars = ck.acc > 2.25 ? 3 : ck.acc > 1.35 ? 2 : 1;
        leo.hat = false;
        leo.x = 120;
        this.endScene(`케이크 완성! ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} 레오가 신나게 먹었어요`, { mood: 40, hunger: 25 }, 0);
      }
    }
  }

  private drawCake() {
    const ctx = this.ctx;
    const c = this.crayon;
    const ck = this.cake;
    const g = this.gy;
    // 상
    c.rect(CAKE_X - 112, g - 34, 224, 12, '#9a6a3c', 400, '#e2c08e');
    c.line([[CAKE_X - 92, g - 22], [CAKE_X - 98, g + 12]], '#9a6a3c', 2.6, 401);
    c.line([[CAKE_X + 92, g - 22], [CAKE_X + 98, g + 12]], '#9a6a3c', 2.6, 402);
    const layer = (x: number, y: number, i: number) => {
      const w = CAKE_W[i];
      ctx.fillStyle = '#f3d9a4';
      ctx.fillRect(x - w / 2, y, w, 30);
      c.rect(x - w / 2, y, w, 30, '#b07a3a', 410 + i, '#e8b96a');
      if (ck.cream > 0) {
        ctx.save();
        ctx.globalAlpha = ck.cream;
        ctx.fillStyle = '#fffaf0';
        ctx.fillRect(x - w / 2 - 3, y - 4, w + 6, 13);
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(x - w / 2 + 8 + (k * (w - 16)) / 4, y + 9, 6, 4 + ((k * 7 + i * 3) % 5), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (ck.cream > 0.5) c.line([[x - w / 2 - 3, y - 4], [x + w / 2 + 3, y - 4]], '#d9c9ae', 1.6, 420 + i, 1);
      }
    };
    ck.layers.forEach((x, i) => layer(x, g - 34 - (i + 1) * 30, i));
    if (this.sub === 0 && ck.layers.length < 3) {
      const i = ck.layers.length;
      layer(ck.mx, ck.fall ?? g - 34 - (i + 1) * 30 - 110, i);
    }
    const topX = ck.layers[2] ?? CAKE_X;
    const topY = g - 34 - 90;
    const icing = (ox: number, oy: number, k: number, lw: number) => {
      ctx.save();
      ctx.strokeStyle = '#fffaf0';
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const st of ck.strokes) {
        ctx.beginPath();
        st.forEach((q, i) => (i ? ctx.lineTo(ox + q.x * k, oy + q.y * k) : ctx.moveTo(ox + q.x * k, oy + q.y * k)));
        if (st.length === 1) ctx.lineTo(ox + st[0].x * k + 0.1, oy + st[0].y * k);
        ctx.stroke();
      }
      ctx.restore();
    };
    if (this.sub >= 4 && ck.strokes.length) {
      // 완성된 레터링 초코판을 케이크 앞에 붙인다
      const px = (ck.layers[0] ?? CAKE_X) - 48;
      const py = g - 34 - 54;
      ctx.fillStyle = '#6b3f1c';
      ctx.fillRect(px, py, 96, 45);
      c.rect(px, py, 96, 45, '#3f2410', 450);
      icing(px + 3, py + 1.5, 0.3, 2);
    }
    if (this.sub === 3) {
      const b = this.plaque();
      ctx.fillStyle = '#6b3f1c';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      c.rect(b.x, b.y, b.w, b.h, '#3f2410', 451, '#7d4a22');
      ctx.save();
      ctx.font = '700 40px Gaegu, "Comic Sans MS", cursive';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 250, 240, 0.16)';
      ctx.fillText('레오야', b.x + b.w / 2, b.y + 56);
      ctx.fillText('생일 축하해', b.x + b.w / 2, b.y + 108);
      ctx.restore();
      icing(b.x, b.y, 1, 6);
      const by = b.y + b.h + 8;
      ctx.fillStyle = PAPER;
      ctx.fillRect(184, by, 70, 34);
      ctx.fillRect(262, by, 83, 34);
      c.rect(184, by, 70, 34, INK, 452);
      c.rect(262, by, 83, 34, INK, 453, '#e8964a');
      ctx.save();
      ctx.font = '700 19px Gaegu, "Comic Sans MS", cursive';
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.fillText('지우기', 219, by + 23);
      ctx.fillText('다 썼어요', 303.5, by + 23);
      ctx.restore();
    }
    if (this.sub >= 4) {
      c.rect(topX - 3, topY - 34, 6, 30, '#3f7fb5', 430, '#9cc3e2');
      if (ck.lit) {
        const f = Math.sin(this.t * 18) * 1.5;
        c.blob(topX + f * 0.4, topY - 44, 6, 10 + f, { fill: '#f2c84b', edge: '#e2714c', seed: 431 });
      }
    }
    if (this.sub >= 2) {
      for (const o of ck.tops) {
        ctx.save();
        ctx.translate(o.x, o.y + (o.placed || o.held ? 0 : Math.sin(this.t * 3 + o.hx) * 3));
        if (o.kind === 0) {
          c.blob(0, 0, 10, 12, { fill: '#e2574c', edge: '#a8322a', seed: 440 });
          c.blob(0, -11, 7, 3.5, { fill: '#7fa35a', seed: 441 });
        } else if (o.kind === 1) {
          c.blob(0, 0, 9, 9, { fill: '#5b6fb5', edge: '#34407a', seed: 442 });
        } else {
          ctx.scale(0.62, 0.62);
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.bezierCurveTo(-27, -4, -15, -24, 0, -9);
          ctx.bezierCurveTo(15, -24, 27, -4, 0, 15);
          ctx.fillStyle = '#a8703c';
          ctx.fill();
          ctx.strokeStyle = '#6b3f1c';
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    const guide = [
      '시트가 가운데 올 때 화면을 눌러 쌓아요',
      '케이크를 문질러 크림을 발라요',
      '딸기, 블루베리, 쌩쌩이를 케이크 위로 끌어요',
      '초코판에 손가락으로 축하 글씨를 써요',
      '화면을 눌러 초에 불을 붙여요',
      '',
    ][this.sub];
    ctx.save();
    ctx.font = '400 16px Gaegu, "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8c8272';
    ctx.fillText(guide ?? '', W / 2, g + 56);
    ctx.restore();
  }

  private wake(msg: string) {
    this.leo.squash.target = 1;
    this.leo.boop(0.8);
    this.mode = 'idle';
    this.idleT = 3;
    this.onToast(msg);
    this.gainXp(10);
  }

  private endScene(msg: string, d: Partial<Stats>, xp = 20) {
    const leo = this.leo;
    leo.treadmill = false;
    leo.tremble = 0;
    leo.harness = false;
    leo.paw.target = 0;
    leo.lift.target = 0;
    leo.squash.target = 1;
    this.handle.held = false;
    this.tool = null;
    this.walkPoop = null;
    this.mode = 'idle';
    this.idleT = 3;
    leo.x = clamp(leo.x, 60, W - 120);
    leo.happy(2);
    leo.jump(-320);
    this.sound.jingle();
    this.onToast(msg);
    this.bump(d);
    this.gainXp(xp);
  }

  private bark() {
    const hungry = this.stats.hunger < 30;
    this.leo.barkPose();
    this.sound.bark(rand(0.92, 1.1));
    this.say(hungry ? '밥!!' : '왕!', this.leo.x + this.leo.dir * rand(40, 70), this.gy - rand(170, 215), rand(22, 30), INK);
  }

  private eatTreat() {
    this.treat = null;
    this.sound.munch();
    setTimeout(() => this.sound.munch(), 140);
    setTimeout(() => this.sound.jingle(), 300);
    for (let i = 0; i < 6; i++) this.emit('crumb', this.leo.x, this.gy - 110, rand(-80, 80), rand(-120, -20), 0.6);
    this.mode = 'zoom';
    this.modeT = 5;
    this.leo.happy(5.5);
    this.say('쌩쌩!!', this.leo.x, this.gy - 210, 34, '#d1483a');
    buzz(50);
    this.bump({ energy: 35, hunger: 8, mood: 12 });
          this.gainXp(8);
  }

  private emit(kind: Part['kind'], x: number, y: number, vx: number, vy: number, life: number) {
    if (this.parts.length < 80) this.parts.push({ kind, x, y, vx, vy, t: 0, life });
  }

  private say(text: string, x: number, y: number, size: number, color: string) {
    this.texts.push({ text, x: clamp(x, 50, W - 50), y, t: 0, life: 1.3, size, color, rot: rand(-0.18, 0.18) });
  }

  // ---------- 루프 ----------
  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.t += dt;
    this.boilT += dt;
    if (this.boilT > 0.16) {
      this.boilT = 0;
      this.crayon.boil = (this.crayon.boil + 1) % 3;
    }
    const leo = this.leo;
    const g = this.gy;
    this.decay(dt);
    this.emitT += dt;
    if (this.emitT > 0.5) {
      this.emitT = 0;
      this.onChange({ ...this.stats });
    }
    this.saveT += dt;
    if (this.saveT > 5) {
      this.saveT = 0;
      this.save();
    }

    // 표정과 꼬리는 기분을 따라간다
    const mood = this.stats.mood;
    leo.pant = mood > 62 || this.mode === 'zoom' || this.mode === 'mom';
    leo.eye = mood < 25 ? 'squint' : 'open';
    leo.tailSpeed = this.mode === 'mom' || this.mode === 'zoom' ? 26 : 5 + mood * 0.1;
    leo.tailAmp.target = this.mode === 'mom' ? 0.6 : this.mode === 'sulk' ? 0.03 : 0.12 + mood * 0.003;

    leo.tremble = 0;
    if (this.mode === 'bath' || this.mode === 'sleep') {
      leo.eye = 'squint';
      leo.pant = false;
      leo.tailAmp.target = 0.03;
    }
    if (this.mode === 'vet') {
      leo.pant = false;
      leo.tailAmp.target = 0.02;
      leo.tremble = this.sub === 0 ? 1 : this.sub === 1 ? 1 - this.calm : this.sub === 2 ? 0.3 : 0;
    }

    // 시선
    let look: P | null = null;
    if (this.mode === 'cake') look = { x: this.cake.mx, y: this.gy - 130 };
    else if (this.mode === 'trick' && (this.sub === 1 || this.sub === 4)) look = { x: this.leo.x + 95, y: this.gy - 40 };
    else if (this.treat) look = this.treat;
    else if (this.ball) look = this.ball;
    else if (this.ptr) look = this.ptr;
    if (look && !this.eating) {
      leo.headX.target = clamp((look.x - leo.x) * 0.09 * leo.dir, -9, 9);
      leo.headY.target = clamp((look.y - (g - 140)) * 0.05, -7, 7);
    } else if (!this.eating) {
      leo.headX.target = 0;
      leo.headY.target = 0;
    }

    switch (this.mode) {
      case 'cake': {
        this.updateCake(dt);
        break;
      }
      case 'trick': {
        this.updateTrick(dt);
        break;
      }
      case 'sock': {
        this.updateSock(dt);
        break;
      }
      case 'idle': {
        if (this.pendingEvent && leo.jumpY === 0) {
          this.pendingEvent = false;
          this.sound.fanfare();
          // 랜덤으로 뽑되 직전에 나온 미니게임은 제외
          const pool = GAMES.filter((k) => k !== this.lastGame);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          this.lastGame = pick;
          this.save();
          this.onLevelUp(this.level, pick);
        }
        if (this.barksLeft > 0) {
          this.barkT -= dt;
          if (this.barkT <= 0) {
            this.bark();
            this.barksLeft--;
            this.barkT = 0.24;
          }
        }
        if (!this.ptr) this.idleT -= dt;
        if (this.idleT <= 0) {
          this.idleT = rand(4, 8);
          const r = Math.random();
          if (r < 0.5) leo.goTo(rand(70, W - 120), undefined, 110);
          else if (r < 0.85) {
            this.barksLeft = 2 + Math.floor(Math.random() * 3);
            this.barkT = 0;
          }
        }
        if (this.poopAt && this.t > this.poopAt) {
          this.poopAt = 0;
          this.poops.push(clamp(leo.x - leo.dir * 62, 40, W - 110));
          this.sound.pop();
          this.onToast('레오가 응가했어요. 눌러서 치워주세요');
        }
        break;
      }
      case 'feed': {
        if (!this.eating) break;
        this.modeT -= dt;
        this.tickT -= dt;
        leo.headX.target = 14;
        leo.headY.target = 34 + Math.sin(this.t * 16) * 5;
        if (this.tickT <= 0) {
          this.tickT = 0.26;
          this.sound.munch();
          buzz(6);
          this.emit('crumb', (this.bowl ?? 70) + rand(-10, 16), g - 22, rand(-60, 60), rand(-120, -50), 0.5);
        }
        if (this.modeT <= 0) {
          this.eating = false;
          this.bowl = null;
          this.mode = 'idle';
          this.idleT = 2.5;
          leo.happy(2);
          leo.jump(-300);
          this.sound.jingle();
          this.poopAt = this.t + 30;
          this.onToast('싹싹 비웠어요');
          this.bump({ hunger: 45, mood: 6 });
          this.gainXp(10);
        }
        break;
      }
      case 'treat': {
        const tr = this.treat;
        if (!tr) break;
        const mouth = { x: leo.x, y: g - 112 * LEO_SCALE };
        if (!tr.held && !tr.dropped) tr.y += Math.sin(this.t * 3) * 0.3;
        if (tr.held || tr.dropped) {
          if (Math.hypot(tr.x - mouth.x, tr.y - mouth.y) < 46) {
            this.eatTreat();
            break;
          }
        }
        if (tr.held && Math.random() < dt * 1.6) leo.jump(-260);
        if (tr.dropped) {
          tr.vy += 1500 * dt;
          tr.y += tr.vy * dt;
          if (tr.y >= g - 8) {
            tr.y = g - 8;
            tr.vy = 0;
            if (leo.targetX === null) leo.goTo(tr.x, () => this.eatTreat(), 260);
          }
        }
        break;
      }
      case 'zoom': {
        this.modeT -= dt;
        if (leo.targetX === null) leo.goTo(leo.x < W / 2 ? W - 100 : 50, undefined, 440);
        if (Math.random() < dt * 22)
          this.emit('line', leo.x - leo.dir * rand(40, 80), g - rand(20, 150), -leo.dir * 260, 0, 0.3);
        if (Math.random() < dt * 5) this.emit('dust', leo.x - leo.dir * 30, g - 6, -leo.dir * 60, -50, 0.5);
        if (this.modeT <= 0) {
          leo.targetX = null;
          this.mode = 'idle';
          this.idleT = 3;
          this.onToast('쌩쌩이 먹고 쌩쌩해졌어요');
        }
        break;
      }
      case 'ball': {
        const b = this.ball;
        if (!b) break;
        if (!b.live) {
          if (!b.held) b.y += Math.sin(this.t * 3) * 0.3;
          break;
        }
        b.liveT += dt;
        b.vy += 1500 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 18) {
          b.x = 18;
          b.vx = Math.abs(b.vx) * 0.75;
        }
        if (b.x > W - 18) {
          b.x = W - 18;
          b.vx = -Math.abs(b.vx) * 0.75;
        }
        if (b.y < 18) {
          b.y = 18;
          b.vy = Math.abs(b.vy) * 0.6;
        }
        if (b.y > g - 14) {
          b.y = g - 14;
          if (Math.abs(b.vy) > 140) this.sound.boing();
          b.vy = -Math.abs(b.vy) * 0.62;
          b.vx *= 0.86;
        }
        leo.goTo(clamp(b.x, 45, W - 45), undefined, 250);
        if (b.liveT > 0.5 && Math.abs(leo.x - b.x) < 40 && b.y > g - 170 * LEO_SCALE) {
          this.ball = null;
          leo.targetX = null;
          leo.jump(-380);
          leo.happy(2);
          this.sound.jingle();
          buzz(30);
          this.say('잡았다!', leo.x, g - 215, 28, '#3f7fb5');
          for (let i = 0; i < 4; i++) this.emit('heart', leo.x + rand(-30, 30), g - 150, rand(-40, 40), rand(-110, -60), 1);
          this.mode = 'idle';
          this.idleT = 3;
          this.bump({ mood: 14, energy: -8, hunger: -3 });
          this.gainXp(10);
        }
        break;
      }
      case 'mom': {
        if (this.sub === 0) break;
        this.modeT += dt;
        leo.dir = 1;
        if (this.modeT < 1.7) {
          this.tickT -= dt;
          if (this.tickT <= 0) {
            this.tickT = 0.42;
            leo.jump(-360);
            this.bark();
            this.emit('heart', leo.x + rand(-40, 40), g - 170, rand(-40, 40), rand(-120, -70), 1.2);
          }
        } else if (this.modeT < 3.0) {
          // 빙글빙글
          if (this.sub === 1) {
            this.sub = 2;
            this.sound.whoosh();
            this.say('빙글빙글', leo.x, g - 215, 26, '#d1483a');
          }
          leo.spin = ((this.modeT - 1.7) / 1.3) * Math.PI * 4;
          if (Math.random() < dt * 10) this.emit('dust', leo.x + rand(-40, 40), g - 6, rand(-80, 80), -60, 0.5);
        } else if (this.modeT < 6.0) {
          // 발라당 배 까고 등으로 뭉개기
          if (this.sub === 2) {
            this.sub = 3;
            leo.spin = 0;
            leo.belly = true;
            leo.happy(3.2);
            this.sound.jingle();
            buzz(40);
            this.say('발라당', leo.x, g - 150, 28, '#d1483a');
          }
          if (Math.random() < dt * 5)
            this.emit('heart', leo.x + rand(-60, 60), g - 100, rand(-30, 30), rand(-110, -60), 1.2);
        } else {
          leo.belly = false;
          leo.spin = 0;
          leo.jump(-300);
          this.mode = 'idle';
          this.idleT = 3;
          this.onToast('엄마가 세상에서 제일 좋대요. 약았다 약았어');
          this.bump({ mood: 30 });
          this.gainXp(6);
        }
        break;
      }
      case 'bath': {
        if (this.sub === 0) {
          if (this.foam >= 1) {
            this.sub = 1;
            this.sound.jingle();
            this.onToast('거품 완성! 레오 위를 꾹 눌러 물로 헹궈주세요');
          }
        } else if (this.sub === 1) {
          if (this.ptr) {
            this.tickT -= dt;
            if (this.tickT <= 0) {
              this.tickT = 0.12;
              this.sound.shower();
            }
            for (let i = 0; i < 3; i++) this.emit('drop', this.ptr.x + rand(-26, 26), g - 300, rand(-10, 10), rand(300, 420), 0.7);
            if (Math.abs(this.ptr.x - leo.x) < 85) this.foam -= dt * 0.45;
          }
          if (this.foam <= 0) {
            this.foam = 0;
            this.sub = 2;
            this.modeT = 1.3;
            this.say('탈탈탈!', leo.x, g - 215, 28, '#3f7fb5');
            buzz(120);
          }
        } else if (this.sub === 2) {
          this.modeT -= dt;
          leo.tremble = 4;
          for (let i = 0; i < 2; i++)
            this.emit('drop', leo.x + rand(-30, 30), g - rand(60, 160), rand(-260, 260), rand(-200, -40), 0.6);
          if (this.modeT <= 0) {
            this.sub = 3;
            this.wet = [1, 1, 1, 1, 1];
            this.onToast('드라이기로 물방울 있는 곳을 구석구석 말려주세요');
          }
        } else {
          // 털 말리기: 부위 5곳을 전부 말려야 끝
          leo.eye = 'open';
          if (this.ptr) {
            this.tickT -= dt;
            if (this.tickT <= 0) {
              this.tickT = 0.14;
              this.sound.dryer();
            }
            leo.tilt.target = Math.sin(this.t * 20) * 0.03;
            this.zones().forEach((z, i) => {
              if (this.wet[i] > 0 && Math.hypot(this.ptr!.x - z.x, this.ptr!.y - z.y) < 46) {
                this.wet[i] -= dt * 0.9;
                if (Math.random() < dt * 14) this.emit('line', z.x + rand(-20, 20), z.y + rand(-20, 20), rand(-200, -120), 0, 0.25);
                if (this.wet[i] <= 0) {
                  this.wet[i] = 0;
                  this.sound.note(8 + i);
                  buzz(15);
                  leo.boop(0.5);
                  this.say('뽀송', z.x, z.y - 20, 20, '#3f7fb5');
                }
              }
            });
          }
          if (this.wet.every((w) => w <= 0)) {
            leo.tilt.target = 0;
            this.stats.clean = 100;
            this.say('뽀송뽀송!', leo.x, g - 215, 30, '#3f7fb5');
            this.endScene('목욕 끝! 싫어했지만 뽀송해졌어요', { mood: -2 });
          }
        }
        break;
      }
      case 'walk': {
        const h = this.handle;
        const restX = leo.x + 105;
        const restY = g - 150;
        if (!h.held) {
          h.x += (restX - h.x) * Math.min(1, dt * 8);
          h.y += (restY - h.y) * Math.min(1, dt * 8);
        }
        // 손잡이를 앞으로 끌수록 빨리 걷는다
        const pull = this.sub === 0 && h.held ? clamp((h.x - restX + 20) / 110, 0, 1) : 0;
        const walking = pull > 0.12;
        leo.treadmill = walking;
        if (walking) {
          this.dist += dt * 8 * pull;
          this.scroll += dt * 170 * pull;
        }
        if (this.other === 1) this.otherX += (W - 80 - this.otherX) * Math.min(1, dt * 4);
        if (this.other === 2) {
          this.otherX += dt * 160;
          if (this.otherX > W + 90) this.other = 0;
        }
        if (this.sub === 1) {
          this.modeT -= dt;
          leo.headY.target = 26;
          if (this.modeT <= 0) {
            this.sub = 0;
            this.bump({ mood: 5 });
          }
        } else if (this.sub === 2) {
          this.tickT -= dt;
          if (this.tickT <= 0) {
            this.tickT = 0.3;
            this.bark();
          }
          if (this.calm >= 1) {
            this.sub = 0;
            this.other = 2;
            this.say('휴…', leo.x, g - 210, 24, INK);
          }
        } else if (this.sub === 4) {
          leo.eye = 'squint';
          leo.pant = true;
        } else if (this.sub === 5) {
          this.dist += dt * 4;
          this.scroll += dt * 110;
          if (this.dist >= 100) this.endScene('산책 끝! 마지막엔 안겨서 왔어요', { mood: 25, energy: -20, clean: -10, hunger: -8 }, 25);
        }
        if (this.sub === 0) {
          const poop = (msg: string) => {
            this.sub = 3;
            this.walkPoop = leo.x - 70;
            h.held = false;
            this.sound.pop();
            this.onToast(msg);
          };
          if (this.dist >= 5 && !(this.ev & 8)) {
            this.ev |= 8;
            poop('나오자마자 응가! 눌러서 봉투에 담아주세요');
          } else if (this.dist >= 25 && !(this.ev & 1)) {
            this.ev |= 1;
            this.sub = 1;
            this.modeT = 1.8;
            this.say('킁킁', leo.x + 50, g - 60, 24, '#6b8f5a');
          } else if (this.dist >= 55 && !(this.ev & 2)) {
            this.ev |= 2;
            this.sub = 2;
            this.calm = 0;
            this.other = 1;
            this.tickT = 0;
            h.held = false;
            this.onToast('다른 강아지다! 레오를 쓰다듬어 진정시켜 주세요');
          } else if (this.dist >= 80 && !(this.ev & 4)) {
            this.ev |= 4;
            poop('또 응가! 눌러서 봉투에 담아주세요');
          } else if (this.dist >= 90 && !(this.ev & 16)) {
            this.ev |= 16;
            this.sub = 4;
            h.held = false;
            leo.squash.target = 0.88;
            this.say('힘들어…', leo.x, g - 215, 26, INK);
            this.onToast('힘들다고 버티고 안 걸어요. 안아줘야 해요');
          }
        }
        break;
      }
      case 'vet': {
        const tl = this.tool;
        if (this.sub === 0 && tl) {
          if (tl.held && Math.hypot(tl.x - leo.x, tl.y - (g - 82 * LEO_SCALE)) < 48) {
            this.hold += dt;
            this.tickT -= dt;
            if (this.tickT <= 0) {
              this.tickT = 0.5;
              this.sound.thump();
              buzz(20);
              this.say('두근', leo.x + rand(-50, 50), g - rand(150, 200), 22, '#d1483a');
            }
            if (this.hold >= 1.7) {
              this.sub = 1;
              this.tool = null;
              this.onToast('심장 튼튼! 겁먹었으니 쓰다듬어서 진정시켜 주세요');
            }
          }
        } else if (this.sub === 1) {
          if (this.calm >= 1) {
            this.sub = 2;
            this.tool = { kind: 'syringe', x: W - 70, y: g - 250, held: false };
            this.onToast('지금이에요! 주사기를 레오 엉덩이에 콕');
          }
        } else if (this.sub === 2 && tl) {
          if (tl.held && Math.hypot(tl.x - (leo.x + 34), tl.y - (g - 48 * LEO_SCALE)) < 44) {
            this.tool = null;
            this.sub = 3;
            this.modeT = 1.5;
            this.sound.yelp();
            buzz(80);
            leo.jump(-420);
            this.say('깽!', leo.x, g - 215, 34, INK);
          }
        } else if (this.sub === 3) {
          this.modeT -= dt;
          if (this.modeT <= 0) this.endScene('주사 끝! 잘 참았어요. 쌩쌩이로 달래주세요', { mood: -10, energy: 5 });
        }
        break;
      }
      case 'sleep': {
        this.modeT += dt;
        this.stats.energy = Math.min(100, this.stats.energy + dt * 5);
        this.stats.mood = Math.min(100, this.stats.mood + dt * 0.5);
        if (this.modeT > 1.3) {
          this.modeT = 0;
          this.say('z', leo.x + 45, g - 190, 26, '#6f6a8a');
        }
        if (this.stats.energy >= 100) this.wake('푹 자고 일어났어요');
        break;
      }
      case 'angry': {
        this.modeT -= dt;
        this.tickT -= dt;
        leo.eye = 'angry';
        leo.pant = false;
        leo.tailAmp.target = 0.02;
        leo.tremble = 0.8;
        if (this.tickT <= 0) {
          // 손가락 쪽으로 달려들며 앙앙
          this.tickT = 0.3;
          const tx = this.ptr ? this.ptr.x : leo.x + rand(-90, 90);
          leo.goTo(clamp(tx, 50, W - 60), undefined, 460);
          leo.jump(-230);
          leo.barkPose();
          this.sound.bark(rand(0.78, 0.9));
          if (Math.random() < 0.4) this.sound.growl();
          buzz(30);
          this.say(Math.random() < 0.5 ? '왁!!' : '앙!', leo.x + rand(-50, 50), g - rand(180, 225), rand(26, 34), '#b3261e');
        }
        if (this.modeT <= 0) {
          leo.targetX = null;
          leo.back = true;
          this.mode = 'sulk';
          this.modeT = 3.5;
          this.onToast('화 풀릴 때까지 등 돌리고 있대요');
          this.bump({ mood: -12 });
        }
        break;
      }
      case 'sulk': {
        this.modeT -= dt;
        if (this.modeT <= 0) {
          leo.back = false;
          this.mode = 'idle';
          this.idleT = 3;
          leo.boop(0.6);
        }
        break;
      }
    }

    leo.x = clamp(leo.x, 40, W - 40);
    leo.update(dt);

    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'crumb' || p.kind === 'dust') p.vy += 320 * dt;
      if (p.kind === 'drop') p.vy += 900 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const f of this.texts) {
      f.t += dt;
      f.y -= 34 * dt;
    }
    this.texts = this.texts.filter((f) => f.t < f.life);
  }

  private draw() {
    const ctx = this.ctx;
    const c = this.crayon;
    const g = this.gy;
    const bg = this.mode === 'vet' ? this.bgVet[c.boil] : this.bg[c.boil];
    if (this.mode === 'walk') this.drawWalk();
    else if (bg) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.restore();
    }

    for (const x of ['walk', 'vet', 'cake', 'trick', 'sock'].includes(this.mode) ? [] : this.poops) {
      c.blob(x, g - 6, 15, 7, { fill: '#8a5a33', edge: '#5e3b1e', seed: 200 });
      c.blob(x, g - 15, 10.5, 6, { fill: '#8a5a33', edge: '#5e3b1e', seed: 201 });
      c.blob(x + 1, g - 23, 5.5, 4.5, { fill: '#8a5a33', edge: '#5e3b1e', seed: 202 });
    }

    if (this.mode === 'bath' && this.sub < 3) {
      // 욕조 뒤쪽과 물
      this.tubPath(false);
      ctx.fillStyle = '#bfdcee';
      ctx.fill();
      ctx.strokeStyle = '#5f8fb0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.mode === 'walk') {
      // 줄과 손잡이는 레오 뒤에 그린다
      const leo = this.leo;
      const h = this.handle;
      const ax = leo.x + 6;
      const ay = g - 92 * LEO_SCALE + leo.lift.x + leo.hopY;
      ctx.save();
      ctx.strokeStyle = '#d1483a';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      const slack = Math.max(6, 46 - Math.hypot(h.x - ax, h.y - ay) * 0.22);
      ctx.quadraticCurveTo((ax + h.x) / 2, Math.max(ay, h.y) + slack, h.x, h.y + 14);
      ctx.stroke();
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, 12 + (c.boil % 2) * 0.6, 16, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    this.leo.draw(c, g);
    if (this.bowl !== null) {
      c.blob(this.bowl, g - 16, 21, 6, { fill: '#9a6a3c', seed: 210 });
      c.blob(this.bowl, g - 8, 27, 11, { fill: '#7fa8c9', edge: '#4f7896', seed: 211, hatch: 0.3 });
    }

    this.drawSceneProps();
    if (this.mode === 'cake') this.drawCake();
    if (this.mode === 'trick') this.drawTrick();
    if (this.mode === 'sock') this.drawSockGame();

    const tr = this.treat;
    if (tr) {
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(tr.held ? Math.sin(this.t * 14) * 0.15 : Math.sin(this.t * 2.5) * 0.12);
      // 쌩쌩이: 갈색 하트
      const hp = () => {
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.bezierCurveTo(-27, -4, -15, -24, 0, -9);
        ctx.bezierCurveTo(15, -24, 27, -4, 0, 15);
      };
      ctx.save();
      hp();
      ctx.clip();
      ctx.fillStyle = '#a8703c';
      ctx.fillRect(-26, -24, 52, 42);
      ctx.strokeStyle = '#8a5527';
      ctx.lineWidth = 2.6;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (let d = -40; d < 40; d += 5) {
        const j = ((c.boil * 7 + d * 13) % 5) * 0.5;
        ctx.moveTo(d + j - 12, 20);
        ctx.lineTo(d + j + 12, -26);
      }
      ctx.stroke();
      ctx.restore();
      hp();
      ctx.strokeStyle = '#6b3f1c';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }
    const b = this.ball;
    if (b) {
      c.blob(b.x, b.y, 15, 15, { fill: '#e2574c', edge: '#a8322a', seed: 230, hatch: b.x * 0.03 });
      c.line([[b.x - 10, b.y - 4], [b.x, b.y - 8], [b.x + 10, b.y - 4]], '#fbf3de', 2.4, 231, 0.6);
    }

    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.translate(p.x, p.y);
      if (p.kind === 'heart') {
        const s = 0.6 + Math.min(p.t * 6, 1) * 0.5;
        ctx.scale(s, s);
        ctx.fillStyle = '#ee6f7c';
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.bezierCurveTo(-12, -3, -6, -12, 0, -5);
        ctx.bezierCurveTo(6, -12, 12, -3, 0, 6);
        ctx.fill();
      } else if (p.kind === 'line') {
        ctx.strokeStyle = '#8c8272';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.sign(p.vx) * -34, 0);
        ctx.stroke();
      } else if (p.kind === 'drop') {
        ctx.strokeStyle = '#6fa3cf';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-p.vx * 0.02, -p.vy * 0.02 - 4);
        ctx.stroke();
      } else if (p.kind === 'bubble') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#8fb9d8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 4 + p.t * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = p.kind === 'crumb' ? '#9a6a3c' : '#c9bda4';
        ctx.beginPath();
        ctx.arc(0, 0, p.kind === 'crumb' ? 2.6 : 5 * a + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const f of this.texts) {
      const k = Math.min(f.t * 9, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - f.t / f.life) * 2.2);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
      ctx.font = `700 ${f.size}px Gaegu, "Comic Sans MS", cursive`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = PAPER;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }

    if (this.mode === 'sleep') {
      ctx.fillStyle = 'rgba(38, 36, 66, 0.38)';
      ctx.fillRect(0, 0, W, this.H);
    }
  }

  /** 산책길: 스크롤되는 나무, 구름, 풀 */
  private drawWalk() {
    const ctx = this.ctx;
    const c = this.crayon;
    const g = this.gy;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, this.H);
    c.blob(W - 62, Math.max(150, g - 330), 24, 24, { fill: '#f2c84b', edge: '#d9a520', seed: 300, fur: 0.35 });
    for (let i = 0; i < 3; i++) {
      const x = wrap(i * 190 - this.scroll * 0.2, 570) - 90;
      c.blob(x, Math.max(170, g - 300) + i * 30, 36, 13, { fill: '#dbe6ee', seed: 301 + i, hatch: 0.2 });
    }
    for (let i = 0; i < 4; i++) {
      const x = wrap(i * 230 - this.scroll, 920) - 120;
      c.rect(x - 7, g - 112, 14, 122, '#8a5a33', 310 + i, '#c79f62');
      c.blob(x, g - 150, 46, 44, { fill: '#9dbf7a', edge: '#6b8f5a', seed: 320 + i, fur: 0.18 });
    }
    const pts: number[][] = [];
    for (let x = -5; x <= W + 5; x += 26) pts.push([x, g + 10]);
    c.line(pts, '#8a9a6a', 2.4, 330, 2.2);
    for (let i = 0; i < 10; i++) {
      const x = wrap(i * 47 - this.scroll, 470) - 40;
      c.line([[x, g + 12], [x + 3, g]], '#7fa35a', 2.2, 331 + i, 1);
      c.line([[x + 6, g + 12], [x + 10, g + 3]], '#7fa35a', 2.2, 345 + i, 1);
    }
    ctx.save();
    ctx.font = '700 22px Gaegu, "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText(`산책 ${Math.min(100, Math.floor(this.dist))}%`, W / 2, 196);
    const guide = [
      '줄 손잡이를 오른쪽으로 끌면 레오가 따라와요',
      '레오가 냄새 맡는 중',
      '레오를 쓰다듬어 진정시켜요',
      '응가를 눌러 치워요',
      '레오를 위로 끌어올려 안아줘요',
      '안겨서 집에 가는 중',
    ][this.sub];
    ctx.font = '400 16px Gaegu, "Comic Sans MS", cursive';
    ctx.fillStyle = '#8c8272';
    ctx.fillText(guide ?? '', W / 2, g + 56);
    ctx.restore();
  }

  /** 욕조·거품, 다른 강아지, 산책 응가, 진찰 도구 */
  private drawSceneProps() {
    const ctx = this.ctx;
    const c = this.crayon;
    const g = this.gy;
    const leo = this.leo;
    if (this.mode === 'bath' && this.sub < 3) {
      // 욕조 앞면: 레오 하반신을 가려서 안에 들어가 있게
      ctx.save();
      this.tubPath(true);
      ctx.clip();
      ctx.fillStyle = '#eef3f6';
      ctx.fillRect(leo.x - 112, g - 82, 224, 104);
      ctx.strokeStyle = '#cfdde6';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let d = -130; d < 130; d += 6) {
        const j = ((c.boil * 5 + d * 7) % 4) * 0.6;
        ctx.moveTo(leo.x + d + j - 20, g + 20);
        ctx.lineTo(leo.x + d + j + 20, g - 82);
      }
      ctx.stroke();
      ctx.restore();
      this.tubPath(true);
      ctx.strokeStyle = '#5f8fb0';
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      c.blob(leo.x - 62, g + 18, 10, 6, { fill: '#c9a24a', edge: '#8a6a22', seed: 242 });
      c.blob(leo.x + 62, g + 18, 10, 6, { fill: '#c9a24a', edge: '#8a6a22', seed: 243 });
      const n = Math.round(this.foam * 30);
      for (let i = 0; i < n; i++) {
        const a = i * 2.4;
        const r = 14 + ((i * 37) % 52);
        const bx = leo.x + Math.cos(a) * r * 1.1;
        const by = g - 112 * LEO_SCALE + Math.sin(a) * r * 0.95 + Math.sin(this.t * 3 + i) * 1.5;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#8fb9d8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6 + ((i * 13) % 7), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // 물 위 거품
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#8fb9d8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(leo.x - 88 + i * 22, g - 60 + Math.sin(this.t * 2 + i) * 2 + (i % 2) * 5, 7 + (i % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (this.mode === 'bath' && this.sub === 3) {
      this.zones().forEach((z, i) => {
        const w = this.wet[i];
        if (w <= 0) return;
        ctx.save();
        ctx.globalAlpha = 0.35 + w * 0.65;
        for (let k = 0; k < 3; k++) {
          const dx = (k - 1) * 15;
          const dy = Math.sin(this.t * 4 + k + i) * 3 + (k === 1 ? -8 : 4);
          ctx.fillStyle = '#6fa3cf';
          ctx.beginPath();
          ctx.moveTo(z.x + dx, z.y + dy - 9);
          ctx.bezierCurveTo(z.x + dx + 8, z.y + dy + 2, z.x + dx + 4, z.y + dy + 8, z.x + dx, z.y + dy + 8);
          ctx.bezierCurveTo(z.x + dx - 4, z.y + dy + 8, z.x + dx - 8, z.y + dy + 2, z.x + dx, z.y + dy - 9);
          ctx.fill();
        }
        ctx.restore();
      });
      if (this.ptr) {
        // 드라이기
        ctx.save();
        ctx.translate(this.ptr.x + 46, this.ptr.y - 30);
        ctx.rotate(-0.5 + Math.sin(this.t * 30) * 0.03);
        c.rect(-6, 4, 14, 34, '#4a4640', 280, '#e8a0a0');
        c.blob(-6, 0, 26, 15, { fill: '#e2574c', edge: '#4a4640', seed: 281, hatch: 0.2 });
        c.blob(-30, 0, 7, 11, { fill: '#4a4640', seed: 282, solid: true });
        ctx.restore();
      }
    }
    if (this.mode === 'walk') {
      if (this.other) {
        const ox = this.otherX;
        const hop = Math.abs(Math.sin(this.t * 9)) * 5;
        c.blob(ox + 6, g - 30 - hop, 30, 22, { fill: '#7b756f', edge: INK, seed: 250, fur: 0.25 });
        c.blob(ox - 22, g - 58 - hop, 19, 17, { fill: '#7b756f', edge: INK, seed: 251, fur: 0.25 });
        c.blob(ox - 12, g - 74 - hop, 6, 10, { fill: '#55504b', seed: 252, rot: 0.4 });
        c.line([[ox - 4, g - 10], [ox - 4, g]], INK, 3, 253, 0.5);
        c.line([[ox + 20, g - 10], [ox + 20, g]], INK, 3, 254, 0.5);
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(ox - 28, g - 62 - hop, 2.6, 0, Math.PI * 2);
        ctx.arc(ox - 40, g - 55 - hop, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.walkPoop !== null) {
        const x = this.walkPoop;
        c.blob(x, g - 6, 15, 7, { fill: '#8a5a33', edge: '#5e3b1e', seed: 200 });
        c.blob(x, g - 15, 10.5, 6, { fill: '#8a5a33', edge: '#5e3b1e', seed: 201 });
        c.blob(x + 1, g - 23, 5.5, 4.5, { fill: '#8a5a33', edge: '#5e3b1e', seed: 202 });
      }
      {
        if (this.sub === 5) {
          c.blob(leo.x - 46, g - 34 + leo.lift.x, 17, 13, { fill: '#f1c9a5', edge: '#b98a63', seed: 290 });
          c.blob(leo.x + 46, g - 34 + leo.lift.x, 17, 13, { fill: '#f1c9a5', edge: '#b98a63', seed: 291 });
        }
      }
      if (this.ev & 1 && this.sub === 1) {
        c.line([[leo.x + 62, g + 8], [leo.x + 62, g - 16]], '#7fa35a', 2.4, 260, 1);
        c.blob(leo.x + 62, g - 22, 8, 8, { fill: '#ee8a8a', edge: '#c9566a', seed: 261, fur: 0.4 });
      }
    }
    const tl = this.tool;
    if (tl) {
      ctx.save();
      ctx.translate(tl.x, tl.y + (tl.held ? 0 : Math.sin(this.t * 3) * 4));
      if (tl.kind === 'steth') {
        c.line([[0, -8], [10, -50], [34, -70]], '#4a4640', 3.4, 270, 1.5);
        c.blob(0, 0, 17, 17, { fill: '#b8c2ca', edge: '#4a4640', seed: 271, hatch: 0.6 });
        c.blob(0, 0, 8, 8, { fill: '#e9eef2', edge: '#4a4640', seed: 272 });
      } else {
        ctx.rotate(2.2);
        c.rect(-8, -34, 16, 40, '#4a4640', 273, '#bcd6e6');
        c.line([[0, 6], [0, 26]], '#4a4640', 2, 274, 0.4);
        c.line([[-10, -34], [10, -34]], '#4a4640', 3, 275, 0.6);
        c.line([[0, -34], [0, -46]], '#4a4640', 3, 276, 0.6);
      }
      ctx.restore();
    }
  }
}
