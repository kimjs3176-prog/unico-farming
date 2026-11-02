/**
 * 사운드 (외부 파일 없이 WebAudio 합성)
 * 믹서: 마스터 ← 효과음 / 음악 / 환경음, 공용 잔향(컨볼버) 센드
 * 효과음은 부드러운 어택·릴리즈와 저역통과로 '삑' 소리 대신 나무·물방울 같은 질감
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = { master: 0.9, sfx: 0.8, music: 0.5, amb: 0.6 };
  }

  _ctx() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; return null; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.volume.master;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.volume.sfx; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = this.volume.music; this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = this.volume.amb; this.amb.connect(this.master);
      // 잔향: 지수 감쇠 노이즈 임펄스
      this.reverb = c.createConvolver();
      const len = c.sampleRate * 2.4, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.reverb.buffer = ir;
      this.revOut = c.createGain(); this.revOut.gain.value = 0.32;
      this.reverb.connect(this.revOut).connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.onReady?.();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** 소리 켜짐/음악 끔/모두 끔 순환 */
  cycle() {
    if (this.enabled && this.musicOn) this.musicOn = false;
    else if (this.enabled) this.enabled = false;
    else { this.enabled = true; this.musicOn = true; }
    this.apply();
    return this.enabled ? (this.musicOn ? 'all' : 'sfx') : 'off';
  }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.volume.master : 0, t, 0.1);
    this.music.gain.setTargetAtTime(this.musicOn ? this.volume.music : 0, t, 0.3);
  }

  /** 부드러운 톤: 어택 5ms, 지수 릴리즈, 저역통과, 잔향 센드 */
  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, { at = 0, rev = 0.25, lp = 6000, out } = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g);
    g.connect(out || this.sfx);
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** 짧은 노이즈 (흙·물 질감) */
  noise(dur = 0.15, vol = 0.1, { type = 'bandpass', freq = 1200, q = 1, at = 0, out } = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  /** 칼림바/마림바 같은 맑은 음 (음악·효과음 공용) */
  pluck(freq, vol = 0.12, at = 0, out, dur = 0.9) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 4.01; // 금속성 배음
    g2.gain.setValueAtTime(vol * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(out || this.sfx);
    const s = c.createGain(); s.gain.value = 0.35; g.connect(s).connect(this.reverb);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + 0.2);
  }

  play(name, vol = 1) {
    const v = 0.16 * vol;
    switch (name) {
      case 'click': return this.pluck(1568, v * 0.45, 0, undefined, 0.18);
      case 'dig': this.noise(0.18, v * 1.2, { freq: 420, q: 0.8 }); return this.tone(110, 0.16, 'triangle', v * 0.8, -40, { lp: 900, rev: 0.1 });
      case 'plant': this.noise(0.08, v * 0.5, { freq: 900 }); return this.pluck(784, v * 0.7, 0.05);
      case 'water': this.noise(0.35, v * 0.7, { type: 'highpass', freq: 2200, q: 0.4 }); this.pluck(1175, v * 0.4, 0.05, undefined, 0.3); return this.pluck(1568, v * 0.35, 0.14, undefined, 0.3);
      case 'harvest': this.pluck(784, v, 0); this.pluck(988, v, 0.08); return this.pluck(1319, v, 0.16);
      case 'coin': this.pluck(1976, v * 0.7, 0, undefined, 0.35); return this.pluck(2637, v * 0.6, 0.07, undefined, 0.45);
      case 'win': return [523, 659, 784, 1046, 1319].forEach((f, i) => this.pluck(f, v, i * 0.09, undefined, 1.2));
      case 'bump': this.noise(0.22, v * 1.3, { type: 'lowpass', freq: 300 }); return this.tone(70, 0.25, 'sine', v, -25, { rev: 0.05 });
      case 'engine': return this.tone(65, 0.7, 'sawtooth', v * 0.45, 30, { lp: 400, rev: 0.05 });
      case 'thunder': this.noise(2.2, v * 2.2, { type: 'lowpass', freq: 180, q: 0.5 }); return this.noise(1.2, v * 1.4, { type: 'lowpass', freq: 600, q: 0.5, at: 0.1 });
      case 'levelup': return [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => this.pluck(f, v * 1.1, i * 0.07, undefined, 1.4));
      case 'pop': return this.pluck(1319, v * 0.6, 0, undefined, 0.25);
      case 'caw': this.tone(620, 0.16, 'sawtooth', v * 0.12, -260, { lp: 1800, rev: 0.2 }); return this.tone(560, 0.18, 'sawtooth', v * 0.1, -240, { lp: 1600, at: 0.22, rev: 0.2 });
      case 'howl': return this.tone(330, 1.6, 'sine', v * 0.18, 140, { lp: 1200, rev: 0.5 });
      case 'shoo': this.noise(0.25, v * 0.9, { type: 'bandpass', freq: 1800, q: 0.7 }); this.tone(180, 0.12, 'triangle', v * 0.4, -60, { rev: 0.05 }); return this.tone(170, 0.12, 'triangle', v * 0.4, -60, { at: 0.18, rev: 0.05 });
      case 'bark': this.tone(520, 0.09, 'square', v * 0.12, -200, { lp: 1500, rev: 0.1 }); return this.tone(480, 0.1, 'square', v * 0.1, -180, { lp: 1400, at: 0.16, rev: 0.1 });
    }
  }
}
