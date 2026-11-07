/**
 * 그래픽 품질 설정 (환경설정 패널 · 자동 조절)
 *  - 프리셋: 자동 / 낮음 / 보통 / 높음, 세부 항목을 바꾸면 '사용자 지정'
 *  - 저장: localStorage (unico.gfx), 주소에 ?quality=low|medium|high 로 강제 가능
 *  - 자동: 기기로 시작 단계를 고르고, 실제 FPS 가 낮으면 한 단계씩 내림
 */

export const PRESETS = {
  low: { scale: 0.75, shadows: 'low', grass: 0.3, post: false, ao: false, tiltShift: false },
  medium: { scale: 1, shadows: 'medium', grass: 0.65, post: true, ao: false, tiltShift: false },
  high: { scale: 1, shadows: 'high', grass: 1, post: true, ao: true, tiltShift: true },
};
export const LEVELS = ['low', 'medium', 'high'];
export const PRESET_INFO = {
  auto: { name: '자동', desc: '기기에 맞춰 시작하고, 화면이 끊기면 알아서 한 단계씩 낮춰요' },
  low: { name: '낮음', desc: '저사양 PC·오래된 노트북용. 해상도 75%, 가벼운 그림자, 후처리 끔' },
  medium: { name: '보통', desc: '일반 노트북용. 그림자·블룸·안티앨리어싱, 주변광 차폐 끔' },
  high: { name: '높음', desc: '게임용 PC용. 주변광 차폐·미니어처 초점까지 모든 효과' },
  custom: { name: '사용자 지정', desc: '세부 항목을 직접 고른 상태' },
};
/** 그림자 단계: 그림자 맵 크기, 몇 프레임마다 갱신 */
export const SHADOWS = {
  off: { name: '끔', size: 0, every: 0 },
  low: { name: '낮음', size: 1024, every: 3 },
  medium: { name: '보통', size: 2048, every: 2 },
  high: { name: '높음', size: 3072, every: 1 },
};
const KEY = 'unico.gfx';

export function isMobileDevice() {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
}

/** 자동 모드의 시작 단계 */
export function autoStartLevel(mobile = isMobileDevice()) {
  return mobile ? 'low' : 'high';
}

/** 화면 글자·버튼 크기 (접근성): 3단계 */
export const UI_SCALES = [{ v: 1, name: '보통' }, { v: 1.15, name: '크게' }, { v: 1.3, name: '아주 크게' }];
/** 저장값을 허용 단계 중 가장 가까운 값으로 (잘못된 값이면 보통) */
export function uiScaleOf(s) {
  const v = +s?.uiScale;
  if (!Number.isFinite(v)) return 1;
  return UI_SCALES.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a)).v;
}

export function loadSettings() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* 저장소 사용 불가 */ }
  const base = { preset: 'auto', autoLevel: autoStartLevel(), showFps: false, uiScale: 1, ...PRESETS.high };
  const out = { ...base, ...(s || {}) };
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
  if (q && PRESETS[q]) Object.assign(out, PRESETS[q], { preset: q });
  return out;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ }
}

/** 프리셋 선택: 세부 항목을 그 프리셋 값으로 */
export function applyPreset(s, preset) {
  const level = preset === 'auto' ? s.autoLevel || autoStartLevel() : preset;
  return { ...s, ...PRESETS[level], preset };
}

/** 설정 → 렌더러가 쓰는 품질 값 */
export function resolveQuality(s, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) {
  const d = s.preset === 'auto' || PRESETS[s.preset] ? { ...s, ...PRESETS[s.preset === 'auto' ? s.autoLevel : s.preset] } : s;
  const sh = SHADOWS[d.shadows] || SHADOWS.medium;
  const maxDpr = d.ao ? 2 : d.post ? 1.5 : 1;
  const level = s.preset === 'auto' ? s.autoLevel : PRESETS[s.preset] ? s.preset : d.post ? (d.ao ? 'high' : 'medium') : 'low';
  return {
    level,
    pixelRatio: Math.max(0.5, Math.min(dpr, maxDpr) * d.scale),
    shadows: d.shadows, shadowMap: sh.size || 1024, shadowEvery: sh.every,
    grass: d.grass, post: d.post, bloom: d.post, smaa: d.post, ao: d.ao, tiltShift: d.tiltShift,
    ...levelExtras(level),
  };
}

/**
 * 단계별 덧붙임 (낮음만 가볍게, 보통·높음은 그대로)
 *  precip: 비·눈 입자 비율 / birds: 새 떼 / grassFar: 풀을 그리는 거리(m, 0 = 끝까지)
 *  grassLean: 풀 한 포기 잎 수 줄이기 / lowDetail: 재질 노이즈 옥타브 줄이기 (첫 렌더 전에만 반영)
 *  shadowBoxMax: 그림자 상자 반폭 상한(m). 낮음은 26 (가로 폰에서 상자가 맵 대부분을 덮지 않게, 그 밖은 안개 속)
 */
export function levelExtras(level) {
  const low = level === 'low';
  return { precip: low ? 0.4 : 1, birds: !low, grassFar: low ? 40 : 0, grassLean: low, lowDetail: low, shadowBoxMax: low ? 26 : 36 };
}

/**
 * 자동 품질 조절기: 프레임 시간을 모아 평균 FPS 가 기준보다 낮으면 한 단계 내림을 제안.
 * 올리는 건 하지 않음(오르내림 반복 방지). 순수 로직 → tests/quality.test.js
 */
export class FpsGovernor {
  constructor({ window = 4, minFps = 32, grace = 6 } = {}) {
    this.window = window; this.minFps = minFps; this.grace = grace;
    this.t = 0; this.frames = 0; this.fps = 60; this.cool = grace;
  }

  /** 탭 전환 등으로 측정을 처음부터 (유예 시간 포함) */
  reset() { this.t = 0; this.frames = 0; this.cool = this.grace; }

  /** 매 프레임 호출. 내려야 하면 true */
  tick(dt) {
    this.t += dt; this.frames++;
    if (this.cool > 0) this.cool -= dt;
    if (this.t < this.window) return false;
    this.fps = this.frames / this.t;
    this.t = 0; this.frames = 0;
    if (this.cool > 0) return false;
    if (this.fps < this.minFps) { this.cool = this.grace; return true; }
    return false;
  }
}
