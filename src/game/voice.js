/**
 * 주민 말소리 (대화 글자가 나올 때 재잘재잘). 외부 파일 없이 WebAudio 합성
 *  - 한글 음절을 초성·중성·종성으로 나눠: 중성(모음) → 울림 두 개(F1/F2), 초성 → 음 높이 한 칸 + 시작 소리(ㅅㅈㅊ 바람, ㄱㄷㅂ 톡), 받침 → 짧게
 *  - 같은 글자는 늘 같은 소리 (voiceParams 는 순수 함수, 떨림 ±4% 만 재생할 때 더함)
 *  - 한 번에 한 소리 (오디오 시계 기준 _voiceUntil): 화면이 끊겨 여러 글자가 한꺼번에 나와도 겹치지 않음
 *  - 출력은 audio.voiceBus ?? audio.sfx (소리 설정을 그대로 따름)
 * 이 파일은 다른 모듈을 불러오지 않음 (말소리 측정 페이지에서 바로 읽기)
 */

/** 초성 19개 → 반음 (-3~+3) */
export const CHO_STEP = [0, 1, -1, 2, 3, -2, -3, 1, 2, 0, 1, -1, 2, 3, 1, 3, 2, 0, -2];
/** 모음 울림 (Hz): 아·에·어·오·우·으·이 */
export const VOWELS = { a: [800, 1300], e: [500, 1900], eo: [600, 1000], o: [450, 800], u: [350, 800], eu: [350, 1500], i: [300, 2300] };
/** 중성 21개 → 모음 갈래 (ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ) */
export const JUNG_VOWEL = ['a', 'e', 'a', 'e', 'eo', 'e', 'eo', 'e', 'o', 'a', 'e', 'e', 'o', 'u', 'eo', 'e', 'i', 'u', 'eu', 'i', 'i'];
const VOWEL_KEYS = Object.keys(VOWELS);
const NOISY = new Set([9, 10, 12, 13, 14]); // ㅅㅆㅈㅉㅊ: 짧은 바람 소리
const PLOSIVE = new Set([0, 1, 3, 4, 7, 8, 15, 16, 17]); // ㄱㄲㄷㄸㅂㅃㅋㅌㅍ: 톡 하는 시작
const PAUSE = { '…': 0.16, ',': 0.1, '.': 0.12, '~': 0.06 };

/** 소리 크기 (선형). 시작 순간 최고 ≈ -24 dBFS (마스터·효과음 버스 지난 뒤) */
export const VOICE_PEAK = 0.09;

const st = (n) => Math.pow(2, n / 12);

/**
 * 한 글자의 말소리 값 (순수 함수)
 * @param profile species.js 의 voice (f0, fs, wave, lp, glide, endFall, sub, dur, bell)
 * @param ch 한 글자
 * @param o { last: 문장 마지막 음절, q: 물음표 문장, ex: 느낌표 문장 }
 * @returns null(소리 없음) | { pause } | { f0, f1, f2, dur, gain, glide, onset, wave, sub, lp, bell }
 */
export function voiceParams(profile, ch, { last = false, q = false, ex = false } = {}) {
  if (!profile || !ch) return null;
  if (PAUSE[ch]) return { pause: PAUSE[ch] };
  const code = ch.codePointAt(0);
  let step, vowel, onset = null, short = false;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const s = code - 0xac00, cho = (s / 588) | 0, jung = ((s % 588) / 28) | 0, jong = s % 28;
    step = CHO_STEP[cho];
    vowel = JUNG_VOWEL[jung];
    onset = NOISY.has(cho) ? 'noise' : PLOSIVE.has(cho) ? 'click' : null;
    short = jong !== 0;
  } else if (/[0-9A-Za-z]/.test(ch)) {
    step = (code % 7) - 3; // 숫자·영문: 글자 값으로 정한 한 칸
    vowel = VOWEL_KEYS[code % VOWEL_KEYS.length];
  } else return null; // 띄어쓰기·이모지·문장부호는 소리 없음
  if (last && q) step += 4; // 물음표: 끝 음절을 올림
  const fs = profile.fs ?? 1, [v1, v2] = VOWELS[vowel];
  let dur = profile.dur ?? 0.06;
  if (short) dur *= 0.7;
  dur = Math.min(0.07, Math.max(0.028, dur));
  const glide = last && profile.endFall ? profile.endFall : (profile.glide ?? 0);
  return {
    f0: Math.round(profile.f0 * st(step) * 10) / 10,
    f1: Math.round(v1 * fs), f2: Math.round(v2 * fs),
    dur, gain: (profile.gain ?? 1) * (ex ? 1.26 : 1), glide, onset,
    wave: profile.bell ? 'sine' : profile.wave || 'triangle', sub: !!profile.sub, lp: profile.lp || 0, bell: !!profile.bell,
  };
}

/** 문장 안 정보: 마지막 소리 나는 글자 위치, 물음표·느낌표 */
export function lineShape(chars) {
  let lastIdx = -1;
  for (let i = chars.length - 1; i >= 0; i--) if (/[가-힣0-9A-Za-z]/.test(chars[i])) { lastIdx = i; break; }
  const tail = chars.slice(lastIdx + 1).join('');
  return { lastIdx, q: tail.includes('?'), ex: chars.includes('!') };
}

const ctxOf = (audio) => {
  if (!audio || audio.enabled === false) return null;
  const c = audio.ctx || audio._ctx?.();
  return c && c.state !== 'closed' ? c : null;
};
const outOf = (audio) => audio.voiceBus || audio.sfx;

/**
 * 한 글자 소리 내기. 앞 글자 소리가 아직 나는 중이면 그 뒤에 이어 붙임 (80ms 넘게 밀리면 건너뜀)
 * @returns voiceParams 결과 (소리를 냈든 안 냈든)
 */
export function voice(audio, profile, ch, opts = {}) {
  const p = voiceParams(profile, ch, opts);
  if (!p || p.pause) return p;
  const c = ctxOf(audio), out = c && outOf(audio);
  if (!c || !out) return p;
  const now = c.currentTime, t = Math.max(now, audio._voiceUntil || 0);
  if (t - now > 0.08) return p; // 밀린 소리는 버림 (겹치지 않게)
  const j = 1 + (Math.random() - 0.5) * 0.08; // ±4%
  const f0 = p.f0 * j, dur = p.dur * (1 + (Math.random() - 0.5) * 0.08), peak = VOICE_PEAK * p.gain;
  audio._voiceUntil = t + dur * 0.92;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  env.gain.setValueAtTime(peak, t + dur * 0.45);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let tail = env;
  if (p.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; env.connect(f); tail = f; }
  tail.connect(out);
  const oscs = [];
  const osc = (type, freq, to) => {
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.linearRampToValueAtTime(Math.max(40, to), t + dur);
    oscs.push(o);
    return o;
  };
  if (p.bell) { // 유니코: 맑은 종 (기본음 + 금속성 배음)
    const o = osc('sine', f0), o2 = osc('sine', f0 * 2.76), g2 = c.createGain();
    g2.gain.value = 0.22;
    o.connect(env); o2.connect(g2).connect(env);
  } else {
    const o = osc(p.wave, f0, p.glide ? f0 + p.glide : 0);
    // 모음 울림 두 개(병렬 띠통과) + 음 높이가 들리게 약한 원음
    for (const [fr, g] of [[p.f1, 1.6], [p.f2, 1.1]]) {
      const bp = c.createBiquadFilter(), gg = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 6; gg.gain.value = g;
      o.connect(bp).connect(gg).connect(env);
    }
    const dry = c.createGain(); dry.gain.value = p.wave === 'triangle' ? 0.45 : 0.22;
    o.connect(dry).connect(env);
    if (p.sub) { const s = osc('sine', f0 / 2, p.glide ? (f0 + p.glide) / 2 : 0), sg = c.createGain(); sg.gain.value = 0.55; s.connect(sg).connect(env); }
  }
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.02); }
  if (p.onset && audio.noiseBuf) { // 시작 소리: ㅅㅈㅊ 바람 10ms, ㄱㄷㅂ 톡 5ms
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), d = p.onset === 'noise' ? 0.01 : 0.005;
    n.buffer = audio.noiseBuf;
    f.type = p.onset === 'noise' ? 'bandpass' : 'highpass'; f.frequency.value = p.onset === 'noise' ? 4500 : 2000; f.Q.value = 1;
    g.gain.setValueAtTime(peak * (p.onset === 'noise' ? 0.5 : 0.35), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(out);
    n.start(t, (p.f0 % 1.5)); n.stop(t + d + 0.01);
  }
  return p;
}

/** 첫인사 한 마디 (종마다): yip 깡 · meow 냐옹 · squeak 찍 · grunt 흠 · chirp 쪼르 · chime 유니코 종 · bark 반려견 */
export const GREETS = {
  yip: [{ type: 'triangle', f: 900, to: 1350, d: 0.09, bp: 1600 }, { type: 'triangle', f: 1250, to: 950, d: 0.08, at: 0.09, bp: 1600 }],
  meow: [{ type: 'sawtooth', f: 620, to: 880, d: 0.16, bp: 1300 }, { type: 'sawtooth', f: 880, to: 560, d: 0.22, at: 0.15, bp: 1100 }],
  squeak: [{ type: 'sine', f: 1900, to: 2500, d: 0.06 }, { type: 'sine', f: 2100, to: 2700, d: 0.06, at: 0.09 }],
  grunt: [{ type: 'sawtooth', f: 150, to: 115, d: 0.22, bp: 520, noise: 400 }],
  chirp: [{ type: 'square', f: 1300, to: 1800, d: 0.05, lp: 3000 }, { type: 'square', f: 1500, to: 2000, d: 0.05, at: 0.07, lp: 3000 }],
  chime: [{ type: 'sine', f: 1760, d: 0.45, bell: true }, { type: 'sine', f: 2637, d: 0.4, at: 0.08, bell: true }],
  bark: [{ type: 'square', f: 520, to: 340, d: 0.1, lp: 1500 }],
};

/** 첫인사 소리 (말소리보다 살짝 작게) */
export function greet(audio, kind) {
  const parts = GREETS[kind];
  const c = parts && ctxOf(audio), out = c && outOf(audio);
  if (!c || !out) return false;
  const now = c.currentTime;
  for (const s of parts) {
    const t = now + (s.at || 0), o = c.createOscillator(), g = c.createGain(), pk = VOICE_PEAK * (s.bell ? 0.6 : 0.8);
    o.type = s.type; o.frequency.setValueAtTime(s.f, t);
    if (s.to) o.frequency.exponentialRampToValueAtTime(s.to, t + s.d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pk, t + (s.bell ? 0.004 : 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
    let node = o;
    if (s.bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = s.bp; f.Q.value = 1.4; node = node.connect(f); }
    if (s.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp; node = node.connect(f); }
    node.connect(g).connect(out);
    o.start(t); o.stop(t + s.d + 0.03);
    if (s.noise && audio.noiseBuf) {
      const n = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = audio.noiseBuf; f.type = 'lowpass'; f.frequency.value = s.noise;
      ng.gain.setValueAtTime(pk * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
      n.connect(f).connect(ng).connect(out); n.start(t); n.stop(t + s.d + 0.03);
    }
  }
  audio._voiceUntil = Math.max(audio._voiceUntil || 0, now + Math.max(...parts.map((s) => (s.at || 0) + s.d * 0.8)));
  return true;
}

/**
 * 대화 동안 음악 살짝 줄이기 (붙잡기).
 *  - audio.duckHold(db) 가 있으면 그것 (덕킹 전용 게인, 돌려받은 풀기 함수는 한 개만 들고 있음)
 *  - audio.holdDuck(key, on, opt) 가 있으면 그것
 *  - 둘 다 없는 예전 판: 음악 버스 목표값을 직접 0.7배로 (음악 끔·소리 끔 설정은 그대로 따름)
 */
export const DUCK = { db: -3, attack: 0.15, release: 0.6 };
export function holdDuck(audio, on) {
  if (!audio) return;
  if (typeof audio.duckHold === 'function') {
    if (on) { if (!audio._dlgDuckOff) audio._dlgDuckOff = audio.duckHold(DUCK.db); }
    else { const off = audio._dlgDuckOff; audio._dlgDuckOff = null; if (typeof off === 'function') off(); }
    return;
  }
  if (typeof audio.holdDuck === 'function') return audio.holdDuck('dialogue', on, { db: DUCK.db, attack: DUCK.attack });
  const c = audio.ctx, m = audio.music;
  if (!c || !m?.gain) return;
  const base = audio.enabled !== false && audio.musicOn !== false ? (audio.volume?.music ?? 0.5) : 0;
  const t = c.currentTime;
  m.gain.cancelScheduledValues?.(t);
  m.gain.setTargetAtTime(base * (on ? Math.pow(10, DUCK.db / 20) : 1), t, on ? DUCK.attack / 3 : 0.25);
}
