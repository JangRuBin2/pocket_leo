/** 전부 Web Audio로 합성하는 BGM + 효과음. 외부 음원 없음. */
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number;
  v: number[];
}
const CH: Record<string, Chord> = {
  F: { bass: 41, v: [57, 60, 64, 67] }, // Fmaj9
  Dm: { bass: 38, v: [53, 57, 60, 64] }, // Dm9
  Gm: { bass: 43, v: [53, 57, 58, 62] }, // Gm9
  C: { bass: 36, v: [52, 57, 58, 62] }, // C13
  Bb: { bass: 34, v: [57, 60, 62, 65] }, // Bbmaj7
  Am: { bass: 33, v: [55, 60, 64, 67] }, // Am7
};
const PROGS = [
  ['F', 'Dm', 'Gm', 'C'],
  ['Bb', 'Am', 'Gm', 'C'],
  ['F', 'Am', 'Bb', 'C'],
  ['Dm', 'Gm', 'C', 'F'],
];
const PENTA = [72, 74, 77, 79, 81, 84, 86];
const ALBERTI = [0, 2, 1, 2, 3, 2, 1, 2];
const BEAT = 60 / 76;

export class Sound {
  ctx: AudioContext | null = null;
  muted = false;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private rev!: GainNode;
  private noise!: AudioBuffer;
  private step = 0;
  private bar = 0;
  private next = 0;
  private prog = PROGS[0];
  private mode = 0;
  private mel = 3;
  private timer = 0;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(c.destination);

    const warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 3000;
    this.music = c.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(warm);
    warm.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);

    // 가벼운 공간감: 피드백 딜레이 두 줄
    this.rev = c.createGain();
    for (const [time, fb] of [
      [0.13, 0.42],
      [0.23, 0.36],
    ]) {
      const d = c.createDelay(1);
      d.delayTime.value = time;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2000;
      const g = c.createGain();
      g.gain.value = fb;
      this.rev.connect(d);
      d.connect(lp);
      lp.connect(g);
      g.connect(d);
      const out = c.createGain();
      out.gain.value = 0.5;
      lp.connect(out);
      out.connect(this.master);
    }

    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.next = c.currentTime + 0.15;
    this.timer = window.setInterval(() => this.tick(), 60);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  destroy() {
    clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  private tone(
    freq: number,
    t: number,
    dur: number,
    g: number,
    type: OscillatorType = 'sine',
    bus: GainNode = this.music,
    rev = 0.3,
    att = 0.006,
  ) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + att);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    e.connect(bus);
    if (rev) {
      const s = c.createGain();
      s.gain.value = rev;
      e.connect(s);
      s.connect(this.rev);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private hit(t: number, dur: number, g: number, freq: number, type: BiquadFilterType = 'bandpass', bus = this.music) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(e);
    e.connect(bus);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /** 펠트 피아노 느낌 음 */
  private keys(m: number, t: number, g: number, dur = 1.3) {
    const f = mtof(m);
    this.tone(f, t, dur, g);
    this.tone(f * 2, t, dur * 0.55, g * 0.2);
    this.tone(f * 3, t, dur * 0.3, g * 0.05);
  }

  private tick() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.next < c.currentTime - 0.5) this.next = c.currentTime + 0.1;
    while (this.next < c.currentTime + 0.18) {
      this.schedule(this.step, this.next);
      this.next += this.step % 2 === 0 ? BEAT * 0.62 : BEAT * 0.38;
      this.step = (this.step + 1) % 8;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 4 === 0) this.prog = PROGS[Math.floor(Math.random() * PROGS.length)];
      }
    }
  }

  private schedule(s: number, t: number) {
    const ch = CH[this.prog[this.bar % 4]];
    const nextCh = CH[this.prog[(this.bar + 1) % 4]];
    if (s === 0) {
      const r = Math.random();
      this.mode = r < 0.4 ? 0 : r < 0.85 ? 1 : 2;
      ch.v.forEach((m, i) => this.tone(mtof(m), t + i * 0.018, 2.4, 0.045, 'triangle', this.music, 0.35, 0.02));
      this.bass(ch.bass, t, 1.0);
    }
    if (s === 4) {
      this.bass(ch.bass + (Math.random() < 0.6 ? 7 : 12), t, 0.8);
      if (Math.random() < 0.5)
        ch.v.slice(2).forEach((m) => this.tone(mtof(m), t, 1.2, 0.03, 'triangle', this.music, 0.35, 0.02));
    }
    if (s === 7 && Math.random() < 0.4) this.bass(nextCh.bass + 1, t, 0.3);

    // 브러시 드럼
    this.hit(t, 0.06, 0.012, 5000);
    if (s === 2 || s === 6) this.hit(t, 0.22, 0.03, 3200);

    // 멜로디: 알베르티 아르페지오(클래식) / 펜타토닉 산책(재즈) / 쉬어가기
    if (this.mode === 0) {
      this.keys(ch.v[ALBERTI[s] % ch.v.length] + 12, t, 0.05, 0.9);
    } else if (this.mode === 1 && Math.random() < 0.48) {
      this.mel = Math.max(0, Math.min(PENTA.length - 1, this.mel + Math.floor(Math.random() * 5) - 2));
      this.keys(PENTA[this.mel], t, 0.07, 1.5);
    }
  }

  private bass(m: number, t: number, dur: number) {
    this.tone(mtof(m), t, dur, 0.22, 'sine', this.music, 0.05, 0.015);
    this.tone(mtof(m) * 2, t, dur * 0.5, 0.04, 'triangle', this.music, 0, 0.015);
  }

  // ---------- 효과음 ----------
  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** 소형견 짖음: 톱니파 2개(살짝 어긋난 음정) + 왜곡 + 포먼트 필터 2개 + 숨소리 */
  bark(p = 1) {
    const c = this.ctx;
    if (!c) return;
    const t = this.now();
    const dur = 0.17;
    const mix = c.createGain();
    for (const det of [1, 1.017]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(360 * p * det, t);
      o.frequency.exponentialRampToValueAtTime(820 * p * det, t + 0.028);
      o.frequency.exponentialRampToValueAtTime(560 * p * det, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(260 * p * det, t + dur);
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    const shape = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shape.curve = curve;
    mix.connect(shape);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.5, t + 0.007);
    e.gain.setValueAtTime(0.5, t + 0.06);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [freq, q, g] of [
      [1050, 3.5, 1],
      [2500, 5, 0.6],
      [3600, 6, 0.25],
    ]) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq * 0.8, t);
      f.frequency.linearRampToValueAtTime(freq * 1.15, t + 0.04);
      f.frequency.linearRampToValueAtTime(freq * 0.85, t + dur);
      f.Q.value = q;
      const fg = c.createGain();
      fg.gain.value = g;
      shape.connect(f);
      f.connect(fg);
      fg.connect(e);
    }
    e.connect(this.sfx);
    const s = c.createGain();
    s.gain.value = 0.25;
    e.connect(s);
    s.connect(this.rev);
    this.hit(t, 0.09, 0.16, 1900, 'bandpass', this.sfx);
  }

  /** 쓰다듬을 때 올라가는 실로폰 음 */
  note(i: number) {
    if (!this.ctx) return;
    const t = this.now();
    const f = mtof(PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length));
    this.tone(f, t, 0.5, 0.12, 'sine', this.sfx, 0.4, 0.004);
    this.tone(f * 4, t, 0.12, 0.03, 'sine', this.sfx, 0, 0.004);
  }

  pop() {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.tone(320, t, 0.14, 0.25, 'sine', this.sfx, 0.1);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  }

  boing() {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.tone(220, t, 0.22, 0.14, 'sine', this.sfx, 0.2);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.2);
  }

  munch() {
    if (!this.ctx) return;
    this.hit(this.now(), 0.07, 0.2, 700, 'lowpass', this.sfx);
  }

  whoosh() {
    if (!this.ctx) return;
    this.hit(this.now(), 0.3, 0.08, 1400, 'bandpass', this.sfx);
  }

  growl() {
    const c = this.ctx;
    if (!c) return;
    const t = this.now();
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(75, t + 0.6);
    const lfo = c.createOscillator();
    lfo.frequency.value = 26;
    const lg = c.createGain();
    lg.gain.value = 0.08;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    lfo.connect(lg);
    lg.connect(e.gain);
    o.connect(f);
    f.connect(e);
    e.connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.75);
    lfo.stop(t + 0.75);
  }

  dingdong() {
    if (!this.ctx) return;
    const t = this.now();
    for (const [m, dt] of [
      [76, 0],
      [72, 0.32],
    ]) {
      this.tone(mtof(m), t + dt, 1.1, 0.16, 'sine', this.sfx, 0.5);
      this.tone(mtof(m) * 2.76, t + dt, 0.5, 0.03, 'sine', this.sfx, 0.3);
    }
  }

  jingle() {
    if (!this.ctx) return;
    const t = this.now();
    [77, 81, 84, 89].forEach((m, i) => this.tone(mtof(m), t + i * 0.08, 0.5, 0.11, 'sine', this.sfx, 0.5));
  }
}

export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 미지원 기기 */
  }
}
