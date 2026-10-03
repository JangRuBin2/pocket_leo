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
export type Action = 'feed' | 'treat' | 'ball' | 'mom';
type Mode = 'idle' | 'feed' | 'treat' | 'zoom' | 'ball' | 'mom' | 'sulk';

interface Part {
  kind: 'heart' | 'dust' | 'line' | 'crumb';
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
      const d = JSON.parse(raw) as { stats: Stats; ts: number; poops: number };
      const sec = clamp((Date.now() - d.ts) / 1000, 0, 3600 * 48);
      this.stats = d.stats;
      this.poops = Array.from({ length: Math.min(d.poops || 0, 3) }, () => rand(60, W - 110));
      this.decay(sec);
    } catch {
      /* 저장소를 못 쓰는 환경이면 기본값으로 시작 */
    }
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ stats: this.stats, ts: Date.now(), poops: this.poops.length }));
    } catch {
      /* 무시 */
    }
  }

  private decay(sec: number) {
    const s = this.stats;
    s.hunger -= (100 / (3 * 3600)) * sec;
    s.mood -= (100 / (5 * 3600)) * sec;
    s.clean -= (100 / (8 * 3600)) * (1 + this.poops.length * 3) * sec;
    if (this.mode === 'idle') s.energy += (100 / (2 * 3600)) * sec;
    this.clampStats();
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
    this.groundY = this.H - 205;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    this.bg = [0, 1, 2].map((b) => this.paintBg(b, dpr));
  }

  private paintBg(boil: number, dpr: number) {
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
    }
  }

  private poke() {
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
      leo.goTo(W - 120, () => {
        this.modeT = 4;
        this.tickT = 0;
      }, 400);
    }
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

    // 시선
    let look: P | null = null;
    if (this.treat) look = this.treat;
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
      case 'idle': {
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
        }
        break;
      }
      case 'mom': {
        if (this.modeT <= 0) break;
        this.modeT -= dt;
        this.tickT -= dt;
        leo.dir = 1;
        if (this.tickT <= 0) {
          this.tickT = 0.42;
          leo.jump(-360);
          this.bark();
          this.emit('heart', leo.x + rand(-40, 40), g - 170, rand(-40, 40), rand(-120, -70), 1.2);
          this.emit('heart', leo.x + rand(-40, 40), g - 140, rand(-40, 40), rand(-120, -70), 1.2);
        }
        if (this.modeT <= 0) {
          this.mode = 'idle';
          this.idleT = 3;
          this.onToast('엄마가 세상에서 제일 좋대요. 약았다 약았어');
          this.bump({ mood: 30 });
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
    const bg = this.bg[c.boil];
    if (bg) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.restore();
    }

    for (const x of this.poops) {
      c.blob(x, g - 6, 15, 7, { fill: '#8a5a33', edge: '#5e3b1e', seed: 200 });
      c.blob(x, g - 15, 10.5, 6, { fill: '#8a5a33', edge: '#5e3b1e', seed: 201 });
      c.blob(x + 1, g - 23, 5.5, 4.5, { fill: '#8a5a33', edge: '#5e3b1e', seed: 202 });
    }

    this.leo.draw(c, g);
    if (this.bowl !== null) {
      c.blob(this.bowl, g - 16, 21, 6, { fill: '#9a6a3c', seed: 210 });
      c.blob(this.bowl, g - 8, 27, 11, { fill: '#7fa8c9', edge: '#4f7896', seed: 211, hatch: 0.3 });
    }

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
  }
}
