/**
 * 사운드 (외부 파일 없이 WebAudio 합성)
 * 믹서: 효과음·목소리 → 마스터 / 음악·환경음 → 낮춤(덕킹) → 마스터 / 공용 잔향(컨볼버) 센드
 * 마스터 → 묶음 압축기 → 리미터 → 출력 (폭풍+천둥+레벨업이 겹쳐도 깨지지 않게)
 * 효과음은 이름마다 목표 크기(MIX_DB)가 있고, scripts/audio-levels.mjs 로 압축기 앞 소리를 재서 MIX 를 맞춤
 * (소리 하나는 압축기 문턱 아래 → 압축기는 겹칠 때만 일함, 음악이 출렁이지 않게)
 */

/** 이름별 목표 크기: 쉬고 있는 압축기 뒤 가장 큰 50ms 구간(dBFS). 자주 나는 작은 소리 < 도구 < 줍기 < 큰 보상 */
export const MIX_DB = {
  tap: -32, blip: -32, open: -30, close: -30, click: -27,
  dig: -22, plant: -22, water: -22, stroke: -24, splash: -22, shoo: -22, bump: -22,
  hammer: -22, rustle: -23, pull: -23, swish: -23, door: -24, deny: -24, bite: -22, alert: -22, startle: -26, land: -27,
  coin: -20, pop: -21, harvest: -20, catch: -21, combo: -20, pickup: -20, buy: -20, count: -20, star: -20, sale: -20,
  go: -17, quest: -17, warp: -20, ignite: -24, engine: -24, bell: -22,
  win: -16, levelup: -15,
  caw: -32, howl: -32, bark: -30, buzz: -36, tune: -28, yip: -30, growl: -32,
  // 목장 동물 목소리 (쓰다듬기·먹이) 와 빗질
  moo: -24, baa: -24, cluck: -25, neigh: -24, heehaw: -24, hum: -26, bristle: -25,
  eat: -24, scatter: -26, sleep: -22, morning: -20,
  // 축제 짧은 가락 (축제 날 연출)
  fest: -18,
  thunder: -16,
};

/**
 * 압축기 앞에서 잴 때 목표에 더하는 값 (dB) = 압축기·리미터의 자동 보정 이득을 뺀 것.
 * 압축기 앞 크기 = MIX_DB + PRE_DB. scripts/audio-levels.mjs 가 조용한 사인파로 재서 확인
 */
export const PRE_DB = -8;

/** 이름별 크기 배율 (scripts/audio-levels.mjs 로 잰 값에서 맞춤) */
export const MIX = {
  tap: 1.122, blip: 1.122, open: 0.813, close: 0.812, click: 0.989, dig: 1.122, plant: 0.708, water: 1.109,
  stroke: 2.787, splash: 1.035, shoo: 1.122, bump: 1.034, hammer: 1.7, rustle: 1.861, pull: 1.365, swish: 3.981,
  door: 1, deny: 1.048, bite: 1.585, alert: 0.823, startle: 1.217, land: 0.785, coin: 1.161, pop: 1.334,
  harvest: 0.537, catch: 1.622, combo: 1.429, pickup: 1.162, buy: 1.288, count: 1.349, star: 1.123, sale: 1.097,
  go: 1.396, quest: 0.922, warp: 1.429, ignite: 1.189, engine: 1.289, bell: 0.631, win: 0.832, levelup: 0.631,
  caw: 2.985, howl: 0.776, bark: 2.818, buzz: 0.359, tune: 0.652, eat: 2.019, scatter: 1.884, sleep: 0.575,
  morning: 0.725, thunder: 3.127, yip: 0.32, growl: 0.437, moo: 1.738, baa: 1.66, cluck: 0.741, neigh: 1.109,
  heehaw: 1.023, hum: 0.363, bristle: 1.641, fest: 0.933,
};

/** 변주 종류: 음 있는 소리는 음 하나 ±1.2%, 두드리는·노이즈 소리는 높이·길이 ±10%, 팡파르는 그대로 */
const VARY_NONE = new Set(['win', 'levelup', 'quest', 'go', 'tune', 'sale', 'count', 'star', 'thunder', 'sleep', 'morning', 'fest']);
const VARY_PERC = new Set(['dig', 'stroke', 'splash', 'shoo', 'bump', 'hammer', 'rustle', 'pull', 'swish', 'door', 'bite', 'land', 'buzz', 'caw', 'bark', 'startle', 'deny', 'eat', 'scatter', 'cluck', 'yip', 'growl', 'bristle']);
/** 같은 이름이 45ms 안에 또 나도, 소리 수가 넘쳐도 꼭 내는 소리 */
const KEEP = new Set(['click', 'levelup']);
/** 이어서 하면 오음계로 한 칸씩 오르는 소리와 그 소리의 가장 높은 음 (2.4kHz 를 넘지 않게) */
const COMBO_TOP = { harvest: 1319, water: 1568, plant: 784 };
/** C장조 오음계 비율 (음악과 같은 조) */
export const COMBO_STEPS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
export const COMBO_WINDOW = 2.5;
const COMBO_CAP = 2400;

/** C장조 오음계(도·레·미·솔·라) 평균율 음 중 f 이상에서 가장 가까운 음 (cap 을 넘으면 cap 아래 가장 높은 음) */
export function snapPenta(f, cap = COMBO_CAP) {
  const PC = [0, 2, 4, 7, 9];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let best = 0;
  for (let m = 36; m < 120; m++) {
    if (!PC.includes(m % 12)) continue;
    const h = hz(m);
    if (h > cap) break;
    best = h;
    if (h >= f * 0.999) return h;
  }
  return best;
}
/** 이 소리가 나면 음악을 잠깐 낮춤 [dB, 유지 초] */
const DUCK = { levelup: [-5, 1.2], win: [-3, 0.6], quest: [-3, 0.6], fest: [-4, 1.0] };

/** 발소리: 바닥 종류 (footsteps.js surfaceAt 결과) */
export const STEP_KINDS = ['grass', 'dirt', 'wood', 'floor', 'snow', 'stone'];
/** 발소리 목표 크기 (달릴 때, dBFS) — 도구 소리보다 8dB 쯤 작게 */
export const STEP_DB = { grass: -31, dirt: -30, wood: -29, floor: -30, snow: -30, stone: -30 };
/** 발소리 배율 (scripts/audio-levels.mjs 로 맞춤) */
export const STEP_MIX = {
  grass: 2.755, dirt: 3.236, wood: 3.2, floor: 4.954, snow: 1.288, stone: 2.042,
};

export const dbToGain = (db) => Math.pow(10, db / 20);

// ------------------------------------------------------------ 소리 설정 저장 (이 브라우저)
export const AUDIO_PREF_KEY = 'unico.audio';
export const DEFAULT_VOLUME = { master: 0.9, sfx: 0.8, music: 0.5, amb: 0.6 };
const clamp01 = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** 저장된 글 → { enabled, musicOn, volume } (깨졌거나 없으면 기본값, 크기는 0~1 로 묶음) */
export function parseAudioPrefs(raw) {
  let o = null;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { o = null; }
  if (!o || typeof o !== 'object') o = {};
  const v = o.volume && typeof o.volume === 'object' ? o.volume : {};
  const volume = {};
  for (const k of Object.keys(DEFAULT_VOLUME)) volume[k] = clamp01(v[k], DEFAULT_VOLUME[k]);
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : true;
  return { enabled, musicOn: typeof o.musicOn === 'boolean' ? o.musicOn : true, volume };
}

/** 듣는 사람(플레이어·카메라 방향) 기준 크기·좌우. 30m 밖은 null (minGain 이 있으면 그 크기로) */
export function spatial(L, x, z, minGain = 0) {
  if (!L) return { gain: 1, pan: 0 };
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
  if (d > 30 && !(minGain > 0)) return null;
  const gain = Math.max(minGain, 1 / (1 + d / 8));
  // 카메라 오른쪽 = (cos yaw, -sin yaw) (camera.js)
  const yaw = L.yaw || 0;
  const pan = d > 0.5 ? Math.max(-0.7, Math.min(0.7, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d)) : 0;
  return { gain, pan };
}

export class Audio {
  /** opts.prefs: 소리 설정을 저장·복원 (3D 판 boot.js). 도트 판은 예전처럼 저장 없이 */
  constructor(opts = {}) {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = { master: 0.9, sfx: 0.8, music: 0.5, amb: 0.6 };
    this.maxVoices = 24; // 동시에 울리는 효과음 재료(오실레이터·노이즈) 상한, 낮은 품질은 16 (main.js)
    this.rng = Math.random;
    this._pm = 1; this._vm = 1; this._lm = 1; this._inPlay = false;
    this._live = 0; this._made = 0; this._cost = {}; // 지금 울리는 효과음 재료 수, 이름별 재료 수
    this._lastAt = {};
    this._combo = {};
    this._ducks = new Map(); this._duckId = 0;
    this._stepAt = -1; this._stepPan = 0.1;
    this._eng = null; this._reel = null;
    this._out = null; // playAt: 이번 소리의 출력 (좌우 패너)
    this._ambK = 1; // 집 안: 주변 소리 -8dB
    this.listener = null; // { x, z, yaw } — ambience.js 가 채움
    this.prefs = !!opts.prefs;
    if (this.prefs) this.load();
  }

  /** 저장된 소리 설정 불러오기 (없거나 깨졌으면 기본값) */
  load(store = globalThis.localStorage) {
    let raw = null;
    try { raw = store?.getItem?.(AUDIO_PREF_KEY) ?? null; } catch { raw = null; }
    const p = parseAudioPrefs(raw);
    this.enabled = p.enabled; this.musicOn = p.musicOn; this.volume = p.volume;
    return p;
  }

  /** 소리 설정 저장 (저장소가 막혀도 이번 판은 그대로) */
  save(store = globalThis.localStorage) {
    try { store?.setItem?.(AUDIO_PREF_KEY, JSON.stringify({ enabled: this.enabled, musicOn: this.musicOn, volume: this.volume })); return true; } catch { return false; }
  }

  /** 지금 소리 상태: 'all' | 'sfx'(음악 끔) | 'off' */
  get mode() { return this.enabled ? (this.musicOn ? 'all' : 'sfx') : 'off'; }

  /** 소리 상태 바꾸기 (설정 창의 세 단추) */
  setMode(st) {
    this.enabled = st !== 'off';
    this.musicOn = st === 'all';
    this.apply();
    if (this.prefs) this.save();
    return this.mode;
  }

  _ctx() {
    if (this.hold) return null; // 화면을 벗어난 동안: 효과음을 무시하고 저절로 다시 켜지 않음
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; return null; }
      const c = this.ctx;
      // 저장된 '끔' 이면 처음부터 0 (비·바람 환경음도 조용히)
      this.master = c.createGain(); this.master.gain.value = this.enabled ? this.volume.master : 0;
      // 묶음 압축(살짝) → 리미터(벽): 무릎 값을 꼭 적음 (기본값이 브라우저마다 다름)
      const comp = (o) => { const n = c.createDynamicsCompressor(); for (const k in o) if (n[k]) n[k].value = o[k]; return n; };
      const glue = comp({ threshold: -18, knee: 6, ratio: 3, attack: 0.003, release: 0.25 });
      const lim = comp({ threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
      this.master.connect(glue).connect(lim).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.volume.sfx; this.sfx.connect(this.master);
      this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.volume.sfx; this.voiceBus.connect(this.master);
      // 음악·환경음 → 낮춤 전용 게인 → 마스터 (음악 버튼이 쓰는 게인과 따로)
      this.duckGain = c.createGain(); this.duckGain.gain.value = 1; this.duckGain.connect(this.master);
      this.ambDuck = c.createGain(); this.ambDuck.gain.value = 1; this.ambDuck.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = this.musicOn ? this.volume.music : 0; this.music.connect(this.duckGain);
      // 주변 소리 → 저역통과(바깥 20kHz, 집 안 700Hz) → 낮춤 → 마스터
      this.ambLP = c.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 20000; this.ambLP.Q.value = 0;
      this.ambLP.connect(this.ambDuck);
      this.amb = c.createGain(); this.amb.gain.value = this.volume.amb * this._ambK; this.amb.connect(this.ambLP);
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
    this._resume();
    return this.ctx;
  }

  /** 멈춘(suspended)·끊긴(iOS 'interrupted') 상태면 다시 켬. 거절돼도 조용히 넘어감 (다음 터치에서 다시 시도) */
  _resume() {
    const c = this.ctx, s = c?.state;
    // 다시 켜지면 멈춰 있던 낮추기 타이머를 다시 검
    if (s === 'suspended' || s === 'interrupted') c.resume()?.then?.(() => { if (this._ducks.size) { try { this._applyDuck(); } catch { /* 이미 끊김 */ } } }, () => {});
  }

  /** 첫 탭 처리 안에서 바로 호출: 소리 장치를 만들고 무음 1샘플을 재생해 iOS 잠금을 풂 */
  unlock() {
    const c = this._ctx();
    if (!c) return;
    try {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, c.sampleRate);
      s.connect(c.destination);
      s.start(0);
    } catch { /* 잠금 해제용, 실패해도 무시 */ }
  }

  /** 화면을 벗어날 때: 소리 장치를 멈춰 배터리 절약 (엔진·릴 소리도 끔) */
  sleep() {
    this.hold = true;
    this.engineStop(true);
    this.reelStop(true);
    const c = this.ctx;
    if (c?.state === 'running') c.suspend()?.catch?.(() => {});
  }

  /** 화면으로 돌아올 때 */
  wake() {
    this.hold = false;
    this._resume();
  }

  /** 사용자 동작(손을 뗄 때·클릭·키)마다 멈춘 소리 장치를 다시 켬: iOS 는 동작 밖에서 resume 을 거절할 수 있음 */
  wakeOnGesture(target = window) {
    if (this._gestureWake) return;
    this._gestureWake = () => { if (!this.hold) this._resume(); };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) target.addEventListener(ev, this._gestureWake, { capture: true, passive: true });
  }

  /** 소리 켜짐/음악 끔/모두 끔 순환 */
  cycle() {
    if (this.enabled && this.musicOn) this.musicOn = false;
    else if (this.enabled) this.enabled = false;
    else { this.enabled = true; this.musicOn = true; }
    this.apply();
    if (this.prefs) this.save();
    return this.mode;
  }
  /** 켜짐·크기를 게인에 반영 (효과음·목소리·주변 소리 크기도) */
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, V = this.volume;
    this.master.gain.setTargetAtTime(this.enabled ? V.master : 0, t, 0.1);
    this.music.gain.setTargetAtTime(this.musicOn ? V.music : 0, t, 0.3);
    this.sfx?.gain.setTargetAtTime(V.sfx, t, 0.05);
    this.voiceBus?.gain.setTargetAtTime(V.sfx, t, 0.05);
    this.amb?.gain.setTargetAtTime(V.amb * this._ambK, t, 0.3);
    if (!this.enabled) { this.engineStop(true); this.reelStop(true); }
  }

  /** 집 안: 바깥 소리를 700Hz 저역통과 + -8dB 로 (나오면 되돌림) */
  setIndoor(on) {
    on = !!on;
    if (this._indoor === on) return;
    this._indoor = on;
    this._ambK = on ? dbToGain(-8) : 1;
    const c = this.ctx;
    if (!c || !this.ambLP) return;
    const t = c.currentTime;
    this.ambLP.frequency.setTargetAtTime(on ? 700 : 20000, t, 0.3);
    this.amb.gain.setTargetAtTime(this.volume.amb * this._ambK, t, 0.3);
  }

  /**
   * 자리가 있는 효과음: 플레이어에게서 멀수록 작게(1/(1+d/8)), 30m 밖은 내지 않음, 카메라 기준 좌우
   * @param o.minGain 경고 소리(늑대 등장 등)는 멀어도 이 크기 아래로 줄지 않음
   */
  playAt(name, x, z, vol = 1, o = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const { minGain = 0, ...opts } = o;
    const s = spatial(this.listener, x, z, minGain);
    if (!s) return;
    let out;
    if (s.pan && c.createStereoPanner) { out = c.createStereoPanner(); out.pan.value = s.pan; out.connect(this.sfx); }
    this.play(name, vol * s.gain, out ? { ...opts, out } : opts);
  }

  // ------------------------------------------------------------ 음악 낮추기 (덕킹)
  /**
   * 음악·환경음을 잠깐 낮춤. 여러 번 겹치면 가장 깊은 값, 가장 늦게 끝나는 것이 이김
   * @param db 낮출 크기(음수 dB). 0~1 사이 값이면 배율로 봄 (reward.js 의 duck(0.6, 1.5))
   * @param hold 유지 초
   */
  duck(db = -5, hold = 0.6) {
    const c = this.ctx;
    if (!c || !this.duckGain) return;
    if (db > 0 && db <= 1) db = 20 * Math.log10(db);
    this._ducks.set(++this._duckId, { db, until: c.currentTime + hold });
    this._applyDuck();
  }

  /** 계속 낮춤 (대화 중 등). 돌려준 함수를 부르면 풀림 */
  duckHold(db = -3) {
    const id = ++this._duckId;
    this._ducks.set(id, { db, until: Infinity });
    this._applyDuck();
    return () => { if (this._ducks.delete(id)) this._applyDuck(); };
  }

  /** 지금 살아 있는 낮춤 중 가장 깊은 값으로 (끝나는 시각에 다시 계산) */
  _applyDuck() {
    const c = this.ctx;
    if (!c || !this.duckGain) return;
    const t = c.currentTime;
    let db = 0, next = Infinity;
    for (const [id, d] of this._ducks) {
      if (d.until <= t) { this._ducks.delete(id); continue; }
      db = Math.min(db, d.db);
      if (d.until < next) next = d.until;
    }
    this.duckDb = db;
    const down = db < (this._duckNow ?? 0);
    this._duckNow = db;
    for (const [node, k] of [[this.duckGain, 1], [this.ambDuck, 0.6]]) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(dbToGain(db * k), t, down ? 0.04 : 0.25);
    }
    clearTimeout(this._duckTimer);
    // 멈춘 동안은 시계가 서 있으니 타이머를 다시 걸지 않음 (_resume 이 켜진 뒤 다시 부름)
    if (next < Infinity && c.state === 'running' && typeof setTimeout === 'function') { this._duckTimer = setTimeout(() => this._applyDuck(), (next - t) * 1000 + 20); this._duckTimer?.unref?.(); }
  }

  // ------------------------------------------------------------ 소리 재료
  /** play()·step() 안에서 만든 소리 재료(오실레이터·노이즈) 수 세기: 끝나면 줄어듦 */
  _track(src) {
    if (!this._inPlay) return;
    this._live++; this._made++;
    src.onended = () => { this._live = Math.max(0, this._live - 1); };
  }

  /** 이 소리를 내도 상한(소리 재료 수)을 넘지 않는가. 재료 수는 지난번에 센 값 (처음은 3) */
  _room(key) { return this._live + (this._cost[key] ?? 3) <= this.maxVoices; }

  /** 부드러운 톤: 어택 5ms, 지수 릴리즈, 저역통과, 잔향 센드 */
  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, { at = 0, rev = 0.25, lp = 6000, out, atk = 0.005 } = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    freq *= this._pm; slide *= this._pm; dur *= this._lm; vol *= this._vm;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.01));
    o.connect(f).connect(g);
    g.connect(out || this._out || this.sfx);
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(this.reverb); }
    this._track(o);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** 짧은 노이즈 (흙·물 질감). sweep: 필터 주파수를 이 값까지 미끄러뜨림, attack: 올라오는 시간 */
  noise(dur = 0.15, vol = 0.1, { type = 'bandpass', freq = 1200, q = 1, at = 0, out, sweep = 0, attack = 0.01 } = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    freq *= this._pm; sweep *= this._pm; dur *= this._lm; vol *= this._vm;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) { f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(sweep, t + dur); }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    s.connect(f).connect(g).connect(out || this._out || this.sfx);
    this._track(s);
    s.start(t, this.rng()); s.stop(t + dur + 0.05);
  }

  /** 칼림바/마림바 같은 맑은 음 (음악·효과음 공용) */
  pluck(freq, vol = 0.12, at = 0, out, dur = 0.9) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    freq *= this._pm; vol *= this._vm;
    const t = c.currentTime + at;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 4.01; // 금속성 배음
    g2.gain.setValueAtTime(vol * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(out || this._out || this.sfx);
    const s = c.createGain(); s.gain.value = 0.35; g.connect(s).connect(this.reverb);
    this._track(o);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + 0.2);
  }

  /** 같은 일을 2.5초 안에 이어 하면 오음계로 한 칸씩 올라감 (맨 위에서 멈춤). @returns 음 높이 배율 */
  combo(key, now = this.ctx?.currentTime ?? 0) {
    const s = this._combo[key];
    const i = s && now - s.t <= COMBO_WINDOW ? Math.min(s.i + 1, COMBO_STEPS.length - 1) : 0;
    this._combo[key] = { t: now, i };
    let r = COMBO_STEPS[i];
    const top = COMBO_TOP[key];
    if (top) for (let k = i; k > 0 && top * r > COMBO_CAP; k--) r = COMBO_STEPS[k - 1];
    return r;
  }

  /** 효과음. opts.freq: 음 높이를 바꿀 수 있는 소리('coin' 등)의 기준 음, opts.amount: 'sale' 금액 */
  play(name, vol = 1, opts = {}) {
    const c = this._ctx();
    if (!c || !this.enabled) return;
    const now = c.currentTime, key = opts.freq ? `${name}:${opts.freq}` : name;
    if (!KEEP.has(name)) {
      if (now - (this._lastAt[key] ?? -1) < 0.045) return; // 같은 소리가 한꺼번에 겹치지 않게 (음 높이가 다르면 다른 소리)
      if (!this._room(name)) return; // 소리 재료 수 상한 (낮은 품질 16, 그 밖 24)
    }
    this._lastAt[key] = now;
    const r = () => this.rng() * 2 - 1;
    let pm = 1, lm = 1;
    const vm = VARY_NONE.has(name) ? 1 : 1 + r() * 0.1;
    if (COMBO_TOP[name]) pm = this.combo(name, now);
    else if (VARY_PERC.has(name)) { pm = 1 + r() * 0.1; lm = 1 + r() * 0.1; }
    else if (!VARY_NONE.has(name)) pm = 1 + r() * 0.012;
    if (opts.pitch > 0) pm *= opts.pitch; // 동물마다 고정된 목소리 높이 (±6%)
    this._pm = pm; this._vm = vm; this._lm = lm; this._inPlay = true; this._made = 0; this._out = opts.out || null;
    try { this._sound(name, 0.16 * vol * (MIX[name] ?? 1), opts); } finally { this._pm = this._vm = this._lm = 1; this._inPlay = false; this._out = null; this._cost[name] = this._made; }
    const d = DUCK[name];
    if (d) this.duck(d[0], d[1]);
  }

  /** 소리 조리법 (v = 기준 크기) */
  _sound(name, v, opts) {
    switch (name) {
      // ---- 화면·대화
      case 'tap': return this.pluck(opts.freq || 2093, v * 0.35, 0, undefined, 0.07);
      // 대사 한 글자: 목소리 버스로
      case 'blip': return this.tone(opts.freq || 660, 0.05, 'triangle', v * 0.5, 0, { rev: 0.05, lp: 3000, out: this.voiceBus });
      case 'click': return this.pluck(1568, v * 0.45, 0, undefined, 0.18);
      case 'open': this.pluck(1175, v * 0.4, 0, undefined, 0.12); return this.pluck(1568, v * 0.4, 0.05, undefined, 0.16);
      case 'close': this.pluck(1568, v * 0.4, 0, undefined, 0.12); return this.pluck(1175, v * 0.4, 0.05, undefined, 0.16);
      // 안 됨: 부드러운 두 음이 내려감 (부딪힘 소리와 다름)
      case 'deny': this.tone(440, 0.12, 'sine', v * 0.6, 0, { rev: 0.08 }); return this.tone(370, 0.18, 'sine', v * 0.6, -10, { at: 0.11, rev: 0.08 });
      // ---- 도구 (폰 스피커에도 들리게 1.5~3kHz 짧은 어택을 얹음)
      case 'dig': this.noise(0.18, v * 1.2, { freq: 420, q: 0.8 }); this.noise(0.035, v * 1.8, { freq: 2200, q: 1.2 }); return this.tone(110, 0.16, 'triangle', v * 0.8, -40, { lp: 900, rev: 0.1 });
      case 'plant': this.noise(0.08, v * 0.5, { freq: 900 }); return this.pluck(784, v * 0.7, 0.05);
      case 'splash': this.noise(0.5, v * 1.1, { type: 'bandpass', freq: 850, q: 0.6 }); this.noise(0.35, v * 0.7, { type: 'highpass', freq: 3200, q: 0.4, at: 0.04 }); return this.tone(150, 0.2, 'sine', v * 0.5, -70, { rev: 0.15 });
      case 'stroke': return this.noise(0.2, v * 0.8, { type: 'bandpass', freq: 1100 + this.rng() * 700, q: 0.9 });
      case 'water': this.noise(0.35, v * 0.7, { type: 'highpass', freq: 2200, q: 0.4 }); this.pluck(1175, v * 0.4, 0.05, undefined, 0.3); return this.pluck(1568, v * 0.35, 0.14, undefined, 0.3);
      case 'harvest': this.pluck(784, v, 0); this.pluck(988, v, 0.08); return this.pluck(1319, v, 0.16);
      // 망치: 나무 두드림 + 딱 소리, 2~3번 (박자 조금씩 다르게)
      case 'hammer': {
        const n = opts.n || 2 + (this.rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const at = i * 0.17 + this.rng() * 0.03;
          this.tone(220, 0.09, 'triangle', v * 0.8, -60, { at, lp: 1400, rev: 0.12 });
          this.noise(0.025, v * 0.6, { freq: 1800, q: 1.5, at });
        }
        return;
      }
      // 나뭇잎 흔들림: 부스럭 두 번
      case 'rustle': this.noise(0.38, v * 0.9, { freq: 2500, q: 0.8, sweep: 1800, attack: 0.05 }); return this.noise(0.3, v * 0.7, { freq: 3200, q: 0.9, at: 0.12, attack: 0.04 });
      // 잡초 뽑기: 뿌리 뜯기 + 뽁
      case 'pull': this.noise(0.12, v * 0.9, { type: 'lowpass', freq: 700, q: 0.7 }); this.noise(0.05, v * 0.5, { freq: 2000, q: 1, at: 0.02 }); return this.pluck(659, v * 0.6, 0.09, undefined, 0.15);
      // 잠자리채 휙
      case 'swish': return this.noise(0.18, v * 0.9, { freq: 900, q: 1.2, sweep: 3600, attack: 0.06 });
      // 문: 삐걱 + 닫힘(툭)
      case 'door': this.tone(opts.close ? 260 : 300, 0.22, 'sawtooth', v * 0.12, opts.close ? -50 : 70, { lp: 900, rev: 0.1 }); this.tone(140, 0.12, 'sine', v * 0.7, -30, { at: 0.18, rev: 0.15 }); return this.noise(0.035, v * 1.6, { freq: 1800, q: 1.2, at: 0.18 });
      // 물리 부딪힘만 (안 됨은 'deny')
      case 'bump': this.noise(0.22, v * 0.8, { type: 'lowpass', freq: 300 }); this.noise(0.035, v * 3, { freq: 1800, q: 1.2 }); return this.tone(70, 0.25, 'sine', v * 0.6, -25, { rev: 0.05 });
      // 착지: 부드러운 툭
      case 'land': this.tone(120, 0.14, 'sine', v * 0.5, -40, { rev: 0.05 }); this.noise(0.1, v * 0.5, { type: 'lowpass', freq: 500, q: 0.7 }); return this.noise(0.03, v * 2.5, { freq: 1800, q: 1.2 });
      // 입질: 물방울 퐁 + 1.2kHz 째깍
      case 'bite': this.noise(0.12, v * 0.8, { freq: 900, q: 1.2, sweep: 500 }); this.tone(620, 0.09, 'sine', v * 0.7, -300, { rev: 0.15 }); return this.tone(1200, 0.03, 'triangle', v * 0.4, 0, { at: 0.06, rev: 0 });
      // 알림: 두 음 차임
      case 'alert': this.pluck(880, v * 0.7, 0, undefined, 0.4); return this.pluck(1175, v * 0.7, 0.13, undefined, 0.5);
      // 깜짝: 가벼운 뽁
      case 'startle': this.pluck(1175, v * 0.5, 0, undefined, 0.12); return this.noise(0.05, v * 0.4, { freq: 2400, q: 1 });
      // ---- 줍기·보상
      case 'coin': { const f = opts.freq || 1976; this.pluck(f, v * 0.7, 0, undefined, 0.35); return this.pluck(f * 1.335, v * 0.6, 0.07, undefined, 0.45); }
      // 작은 보상(1단계): 맑은 두 음 (주울 때)
      case 'pickup': this.pluck(1319, v * 0.7, 0, undefined, 0.3); return this.pluck(1760, v * 0.65, 0.07, undefined, 0.4);
      // 사기·넓히기: 계산대 두 음 + 동전 짤랑
      case 'buy': this.pluck(1568, v * 0.6, 0, undefined, 0.3); this.pluck(2093, v * 0.6, 0.08, undefined, 0.4); return this.noise(0.12, v * 0.5, { type: 'highpass', freq: 3000, q: 0.6, at: 0.14 });
      // 팔기: 금액에 따라 3단계 (작음: 코인 · 중간: + 높은 음 · 큼/모두 팔기: 세 음 + 반짝임)
      case 'sale': {
        const n = opts.amount ?? 0;
        if (opts.all || n >= 300) {
          [1568, 1976, 2637].forEach((f, i) => this.pluck(f, v * 0.75, i * 0.08, undefined, 0.5));
          return this.noise(0.4, v * 0.3, { type: 'highpass', freq: 6000, q: 0.5, at: 0.2 });
        }
        this.pluck(1976, v * 0.7, 0, undefined, 0.35); this.pluck(2637, v * 0.6, 0.07, undefined, 0.45);
        if (n >= 60) this.pluck(3136, v * 0.45, 0.15, undefined, 0.4);
        return;
      }
      case 'pop': return this.pluck(1319, v * 0.6, 0, undefined, 0.25);
      // 미니게임: 잡기(음 높이 opts.freq) · 연속 · 카운트 · 시작 · 별
      // 잡기·연속: 음 높이는 음악과 같은 오음계로 맞춤 (2.4kHz 아래)
      case 'catch': this.pluck(opts.freq ? snapPenta(opts.freq) : 988, v * 0.7, 0, undefined, opts.dur || 0.12); return this.noise(0.03, v * 0.25, { type: 'highpass', freq: 4000, q: 0.5 });
      case 'combo': return this.pluck(opts.freq ? snapPenta(opts.freq) : 1568, v * 0.7, 0, undefined, 0.2);
      case 'count': return this.pluck(opts.freq || 784, v * 0.7, 0, undefined, opts.dur || 0.2);
      case 'go': this.pluck(1568, v * 0.7, 0, undefined, 0.5); return this.pluck(2093, v * 0.45, 0.06, undefined, 0.45);
      case 'star': this.pluck(opts.freq || 1319, v * 0.7, 0, undefined, 0.3); return this.noise(0.2, v * 0.2, { type: 'highpass', freq: 6000, q: 0.5, at: 0.03 });
      // 중간 보상(2단계): 5도 차이 종 두 번 + 6kHz 반짝임
      case 'win': {
        const bell = (f, at) => { this.pluck(f, v, at, undefined, 1.4); this.tone(f * 2.76, 0.5, 'sine', v * 0.12, 0, { at, rev: 0.4 }); };
        bell(1046, 0); bell(1568, 0.16);
        return this.noise(0.5, v * 0.35, { type: 'highpass', freq: 6000, q: 0.5, at: 0.18 });
      }
      // 퀘스트 완료: 세 음 오름 + 반짝
      case 'quest': [784, 988, 1319].forEach((f, i) => this.pluck(f, v * 0.85, i * 0.09, undefined, 0.8)); return this.noise(0.35, v * 0.3, { type: 'highpass', freq: 6000, q: 0.5, at: 0.22 });
      // 큰 보상(3단계): 삼각파 바닥음 + 화음 패드 위로 오르는 여섯 음
      case 'levelup':
        this.tone(131, 1.6, 'triangle', v * 0.55, 0, { lp: 900, rev: 0.4 });
        for (const f of [262, 330, 392]) this.tone(f, 1.8, 'triangle', v * 0.16, 0, { at: 0.05, lp: 1800, rev: 0.6 });
        [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => this.pluck(f, v * 1.1, i * 0.07, undefined, 1.4));
        return this.noise(0.8, v * 0.25, { type: 'highpass', freq: 6000, q: 0.5, at: 0.42 });
      // 순간 이동: 노이즈가 400→1600Hz 로 쓸려 올라가고 맑은 음이 미끄러짐
      case 'warp': this.noise(0.5, v * 0.8, { freq: 400, q: 1.5, sweep: 1600, attack: 0.15 }); return this.tone(520, 0.5, 'sine', v * 0.5, 700, { rev: 0.4 });
      // ---- 탈것
      case 'engine': return this.tone(65, 0.7, 'sawtooth', v * 0.45, 30, { lp: 400, rev: 0.05 });
      // 시동: 털털 하다 올라가는 소리
      case 'ignite': this.tone(48, 0.55, 'sawtooth', v * 0.5, 50, { lp: 700, rev: 0.05 }); for (let i = 0; i < 3; i++) this.noise(0.04, v * 0.5, { freq: 1500, q: 1, at: i * 0.09 }); return;
      // 자전거 종: 따르릉 (높은 금속음 두 번, 살짝 떨림)
      case 'bell': for (const at of [0, 0.13]) { this.pluck(2637, v * 0.75, at, undefined, 0.5); this.pluck(3520, v * 0.35, at + 0.01, undefined, 0.35); } return;
      case 'thunder': this.noise(2.2, v * 2.2, { type: 'lowpass', freq: 180, q: 0.5 }); return this.noise(1.2, v * 1.4, { type: 'lowpass', freq: 600, q: 0.5, at: 0.1 });
      // ---- 동물
      case 'caw': this.tone(620, 0.16, 'sawtooth', v * 0.12, -260, { lp: 1800, rev: 0.2 }); return this.tone(560, 0.18, 'sawtooth', v * 0.1, -240, { lp: 1600, at: 0.22, rev: 0.2 });
      case 'howl': return this.tone(330, 1.6, 'sine', v * 0.18, 140, { lp: 1200, rev: 0.5 });
      case 'shoo': this.noise(0.25, v * 1.8, { type: 'bandpass', freq: 1800, q: 0.7 }); this.tone(180, 0.12, 'triangle', v * 0.4, -60, { rev: 0.05 }); return this.tone(170, 0.12, 'triangle', v * 0.4, -60, { at: 0.18, rev: 0.05 });
      case 'bark': this.tone(520, 0.09, 'square', v * 0.12, -200, { lp: 1500, rev: 0.1 }); return this.tone(480, 0.1, 'square', v * 0.1, -180, { lp: 1400, at: 0.16, rev: 0.1 });
      // 산여우: 짧은 깽깽 2~3번 · 낮은 으르렁
      case 'yip': { const n = opts.n || 2 + (this.rng() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) this._voc(900, 700, 0.07, { type: 'square', vol: v, forms: [[1250, 2, 1]], atk: 0.005, at: i * 0.13 }); return; }
      case 'growl': return this._voc(95, 82, 0.8, { vol: v, forms: [[320, 2, 1], [720, 3, 0.5]], vib: 60, vibRate: 22, atk: 0.09, lp: 1200 });
      // ---- 목장 동물 목소리 (opts.pitch: 동물마다 고정 높이)
      // 소: 톱니파 118→96Hz, 두 포먼트(600·1050Hz), 천천히 올라옴
      case 'moo': return this._voc(118, 96, 0.75, { vol: v, forms: [[600, 3, 1], [1050, 5, 0.5]], vib: 8, vibRate: 5, atk: 0.08 });
      // 양: 300Hz 에 7Hz 떨림
      case 'baa': return this._voc(310, 290, 0.5, { vol: v, forms: [[750, 4, 1], [1900, 6, 0.5]], vib: 45, vibRate: 7, atk: 0.03 });
      // 닭: 900Hz 짧은 꼬꼬 세 번
      case 'cluck': for (const [at, k] of [[0, 1], [0.09, 0.8], [0.22, 0.9]]) this._voc(900, 700, 0.045, { type: 'square', vol: v * k, forms: [[1100, 3, 1]], atk: 0.004, at }); return;
      // 말: 500→340Hz 에 9Hz 떨림
      case 'neigh': return this._voc(520, 340, 0.85, { vol: v, forms: [[900, 4, 1], [2100, 6, 0.4]], vib: 70, vibRate: 9, atk: 0.04 });
      // 당나귀: 높낮이 번갈아 두 번 (이-아 이-아)
      case 'heehaw': for (const [at, f] of [[0, 420], [0.28, 190], [0.56, 420], [0.84, 190]]) this._voc(f, f * 0.92, 0.26, { vol: v, forms: [[800, 3, 1], [1600, 5, 0.4]], atk: 0.03, at }); return;
      // 알파카: 부드러운 콧노래
      case 'hum': return this.tone(320, 0.45, 'sine', v, 18, { rev: 0.15, lp: 2000, atk: 0.06 });
      // 빗질: 2.5→4kHz 쓸어 올리는 솔 소리 세 번 (0.38초 간격, 털 날림과 같은 박자)
      case 'bristle': for (let k = 0; k < 3; k++) this.noise(0.24, v, { type: 'bandpass', freq: 2500, q: 1.2, sweep: 4000, attack: 0.05, at: k * 0.38 }); return;
      // 축제: 실로폰 도·미·솔·도 + 손북 두 번
      case 'fest':
        [1047, 1319, 1568, 2093].forEach((f, i) => { this.tone(f, 0.5, 'sine', v * 0.7, 0, { at: i * 0.11, rev: 0.35 }); this.tone(f * 2.76, 0.15, 'sine', v * 0.12, 0, { at: i * 0.11, rev: 0.2 }); });
        for (const at of [0, 0.33]) this.tone(170, 0.16, 'sine', v * 0.8, -60, { at, lp: 800, rev: 0.1 });
        return;
      // 벌 윙윙
      case 'buzz': return this.tone(220 + this.rng() * 40, 0.25, 'sawtooth', v * 0.5, 10, { lp: 700, rev: 0.05 });
      // 콩이 춤 노래: 한 음씩 (opts.k 번째)
      case 'tune': return this.pluck([784, 988, 1175, 988, 1319][(opts.k ?? 0) % 5], v * 0.7, 0, undefined, 0.12);
      // ---- 생활
      // 먹기: 아삭 두 번 + 작은 퉁김
      case 'eat': this.noise(0.04, v, { freq: 2200, q: 1.4 }); this.noise(0.04, v * 0.85, { freq: 2000, q: 1.4, at: 0.12 }); return this.pluck(659, v * 0.35, 0.2, undefined, 0.15);
      // 모이 뿌리기: 작은 째깍 7번이 0.3초에 흩어짐
      case 'scatter': for (let i = 0; i < 7; i++) this.noise(0.012, v * (0.7 + this.rng() * 0.3), { type: 'highpass', freq: 3500, q: 0.6, at: i * 0.045 + this.rng() * 0.02 }); return;
      // 잠들기: 오음계 세 음이 내려감 (솔·미·도)
      case 'sleep': return [784, 659, 523].forEach((f, i) => this.pluck(f, v * 0.8, i * 0.25, undefined, 0.9));
      // 아침: 오음계 네 음이 올라가고 새 두 번
      case 'morning':
        [523, 659, 784, 1046].forEach((f, i) => this.pluck(f, v * 0.75, i * 0.14, undefined, 0.9));
        this.tone(3200, 0.08, 'sine', v * 0.12, 600, { at: 0.7, rev: 0.3 });
        return this.tone(3500, 0.07, 'sine', v * 0.1, 500, { at: 0.82, rev: 0.3 });
    }
  }

  /**
   * 목소리 재료: 파형 → 포먼트(띠통과 여러 개) → 엔벨로프 (동물 울음)
   * @param o.forms [[주파수, Q, 크기], …] · o.vib 떨림(센트) · o.vibRate 떨림 빠르기
   */
  _voc(f0, f1, dur, { type = 'sawtooth', vol = 0.1, at = 0, forms = [[800, 3, 1]], vib = 0, vibRate = 6, atk = 0.03, lp = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    f0 *= this._pm; f1 *= this._pm; dur *= this._lm; vol *= this._vm;
    const t = c.currentTime + at;
    const o = c.createOscillator(), env = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    if (vib) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = vibRate; lg.gain.value = vib;
      lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + atk);
    env.gain.setValueAtTime(vol, t + Math.max(atk, dur * 0.6));
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.02));
    for (const [f, q, k] of forms) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * Math.sqrt(this._pm); bp.Q.value = q;
      const fg = c.createGain(); fg.gain.value = k;
      o.connect(bp).connect(fg).connect(env);
    }
    let tail = env;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; env.connect(f); tail = f; }
    tail.connect(this._out || this.sfx);
    const s = c.createGain(); s.gain.value = 0.12; tail.connect(s).connect(this.reverb);
    this._track(o);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ 발소리
  /**
   * 발소리 한 번. 소리 장치를 새로 만들거나 켜지 않음 (켜져 있을 때만)
   * @param kind 'grass' | 'dirt' | 'wood' | 'floor' | 'snow' | 'stone'
   * @param s 빠르기 0..1 (달리면 큼)
   * @param gain 추가 배율 (자동 놀이 0.6 등)
   * @param o.left 왼발이면 true, 오른발 false (없으면 좌우 번갈아)
   * @param o.wet 비 오는 날 흙·풀: 찰박 물 소리를 얹음
   * @param o.remote 다른 플레이어 발소리
   */
  step(kind = 'grass', s = 1, gain = 1, o = {}) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.enabled || this.hold) return;
    const now = c.currentTime;
    // 90ms 안 두 번째는 건너뜀 (다른 플레이어 발소리는 따로 세어 내 발소리를 막지 않게)
    const sk = o.remote ? '_stepAtR' : '_stepAt';
    if (now - (this[sk] ?? -1) < 0.09) return;
    if (!this._room('step')) return;
    this[sk] = now;
    // 디딘 발 쪽 (모르면 번갈아). 패너가 없는 브라우저는 가운데
    this._stepPan = o.left === undefined ? -this._stepPan : (o.left ? -0.1 : 0.1);
    let out = this.sfx;
    if (c.createStereoPanner) { out = c.createStereoPanner(); out.pan.value = this._stepPan; out.connect(this.sfx); }
    const r = () => this.rng() * 2 - 1;
    const v = (STEP_MIX[kind] ?? STEP_MIX.grass) * 0.16 * (0.6 + 0.4 * Math.max(0, Math.min(1, s))) * gain * dbToGain(r() * 1.5);
    this._pm = 1 + r() * 0.07; this._inPlay = true; this._made = 0;
    try {
      switch (kind) {
        case 'dirt': this.noise(0.065, v * 1.3, { freq: 800, q: 1.0, out }); this.noise(0.04, v * 0.5, { type: 'lowpass', freq: 400, q: 0.7, out }); break;
        // 나무·마루: 낮은 노이즈 '똑' + 1.4kHz 딱 + 아주 짧은 몸통음(미끄러짐 없음)
        case 'wood': this.noise(0.025, v * 2.2, { freq: 320, q: 2, attack: 0.003, out }); this.noise(0.012, v * 0.7, { freq: 1400, q: 2, attack: 0.002, out }); this.tone(260, 0.018, 'sine', v * 0.5, 0, { rev: 0, lp: 1200, out }); break;
        case 'floor': this.noise(0.022, v * 2, { freq: 380, q: 2, attack: 0.003, out }); this.noise(0.01, v * 0.6, { freq: 1400, q: 2, attack: 0.002, out }); this.tone(300, 0.015, 'sine', v * 0.4, 0, { rev: 0.05, lp: 1200, out }); break;
        case 'snow': this.noise(0.13, v * 1.3, { freq: 2800, q: 0.9, attack: 0.025, out }); this.noise(0.05, v * 0.4, { type: 'lowpass', freq: 450, q: 0.7, out }); break;
        case 'stone': this.noise(0.025, v * 1.2, { freq: 2400, q: 1.5, out }); this.tone(600, 0.03, 'triangle', v * 0.6, 0, { rev: 0, lp: 2000, out }); break;
        default: this.noise(0.04, v * 1.1, { freq: 1700, q: 0.9, out }); this.noise(0.05, v * 0.5, { type: 'lowpass', freq: 450, q: 0.7, out }); break; // grass
      }
      // 젖은 땅: 1.2kHz 찰박 (-6dB 쯤)
      if (o.wet && (kind === 'dirt' || kind === 'grass')) this.noise(0.06, v * 0.6, { freq: 1200, q: 1.2, attack: 0.004, out });
    } finally { this._pm = 1; this._inPlay = false; this._cost.step = this._made; }
  }

  // ------------------------------------------------------------ 탈것 엔진 (계속 나는 소리)
  /** 엔진 켜기 (여러 번 불러도 하나). kind: 'tractor' | 'cart' (털털 엔진) · 'bike' (바퀴 구르는 소리) */
  engineStart(kind = 'tractor') {
    const c = this.ctx;
    if (!c || this.hold || !this.enabled) return;
    if (this._eng) { if (this._eng.kind === kind) return; this.engineStop(true); }
    const t = c.currentTime;
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.connect(this.sfx);
    const e = { kind, out, nodes: [out], srcs: [], setAt: -1, tickAt: t };
    if (kind !== 'bike') {
      // 톱니파 둘(+1.5% 어긋남) + 한 옥타브 아래 사각파(0.3) → 저역통과 800Hz Q1.2 → 털털(7→14Hz 떨림, 밝기도 ±150Hz) → 출력
      const f0 = kind === 'cart' ? 85 : 70;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f0; o2.detune.value = 26; // +1.5%
      const sub = c.createOscillator(); sub.type = 'square'; sub.frequency.value = f0 / 2;
      const subG = c.createGain(); subG.gain.value = 0.3;
      const mix = c.createGain(); mix.gain.value = 0.6;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 1.2;
      const amp = c.createGain(); amp.gain.value = 0.7;
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7;
      const depth = c.createGain(); depth.gain.value = 0.3;
      const cut = c.createGain(); cut.gain.value = 150;
      lfo.connect(depth).connect(amp.gain);
      lfo.connect(cut).connect(lp.frequency);
      o.connect(mix); o2.connect(mix); sub.connect(subG).connect(mix);
      mix.connect(lp).connect(amp).connect(out);
      Object.assign(e, { o, o2, sub, lfo, lp, f0, s: 0, sAt: t });
      e.nodes.push(o, o2, sub, subG, mix, lp, amp, lfo, depth, cut); e.srcs.push(o, o2, sub, lfo);
      for (const x of [o, o2, sub, lfo]) x.start(t);
    }
    // 노이즈 층: 트랙터는 쟁기질(500Hz), 자전거는 바퀴 굴러가는 소리(저역)
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = kind === 'bike' ? 'lowpass' : 'bandpass'; nf.frequency.value = kind === 'bike' ? 700 : 500; nf.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = 0;
    n.connect(nf).connect(ng).connect(out);
    e.noiseGain = ng; e.nodes.push(n, nf, ng); e.srcs.push(n);
    n.start(t);
    // 시동을 건 순간부터 공회전 크기
    out.gain.setTargetAtTime(this._engLevel(kind, 0), t, 0.15);
    this._eng = e;
  }

  _engLevel(kind, s) {
    if (kind === 'bike') return 0.0001 + 0.03 * s;
    return 0.16 * (0.19 + 0.21 * s); // 최고 속도 ≈ -26dB, 공회전 ≈ -30dB
  }

  /**
   * 엔진 따라가기 (초당 10번까지만 반영)
   * @param speed01 빠르기 0..1
   * @param plowing 쟁기질 중 (트랙터) · 자전거는 페달을 안 밟고 굴러가는 중(프리휠)
   */
  engineSet(speed01, plowing = false) {
    const c = this.ctx, e = this._eng;
    if (!c || !e) return;
    const t = c.currentTime;
    if (t - e.setAt < 0.1) return;
    e.setAt = t;
    const s = Math.max(0, Math.min(1, speed01));
    e.out.gain.setTargetAtTime(this._engLevel(e.kind, s), t, 0.08);
    if (e.kind === 'bike') {
      e.noiseGain.gain.setTargetAtTime(s > 0.05 ? 0.5 + s : 0, t, 0.08);
      // 프리휠 따르르: 굴러가는 빠르기만큼 짧은 째깍 (다음 0.1초 분량)
      if (plowing && s > 0.08) {
        const rate = 6 + s * 10;
        if (e.tickAt < t) e.tickAt = t;
        while (e.tickAt < t + 0.1) {
          this.tone(2400, 0.006, 'triangle', 0.16 * 0.07 * (0.5 + s), 0, { at: e.tickAt - t, rev: 0, lp: 4000 });
          e.tickAt += 1 / rate;
        }
      }
      return;
    }
    const f = e.f0 + 35 * s;
    e.o.frequency.setTargetAtTime(f, t, 0.08);
    e.o2.frequency.setTargetAtTime(f, t, 0.08);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
    // 털털 빠르기를 ±0.5Hz 흔들어 기계처럼 고르지 않게
    e.lfo.frequency.setTargetAtTime(7 + 7 * s + (this.rng() * 2 - 1) * 0.5, t, 0.08);
    // 밟으면(0.3초 안에 빠르기 +0.2) 짧은 '푸흣'
    if (t - e.sAt > 0.3) { if (s - e.s > 0.2) this.noise(0.12, 0.8, { type: 'lowpass', freq: 600, q: 0.8, out: e.out }); e.s = s; e.sAt = t; }
    e.lp.frequency.setTargetAtTime(800 + 400 * s, t, 0.08);
    e.noiseGain.gain.setTargetAtTime(plowing && s > 0.1 ? 0.6 : 0, t, 0.08);
  }

  /** 엔진 끄기: 0.25초 동안 줄이고 멈춘 뒤 연결을 끊음 (now: 바로) */
  engineStop(now = false) {
    const c = this.ctx, e = this._eng;
    if (!e) return;
    this._eng = null;
    const t = c?.currentTime ?? 0, end = now ? 0.02 : 0.25;
    try { e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(0, t, end / 4); } catch { /* 이미 끊김 */ }
    for (const s of e.srcs) { try { s.stop(t + end + 0.05); } catch { /* 이미 멈춤 */ } }
    const off = () => { for (const n of e.nodes) { try { n.disconnect(); } catch { /* 이미 끊김 */ } } };
    if (e.srcs[0]) e.srcs[0].onended = off; else off();
  }

  // ------------------------------------------------------------ 낚싯줄 감는 소리
  /** 릴 째깍째깍: 째깍 묶음 버퍼 하나를 반복 재생, 빠르기는 playbackRate (0 이면 조용히) */
  reel(rate) {
    const c = this.ctx;
    if (!c || this.hold || !this.enabled) return;
    if (!this._reel) {
      if (!(rate > 0)) return;
      if (!this._reelBuf) {
        const sr = c.sampleRate, len = Math.round(sr), b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
        for (let k = 0; k < 10; k++) { // 1초에 10번 째깍 (2.8kHz 짧은 울림)
          const s0 = Math.round((k / 10) * len);
          for (let i = 0; i < sr * 0.006 && s0 + i < len; i++) d[s0 + i] = Math.sin((i / sr) * 2 * Math.PI * 2800) * Math.exp(-i / (sr * 0.0015)) * (0.8 + 0.2 * Math.sin(k * 2.1));
        }
        this._reelBuf = b;
      }
      const s = c.createBufferSource(); s.buffer = this._reelBuf; s.loop = true;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(g).connect(this.sfx); s.start();
      this._reel = { s, g };
    }
    const t = c.currentTime, R = this._reel;
    // 째깍 음 높이가 날카로워지지 않게 재생 속도는 0.8~1.25 만
    R.s.playbackRate.setTargetAtTime(Math.max(0.8, Math.min(1.25, rate || 0.8)), t, 0.05);
    R.g.gain.setTargetAtTime(rate > 0 ? 0.16 * 0.35 : 0, t, 0.04);
  }

  reelStop() {
    const R = this._reel;
    if (!R) return;
    this._reel = null;
    try { R.s.stop(); R.s.disconnect(); R.g.disconnect(); } catch { /* 이미 멈춤 */ }
  }
}
