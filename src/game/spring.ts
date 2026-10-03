/** 감쇠 스프링. 찰진 움직임은 전부 이걸로 만든다. */
export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(x = 0, public k = 180, public d = 14) {
    this.x = x;
    this.target = x;
  }
  step(dt: number) {
    const a = -this.k * (this.x - this.target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  kick(v: number) {
    this.v += v;
  }
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
