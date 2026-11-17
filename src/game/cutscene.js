import * as THREE from 'three';
import { SURF } from './surface.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 대화 구도 거리: 두 인물 사이 d(m), 카메라 세로 시야각·화면비
 * 세로 폰처럼 가로 시야가 좁으면 두 인물(+몸 폭 여유)이 화면 안에 들도록 필요한 만큼만 물러남 (가로 화면은 기존 거리 그대로)
 */
export function talkDistance(d, fov, aspect = 1) {
  const tanH = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect;
  return Math.max(4.6 + d * 0.9, Math.min((d / 2 + 0.8) / Math.max(0.15, tanH), 10));
}

/** 아래쪽 대화창이 두 인물의 얼굴을 가리지 않게 시선을 낮춰 인물을 화면 위쪽에 둠 (가로 화면도 0.7 — 선택지까지 펼친 대화창이 화면 아래 약 58%) */
export function talkLookDrop(aspect = 1) {
  return aspect < 1 ? Math.min(1.7, Math.max(0.7, (1 - aspect) * 3.2)) : 0.7;
}

/** 두 인물을 담는 대화 구도 { pos, look }: 지금 카메라가 있는 쪽에서 어깨 너머 살짝 비스듬히 */
export function talkShot(a, b, camPos, fov, aspect = 1) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
  const nx = -dz / d, nz = dx / d; // 두 사람을 잇는 선의 옆 방향
  const side = (camPos.x - mx) * nx + (camPos.z - mz) * nz >= 0 ? 1 : -1;
  const dist = talkDistance(d, fov, aspect);
  return {
    pos: [mx + nx * side * dist - (dx / d) * 1.2, 2.5, mz + nz * side * dist - (dz / d) * 1.2],
    look: [mx, 1.1 - talkLookDrop(aspect), mz],
  };
}

const DEG = Math.PI / 180;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 화면 가로 위치(NDC x, -1~1): pos 에서 look 을 보는 카메라(위 = +Y)에 점 (p.x, y, p.z) 가 어디에 보이나 */
export function ndcX(pos, look, p, y, fov, aspect) {
  let fx = look[0] - pos[0], fy = look[1] - pos[1], fz = look[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  const rl = Math.hypot(fx, fz) || 1, rx = -fz / rl, rz = fx / rl; // 오른쪽 = 앞 × 위
  const vx = p.x - pos[0], vy = y - pos[1], vz = p.z - pos[2];
  const z = vx * fx + vy * fy + vz * fz;
  return z > 0.05 ? (vx * rx + vz * rz) / (z * Math.tan((fov * DEG) / 2) * aspect) : Infinity;
}

/**
 * 말하는 쪽 얼굴을 3/4 앞에서 잡는 대화 구도 { pos, look, lift, theta, side, dist, sep }
 *  - 말하는 쪽(speaker)이 듣는 쪽(listener, 보통 나)을 본다고 보고, 그 정면에서 theta 만큼 옆(side = ±1)으로 돈 곳 D(m)에 카메라
 *    → 말하는 얼굴은 theta 만큼만 비스듬히, 듣는 쪽은 화면 가장자리에 3/4 뒷모습 (뒤통수가 가운데를 덮지 않음)
 *  - 시선은 말하는 얼굴에서 듣는 얼굴 쪽으로 lookMix, 카메라는 얼굴보다 조금 위(camY): 거의 수평 → 대화창 위로는 렌즈 올림(lift, Cinematics)
 *  - 세로 폰: 두 얼굴이 가로 |x| < fit 안에 들 때까지 물러남 (maxD 까지). faceL 이 null 이면 말하는 쪽만 맞춤 (반려견 가까이 찍기)
 *  sep = 두 얼굴의 가로 간격 (화면 너비 비율)
 */
export function speakerShot(listener, speaker, side = 1, {
  theta = 35 * DEG, D = 4.2, maxD = 6, camY = 1.6, lookY = 1.25, lookMix = 0.3, faceS = 1.3, faceL = 1.35, fov = 45, aspect = 1.6, fit = 0.8,
} = {}) {
  const fx = listener.x - speaker.x, fz = listener.z - speaker.z, d = Math.hypot(fx, fz) || 1;
  const ux = fx / d, uz = fz / d, nx = -uz * side, nz = ux * side;
  const dx = ux * Math.cos(theta) + nx * Math.sin(theta), dz = uz * Math.cos(theta) + nz * Math.sin(theta);
  const look = [speaker.x + fx * lookMix, lookY, speaker.z + fz * lookMix];
  let dist = D, pos, xs, xl;
  for (;;) {
    pos = [speaker.x + dx * dist, camY, speaker.z + dz * dist];
    xs = ndcX(pos, look, speaker, faceS, fov, aspect);
    xl = faceL == null ? 0 : ndcX(pos, look, listener, faceL, fov, aspect);
    if (dist >= maxD || (Math.abs(xs) < fit && Math.abs(xl) < fit)) break;
    dist = Math.min(maxD, dist + 0.2);
  }
  return { pos, look, lift: true, theta, side, dist, sep: faceL == null ? 1 : Math.abs(xs - xl) / 2 };
}

/** 몸을 상대(to) 쪽에서 카메라 쪽으로 amount(rad) 만큼만 살짝 돌린 방향 (yaw = atan2(dx, dz)) — 화면에서 얼굴이 더 보이게 */
export function cheatYaw(from, to, cam, amount) {
  const y0 = Math.atan2(to.x - from.x, to.z - from.z), yc = Math.atan2(cam[0] - from.x, cam[2] - from.z);
  return y0 + Math.max(-amount, Math.min(amount, wrapA(yc - y0)));
}

/** 카메라에서 본 몸 방향 차이(도): 0 = 정면, 90 = 옆모습 */
export function facingAngle(yaw, at, cam) {
  return Math.abs(wrapA(Math.atan2(cam[0] - at.x, cam[2] - at.z) - yaw)) / DEG;
}

/** 캐릭터·반려견·좌표의 바닥 위치 {x, z} */
export function posOf(o) {
  if (!o) return null;
  const p = o.group?.position ?? o.e?.m?.position ?? o.position ?? o;
  return p && typeof p.x === 'number' ? p : null;
}
const isPet = (o) => !!o?.e?.m && !o.group;
/** 얼굴 높이(m): 반려견 0.45, 주민은 몸 크기만큼 */
export const faceY = (o) => (isPet(o) ? 0.45 : 1.3 * (o?.scale ?? 1));

/**
 * 말하는 쪽 얼굴 구도 { face } 스텝 → { pos, look, lift, yaw } (그 순간 위치로)
 *  - with: 함께 담을 상대 (보통 나) → 두 사람 구도, 말하는 쪽 얼굴이 3/4 앞
 *  - toward: [x, z] 소개하는 곳 → 그곳을 등지고 카메라 쪽을 보는 구도 (뒤로 그곳이 보임)
 *  - 둘 다 없으면 지금 바라보는 쪽 2.5m 앞을 상대로
 *  - avoid: 화면 밖으로 빼고 싶은 인물, blocked(x, z): 건물·소품 자리인가 (가리지 않는 각도·쪽을 고름)
 *  yaw = 말하는 쪽 몸 방향 (카메라 쪽으로 돌림)
 */
export function faceShot(step, camPos, fov = 45, aspect = 1.6, blocked = null) {
  const who = step.face, S = posOf(who);
  if (!S) return null;
  const pet = isPet(who), fS = faceY(who);
  let L, faceL = null, theta = 30 * DEG, cheat = 60 * DEG;
  const W = step.with && posOf(step.with);
  if (W && Math.hypot(W.x - S.x, W.z - S.z) > 0.3) { L = W; faceL = faceY(step.with); theta = 35 * DEG; cheat = 20 * DEG; }
  else if (step.toward) {
    const dx = step.toward[0] - S.x, dz = step.toward[1] - S.z, d = Math.hypot(dx, dz) || 1;
    L = { x: S.x - (dx / d) * 2.5, z: S.z - (dz / d) * 2.5 };
  } else {
    const f = who.facing ?? who.e?.m?.rotation.y ?? 0;
    L = { x: S.x + Math.sin(f) * 2.5, z: S.z + Math.cos(f) * 2.5 };
  }
  // 지금 카메라가 있는 쪽으로 (반대쪽으로 크게 돌지 않게)
  const fx = L.x - S.x, fz = L.z - S.z, fd = Math.hypot(fx, fz) || 1;
  const side = (camPos.x - S.x) * (-fz / fd) + (camPos.z - S.z) * (fx / fd) >= 0 ? 1 : -1;
  const tall = aspect < 1;
  if (pet) cheat = 50 * DEG; // 반려견은 고개를 카메라 쪽으로 많이 (올려다보는 강아지)
  const opts = pet
    ? { theta: 60 * DEG, D: 2.6, maxD: 3.6, camY: 0.95, lookY: 0.45, lookMix: 0.15, faceS: fS, faceL: null }
    : { theta, D: faceL ? (tall ? 5.0 : 4.4) : tall ? 6.0 : 5.4, maxD: 7, camY: fS + 0.35, lookY: faceL ? fS * 0.7 + faceL * 0.3 - 0.05 : fS - 0.1, lookMix: faceL ? 0.3 : 0, faceS: fS, faceL, fit: tall ? 0.75 : 0.8 };
  // 후보: 지금 카메라 쪽 → 반대쪽, 각도 그대로 → ±20° → +40°. 점수 = 건물·소품 가림(blocked: 카메라 자리와 카메라→얼굴 선) + avoid 인물이 화면에 걸림
  const A = step.avoid && posOf(step.avoid);
  const score = (sh) => {
    let n = 0;
    if (blocked) {
      if (blocked(sh.pos[0], sh.pos[2])) n += 3;
      const L0 = Math.hypot(S.x - sh.pos[0], S.z - sh.pos[2]) || 1, tMax = Math.max(0, 1 - 1.3 / L0); // 말하는 쪽 1.3m 안(자기 자리)은 빼고
      for (let k = 1; k <= 8; k++) { const t = (k / 8) * tMax; if (blocked(sh.pos[0] + (S.x - sh.pos[0]) * t, sh.pos[2] + (S.z - sh.pos[2]) * t)) n += 2; }
    }
    if (A && Math.abs(ndcX(sh.pos, sh.look, A, faceY(step.avoid), fov, aspect)) < 1.1) n += 5;
    return n;
  };
  let sh = null, best = Infinity;
  // toward 인데 그쪽이 다 막히면 마지막으로 소개하는 곳 쪽에서 (그곳은 카메라 뒤로 빠지지만 얼굴은 보임)
  const Ls = step.toward && blocked ? [L, { x: 2 * S.x - L.x, z: 2 * S.z - L.z }] : [L];
  search: for (const LL of Ls) for (const sd of [side, -side]) for (const dt of [0, 20, -20, 40]) {
    const th = opts.theta + dt * DEG;
    if (th < 5 * DEG) continue;
    const c = speakerShot(LL, S, sd, { ...opts, theta: th, fov, aspect }), n = score(c);
    if (n < best) { best = n; sh = c; sh.L = LL; }
    if (n === 0) break search;
  }
  return { pos: sh.pos, look: sh.look, lift: true, yaw: cheatYaw(S, sh.L ?? L, sh.pos, cheat) };
}

/**
 * 렌즈 올림(카메라 view offset): 얼굴을 위 HUD 아래와 대화창 윗변 사이 빈 띠의 FACE_AT 지점에 둠 → 고개를 숙이지 않고도 얼굴이 대화창 위
 * boxTop = 대화창 윗변, hud = 위 HUD 아랫변 (둘 다 화면 위에서 비율). 반환 = 화면 높이 비율 (양수면 장면이 위로)
 */
export const FACE_AT = 0.42, LIFT_MAX = 0.36;
export function liftFor(boxTop, hud = HUD_PX / 800) {
  const t = Math.min(1, Math.max(0.2, boxTop)), h = Math.min(0.24, Math.max(0, hud));
  return Math.min(LIFT_MAX, Math.max(0, 0.5 - (h + (t - h) * FACE_AT)));
}
/** 위 HUD(돈·시간 줄 + 할 일 칩)가 차지하는 높이(px): 화면이 낮을수록 비율이 커짐 */
export const HUD_PX = 80;
export const hudFrac = (h = typeof innerHeight === 'number' ? innerHeight : 800) => HUD_PX / Math.max(1, h);
export const guessBoxTop = (aspect) => (aspect < 1 ? 0.4 : 0.45);

/**
 * 연출 카메라 + 컷신
 *  - 따라가기 카메라 위에 '연출 샷'을 섞어 씀(blend 0→1→0) → 대화·컷신 진입/종료가 부드럽게 이어짐
 *  - shot(): 지정 위치·시선으로 이징 이동, orbit 으로 천천히 도는 샷
 *  - play(steps): 위아래 영화 띠 + 건너뛰기 + 순서대로 카메라 이동·대사·대기·동작
 */
export class Cinematics {
  constructor(game, root) {
    this.game = game;
    this.blend = 0; this.want = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.t = 1; this.dur = 1;
    this.orbit = 0;
    this.locked = false; // 컷신 중: 이동·상호작용 막음
    this._fp = new THREE.Vector3(); this._fl = new THREE.Vector3();
    // 영화 띠 + 건너뛰기
    this.bars = document.createElement('div');
    this.bars.className = 'cine-bars';
    this.bars.innerHTML = '<i class="top"></i><i class="bot"></i><button class="cine-skip">건너뛰기 ▶▶</button>';
    root.append(this.bars);
    this.bars.querySelector('.cine-skip').onclick = () => { this.skipping = true; this.game.dialogue?.skipAll(); };
  }

  get active() { return this.want > 0 || this.blend > 0.001; }

  /**
   * 연출 샷으로 이동 (현재 카메라 위치에서 이어서)
   * lift: 렌즈 올림 — true 면 대화창 윗변을 재서 얼굴이 그 위에 오게 (대화·반려견 구도만), 숫자면 그만큼, 0 이면 없음 (컷신 샷)
   */
  shot(pos, look, dur = 1.2, { orbit = 0, lift = 0 } = {}) {
    const cam = this.game.camera;
    if (this.blend < 0.01) { this.pos.copy(cam.position); this.look.copy(this.game.followCam.smooth); }
    this.from.pos.copy(this.pos); this.from.look.copy(this.look);
    this.to.pos.set(...pos); this.to.look.set(...look);
    this.t = 0; this.dur = Math.max(0.01, dur); this.orbit = orbit;
    this.t0 = performance.now(); // 이동 진행은 실제 경과 시간 기준 (wait() 와 같은 시계)
    this.want = 1;
    this.liftAuto = lift === true;
    this.liftWant = this.liftAuto ? liftFor(guessBoxTop(cam.aspect), hudFrac()) : Math.max(0, +lift || 0);
    this._liftT = 0; this._liftSeen = 0;
    this._liftFast = !this.liftWant && !!this.lensOn; // 올린 대화 바로 뒤 컷신 샷: 남은 올림을 3배 빨리 걷음
  }

  /** 두 인물을 담는 대화 구도 (어깨 너머 살짝 비스듬히, 옛 구도 — 컷신용) */
  focusTalk(a, b) {
    const camera = this.game.camera;
    const { pos, look } = talkShot(a, b, camera.position, camera.fov, camera.aspect);
    this.shot(pos, look, 0.7);
  }

  /** 대화 중 이름표·표시 숨길 캐릭터 (머리 위 이름표가 대화 구도를 가리지 않게) */
  hideLabelsOf(...unicos) { this.hidden = unicos.filter(Boolean); }

  /** 대화 동안 몸 방향 고정: u.faceLock 을 npcs.update 가 지킴 (플레이어 쪽으로 다시 돌리지 않음). release() 가 모두 풂 */
  faceLock(u, yaw) {
    if (!u) return;
    u.faceLock = yaw;
    u.facing = yaw;
    (this.locks ||= new Set()).add(u);
  }

  /** 연출 끝: 따라가기 카메라로 돌아감 (렌즈 올림은 섞임과 함께 줄다가 0 이 되면 update 가 지움) */
  release() {
    this.want = 0;
    this.liftAuto = false;
    this.liftWant = 0;
    for (const u of this.hidden || []) if (u.labelAlways && u.label) u.label.visible = true;
    this.hidden = null;
    for (const u of this.locks || []) u.faceLock = null;
    this.locks?.clear();
  }

  /** 지금 보이는 대화창 윗변 (화면 위에서 비율), 없으면 null */
  _boxTop() {
    const el = this.game.dialogue?.el;
    if (!el || el.classList?.contains('hidden') || typeof innerHeight === 'undefined') return null;
    const r = el.getBoundingClientRect?.();
    return r && r.height > 0 ? r.top / innerHeight : null;
  }

  /** 렌즈 올림 적용: 섞임 정도만큼 (카메라 화면비·시야각은 그대로, 0 이 되면 지움) */
  _lens(dt) {
    if (this.liftAuto && (this._liftT -= dt) <= 0) {
      this._liftT = 0.2; // 0.2초마다 대화창을 다시 잼 (선택지가 펼쳐지면 위로만 따라감 → 출렁이지 않게)
      const top = this._boxTop();
      if (top != null) this.liftWant = this._liftSeen = Math.max(this._liftSeen, liftFor(top, hudFrac()));
    }
    this.lift = (this.lift || 0) + ((this.liftWant || 0) - (this.lift || 0)) * (1 - Math.exp(-dt * (this._liftFast ? 18 : 6)));
    const v = this.lift * easeInOut(Math.min(1, this.blend)), cam = this.game.camera;
    if (v > 1e-4) {
      cam.setViewOffset(cam.aspect, 1, 0, v, cam.aspect, 1);
      this.lensOn = true;
    } else if (this.lensOn) {
      cam.clearViewOffset();
      this.lensOn = false;
      this.lift = 0;
      this._liftFast = false;
    }
    // 시야 구멍(카메라→내 캐릭터 선 위를 점묘로 지움)은 따라가기 카메라용: 내 어깨 너머로 찍는 대화 구도에선 내 머리까지 지우므로 끔
    const seeOff = !!this.lensOn && this.blend > 0.5; // 처음엔 lensOn 이 없음 → 꼭 참/거짓으로 (아니면 아래에서 없는 값을 되돌리려다 멈춤)
    if (seeOff !== !!this._seeOff) {
      if (seeOff) { this._seeOff = { v: SURF.seeOn.value }; SURF.seeOn.value = 0; } else { SURF.seeOn.value = this._seeOff.v; this._seeOff = null; }
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 5);
    this.blend += (this.want - this.blend) * k;
    if (this.want === 0 && this.blend < 0.002) this.blend = 0;
    if (this.hidden) for (const u of this.hidden) { if (u.label) u.label.visible = false; }
    this._lens(dt);
    if (this.blend <= 0) return;
    if (this.t < 1) {
      this.t = Math.min(1, (performance.now() - this.t0) / 1000 / this.dur);
      const e = easeInOut(this.t);
      this.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.look.lerpVectors(this.from.look, this.to.look, e);
    } else if (this.orbit) { // 천천히 도는 샷
      const a = this.orbit * dt, c = Math.cos(a), s = Math.sin(a);
      const ox = this.pos.x - this.look.x, oz = this.pos.z - this.look.z;
      this.pos.x = this.look.x + ox * c - oz * s; this.pos.z = this.look.z + ox * s + oz * c;
    }
    // 따라가기 카메라와 섞기
    const cam = this.game.camera, b = easeInOut(this.blend);
    this._fp.copy(cam.position); this._fl.copy(this.game.followCam.smooth);
    cam.position.lerpVectors(this._fp, this.pos, b);
    this._fl.lerp(this.look, b);
    cam.lookAt(this._fl);
  }

  wait(s) { return new Promise((r) => { const end = performance.now() + s * 1000; const tick = () => (this.skipping || performance.now() >= end ? r() : requestAnimationFrame(tick)); tick(); }); }

  /**
   * 컷신 실행. steps: { cam:[pos,look,dur,opts] } | { face: 인물, with?, toward?: [x,z], dur? } | { say:[lines] }
   *  | { ask: line, then?(값) } (이름 카드 같은 입력 — 건너뛰면 기본값) | { wait:s } | { run:fn }
   * 건너뛰면 남은 카메라·대기는 생략하고 run(상태 변경)과 ask 기본값만 실행
   * 다른 컷신이 도는 중이면 끝난 뒤 이어서 (버리지 않음). 도중에 오류가 나도 띠·멈춤·카메라는 풀림
   */
  play(steps) {
    if (!this.locked) return this._play(steps);
    return new Promise((res, rej) => (this.queue ||= []).push({ steps, res, rej }));
  }

  /** 컷신 동안 이름표를 숨길 캐릭터: 대사·얼굴 구도에 나오는 모두 + 나 + 반려견 */
  _castOf(steps) {
    const g = this.game, out = new Set([g.player?.unico]);
    for (const s of steps) {
      for (const ln of [].concat(s.say || [], s.ask || [])) if (ln?.speaker) out.add(ln.speaker);
      if (s.face && !isPet(s.face)) out.add(s.face);
      if (s.with && !isPet(s.with)) out.add(s.with);
    }
    const pet = g.pet;
    if (pet?.e?.m) out.add({ get label() { return pet.label; }, labelAlways: false });
    return [...out].filter(Boolean);
  }

  async _play(steps) {
    this.locked = true; this.skipping = false;
    const g = this.game, P = g.player;
    P.hold ? P.hold('cine') : (P.frozen = true);
    try {
      g.ui.closePanel();
      document.body?.classList?.add('cine');
      const cast = this._castOf(steps);
      this.hideLabelsOf(...cast);
      for (const s of steps) {
        if (s.run) { s.run(); continue; }
        if (s.ask) {
          const ln = s.ask, def = ln.input?.value ?? null;
          const v = this.skipping ? def : await g.dialogue.say(ln);
          s.then?.(v ?? def);
          continue;
        }
        if (this.skipping) continue;
        if (s.cam) { this.shot(...s.cam); if (s.hold !== false) await this.wait((s.cam[2] ?? 1.2) * (s.hold ?? 1)); }
        else if (s.face) {
          const cam = g.camera, W0 = g.world, me = !s.with && P.unico !== s.face ? P.position : null; // 함께 담지 않는 나도 얼굴을 가리면 안 됨
          const blocked = (x, z) => !!(W0?.isBlocked?.(x, z, 0.35) || (me && Math.hypot(x - me.x, z - me.z) < 0.75));
          const f = faceShot(s, cam.position, cam.fov, cam.aspect, blocked);
          if (f) {
            if (!isPet(s.face)) this.faceLock(s.face, f.yaw);
            else s.face.e.m.rotation.y = f.yaw; // 반려견: 멈춰 선 채(pet.settle) 카메라 쪽으로
            const W = s.with && !isPet(s.with) ? posOf(s.with) : null, S = posOf(s.face);
            if (W) this.faceLock(s.with, cheatYaw(W, S, f.pos, 12 * DEG)); // 듣는 쪽은 말하는 쪽을 보되 카메라로 살짝
            if (s.emote) s.face.playAction?.(s.emote, 1.6);
            const dur = s.dur ?? 1.4;
            this.shot(f.pos, f.look, dur, { lift: true });
            if (s.hold !== false) await this.wait(dur * (s.hold ?? 1));
          }
        } else if (s.say) await g.dialogue.say(s.say);
        else if (s.wait) await this.wait(s.wait);
      }
    } finally {
      document.body?.classList?.remove('cine');
      this.release();
      P.unhold ? P.unhold('cine') : (P.frozen = false);
      this.locked = false;
      g.governor?.reset(); // 컷신 동안의 프레임은 화질 자동 조절 측정에서 뺌 (끝난 뒤 새로 잼)
      const next = this.queue?.shift();
      if (next) this._play(next.steps).then(next.res, next.rej);
    }
  }
}
