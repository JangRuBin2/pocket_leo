import { Crayon } from './crayon';
import { Spring, clamp, rand } from './spring';

const ORANGE = '#e8964a';
const DEEP = '#d4772c';
const CREAM = '#f3dfb6';
const APRICOT = '#f0cf9a';
const WHITE = '#fbf3de';
const MUZZLE = '#ece4d6';
const TAN = '#c79f62';
const INK = '#2a2622';
const PINK = '#ee8a8a';

export const LEO_SCALE = 1.12;
export type EyeMode = 'open' | 'happy' | 'squint';

/** 레오: 살구색 곰돌이 얼굴, 크림색 가슴털, 등 위로 말린 흰 솜뭉치 꼬리 */
export class Leo {
  x = 195;
  dir = 1;
  t = 0;
  jumpY = 0;
  vy = 0;
  hopY = 0;
  walkPhase = 0;
  targetX: number | null = null;
  speed = 120;
  onArrive: (() => void) | null = null;

  squash = new Spring(1, 230, 11);
  headX = new Spring(0, 160, 14);
  headY = new Spring(0, 200, 13);
  tilt = new Spring(0, 140, 10);
  fur = new Spring(0, 130, 8);
  mouth = new Spring(0, 200, 16);
  tailAmp = new Spring(0.25, 60, 10);
  tailPhase = 0;
  tailSpeed = 7;

  eye: EyeMode = 'open';
  happyT = 0;
  blinkT = 2;
  blinking = 0;
  back = false;
  kick = 0;
  pant = false;
  spin = 0;
  belly = false;
  treadmill = false;
  tremble = 0;
  harness = false;
  lift = new Spring(0, 110, 12);
  private prevY = 0;

  goTo(x: number, cb?: () => void, speed = 120) {
    this.targetX = x;
    this.speed = speed;
    this.onArrive = cb ?? null;
  }

  jump(v = -430) {
    if (this.jumpY < 0) return;
    this.vy = v;
    this.jumpY = -0.01;
    this.squash.kick(3.2);
  }

  boop(power = 1) {
    this.squash.kick(-3.4 * power);
  }

  barkPose() {
    this.squash.kick(2.6);
    this.mouth.x = 1;
    this.headY.kick(-120);
  }

  happy(sec: number) {
    this.happyT = Math.max(this.happyT, sec);
  }

  update(dt: number) {
    this.t += dt;
    if (this.targetX !== null) {
      const d = this.targetX - this.x;
      const stepLen = this.speed * dt;
      if (Math.abs(d) <= stepLen) {
        this.x = this.targetX;
        this.targetX = null;
        this.hopY = 0;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        this.dir = d > 0 ? 1 : -1;
        this.x += Math.sign(d) * stepLen;
        this.walkPhase += dt * (6 + this.speed * 0.035);
        this.hopY = -Math.abs(Math.sin(this.walkPhase)) * (this.speed > 250 ? 15 : 8);
      }
    } else if (this.treadmill) {
      this.walkPhase += dt * 10;
      this.hopY = -Math.abs(Math.sin(this.walkPhase)) * 8;
    } else {
      this.hopY *= 0.8;
    }

    if (this.jumpY < 0) {
      this.vy += 1500 * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY >= 0) {
        this.jumpY = 0;
        this.vy = 0;
        this.squash.kick(-3.6);
      }
    }

    const y = this.jumpY + this.hopY;
    const dy = (y - this.prevY) / Math.max(dt, 0.001);
    this.prevY = y;
    this.fur.target = clamp(-dy * 0.03, -9, 9);

    for (const s of [this.squash, this.headX, this.headY, this.tilt, this.fur, this.mouth, this.tailAmp, this.lift]) s.step(dt);
    this.squash.x = clamp(this.squash.x, 0.6, 1.4);

    this.tailPhase += dt * this.tailSpeed;
    this.mouth.target = this.happyT > 0 || this.pant ? 0.75 + Math.sin(this.t * 9) * 0.12 : 0;

    if (this.happyT > 0) this.happyT -= dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = 0.12;
      this.blinkT = rand(1.8, 4.5);
      if (Math.random() < 0.3) this.tilt.kick(rand(-1.2, 1.2));
    }
    if (this.blinking > 0) this.blinking -= dt;
    if (this.kick > 0) this.kick -= dt;
  }

  draw(c: Crayon, groundY: number) {
    const ctx = c.ctx;
    const S = LEO_SCALE;
    const sy = this.squash.x + Math.sin(this.t * 2.3) * 0.012;
    const sx = 1 + (1 - sy) * 0.8;
    const lag = this.fur.x;
    const moving = this.targetX !== null || this.treadmill ? 1 : 0;
    const lp = Math.sin(this.walkPhase) * 5 * moving;
    const tailAng = Math.sin(this.tailPhase) * this.tailAmp.x;
    const kickX = this.kick > 0 ? Math.sin(this.t * 55) * 7 : 0;

    ctx.save();
    ctx.translate(this.x + Math.sin(this.t * 62) * this.tremble * 2.2, groundY + this.jumpY + this.hopY + this.lift.x);
    if (this.belly) {
      ctx.scale(S, S);
      this.drawBelly(c);
      ctx.restore();
      return;
    }
    const turn = Math.cos(this.spin);
    const back = this.back || turn < 0;
    ctx.scale(this.dir * S * sx * (Math.abs(turn) < 0.18 ? 0.18 * Math.sign(turn || 1) : turn), S * sy);

    const tail = (bx: number) => {
      ctx.save();
      ctx.translate(bx, -80);
      ctx.rotate(tailAng);
      c.blob(bx === 0 ? 0 : 13, -26 + lag * 0.7, 22, 25, { fill: WHITE, edge: TAN, seed: 1, fur: 0.5 });
      ctx.restore();
    };

    if (!back) tail(30);
    c.blob(-35, -12, 13, 14, { fill: CREAM, edge: TAN, seed: 2, fur: 0.15 });
    c.blob(35 + kickX, -12 - Math.abs(kickX) * 0.4, 13, 14, { fill: CREAM, edge: TAN, seed: 3, fur: 0.15 });
    c.blob(0, -58, 48, 46, { fill: CREAM, edge: TAN, seed: 4, fur: 0.22 });
    c.blob(-19, -15 - Math.max(0, lp), 11, 17, { fill: APRICOT, edge: TAN, seed: 5, fur: 0.12 });
    c.blob(19, -15 - Math.max(0, -lp), 11, 17, { fill: APRICOT, edge: TAN, seed: 6, fur: 0.12 });
    if (back) tail(0);
    else c.blob(0, -74 + lag, 39, 33, { fill: WHITE, seed: 7, fur: 0.42 });
    if (this.harness) {
      // 빨간 천 하네스
      c.blob(0, -74, 38, 6.5, { fill: '#d1483a', edge: '#9c2f25', seed: 60, hatch: 0.3 });
      if (!back) c.blob(0, -90, 7, 15, { fill: '#d1483a', edge: '#9c2f25', seed: 61, hatch: 0.3 });
      c.blob(back ? 0 : 20, -96, 5, 5, { fill: '#b9b4ac', edge: '#4a4640', seed: 62 });
    }

    ctx.save();
    ctx.translate(this.headX.x, -128 + this.headY.x + lag * 0.4);
    ctx.rotate(this.tilt.x);
    this.drawHead(c, back);
    ctx.restore();
    ctx.restore();
  }

  private drawHead(c: Crayon, back: boolean) {
    const ctx = c.ctx;
    c.blob(-27, -29, 11, 15, { fill: DEEP, seed: 8, fur: 0.25, rot: -0.4 });
    c.blob(27, -29, 11, 15, { fill: DEEP, seed: 9, fur: 0.25, rot: 0.4 });
    c.blob(0, 0, 43, 38, { fill: ORANGE, edge: DEEP, seed: 10, fur: 0.3 });
    if (back) return;
    const lx = this.headX.x * 0.2;
    c.blob(0, 13, 17, 13, { fill: MUZZLE, seed: 11, fur: 0.22 });

    const m = this.mouth.x;
    if (m > 0.2) {
      ctx.fillStyle = '#5b2a2a';
      ctx.beginPath();
      ctx.ellipse(0, 21, 9, 2 + 7 * m, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.ellipse(0, 23 + 3 * m, 5.5, 2 + 5 * m, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      c.line([[-8, 17], [-4, 20], [0, 17.5], [4, 20], [8, 17]], INK, 1.8, 30, 0.6);
    }

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(lx * 0.5, 8, 6.6, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.ellipse(lx * 0.5 - 2, 6.3, 1.8, 1, 0, 0, Math.PI * 2);
    ctx.fill();

    const mode: EyeMode = this.happyT > 0 ? 'happy' : this.eye;
    for (const sgn of [-1, 1]) {
      const ex = sgn * 17 + lx;
      const ey = -5;
      if (this.blinking > 0 || mode === 'squint') {
        c.line([[ex - 6, ey], [ex + 6, ey + (mode === 'squint' ? sgn * -1.5 : 0)]], INK, 2.4, 40 + sgn, 0.5);
      } else if (mode === 'happy') {
        c.line([[ex - 6, ey + 2], [ex - 3, ey - 3], [ex, ey - 4], [ex + 3, ey - 3], [ex + 6, ey + 2]], INK, 2.6, 42 + sgn, 0.5);
      } else {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(ex, ey, 6.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - 2 + lx * 0.2, ey - 2.2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** 발라당: 배 까고 등으로 바닥을 뭉갠다 */
  private drawBelly(c: Crayon) {
    const ctx = c.ctx;
    const w = Math.sin(this.t * 13);
    ctx.translate(w * 9, 0);
    ctx.rotate(w * 0.07);
    ctx.save();
    ctx.translate(60, -22);
    ctx.rotate(Math.sin(this.tailPhase) * 0.5);
    c.blob(10, -4, 20, 18, { fill: WHITE, edge: TAN, seed: 1, fur: 0.5 });
    ctx.restore();
    c.blob(0, -30, 60, 30, { fill: CREAM, edge: TAN, seed: 4, fur: 0.22 });
    c.blob(4, -42, 44, 19, { fill: WHITE, seed: 7, fur: 0.4 });
    [-24, -6, 22, 40].forEach((x, i) => {
      const k = Math.sin(this.t * 17 + i * 1.7);
      c.blob(x + k * 4, -68 + k * 5, 9, 15, { fill: APRICOT, edge: TAN, seed: 50 + i, fur: 0.12, rot: k * 0.3 });
    });
    ctx.save();
    ctx.translate(-56, -38);
    ctx.rotate(-2.15 + w * 0.12);
    this.drawHead(c, false);
    ctx.restore();
  }
}
