import * as THREE from 'three';
import { faceView, mat, shiny, mesh, sphere, tube, paint, C, mixC, smooth, group, sparkle, cone } from './kit.js';

/**
 * 곤충 아이콘 (머리 = +x, 위 = +y). 여섯 갈래 모양 + 종마다 색·무늬
 *  나비(배추흰나비·호랑나비·노랑나비·나방) · 잠자리(고추잠자리·실잠자리) · 딱정벌레(무당벌레·장수풍뎅이·비단벌레·사슴벌레·반딧불이)
 *  벌(꿀벌) · 메뚜기(벼메뚜기·사마귀·왕귀뚜라미) · 매미(참매미)
 */
const DARK = 0x2a211c;

/** 다리 한 벌 (양쪽 3개씩): xs = 붙는 x 위치, len 길이, c 색 */
function legs(g, xs, { len = 0.22, c = DARK, r = 0.012, y = -0.02, w = 0.05, spread = 1 } = {}) {
  const m = mat(c, { rough: 0.5 });
  xs.forEach((x, i) => {
    for (const s of [-1, 1]) {
      const fw = (i - 1) * 0.08 * spread;
      g.add(mesh(tube([[x, y, s * w], [x + fw * 0.5, y + 0.03, s * (w + len * 0.45)], [x + fw, y - len * 0.55, s * (w + len * 0.75)]], r, 10, 5), m));
    }
  });
}
/** 더듬이 한 쌍 */
function antennae(g, from, { len = 0.25, c = DARK, r = 0.008, club = 0, up = 0.6, out = 0.35, curl = 0 } = {}) {
  const m = mat(c, { rough: 0.5 });
  for (const s of [-1, 1]) {
    const [x, y, z] = from;
    const tip = [x + len * 0.75, y + len * up, z + s * len * out];
    g.add(mesh(tube([[x, y, z + s * 0.015], [x + len * 0.35, y + len * up * 0.6, z + s * len * out * 0.4], [tip[0] - curl * 0.05, tip[1] + curl * 0.04, tip[2]]], r, 12, 5), m));
    if (club) g.add(mesh(sphere(club, 10, 8), m, { p: [tip[0] - curl * 0.05, tip[1] + curl * 0.04, tip[2]] }));
  }
}
/** 겹눈 두 개 */
function eyes(g, p, r, c = 0x1a1410, sep = 0.05) {
  const m = shiny(c);
  for (const s of [-1, 1]) g.add(mesh(sphere(r, 14, 10), m, { p: [p[0], p[1], s * sep] }));
}
/**
 * 날개: 둘레점(x = 몸 앞뒤, y = 바깥쪽)을 부드러운 곡선으로 이은 모양을 텍스처(무늬 함수)로 그린 얇은 판
 *  - 정점 색으로는 점·띠 무늬가 뭉개져서 텍스처를 씀 (DataTexture 라 node 테스트에서도 만들 수 있음)
 *  - 오른쪽(+z)·왼쪽(-z) 모두 윗면이 위(+y)를 보게 (거울 뒤집기 없음)
 */
const wingTexCache = new Map();
function wingTexture(key, pts, fn, res = 128) {
  if (wingTexCache.has(key)) return wingTexCache.get(key);
  const sh = new THREE.Shape(); sh.moveTo(...pts[0]); sh.splineThru(pts.slice(1).concat([pts[0]]).map(([x, y]) => new THREE.Vector2(x, y)));
  const poly = sh.getPoints(60);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  const edgeD = (x, y) => { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(x - a.x - t * dx, y - a.y - t * dy)); } return m; };
  const data = new Uint8Array(res * res * 4), c = new THREE.Color();
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = x0 + ((i + 0.5) / res) * (x1 - x0), y = y0 + ((j + 0.5) / res) * (y1 - y0), o = (j * res + i) * 4;
    if (!inside(x, y)) continue;
    c.copy(fn ? fn(x, y) : C(0xffffff)).lerp(C(0x2a211c), 0.55 * (1 - smooth(0.006, 0.016, edgeD(x, y)))); // 가장자리 선
    c.convertLinearToSRGB();
    data[o] = c.r * 255; data[o + 1] = c.g * 255; data[o + 2] = c.b * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, res, res);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const out = { tex, x0, x1, y0, y1 };
  wingTexCache.set(key, out);
  return out;
}
let wingSeq = 0;
function wing(pts, fn, { lift = 0.5, side = 1, root = [0, 0.02, 0], o = {}, key = null } = {}) {
  const T = wingTexture(key ?? 'w' + wingSeq++, pts, fn);
  const w = T.x1 - T.x0, h = T.y1 - T.y0;
  const geo = new THREE.PlaneGeometry(w, h);
  // 판 좌표 (u: x, v: y) → 바깥쪽이 ±z. 텍스처 v 는 둘레점 y 와 같은 방향이 되게
  geo.rotateX(-Math.PI / 2); // (x, y, 0) → (x, 0, -y)
  if (side > 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  geo.translate(T.x0 + w / 2, 0, side * (T.y0 + h / 2));
  const m = mesh(geo, new THREE.MeshStandardMaterial({ map: T.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, ...(o.rough != null ? { roughness: o.rough } : {}) }));
  const pivot = group(m);
  pivot.position.set(...root);
  pivot.rotation.x = -side * lift;
  return pivot;
}
/** 마디 몸통 (뒤로 이어지는 공들) */
function segBody(g, { from = 0, n = 6, len = 0.6, r0 = 0.06, r1 = 0.04, c, c2, y = 0, flatY = 1, droop = 0 }) {
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), r = r0 + (r1 - r0) * k;
    g.add(mesh(sphere(1, 16, 12), mat(i % 2 && c2 ? c2 : c, { rough: 0.45 }), { p: [from - k * len, y - droop * k * k, 0], s: [len / n * 0.75, r * flatY, r] }));
  }
}

// ---------------------------------------------------------------- 나비
const FORE = [[0.03, 0.02], [0.2, 0.25], [0.24, 0.5], [0.14, 0.62], [-0.04, 0.5], [-0.08, 0.2], [-0.04, 0.04]];
const HIND = [[0, 0.02], [-0.02, 0.28], [-0.14, 0.42], [-0.3, 0.36], [-0.34, 0.18], [-0.2, 0.04]];
const HIND_TAIL = [[0, 0.02], [-0.02, 0.28], [-0.14, 0.42], [-0.3, 0.38], [-0.36, 0.3], [-0.52, 0.32], [-0.38, 0.2], [-0.3, 0.08], [-0.16, 0.03]];
const MOTH_FORE = [[0.04, 0.02], [0.14, 0.3], [0.08, 0.58], [-0.12, 0.6], [-0.2, 0.3], [-0.08, 0.04]];

function butterfly({ fore, hind, body = 0x2b2420, tail = false, moth = false, lift = 0.14 }) {
  const g = new THREE.Group();
  const F = moth ? MOTH_FORE : FORE, Hd = tail ? HIND_TAIL : HIND;
  for (const s of [-1, 1]) {
    g.add(wing(Hd, (x, y) => hind(x, y), { lift: lift * 0.9, side: s, root: [-0.04, 0.01, 0] }));
    g.add(wing(F, (x, y) => fore(x, y), { lift, side: s, root: [0.02, 0.03, 0] }));
  }
  g.add(mesh(sphere(1, 16, 12), mat(body, { rough: 0.7 }), { p: [-0.08, 0, 0], s: [0.22, 0.04, 0.04] }));
  g.add(mesh(sphere(1, 14, 10), mat(body, { rough: 0.7 }), { p: [0.1, 0.01, 0], s: [0.07, 0.05, 0.05] }));
  g.add(mesh(sphere(0.045, 12, 10), mat(body, { rough: 0.6 }), { p: [0.19, 0.02, 0] }));
  eyes(g, [0.21, 0.04, 0], 0.022, 0x15110e, 0.03);
  antennae(g, [0.22, 0.05, 0], moth ? { len: 0.2, r: 0.014, club: 0, out: 0.6, up: 0.4 } : { len: 0.3, club: 0.022, out: 0.35 });
  return g;
}
const tipDist = (x, y, tx = 0.16, ty = 0.6) => Math.hypot(x - tx, y - ty);
const spot = (x, y, cx, cy, r) => 1 - smooth(r * 0.65, r, Math.hypot(x - cx, y - cy));

const BUTTERFLIES = {
  bug_butterfly: () => butterfly({
    fore: (x, y) => mixC(0xf7f5ec, 0x2e2a28, Math.max(1 - smooth(0.1, 0.18, tipDist(x, y)), spot(x, y, 0.06, 0.36, 0.055))),
    hind: (x, y) => mixC(0xf6f2df, 0x3a3634, spot(x, y, -0.06, 0.32, 0.04) * 0.9).lerp(C(0xf2e8b0), 0.25 * smooth(0.3, 0, y)),
  }),
  bug_swallowtail: () => butterfly({
    tail: true,
    fore: (x, y) => { const band = Math.abs(Math.sin((x * 2.2 + y * 0.6) * 9)) > 0.72 && y > 0.12 ? 1 : 0; return mixC(0xf4d65a, 0x241d18, Math.max(band * 0.9, smooth(0.5, 0.6, y + x * 0.25), smooth(0.12, 0.05, y) * 0.9)); },
    hind: (x, y) => { let c = mixC(0xf4d65a, 0x241d18, Math.max(smooth(0.28, 0.36, y + Math.max(0, -x - 0.3) * 0.5), x < -0.3 ? 1 : 0)); for (const [cx, cy] of [[-0.06, 0.38], [-0.16, 0.38], [-0.26, 0.34]]) c = c.lerp(C(0x4a7ad8), spot(x, y, cx, cy, 0.035)); return c.lerp(C(0xe2483a), spot(x, y, -0.33, 0.2, 0.04)); },
  }),
  bug_yellowbutterfly: () => butterfly({
    fore: (x, y) => mixC(0xf6e05a, 0x4a3a20, (1 - smooth(0.06, 0.12, tipDist(x, y, 0.18, 0.58))) * 0.9).lerp(C(0x7a5a20), spot(x, y, 0.07, 0.33, 0.03)),
    hind: (x, y) => mixC(0xf3dc58, 0xf09a3a, spot(x, y, -0.15, 0.24, 0.045)),
  }),
  bug_moth: () => butterfly({
    moth: true, lift: 0.06, body: 0x8a6a4a,
    fore: (x, y) => { const z = Math.sin(x * 26 + Math.sin(y * 20) * 1.5); return mixC(0xcdb494, 0x7a5a3e, (z > 0.6 ? 0.7 : 0) + 0.25 * smooth(0.2, 0.6, y)).lerp(C(0x4a3424), spot(x, y, -0.02, 0.3, 0.04)); },
    hind: (x, y) => mixC(0xd8c4a4, 0xb08a64, smooth(0.1, 0.4, y)),
  }),
};

// ---------------------------------------------------------------- 잠자리
function dragonfly({ c, c2, eye, thin = false, wingTint = 0xf0f6ff }) {
  const g = new THREE.Group();
  segBody(g, { from: -0.12, n: 9, len: thin ? 0.78 : 0.68, r0: thin ? 0.022 : 0.04, r1: thin ? 0.018 : 0.03, c, c2 });
  g.add(mesh(sphere(1, 16, 12), mat(c, { rough: 0.4 }), { p: [0.04, 0.01, 0], s: [0.1, thin ? 0.04 : 0.065, thin ? 0.04 : 0.06] }));
  eyes(g, [0.16, 0.035, 0], thin ? 0.03 : 0.05, eye, thin ? 0.045 : 0.042);
  g.add(mesh(sphere(0.035, 12, 10), mat(c, { rough: 0.5 }), { p: [0.17, 0.0, 0] }));
  const W = thin ? [[0, 0], [0.0, 0.04], [-0.1, 0.06], [-0.42, 0.06], [-0.46, 0.03], [-0.4, 0.0]] : [[0.02, 0], [0.04, 0.08], [0.02, 0.42], [-0.06, 0.48], [-0.1, 0.38], [-0.05, 0.02]];
  const vein = (x, y) => { const edge = smooth(0.0, 0.03, Math.min(Math.abs(y - (thin ? 0.03 : 0.25)), 0.03)); return mixC(wingTint, 0x9aa8b8, (1 - edge) * 0.25).lerp(C(0x3a3a3a), (thin ? spot(x, y, -0.41, 0.035, 0.025) : spot(x, y, 0.0, 0.42, 0.035)) * 0.8); };
  for (const s of [-1, 1]) {
    if (thin) { // 실잠자리: 날개를 등 위로 모아 접음
      g.add(wing(W, vein, { lift: 1.25, side: s, root: [0.02, 0.04, 0], o: { rough: 0.25 } }));
    } else {
      const fw = wing(W, vein, { lift: 0.12, side: s, root: [0.06, 0.05, 0], o: { rough: 0.25 } }); fw.rotation.y = s * 0.12; g.add(fw);
      const hw = wing(W, vein, { lift: 0.12, side: s, root: [0.0, 0.05, 0], o: { rough: 0.25 } }); hw.rotation.y = -s * 0.35; hw.scale.set(1.1, 1, 1); g.add(hw);
    }
  }
  legs(g, [0.08, 0.04, 0.0], { len: 0.12, r: 0.008, c: 0x2a2420 });
  return g;
}

// ---------------------------------------------------------------- 딱정벌레
function beetle({ shell, shellFn, pron, head = DARK, len = 0.5, wid = 0.36, h = 0.22, metal = 0, horn = null, mand = false, glow = false, legC = DARK }) {
  const g = new THREE.Group();
  // 딱지날개: 위쪽 반구를 늘인 것 + 가운데 갈라진 선
  const el = sphere(1, 40, 24);
  paint(el, (x, y, z) => shellFn ? shellFn(x, y, z) : C(shell));
  g.add(mesh(el, mat(0xffffff, { vc: true, rough: metal ? 0.2 : 0.3, metal }), { p: [-len * 0.25, 0, 0], s: [len * 0.6, h, wid / 2] }));
  g.add(mesh(sphere(1, 12, 8), mat(0x1a1410, { rough: 0.4 }), { p: [-len * 0.25, h * 0.9, 0], s: [len * 0.55, 0.012, 0.008] }));
  // 앞가슴등판 · 머리
  g.add(mesh(sphere(1, 24, 16), shiny(pron ?? shell, { metal }), { p: [len * 0.32, -0.01, 0], s: [len * 0.18, h * 0.6, wid * 0.4] }));
  g.add(mesh(sphere(1, 20, 14), shiny(head), { p: [len * 0.48, -0.03, 0], s: [len * 0.1, h * 0.38, wid * 0.26] }));
  eyes(g, [len * 0.53, -0.01, 0], 0.025, 0x0e0b09, wid * 0.2);
  if (horn) { // 장수풍뎅이 뿔: 머리에서 앞위로 휘고 끝이 갈라짐
    const m = shiny(horn);
    g.add(mesh(tube([[len * 0.5, 0, 0], [len * 0.72, 0.08, 0], [len * 0.82, 0.26, 0], [len * 0.76, 0.36, 0]], 0.03, 16, 8), m));
    for (const s of [-1, 1]) g.add(mesh(cone(0.022, 0.08, 8), m, { p: [len * 0.75, 0.39, s * 0.025], r: [s * 0.5, 0, 0.3] }));
    g.add(mesh(tube([[len * 0.32, h * 0.5, 0], [len * 0.42, h * 0.75, 0], [len * 0.5, h * 0.82, 0]], 0.02, 8, 6), m));
  }
  if (mand) { // 사슴벌레 큰턱
    const m = shiny(shell);
    for (const s of [-1, 1]) {
      g.add(mesh(tube([[len * 0.55, -0.02, s * 0.05], [len * 0.72, 0.02, s * 0.17], [len * 0.95, 0.04, s * 0.19], [len * 1.1, 0.04, s * 0.09]], 0.022, 16, 7), m));
      g.add(mesh(cone(0.015, 0.05, 6), m, { p: [len * 0.85, 0.05, s * 0.115], r: [0, 0, 0] }));
    }
  }
  if (glow) { // 반딧불이 꽁무니
    g.add(mesh(sphere(1, 16, 12), mat(0xf6f070, { emissive: 0xe8f040, ei: 1.1, rough: 0.5 }), { p: [-len * 0.82, -0.04, 0], s: [len * 0.16, h * 0.4, wid * 0.32] }));
    g.add(sparkle([-len * 0.95, 0.12, 0.05], 0.09, 0xfaf8a0));
  }
  legs(g, [len * 0.3, len * 0.1, -len * 0.12], { len: 0.2, r: 0.016, c: legC, w: wid * 0.32, y: -0.04 });
  antennae(g, [len * 0.55, 0.0, 0], { len: 0.14, r: 0.009, up: 0.5, out: 0.6, club: mand || horn ? 0 : 0.012 });
  return g;
}
const ladySpots = [[0.3, 0.45], [-0.25, 0.5], [0.05, 0.75], [-0.6, 0.35], [0.55, 0.3]];

// ---------------------------------------------------------------- 벌
function bee() {
  const g = new THREE.Group();
  const ab = sphere(1, 32, 20);
  paint(ab, (x) => (Math.sin((x + 1) * 7.5) > 0.15 ? C(0x2a2018) : C(0xf2b62a)));
  g.add(mesh(ab, mat(0xffffff, { vc: true, rough: 0.55 }), { p: [-0.2, -0.02, 0], s: [0.2, 0.15, 0.15], r: [0, 0, 0.15] }));
  g.add(mesh(cone(0.03, 0.08, 8), mat(DARK), { p: [-0.41, -0.05, 0], r: [0, 0, Math.PI / 2 + 0.15] }));
  g.add(mesh(sphere(0.12, 20, 14), mat(0xc88a34, { rough: 0.95 }), { p: [0.02, 0.0, 0] }));
  g.add(mesh(sphere(0.085, 18, 12), mat(0x2a2018, { rough: 0.5 }), { p: [0.15, -0.01, 0] }));
  eyes(g, [0.18, 0.02, 0], 0.035, 0x120e0b, 0.05);
  const W = [[0, 0], [0.04, 0.12], [-0.06, 0.3], [-0.2, 0.32], [-0.22, 0.2], [-0.08, 0.04]];
  for (const s of [-1, 1]) {
    g.add(wing(W, () => C(0xeef6ff), { lift: 0.22, side: s, root: [0.0, 0.1, 0], o: { rough: 0.2 } }));
    const hw = wing(W, () => C(0xe4eef8), { lift: 0.18, side: s, root: [-0.06, 0.09, 0], o: { rough: 0.2 } }); hw.scale.setScalar(0.7); g.add(hw);
  }
  legs(g, [0.08, 0.0, -0.08], { len: 0.16, r: 0.012, w: 0.06, y: -0.08 });
  antennae(g, [0.2, 0.03, 0], { len: 0.14, r: 0.01, up: 0.9, out: 0.4 });
  return g;
}

// ---------------------------------------------------------------- 메뚜기 무리
function hopper({ c, c2, kind }) {
  const g = new THREE.Group();
  const body = mat(c, { rough: 0.5 }), dark = mat(c2, { rough: 0.5 });
  if (kind === 'mantis') {
    segBody(g, { from: -0.08, n: 6, len: 0.42, r0: 0.06, r1: 0.04, c, c2: c, droop: 0.04 });
    // 날개(접힌 것) 덮개
    g.add(mesh(sphere(1, 20, 12), mat(mixC(c, 0xffffff, 0.2).getHex(), { rough: 0.5 }), { p: [-0.25, 0.04, 0], s: [0.26, 0.035, 0.07] }));
    g.add(mesh(tube([[0.0, 0, 0], [0.12, 0.06, 0], [0.24, 0.12, 0]], 0.03, 10, 8), body)); // 긴 앞가슴
    const hd = new THREE.Mesh(cone(0.075, 0.09, 3), body); hd.position.set(0.29, 0.15, 0); hd.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 0.3); hd.scale.set(1, 1, 0.7); g.add(hd);
    eyes(g, [0.28, 0.18, 0], 0.032, 0x8aa040, 0.055);
    for (const s of [-1, 1]) { // 낫 앞다리
      g.add(mesh(tube([[0.2, 0.1, s * 0.03], [0.3, 0.05, s * 0.07], [0.36, 0.12, s * 0.07], [0.33, 0.0, s * 0.06]], 0.02, 14, 6), body));
    }
    legs(g, [-0.02, -0.12], { len: 0.24, r: 0.012, c, w: 0.04 });
    antennae(g, [0.32, 0.18, 0], { len: 0.2, r: 0.006, up: 0.5, out: 0.4 });
    return g;
  }
  const cricket = kind === 'cricket';
  // 몸통: 길쭉 (메뚜기) / 통통 (귀뚜라미)
  g.add(mesh(sphere(1, 28, 18), body, { p: [-0.05, 0, 0], s: cricket ? [0.26, 0.11, 0.11] : [0.3, 0.085, 0.08] }));
  // 접은 날개 (등 위, 약간 다른 색)
  const wg = sphere(1, 24, 12); paint(wg, (x) => mixC(c2, c, smooth(-0.8, 0.6, x) * 0.5));
  g.add(mesh(wg, mat(0xffffff, { vc: true, rough: 0.55 }), { p: [-0.14, 0.05, 0], s: cricket ? [0.22, 0.05, 0.1] : [0.28, 0.04, 0.07] }));
  g.add(mesh(sphere(1, 20, 14), body, { p: [0.26, 0.02, 0], s: cricket ? [0.09, 0.1, 0.1] : [0.08, 0.085, 0.075] }));
  eyes(g, [0.3, 0.06, 0], 0.025, 0x241a12, cricket ? 0.075 : 0.06);
  for (const s of [-1, 1]) { // 큰 뒷다리: 넓적다리(위로) + 종아리(아래로)
    g.add(mesh(sphere(1, 16, 10), dark, { p: [-0.12, 0.08, s * 0.1], s: [0.18, 0.05, 0.035], r: [0, 0, 0.45] }));
    g.add(mesh(tube([[-0.28, 0.16, s * 0.11], [-0.24, 0.0, s * 0.13], [-0.2, -0.12, s * 0.14]], 0.014, 10, 5), dark));
  }
  legs(g, [0.18, 0.08], { len: 0.16, r: 0.012, c: c2, w: 0.06, y: -0.04 });
  antennae(g, [0.32, 0.06, 0], cricket ? { len: 0.75, r: 0.006, up: 0.2, out: 0.5, curl: 1 } : { len: 0.2, r: 0.01, up: 0.6, out: 0.3 });
  if (cricket) for (const s of [-1, 1]) g.add(mesh(tube([[-0.3, 0, s * 0.03], [-0.42, 0.02, s * 0.07]], 0.008, 6, 4), dark));
  return g;
}

// ---------------------------------------------------------------- 매미
function cicada() {
  const g = new THREE.Group();
  const b = sphere(1, 28, 18); paint(b, (x, y) => mixC(0x2c2a22, 0x6a8a4a, smooth(0.3, 0.9, y) * 0.6 * smooth(-0.2, 0.4, x)));
  g.add(mesh(b, mat(0xffffff, { vc: true, rough: 0.5 }), { p: [-0.05, 0, 0], s: [0.26, 0.12, 0.13] }));
  g.add(mesh(sphere(1, 20, 14), mat(0x3a3a2a, { rough: 0.5 }), { p: [0.2, 0.0, 0], s: [0.07, 0.08, 0.15] }));
  eyes(g, [0.22, 0.03, 0], 0.04, 0x6a4a3a, 0.14);
  const W = [[0.02, 0], [0.06, 0.08], [-0.1, 0.22], [-0.48, 0.2], [-0.56, 0.12], [-0.44, 0.04], [-0.1, 0.0]];
  const veins = (x, y) => { const v = Math.abs(Math.sin(x * 30 + y * 6)) < 0.18 ? 0.35 : 0; return mixC(0xe6eef0, 0x3a4a3a, v + 0.5 * smooth(-0.02, 0.06, -x) * smooth(0.06, 0, y)); };
  for (const s of [-1, 1]) {
    const w = wing(W, veins, { lift: 0.3, side: s, root: [0.12, 0.08, 0], o: { rough: 0.25 } });
    g.add(w);
  }
  legs(g, [0.12, 0.04, -0.04], { len: 0.14, r: 0.012, c: 0x3a3226, w: 0.08, y: -0.08 });
  return g;
}

const BUILD = {
  ...BUTTERFLIES,
  bug_dragonfly: () => dragonfly({ c: 0xd8382a, c2: 0xc22a20, eye: 0x8a2a20 }),
  bug_damselfly: () => dragonfly({ c: 0x2fb2a0, c2: 0x1f2a2a, eye: 0x1a6a62, thin: true }),
  bug_ladybug: () => beetle({ len: 0.4, wid: 0.36, h: 0.2, pron: 0x1e1814, shellFn: (x, y, z) => { let k = 0; for (const [sx, sy] of ladySpots) k = Math.max(k, 1 - smooth(0.12, 0.18, Math.hypot(x - sx, Math.abs(z) - sy))); return mixC(0xe0352a, 0x1a1412, k); } }),
  bug_beetle: () => beetle({ len: 0.6, wid: 0.36, h: 0.22, shell: 0x5a2a16, pron: 0x4a2212, head: 0x3a1a0e, horn: 0x4a2212, legC: 0x3a1a0e }),
  bug_jewel: () => beetle({ len: 0.62, wid: 0.28, h: 0.16, metal: 0.55, pron: 0x2a9a6a, head: 0x1f7a52, shellFn: (x, y, z) => mixC(0x24c27a, 0xb83a8a, (1 - smooth(0.04, 0.09, Math.abs(Math.abs(z) - 0.45))) * 0.9).lerp(C(0x2a6ad8), 0.25 * smooth(-0.5, -1, x)) }),
  bug_stag: () => beetle({ len: 0.5, wid: 0.32, h: 0.14, shell: 0x2e1a10, pron: 0x2a170e, head: 0x2a170e, mand: true, legC: 0x24140c }),
  bug_firefly: () => beetle({ len: 0.5, wid: 0.22, h: 0.12, shell: 0x26221e, pron: 0xe0702a, head: 0x1e1a16, glow: true }),
  bug_honeybee: () => bee(),
  bug_grasshopper: () => hopper({ c: 0x7cc04a, c2: 0x5e9a36, kind: 'grass' }),
  bug_mantis: () => hopper({ c: 0x5aa84a, c2: 0x3e8a3a, kind: 'mantis' }),
  bug_cricket: () => hopper({ c: 0x4a2e1a, c2: 0x2e1c10, kind: 'cricket' }),
  bug_cicada: () => cicada(),
};
export const BUG_ICON_KEYS = Object.keys(BUILD);

/** 곤충 아이콘 메시: 등(날개 윗면)이 카메라 쪽으로 보이게 눕히고 머리를 화면 위쪽으로 */
export function bugIcon(id) {
  const f = BUILD[id];
  if (!f) return null;
  const g = f();
  const deg = Math.PI / 180;
  if (/butterfly|swallowtail|moth/.test(id)) faceView(g, 0.85, 80 * deg); // 나비: 위에서, 날개를 좌우로 펼친 모습
  else if (/dragonfly|cicada|honeybee/.test(id)) faceView(g, 0.7, 40 * deg);
  else if (/ladybug|stag|jewel|firefly/.test(id)) faceView(g, 0.55, 30 * deg); // 등 무늬·큰턱이 보이게
  else faceView(g, 0.1, 15 * deg); // 메뚜기·장수풍뎅이: 옆모습
  return group(g);
}
