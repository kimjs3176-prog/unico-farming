/**
 * 배경음악 테마 (악보·악기 묶음, 소리는 music.js 가 냄)
 * - 테마마다 16마디 가락: [MIDI 음, 박] 목록 (0 = 쉼), 4/4 박자, A A' B A 꼴 (묻고 답하는 가락)
 * - 계절은 낮 농장 테마의 변주 (악기·빠르기·옥타브), 비·축제는 덧입힘
 * - 고르는 순서: 미니게임(밭갈이·탈곡·양 몰이·스마트팜·낚시 힘겨루기·체험관) > 집 안 > 밤 > 낮
 */

export const CHORDS = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Dm: [50, 53, 57], Em: [52, 55, 59] };
export const BEATS_PER_BAR = 4;
export const BARS = 16;

// ---------------------------------------------------------------- 낮 농장 (84 bpm, C장조)
const FARM_A = [
  [76, 1], [79, 1], [76, 0.5], [74, 0.5], [72, 1],
  [74, 0.5], [76, 0.5], [72, 1], [69, 2],
  [69, 1], [72, 1], [77, 1], [76, 0.5], [74, 0.5],
  [74, 2], [0, 2],
];
const FARM_A2 = [
  [76, 1], [79, 1], [76, 0.5], [74, 0.5], [72, 1],
  [74, 0.5], [76, 0.5], [72, 1], [69, 1], [72, 1],
  [74, 1], [71, 1], [74, 1], [79, 0.5], [77, 0.5],
  [76, 1], [74, 0.5], [72, 2.5],
];
const FARM_B = [
  [81, 1.5], [79, 0.5], [77, 1], [76, 1],
  [74, 1], [79, 1.5], [77, 0.5], [76, 1],
  [79, 1.5], [76, 0.5], [74, 1], [76, 1],
  [72, 1], [69, 1], [72, 1], [74, 1],
];
const FARM_END = [...FARM_A2.slice(0, -3), [76, 0.5], [74, 0.5], [72, 3]];

// ---------------------------------------------------------------- 밤 (66 bpm, 가단조, 한 옥타브 낮게 부드럽게)
const NIGHT_A = [
  [76, 2], [72, 1], [74, 1],
  [72, 1.5], [69, 2.5],
  [67, 1], [72, 1], [76, 2],
  [74, 3], [0, 1],
];
const NIGHT_A2 = [
  [76, 2], [72, 1], [74, 1],
  [77, 1.5], [76, 0.5], [72, 2],
  [74, 1], [71, 1], [67, 2],
  [69, 4],
];
const NIGHT_B = [
  [74, 1], [77, 1], [81, 2],
  [79, 1.5], [76, 0.5], [71, 2],
  [72, 1], [77, 1], [76, 1], [74, 1],
  [71, 2], [74, 2],
];

// ---------------------------------------------------------------- 집 안 오르골 (72 bpm, 한 옥타브 위로 연주)
const HOME_A = [
  [72, 1], [76, 1], [79, 1], [76, 1],
  [74, 1], [79, 1], [74, 2],
  [72, 1], [76, 1], [81, 1], [79, 1],
  [76, 3], [0, 1],
];
const HOME_A2 = [
  [72, 1], [76, 1], [79, 1], [76, 1],
  [74, 1], [79, 1], [74, 2],
  [77, 1], [76, 1], [74, 1], [69, 1],
  [72, 3], [0, 1],
];
const HOME_B = [
  [77, 1], [81, 1], [77, 1], [72, 1],
  [76, 1], [79, 1], [76, 2],
  [74, 1], [77, 1], [81, 1], [77, 1],
  [74, 2], [71, 1], [67, 1],
];
const HOME_END = [...HOME_A2.slice(0, -2), [72, 4]];

// ---------------------------------------------------------------- 미니게임 (120 bpm, 북 장단)
const MG_A = [
  [72, 0.5], [76, 0.5], [79, 0.5], [76, 0.5], [84, 1], [79, 1],
  [77, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [77, 1], [81, 1],
  [79, 0.5], [77, 0.5], [76, 0.5], [74, 0.5], [71, 1], [74, 1],
  [72, 1], [79, 1], [72, 2],
];
const MG_A2 = [
  [76, 0.5], [72, 0.5], [69, 0.5], [72, 0.5], [76, 1], [81, 1],
  [77, 1], [76, 0.5], [74, 0.5], [72, 1], [69, 1],
  [71, 0.5], [74, 0.5], [79, 0.5], [74, 0.5], [71, 1], [67, 1],
  [74, 1], [77, 1], [79, 2],
];
const MG_B = [
  [81, 1], [79, 0.5], [77, 0.5], [76, 1], [77, 1],
  [79, 1], [77, 0.5], [76, 0.5], [74, 1], [71, 1],
  [76, 1], [79, 1], [83, 1], [79, 1],
  [74, 0.5], [76, 0.5], [77, 0.5], [79, 0.5], [81, 1], [83, 1],
];
const MG_END = [...MG_A.slice(0, -3), [84, 1], [79, 1], [72, 2]];

/**
 * 테마 표
 *  bpm · prog(마디마다 화음 16개) · melody([음, 박]) · oct(연주 옥타브 옮김) · patch(가락 악기)
 *  bass: 'walk'(1·3박 근음·5도) | 'long'(온음표) | 'soft'(1박만) | 'bounce'(통통)
 *  perc: 'shaker' | 'drums' | null · rest: 두 번 돈 뒤 쉬어도 되는 테마(바깥) · padLp: 패드 밝기
 */
export const THEMES = {
  farm_day: { bpm: 84, prog: ['C', 'Am', 'F', 'G', 'C', 'Am', 'G', 'C', 'F', 'G', 'Em', 'Am', 'C', 'Am', 'G', 'C'], melody: [...FARM_A, ...FARM_A2, ...FARM_B, ...FARM_END], oct: 0, patch: 'kalimba', bass: 'walk', perc: 'shaker', rest: true, padLp: 1300 },
  night: { bpm: 66, prog: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am', 'Dm', 'Em', 'F', 'G', 'Am', 'F', 'G', 'Am'], melody: [...NIGHT_A, ...NIGHT_A2, ...NIGHT_B, ...NIGHT_A2], oct: -12, patch: 'kalimba', bass: 'long', perc: null, rest: true, padLp: 1000 },
  home: { bpm: 72, prog: ['C', 'G', 'Am', 'Em', 'C', 'G', 'F', 'C', 'F', 'C', 'Dm', 'G', 'C', 'G', 'F', 'C'], melody: [...HOME_A, ...HOME_A2, ...HOME_B, ...HOME_END], oct: 12, patch: 'musicbox', bass: 'soft', perc: null, rest: false, padLp: 900 },
  minigame: { bpm: 120, prog: ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'G', 'F', 'G', 'Em', 'G', 'C', 'F', 'G', 'C'], melody: [...MG_A, ...MG_A2, ...MG_B, ...MG_END], oct: 0, patch: 'lead', bass: 'bounce', perc: 'drums', rest: false, padLp: 1600 },
};

/**
 * 테마별 층 크기 (음악 버스 앞 게인). 스크립트로 잰 크기(tests/fixtures/music_levels.json)가
 * 낮 음악 목표(가장 큰 구간 -27dB · 평균 -33dB)에 맞게 맞춤. 바꾸면 tests/lib/music_levels.mjs 로 다시 잼
 */
export const THEME_LEVEL = {
  farm_day: { pad: 0.026, bass: 0.035, perc: 1.2, mel: 0.054 },
  night: { pad: 0.021, bass: 0.03, perc: 0, mel: 0.052 },
  home: { pad: 0.026, bass: 0.034, perc: 0, mel: 0.048 },
  minigame: { pad: 0.018, bass: 0.036, perc: 0.9, mel: 0.05 },
};

/** 계절 변주 (낮 농장 테마만): 봄 칼림바 · 여름 마림바 + 손북 · 가을 플루트(한 옥타브 아래, 6bpm 느리게) · 겨울 종소리(76bpm, 셰이커 없음) */
export const SEASON_VARIANTS = {
  spring: { patch: 'kalimba' },
  summer: { patch: 'marimba', handDrum: true },
  autumn: { patch: 'flute', oct: -12, bpm: -6 },
  winter: { patch: 'bell', bpmTo: 76, shaker: false },
};

/** 밤 판정 (오락가락하지 않게 두 문턱): 밝기 0.3 아래면 밤, 0.42 위면 낮 */
export function nextNight(prev, daylight) {
  if (prev) return !(daylight > 0.42);
  return daylight < 0.3;
}

/** 지금 상태 → 테마 이름 */
export function pickCue(s = {}) {
  if (s.minigame) return 'minigame';
  if (s.inside) return 'home';
  if (s.night) return 'night';
  return 'farm_day';
}

/** 테마 + 계절·비·축제 → 이번 마디에 쓸 연주 설정 */
export function variantFor(cue, s = {}) {
  const T = THEMES[cue] || THEMES.farm_day;
  const v = { cue, bpm: T.bpm, patch: T.patch, oct: T.oct, shaker: T.perc === 'shaker', drums: T.perc === 'drums', handDrum: false, glock: false, rain: !!s.rain, padLp: T.padLp };
  if (cue === 'farm_day') {
    const S = SEASON_VARIANTS[s.season];
    if (S) {
      if (S.patch) v.patch = S.patch;
      if (S.oct) v.oct += S.oct;
      if (S.bpm) v.bpm += S.bpm;
      if (S.bpmTo) v.bpm = S.bpmTo;
      if (S.shaker === false) v.shaker = false;
      if (S.handDrum) v.handDrum = true;
    }
    if (s.festival) { v.handDrum = true; v.glock = true; }
  }
  // 비: 셰이커 빼고 가락 절반, 패드 어둡게
  if (v.rain) { v.shaker = false; v.padLp = Math.min(v.padLp, 800); }
  return v;
}

/** 가락 목록을 8분음 칸으로: 마디마다 { chord, notes: { 칸: { midi, len } }, orn: [꾸밈 칸] } */
export function compileTheme(T) {
  const bars = Array.from({ length: BARS }, (_, i) => ({ chord: CHORDS[T.prog[i % T.prog.length]], notes: {}, orn: [] }));
  let pos = 0; // 8분음 칸
  for (const [midi, beats] of T.melody) {
    const len = Math.round(beats * 2), b = Math.floor(pos / 8), e = pos % 8;
    if (b >= BARS) break;
    if (midi > 0) bars[b].notes[e] = { midi, len };
    // 꾸밈음 자리: 한 박 넘는 쉼의 가운데, 두 박 넘게 끄는 음의 셋째 칸
    if (midi === 0 && len >= 2) bars[b].orn.push(e + Math.floor(len / 2));
    else if (midi > 0 && len >= 4 && e + 2 < 8) bars[b].orn.push(e + 2);
    pos += len;
  }
  return { bars, eighths: pos };
}

/** 악보 점검: 마디마다 4박, 전체 16마디, 음역 · 이어지는 음이 대부분 가까운지 → 문제 목록 */
export function validateTheme(T) {
  const errs = [];
  if (!T || !Array.isArray(T.melody)) return ['가락 없음'];
  if (T.prog.length !== BARS) errs.push(`화음 ${T.prog.length}개`);
  for (const c of T.prog) if (!CHORDS[c]) errs.push(`모르는 화음 ${c}`);
  let pos = 0;
  for (const [m, b] of T.melody) {
    if (!(b > 0) || Math.round(b * 2) !== b * 2) errs.push(`박 ${b}`);
    const bar = Math.floor(pos / BEATS_PER_BAR), end = pos + b;
    if (end > (bar + 1) * BEATS_PER_BAR + 1e-9) errs.push(`마디 ${bar + 1} 을 넘는 음 ${m}`);
    if (m && (m < 55 || m > 96)) errs.push(`음역 밖 ${m}`);
    pos = end;
  }
  if (Math.abs(pos - BARS * BEATS_PER_BAR) > 1e-9) errs.push(`박 합 ${pos}`);
  const notes = T.melody.map(([m]) => m).filter(Boolean);
  if (Math.max(...notes) - Math.min(...notes) > 17) errs.push(`음역 ${Math.max(...notes) - Math.min(...notes)}반음`);
  let near = 0;
  for (let i = 1; i < notes.length; i++) if (Math.abs(notes[i] - notes[i - 1]) <= 4) near++;
  if (near / Math.max(1, notes.length - 1) < 0.6) errs.push('뛰는 음이 너무 많음');
  return errs;
}
