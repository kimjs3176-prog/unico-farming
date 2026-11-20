/**
 * 그래픽 품질 설정 (환경설정 패널 · 자동 조절)
 *  - 프리셋: 자동 / 낮음 / 보통 / 높음, 세부 항목을 바꾸면 '사용자 지정'
 *  - 저장: localStorage (unico.gfx), 주소에 ?quality=low|medium|high 로 강제 가능
 *  - 자동: 기기로 시작 단계를 고르고, 실제 FPS 가 낮으면 한 단계씩 내림
 */

export const PRESETS = {
  low: { scale: 1, shadows: 'low', grass: 0.3, post: false, ao: false, tiltShift: false },
  medium: { scale: 1, shadows: 'medium', grass: 0.65, post: true, ao: false, tiltShift: false },
  high: { scale: 1, shadows: 'high', grass: 1, post: true, ao: true, tiltShift: true },
};
export const LEVELS = ['low', 'medium', 'high'];
export const PRESET_INFO = {
  auto: { name: '자동', desc: '기기에 맞춰 시작하고, 화면이 끊기면 알아서 한 단계씩 낮춰요' },
  low: { name: '낮음', desc: '저사양 PC·휴대폰용. 화면 크기에 맞춘 해상도, 가벼운 그림자, 후처리·환경 반사 끔' },
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

/**
 * GPU 이름 → 시작 단계 (모르는 이름은 보통)
 *  낮음: 소프트웨어 렌더러 / 높음: 외장 GeForce RTX·GTX 상급·Quadro·Radeon RX(Vega 내장 제외)·Radeon Pro·Arc A5/A7·Apple M Pro/Max/Ultra
 *  보통: Intel UHD/Iris, Radeon Vega 내장, GeForce MX, 'Apple GPU', 그 밖
 */
export const GPU_LOW = /SwiftShader|llvmpipe|softpipe|Basic Render/i;
export const GPU_HIGH = /RTX|GTX (9[6-8]0|10[5-8]0|16[5-6]0)|Quadro|Radeon RX (?!Vega)\d|Radeon Pro|Arc\(TM\) A[57]|Apple M\d (Pro|Max|Ultra)/i;
export function gpuTier(name = '') {
  const s = String(name || '');
  if (GPU_LOW.test(s)) return 'low';
  if (GPU_HIGH.test(s)) return 'high';
  return 'medium';
}

let gpuMemo = null;
/**
 * 이 기기 GPU (한 번만 잼): 모바일은 WebGL 없이 낮음. 그 밖은 버리는 webgl2 캔버스 하나로 이름을 읽고 바로 놓음
 * → { tier, name, key } (key: 설정에 적어 두는 GPU 표시, 바뀌면 시작 단계를 다시 고름)
 */
export function gpuInfo(mobile = isMobileDevice()) {
  if (mobile) return { tier: 'low', name: '', key: 'mobile' };
  if (gpuMemo) return gpuMemo;
  let name = '';
  try {
    if (typeof document !== 'undefined') {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        name = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }
  } catch { /* 모르면 보통 */ }
  gpuMemo = { tier: gpuTier(name), name, key: name.slice(0, 96) || '?' };
  return gpuMemo;
}

/** 자동 모드의 시작 단계: 모바일 낮음, PC 는 GPU 등급 (모르면 보통) */
export function autoStartLevel(mobile = isMobileDevice(), gpu = null) {
  return mobile ? 'low' : (gpu || gpuInfo(false)).tier;
}

/** 자동 내림을 기억하는 기간: 두 번째 접속에서도 같은 단계로 내려야 저장, 이 기간이 지나면 GPU 단계로 다시 시작 */
export const AUTO_DROP_DAYS = 14;
const DAY_MS = 86400000;
const minLevel = (a, b) => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b);

/**
 * 자동 단계 맞추기 (불러올 때): GPU 가 바뀌었거나 적어 둔 적이 없으면(예전 저장: 높음에 굳은 기기) GPU 단계로 새로,
 * 두 접속에서 내린 기록(keep)은 마지막으로 내린 뒤 14일 동안 시작 단계로, 지나면 지우고 GPU 단계로 다시
 */
export function resolveAuto(s, gpu, mobile = false, now = Date.now()) {
  const tier = mobile ? 'low' : gpu.tier;
  const out = { ...s };
  const drop = out.autoDrop && LEVELS.includes(out.autoDrop.level) && Number.isFinite(out.autoDrop.at) ? out.autoDrop : null;
  if (out.autoGpu !== gpu.key) { out.autoGpu = gpu.key; delete out.autoDrop; out.autoLevel = tier; return out; }
  if (drop && now - drop.at > AUTO_DROP_DAYS * DAY_MS) { delete out.autoDrop; out.autoLevel = tier; return out; }
  out.autoLevel = drop && drop.n >= 2 && LEVELS.includes(drop.keep) ? minLevel(tier, drop.keep) : tier;
  return out;
}

/**
 * 자동 조절기가 이번 접속에서 level 로 내림 → { settings, persist }
 *  - autoDrop: { level: 이번 접속에서 내려간 가장 낮은 단계, n: 내린 접속 수, at, keep: 저장한 시작 단계 }
 *  - 앞선 접속(14일 안)에서도 내렸으면 두 접속 모두 필요했던 단계(둘 중 높은 쪽)를 시작 단계로 저장(keep), 처음이면 기록만
 * sess: 이번 접속 상태 (같은 접속에서 두 번 세지 않음)
 */
export function noteAutoDrop(s, level, now = Date.now(), sess = {}) {
  if (!sess.started) {
    sess.started = true;
    const p = s.autoDrop;
    sess.prev = p && LEVELS.includes(p.level) && Number.isFinite(p.at) && now - p.at <= AUTO_DROP_DAYS * DAY_MS ? p : null;
  }
  const prev = sess.prev;
  const drop = { level, n: prev ? Math.min(9, (prev.n || 1) + 1) : 1, at: now };
  if (!prev) return { settings: { ...s, autoDrop: drop }, persist: false };
  drop.keep = LEVELS.indexOf(level) >= LEVELS.indexOf(prev.level) ? level : prev.level;
  return { settings: { ...s, autoDrop: drop, autoLevel: minLevel(s.autoLevel || drop.keep, drop.keep) }, persist: true };
}

/** 화면 글자·버튼 크기 (접근성): 3단계 */
export const UI_SCALES = [{ v: 1, name: '보통' }, { v: 1.15, name: '크게' }, { v: 1.3, name: '아주 크게' }];
/** 저장값을 허용 단계 중 가장 가까운 값으로 (잘못된 값이면 보통) */
export function uiScaleOf(s) {
  const v = +s?.uiScale;
  if (!Number.isFinite(v)) return 1;
  return UI_SCALES.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a)).v;
}

export function loadSettings({ now = Date.now() } = {}) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* 저장소 사용 불가 */ }
  const mobile = isMobileDevice(), gpu = gpuInfo(mobile);
  const base = { preset: 'auto', autoLevel: autoStartLevel(mobile, gpu), showFps: false, uiScale: 1, ...PRESETS.high };
  let out = { ...base, ...(s || {}) };
  delete out.sessionLevel;
  if (out.preset === 'auto') { // 사용자가 고른 단계는 건드리지 않음
    out = resolveAuto(out, gpu, mobile, now);
    Object.assign(out, PRESETS[out.autoLevel]); // 세부 항목도 그 단계 값으로 (환경설정 창 표시)
  }
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
  if (q && PRESETS[q]) Object.assign(out, PRESETS[q], { preset: q });
  return out;
}

/** 저장 (이번 접속에서만 낮춘 단계 sessionLevel 은 빼고) */
export function saveSettings(s) {
  const { sessionLevel, ...keep } = s || {};
  try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch { /* 무시 */ }
}

/** 자동 모드에서 지금 쓰는 단계 (이번 접속에서 낮췄으면 그 단계) */
export const autoNow = (s) => (LEVELS.includes(s?.sessionLevel) ? s.sessionLevel : s?.autoLevel);

/** 프리셋 선택: 세부 항목을 그 프리셋 값으로 */
export function applyPreset(s, preset) {
  const level = preset === 'auto' ? autoNow(s) || autoStartLevel() : preset;
  return { ...s, ...PRESETS[level], preset };
}

/**
 * 후처리 없는 단계(낮음)의 픽셀 배율: 그리는 픽셀 수를 LOW_PIXELS 쯤으로 맞춤.
 *  예전에는 '배율 1 × 75%' 로 고정이라 폰(390×844, dpr 3)에서 292×633 으로 그려 3.7배로 늘려 보여 줌 → 뿌옇게 보임.
 *  지금: 폰 세로 화면 ≈ 1.35배(약 60만 픽셀), 큰 PC 화면은 예전처럼 0.75배까지만 내림, 화면 dpr·1.5배를 넘지 않음
 */
export const LOW_PIXELS = 600_000;
export function lowPixelRatio(dpr, area) {
  const want = Math.sqrt(LOW_PIXELS / Math.max(1, area));
  return Math.min(Math.max(0.75, Math.min(dpr, 1.5)), Math.max(0.75, want));
}
const viewArea = () => (typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth * innerHeight : 1920 * 1080);

/** 설정 → 렌더러가 쓰는 품질 값 (area: 화면 CSS 픽셀 넓이, 낮음 단계의 해상도를 정할 때만 씀) */
export function resolveQuality(s, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, area = viewArea()) {
  const d = s.preset === 'auto' || PRESETS[s.preset] ? { ...s, ...PRESETS[s.preset === 'auto' ? autoNow(s) : s.preset] } : s;
  const sh = SHADOWS[d.shadows] || SHADOWS.medium;
  const maxDpr = d.ao ? 2 : d.post ? 1.5 : lowPixelRatio(dpr, area);
  const level = s.preset === 'auto' ? autoNow(s) : PRESETS[s.preset] ? s.preset : d.post ? (d.ao ? 'high' : 'medium') : 'low';
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
 *  env: 환경맵(IBL) 반사·간접광. 낮음은 끔 (밝기는 world.js 가 주변광으로 채움, PostFX 를 다시 만들 때만 바뀜)
 *       언제나 후처리(post)와 함께 바뀜: 후처리를 끄면 화면에 바로 그려 톤 매핑·색 공간 때문에 재질 셰이더를 어차피 다시 만듦
 *       → 환경맵을 같이 꺼도 다시 컴파일이 더 생기지 않음 (tests/quality.test.js)
 */
export function levelExtras(level) {
  const low = level === 'low';
  return { precip: low ? 0.4 : 1, birds: !low, grassFar: low ? 40 : 0, grassLean: low, lowDetail: low, shadowBoxMax: low ? 26 : 36, env: !low };
}

/**
 * 자동 품질 조절기: 창(4초)마다 프레임 시간의 가운데 값(중앙값)을 보고, 두 창 잇달아 36ms(약 28fps)보다 길면 한 단계 내림을 제안.
 *  - 30fps 로 꾸준히 도는 화면(33ms)은 내리지 않음, 한 번 끊김(중앙값에 안 걸림)으로도 내리지 않음
 *  - 올리는 건 하지 않음(오르내림 반복 방지). 순수 로직 → tests/quality.test.js
 */
export const SLOW_MS = 36;
export class FpsGovernor {
  constructor({ window = 4, slowMs = SLOW_MS, strikes = 2, grace = 6 } = {}) {
    this.window = window; this.slowMs = slowMs; this.strikes = strikes; this.grace = grace;
    this.buf = new Float32Array(1024); // 한 창의 프레임 시간 (넘치면 마지막 칸만 덮어씀)
    this.t = 0; this.frames = 0; this.maxDt = 0; this.fps = 60; this.p50 = 0; this.cool = grace; this.slow = 0;
  }

  /** 탭 전환 등으로 측정을 처음부터 (유예 시간 포함) */
  reset() { this.t = 0; this.frames = 0; this.maxDt = 0; this.cool = this.grace; this.slow = 0; }

  /** 매 프레임 호출. 내려야 하면 true */
  tick(dt) {
    this.buf[Math.min(this.frames, this.buf.length - 1)] = dt;
    this.t += dt; this.frames++;
    if (dt > this.maxDt) this.maxDt = dt;
    if (this.cool > 0) this.cool -= dt;
    if (this.t < this.window) return false;
    const n = Math.min(this.frames, this.buf.length), stall = this.maxDt > this.t * 0.5;
    this.fps = this.frames / this.t;
    this.p50 = this.buf.subarray(0, n).slice().sort()[n >> 1] * 1000;
    this.t = 0; this.frames = 0; this.maxDt = 0;
    if (this.cool > 0) { this.slow = 0; return false; }
    if (stall) return false; // 한 프레임이 창의 절반을 넘게 차지(한 번 멈춤): 판단하지 않음
    this.slow = this.p50 > this.slowMs ? this.slow + 1 : 0;
    if (this.slow >= this.strikes) { this.slow = 0; this.cool = this.grace; return true; }
    return false;
  }
}
