/** 크레용 낙서 렌더러: 빗금 채색 + 삐뚤빼뚤 외곽선 + 선 떨림(boil). */
const TAU = Math.PI * 2;

export function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PAPER = '#f7f1e3';

export interface BlobOpts {
  fill: string;
  edge?: string;
  seed: number;
  fur?: number;
  rot?: number;
  hatch?: number;
  solid?: boolean;
}

export class Crayon {
  boil = 0;
  constructor(public ctx: CanvasRenderingContext2D) {}

  blob(x: number, y: number, rx: number, ry: number, o: BlobOpts) {
    const ctx = this.ctx;
    const r1 = rng(o.seed * 977 + 1);
    const r2 = rng(o.seed * 977 + this.boil * 131 + 7);
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (o.fur) {
      ctx.strokeStyle = o.fill;
      ctx.lineWidth = 2.8;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      const n = Math.round((rx + ry) * 0.6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r1() * 0.2;
        const len = 1 + o.fur * (0.45 + r1()) + (r2() - 0.5) * 0.06;
        const sk = (r1() - 0.5) * 0.3;
        ctx.moveTo(Math.cos(a) * rx * 0.75, Math.sin(a) * ry * 0.75);
        ctx.lineTo(Math.cos(a + sk) * rx * len, Math.sin(a + sk) * ry * len);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.solid ? o.fill : PAPER;
    ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    if (!o.solid) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = o.fill;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = o.fill;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const R = Math.max(rx, ry) * 1.5;
      const ang = o.hatch ?? -1.1;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let d = -R; d < R; d += 3.6) {
        const j = (r2() - 0.5) * 2.4;
        const px = -sa * (d + j);
        const py = ca * (d + j);
        ctx.moveTo(px - ca * R, py - sa * R);
        ctx.lineTo(px + ca * R, py + sa * R);
      }
      ctx.stroke();
    }
    ctx.restore();

    if (o.edge) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = o.edge;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const k = 1 + (r2() - 0.5) * 0.05;
        const px = Math.cos(a) * rx * k;
        const py = Math.sin(a) * ry * k;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 떨리는 선 */
  line(pts: number[][], color: string, w: number, seed: number, jit = 1.2) {
    const ctx = this.ctx;
    const r = rng(seed * 311 + this.boil * 17 + 3);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p[0] + (r() - 0.5) * jit;
      const y = p[1] + (r() - 0.5) * jit;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  rect(x: number, y: number, w: number, h: number, edge: string, seed: number, fill?: string) {
    const ctx = this.ctx;
    if (fill) {
      const r = rng(seed * 53 + this.boil * 7 + 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = fill;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let d = -h; d < w; d += 4.5) {
        const j = (r() - 0.5) * 3;
        ctx.moveTo(x + d + j, y + h);
        ctx.lineTo(x + d + h * 0.6 + j, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    const seg = (x1: number, y1: number, x2: number, y2: number, s: number) => {
      const pts: number[][] = [];
      for (let i = 0; i <= 6; i++) pts.push([x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6]);
      this.line(pts, edge, 2, seed + s, 1.6);
    };
    seg(x, y, x + w, y, 1);
    seg(x + w, y, x + w, y + h, 2);
    seg(x + w, y + h, x, y + h, 3);
    seg(x, y + h, x, y, 4);
  }
}
