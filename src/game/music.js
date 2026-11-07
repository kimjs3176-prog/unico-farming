/**
 * 절차적 배경음악 + 환경음
 * - 음악: C장조 오음계, 코드 진행 I–vi–IV–V(낮) / vi–IV–I–V(밤, 느리게), 칼림바 멜로디 + 패드 + 베이스 + 셰이커
 * - 환경음: 낮 새소리, 밤 귀뚜라미, 비(필터 노이즈), 바람
 * 스케줄러: 25ms 마다 0.25초 앞까지 예약 (탭 전환·프레임 드랍에도 박자 유지)
 */
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Dm: [50, 53, 57], Em: [52, 55, 59] };
const DAY = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'];
const NIGHT = ['Am', 'F', 'C', 'G', 'Dm', 'F', 'C', 'G'];
const PENTA = [0, 2, 4, 7, 9]; // C D E G A

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.on = false;
    this.step = 0;
    this.nextTime = 0;
    this.mood = 'day';
    this.scene = { daylight: 1, kind: 'clear', precip: 0, wind: 0.15 };
    this.melodyNote = 76;
    this.nextBird = 2;
    this.nextCricket = 1;
  }

  start() {
    const c = this.audio._ctx();
    if (!c || this.on) return;
    this.on = true;
    this.nextTime = c.currentTime + 0.3;
    // 비·바람 루프 (게인으로 세기 조절)
    const loop = (type, freq, q) => {
      const s = c.createBufferSource(); s.buffer = this.audio.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(this.audio.amb); s.start();
      return g;
    };
    this.rainGain = loop('bandpass', 1800, 0.6);
    this.windGain = loop('lowpass', 380, 0.7);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** 화면을 벗어날 때: 25ms 예약 타이머 멈춤 */
  pause() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** 돌아올 때: 밀린 박자를 한꺼번에 몰아 치지 않도록 지금 시각부터 이어서 */
  resume() {
    if (!this.on || this.timer) return;
    const c = this.audio.ctx;
    if (c) this.nextTime = Math.max(this.nextTime, c.currentTime + 0.05);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setScene(s) { this.scene = s; this.mood = s.daylight < 0.35 ? 'night' : 'day'; }

  schedule() {
    const a = this.audio, c = a.ctx;
    if (!c || !a.enabled || c.state !== 'running') return; // 멈춘 동안은 헛돌지 않음
    const night = this.mood === 'night';
    const bpm = night ? 66 : 84, eighth = 60 / bpm / 2;
    while (this.nextTime < c.currentTime + 0.25) {
      const at = this.nextTime - c.currentTime;
      if (a.musicOn) this.playStep(this.step, at, night, eighth);
      this.nextTime += eighth;
      this.step++;
    }
    // 환경음
    const t = c.currentTime, S = this.scene;
    this.rainGain.gain.setTargetAtTime(['rain', 'storm'].includes(S.kind) ? 0.05 + S.precip * 0.22 : 0, t, 1.5);
    this.windGain.gain.setTargetAtTime(0.01 + S.wind * 0.12, t, 2);
    if (!night && !['rain', 'storm', 'snow'].includes(S.kind) && t > this.nextBird) { this.bird(); this.nextBird = t + 2 + Math.random() * 5; }
    if (night && S.kind !== 'snow' && t > this.nextCricket) { this.crickets(); this.nextCricket = t + 0.6 + Math.random() * 1.2; }
  }

  playStep(step, at, night, eighth) {
    const a = this.audio, out = a.music;
    const prog = night ? NIGHT : DAY;
    const bar = Math.floor(step / 8) % prog.length, beat = step % 8;
    const chord = CHORDS[prog[bar]];
    // 패드: 마디 시작에 코드 (부드러운 어택, 길게)
    if (beat === 0) for (const n of chord) a.tone(NOTE(n), eighth * 8.5, 'triangle', night ? 0.028 : 0.034, 0, { at, rev: 0.6, lp: 1300, out });
    // 베이스: 1·5 박
    if (beat === 0 || beat === 4) a.tone(NOTE(chord[0] - 12), eighth * 3.5, 'sine', 0.07, 0, { at, rev: 0.1, lp: 500, out });
    // 셰이커 (낮만): 엇박
    if (!night && beat % 2 === 1) a.noise(0.05, beat === 3 || beat === 7 ? 0.018 : 0.011, { type: 'highpass', freq: 6500, q: 0.3, at, out });
    // 칼림바 멜로디: 코드음 위주 오음계 랜덤 워크, 쉼표 많게
    const restP = night ? 0.6 : 0.42;
    if (Math.random() > restP) {
      const cands = [];
      for (let o = 72; o <= 88; o++) if (PENTA.includes(o % 12)) cands.push(o);
      const near = cands.filter((n) => Math.abs(n - this.melodyNote) <= 4);
      let n = near[Math.floor(Math.random() * near.length)] ?? 76;
      if (beat === 0 && Math.random() < 0.6) n = chord[Math.floor(Math.random() * 3)] + 12 * (chord[0] < 60 ? 2 : 1);
      this.melodyNote = n;
      a.pluck(NOTE(night ? n - 12 : n), night ? 0.05 : 0.065, at, out, night ? 1.4 : 1.0);
    }
  }

  /** 새소리: 빠르게 오르내리는 짧은 처프 2~4회, 좌우 위치 무작위 */
  bird() {
    const a = this.audio, c = a.ctx;
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1; pan.connect(a.amb);
    const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * (0.09 + Math.random() * 0.05);
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.04);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.1);
    }
  }

  /** 귀뚜라미: 4.5kHz 펄스 묶음 */
  crickets() {
    const a = this.audio, c = a.ctx;
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1; pan.connect(a.amb);
    for (let i = 0; i < 4; i++) {
      const t = c.currentTime + i * 0.045;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 4300 + Math.random() * 400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.04);
    }
  }
}
