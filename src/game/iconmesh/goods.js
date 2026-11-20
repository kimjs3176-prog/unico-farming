import * as THREE from 'three';
import { mat, shiny, gold, mesh, sphere, tube, flat, lathe, paint, C, mixC, smooth, rng, group, cyl, cone, box, rbox, torus, sparkle } from './kit.js';
import { eggBody, milkBottle, fleece, leaf } from './fruit.js';

/**
 * 가공품·특별 생산물·물속 보물·쌀·씨앗류 아이콘 (위 = +y, 앞 = +z)
 *  병·단지·컵·덩어리에 색 라벨과 뚜껑 · 쌀은 등급마다 밥 높이·김·그릇 · 자루는 묶은 삼베 + 표시 + 쏟아진 것
 */
const CREAM = 0xfff4dc;

/** 둥근 단지 + 뚜껑(천 또는 금속) + 앞 라벨 */
function jar({ fill, glassy = true, lid = 0xd8b45a, cloth = null, label = CREAM, mark = null, h = 0.55 }) {
  const g = new THREE.Group();
  const body = lathe([[0, 0], [0.2, 0], [0.27, 0.04], [0.29, h * 0.5], [0.27, h * 0.88], [0.22, h * 0.94], [0.22, h], [0, h]], 36);
  g.add(mesh(body, glassy ? shiny(fill, { rough: 0.12 }) : mat(fill, { rough: 0.5 })));
  if (cloth) { // 체크무늬 천 뚜껑 + 끈
    const c = new THREE.SphereGeometry(0.33, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
    paint(c, (x, y, z) => ((Math.floor((x + 1) * 9) + Math.floor((z + 1) * 9)) % 2 ? C(cloth) : C(0xfff8ee)));
    c.scale(1, 0.4, 1);
    g.add(mesh(c, mat(0xffffff, { vc: true, rough: 0.8, side: THREE.DoubleSide }), { p: [0, h - 0.08, 0] }));
    g.add(mesh(torus(0.235, 0.014, 32, 6), mat(0xc8402a), { p: [0, h - 0.04, 0], r: [Math.PI / 2, 0, 0] }));
  } else {
    g.add(mesh(cyl(0.245, 0.245, 0.08, 32), shiny(lid, { metal: 0.3 }), { p: [0, h + 0.03, 0] }));
  }
  g.add(mesh(cyl(0.292, 0.292, h * 0.36, 36, true), mat(label, { rough: 0.7, side: THREE.DoubleSide }), { p: [0, h * 0.46, 0] }));
  if (mark) g.add(mark);
  return g;
}
/** 라벨 위 작은 그림: 동그라미 하나 (+ 잎) */
function labelMark(c, y, { leafC = 0x4a9a32, z = 0.295 } = {}) {
  const g = group(mesh(sphere(0.055, 14, 10), shiny(c), { p: [0, y, z], s: [1, 1, 0.45] }));
  const l = leaf(0.07, 0.04, leafC); l.position.set(0.0, y + 0.045, z + 0.01); l.rotation.set(0, 0, 0.9); g.add(l);
  return g;
}
/** 유리컵 + 음료 + 빨대 */
function glassCup({ fill, straw = 0xffffff, garnish = null }) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.16, 0], [0.2, 0.5], [0, 0.5]], 32), shiny(fill, { rough: 0.25 }))); // 음료
  g.add(mesh(lathe([[0.165, -0.02], [0.215, 0.6], [0.225, 0.6], [0.175, -0.03]], 32), mat(0xeaf6fa, { rough: 0.05, opacity: 0.45 })));
  g.add(mesh(lathe([[0, -0.03], [0.175, -0.03], [0.175, 0.0], [0, 0.0]], 32), mat(0xeaf6fa, { rough: 0.05, opacity: 0.6 })));
  const st = mat(straw, { rough: 0.4 });
  g.add(mesh(tube([[0.04, 0.2, 0], [0.08, 0.6, 0], [0.12, 0.78, 0], [0.22, 0.82, 0]], 0.022, 12, 8), st));
  if (garnish) g.add(garnish);
  return g;
}
/** 그릇 (lathe) */
function bowl(c, rim = null, { w = 0.42, h = 0.24 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [w * 0.4, 0], [w * 0.42, 0.03], [w * 0.75, h * 0.35], [w, h], [w * 0.96, h], [w * 0.7, h * 0.4], [0, h * 0.12]], 40), mat(c, { rough: 0.35 })));
  if (rim) g.add(mesh(torus(w * 0.98, 0.016, 48, 8), shiny(rim, { metal: rim === 0xf2c23a ? 0.6 : 0 }), { p: [0, h, 0], r: [Math.PI / 2, 0, 0] }));
  return g;
}
/** 자루: 불룩한 몸 + 끈으로 묶은 좁은 목 + 위로 벌어진 주름 + 삼베 짜임 (앞쪽에 표시·쏟아진 것) */
function sack({ c, rope = 0xc8a46a, extra = [] }) {
  const g = new THREE.Group();
  // 옆 모양을 곡선으로 이어 고리를 촘촘하게 (짜임 무늬가 보이게)
  const prof = new THREE.SplineCurve([[0.0, 0], [0.3, 0.0], [0.4, 0.07], [0.44, 0.22], [0.42, 0.38], [0.33, 0.52], [0.18, 0.62], [0.1, 0.67], [0.13, 0.71], [0.22, 0.79], [0.29, 0.86], [0.24, 0.89], [0.15, 0.84], [0.04, 0.8]].map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = prof.getPoints(40).map((v) => [v.x, v.y]);
  pts.unshift([0, 0]); pts.push([0, 0.79]);
  const geo = lathe(pts, 56);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const fold = 1 + 0.2 * Math.sin(a * 6) * smooth(0.68, 0.86, y) + 0.035 * Math.sin(a * 5 + y * 9) * smooth(0.62, 0.3, y); // 윗단 주름 · 몸 구김
    const sq = 1 - 0.14 * smooth(0.6, 0.2, y); // 앞뒤로 조금 납작
    p.setXYZ(i, x * fold, y + 0.03 * Math.sin(a * 6) * smooth(0.75, 0.88, y), z * fold * sq);
  }
  geo.computeVertexNormals();
  paint(geo, (x, y, z) => {
    const a = Math.atan2(z, x), u = a * 0.42 / Math.PI * 40, v = y * 46;
    const weave = (Math.abs(Math.sin(u * Math.PI)) > 0.75 ? 0.1 : 0) + (Math.abs(Math.sin(v * Math.PI)) > 0.8 ? 0.08 : 0);
    return mixC(c, 0x000000, weave + 0.2 * smooth(0.55, 0.66, y) * smooth(0.72, 0.66, y)).lerp(C(0xffffff), 0.1 * smooth(0.2, 0.5, y + z * 0.4));
  });
  g.add(mesh(geo, mat(0xffffff, { vc: true, rough: 0.92 })));
  // 끈: 목에 두 번 감고 앞으로 늘어진 끝
  const rm = mat(rope, { rough: 0.8 });
  for (const dy of [0, 0.035]) g.add(mesh(torus(0.115, 0.026, 28, 8), rm, { p: [0, 0.655 + dy, 0], r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(tube([[0.05, 0.66, 0.1], [0.1, 0.6, 0.17], [0.07, 0.5, 0.22]], 0.02, 10, 6), rm));
  g.add(mesh(tube([[-0.02, 0.66, 0.11], [-0.08, 0.58, 0.18], [-0.13, 0.52, 0.2]], 0.02, 10, 6), rm));
  for (const e of extra) if (e) g.add(e);
  return g;
}
/** 꾸미기 '곡식 자루' 아이콘: 표시 없는 삼베 자루 + 위로 소복한 낟알 */
export function grainSack() {
  const g = sack({ c: 0xc8a870, extra: [spill(73, 10, () => sphere(0.03, 8, 6).scale(0.7, 0.55, 1.3), 0xe8c050)] });
  g.rotation.y = -0.25;
  return g;
}
/** 자루 앞면에 찍은 표시 (평평한 도형) */
const stamp = (shape, c, { y = 0.32, sc = 1, z = 0.4 } = {}) => { const m = mesh(flat(shape, 0.006, true), mat(c, { rough: 0.85 }), { p: [0, y, z], s: sc }); m.rotation.x = -0.12; return m; };
/** 볍씨 표시: 이삭 모양 (낟알 다섯) */
function grainStamp(c) {
  const g = new THREE.Group(), m = mat(c, { rough: 0.8 });
  const zAt = (y) => 0.395 - Math.max(0, y - 0.24) * 0.6; // 자루 앞면을 따라
  g.add(mesh(cyl(0.016, 0.016, 0.3, 6), m, { p: [0.01, 0.27, zAt(0.27)], r: [-0.2, 0, 0.12] }));
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) {
    if (i === 4 && sd > 0) continue;
    const y = 0.22 + i * 0.05;
    g.add(mesh(sphere(0.05, 10, 8), m, { p: [-0.012 * i + sd * 0.055, y, zAt(y)], s: [0.6, 1.3, 0.35], r: [-0.2, 0, sd * 0.6] }));
  }
  return g;
}
/** 바닥에 쏟아진 알갱이 */
function spill(seed, n, makeGeo, c, { cx = 0.1, cz = 0.42, spread = 0.2 } = {}) {
  const g = new THREE.Group(), R = rng(seed), m = mat(c, { rough: 0.6 }), geo = makeGeo();
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * spread;
    const mm = mesh(geo, m, { p: [cx + Math.cos(a) * r, 0.025 + (spread - r) * 0.25 * (i % 3 === 0 ? 1 : 0.4), cz + Math.sin(a) * r * 0.6], r: [R() * 3, R() * 3, R() * 3] });
    g.add(mm);
  }
  return g;
}

// ---------------------------------------------------------------- 가공품
/** 유리 주전자: 비치는 유리 + 안의 음료 + 손잡이 + 테두리에 과일 조각 */
function carafe({ fill, slice }) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0.02], [0.2, 0.02], [0.23, 0.08], [0.23, 0.4], [0.16, 0.5], [0, 0.5]], 32), shiny(fill, { rough: 0.2 }))); // 음료
  g.add(mesh(lathe([[0.215, 0.0], [0.245, 0.06], [0.245, 0.42], [0.15, 0.6], [0.14, 0.74], [0.18, 0.8], [0.17, 0.81], [0.125, 0.75], [0.135, 0.6], [0.23, 0.42], [0.23, 0.06], [0.205, 0.015]], 36), mat(0xeaf6fa, { rough: 0.05, opacity: 0.4 })));
  g.add(mesh(lathe([[0, -0.0], [0.22, 0.0], [0.22, 0.025], [0, 0.025]], 32), mat(0xeaf6fa, { rough: 0.05, opacity: 0.6 })));
  g.add(mesh(tube([[-0.24, 0.62, 0], [-0.36, 0.6, 0], [-0.37, 0.36, 0], [-0.24, 0.24, 0]], 0.028, 16, 8), mat(0xeaf6fa, { rough: 0.05, opacity: 0.55 }))); // 손잡이
  g.add(mesh(lathe([[0.24, 0.42], [0.24, 0.43], [0.0, 0.43]], 32), mat(mixC(fill, 0xffffff, 0.35).getHex(), { rough: 0.3 }), { p: [0, 0.07, 0] })); // 음료 윗면 거품
  if (slice) g.add(slice);
  return g;
}
/** 과일 단면 조각 (반달) */
function fruitSlice(skin, flesh, seedC, { p = [0.12, 0.82, 0.08], r = [0.2, 0.4, -0.5], sc = 1 } = {}) {
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 24, 1, false, 0, Math.PI);
  const g = group(mesh(geo, mat(skin, { rough: 0.35 })));
  g.add(mesh(new THREE.CircleGeometry(0.125, 20, 0, Math.PI).rotateX(-Math.PI / 2), mat(flesh, { rough: 0.5, side: THREE.DoubleSide }), { p: [0, 0.021, 0] }));
  for (let i = 0; i < 4; i++) { const a = 0.4 + i * 0.75; g.add(mesh(sphere(0.018, 8, 6), mat(seedC), { p: [Math.cos(a) * 0.06, 0.024, -Math.sin(a) * 0.06], s: [1, 0.5, 1.4] })); }
  g.position.set(...p); g.rotation.set(...r); g.scale.setScalar(sc);
  return g;
}
function kimchi() {
  const g = bowl(0xf4f0e6, 0x3a6ab8, { w: 0.44, h: 0.22 });
  const R = rng(3), red = mat(0xffffff, { vc: true, rough: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) { // 버무린 양배추 잎: 붉은 잎 + 연한 줄기
    const geo = new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI, 0, Math.PI * 0.6);
    paint(geo, (x, y) => mixC(0xd8482a, 0xf2c88a, smooth(0.02, 0.14, y) * 0.7).lerp(C(0xa8241a), R() * 0.15));
    const a = (i / 9) * Math.PI * 2, r = i ? 0.2 : 0;
    g.add(mesh(geo, red, { p: [Math.cos(a) * r, 0.22 + (i ? 0.02 : 0.12), Math.sin(a) * r], r: [R() * 1.2, a, R()], s: [1, 0.9, 1] }));
  }
  for (let i = 0; i < 10; i++) g.add(mesh(sphere(0.015, 6, 4), mat(0xb8241a), { p: [(R() - 0.5) * 0.5, 0.36 + R() * 0.06, (R() - 0.5) * 0.5] }));
  return g;
}
function cheese() {
  const geo = flat([[0, 0], [0.62, 0.0], [0.08, 0.36]], 0.36, false);
  geo.rotateX(-Math.PI / 2); geo.translate(-0.22, 0, 0.16);
  const R = rng(17), holes = Array.from({ length: 10 }, () => [R() * 0.6 - 0.3, R() * 0.35, R() * 0.4 - 0.2, 0.035 + R() * 0.04]);
  paint(geo, (x, y, z) => { let k = 0; for (const [hx, hy, hz, hr] of holes) k = Math.max(k, 1 - smooth(hr * 0.7, hr, Math.hypot(x - hx, y - hy, z - hz) * 1.0)); return mixC(0xf6cc4a, 0xc89a2a, k * 0.85).lerp(C(0xffe890), 0.25 * smooth(0.15, 0.35, y)); });
  const g = group(mesh(geo, mat(0xffffff, { vc: true, rough: 0.5 })));
  g.rotation.y = 0.5;
  return g;
}
function yarnBall(c = 0xe88aa4) {
  const g = new THREE.Group();
  g.add(mesh(sphere(0.3, 32, 24), mat(c, { rough: 0.9 }), { p: [0, 0.3, 0] }));
  const dark = mat(mixC(c, 0x000000, 0.15).getHex(), { rough: 0.9 });
  for (let i = 0; i < 9; i++) g.add(mesh(torus(0.3, 0.018, 48, 6), dark, { p: [0, 0.3, 0], r: [i * 0.35, i * 0.7, i * 0.2] }));
  g.add(mesh(tube([[0.25, 0.15, 0.12], [0.42, 0.05, 0.2], [0.5, 0.02, 0.05], [0.62, 0.02, 0.14]], 0.02, 16, 6), mat(c, { rough: 0.9 })));
  const needle = mat(0xd8b070, { rough: 0.5 });
  for (const s of [-1, 1]) g.add(mesh(cyl(0.018, 0.012, 0.8, 8), needle, { p: [s * 0.08, 0.42, -0.08], r: [0.3, 0, s * 0.7] }), mesh(sphere(0.035, 10, 8), mat(0xe25a4a), { p: [s * 0.08 - s * 0.27, 0.42 + 0.29, -0.08 + 0.12] }));
  return g;
}
function castella() {
  const g = new THREE.Group();
  const geo = rbox(0.7, 0.34, 0.36, 0.04, 2);
  paint(geo, (x, y) => (y > 0.13 ? C(0x9a5a22) : y < -0.15 ? C(0xe8d6b0) : mixC(0xfad46a, 0xf2bc4a, smooth(-0.15, 0.13, y))));
  g.add(mesh(geo, mat(0xffffff, { vc: true, rough: 0.75 }), { p: [0, 0.18, 0] }));
  g.add(mesh(rbox(0.76, 0.03, 0.42, 0.012, 1), mat(0xfaf6ec, { rough: 0.8 }), { p: [0, 0.0, 0] }));
  g.rotation.y = 0.5;
  return g;
}
function yogurt() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.18, 0], [0.24, 0.42], [0.25, 0.44], [0, 0.44]], 32), mat(0xfbf8f2, { rough: 0.4 })));
  g.add(mesh(cyl(0.232, 0.205, 0.18, 32, true), mat(0xf28aa8, { rough: 0.6, side: THREE.DoubleSide }), { p: [0, 0.2, 0] }));
  g.add(mesh(sphere(0.23, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf6c2d2, { rough: 0.5 }), { p: [0, 0.43, 0], s: [1, 0.35, 1] }));
  // 딸기 한 알
  const sb = lathe([[0, -0.1], [0.05, -0.08], [0.08, 0.0], [0.07, 0.05], [0, 0.06]], 20);
  g.add(mesh(sb, shiny(0xe2302a), { p: [0.02, 0.56, 0.02], r: [0, 0, 0.3] }));
  const l = leaf(0.08, 0.05, 0x4a9a32); l.position.set(0.0, 0.62, 0.02); l.rotation.set(0, 0, 1.2); g.add(l);
  return g;
}
function butter() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.4, 0], [0.46, 0.05], [0.44, 0.06], [0, 0.04]], 40), mat(0x8ab8d8, { rough: 0.3 }))); // 작은 접시
  g.add(mesh(rbox(0.5, 0.2, 0.3, 0.045, 3), mat(0xfbe08a, { rough: 0.45 }), { p: [0, 0.15, 0], r: [0, 0.35, 0] }));
  g.add(mesh(rbox(0.24, 0.12, 0.31, 0.03, 2), mat(0xfbe08a, { rough: 0.45 }), { p: [0.3, 0.11, 0.18], r: [0, 0.35, 0] }));
  g.add(mesh(rbox(0.34, 0.02, 0.06, 0.01, 1), mat(0xc8ccd2, { rough: 0.3, metal: 0.6 }), { p: [-0.05, 0.27, 0.12], r: [0, -0.3, -0.12] }));
  return g;
}
function scarf() {
  const g = new THREE.Group();
  const knit = (c1, c2) => { const m = (geo) => { paint(geo, (x, y, z) => (Math.floor((y + 2) * 12) % 3 === 0 ? C(c2) : mixC(c1, 0x000000, Math.abs(Math.sin((x + z) * 60)) > 0.8 ? 0.12 : 0))); return geo; }; return m; };
  const k = knit(0xd8342a, 0xf8f0e0);
  const loop = new THREE.TorusGeometry(0.3, 0.09, 14, 48);
  loop.scale(1, 0.55, 1);
  g.add(mesh(k(loop), mat(0xffffff, { vc: true, rough: 0.9 }), { p: [0, 0.42, 0], r: [Math.PI / 2 - 0.35, 0, 0] }));
  for (const [x, rz, len] of [[0.12, 0.08, 0.5], [-0.08, -0.12, 0.42]]) {
    const end = rbox(0.17, len, 0.06, 0.025, 2);
    g.add(mesh(k(end), mat(0xffffff, { vc: true, rough: 0.9 }), { p: [x, 0.32 - len / 2, 0.24], r: [0.15, 0, rz] }));
    for (let f = 0; f < 4; f++) g.add(mesh(cyl(0.01, 0.01, 0.07, 5), mat(0xf8f0e0), { p: [x - 0.06 + f * 0.04 + Math.sin(rz) * len * 0.5, 0.32 - len - 0.02, 0.25] }));
  }
  return g;
}
function teaCup() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.42, 0], [0.46, 0.03], [0.44, 0.045], [0, 0.03]], 40), mat(0xe8dcc4, { rough: 0.35 }))); // 받침
  g.add(mesh(lathe([[0, 0.03], [0.14, 0.03], [0.18, 0.06], [0.28, 0.26], [0.3, 0.36], [0.28, 0.36], [0.26, 0.27], [0.16, 0.08], [0, 0.07]], 40), mat(0xd8e4c8, { rough: 0.3 }))); // 청자 빛 잔
  g.add(mesh(cyl(0.272, 0.272, 0.01, 32), shiny(0xd8a03a, { rough: 0.1 }), { p: [0, 0.32, 0] })); // 옥수수수염차
  // 옥수수 한 조각 + 수염
  const cb = lathe([[0, -0.12], [0.05, -0.1], [0.06, 0.08], [0, 0.12]], 16);
  paint(cb, (x, y, z) => (Math.abs(Math.sin(y * 70)) > 0.85 || Math.abs(Math.sin(Math.atan2(z, x) * 7)) > 0.85 ? C(0xd8a020) : C(0xf6d040)));
  g.add(mesh(cb, mat(0xffffff, { vc: true, rough: 0.4 }), { p: [0.38, 0.06, 0.18], r: [0, 0, 1.3] }));
  for (let i = 0; i < 3; i++) g.add(mesh(tube([[0, 0.36, 0.0], [0.05 + i * 0.03, 0.46, 0.05], [0.12 + i * 0.04, 0.5, 0.02]], 0.008, 6, 4), mat(0xc8a060)));
  // 김
  for (const x of [-0.08, 0.06]) g.add(mesh(tube([[x, 0.4, 0], [x + 0.04, 0.5, 0], [x - 0.02, 0.6, 0], [x + 0.03, 0.7, 0]], 0.014, 12, 5), mat(0xffffff, { rough: 0.9, opacity: 0.7 })));
  return g;
}

function honeyBerryJar() {
  const g = new THREE.Group(), h = 0.6;
  g.add(mesh(lathe([[0, 0.02], [0.22, 0.02], [0.26, 0.08], [0.26, h * 0.86], [0, h * 0.86]], 32), shiny(0xf2a42a, { rough: 0.15, emissive: 0x5a2a00, ei: 0.2 }))); // 꿀
  const R = rng(5);
  for (let i = 0; i < 6; i++) { // 꿀 속 딸기
    const a = (i / 6) * Math.PI * 2 + 0.3, y = 0.14 + (i % 3) * 0.13;
    g.add(mesh(lathe([[0, -0.07], [0.04, -0.05], [0.06, 0.01], [0.05, 0.05], [0, 0.055]], 14), shiny(0xd8202a), { p: [Math.cos(a) * 0.17, y, Math.sin(a) * 0.17], r: [R(), a, R() * 0.6] }));
  }
  g.add(mesh(lathe([[0.27, 0.0], [0.29, 0.06], [0.29, h * 0.88], [0.23, h * 0.94], [0.23, h], [0.22, h], [0.22, h * 0.94], [0.275, h * 0.88], [0.275, 0.06], [0.255, 0.01]], 36), mat(0xf6fbfc, { rough: 0.05, opacity: 0.35 }))); // 유리
  const c = new THREE.SphereGeometry(0.34, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  paint(c, (x, y, z) => { const a = Math.floor((x + 1) * 7) % 2, b = Math.floor((z + 1) * 7) % 2; return a && b ? C(0xe0901a) : a || b ? C(0xf6c050) : C(0xfff6e0); });
  c.scale(1, 0.4, 1);
  g.add(mesh(c, mat(0xffffff, { vc: true, rough: 0.8, side: THREE.DoubleSide }), { p: [0, h - 0.07, 0] }));
  g.add(mesh(torus(0.235, 0.016, 32, 6), mat(0x8a5a2a), { p: [0, h - 0.035, 0], r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(tube([[0.1, h - 0.03, 0.21], [0.16, h - 0.12, 0.25], [0.12, h - 0.2, 0.27]], 0.012, 8, 5), mat(0x8a5a2a)));
  return g;
}

// ---------------------------------------------------------------- 보물
function clamShell(open = 0.35, c = 0x9a8a72) {
  const g = new THREE.Group();
  const half = () => {
    const geo = new THREE.SphereGeometry(0.34, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
    paint(geo, (x, y, z) => { const a = Math.atan2(z, x); return mixC(c, 0xe8dcc4, Math.abs(Math.sin(a * 9)) > 0.75 ? 0.35 : 0).lerp(C(0x5a4a3a), smooth(0.12, 0.02, y) * 0.0 + 0.25 * smooth(0.1, 0.3, Math.hypot(x, z) / 0.34 * 0.3)); });
    geo.scale(1, 0.5, 1);
    return mesh(geo, mat(0xffffff, { vc: true, rough: 0.45, side: THREE.DoubleSide }));
  };
  const bot = half(); bot.rotation.x = Math.PI; g.add(bot);
  const topP = group(half()); topP.position.z = -0.3; topP.children[0].position.z = 0.3; topP.rotation.x = -open; g.add(topP);
  g.add(mesh(sphere(0.3, 24, 8), mat(0xf4e8e0, { rough: 0.5 }), { s: [1, 0.08, 1] })); // 안쪽 자개
  return g;
}
function clam() { const g = clamShell(0.45); g.rotation.set(0.25, 0.4, 0); g.position.y = 0.1; return g; }
function pearl() {
  const g = clamShell(0.9, 0x8a8aa2);
  g.add(mesh(sphere(0.17, 32, 24), mat(0xfdf6f4, { rough: 0.12, metal: 0.25, emissive: 0x302830, ei: 0.3 }), { p: [0, 0.14, 0.04] }));
  g.add(sparkle([0.16, 0.36, 0.2], 0.1));
  g.rotation.set(0.35, 0.3, 0);
  return g;
}

// ---------------------------------------------------------------- 쌀·씨앗
function ricePaddy() {
  const g = new THREE.Group();
  const stalk = mat(0xd8b860, { rough: 0.7 }), grain = mat(0xe8c050, { rough: 0.55 });
  const R = rng(31);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 0.05 + R() * 0.04, lean = (R() - 0.5) * 0.3;
    const top = [Math.cos(a) * r * 2 + lean, 0.75, Math.sin(a) * r * 2];
    g.add(mesh(tube([[Math.cos(a) * r, -0.05, Math.sin(a) * r], [Math.cos(a) * r, 0.4, Math.sin(a) * r], top], 0.012, 10, 4), stalk));
    // 고개 숙인 이삭
    for (let k = 0; k < 7; k++) {
      const t = k / 6, dir = Math.cos(a) > 0 ? 1 : -1;
      g.add(mesh(sphere(0.028, 8, 6), grain, { p: [top[0] + dir * t * 0.16, top[1] - t * t * 0.2 + 0.02, top[2] + (k % 2 ? 0.02 : -0.02)], s: [0.7, 1.3, 0.7] }));
    }
  }
  g.add(mesh(torus(0.09, 0.03, 24, 8), mat(0x8a5a2a, { rough: 0.8 }), { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] }));
  g.rotation.z = -0.35;
  return g;
}
const RICE_BOWL = [null, [0x9a6a3a, null], [0x8ac0a0, 0x4a8a6a], [0xf6f4f0, 0x2a5ab8], [0xb8261c, 0xf2c23a], [0xf2c23a, 0xfff0a0]];
function riceBowl(grade) {
  const [c, rim] = RICE_BOWL[grade];
  const g = bowl(c, rim, { w: 0.42, h: 0.26 });
  if (grade === 5) g.children[0].material = gold();
  if (grade === 4) g.children[0].material = shiny(c, { rough: 0.15 }); // 옻칠 광택
  // 소복한 밥: 등급이 오를수록 높게. 낟알 모양으로 울퉁불퉁 + 낟알 사이 그늘
  const heap = new THREE.SphereGeometry(0.4, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = heap.attributes.position, R = rng(50 + grade), bumps = Array.from({ length: 140 }, () => [R() * Math.PI * 2, R() * 0.95]);
  const grainAt = (x, y, z) => { const a = Math.atan2(z, x), t = 1 - y / 0.4; let k = 0; for (const [ba, bt] of bumps) { const d = Math.hypot(Math.atan2(Math.sin(a - ba), Math.cos(a - ba)) * (0.25 + t), (t - bt) * 1.3); k = Math.max(k, 1 - smooth(0.02, 0.07, d)); } return k; };
  const ks = new Float32Array(hp.count);
  for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), k = grainAt(x, y, z); ks[i] = k; const f = 1 + 0.035 * k; hp.setXYZ(i, x * f, y * f, z * f); }
  heap.computeVertexNormals();
  paint(heap, (x, y, z, i) => mixC(0xe6dccb, 0xfffdf6, ks[i]));
  const mound = 0.5 + grade * 0.14;
  g.add(mesh(heap, mat(0xffffff, { vc: true, rough: 0.45 }), { p: [0, 0.2, 0], s: [1, mound, 1] }));
  // 김: 2등급부터 한 줄기씩 더
  const top = 0.2 + 0.4 * mound, steam = mat(0xffffff, { rough: 0.9, opacity: 0.75 });
  for (let i = 0; i < grade - 1; i++) { const x = (i - (grade - 2) / 2) * 0.12; g.add(mesh(tube([[x, top, 0], [x + 0.05, top + 0.1, 0.02], [x - 0.03, top + 0.2, 0], [x + 0.03, top + 0.3, 0]], 0.018, 12, 5), steam)); }
  // 등급만큼 그릇 앞에 큰 별 (★) + 진한 테두리
  const starPts = (k) => { const out = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = (i % 2 ? 0.05 : 0.115) * k; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
  const sm = mat(0xffd23a, { rough: 0.3, metal: 0.2, emissive: 0x6a4a00, ei: 0.5 }), sg = flat(starPts(1), 0.02, false);
  const om = mat(0x5a3418, { rough: 0.6 }), og = flat(starPts(1.3), 0.012, false);
  const gap = grade > 3 ? 0.36 : 0.42;
  for (let i = 0; i < grade; i++) {
    const a = (i - (grade - 1) / 2) * gap;
    const piv = group(mesh(og, om, { p: [0, 0, -0.012] }), mesh(sg, sm));
    piv.position.set(Math.sin(a) * 0.4, 0.12, Math.cos(a) * 0.4); piv.rotation.set(-0.45, a, 0);
    g.add(piv);
  }
  if (grade === 5) g.add(sparkle([0.32, 0.6, 0.1], 0.12));
  return g;
}
function bone() {
  const g = new THREE.Group(), m = mat(0xe8c890, { rough: 0.6 });
  g.add(mesh(cyl(0.07, 0.07, 0.6, 16), m, { r: [0, 0, Math.PI / 2] }));
  for (const x of [-0.3, 0.3]) for (const z of [-0.07, 0.07]) g.add(mesh(sphere(0.1, 16, 12), m, { p: [x, z, 0] }));
  g.rotation.set(0.5, 0.2, 0.4);
  g.position.y = 0.1;
  return g;
}
function bait() {
  const g = bowl(0x6a8aa8, 0x3a5a7a, { w: 0.4, h: 0.2 });
  const R = rng(41), m = mat(0x9a7a4a, { rough: 0.85 });
  for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, r = R() * 0.22; g.add(mesh(sphere(0.09 + R() * 0.03, 14, 10), m, { p: [Math.cos(a) * r, 0.2 + R() * 0.08, Math.sin(a) * r] })); }
  return g;
}
function weed() {
  const g = new THREE.Group(), R = rng(7);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R(), l = 0.35 + R() * 0.3;
    const geo = flat([[0, -0.03], [l * 0.5, -0.035], [l, 0], [l * 0.5, 0.035], [0, 0.03]], 0.01, true);
    paint(geo, (x) => mixC(0x4a9a32, 0x9ad060, x / l));
    const m = mesh(geo, mat(0xffffff, { vc: true, rough: 0.6, side: THREE.DoubleSide }));
    const piv = group(m); piv.rotation.set(0, a, 0); m.rotation.z = 1.0 + R() * 0.4; g.add(piv);
  }
  const root = mat(0xc8a87a, { rough: 0.8 });
  for (let i = 0; i < 5; i++) g.add(mesh(tube([[0, 0, 0], [(R() - 0.5) * 0.1, -0.1, (R() - 0.5) * 0.1], [(R() - 0.5) * 0.25, -0.22, (R() - 0.5) * 0.2]], 0.012, 8, 4), root));
  g.add(mesh(sphere(0.12, 16, 10), mat(0x6a4a2a, { rough: 0.95 }), { p: [0, -0.06, 0], s: [1, 0.5, 1] }));
  return g;
}
const leafTag = (c = 0x4a9a32) => { const l = leaf(0.18, 0.1, c); l.position.set(-0.08, 0.24, 0.4); l.rotation.set(-0.1, 0, 0.7); return l; };


// ---- 계절 축제 먹거리·엽전 (W4-C 축제 아이템)
/** 접시 위에 둥근 떡을 겹쳐 쌓음: top(i) 로 맨 위 떡에 장식 */
function cakeStack(c, n, { r = 0.24, h = 0.07, plate = 0xf6f0e4, top } = {}) {
  const g = bowl(plate, 0x4a8ac0, { w: 0.46, h: 0.06 });
  for (let i = 0; i < n; i++) {
    const m = mesh(cyl(r, r * 1.02, h, 32), mat(c, { rough: 0.6 }), { p: [(i % 2 ? 0.05 : -0.04), 0.09 + i * h * 0.9, (i % 2 ? -0.03 : 0.03)], r: [0, i * 0.7, 0] });
    m.geometry = smoothEdge(m.geometry);
    g.add(m);
  }
  if (top) g.add(top(0.09 + (n - 1) * h * 0.9 + h / 2));
  return g;
}
const smoothEdge = (geo) => { geo.computeVertexNormals(); return geo; };
function hwajeon() { // 진달래 화전: 하얀 찹쌀전 위에 분홍 진달래 꽃잎 + 잎
  return cakeStack(0xfaf3e6, 3, { top: (y) => {
    const f = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; f.add(mesh(sphere(0.07, 12, 8), mat(0xe8509a, { rough: 0.5 }), { p: [Math.cos(a) * 0.07, y + 0.012, Math.sin(a) * 0.07], s: [1, 0.25, 0.7], r: [0, -a, 0] })); }
    f.add(mesh(sphere(0.03, 10, 8), mat(0xf6d24a), { p: [0, y + 0.03, 0] }));
    const l = leaf(0.12, 0.06, 0x4a9a32); l.position.set(0.12, y + 0.01, 0.08); l.rotation.set(-Math.PI / 2, 0, 0.6); f.add(l);
    return f; } });
}
function surichwi() { // 수리취떡: 쑥색 둥근 떡에 수레바퀴 무늬
  return cakeStack(0x6a9a4a, 3, { top: (y) => {
    const w = new THREE.Group();
    w.add(mesh(torus(0.14, 0.012, 32, 6), mat(0x4a7a32), { p: [0, y + 0.004, 0], r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI; w.add(mesh(box(0.27, 0.012, 0.018), mat(0x4a7a32), { p: [0, y + 0.004, 0], r: [0, a, 0] })); }
    return w; } });
}
function songpyeon() { // 송편: 반달 모양 세 빛깔 + 솔잎
  const g = bowl(0xf6f0e4, 0x4a8ac0, { w: 0.46, h: 0.06 });
  [[0xfaf6ee, -0.14, 0.04, 0.5], [0xf2a8c0, 0.12, 0.06, -0.4], [0x9ac86a, 0, -0.12, 0.1]].forEach(([c, x, z, r]) => {
    const half = new THREE.SphereGeometry(0.15, 28, 14, 0, Math.PI);
    g.add(mesh(half, mat(c, { rough: 0.5 }), { p: [x, 0.08, z], s: [1, 0.9, 0.62], r: [0, r, 0] }));
    g.add(mesh(box(0.3, 0.02, 0.02), mat(mixC(c, 0x8a7a6a, 0.25)), { p: [x, 0.08, z], s: [1, 1, 1], r: [0, r, 0] })); // 아문 자리
  });
  for (let i = 0; i < 6; i++) g.add(mesh(cyl(0.006, 0.006, 0.3, 5), mat(0x2e6a2a), { p: [-0.05 + i * 0.03, 0.07, 0.2], r: [Math.PI / 2, 0, 0.8 + i * 0.12] })); // 솔잎
  return g;
}
function patjuk() { // 동지 팥죽: 검붉은 팥죽 + 하얀 새알심
  const g = bowl(0xf6f4f0, 0x2a5ab8, { w: 0.42, h: 0.26 });
  g.add(mesh(cyl(0.38, 0.38, 0.02, 40), mat(0x6a1e1a, { rough: 0.35 }), { p: [0, 0.22, 0] }));
  [[0.08, 0.05], [-0.12, -0.02], [0.02, -0.14], [-0.04, 0.13]].forEach(([x, z]) => g.add(mesh(sphere(0.055, 14, 10), mat(0xfaf6ee, { rough: 0.5 }), { p: [x, 0.24, z], s: [1, 0.7, 1] })));
  return g;
}
function token() { // 축제 엽전: 네모 구멍 난 놋쇠 동전 + 빨간 술
  const g = new THREE.Group();
  const coin = new THREE.Shape(); coin.absarc(0, 0, 0.32, 0, Math.PI * 2);
  const hole = new THREE.Path(); hole.moveTo(-0.08, -0.08); hole.lineTo(0.08, -0.08); hole.lineTo(0.08, 0.08); hole.lineTo(-0.08, 0.08); hole.lineTo(-0.08, -0.08);
  coin.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(coin, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 40 });
  geo.translate(0, 0, -0.025);
  g.add(mesh(geo, gold(0xd8a840), { p: [0, 0.42, 0], r: [-0.25, 0.35, 0] }));
  g.add(mesh(tube([[0, 0.78, -0.02], [0.02, 0.62, 0], [0, 0.5, 0.02]], 0.014), mat(0xc8302a), {}));
  g.add(mesh(cone(0.05, 0.16, 10), mat(0xd8402a), { p: [0.02, 0.06, 0.06], r: [Math.PI, 0, 0] }));
  g.add(mesh(tube([[0, 0.12, 0.05], [0.02, 0.0, 0.06]], 0.012), mat(0xc8302a), {}));
  g.add(sparkle([0.28, 0.72, 0.15], 0.09));
  return g;
}

const BUILD = {
  fest_hwajeon: hwajeon, fest_surichwi: surichwi, fest_songpyeon: songpyeon, fest_patjuk: patjuk, fest_token: token,
  goods_carrotjuice: () => glassCup({ fill: 0xf2902a, straw: 0xf6f0e0, garnish: (() => { const s = mesh(cyl(0.09, 0.09, 0.03, 20), mat(0xf28a2a), { p: [-0.18, 0.6, 0.06], r: [Math.PI / 2, 0, 0.3] }); return s; })() }),
  goods_kimchi: kimchi,
  goods_juice: () => carafe({ fill: 0xe0402a, slice: fruitSlice(0xd8322a, 0xf26a4a, 0xf6d870, { p: [0.17, 0.8, 0.05], r: [Math.PI / 2 - 0.2, 0, -0.5] }) }), // 토마토 주스: 유리 주전자 + 토마토 조각
  goods_jam: () => jar({ fill: 0xc8202a, cloth: 0xe0403a, label: CREAM, mark: labelMark(0xe2302a, 0.25) }),
  goods_corntea: teaCup,
  goods_honeyjam: honeyBerryJar, // 딸기 꿀절임: 꿀 속 딸기가 비치는 병 + 노란 체크 천 뚜껑
  goods_cheese: cheese,
  goods_yarn: () => yarnBall(),
  goods_castella: castella,
  goods_yogurt: yogurt,
  goods_butter: butter,
  goods_scarf: scarf,
  egg_gold: () => { const g = group(eggBody(0xffd24a, { gold: true }), sparkle([0.25, 0.55, 0.15], 0.1)); g.rotation.z = -0.2; return g; },
  milk_gold: () => group(milkBottle(0xf2c23a, 0xf2c23a, true), sparkle([0.28, 0.72, 0.15], 0.1)),
  wool_gold: () => { const g = fleece(0xfff2d0, 13); g.add(mesh(torus(0.2, 0.03, 32, 8), gold(), { p: [0, 0.32, 0.18], r: [0.3, 0, 0] })); g.add(sparkle([0.3, 0.5, 0.2], 0.1)); return g; },
  clam, pearl,
  paddy: ricePaddy,
  rice_1: () => riceBowl(1), rice_2: () => riceBowl(2), rice_3: () => riceBowl(3), rice_4: () => riceBowl(4), rice_5: () => riceBowl(5),
  rice_seed: () => sack({ c: 0xd8c08a, extra: [grainStamp(0x3e7a22), spill(61, 14, () => sphere(0.03, 8, 6).scale(0.7, 0.55, 1.3), 0xe8c050)] }), // 볍씨: 삼베 자루 + 이삭 표시 + 쏟아진 낟알
  pet_treat: bone,
  bait,
  compost: () => sack({ c: 0x5e4028, rope: 0x9a7a4a, extra: [leafTag(0x7ac04a), spill(67, 12, () => new THREE.DodecahedronGeometry(0.04, 0), 0x3a2616)] }), // 퇴비: 짙은 자루 + 잎 표시 + 흙 부스러기
  weed,
  feed: () => sack({ c: 0xa8845a, rope: 0xd8504a, extra: [stamp([[-0.1, -0.08], [0.1, -0.08], [0.1, 0.08], [-0.1, 0.08]], 0xd8504a, { y: 0.32 }), spill(71, 16, () => new THREE.CylinderGeometry(0.028, 0.028, 0.06, 7), 0x8a5a2a)] }), // 사료: 짙은 삼베 + 빨간 표 + 알갱이 더미
};
export const GOODS_ICON_KEYS = Object.keys(BUILD);

export function goodsIcon(id) {
  const f = BUILD[id];
  if (!f) return null;
  const g = f();
  const holder = group(g);
  holder.rotation.y = -0.25;
  return holder;
}
