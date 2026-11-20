import * as THREE from 'three';
import { V as V3, mat, shiny, mesh, sphere, tube, flat, lathe, paint, C, mixC, smooth, rng, group, cyl } from './kit.js';

/**
 * 과일·밭 작물·목장 생산물 아이콘 (위 = +y, 앞 = +z)
 *  과일: 사과 · 복숭아 · 배 · 감(꽃받침)   작물: 당근 · 양배추 · 토마토 · 딸기 · 옥수수   생산물: 달걀 · 우유 · 양털 · 꿀
 */
const STEM = 0x6a4a2a;
const leafMat = () => mat(0xffffff, { vc: true, rough: 0.55, side: THREE.DoubleSide });

/** 잎 하나 (가운데 잎맥이 연한 색) */
export function leaf(len = 0.3, wid = 0.13, c = 0x5aa83a) {
  const geo = flat([[0, 0], [len * 0.3, wid * 0.5], [len * 0.7, wid * 0.45], [len, 0], [len * 0.7, -wid * 0.45], [len * 0.3, -wid * 0.5]], 0.012, true);
  paint(geo, (x, y) => mixC(c, 0xd8f0a0, (1 - smooth(0.004, 0.014, Math.abs(y))) * 0.6 * smooth(len, 0, x)).lerp(C(0x2e6a22), 0.25 * smooth(0, wid * 0.5, Math.abs(y))));
  return mesh(geo, leafMat());
}
/** 둥근 과일 몸: 아래·위 오목, lobes 골 개수, 색칠 함수 */
function fruitBody(pts, fn, { lobes = 0, lobeD = 0.03, crease = 0 } = {}) {
  const geo = lathe(pts, 48);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    let k = 1;
    if (lobes) k -= lobeD * (0.5 - 0.5 * Math.cos(a * lobes));
    if (crease) k -= crease * Math.exp(-Math.pow((((a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / 0.18, 2));
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  geo.computeVertexNormals();
  if (fn) paint(geo, fn);
  return geo;
}
const stem = (top, len = 0.12, r = 0.022, bend = 0.04) => mesh(tube([[0, top - 0.04, 0], [bend * 0.3, top + len * 0.5, 0], [bend, top + len, 0]], r, 8, 6), mat(STEM, { rough: 0.7 }));
const speckle = (seed, n, r) => { const R = rng(seed), d = []; for (let i = 0; i < n; i++) d.push([R() * Math.PI * 2, R() * 0.8 + 0.1, r * (0.6 + R() * 0.6)]); return d; };
/** 점 무늬 (lathe 좌표: 각도·높이 비율) */
function dots(x, y, z, list, h0, h1) {
  const a = Math.atan2(z, x), t = (y - h0) / (h1 - h0);
  let k = 0;
  for (const [da, dt, dr] of list) { const d = Math.hypot(Math.atan2(Math.sin(a - da), Math.cos(a - da)) * 0.4, (t - dt) * 0.6); k = Math.max(k, 1 - smooth(dr * 0.5, dr, d)); }
  return k;
}

// ---------------------------------------------------------------- 과일
const APPLE = [[0, 0.04], [0.14, 0], [0.32, 0.06], [0.44, 0.2], [0.47, 0.36], [0.42, 0.52], [0.3, 0.61], [0.14, 0.6], [0.05, 0.54], [0, 0.5]];
function apple() {
  const sp = speckle(11, 40, 0.035);
  const geo = fruitBody(APPLE, (x, y, z) => mixC(0xd8322a, 0xe8c050, 0.55 * smooth(0.1, -0.45, z) * smooth(0.6, 0.2, y)).lerp(C(0xf6e0a0), 0.5 * dots(x, y, z, sp, 0, 0.6)), { lobes: 5, lobeD: 0.025 });
  const g = group(mesh(geo, shiny(0xffffff, { vc: true, rough: 0.3 })), stem(0.54, 0.14));
  const l = leaf(0.24, 0.11); l.position.set(0.04, 0.64, 0); l.rotation.set(0.3, -0.4, 0.5); g.add(l);
  return g;
}
function peach() {
  const geo = fruitBody([[0, 0.02], [0.18, 0], [0.36, 0.1], [0.45, 0.28], [0.43, 0.46], [0.32, 0.6], [0.14, 0.66], [0.03, 0.64], [0, 0.62]],
    (x, y, z) => mixC(0xf6c27a, 0xf27a7a, smooth(-0.2, 0.45, x * 0.6 + y * 0.7)).lerp(C(0xffe2b0), 0.3 * smooth(0.2, 0, y)), { crease: 0.08 });
  const g = group(mesh(geo, mat(0xffffff, { vc: true, rough: 0.75 })), stem(0.63, 0.06, 0.02, 0.01));
  for (const [ry, rz] of [[0.2, 0.7], [2.6, 0.6]]) { const l = leaf(0.28, 0.1); l.position.set(0, 0.66, 0); l.rotation.set(0, ry, rz); g.add(l); }
  return g;
}
function pear() { // 우리 배: 둥글고 황갈색, 껍질 점
  const sp = speckle(23, 110, 0.03);
  const geo = fruitBody([[0, 0.03], [0.16, 0], [0.36, 0.08], [0.47, 0.24], [0.47, 0.4], [0.38, 0.55], [0.2, 0.62], [0.06, 0.61], [0, 0.57]],
    (x, y, z) => mixC(0xc8923a, 0x9a6a2a, smooth(0.3, -0.4, z) * 0.6).lerp(C(0xe8c070), 0.3 * smooth(0.1, 0.5, z + y * 0.3)).lerp(C(0x6a4220), 0.6 * dots(x, y, z, sp, 0, 0.62)));
  const g = group(mesh(geo, mat(0xffffff, { vc: true, rough: 0.55 })), stem(0.58, 0.14, 0.02, -0.03));
  return g;
}
function persimmon() {
  const geo = fruitBody([[0, 0.04], [0.2, 0], [0.4, 0.06], [0.5, 0.18], [0.5, 0.3], [0.42, 0.4], [0.24, 0.45], [0.08, 0.44], [0, 0.42]],
    (x, y, z) => mixC(0xf28a1e, 0xd85a14, smooth(0.1, -0.4, z) * 0.5).lerp(C(0xfab050), 0.3 * smooth(0.1, 0.4, y + z * 0.3)), { lobes: 4, lobeD: 0.07 });
  const g = group(mesh(geo, shiny(0xffffff, { vc: true, rough: 0.3 })));
  // 꽃받침: 네 장의 넓은 잎 + 가운데 꼭지
  const cal = mat(0x6a7a34, { rough: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const s = mesh(flat([[0, -0.05], [0.12, -0.07], [0.2, 0], [0.12, 0.07], [0, 0.05]], 0.01, true), cal);
    const piv = group(s); piv.position.y = 0.44; piv.rotation.set(0, i * Math.PI / 2 + 0.4, 0); s.rotation.z = -0.25; g.add(piv);
  }
  g.add(mesh(cyl(0.035, 0.045, 0.08, 10), mat(0x5a4a26), { p: [0, 0.48, 0] }));
  return g;
}

// ---------------------------------------------------------------- 작물
function carrot() {
  const geo = lathe([[0, -0.75], [0.03, -0.7], [0.08, -0.5], [0.13, -0.25], [0.17, -0.02], [0.17, 0.06], [0.12, 0.1], [0, 0.11]], 32);
  paint(geo, (x, y) => mixC(0xf28a2a, 0xd8661a, Math.abs(Math.sin(y * 42)) > 0.9 ? 0.6 : 0).lerp(C(0xffb050), 0.2 * smooth(-0.3, 0.05, y)));
  const g = group(mesh(geo, mat(0xffffff, { vc: true, rough: 0.55 })));
  const top = mat(0x4f9a32, { rough: 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, s = 0.1 + (i % 2) * 0.05;
    g.add(mesh(tube([[0, 0.08, 0], [Math.cos(a) * s * 0.5, 0.3, Math.sin(a) * s * 0.5], [Math.cos(a) * s * 1.6, 0.5 + (i % 2) * 0.08, Math.sin(a) * s * 1.6]], 0.016, 10, 5), top));
    for (let k = 0; k < 3; k++) {
      const l = leaf(0.12, 0.07, 0x5aaa3a); const t = 0.45 + k * 0.25;
      l.position.set(Math.cos(a) * s * 1.6 * t, 0.2 + 0.32 * t, Math.sin(a) * s * 1.6 * t); l.rotation.set(0, -a + (k % 2 ? 0.8 : -0.8), 0.6); g.add(l);
    }
  }
  g.rotation.z = -0.65;
  return g;
}
function cabbage() {
  const g = new THREE.Group(), C0 = V3(0, 0.3, 0);
  const inner = sphere(0.27, 32, 20); paint(inner, (x, y) => mixC(0xe6f4b8, 0xc4e488, smooth(0.25, -0.2, y)));
  g.add(mesh(inner, mat(0xffffff, { vc: true, rough: 0.6 }), { p: [0, 0.32, 0] }));
  // 바깥 잎: 오목한 잎 컵을 둘레에 기울여 붙임 (잎맥은 연한 색)
  const cup = new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateX(Math.PI / 2);
  paint(cup, (x, y, z) => { const vein = 1 - smooth(0.006, 0.02, Math.abs(x)); const side = Math.abs(Math.sin(Math.atan2(y, x) * 4)) < 0.12 ? 0.5 : 0; return mixC(0x6ab43e, 0x9ad060, smooth(0.25, 0.1, z * 0.0 + Math.hypot(x, y))).lerp(C(0xe8f8c0), Math.max(vein * 0.8, side * 0.4)); });
  const lm = mat(0xffffff, { vc: true, rough: 0.55, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, up = 0.15 + (i % 2) * 0.25;
    const dir = V3(Math.cos(a), 0, Math.sin(a));
    const m = mesh(cup, lm, { s: [1, 1.15, 0.45] });
    m.position.copy(C0).addScaledVector(dir, 0.16).add(V3(0, -0.04 + (i % 2) * 0.03, 0));
    m.lookAt(V3().copy(m.position).addScaledVector(dir, 1).add(V3(0, up, 0)));
    g.add(m);
  }
  return g;
}
function tomato() {
  const geo = fruitBody([[0, 0.03], [0.22, 0], [0.42, 0.08], [0.5, 0.22], [0.48, 0.36], [0.36, 0.46], [0.16, 0.5], [0.04, 0.48], [0, 0.46]],
    (x, y, z) => mixC(0xe23a24, 0xb8241a, smooth(0.1, -0.4, z) * 0.5).lerp(C(0xff8a6a), 0.25 * smooth(0.2, 0.5, y + z * 0.3)), { lobes: 5, lobeD: 0.05 });
  const g = group(mesh(geo, shiny(0xffffff, { vc: true, rough: 0.2 })));
  const star = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.05 : 0.2; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const st = mesh(flat(star, 0.012, false), mat(0x3e8a2a, { rough: 0.6 }), { p: [0, 0.48, 0], r: [-Math.PI / 2, 0, 0] });
  g.add(st, stem(0.48, 0.08, 0.025, 0.02));
  return g;
}
function strawberry() {
  const geo = lathe([[0, -0.36], [0.08, -0.32], [0.2, -0.18], [0.28, 0.0], [0.29, 0.12], [0.22, 0.2], [0.08, 0.22], [0, 0.22]], 40);
  paint(geo, (x, y, z) => {
    const a = Math.atan2(z, x), gx = (a * 3) % 1, row = y * 16 + (Math.floor(a * 3 / Math.PI) % 2) * 0.5;
    const seed = (1 - smooth(0.12, 0.2, Math.abs(gx - 0.5) * 0.6 + Math.abs(row - Math.round(row)) * 0.5));
    return mixC(0xe2302a, 0xb81a1a, smooth(0.1, -0.3, z) * 0.4).lerp(C(0xf6d860), seed * 0.85 * smooth(0.2, 0.1, y));
  });
  const g = group(mesh(geo, shiny(0xffffff, { vc: true, rough: 0.25 })));
  const star = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = i % 2 ? 0.05 : 0.2; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  g.add(mesh(flat(star, 0.012, false), mat(0x4a9a32, { rough: 0.6, side: THREE.DoubleSide }), { p: [0, 0.22, 0], r: [-Math.PI / 2 + 0.15, 0, 0] }), stem(0.22, 0.1, 0.02, 0.03));
  g.rotation.z = -0.25;
  return g;
}
function corn() {
  const cob = lathe([[0, -0.42], [0.1, -0.4], [0.15, -0.25], [0.16, 0.05], [0.14, 0.25], [0.08, 0.38], [0, 0.4]], 36);
  paint(cob, (x, y, z) => { const a = Math.atan2(z, x); const kx = Math.abs(Math.sin(a * 9)), ky = Math.abs(Math.sin(y * 48)); return mixC(0xf6d040, 0xd8a020, (kx > 0.92 || ky > 0.92) ? 0.8 : 0).lerp(C(0xfff0a0), 0.25 * (1 - kx) * (1 - ky)); });
  const g = group(mesh(cob, shiny(0xffffff, { vc: true, rough: 0.35 })));
  const husk = mat(0xffffff, { vc: true, rough: 0.55, side: THREE.DoubleSide });
  for (const [a, op] of [[0.3, 0.5], [2.4, 0.35], [4.2, 0.55]]) {
    const geo = flat([[0, -0.1], [0.1, 0.1], [0.12, 0.5], [0.04, 0.78], [-0.06, 0.4], [-0.08, 0.05]], 0.01, true);
    paint(geo, (x, y) => mixC(0x8acc5a, 0xd8e8a0, smooth(0.2, 0.7, y)));
    const m = mesh(geo, husk); m.position.set(0, -0.42, 0.14); m.rotation.x = op * 0.5;
    const piv = group(m); piv.rotation.y = a; g.add(piv);
  }
  const silk = mat(0xc8a060, { rough: 0.8 });
  for (let i = 0; i < 5; i++) g.add(mesh(tube([[0, 0.38, 0], [0.02 * i - 0.04, 0.48, 0.02], [0.05 * i - 0.1, 0.52, 0.06]], 0.008, 6, 4), silk));
  g.rotation.z = -0.55;
  return g;
}

// ---------------------------------------------------------------- 목장 생산물
export function eggBody(c = 0xf6ecd8, opts = {}) {
  const geo = lathe([[0, 0], [0.16, 0.02], [0.27, 0.12], [0.3, 0.26], [0.26, 0.42], [0.17, 0.53], [0.06, 0.57], [0, 0.575]], 40);
  paint(geo, (x, y, z) => mixC(c, 0xffffff, 0.3 * smooth(0.2, 0.5, y + z * 0.3)));
  geo.scale(0.8, 1, 0.8);
  return mesh(geo, opts.gold ? mat(0xffffff, { vc: true, rough: 0.25, metal: 0.3, emissive: 0x8a5a00, ei: 0.45 }) : mat(0xffffff, { vc: true, rough: 0.45 }));
}
function egg() { const g = group(eggBody()); g.rotation.z = -0.25; return g; }
/** 우유병: 흰 우유 + 띠 + 뚜껑 */
export function milkBottle(band = 0x4a8ad8, cap = 0x4a8ad8, goldy = false) {
  const g = new THREE.Group();
  const b = lathe([[0, 0], [0.2, 0], [0.24, 0.04], [0.24, 0.42], [0.2, 0.52], [0.12, 0.6], [0.1, 0.68], [0.11, 0.72], [0, 0.72]], 36);
  g.add(mesh(b, mat(0xfbf8f0, { rough: 0.3 })));
  g.add(mesh(cyl(0.245, 0.245, 0.16, 36, true), goldy ? mat(band, { rough: 0.25, metal: 0.6, emissive: 0x6a4400, ei: 0.3 }) : mat(band, { rough: 0.5, side: THREE.DoubleSide }), { p: [0, 0.22, 0] }));
  g.add(mesh(cyl(0.12, 0.12, 0.06, 24), goldy ? mat(cap, { rough: 0.25, metal: 0.6, emissive: 0x6a4400, ei: 0.3 }) : mat(cap, { rough: 0.4 }), { p: [0, 0.74, 0] }));
  // 띠 위 하트 표시
  const heart = mesh(flat([[0, -0.05], [0.05, 0.0], [0.04, 0.04], [0, 0.02], [-0.04, 0.04], [-0.05, 0]], 0.01, true), mat(0xffffff, { rough: 0.5 }), { p: [0, 0.22, 0.248] });
  g.add(heart);
  return g;
}
/** 양털 뭉치: 하얀 공 여러 개 */
export function fleece(c = 0xf8f2e6, seed = 5) {
  const g = new THREE.Group(), R = rng(seed);
  const m = mat(c, { rough: 0.95 });
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, r = R() * 0.28, y = 0.12 + R() * 0.22 - r * 0.3;
    g.add(mesh(sphere(0.11 + R() * 0.07, 16, 12), m, { p: [Math.cos(a) * r, y, Math.sin(a) * r * 0.8] }));
  }
  return g;
}
/** 꿀단지: 호박색 꿀 + 나무 뚜껑 + 꿀 막대 */
export function honeyJar(c = 0xf2a22a) {
  const g = new THREE.Group();
  const body = lathe([[0, 0], [0.22, 0], [0.3, 0.08], [0.33, 0.24], [0.3, 0.4], [0.22, 0.46], [0.2, 0.5], [0, 0.5]], 36);
  g.add(mesh(body, shiny(c, { rough: 0.15, emissive: 0x6a3000, ei: 0.25 })));
  g.add(mesh(cyl(0.24, 0.24, 0.07, 32), mat(0xb07a42, { rough: 0.6 }), { p: [0, 0.53, 0] }));
  g.add(mesh(cyl(0.22, 0.24, 0.025, 32), mat(0xe8d6a8, { rough: 0.8 }), { p: [0, 0.49, 0] }));
  // 흘러내린 꿀
  g.add(mesh(sphere(0.05, 10, 8), shiny(c, { emissive: 0x6a3000, ei: 0.25 }), { p: [0.12, 0.44, 0.25], s: [1, 1.8, 0.6] }));
  const dip = group(mesh(cyl(0.022, 0.022, 0.5, 10), mat(0xc89a5a)), mesh(cyl(0.06, 0.06, 0.1, 14), mat(0xc89a5a), { p: [0, -0.24, 0] }));
  dip.position.set(0.1, 0.62, -0.05); dip.rotation.z = -0.5; g.add(dip);
  // 앞 라벨
  g.add(mesh(cyl(0.335, 0.335, 0.12, 36, true), mat(0xfff2c8, { rough: 0.7, side: THREE.DoubleSide }), { p: [0, 0.24, 0] }));
  return g;
}

const FRUITS = { fruit_apple: apple, fruit_peach: peach, fruit_pear: pear, fruit_persimmon: persimmon };
const CROPS = { carrot, cabbage, tomato, strawberry, corn };
const PRODUCTS = { egg, milk: () => milkBottle(), wool: () => fleece(), honey: () => honeyJar() };

export const fruitIcon = (id) => FRUITS[id]?.() ?? null;
export const cropIcon = (id) => CROPS[id]?.() ?? null;
export const productIcon = (id) => PRODUCTS[id]?.() ?? null;
export const PRODUCE_ICON_KEYS = [...Object.keys(FRUITS), ...Object.keys(CROPS), ...Object.keys(PRODUCTS)];
