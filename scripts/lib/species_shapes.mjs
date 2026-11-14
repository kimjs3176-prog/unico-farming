// 주민 동물 종의 모양(SDF)·칠하기·얼굴/옷 기준점 정의 — 굽기(scripts/build-unico-mesh.mjs)와 테스트에서만 씀. 게임 코드(src/)에서 import 금지
// 좌표: 발바닥 y=0, 정면 +Z, 단위 m, 루트 기준·스케일 전. 숫자는 docs/CHARACTERS.md(아트 바이블)와 같음
import * as THREE from 'three';
import { sph, ell, cap, rcone, squashZ, smin, flat, inter, minus, band, half, front, rotAbout } from '../../src/game/sdf.js';
import { surfacePoint, normalAt, SLOTS } from '../../src/game/unico_mesh.js';

export const SHAPES_VERSION = 1; // sdf.js·공통 몸이 바뀌면 올림
export const SPECIES_IDS = ['fox', 'raccoon', 'puppy', 'bear', 'cat', 'rabbit'];

// ------------------------------------------------------------------ 벡터 도우미 (배열)
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const mx = (a, sx) => [sx * a[0], a[1], a[2]]; // x 부호만 바꿈 (왼쪽 = -1)
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r4v = (a) => a.map(r4);

// 뼈대 공통 (§3): 몸통 B, 머리 중심 H, 꼬리 뿌리 T
const BODY = [0, 0.38, 0], HEADREL = [0, 0.92, 0.04], TAILREL = [0, 0.04, -0.25];
const B = BODY, H = add(BODY, HEADREL), T = add(BODY, TAILREL);
/** 관절 경계 폭: 두 발 유니코 값 + 귀 */
const SIGMA = { armL: 0.01, armR: 0.01, legL: 0.018, legR: 0.018, head: 0.03, tail: 0.02, tail2: 0.02, tail3: 0.02, earL: 0.02, earR: 0.02, earL2: 0.015, earR2: 0.015, body: 0.035 };
const SIDES = [[-1, 'L'], [1, 'R']];

/** u 를 v 로 돌리는 회전 행렬 (행 우선 3×3) */
function rotTo(u, v) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...unit(u)), new THREE.Vector3(...unit(v)));
  const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements; // 열 우선
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}
const applyM = (m, a) => [m[0] * a[0] + m[1] * a[1] + m[2] * a[2], m[3] * a[0] + m[4] * a[1] + m[5] * a[2], m[6] * a[0] + m[7] * a[1] + m[8] * a[2]];

/** §3.1 뼈 목록 (순서 고정 — 스킨 인덱스) */
function rigBones(r) {
  const ax = r.armX ?? 0.27;
  const bones = [['body', null, BODY], ['head', 'body', HEADREL], ['legL', 'body', [-0.14, -0.06, 0]], ['legR', 'body', [0.14, -0.06, 0]],
    ['armL', 'body', [-ax, 0.44, 0.02]], ['armR', 'body', [ax, 0.44, 0.02]], ['tail', 'body', TAILREL],
    ['tail2', 'tail', r.tail2], ['tail3', 'tail2', r.tail3], ['earL', 'head', mx(r.earAt, -1)], ['earR', 'head', r.earAt]];
  if (r.ear2) bones.push(['earL2', 'earL', mx(r.ear2, -1)], ['earR2', 'earR', r.ear2]);
  return bones;
}

/** §3.2 공통 몸: 몸통 종·배·다리·발·어깨 공·팔·손 */
function commonBody(push, b, armX) {
  const top = b.top ?? 0.95, sq = b.sq ?? 0.9, leg = b.leg ?? [0.112, 0.1], arm = b.arm ?? [0.074, 0.06];
  const foot = { rx: 0.1, ry: 0.07, rz: 0.135, y: 0.07, z: 0.05, ...(b.foot || {}) };
  push(squashZ(rcone([0, 0.46, 0.01], [0, top, 0], b.r0 ?? 0.26, b.r1 ?? 0.14), sq), 0, 'body', 'body');
  push(sph([0, 0.5, b.bz ?? 0.06], b.belly ?? 0.23), 0.12, 'body', 'body');
  for (const [sx, s] of SIDES) {
    push(rcone([sx * 0.135, 0.34, 0], [sx * 0.135, 0.11, 0.015], leg[0], leg[1]), 0.08, 'body', 'leg' + s);
    push(ell([sx * 0.135, foot.y, foot.z], [foot.rx, foot.ry, foot.rz]), 0.05, 'hoof', 'leg' + s);
  }
  for (const [sx, s] of SIDES) {
    const J = [sx * armX, 0.82, 0.02], Hd = [sx * (armX + 0.15), 0.53, 0.06];
    push(sph(J, arm[0] + 0.012), 0.11, 'body', 'body');
    push(rcone(J, Hd, arm[0], arm[1]), 0.015, 'body', 'arm' + s);
    push(ell([sx * (armX + 0.16), 0.485, 0.065], [0.072, 0.074, 0.072]), 0.03, 'hoof', 'arm' + s);
  }
}

/**
 * 뾰족 귀 (여우·고양이): 판 두께 s ≥ 0.55, 귀 면을 바깥으로 yaw 만큼 돌려 측면에서 뿔처럼 안 보이게 + 안쪽 색을 앞면에
 */
function pointyEar(push, paint, sx, { base, tip, r1, r2, s = 0.55, yaw = 0.45, k = 0.07, inner, tipDark = false }) {
  const n = unit([sx * Math.sin(yaw), 0.1, Math.cos(yaw)]);
  const dir = unit(sub(tip, base));
  const bone = sx < 0 ? 'earL' : 'earR';
  push(flat(rcone(base, tip, r1, r2), base, n, s), k, 'body', bone);
  // 안쪽 색: 귀 판보다 두꺼운(판 방향 2배) 작은 원뿔 ∩ 앞쪽 반공간 → 앞면 가운데만 칠해짐
  if (inner) paint(inter(flat(rcone(add(base, [0, 0.04, 0]), sub(tip, mul(dir, 0.08)), 0.65 * r1, 0.4 * r2), base, n, 2), front(n, base, 0.004)), inner, 2);
  if (tipDark) paint(sph(sub(tip, mul(dir, 0.04)), 0.1), 'maneD', 3);
  return n;
}

// ------------------------------------------------------------------ 종 정의 (§4)
// face: 얼굴 기준점 광선(머리 기준). eye/cheek/brow = 머리 중심에서 나가는 방향, nose/teeth = {o 시작점, d 방향}
//   mouth = {o 시작점(주둥이 안), y·z 목표 평면 위 높이·깊이, w 폭, depth 처짐, style}
// wear: 옷 기준점 (rings: 몸통/머리 고리 높이, patches/paths: 멜빵)
export const SPECIES_SHAPES = {
  fox: {
    scale: 1.0,
    rig: { earAt: [0.22, 0.28, -0.05], tail2: [0, -0.03, -0.32], tail3: [0, 0.2, -0.2] },
    bounds: [[-0.75, -0.03, -1.12], [0.75, 2.12, 0.92]],
    body: { r0: 0.25, r1: 0.115, belly: 0.22, bz: 0.05, leg: [0.105, 0.085] }, // 가는 발목
    head: { c: [0, 0, 0], r: [0.42, 0.37, 0.39] },
    build(push, paint) {
      push(ell(H, [0.42, 0.37, 0.39]), 0.16, 'body', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.29, -0.14, 0.09]), [0.17, 0.12, 0.15], sx * 0.55), 0.1, 'snout', 'head'); // 볼 갈기 (V 얼굴)
      push(rcone(add(H, [0, -0.1, 0.22]), add(H, [0, -0.15, 0.53]), 0.165, 0.05), 0.1, 'snout', 'head');
      for (const [sx] of SIDES) pointyEar(push, paint, sx, { base: add(H, [sx * 0.2, 0.27, -0.05]), tip: add(H, [sx * 0.37, 0.67, -0.08]), r1: 0.13, r2: 0.035, s: 0.62, inner: 'snout', tipDark: true });
      // 꼬리 (몸통의 약 60% 부피 — 히어로 특징)
      const tl = [[0, 0, -0.02, 0.09, 'tail', 0.08], [0, -0.05, -0.17, 0.15, 'tail', 0.07], [0, -0.03, -0.33, 0.185, 'tail2', 0.07], [0, 0.07, -0.49, 0.175, 'tail2', 0.07], [0, 0.22, -0.58, 0.14, 'tail3', 0.07], [0, 0.36, -0.6, 0.09, 'tail3', 0.07]];
      for (const [x, y, z, r, bone, k] of tl) push(sph(add(T, [x, y, z]), r), k, 'body', bone);
      paint(ell(add(H, [0, 0, 0.38]), [0.11, 0.1, 0.2]), 'body', 1); // 콧등 주황
      paint(ell([0, 0.74, 0.2], [0.17, 0.24, 0.14]), 'snout', 1); // 가슴 턱받이
      for (const [sx] of SIDES) { paint(cap([sx * 0.135, 0.19, 0.01], [sx * 0.135, 0, 0.06], 0.15), 'hoof', 1); paint(sph([sx * 0.43, 0.5, 0.065], 0.11), 'hoof', 1); }
      paint(sph(add(T, [0, 0.36, -0.62]), 0.15), 'mane', 2); // 꼬리 끝 흰색
    },
    face: {
      eye: [0.34, 0.1, 0.93], cheek: [0.62, -0.28, 0.72], brow: [0.33, 0.3, 0.9],
      nose: { o: [0, -0.15, 0.3], d: [0, 0.15, 1] },
      mouth: { o: [0, -0.15, 0.34], y: -0.205, z: 0.5, w: 0.16, depth: 0.03, style: 'smirk' },
      lids: true,
    },
    wear: { rings: { neck: { y: 0.91, tilt: 0.12, off: 0.01 }, waist: { y: 0.53, off: 0.006, dip: 0.02 }, headband: { y: 0.18, tilt: -0.25, off: 0.012 } }, chest: [0.88, -0.5] },
  },

  raccoon: {
    scale: 0.96,
    rig: { earAt: [0.26, 0.3, -0.06], tail2: [0, -0.01, -0.3], tail3: [0, 0.16, -0.14] },
    bounds: [[-0.75, -0.03, -0.98], [0.75, 1.95, 0.9]],
    body: { r0: 0.29, r1: 0.15, sq: 0.92, belly: 0.29, bz: 0.09 }, // 서양배 몸
    head: { c: [0, 0, 0], r: [0.45, 0.39, 0.4] },
    build(push, paint) {
      push(ell(H, [0.45, 0.39, 0.4]), 0.16, 'body', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.33, -0.12, 0.03]), [0.17, 0.12, 0.13], sx * 0.6), 0.1, 'snout', 'head'); // 볼 털
      push(rcone(add(H, [0, -0.12, 0.22]), add(H, [0, -0.16, 0.47]), 0.15, 0.055), 0.1, 'snout', 'head');
      for (const [sx] of SIDES) {
        const c = add(H, [sx * 0.27, 0.32, -0.06]);
        push(ell(c, [0.1, 0.11, 0.05], sx * -0.45), 0.07, 'snout', sx < 0 ? 'earL' : 'earR'); // 둥근 삼각 귀 (밝은 테두리)
        paint(ell(add(c, [-sx * 0.01, -0.02, 0.01]), [0.07, 0.075, 0.08], sx * -0.45), 'maneD', 2);
        paint(ell(add(H, [sx * 0.17, 0.02, 0.35]), [0.15, 0.1, 0.12], sx * -0.25), 'maneD', 1); // 눈가 가면
      }
      const tl = [[0, 0, -0.02, 0.1, 'tail', 0.08], [0, -0.03, -0.16, 0.15, 'tail', 0.07], [0, 0, -0.31, 0.165, 'tail2', 0.07], [0, 0.1, -0.43, 0.15, 'tail2', 0.07], [0, 0.22, -0.48, 0.11, 'tail3', 0.07]];
      for (const [x, y, z, r, bone, k] of tl) push(sph(add(T, [x, y, z]), r), k, 'body', bone);
      paint(ell([0, 0.56, 0.28], [0.19, 0.22, 0.12]), 'snout', 1); // 배
      paint(band(add(T, [0, -0.01, -0.25]), [0, 0.1, -1], 0.035, 0.3), 'maneD', 1); // 꼬리 고리 (부드럽게 2개만)
      paint(band(add(T, [0, 0.08, -0.41]), [0, 0.6, -0.8], 0.035, 0.3), 'maneD', 1);
      paint(sph(add(T, [0, 0.25, -0.5]), 0.1), 'maneD', 1);
      for (const [sx] of SIDES) { paint(cap([sx * 0.135, 0.3, 0], [sx * 0.135, 0, 0.06], 0.15), 'hoof', 1); paint(cap([sx * 0.36, 0.66, 0.04], [sx * 0.43, 0.48, 0.065], 0.1), 'hoof', 1); }
      paint(ell(add(H, [0, 0, 0.36]), [0.07, 0.12, 0.12]), 'snout', 2); // 미간 흰 줄
    },
    face: {
      eye: [0.36, 0.06, 0.93], brow: [0.34, 0.3, 0.89],
      nose: { o: [0, -0.15, 0.3], d: [0, 0.08, 1] },
      mouth: { o: [0, -0.16, 0.33], y: -0.225, z: 0.46, w: 0.12, depth: 0.02, style: 'w' },
      whiskers: { o: [0, -0.15, 0.36], d: [[1, 0.12, 0.35], [1, -0.12, 0.3]] },
    },
    wear: { rings: { neck: { y: 0.91, tilt: 0.12, off: 0.01 }, goggle: { back: 0.12, off: 0.01 } }, chest: [0.86, -0.4] },
  },

  puppy: {
    scale: 0.94,
    rig: { earAt: [0.27, 0.29, -0.02], tail2: [0, 0.07, -0.12], tail3: [0, 0.1, -0.05] },
    bounds: [[-0.86, -0.03, -0.62], [0.86, 1.92, 0.9]],
    body: { r0: 0.27, r1: 0.14, belly: 0.23 },
    head: { c: [0, 0, 0], r: [0.44, 0.41, 0.42] },
    build(push, paint) {
      push(ell(H, [0.44, 0.41, 0.42]), 0.16, 'body', 'head');
      push(sph(add(H, [0, 0.12, 0.04]), 0.31), 0.2, 'body', 'head'); // 둥근 이마
      push(ell(add(H, [0, -0.16, 0.31]), [0.2, 0.15, 0.17]), 0.09, 'snout', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.085, -0.19, 0.38]), [0.1, 0.085, 0.09]), 0.05, 'snout', 'head'); // 입술
      // 늘어진 귀: 뿌리 + 넓적 잎. 잎 안쪽 면(x 0.50)과 머리(0.44) 사이를 2셀 띄워 볼이 끌려가지 않게
      for (const [sx] of SIDES) {
        const bone = sx < 0 ? 'earL' : 'earR';
        push(cap(add(H, [sx * 0.27, 0.29, -0.02]), add(H, [sx * 0.5, 0.15, -0.01]), 0.07), 0.05, 'maneD', bone);
        push(ell(add(H, [sx * 0.56, -0.03, 0]), [0.06, 0.21, 0.145], sx * 0.18), 0.03, 'maneD', bone);
      }
      const tl = [[0, 0, -0.03, 0.075, 'tail', 0.07], [0, 0.07, -0.12, 0.07, 'tail', 0.06], [0, 0.17, -0.17, 0.065, 'tail2', 0.06], [0, 0.27, -0.15, 0.055, 'tail3', 0.06]];
      for (const [x, y, z, r, bone, k] of tl) push(sph(add(T, [x, y, z]), r), k, 'body', bone);
      paint(ell(add(H, [0.18, 0.07, 0.33]), [0.17, 0.16, 0.14]), 'maneD', 1); // 오른쪽 눈 얼룩 (한쪽만, 9m 에서도 보이게 크게)
      paint(ell([0, 0.74, 0.19], [0.15, 0.22, 0.12]), 'snout', 1);
      for (const [sx] of SIDES) { paint(cap([sx * 0.135, 0.12, 0.01], [sx * 0.135, 0, 0.06], 0.14), 'hoof', 1); paint(sph([sx * 0.43, 0.485, 0.065], 0.1), 'hoof', 1); }
      paint(sph(add(T, [0, 0.29, -0.15]), 0.07), 'mane', 2);
    },
    face: {
      eye: [0.37, 0.1, 0.92], cheek: [0.66, -0.2, 0.72], brow: [0.17, 0.22, 0.36],
      nose: { o: [0, -0.13, 0.3], d: [0, 0.32, 1] },
      mouth: { o: [0, -0.18, 0.33], y: -0.215, z: 0.47, w: 0.12, depth: 0.022, style: 'w' },
      whiskers: { o: [0, -0.16, 0.31], d: [[0.55, 0.12, 0.85], [0.7, 0.02, 0.75], [0.58, -0.08, 0.85]] }, // 주둥이 점
    },
    wear: { rings: { neck: { y: 0.91, tilt: 0.12, off: 0.01 } }, chest: [0.86, -0.4] },
  },

  bear: {
    scale: 1.0,
    rig: { earAt: [0.3, 0.32, -0.05], tail2: [0, 0, -0.06], tail3: [0, 0, -0.03], armX: 0.31 },
    bounds: [[-0.85, -0.03, -0.62], [0.85, 1.92, 0.95]],
    body: { r0: 0.33, r1: 0.17, top: 0.98, sq: 0.92, belly: 0.29, bz: 0.08, leg: [0.13, 0.115], foot: { rx: 0.115, ry: 0.075, rz: 0.15, y: 0.075, z: 0.05 }, arm: [0.088, 0.072] },
    head: { c: [0, -0.02, 0.02], r: [0.47, 0.42, 0.43] },
    build(push, paint) {
      push(ell(add(H, [0, -0.02, 0.02]), [0.47, 0.42, 0.43]), 0.16, 'body', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.27, -0.16, 0.1]), [0.18, 0.15, 0.16]), 0.12, 'body', 'head'); // 통통 볼
      push(ell(add(H, [0, -0.15, 0.34]), [0.2, 0.15, 0.17]), 0.09, 'snout', 'head');
      for (const [sx] of SIDES) {
        const c = add(H, [sx * 0.31, 0.33, -0.05]);
        push(flat(sph(c, 0.12), c, [0, 0, 1], 0.55), 0.06, 'body', sx < 0 ? 'earL' : 'earR');
        paint(inter(sph(add(c, [0, -0.01, 0.05]), 0.07), front([0, 0, 1], c, 0.004)), 'snout', 1); // 귀 안
      }
      push(sph(add(T, [0, 0.03, -0.06]), 0.085), 0.06, 'body', 'tail');
      paint(ell(add(H, [0, 0.04, 0.31]), [0.24, 0.13, 0.18]), 'maneD', 1); // 눈가 얼굴 패치 (감은 눈이 어두운 털에 묻히지 않게, 머릿수건 챙 아래로 번지지 않게 작게)
      // 가슴 반달: 큰 머리 아래로 내려(중심 y 0.76) 따라가기 카메라에서도 보이게. 같은 타원을 위로 0.055 옮겨 빼서 약 6cm 띠,
      // 양 끝은 위로 솟은 뿔 두 개 (V 초승달 — 목둘레 흰 깃처럼 안 보이게). 앞면(z ≥ 0.06)에만
      paint(inter(minus(ell([0, 0.76, 0.22], [0.29, 0.15, 0.25]), ell([0, 0.815, 0.25], [0.29, 0.15, 0.28])), half([0, 0, -1], -0.06)), 'mane', 1, 0.024);
      for (const [sx] of SIDES) paint(inter(cap([sx * 0.2, 0.69, 0.2], [sx * 0.25, 0.79, 0.16], 0.026), half([0, 0, -1], -0.06)), 'mane', 1, 0.02);
      paint(ell(add(H, [0, -0.15, 0.34]), [0.205, 0.155, 0.175]), 'snout', 2); // 패치 위로 주둥이 다시
    },
    face: {
      eye: [0.33, 0.07, 0.94], cheek: [0.62, -0.25, 0.74], brow: [0.3, 0.3, 0.9],
      nose: { o: [0, -0.13, 0.34], d: [0, 0.3, 1] },
      mouth: { o: [0, -0.16, 0.36], y: -0.205, z: 0.5, w: 0.2, depth: 0.04, style: 'gentle' },
      crinkle: true,
    },
    wear: {
      rings: { neck: { y: 0.93, tilt: 0.1, off: 0.02 } }, chest: [0.8, -0.45],
      // 몸빼: 허리~엉덩이 고리(ys·offs) + 바짓가랑이 높이(legYs) — 바짓가랑이는 높이·방향마다 몸 표면까지 거리를 구워 몸에 맞춤
      momppe: { ys: [0.52, 0.46, 0.4, 0.35], offs: [0.008, 0.024, 0.03, 0.036], legYs: [0.42, 0.36, 0.3, 0.25, 0.2, 0.16, 0.125, 0.1, 0.094] },
    },
  },

  cat: {
    scale: 0.98,
    rig: { earAt: [0.23, 0.27, -0.02], tail2: [0, -0.03, -0.22], tail3: [0, 0.16, -0.18] },
    bounds: [[-0.72, -0.03, -0.85], [0.72, 2.02, 0.9]],
    body: { r0: 0.21, r1: 0.13, belly: 0.18 }, // 날씬
    head: { c: [0, 0, 0], r: [0.45, 0.385, 0.4] },
    build(push, paint) {
      push(ell(H, [0.45, 0.385, 0.4]), 0.16, 'body', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.33, -0.14, 0.05]), [0.13, 0.1, 0.12], sx * 0.6), 0.1, 'body', 'head'); // 볼 털
      for (const [sx] of SIDES) push(sph(add(H, [sx * 0.075, -0.17, 0.355]), 0.085), 0.06, 'snout', 'head'); // 수염 패드
      push(sph(add(H, [0, -0.25, 0.31]), 0.06), 0.05, 'snout', 'head');
      for (const [sx] of SIDES) pointyEar(push, paint, sx, { base: add(H, [sx * 0.23, 0.26, -0.02]), tip: add(H, [sx * 0.31, 0.58, -0.04]), r1: 0.12, r2: 0.035, s: 0.7, inner: 'mane' });
      // 물음표 꼬리 (둥근 원뿔 사슬)
      const seg = [[0, 0, -0.04, 0.065], [0, -0.03, -0.24, 0.06], [0, 0.13, -0.42, 0.057], [0, 0.38, -0.47, 0.055], [0, 0.56, -0.38, 0.055]];
      const sb = ['tail', 'tail2', 'tail3', 'tail3'];
      for (let i = 0; i < seg.length - 1; i++) push(rcone(add(T, seg[i]), add(T, seg[i + 1]), seg[i][3], seg[i + 1][3]), i === 0 ? 0.07 : 0.02, 'body', sb[i]);
      paint(ell(add(H, [0, -0.13, 0.33]), [0.2, 0.15, 0.15]), 'snout', 1);
      paint(ell([0, 0.74, 0.2], [0.14, 0.22, 0.12]), 'snout', 1);
      for (const [sx] of SIDES) { paint(cap([sx * 0.135, 0.13, 0.03], [sx * 0.135, 0, 0.07], 0.14), 'hoof', 1); paint(sph([sx * 0.43, 0.485, 0.065], 0.095), 'hoof', 1); }
      for (const x of [-0.08, 0, 0.08]) paint(cap(add(H, [x, 0.2, 0.33]), add(H, [x * 1.3, 0.37, 0.18]), 0.024), 'maneD', 2); // 이마 M
      for (const [sx] of SIDES) for (const dy of [0, -0.08]) paint(cap(add(H, [sx * 0.33, 0.04 + dy, 0.2]), add(H, [sx * 0.43, 0.06 + dy, 0.05]), 0.022), 'maneD', 2); // 볼 줄무늬
      for (const y of [0.56, 0.68, 0.8]) paint(inter(band([0, y, -0.2], [0, 1, 0.25], 0.026, 0.4), half([0, 0, 1], -0.04)), 'maneD', 2); // 등 줄무늬
      for (const k of [1, 2, 3]) { const a = seg[k], b = seg[k + 1]; paint(band(add(T, mul(add(a, b), 0.5)), sub(b, a), 0.03, 0.09), 'maneD', 2); } // 꼬리 고리
    },
    face: {
      eye: [0.37, 0.08, 0.92], cheek: [0.6, -0.26, 0.75], brow: [0.34, 0.3, 0.89],
      nose: { o: [0, -0.12, 0.3], d: [0, 0.2, 1] },
      mouth: { o: [0, -0.17, 0.3], y: -0.18, z: 0.45, w: 0.1, depth: 0.02, style: 'w' },
      whiskers: { o: [0, -0.17, 0.36], d: [[1, 0.17, 0.25], [1, 0, 0.25], [1, -0.17, 0.25]] },
    },
    wear: { rings: { neck: { y: 0.91, tilt: 0.12, off: 0.01 } }, chest: [0.86, -0.4] },
  },

  rabbit: {
    scale: 0.85,
    rig: { earAt: [0.13, 0.35, -0.08], tail2: [0, 0, -0.06], tail3: [0, 0, -0.03], ear2: [0.05, 0.31, -0.03] },
    bounds: [[-0.72, -0.03, -0.62], [0.72, 2.45, 0.95]],
    body: { r0: 0.27, r1: 0.14, sq: 1.0, belly: 0.27, bz: 0.07, foot: { rx: 0.1, ry: 0.06, rz: 0.19, y: 0.06, z: 0.09 } }, // 동글
    head: { c: [0, 0, 0], r: [0.43, 0.41, 0.41] },
    build(push, paint) {
      push(ell(H, [0.43, 0.41, 0.41]), 0.16, 'body', 'head');
      for (const [sx] of SIDES) push(ell(add(H, [sx * 0.22, -0.17, 0.22]), [0.14, 0.12, 0.12]), 0.1, 'body', 'head'); // 통통 볼
      for (const [sx] of SIDES) push(sph(add(H, [sx * 0.065, -0.15, 0.36]), 0.075), 0.06, 'snout', 'head');
      push(sph(add(H, [0, -0.22, 0.32]), 0.055), 0.05, 'snout', 'head');
      // 두 마디 긴 귀. 판 두께 s 0.75 + 귀 면을 바깥으로 0.5rad 돌림 → 옆에서도 넓은 잎 (뿔·부리처럼 안 보이게, 규칙 6)
      // 왼쪽 위 마디는 SDF 안에서 접힌 채로 굽기 (쉬는 자세에 주름 없음)
      for (const [sx, s] of SIDES) {
        const n = unit([sx * Math.sin(0.5), 0.05, Math.cos(0.5)]), S = 0.75;
        const base = add(H, [sx * 0.13, 0.33, -0.08]), mid = add(H, [sx * 0.18, 0.66, -0.11]);
        const wl = add(H, [sx * 0.17, 0.56, -0.1]);
        push(flat(rcone(base, mid, 0.085, 0.1), base, n, S), 0.06, 'body', 'ear' + s);
        push(flat(ell(wl, [0.095, 0.16, 0.09]), wl, n, S), 0.05, 'body', 'ear' + s);
        paint(inter(flat(rcone(add(base, [0, 0.05, 0]), sub(mid, [0, 0.02, 0]), 0.055, 0.065), base, n, 2), front(n, base, 0.004)), 'mane', 2);
        // 위 마디 (오른쪽 모양) → 왼쪽은 mid 에서 접어 머리 옆으로 늘어뜨림
        const tip = add(H, [sx * 0.21, 0.98, -0.12]), wu = add(H, [sx * 0.19, 0.82, -0.115]);
        let up = flat(rcone(mid, tip, 0.1, 0.065), mid, n, S), upW = flat(ell(wu, [0.09, 0.16, 0.085]), wu, n, S);
        let inner = inter(flat(rcone(add(mid, [0, 0.03, 0]), sub(tip, [0, 0.07, 0]), 0.065, 0.04), mid, n, 2), front(n, mid, 0.004));
        let tipP = tip;
        if (sx < 0) {
          // 접힌 끝 (귀의 위 1/3): 0.34m 를 mid 에서 바깥·아래·앞으로 → 머리 옆으로 늘어진 접힌 귀 (뭉툭한 엄지·깃발처럼 안 보이게)
          // 넓힘 타원·안쪽 색·판 법선도 같은 회전으로 따라감
          const k = 0.34 / len(sub(tip, mid)), tS = add(mid, mul(sub(tip, mid), k)), wS = add(mid, mul(sub(wu, mid), k));
          const m = rotTo(sub(tip, mid), [-0.7, -0.5, 0.45]);
          up = rotAbout(flat(rcone(mid, tS, 0.1, 0.065), mid, n, S), mid, m);
          upW = rotAbout(flat(ell(wS, [0.09, 0.16 * k, 0.085]), wS, n, S), mid, m);
          inner = rotAbout(inter(flat(rcone(add(mid, [0, 0.03 * k, 0]), sub(tS, [0, 0.07 * k, 0]), 0.065, 0.04), mid, n, 2), front(n, mid, 0.004)), mid, m);
          tipP = add(mid, applyM(m, sub(tS, mid)));
        }
        push(up, 0.04, 'body', 'ear' + s + '2');
        push(upW, 0.04, 'body', 'ear' + s + '2');
        paint(inner, 'mane', 2);
        paint(sph(tipP, 0.1), 'maneD', 3); // 귀 끝
      }
      push(sph(add(T, [0, 0.05, -0.08]), 0.12), 0.06, 'snout', 'tail'); // 솜방울 꼬리
      paint(ell([0, 0.55, 0.26], [0.18, 0.24, 0.12]), 'snout', 1); // 배
    },
    face: {
      eye: [0.36, 0.1, 0.92], cheek: [0.55, -0.3, 0.78], brow: [0.34, 0.32, 0.88],
      nose: { o: [0, -0.1, 0.3], d: [0, 0.15, 1] },
      mouth: { o: [0, -0.18, 0.32], y: -0.19, z: 0.46, w: 0.11, depth: 0.018, style: 'Y' },
      teeth: { o: [0, -0.2, 0.32], d: [0, -0.05, 1] },
      whiskers: { o: [0, -0.15, 0.36], d: [[1, 0.1, 0.3], [1, -0.08, 0.3]] },
      bow: { o: [-0.13, 0.4, -0.08], d: [-0.55, 0.15, 1] },
    },
    wear: {
      rings: { neck: { y: 0.91, tilt: 0.12, off: 0.02 } }, chest: [0.74, -0.25],
      bib: { y: [0.48, 0.78], phi: [-0.55, 0.55], nx: 5, ny: 4, off: 0.025 },
      // 멜빵 끈: 앞판 위 모서리 → 어깨 → 등에서 엇갈려(y 0.66) 반대쪽으로, 솜꼬리(위 끝 0.59) 위에서 끝남
      strap: { pts: [[0.78, 0.42], [0.88, 0.8], [0.93, 1.57], [0.87, 2.35], [0.74, 2.78], [0.66, 3.14], [0.625, 3.5]], off: 0.02 },
    },
  },
};

// ------------------------------------------------------------------ 모양 만들기
/**
 * 종 모양 → { P (모양: 스킨·SDF), PAINT (색만), bones, bounds, sigma, sdf, def }
 * @param opts.thick 귀·꼬리 뼈 모양을 이만큼 두껍게 (LOD 전용)
 */
export function speciesShape(sp, { thick = 0 } = {}) {
  const def = SPECIES_SHAPES[sp];
  if (!def) throw new Error('모르는 종: ' + sp);
  const P = [], PAINT = [];
  const THIN = /^(ear|tail)/;
  const push = (f, k, slot, bone) => P.push({ f: thick && THIN.test(bone) ? ((g) => (x, y, z) => g(x, y, z) - thick)(f) : f, k, slot, bone });
  const paint = (f, slot, layer = 1, w = 0.02) => PAINT.push({ f, slot, layer, w });
  commonBody(push, def.body, def.rig.armX ?? 0.27);
  def.build(push, paint, { H, T, B });
  const sdf = (x, y, z) => {
    let d = P[0].f(x, y, z);
    for (let i = 1; i < P.length; i++) d = smin(d, P[i].f(x, y, z), P[i].k);
    return d;
  };
  return { P, PAINT, bones: rigBones(def.rig), bounds: def.bounds, sigma: SIGMA, sdf, def };
}

/** FNV-1a 32비트: 모양 숫자·함수 코드 + 공통 코드 + 버전 → 굽지 않고 모양만 고치면 테스트가 잡음 */
export function shapeHash(sp) {
  const def = SPECIES_SHAPES[sp];
  const json = JSON.stringify(def, (k, v) => (typeof v === 'function' ? v.toString() : v));
  const s = `${SHAPES_VERSION}|${json}|${commonBody}|${pointyEar}|${rigBones}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// ------------------------------------------------------------------ 굽는 meta (얼굴·옷 기준점, 뼈대)
const V3 = (a) => new THREE.Vector3(...a);
/** 그 점의 주 색 슬롯 (볼 색을 밑색과 섞을 때) */
function slotAt(shape, p) {
  const w = new Float64Array(5);
  let dmin = Infinity;
  const d = shape.P.map((q) => { const v = q.f(p[0], p[1], p[2]); if (v < dmin) dmin = v; return v; });
  d.forEach((v, q) => { w[SLOTS.indexOf(shape.P[q].slot)] += Math.exp(-(v - dmin) / 0.01); });
  const tot = w.reduce((a, b) => a + b, 0);
  for (let s = 0; s < 5; s++) w[s] /= tot;
  for (const q of [...shape.PAINT].sort((a, b) => a.layer - b.layer)) {
    const a = Math.max(0, Math.min(1, 0.5 - q.f(p[0], p[1], p[2]) / (q.w || 0.02)));
    if (a <= 0) continue;
    for (let s = 0; s < 5; s++) w[s] *= 1 - a;
    w[SLOTS.indexOf(q.slot)] += a;
  }
  let best = 0;
  for (let s = 1; s < 5; s++) if (w[s] > w[best]) best = s;
  return best;
}

/**
 * meta JSON (§5.4): 뼈대, 머리, 얼굴·옷 기준점. 원본 SDF(thick 0)로 계산 — 원본·LOD bin 에 같은 내용
 * @param extra.top 원본 메시 표면 최대 y (스케일 전)
 */
export function bakeMeta(sp, shape = speciesShape(sp), extra = {}) {
  const def = shape.def, F = def.face, W = def.wear;
  const sdf = shape.sdf;
  // 옷 고리·몸통 점은 몸통·머리·다리만으로 (꼬리·팔·귀를 감싸 훌라후프처럼 커지지 않게)
  const TP = shape.P.filter((q) => !/^(ear|tail|arm)/.test(q.bone));
  const tsdf = (x, y, z) => { let d = TP[0].f(x, y, z); for (let i = 1; i < TP.length; i++) d = smin(d, TP[i].f(x, y, z), TP[i].k); return d; };
  const HC = V3(H);
  const pack = (pw) => { const n = normalAt(sdf, pw); return { p: r4v(pw.clone().sub(HC).toArray()), n: r4v(n.toArray()), s: slotAt(shape, pw.toArray()) }; };
  const onFace = (dir) => pack(surfacePoint(sdf, HC, V3(dir)));
  const onFrom = (o, d) => pack(surfacePoint(sdf, HC.clone().add(V3(o)), V3(d)));
  const anchors = {};
  for (const [sx, s] of SIDES) {
    anchors['eye' + s] = onFace(mx(F.eye, sx));
    if (F.cheek) anchors['cheek' + s] = onFace(mx(F.cheek, sx));
    if (F.brow) anchors['brow' + s] = onFace(mx(F.brow, sx));
    if (F.whiskers) anchors['whisker' + s] = F.whiskers.d.map((d) => { const a = onFrom(mx(F.whiskers.o, sx), mx(d, sx)); return { p: a.p, n: a.n }; });
  }
  anchors.nose = onFrom(F.nose.o, F.nose.d);
  if (F.teeth) anchors.teeth = onFrom(F.teeth.o, F.teeth.d);
  anchors.forehead = onFace([0, 0.62, 0.78]);
  anchors.crown = onFace([0, 1, -0.08]);
  if (F.bow) {
    // 리본: 왼쪽 귀 뼈 기준 (접힌 귀 뿌리)
    const a = onFrom(F.bow.o, F.bow.d), ear = shape.bones.find((b) => b[0] === 'earL')[2];
    anchors.bowL = { bone: 'earL', p: r4v(sub(a.p, ear)), n: a.n };
  }
  // 입·눈꺼풀·주름 선 (머리 기준 폴리라인, 표면 0.004 위)
  const M = F.mouth;
  const ray = (target) => { const o = add(H, M.o); const pw = surfacePoint(sdf, V3(o), V3(sub(add(H, target), o))); const n = normalAt(sdf, pw); return r4v(pw.addScaledVector(n, 0.004).sub(HC).toArray()); };
  const smile = (w, depth, cx = 0, lift = 0) => Array.from({ length: 9 }, (_, i) => { const t = i / 8; return ray([cx - w / 2 + w * t, M.y - Math.sin(t * Math.PI) * depth + lift * t, M.z]); });
  anchors.mouthC = (() => { const o = add(H, M.o), pw = surfacePoint(sdf, V3(o), V3(sub(add(H, [0, M.y - M.depth * 0.5, M.z]), o))); return pack(pw); })();
  const lines = {};
  if (M.style === 'smirk') lines.mouth = [smile(M.w, M.depth, 0, 0.02)];
  else if (M.style === 'gentle') lines.mouth = [smile(M.w, M.depth)];
  else lines.mouth = [smile(M.w / 2, M.depth, -M.w / 4), smile(M.w / 2, M.depth, M.w / 4)]; // 'w'·'ω'·'Y'
  if (M.style === 'Y') {
    const np = add(anchors.nose.p, [0, -0.02, 0]);
    lines.Y = [Array.from({ length: 4 }, (_, i) => ray([0, np[1] - (i / 3) * (np[1] - M.y), M.z]))];
  }
  const eyeLine = (e, pts) => pts.map(([dx, dy]) => { const pw = surfacePoint(sdf, HC, V3(add(e.p, [dx, dy, 0]))); const n = normalAt(sdf, pw); return r4v(pw.addScaledVector(n, 0.004).sub(HC).toArray()); });
  if (F.lids) lines.lids = SIDES.map(([sx], k) => eyeLine(anchors[k ? 'eyeR' : 'eyeL'], [-1, -0.5, 0, 0.5, 1].map((t) => [t * 0.045, 0.075 + (1 - t * t) * 0.012 + sx * t * 0.012])));
  if (F.crinkle) lines.crinkle = SIDES.flatMap(([sx], k) => { const e = anchors[k ? 'eyeR' : 'eyeL']; return [0.025, -0.02].map((dy) => eyeLine(e, [[sx * 0.075, dy], [sx * 0.1, dy + (dy > 0 ? 0.012 : -0.01)], [sx * 0.12, dy + (dy > 0 ? 0.02 : -0.016)]])); });

  // 몸통·머리 고리 (몸통 뼈 기준, 표면에서 off 만큼 띄움)
  // 몸통·머리 고리: 점(pts)과 그 점의 표면 법선(ns — 납작한 띠 단면을 표면에 눕힐 때). dip: 앞쪽을 그만큼 아래로 (허리 띠가 늘어지게)
  const ringAt = (center, tilt, off, bone = 'body', dip = 0) => {
    const q = new THREE.Quaternion().setFromAxisAngle(V3([1, 0, 0]), tilt);
    const pts = [], ns = [];
    for (let i = 0; i < 16; i++) {
      const ph = (i / 16) * Math.PI * 2;
      const d = V3([Math.sin(ph), 0, Math.cos(ph)]).applyQuaternion(q);
      const c = V3(center);
      c.y -= dip * Math.max(0, Math.cos(ph)) ** 2;
      const pw = surfacePoint(tsdf, c, d);
      const n = normalAt(tsdf, pw);
      pw.addScaledVector(n, off);
      pts.push(r4v(sub(pw.toArray(), bone === 'head' ? H : B)));
      ns.push(r4v(n.toArray()));
    }
    return { bone, pts, ns };
  };
  /** 고글 끈 (머리 뼈): 이마 앵커와 뒤통수(머리 중심 y + back) 를 지나는 기울어진 평면에서 표면을 따라 24점 */
  const goggleRing = ({ back, off }) => {
    const F = add(H, anchors.forehead.p), Bk = add(H, [0, back, -def.head.r[2]]);
    const w = V3(unit(sub(F, Bk))), X = V3([1, 0, 0]), c = V3(mul(add(F, Bk), 0.5));
    const pts = [], ns = [];
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      const pw = surfacePoint(tsdf, c, X.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)));
      const n = normalAt(tsdf, pw);
      pw.addScaledVector(n, off);
      pts.push(r4v(sub(pw.toArray(), H))); ns.push(r4v(n.toArray()));
    }
    return { bone: 'head', pts, ns };
  };
  const rings = {};
  for (const [k, r] of Object.entries(W.rings || {})) {
    rings[k] = k === 'headband' ? ringAt(add(H, applyM(rotTo([0, 1, 0], [0, Math.cos(r.tilt), Math.sin(r.tilt)]), [0, r.y, 0])), r.tilt, r.off, 'head')
      : k === 'goggle' ? goggleRing(r) : ringAt([0, r.y, 0.01], r.tilt ?? 0, r.off, 'body', r.dip);
  }
  // 몸빼 (곰): 허리~엉덩이 고리 여러 줄 → 런타임이 이어 붙이고, 다리 통은 limbs.leg 로 따로 (다리 뼈에 스킨)
  if (W.momppe) rings.momppe = { bone: 'body', loops: W.momppe.ys.map((y, i) => ringAt([0, y, 0.01], 0, W.momppe.offs[i]).pts) };
  // 몸통 표면 점 (높이 y, 방위각 phi: 0 = 정면, + = 오른쪽)
  const bodyAt = (y, ph, off) => { const pw = surfacePoint(tsdf, V3([0, y, 0.01]), V3([Math.sin(ph), 0, Math.cos(ph)])); const n = normalAt(tsdf, pw); pw.addScaledVector(n, off); return { p: r4v(sub(pw.toArray(), B)), n: r4v(n.toArray()) }; };
  if (W.chest) anchors.chest = bodyAt(W.chest[0], W.chest[1], 0.012);
  const patches = {}, paths = {};
  if (W.bib) {
    const { y, phi, nx, ny, off } = W.bib, pts = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(bodyAt(y[0] + ((y[1] - y[0]) * j) / (ny - 1), phi[0] + ((phi[1] - phi[0]) * i) / (nx - 1), off).p);
    patches.bib = { nx, ny, pts };
  }
  // 멜빵 끈 (점 + 표면 법선). 등에서 엇갈리는 곳이 겹치지 않게 왼쪽 끈을 조금 더 띄움
  if (W.strap) for (const [sx, s] of SIDES) {
    const list = W.strap.pts.map(([y, ph]) => bodyAt(y, sx * ph, W.strap.off + (sx < 0 ? 0.008 : 0)));
    paths['strap' + s] = list.map((a) => a.p);
    paths['strap' + s + 'N'] = list.map((a) => a.n);
  }
  // 다리 (몸빼): 다리 뼈 기준 rcone 축과 반지름
  const leg = def.body.leg ?? [0.112, 0.1], legBone = shape.bones.find((b) => b[0] === 'legR')[2];
  const legW = add(B, legBone);
  const limbs = { leg: { a: r4v(sub([0.135, 0.34, 0], legW)), b: r4v(sub([0.135, 0.11, 0.015], legW)), r1: leg[0], r2: leg[1] } };
  // 몸빼 바짓가랑이 맞춤: 오른 다리 축(루트 x 0.135)에서 높이마다 16방향(0 = 앞 +z, 4 = 바깥 +x) 몸 표면까지 거리 (몸통·다리만, 안쪽은 런타임이 자름)
  if (W.momppe?.legYs) {
    const A = [0.135, 0.34, 0], Bv = [0.135, 0.11, 0.015];
    limbs.leg.fit = {
      ys: W.momppe.legYs,
      r: W.momppe.legYs.map((y) => {
        const t = (A[1] - y) / (A[1] - Bv[1]), cz = A[2] + (Bv[2] - A[2]) * t, o = V3([A[0], y, cz]);
        return Array.from({ length: 16 }, (_, i) => { const th = (i / 16) * Math.PI * 2; return Math.round(surfacePoint(tsdf, o, V3([Math.sin(th), 0, Math.cos(th)])).distanceTo(o) * 1000) / 1000; });
      }),
    };
  }
  const hr = def.head.r;
  return {
    v: 1, species: sp, rig: 'v_' + sp, scale: def.scale,
    bones: shape.bones.map(([n, p, at]) => [n, p, r4v(at)]),
    legLen: 0.32, headR: r4((hr[0] + hr[1] + hr[2]) / 3),
    top: r4(extra.top ?? 0), bounds: def.bounds,
    head: { c: r4v(def.head.c), r: hr },
    anchors, lines, rings, patches, paths, limbs,
  };
}
