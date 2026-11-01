import * as THREE from 'three';

/**
 * 유니코 '한 덩어리' 메시 생성기
 * 몸·목·머리·주둥이·귀·다리·발굽·갈기·꼬리를 부호 거리 함수(SDF)로 정의하고
 * 스무스 유니온으로 녹여 이음새 없는 하나의 표면을 만든 뒤(Surface Nets 로 메시 추출),
 * 부위별 뼈(몸통·머리·다리 4·꼬리)에 부드러운 스킨 가중치를 줘서 관절이 자연스럽게 휘게 한다.
 * 좌표: 발바닥 y=0, 정면 +Z, 단위 m.
 */

// ------------------------------------------------------------------ 뼈 (unico.js 의 피벗과 동일한 위치)
export const BODY_Y = 0.8;
export const HEAD_AT = new THREE.Vector3(0, 0.78, 0.66); // 몸통 기준
export const LEG_AT = [[-0.25, -0.2, 0.36], [0.25, -0.2, 0.36], [-0.25, -0.2, -0.38], [0.25, -0.2, -0.38]];
export const TAIL_AT = new THREE.Vector3(0, 0.12, -0.56);
export const BONES = ['body', 'head', 'legFL', 'legFR', 'legBL', 'legBR', 'tail'];
export const SLOTS = ['body', 'snout', 'mane', 'maneD', 'hoof'];

const B = new THREE.Vector3(0, BODY_Y, 0);
const H = B.clone().add(HEAD_AT); // 머리 중심 (월드, 루트 기준)
const T = B.clone().add(TAIL_AT);

// ------------------------------------------------------------------ SDF 프리미티브
const sph = (c, r) => (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
/** 회전 가능한 타원체 (근사 SDF) */
function ell(c, rad, rotZ = 0, rotX = 0) {
  const cz = Math.cos(-rotZ), sz = Math.sin(-rotZ), cx = Math.cos(-rotX), sx = Math.sin(-rotX);
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    const rx = px * cz - py * sz, ry = px * sz + py * cz; px = rx; py = ry; // z축 역회전
    const ry2 = py * cx - pz * sx, rz2 = py * sx + pz * cx; py = ry2; pz = rz2; // x축 역회전
    const k0 = Math.hypot(px / rad[0], py / rad[1], pz / rad[2]);
    const k1 = Math.hypot(px / (rad[0] * rad[0]), py / (rad[1] * rad[1]), pz / (rad[2] * rad[2]));
    return k1 === 0 ? -Math.min(...rad) : (k0 * (k0 - 1)) / k1;
  };
}
function cap(a, b, r) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const bb = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / bb));
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  };
}
/** 둥근 원기둥 (발굽) */
function rcyl(c, r, hh, round) {
  return (x, y, z) => {
    const dx = Math.hypot(x - c[0], z - c[2]) - r + round, dy = Math.abs(y - c[1]) - hh + round;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
  };
}
const add = (v, o) => [v.x + o[0], v.y + o[1], v.z + o[2]];

/** 프리미티브 목록: f(SDF), k(녹이는 정도), slot(색), bone(뼈) */
function primitives() {
  const P = [];
  const push = (f, k, slot, bone) => P.push({ f, k, slot, bone });
  // 몸통: 길쭉한 타원 + 가슴 + 엉덩이 → 둥근 콩 모양
  push(ell([0, BODY_Y, 0], [0.43, 0.39, 0.58]), 0, 'body', 'body');
  push(sph([0, 0.75, 0.3], 0.33), 0.16, 'body', 'body');
  push(sph([0, 0.84, -0.34], 0.33), 0.16, 'body', 'body');
  // 목: 가슴에서 머리까지 굵게 이어짐
  push(cap([0, 0.98, 0.36], [0, 1.4, 0.6], 0.2), 0.16, 'body', 'body');
  // 머리 + 주둥이
  push(ell([H.x, H.y, H.z], [0.42, 0.4, 0.41]), 0.14, 'body', 'head');
  push(ell(add(H, [0, -0.15, 0.3]), [0.25, 0.21, 0.27]), 0.1, 'snout', 'head');
  // 귀 (바깥으로 기울어진 잎 모양)
  for (const sx of [-1, 1]) push(ell(add(H, [sx * 0.24, 0.36, -0.04]), [0.075, 0.16, 0.06], sx * -0.45), 0.06, 'body', 'head');
  // 다리 + 발굽
  LEG_AT.forEach(([lx, ly, lz], i) => {
    const hip = [lx, BODY_Y + ly, lz];
    const bone = BONES[2 + i];
    push(cap([hip[0], hip[1] + 0.06, hip[2]], [hip[0], 0.16, hip[2]], 0.125), 0.11, 'body', bone);
    push(rcyl([hip[0], 0.075, hip[2] + 0.01], 0.142, 0.075, 0.035), 0.03, 'hoof', bone);
  });
  // 갈기: 정수리 → 뒤통수 → 목 뒤로 흐르는 곱슬 (머리/몸통 뼈)
  const headMane = [[0, 0.37, -0.1, 0.17], [0, 0.25, -0.29, 0.17], [0, 0.06, -0.38, 0.16], [0.14, 0.33, 0.17, 0.1], [0.03, 0.39, 0.1, 0.095], [-0.12, 0.34, 0.03, 0.09]];
  headMane.forEach(([x, y, z, r], i) => push(sph(add(H, [x, y, z]), r), 0.05, i % 2 ? 'maneD' : 'mane', 'head'));
  const neckMane = [[0, 0.7, 0.46, 0.15], [0, 0.56, 0.38, 0.15], [0, 0.42, 0.3, 0.14], [0, 0.29, 0.22, 0.12]];
  neckMane.forEach(([x, y, z, r], i) => push(sph(add(B, [x, y, z]), r), 0.05, i % 2 ? 'maneD' : 'mane', 'body'));
  // 꼬리: 엉덩이에서 뒤로 나와 위로 말림
  const tail = [[0, 0, -0.06, 0.13], [0, 0.11, -0.19, 0.145], [0, 0.28, -0.25, 0.13], [0, 0.44, -0.21, 0.105], [0, 0.55, -0.12, 0.075]];
  tail.forEach(([x, y, z, r], i) => push(sph(add(T, [x, y, z]), r), i === 0 ? 0.08 : 0.05, i % 2 ? 'maneD' : 'mane', 'tail'));
  return P;
}

const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export function makeSDF() {
  const P = primitives();
  const sdf = (x, y, z) => {
    let d = P[0].f(x, y, z);
    for (let i = 1; i < P.length; i++) d = smin(d, P[i].f(x, y, z), P[i].k);
    return d;
  };
  return { P, sdf };
}

/** 표면 위 점: 시작점에서 dir 방향으로 진행해 표면(0)을 찾음 */
export function surfacePoint(sdf, from, dir) {
  const d = dir.clone().normalize();
  let a = 0, b = 0, p = from.clone();
  for (b = 0.01; b < 2; b += 0.01) { p.copy(from).addScaledVector(d, b); if (sdf(p.x, p.y, p.z) > 0) break; a = b; }
  for (let i = 0; i < 20; i++) { const m = (a + b) / 2; p.copy(from).addScaledVector(d, m); if (sdf(p.x, p.y, p.z) > 0) b = m; else a = m; }
  return from.clone().addScaledVector(d, (a + b) / 2);
}

export function normalAt(sdf, p, e = 0.004) {
  return new THREE.Vector3(
    sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
    sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
    sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
  ).normalize();
}

/**
 * Surface Nets 로 메시 추출 + 부드러운 법선(SDF 기울기) + 색 슬롯 가중치 + 스킨 가중치
 * @returns { geometry (position, normal, skinIndex, skinWeight, index), slotWeights: Float32Array(n*5), sdf }
 */
export function buildUnicoGeometry(step = 0.022) {
  const { P, sdf } = makeSDF();
  const min = [-0.66, -0.03, -1.02], max = [0.66, 2.2, 1.28];
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) field[id(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step);

  // 셀마다 꼭짓점 1개 (부호가 바뀌는 모서리 교차점의 평균)
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = field[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    cellVert[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  // 부호가 바뀌는 격자 모서리마다 주변 4셀의 꼭짓점으로 사각형
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = field[id(i, j, k)] < 0, b = field[id(i + 1, j, k)] < 0;
    if (a !== b) quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], b);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = field[id(i, j, k)] < 0, b = field[id(i, j + 1, k)] < 0;
    if (a !== b) quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], b);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = field[id(i, j, k)] < 0, b = field[id(i, j, k + 1)] < 0;
    if (a !== b) quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], b);
  }

  const nV = pos.length / 3;
  const p = new THREE.Vector3();
  // 꼭짓점을 실제 표면으로 한 번 끌어당겨(뉴턴 1스텝) 더 매끈하게 + 법선
  const nor = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const n = normalAt(sdf, p);
    const d = sdf(p.x, p.y, p.z);
    p.addScaledVector(n, -d);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    const n2 = normalAt(sdf, p);
    nor[i * 3] = n2.x; nor[i * 3 + 1] = n2.y; nor[i * 3 + 2] = n2.z;
  }
  // 삼각형 방향을 법선과 맞춤
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    A.fromArray(pos, idx[t] * 3); Bv.fromArray(pos, idx[t + 1] * 3); Cv.fromArray(pos, idx[t + 2] * 3);
    fn.subVectors(Bv, A).cross(Cv.sub(A));
    const vn = new THREE.Vector3(nor[idx[t] * 3], nor[idx[t] * 3 + 1], nor[idx[t] * 3 + 2]);
    if (fn.dot(vn) < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }

  // 색 슬롯 / 스킨 가중치
  const slotW = new Float32Array(nV * SLOTS.length);
  const skinIndex = new Uint16Array(nV * 4), skinWeight = new Float32Array(nV * 4);
  const dist = new Float32Array(P.length);
  const bw = new Float32Array(BONES.length);
  for (let i = 0; i < nV; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let dmin = Infinity;
    for (let q = 0; q < P.length; q++) { dist[q] = P[q].f(x, y, z); if (dist[q] < dmin) dmin = dist[q]; }
    // 색: 가장 가까운 프리미티브 색, 경계는 살짝 부드럽게
    let tot = 0;
    for (let q = 0; q < P.length; q++) {
      const w = Math.exp(-(dist[q] - dmin) / 0.01);
      slotW[i * SLOTS.length + SLOTS.indexOf(P[q].slot)] += w;
      tot += w;
    }
    for (let s = 0; s < SLOTS.length; s++) slotW[i * SLOTS.length + s] /= tot;
    // 스킨: 가까운 뼈일수록 크게 (관절 주변은 두 뼈가 나눠 가짐)
    bw.fill(0);
    for (let q = 0; q < P.length; q++) bw[BONES.indexOf(P[q].bone)] += Math.exp(-Math.max(0, dist[q] - dmin) / 0.035);
    const order = [...bw.keys()].sort((a, b) => bw[b] - bw[a]).slice(0, 4);
    const sum = order.reduce((s, b) => s + bw[b], 0);
    order.forEach((b, o) => { skinIndex[i * 4 + o] = b; skinWeight[i * 4 + o] = bw[b] / sum; });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { geometry: geo, slotWeights: slotW, sdf, stats: { verts: nV, tris: idx.length / 3, grid: [nx, ny, nz] } };
}

/** 팔레트 색으로 꼭짓점 색 속성 생성 (위치·인덱스는 공유) */
export function colorAttribute(slotWeights, palette) {
  const n = slotWeights.length / SLOTS.length;
  const cols = SLOTS.map((s) => new THREE.Color(palette[s]));
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = 0, g = 0, b = 0;
    for (let s = 0; s < SLOTS.length; s++) { const w = slotWeights[i * SLOTS.length + s]; r += cols[s].r * w; g += cols[s].g * w; b += cols[s].b * w; }
    arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b;
  }
  return new THREE.BufferAttribute(arr, 3);
}

/** build-unico-mesh.mjs 가 만든 바이너리 → { geometry, slotWeights } */
export function parseUnicoBin(ab) {
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x554e4943) throw new Error('bad unico mesh');
  const n = dv.getUint32(4, true), ni = dv.getUint32(8, true);
  let o = 16;
  const pos = new Float32Array(ab.slice(o, o + n * 12)); o += n * 12;
  const nor = new Int8Array(ab, o, n * 3); o += n * 3;
  const si = new Uint8Array(ab, o, n * 4); o += n * 4;
  const sw = new Uint8Array(ab, o, n * 4); o += n * 4;
  const sl = new Uint8Array(ab, o, n * SLOTS.length); o += n * SLOTS.length;
  const wide = n > 65535;
  if (o % (wide ? 4 : 2)) o += (wide ? 4 : 2) - (o % (wide ? 4 : 2));
  const index = wide ? new Uint32Array(ab.slice(o, o + ni * 4)) : new Uint16Array(ab.slice(o, o + ni * 2));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nor), 3, true));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(si), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(sw), 4, true));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const slotWeights = new Float32Array(sl.length);
  for (let i = 0; i < sl.length; i++) slotWeights[i] = sl[i] / 255;
  return { geometry: geo, slotWeights };
}
