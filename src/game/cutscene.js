import * as THREE from 'three';
import { SURF } from './surface.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 얼굴 축 이동 (클로즈업): 카메라가 pivot(인물 얼굴)을 축으로 돌며 다가가는 t(0~1) 지점의 { pos, look } (배열 [x, y, z])
 *  - 위치: pivot 기준 구면 좌표로 섞음 — 수평 각은 짧은 쪽으로 돌고, 높이 각은 고르게, 거리는 비율로 (멀리서 다가올 때도 고른 빠르기로 줌인)
 *  - 시선: 처음엔 이전 시선에서 얼굴로 빠르게 옮겨 이동 내내 얼굴이 화면 가운데 → 끝에서 최종 구도 시선(to.look)으로 자리잡음
 *  t 는 이징 전 값 (위치는 easeInOut, 시선은 앞쪽이 빠른 ease-out)
 */
export function orbitLerp(fromPos, toPos, fromLook, toLook, pivot, t) {
  const [px, py, pz] = pivot, e = easeInOut(t);
  const sph = (p) => { const x = p[0] - px, y = p[1] - py, z = p[2] - pz, h = Math.hypot(x, z); return { r: Math.max(0.5, Math.hypot(h, y)), yaw: Math.atan2(x, z), pitch: Math.atan2(y, h) }; };
  const a = sph(fromPos), b = sph(toPos);
  const yaw = a.yaw + wrapA(b.yaw - a.yaw) * e, pitch = a.pitch + (b.pitch - a.pitch) * e, r = a.r * Math.pow(b.r / a.r, e);
  const ch = Math.cos(pitch) * r;
  const pos = [px + Math.sin(yaw) * ch, py + Math.sin(pitch) * r, pz + Math.cos(yaw) * ch];
  const k = 1 - Math.pow(1 - t, 3), m = e * e; // 얼굴로 빨리 → 끝에서 최종 시선으로
  const look = [0, 1, 2].map((i) => { const l1 = fromLook[i] + (pivot[i] - fromLook[i]) * k; return l1 + (toLook[i] - l1) * m; });
  return { pos, look };
}

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

/** 두 인물을 담는 대화 구도 { pos, look }: 지금 카메라가 있는 쪽에서 어깨 너머 살짝 비스듬히
 *  dodge: 선택지 기둥이 오른쪽에 떠 있는 화면(PC)이면 카메라를 오른쪽으로 0.5m 옮겨 두 사람을 왼쪽으로 */
export function talkShot(a, b, camPos, fov, aspect = 1, dodge = choiceColumn(aspect)) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
  const nx = -dz / d, nz = dx / d; // 두 사람을 잇는 선의 옆 방향
  const side = (camPos.x - mx) * nx + (camPos.z - mz) * nz >= 0 ? 1 : -1;
  const dist = talkDistance(d, fov, aspect);
  const shot = {
    pos: [mx + nx * side * dist - (dx / d) * 1.2, 2.5, mz + nz * side * dist - (dz / d) * 1.2],
    look: [mx, 1.1 - talkLookDrop(aspect), mz],
  };
  return dodge == null ? shot : panRight(shot, 0.5);
}

/**
 * 선택지 기둥(대화창 위 오른쪽, dialogue.js choicesMode 'float')이 뜨는 화면이면 기둥 왼쪽 끝의 화면 가로 위치(NDC x), 아니면 null
 * 기준은 choicesMode 와 같음: 세로 화면(폭 600 이하·세운 태블릿)은 창 위 전체 너비, 가로로 눕힌 폰은 창 안 → null
 * 대화창 폭 min(94vw, 760) · 기둥 min(300, 60%) · 오른쪽 12px (dialogue.css). 760·300·16px 은 글자 크기 배율(--ui-zoom)만큼 커짐
 */
export function choiceColumn(aspect = 1.6, w = typeof innerWidth === 'number' ? innerWidth : 1280, h = typeof innerHeight === 'number' ? innerHeight : w / (aspect || 1.6), coarse = isCoarse(), zoom = uiZoom()) {
  if (w <= 600 || w < h || (h <= 500 && coarse)) return null;
  const z = zoom > 0 ? zoom : 1;
  const box = Math.min(w * 0.94, 760 * z), col = Math.min(300 * z, box * 0.6);
  return (box / 2 - 16 * z - col) / (w / 2);
}
/** 화면 글자 크기 배율 (#ui 의 --ui-zoom, game_gfx.js) */
function uiZoom() {
  try { return parseFloat(globalThis.document?.getElementById?.('ui')?.style?.getPropertyValue?.('--ui-zoom')) || 1; } catch { return 1; }
}
function isCoarse() {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}
/** 구도를 카메라 오른쪽으로 m 만큼 평행 이동 (화면 속 인물은 왼쪽으로) */
export function panRight(shot, m) {
  const fx = shot.look[0] - shot.pos[0], fz = shot.look[2] - shot.pos[2], l = Math.hypot(fx, fz) || 1;
  const rx = (-fz / l) * m, rz = (fx / l) * m;
  return { ...shot, pos: [shot.pos[0] + rx, shot.pos[1], shot.pos[2] + rz], look: [shot.look[0] + rx, shot.look[1], shot.look[2] + rz] };
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
  theta = 35 * DEG, D = 4.2, maxD = 6, camY = 1.6, lookY = 1.25, lookMix = 0.3, faceS = 1.3, faceL = 1.35, fov = 45, aspect = 1.6, fit = 0.8, dodge = choiceColumn(aspect),
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
  // 선택지 기둥(오른쪽)이 말하는 얼굴을 덮으면 카메라를 오른쪽으로 옮겨 얼굴을 기둥 왼쪽으로 (0.8m 까지, 듣는 쪽은 화면 안에)
  let shift = 0;
  if (dodge != null && faceL != null && xs > dodge - 0.12) {
    const k = Math.tan((fov * DEG) / 2) * aspect, depth = (p, y) => { const f = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]], l = Math.hypot(...f) || 1; return ((p.x - pos[0]) * f[0] + (y - pos[1]) * f[1] + (p.z - pos[2]) * f[2]) / l; };
    const zS = depth(speaker, faceS), zL = depth(listener, faceL);
    let m = (xs - (dodge - 0.12)) * zS * k;
    m = Math.min(m, 0.8, Math.max(0, (xl + fit) * zL * k));
    if (m > 0.01) {
      const s = panRight({ pos, look }, m);
      pos = s.pos; look.splice(0, 3, ...s.look); shift = m;
      xs = ndcX(pos, look, speaker, faceS, fov, aspect);
      xl = ndcX(pos, look, listener, faceL, fov, aspect);
    }
  }
  return { pos, look, lift: true, theta, side, dist, shift, sep: faceL == null ? 1 : Math.abs(xs - xl) / 2 };
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

/** 화면 세로 위치(NDC y): ndcX 와 같은 카메라 (렌즈 올림 없이) */
export function ndcY(pos, look, p, y, fov) {
  let fx = look[0] - pos[0], fy = look[1] - pos[1], fz = look[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  const rl = Math.hypot(fx, fz) || 1, rx = -fz / rl, rz = fx / rl;
  const ux = -fy * rz, uy = fz * rx - fx * rz, uz = fy * rx; // 위 = 오른쪽 × 앞
  const vx = p.x - pos[0], vy = y - pos[1], vz = p.z - pos[2];
  const z = vx * fx + vy * fy + vz * fz;
  return z > 0.05 ? (vx * ux + vy * uy + vz * uz) / (z * Math.tan((fov * DEG) / 2)) : -Infinity;
}

/** 몸통 반지름(m): 머리·몸이 둥근 유니코 기준, 반려견은 작게 */
export const bodyR = (o) => (isPet(o) ? 0.3 : 0.55 * (o?.scale ?? 1));

/**
 * 인물이 화면 가로에서 차지하는 비율 (0~1, 화면 밖으로 잘린 만큼 뺌): 머리 높이에서 반지름 r 인 공으로 봄
 * 카메라 뒤면 0, 카메라에 너무 붙으면(0.3m 안) 1
 */
export function screenShare(pos, look, p, y, r, fov, aspect) {
  let fx = look[0] - pos[0], fy = look[1] - pos[1], fz = look[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const z = ((p.x - pos[0]) * fx + (y - pos[1]) * fy + (p.z - pos[2]) * fz) / fl;
  if (z <= -r) return 0;
  if (z < 0.3) return 1;
  const x = ndcX(pos, look, p, y, fov, aspect), h = r / (z * Math.tan((fov * DEG) / 2) * aspect);
  return Math.max(0, Math.min(1, x + h) - Math.max(-1, x - h)) / 2;
}

/** 점 (px, pz) 에서 선분 a→b 까지 바닥 거리 */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** 두 사람 구도에서 듣는 쪽이 화면 가로에서 차지해도 되는 최대 비율 (어깨·등 가장자리만) */
export const LISTENER_MAX = 0.22;

/**
 * 말하는 쪽 얼굴 구도 { face } 스텝 → { pos, look, lift, yaw, key, share } (그 순간 위치로)
 *  - with: 함께 담을 상대 (보통 나) → 두 사람 구도, 말하는 쪽 얼굴이 3/4 앞. 상대는 화면 가장자리에 어깨만 (LISTENER_MAX 이하, 1.6m 이상 떨어짐)
 *    profile: true → 두 사람을 옆(90°)에서 조금 낮게 (건네주기 장면)
 *  - toward: [x, z] 소개하는 곳 → 그곳을 등지고 카메라 쪽을 보는 구도 (뒤로 그곳이 보임)
 *  - 둘 다 없으면 지금 바라보는 쪽 2.5m 앞을 상대로
 *  - avoid: 화면 밖으로 빼고 싶은 인물, blocked(x, z): 건물·소품 자리인가 (가리지 않는 각도·쪽을 고름)
 *  ctx: { soft(x, z): 가로등·우체통 같은 작은 소품 근처인가 (카메라→얼굴 선과 얼굴 뒤 배경에서 조금만 감점),
 *         clear: [{x, z}] 카메라→얼굴 선을 막으면 안 되는 사람 (함께 담지 않는 나), prev: 바로 앞 얼굴 구도 (같은 둘이면 다른 자리로) }
 *  yaw = 말하는 쪽 몸 방향 (카메라 쪽으로 돌림, 반려견은 카메라를 똑바로)
 */
export function faceShot(step, camPos, fov = 45, aspect = 1.6, blocked = null, ctx = {}) {
  const who = step.face, S = posOf(who);
  if (!S) return null;
  const pet = isPet(who), fS = faceY(who);
  let L, faceL = null, theta = 30 * DEG, cheat = 60 * DEG;
  const W = step.with && posOf(step.with);
  if (W && Math.hypot(W.x - S.x, W.z - S.z) > 0.3) { L = W; faceL = faceY(step.with); theta = (step.profile ? 90 : 35) * DEG; cheat = (step.profile ? 10 : 20) * DEG; }
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
  if (pet) cheat = Math.PI; // 반려견은 카메라를 똑바로 봄 (이름 카드에서 눈을 맞춤)
  const opts = pet
    ? { theta: 60 * DEG, D: 2.4, maxD: 3.4, camY: 0.6, lookY: 0.5, lookMix: Math.min(0.15, 0.3 / fd), faceS: fS, faceL: null } // 낮게, 거의 눈높이. 시선은 반려견에서 0.3m 안 (주인이 멀어도 가운데)
    : step.profile && faceL
      ? { theta, D: tall ? 5.2 : 4.2, maxD: tall ? 12 : 8, camY: fS + 0.05, lookY: fS * 0.5 + faceL * 0.5 - 0.15, lookMix: tall ? 0.4 : 0.5, faceS: fS, faceL, fit: tall ? 0.72 : 0.7 }
      : { theta, D: faceL ? (tall ? 5.0 : 4.4) : tall ? 6.0 : 5.4, maxD: faceL ? 8 : 7, camY: fS + 0.35, lookY: faceL ? fS * 0.7 + faceL * 0.3 - 0.05 : fS - 0.1, lookMix: faceL ? 0.3 : 0, faceS: fS, faceL, fit: tall ? 0.75 : 0.8 };
  const A = step.avoid && posOf(step.avoid), clear = (ctx.clear || []).filter(Boolean), soft = ctx.soft;
  const key = `${who?.id ?? ''}|${posOf(step.with) ? 'w' : ''}`, prev = ctx.prev && ctx.prev.who === who && ctx.prev.withWho === (step.with || null) ? ctx.prev : null;
  // 점수 = 건물·소품 가림(blocked) + avoid 인물이 화면에 걸림 + 듣는 쪽이 화면을 덮음·말하는 얼굴을 가림 + 사람이 선을 막음 + 작은 소품(soft) + 바로 앞 구도와 같은 자리
  const score = (sh) => {
    let n = 0;
    const cx = sh.pos[0], cz = sh.pos[2];
    if (blocked) {
      if (blocked(cx, cz)) n += 3;
      const L0 = Math.hypot(S.x - cx, S.z - cz) || 1, tMax = Math.max(0, 1 - 1.3 / L0); // 말하는 쪽 1.3m 안(자기 자리)은 빼고
      for (let k = 1; k <= 8; k++) { const t = (k / 8) * tMax; if (blocked(cx + (S.x - cx) * t, cz + (S.z - cz) * t)) n += 2; }
    }
    if (soft) {
      const L0 = Math.hypot(S.x - cx, S.z - cz) || 1, ux = (S.x - cx) / L0, uz = (S.z - cz) / L0;
      for (let k = 1; k <= 6; k++) { const t = (k / 6) * Math.max(0, L0 - 0.8); if (soft(cx + ux * t, cz + uz * t)) n += 0.5; } // 카메라→얼굴 선 (얼굴 앞 0.8m 까지)
      for (const t of [0.8, 1.6, 2.6]) if (soft(S.x + ux * t, S.z + uz * t)) n += 0.4; // 얼굴 바로 뒤 배경 (가로등 기둥이 머리에서 솟지 않게)
    }
    if (A && Math.abs(ndcX(sh.pos, sh.look, A, faceY(step.avoid), fov, aspect)) < 1.1) n += 5;
    if (Math.abs(ndcX(sh.pos, sh.look, S, fS, fov, aspect)) > (opts.fit ?? 0.8) + 0.05) n += 8; // 말하는 얼굴이 화면 끝에 걸림
    if (faceL != null) {
      const sw = step.with, share = screenShare(sh.pos, sh.look, W, faceL, bodyR(sw), fov, aspect);
      sh.share = share;
      if (share > LISTENER_MAX) n += 6 + share * 4;
      if (Math.hypot(W.x - cx, faceL - sh.pos[1], W.z - cz) < 1.6) n += 6;
      // 듣는 쪽이 카메라와 말하는 얼굴 사이에서 얼굴을 가림
      const dS = Math.hypot(S.x - cx, S.z - cz), dW = Math.hypot(W.x - cx, W.z - cz);
      if (dW < dS && segDist(W.x, W.z, cx, cz, S.x, S.z) < bodyR(sw) + 0.15) n += 6;
    }
    for (const c of clear) {
      if (Math.hypot(c.x - S.x, c.z - S.z) < 0.4) continue;
      if (segDist(c.x, c.z, cx, cz, S.x, S.z) < 0.7) n += 6; // 내 몸이 얼굴을 가림
      else if (screenShare(sh.pos, sh.look, c, 1.3, 0.55, fov, aspect) > LISTENER_MAX) n += 4; // 카메라 바로 앞 큰 뒷모습
    }
    if (prev && Math.hypot(prev.pos[0] - cx, prev.pos[2] - cz) < 1.2) n += 4;
    return n;
  };
  let sh = null, best = Infinity;
  // toward 인데 그쪽이 다 막히면 마지막으로 소개하는 곳 쪽에서 (그곳은 카메라 뒤로 빠지지만 얼굴은 보임)
  const Ls = step.toward && blocked ? [L, { x: 2 * S.x - L.x, z: 2 * S.z - L.z }] : [L];
  // 옆모습(profile)은 90° 를 넘겨 말하는 쪽 뒤로 돌지 않게 (얼굴이 보이는 쪽으로만)
  const dts = step.profile ? [0, -15, 10, -30] : faceL != null ? [0, 20, -15, 10, 40, -25] : [0, 20, -20, 40];
  const Ds = faceL != null ? [opts.D, opts.D + 1.4, opts.D + 2.8] : [opts.D];
  search: for (const LL of Ls) for (const sd of [side, -side]) for (const D of Ds) for (const dt of dts) {
    const th = opts.theta + dt * DEG;
    if (th < 5 * DEG) continue;
    const c = speakerShot(LL, S, sd, { ...opts, D, maxD: Math.max(opts.maxD, D), theta: th, fov, aspect, dodge: null }), n = score(c); // 컷신 얼굴 구도는 선택지 기둥 비킴 없음
    if (n < best - 1e-6) { best = n; sh = c; sh.L = LL; }
    if (n === 0) break search;
  }
  return { pos: sh.pos, look: sh.look, lift: true, yaw: cheatYaw(S, sh.L ?? L, sh.pos, cheat), key, who, withWho: step.with || null, share: sh.share ?? 0, score: best };
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
  shot(pos, look, dur = 1.2, { orbit = 0, lift = 0, pivot = null } = {}) {
    const cam = this.game.camera;
    if (this.blend < 0.01) { this.pos.copy(cam.position); this.look.copy(this.game.followCam.look || this.game.followCam.smooth); }
    this.from.pos.copy(this.pos); this.from.look.copy(this.look);
    this.to.pos.set(...pos); this.to.look.set(...look);
    this.t = 0; this.dur = Math.max(0.01, dur); this.orbit = orbit;
    // pivot(): 인물 얼굴 [x, y, z] — 있으면 그 얼굴을 축으로 돌며 다가가고(orbitLerp), 도착한 뒤에도 얼굴이 움직이면 같이 따라감
    this.pivot = typeof pivot === 'function' ? pivot : pivot ? () => pivot : null;
    const p0 = this.pivot?.();
    this._piv0 = p0 ? [p0[0], p0[1], p0[2]] : null; // 시작 때 얼굴 자리 (복사해 둠)
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
    this.pivot = null;
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
    const piv = this.pivot && this._piv0 ? this.pivot() : null;
    if (piv) { // 얼굴 축 이동: 시작 때 얼굴 기준으로 계산하고, 그 뒤 얼굴이 옮겨 간 만큼 통째로 따라감
      if (this.t < 1) this.t = Math.min(1, (performance.now() - this.t0) / 1000 / this.dur);
      const p0 = this._piv0, d = [piv[0] - p0[0], piv[1] - p0[1], piv[2] - p0[2]];
      const o = orbitLerp(this.from.pos.toArray(), this.to.pos.toArray(), this.from.look.toArray(), this.to.look.toArray(), p0, this.t);
      this.pos.set(o.pos[0] + d[0], o.pos[1] + d[1], o.pos[2] + d[2]);
      this.look.set(o.look[0] + d[0], o.look[1] + d[1], o.look[2] + d[2]);
    } else if (this.t < 1) {
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
    this._fp.copy(cam.position); this._fl.copy(this.game.followCam.look || this.game.followCam.smooth);
    cam.position.lerpVectors(this._fp, this.pos, b);
    this._fl.lerp(this.look, b);
    cam.lookAt(this._fl);
  }

  /** s 초 기다림 (until() 이 참이 되면 일찍 끝냄 — 느린 기기에서도 '도착할 때까지') */
  wait(s, until = null) { return new Promise((r) => { const end = performance.now() + s * 1000; const tick = () => (this.skipping || performance.now() >= end || until?.() ? r() : requestAnimationFrame(tick)); tick(); }); }

  /**
   * 컷신 실행. steps: { cam:[pos,look,dur,opts] } | { face: 인물, with?, toward?: [x,z], dur? } | { say:[lines] }
   *  | { ask: line, then?(값) } (이름 카드 같은 입력 — 건너뛰면 기본값) | { wait:s, until?() } | { run:fn }
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
    this.locked = true; this.skipping = false; this._lastFace = null;
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
          const blocked = (x, z) => !!W0?.isBlocked?.(x, z, 0.35);
          const props = (W0?.obstacles || []).filter((o) => o.r <= 0.8); // 가로등·우체통·화분 같은 작은 소품
          const soft = (x, z) => props.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.9);
          const f = faceShot(s, cam.position, cam.fov, cam.aspect, blocked, { soft, clear: me ? [me] : [], prev: this._lastFace });
          this._lastFace = f;
          if (f) {
            if (!isPet(s.face)) this.faceLock(s.face, f.yaw);
            else s.face.e.m.rotation.y = f.yaw; // 반려견: 멈춰 선 채(pet.settle) 카메라 쪽으로
            const W = s.with && !isPet(s.with) ? posOf(s.with) : null, S = posOf(s.face);
            if (W) this.faceLock(s.with, cheatYaw(W, S, f.pos, 12 * DEG)); // 듣는 쪽은 말하는 쪽을 보되 카메라로 살짝
            if (s.emote) s.face.playAction?.(s.emote, 1.6);
            const dur = s.dur ?? 1.4;
            const who = s.face; // 클로즈업: 이 인물의 얼굴을 축으로 돌며 다가감 (이동 내내 얼굴이 화면 가운데)
            this.shot(f.pos, f.look, dur, { lift: true, pivot: () => { const p = posOf(who); return p ? [p.x, faceY(who), p.z] : null; } });
            if (s.hold !== false) await this.wait(dur * (s.hold ?? 1));
          }
        } else if (s.say) await g.dialogue.say(s.say);
        else if (s.wait) await this.wait(s.wait, s.until);
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
