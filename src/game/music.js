/**
 * 절차적 배경음악 + 환경음
 * - 예전 음악(도트 판·테마를 켜지 않으면): C장조 오음계 랜덤 워크, I–vi–IV–V(낮) / vi–IV–I–V(밤)
 * - 테마 음악(3D 판: attach(game, { themes: true })): music_themes.js 의 16마디 가락을 두 번 돌고 바깥에서는 15~40초 쉼,
 *   상태(미니게임 > 집 안 > 밤 > 낮)·계절·비·축제에 따라 마디 첫 박에서만 바꿈
 * - 환경음: 낮 새소리, 밤 귀뚜라미, 비(필터 노이즈), 바람 (+ 붙은 ambience.js: 물가·개구리·매미·지붕 빗소리)
 * 스케줄러: 25ms 마다 0.25초 앞까지 예약 (탭 전환·프레임 드랍에도 박자 유지)
 */
import { THEMES, THEME_LEVEL, pickCue, nextNight, variantFor, compileTheme } from './music_themes.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Dm: [50, 53, 57], Em: [52, 55, 59] };
const DAY = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'];
const NIGHT = ['Am', 'F', 'C', 'G', 'Dm', 'F', 'C', 'G'];
const PENTA = [0, 2, 4, 7, 9]; // C D E G A
/** 음악 층별 크기 (scripts/audio-levels.mjs: 낮 음악 가장 큰 구간 ≈ -27dB, 평균 ≈ -33dB) */
export const MUSIC_LEVEL = { pad: 1, bass: 0.5, shaker: 1.2, melody: 0.8 };
/** 비 소리 크기: 효과음(1~2kHz)을 덮지 않게 0.02 + 강수 × 0.07 (최대 0.09) */
export const rainGainFor = (kind, precip) => (kind === 'rain' || kind === 'storm' ? 0.02 + Math.max(0, Math.min(1, precip)) * 0.07 : 0);

/** 꼬리(패드만 4마디) 뒤 쉬는 시간 (초) */
export const REST_MIN = 15, REST_MAX = 40, TAIL_BARS = 4, PASSES = 2;

export class Music {
  /** opts.themes: 테마 음악 (3D 판). 없으면 예전 그대로 (도트 판) */
  constructor(audio, opts = {}) {
    this.audio = audio;
    this.themed = !!opts.themes;
    this.cue = null; this.phase = 'play'; this.bar = 0; this.pass = 0; this.e8 = 0; this.tailN = 0; this.restUntil = 0;
    this.nightOn = false; this.var = null; this.game = null; this.ambience = null;
    this._comp = {};
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

  /** 지금 날씨의 비 소리 크기 */
  rainLevel() { return rainGainFor(this.scene.kind, this.scene.precip); }

  /**
   * 3D 판: 게임을 붙여 상태(미니게임·집 안·계절·축제)를 직접 읽음 (main.js 는 그대로 setScene 만 부름)
   * @param o.themes 테마 음악 켜기 · o.ambience 장소 환경음 (ambience.js)
   */
  attach(game, o = {}) {
    this.game = game;
    if (o.themes) this.themed = true;
    if (o.ambience) this.ambience = o.ambience;
    return this;
  }

  setScene(s) {
    this.scene = s;
    if (this.themed) { this.nightOn = nextNight(this.nightOn, s.daylight); this.mood = this.nightOn ? 'night' : 'day'; }
    else this.mood = s.daylight < 0.35 ? 'night' : 'day';
    // 장소 환경음: 화면 갱신 때 (초당 4번까지는 ambience 가 거름)
    const amb = this.ambience, c = this.audio.ctx;
    if (amb && this.game && c) {
      const st = amb.stateOf(this.game, s);
      st.night = this.mood === 'night'; st.rainLevel = this.rainLevel();
      this.env = st;
      amb.update(c.currentTime, st);
    }
  }

  /** 지금 상태 (붙은 게임에서 읽음, 없으면 날씨만) */
  state() {
    const g = this.game, S = this.scene;
    const rain = S.kind === 'rain' || S.kind === 'storm';
    if (!g) return { minigame: false, inside: false, night: this.mood === 'night', rain };
    let mg = !!(g.rice?.threshing || g.herding?.active || g.smartfarm?.active || g.nature?.fishing?.phase === 'fight'
      || (g.ride?.driving && g.ride?.plowDown && g.ride?.current?.plow));
    // 체험관·달걀 받기 미니게임 창 (마디마다 한 번만 찾음)
    if (!mg && typeof document !== 'undefined') { try { mg = !!document.querySelector('.mg-wrap, .mg-count'); } catch { /* 화면 없음 */ } }
    return { minigame: mg, inside: !!g.home?.inside, night: this.mood === 'night', rain, season: g.season?.cur?.id, festival: !!g.economy?.festival };
  }

  /** 지금 테마의 8분음 길이 (초) */
  eighth() {
    if (!this.themed) return 60 / (this.mood === 'night' ? 66 : 84) / 2;
    return 60 / (this.var?.bpm || 84) / 2;
  }

  schedule() {
    const a = this.audio, c = a.ctx;
    if (!c || !a.enabled || c.state !== 'running') return; // 멈춘 동안은 헛돌지 않음
    const night = this.mood === 'night';
    // 타이머가 늦게 불렸으면(배경 탭 등) 지난 박자는 건너뜀 → 밀린 음을 한꺼번에 몰아 내지 않게
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      const at = this.nextTime - c.currentTime;
      let eighth;
      if (this.themed) { this.tick(at, this.nextTime); eighth = this.eighth(); }
      else { eighth = 60 / (night ? 66 : 84) / 2; if (a.musicOn) this.playStep(this.step, at, night, eighth); }
      this.nextTime += eighth;
      this.step++;
    }
    // 환경음 (붙은 게임이 있으면 계절·집 안에 따라)
    const t = c.currentTime, S = this.scene, E = this.env;
    const winter = E?.season === 'winter';
    this.rainGain.gain.setTargetAtTime(this.rainLevel(), t, 1.5);
    this.windGain.gain.setTargetAtTime(0.01 + S.wind * 0.12 + (winter ? 0.03 : 0), t, 2);
    if (!night && !['rain', 'storm', 'snow'].includes(S.kind) && t > this.nextBird) {
      if (!E?.inside) this.bird();
      this.nextBird = t + (2 + Math.random() * 5) * (winter ? 3 : 1); // 겨울은 새가 1/3
    }
    if (night && S.kind !== 'snow' && !winter && t > this.nextCricket) { this.crickets(); this.nextCricket = t + 0.6 + Math.random() * 1.2; }
  }

  // ------------------------------------------------------------ 테마 음악
  _compiled(cue) { return (this._comp[cue] ||= compileTheme(THEMES[cue])); }

  /** 8분음 한 칸: 마디 첫 칸이면 다음 마디를 정하고, 쉬는 중이 아니면 연주 */
  tick(at, when = 0) {
    if (this.e8 === 0) this.barStart(when);
    if (this.audio.musicOn !== false && this.phase !== 'rest') this.playThemed(at);
    this.e8 = (this.e8 + 1) % 8;
  }

  /**
   * 마디 경계에서만: 지난 마디를 넘기고(두 번 돌면 꼬리 → 쉼), 상태가 바뀌었으면 테마를 바꿈
   * @param when 이 마디가 시작하는 소리 장치 시각
   */
  barStart(when = 0, st = this.state()) {
    const started = this.cue != null;
    if (started) {
      if (this.phase === 'play') {
        if (++this.bar >= 16) { this.bar = 0; this.pass++; if (this.pass >= PASSES && THEMES[this.cue].rest) { this.phase = 'tail'; this.tailN = TAIL_BARS; } }
      } else if (this.phase === 'tail') {
        if (--this.tailN <= 0) { this.phase = 'rest'; this.restUntil = when + REST_MIN + Math.random() * (REST_MAX - REST_MIN); }
      } else if (this.phase === 'rest' && when >= this.restUntil) { this.phase = 'play'; this.bar = 0; this.pass = 0; }
    }
    const want = pickCue(st);
    if (want !== this.cue) {
      const outdoor = THEMES[want].rest;
      // 바깥 테마끼리(낮 ↔ 밤)는 꼬리·쉼을 이어 감, 집 안·미니게임은 바로 첫 마디부터
      if (!(started && outdoor && THEMES[this.cue]?.rest && this.phase !== 'play')) { this.phase = 'play'; this.bar = 0; this.pass = 0; }
      this.cue = want;
    }
    if (!THEMES[this.cue].rest && this.phase !== 'play') { this.phase = 'play'; this.bar = 0; this.pass = 0; }
    this.var = variantFor(this.cue, st);
  }

  /** 테마 한 칸 연주 (패드·베이스·타악기·가락·꾸밈음) */
  playThemed(at) {
    const a = this.audio, out = a.music, T = THEMES[this.cue], V = this.var, L = THEME_LEVEL[this.cue], e = this.e8;
    const eighth = this.eighth(), comp = this._compiled(this.cue);
    const tail = this.phase === 'tail';
    const B = comp.bars[tail ? 12 + (TAIL_BARS - this.tailN) % 4 : this.bar], chord = B.chord;
    // 패드: 마디 첫 칸 (꼬리에서는 점점 작게)
    const fade = tail ? this.tailN / (TAIL_BARS + 1) : 1;
    if (e === 0) for (const n of chord) a.tone(NOTE(n), eighth * 8.5, 'triangle', L.pad * fade, 0, { at, rev: 0.6, lp: V.padLp, out });
    if (tail) return;
    // 베이스
    const root = chord[0] - 12, fifth = root + 7;
    const bass = (n, len, k = 1) => a.tone(NOTE(n), eighth * len, 'sine', L.bass * k, 0, { at, rev: 0.1, lp: 500, out });
    if (T.bass === 'walk') { if (e === 0) bass(root, 3.5); else if (e === 4) bass(fifth - 12 >= 36 ? fifth - 12 : fifth, 3.5, 0.85); }
    else if (T.bass === 'long') { if (e === 0) bass(root, 7.5); }
    else if (T.bass === 'soft') { if (e === 0) bass(root, 3.5, 0.9); else if (e === 4) bass(root + 12 <= 55 ? root + 12 : root, 3, 0.6); }
    else if (T.bass === 'bounce') { if (e === 0 || e === 3) bass(root, 1.6); else if (e === 4) bass(fifth - 12 >= 36 ? fifth - 12 : fifth, 1.6); else if (e === 6) bass(root + 12, 1.2, 0.7); }
    // 타악기
    if (V.shaker && e % 2 === 1) a.noise(0.05, (e === 3 || e === 7 ? 0.018 : 0.011) * L.perc, { type: 'highpass', freq: 6500, q: 0.3, at, out });
    if (V.handDrum && (e === 0 || e === 3 || e === 6)) this.handDrum(at, e === 0 ? 1 : 0.7);
    if (V.drums) this.drums(e, at, L.perc);
    // 가락 (비: 엇박에 짧은 음은 빼서 절반쯤)
    const nt = B.notes[e];
    if (nt && !(V.rain && e % 2 === 1 && nt.len < 2)) {
      const m = nt.midi + V.oct;
      this.inst(V.patch, m, L.mel, at, nt.len * eighth);
      if (V.glock) this.inst('glock', m + 12, L.mel * 0.35, at, nt.len * eighth);
      this.melodyNote = m;
    } else if (B.orn.includes(e) && !V.rain && Math.random() < 0.5) {
      // 꾸밈음: 화음 음 근처로 한 칸 (긴 쉼·긴 음 가운데서만, 작게)
      const cands = [];
      for (const n of chord) for (const o of [12, 24]) { const m = n + o + V.oct; if (Math.abs(m - (this.melodyNote || m)) <= 5) cands.push(m); }
      if (cands.length) this.inst(V.patch, cands[Math.floor(Math.random() * cands.length)], L.mel * 0.5, at, eighth);
    }
  }

  /** 가락 악기 */
  inst(patch, midi, v, at, dur) {
    const a = this.audio, out = a.music, f = NOTE(midi);
    switch (patch) {
      // 마림바: 살짝 어긋난 사인 두 개, 짧게 사라짐
      case 'marimba': a.tone(f, 0.5, 'sine', v * 0.75, 0, { at, rev: 0.25, lp: 4000, out }); a.tone(f * 1.006, 0.35, 'sine', v * 0.5, 0, { at, rev: 0.2, lp: 4000, out }); return a.tone(f * 4, 0.05, 'sine', v * 0.12, 0, { at, rev: 0, out });
      // 플루트: 삼각파를 어둡게, 천천히 올라옴
      case 'flute': return a.tone(f, Math.max(0.3, dur * 0.95), 'triangle', v * 1.1, 0, { at, rev: 0.45, lp: 1700, out, atk: 0.06 });
      // 종: 사인 + 3.5배 배음
      case 'bell': a.tone(f, 1.6, 'sine', v * 0.9, 0, { at, rev: 0.5, lp: 5000, out }); return a.tone(f * 3.5, 0.45, 'sine', v * 0.16, 0, { at, rev: 0.3, out });
      // 오르골: 맑은 칼림바를 짧게
      case 'musicbox': return a.pluck(f, v, at, out, 0.75);
      // 실로폰 겹침 (축제)
      case 'glock': a.tone(f, 0.5, 'sine', v, 0, { at, rev: 0.35, out }); return a.tone(f * 2.76, 0.15, 'sine', v * 0.2, 0, { at, rev: 0.2, out });
      // 미니게임: 칼림바 + 살짝 사각파
      case 'lead': a.pluck(f, v, at, out, 0.35); return a.tone(f, Math.min(0.2, dur), 'square', v * 0.09, 0, { at, rev: 0.1, lp: 2200, out });
      default: return a.pluck(f, v, at, out, 1.0); // 칼림바
    }
  }

  /** 손북: 낮은 사인 '둥' + 짧은 탁 */
  handDrum(at, k = 1) {
    const a = this.audio, out = a.music;
    a.tone(170, 0.16, 'sine', 0.05 * k, -60, { at, rev: 0.1, lp: 800, out });
    a.noise(0.03, 0.012 * k, { freq: 1200, q: 1, at, out });
  }

  /** 미니게임 북: 1·3박 쿵, 2·4박 탁, 8분음 칙 */
  drums(e, at, k = 1) {
    const a = this.audio, out = a.music;
    if (e === 0 || e === 4 || (e === 7 && this.bar % 4 === 3)) a.tone(120, 0.16, 'sine', 0.09 * k, -75, { at, rev: 0, lp: 600, out });
    if (e === 2 || e === 6) { a.noise(0.12, 0.03 * k, { type: 'bandpass', freq: 1900, q: 0.7, at, out }); a.tone(200, 0.06, 'triangle', 0.02 * k, -40, { at, rev: 0.05, out }); }
    a.noise(0.03, (e % 2 ? 0.012 : 0.007) * k, { type: 'highpass', freq: 7500, q: 0.4, at, out });
  }

  playStep(step, at, night, eighth) {
    const a = this.audio, out = a.music, L = MUSIC_LEVEL;
    const prog = night ? NIGHT : DAY;
    const bar = Math.floor(step / 8) % prog.length, beat = step % 8;
    const chord = CHORDS[prog[bar]];
    // 패드: 마디 시작에 코드 (부드러운 어택, 길게)
    if (beat === 0) for (const n of chord) a.tone(NOTE(n), eighth * 8.5, 'triangle', (night ? 0.028 : 0.034) * L.pad, 0, { at, rev: 0.6, lp: 1300, out });
    // 베이스: 1·5 박
    if (beat === 0 || beat === 4) a.tone(NOTE(chord[0] - 12), eighth * 3.5, 'sine', 0.07 * L.bass, 0, { at, rev: 0.1, lp: 500, out });
    // 셰이커 (낮만): 엇박
    if (!night && beat % 2 === 1) a.noise(0.05, (beat === 3 || beat === 7 ? 0.018 : 0.011) * L.shaker, { type: 'highpass', freq: 6500, q: 0.3, at, out });
    // 칼림바 멜로디: 코드음 위주 오음계 랜덤 워크, 쉼표 많게
    const restP = night ? 0.6 : 0.42;
    if (Math.random() > restP) {
      const cands = [];
      for (let o = 72; o <= 88; o++) if (PENTA.includes(o % 12)) cands.push(o);
      const near = cands.filter((n) => Math.abs(n - this.melodyNote) <= 4);
      let n = near[Math.floor(Math.random() * near.length)] ?? 76;
      if (beat === 0 && Math.random() < 0.6) n = chord[Math.floor(Math.random() * 3)] + 12 * (chord[0] < 60 ? 2 : 1);
      this.melodyNote = n;
      a.pluck(NOTE(night ? n - 12 : n), (night ? 0.05 : 0.065) * L.melody, at, out, night ? 1.4 : 1.0);
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
