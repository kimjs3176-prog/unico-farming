import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS } from './sim/items.js';
import { loadSettings, resolveQuality } from './quality.js';

/**
 * 물고기 종류별 생김새 (낚은 물고기 들어 보이기, 호수에서 튀어 오르는 물고기, 아이템 아이콘 굽기)
 *  c 등 색 · side 옆구리 · belly 배 · fin 지느러미 · h 몸 높이 비율 · w 몸 두께(높이 대비) · long 몸 길이 배율
 *  tail 꼬리 모양(fork 갈라짐 · round 둥근 · cut 반듯 · eel 이어진 · shark 위가 긴)
 *  dorsal 등지느러미(tri · spiny 가시 · long 길게 · small)
 *  stripe 옆줄 띠 (stripeW 굵기 배율) · bars 세로 무늬 [색, 개수] · spots 점 [색, 개수, 크기] · blotch 얼룩 [색, 개수]
 *  blush 볼·배 붉은 기 (blushK 세기) · glassy 속이 비치는 몸
 *  whisker 수염 개수 · snout 긴 주둥이 · scutes 등 비늘판 · shine 금빛 · eye 눈 크기 배율
 *  shape 물고기가 아닌 것: shrimp 새우 · crayfish 가재 · snail 우렁이 · turtle 자라
 */
const LOOK = {
  fish_crucian: { c: 0x6f7a44, side: 0xa79a5c, belly: 0xe2d6a2, fin: 0x7d6f3c, h: 0.42, tail: 'fork' },
  fish_loach: { c: 0x7a5a36, side: 0xa58456, belly: 0xd9c49a, fin: 0x8a6a42, h: 0.2, long: 1.7, tail: 'round', dorsal: 'small', spots: [0x4a3420, 26, 0.05], whisker: 3 },
  fish_minnow: { c: 0xa8a070, side: 0xd8d4b0, belly: 0xf6f2e2, fin: 0xd0c8a0, h: 0.34, tail: 'cut', eye: 2.0, stripe: 0x5a6a78, upMouth: true },
  fish_carp: { c: 0x8a6a2a, side: 0xc9a24a, belly: 0xf0dca0, fin: 0xb4793a, h: 0.38, tail: 'fork', dorsal: 'long', whisker: 1, scales: true },
  fish_catfish: { c: 0x3c423a, side: 0x5c6252, belly: 0xc7c4ae, fin: 0x3c403a, h: 0.28, long: 1.2, tail: 'round', dorsal: 'small', whisker: 2, wide: 1.35, blotch: [0x2a2e28, 7] },
  fish_snail: { shape: 'snail', c: 0x5b5236, belly: 0x9a8a68, fin: 0xb7a98a },
  fish_goldfish: { c: 0xe8902a, side: 0xf6b83a, belly: 0xffe7a0, fin: 0xf39a35, h: 0.4, tail: 'fork', dorsal: 'long', whisker: 1, shine: true, scales: true },
  fish_bitterling: { c: 0x6d8a7a, side: 0xb7c3b4, belly: 0xf2b9b0, fin: 0xe2704f, h: 0.48, tail: 'fork', stripe: 0x3fa7a0, eye: 1.3 },
  fish_palechub: { c: 0x5e7e8e, side: 0xc8d8dc, belly: 0xf2c8b8, fin: 0xe8603a, h: 0.28, tail: 'fork', bars: [0x2a9a8a, 8], blush: 0xe8583a, blushK: 0.75 },
  fish_dace: { c: 0x6a5a34, side: 0xb49c64, belly: 0xece0c0, fin: 0x8a7a48, h: 0.24, long: 1.15, tail: 'cut', stripe: 0x3e3420, spots: [0x3a3020, 18, 0.04] },
  fish_shrimp: { shape: 'shrimp', c: 0xb7b89a, belly: 0xe7e0c4, fin: 0xe08a4a, band: 0x7d7a5a },
  fish_crayfish: { shape: 'crayfish', c: 0x8a3f26, belly: 0xc9774a, fin: 0x6a2c1a, band: 0x5a2416 },
  fish_kchub: { c: 0x4a5e6a, side: 0xc9d4d8, belly: 0xf4f2ea, fin: 0xf0c030, h: 0.27, tail: 'fork', stripe: 0x1c262e, stripeW: 2.2, eye: 1.45 },
  fish_softshell: { shape: 'turtle', c: 0x6f7a48, belly: 0xf0e2c0, fin: 0x7e8a58, band: 0x4c5530 },
  fish_smelt: { c: 0x88c4a0, side: 0xd2eedc, belly: 0xf4fff6, fin: 0xd0ecdc, h: 0.2, long: 1.15, tail: 'fork', dorsal: 'small', stripe: 0xf0fff6, stripeW: 1.4, eye: 1.4, glassy: true },
  fish_trout: { c: 0x5f7a5a, side: 0xb8c4ac, belly: 0xf3ece0, fin: 0x8e9a7c, h: 0.3, tail: 'cut', stripe: 0xe57f8a, spots: [0x2f3a2a, 30, 0.03] },
  fish_mandarin: { c: 0x8a7a3a, side: 0xc9b46a, belly: 0xefe2b4, fin: 0xa08a44, h: 0.36, tail: 'round', dorsal: 'spiny', blotch: [0x3a2e14, 14], bigMouth: true },
  fish_masu: { c: 0x5c7486, side: 0xc3ccd2, belly: 0xf4f2ec, fin: 0x9aa6ae, h: 0.3, tail: 'cut', bars: [0x45566a, 9], spots: [0x2a3440, 14, 0.025], blush: 0xe8a8a8 },
  fish_snakehead: { c: 0x3b4532, side: 0x6a7452, belly: 0xc9c6a6, fin: 0x404a36, h: 0.24, long: 1.45, tail: 'round', dorsal: 'long', blotch: [0x232a1e, 12], wide: 1.15 },
  fish_eel: { c: 0x3e4a32, side: 0x6e7444, belly: 0xe2d27a, fin: 0x4a5236, h: 0.17, long: 3.0, tail: 'eel', dorsal: 'none' },
  fish_sturgeon: { c: 0x5b6670, side: 0x8f9aa2, belly: 0xe2e4e2, fin: 0x5b6670, h: 0.2, long: 1.35, tail: 'shark', dorsal: 'small', snout: true, scutes: 0xd4d0bc, whisker: 2 },
  fish_perch: { c: 0x4c5034, side: 0x7d7a4c, belly: 0xd6cfa6, fin: 0x5e5a36, h: 0.36, tail: 'round', dorsal: 'spiny', bars: [0x2c2e1c, 6], eyeSpot: 0x3a8ad0 },
  fish_skygazer: { c: 0x3e5a72, side: 0xd8e0e2, belly: 0xfafaf6, fin: 0xb7c2c6, h: 0.3, long: 1.3, tail: 'fork', upMouth: true, bigMouth: true, eye: 1.6 },
  fish_nuchi: { c: 0x7a6a48, side: 0xc8b488, belly: 0xf2ecd8, fin: 0xc89a6a, h: 0.27, long: 1.15, tail: 'fork', spots: [0x4a3e28, 16, 0.045], whisker: 1, snout: true },
  fish_bullhead: { c: 0x8a6a2a, side: 0xd2a440, belly: 0xf0e0a8, fin: 0x9a7432, h: 0.26, long: 1.1, tail: 'fork', dorsal: 'tri', blotch: [0x4a3414, 6], whisker: 4, wide: 1.2 },
  fish_lenok: { c: 0x6a5a3e, side: 0xc4a684, belly: 0xf2e2d2, fin: 0xb07a5a, h: 0.3, tail: 'cut', spots: [0x2e2218, 26, 0.035], blush: 0xd88a78, redEye: true },
  fish_minimandarin: { c: 0xa69a5a, side: 0xd8ca8a, belly: 0xf4ecc8, fin: 0xb8a462, h: 0.34, tail: 'round', dorsal: 'spiny', blotch: [0x6a5a2a, 9], eye: 1.5, bigMouth: true },
  fish_goldmandarin: { c: 0xe6a22a, side: 0xf6d050, belly: 0xfff0b0, fin: 0xf0b030, h: 0.36, tail: 'round', dorsal: 'spiny', blotch: [0xd06a1a, 12], shine: true, bigMouth: true },
};
/** 생김새 표 (테스트·아이콘 굽기용 읽기 전용) */
export const FISH_LOOK = LOOK;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 늘 같은 순서의 난수 (종마다 무늬가 늘 같게) */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hash = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** 몸 단면 비율: t = 머리(+1) ~ 꼬리 자루(-1) */
const prof = (t) => {
  const u = (t - 0.15) / (t > 0.15 ? 0.85 : 1.15);
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return t > 0.15 ? r : 0.2 + 0.8 * r;
};

const geoCache = new Map();
// 지금 만드는 물고기가 낮음 품질인지 (makeFish 안에서만 바뀜) → 지오메트리 캐시도 따로
let LO = false;
const q = (hi, lo) => (LO ? lo : hi);
const cached = (k, f) => { const kk = LO ? k + ':lo' : k; if (!geoCache.has(kk)) geoCache.set(kk, f()); return geoCache.get(kk); };

/** 몸통: 정점 색으로 등·옆·배 색과 무늬를 칠한 하나의 메시 (그리기 1번) */
function bodyGeo(id, L, lo = false) {
  return cached('body:' + id, () => {
    const g = new THREE.SphereGeometry(0.5, lo ? 20 : 56, lo ? 14 : 40).rotateZ(-Math.PI / 2); // 극이 x 축 (낮음 품질은 거칠게)
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
    const H = L.h * 1.6, W = L.h * 0.9 * (L.wide || 1), long = L.long || 1;
    const back = new THREE.Color(L.c), side = new THREE.Color(L.side ?? L.c), belly = new THREE.Color(L.belly), c = new THREE.Color();
    const R = rng(hash(id)), spots = [], blot = [];
    if (L.spots) for (let i = 0; i < L.spots[1]; i++) spots.push([R() * 1.5 - 0.75, R() * 1.2 - 0.3]);
    if (L.blotch) for (let i = 0; i < L.blotch[1]; i++) blot.push([R() * 1.5 - 0.7, R() * 1.3 - 0.45, 0.09 + R() * 0.08]);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
      const t = x / 0.5, r0 = Math.hypot(y0, z0), pr = prof(t);
      const k = r0 > 1e-6 ? (0.5 * pr) / r0 : 0;
      let y = y0 * k * H, z = z0 * k * W;
      if (L.wide && y < 0) y *= 0.8; // 메기류: 배가 납작
      const v = r0 > 1e-6 ? y0 / r0 : 0; // 위(+1) ~ 아래(-1)
      // 기본: 배 → 옆 → 등
      c.copy(belly).lerp(side, smooth(-0.6, -0.05, v)).lerp(back, smooth(0.15, 0.75, v));
      if (L.blush) c.lerp(new THREE.Color(L.blush), (L.blushK ?? 0.45) * smooth(0.35, 0, Math.abs(v + 0.05)) * smooth(-0.6, 0.2, t));
      if (L.stripe) c.lerp(new THREE.Color(L.stripe), 0.85 * (1 - smooth(0.06 * (L.stripeW || 1), 0.16 * (L.stripeW || 1), Math.abs(v - 0.05))) * smooth(-0.95, -0.6, t) * smooth(0.85, 0.5, t));
      if (L.bars) { const f = (t + 0.75) * L.bars[1] / 1.4; const b = Math.abs(f - Math.round(f)); c.lerp(new THREE.Color(L.bars[0]), 0.75 * (1 - smooth(0.12, 0.24, b)) * smooth(-0.55, -0.1, v) * smooth(-0.85, -0.6, t) * smooth(0.7, 0.45, t)); }
      for (const [st, sv] of spots) { const d = Math.hypot((t - st) * 0.5, (v - sv) * 0.5 * L.h * 1.6); c.lerp(new THREE.Color(L.spots[0]), 0.9 * (1 - smooth(L.spots[2] * 0.6, L.spots[2], d))); }
      for (const [bt, bv, br] of blot) { const d = Math.hypot((t - bt) * 0.5, (v - bv) * 0.5 * L.h * 1.9); c.lerp(new THREE.Color(L.blotch[0]), 0.8 * (1 - smooth(br * 0.5, br, d)) * smooth(-0.7, -0.2, v)); }
      if (L.scales) { const s = Math.sin(t * 34) * Math.sin(v * 16); c.multiplyScalar(1 - 0.06 * Math.max(0, s) * smooth(-0.3, 0.3, v)); }
      if (L.eyeSpot && t > 0.42 && t < 0.62 && v > -0.2 && v < 0.25) c.lerp(new THREE.Color(L.eyeSpot), 0.8 * (1 - smooth(0.03, 0.06, Math.hypot((t - 0.52) * 0.5, v * 0.06))));
      // 머리 끝은 조금 어둡게 (입·코 느낌)
      c.multiplyScalar(1 - 0.12 * smooth(0.82, 1, t));
      p.setXYZ(i, x * long, y, z);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  });
}

/** 평평한 지느러미 (x,y 둘레 점) */
function finGeo(key, pts) {
  return cached('fin:' + key, () => {
    const s = new THREE.Shape();
    s.moveTo(...pts[0]);
    for (const q of pts.slice(1)) s.lineTo(...q);
    return new THREE.ShapeGeometry(s, q(6, 2));
  });
}
const TAILS = {
  fork: [[0.02, 0.07], [-0.14, 0.2], [-0.3, 0.36], [-0.27, 0.16], [-0.19, 0], [-0.27, -0.16], [-0.3, -0.36], [-0.14, -0.2], [0.02, -0.07]],
  round: [[0.02, 0.07], [-0.14, 0.2], [-0.25, 0.22], [-0.31, 0.12], [-0.33, 0], [-0.31, -0.12], [-0.25, -0.22], [-0.14, -0.2], [0.02, -0.07]],
  cut: [[0.02, 0.07], [-0.16, 0.24], [-0.3, 0.3], [-0.27, 0.1], [-0.26, 0], [-0.27, -0.1], [-0.3, -0.3], [-0.16, -0.24], [0.02, -0.07]],
  eel: [[0.04, 0.06], [-0.1, 0.12], [-0.2, 0.1], [-0.25, 0], [-0.2, -0.1], [-0.1, -0.12], [0.04, -0.06]],
  shark: [[0.02, 0.07], [-0.18, 0.26], [-0.36, 0.44], [-0.3, 0.16], [-0.22, 0], [-0.24, -0.14], [-0.14, -0.18], [0.02, -0.07]],
};
const DORSAL = {
  tri: [[0.1, 0], [0.02, 0.1], [-0.06, 0.22], [-0.1, 0.16], [-0.16, 0.02]],
  small: [[0.06, 0], [-0.02, 0.12], [-0.08, 0.1], [-0.1, 0]],
  spiny: [[0.2, 0], [0.16, 0.14], [0.12, 0.08], [0.08, 0.18], [0.04, 0.09], [0, 0.19], [-0.04, 0.1], [-0.08, 0.16], [-0.12, 0.08], [-0.2, 0.12], [-0.26, 0]],
  long: [[0.26, 0], [0.2, 0.08], [0, 0.11], [-0.2, 0.11], [-0.36, 0.08], [-0.42, 0]],
};
const PECT = [[0, 0.02], [-0.08, 0.05], [-0.16, 0.02], [-0.15, -0.03], [-0.06, -0.04]];
const ANAL = [[0.04, 0], [-0.04, -0.09], [-0.1, -0.08], [-0.12, 0]];

/** 물고기 몸 (머리 = +x, 몸길이 1) */
function buildFish(id, L, g, mats, lo) {
  const long = L.long || 1, H = L.h * 1.6, W = L.h * 0.9 * (L.wide || 1);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: L.shine ? 0.28 : 0.5, metalness: L.shine ? 0.35 : 0.05, emissive: L.shine ? 0x5a3300 : 0x000000, emissiveIntensity: 0.35, ...(L.glassy ? { transparent: true, opacity: 0.86 } : {}) });
  const finMat = new THREE.MeshStandardMaterial({ color: L.fin ?? L.c, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  mats.push(bodyMat, finMat);
  const inner = new THREE.Group();
  inner.scale.setScalar(1 / Math.max(1, long * 0.85)); // 긴 물고기도 전체 길이는 비슷하게
  g.add(inner);
  inner.add(new THREE.Mesh(bodyGeo(id, L, lo), bodyMat));
  const halfH = (t) => 0.5 * prof(t) * H, halfW = (t) => 0.5 * prof(t) * W;
  // 꼬리 (흔들리는 부분)
  const tail = new THREE.Mesh(finGeo('tail:' + (L.tail || 'fork'), TAILS[L.tail || 'fork']), finMat);
  tail.position.x = -0.49 * long;
  tail.scale.set(L.tail === 'eel' ? 0.8 : 1, Math.max(0.5, L.h * 2.2), 1);
  inner.add(tail);
  // 등지느러미
  const dk = L.dorsal ?? 'tri';
  if (dk !== 'none') {
    const d = new THREE.Mesh(finGeo('dorsal:' + dk, DORSAL[dk]), finMat);
    const dx = dk === 'long' ? -0.05 : 0.02;
    d.position.set(dx * long, halfH(dx * 2) * 0.92, 0);
    d.scale.set(long > 1.2 ? 1.5 : 1.25, Math.max(0.75, L.h * 2.8), 1);
    inner.add(d);
  }
  if (L.tail === 'eel' || dk === 'long') { // 뒷지느러미도 길게
    const a = new THREE.Mesh(finGeo('analLong', [[0.1, 0], [0, -0.07], [-0.3, -0.08], [-0.42, 0]]), finMat);
    a.position.set(-0.12 * long, -halfH(-0.24) * 0.9, 0);
    a.scale.set(long > 2 ? long * 0.8 : 1, 1, 1);
    inner.add(a);
  } else {
    const a = new THREE.Mesh(finGeo('anal', ANAL), finMat);
    a.position.set(-0.24 * long, -halfH(-0.48) * 0.9, 0);
    a.scale.y = Math.max(0.7, L.h * 2.4);
    inner.add(a);
  }
  // 가슴·배지느러미 (양쪽)
  for (const s of [-1, 1]) {
    const pf = new THREE.Mesh(finGeo('pect', PECT), finMat);
    pf.position.set(0.22 * long, -halfH(0.44) * 0.35, s * halfW(0.44) * 0.92);
    pf.rotation.set(0, s * 0.5, -0.5);
    inner.add(pf);
    const vf = new THREE.Mesh(finGeo('pelv', ANAL), finMat);
    vf.position.set(0, -halfH(0) * 0.85, s * halfW(0) * 0.35);
    vf.rotation.x = s * 0.4;
    vf.scale.setScalar(0.8);
    inner.add(vf);
  }
  // 눈: 흰자 + 눈동자 + 반짝임 (귀여운 느낌)
  const eyeS = (L.eye || 1) * Math.min(1.25, 0.75 + L.h);
  const tE = 1 - (0.17 / long) / 0.5; // 머리 끝에서 0.17 뒤
  const ex = 0.5 * long * tE, ey = halfH(tE) * 0.28, ez = halfW(tE) * 0.82;
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupil = new THREE.MeshStandardMaterial({ color: L.redEye ? 0x7a1a14 : 0x15120f, roughness: 0.2 });
  mats.push(white, pupil);
  const eW = cached('eyeW', () => new THREE.SphereGeometry(0.05, q(14, 8), q(10, 6))), eP = cached('eyeP', () => new THREE.SphereGeometry(0.036, q(12, 6), q(8, 5))), eH = cached('eyeH', () => new THREE.SphereGeometry(0.012, q(6, 4), q(4, 3)));
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(ex, ey, s * ez);
    e.scale.setScalar(eyeS * Math.max(0.55, L.h * 2.2));
    e.add(new THREE.Mesh(eW, white));
    const pp = new THREE.Mesh(eP, pupil); pp.position.set(0.006, 0, s * 0.024); e.add(pp);
    const hl = new THREE.Mesh(eH, white); hl.position.set(0.018, 0.018, s * 0.05); e.add(hl);
    inner.add(e);
    if (L.whisker) {
      for (let k = 0; k < L.whisker; k++) {
        const len = (k === 0 ? 0.35 : 0.18) * (L.wide ? 1.2 : 0.8);
        const wy = -halfH(0.9) * (0.2 + k * 0.25), x0 = 0.5 * long - 0.03;
        const w = new THREE.Mesh(cached(`wh:${id}:${s}:${k}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(x0, wy, s * 0.02), new THREE.Vector3(x0 + 0.04, wy - 0.03, s * (0.05 + len * 0.3)), new THREE.Vector3(x0 - len * 0.5, wy - len * 0.35, s * (0.08 + len * 0.45)),
        ]), q(8, 4), 0.007 + (k === 0 ? 0.004 : 0), q(5, 3), false)), finMat);
        inner.add(w);
      }
    }
  }
  // 입
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: 0.6 }); mats.push(mouthMat);
  const m = new THREE.Mesh(cached('mouth', () => new THREE.TorusGeometry(0.03, 0.008, q(5, 3), q(12, 6), Math.PI)), mouthMat);
  m.position.set(0.5 * long - 0.012, L.upMouth ? halfH(0.96) * 0.5 : -halfH(0.96) * 0.15, 0);
  m.rotation.set(0, Math.PI / 2, L.upMouth ? 0.6 : 0);
  m.scale.setScalar(L.bigMouth ? 1.5 : 1);
  inner.add(m);
  // 철갑상어: 긴 주둥이 + 등 비늘판
  if (L.snout) {
    const sn = new THREE.Mesh(cached('snout', () => new THREE.ConeGeometry(0.06, 0.26, q(10, 6)).rotateZ(-Math.PI / 2)), bodyMat.clone());
    sn.material.vertexColors = false; sn.material.color.set(L.side); mats.push(sn.material);
    sn.position.set(0.5 * long + 0.08, -0.01, 0); sn.scale.set(1, 0.7, 1);
    inner.add(sn);
  }
  if (L.scutes) {
    const sm = new THREE.MeshStandardMaterial({ color: L.scutes, roughness: 0.5 }); mats.push(sm);
    // 비늘판 27개를 한 지오메트리로 (그리기 1번)
    const sg = cached('scutes:' + id, () => {
      const parts = [], base = new THREE.ConeGeometry(0.022, 0.05, 4), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0, n = LO ? 5 : 9; i < n; i++) { // 낮음은 5줄
        const t = 0.75 - i * (LO ? 0.36 : 0.18);
        parts.push(base.clone().applyMatrix4(m4.makeTranslation(t * 0.5 * long, halfH(t) * 0.98, 0)));
        for (const s of [-1, 1]) parts.push(base.clone().applyMatrix4(m4.compose(new THREE.Vector3(t * 0.5 * long, 0, s * halfW(t) * 0.98), q.setFromEuler(e.set(s * Math.PI / 2, 0, 0)), new THREE.Vector3(0.8, 0.8, 0.8))));
      }
      return mergeGeometries(parts);
    });
    inner.add(new THREE.Mesh(sg, sm));
  }
  return tail;
}

/** 새우·가재: 마디 몸 + 부채 꼬리 + 더듬이 (머리 = +x) */
function buildCrust(id, L, g, mats, claws) {
  const m = new THREE.MeshStandardMaterial({ color: L.c, roughness: 0.42 });
  const band = new THREE.MeshStandardMaterial({ color: L.band, roughness: 0.5 });
  const tip = new THREE.MeshStandardMaterial({ color: L.fin, roughness: 0.5, side: THREE.DoubleSide });
  const eye = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  mats.push(m, band, tip, eye);
  const S = cached('crS', () => new THREE.SphereGeometry(0.5, q(20, 8), q(14, 6)));
  // 머리가슴 (큰 껍데기)
  const head = new THREE.Mesh(S, m); head.scale.set(0.42, claws ? 0.2 : 0.22, claws ? 0.22 : 0.18); head.position.set(0.16, 0.02, 0); g.add(head);
  const rost = new THREE.Mesh(cached('rost', () => new THREE.ConeGeometry(0.03, 0.16, q(6, 4)).rotateZ(-Math.PI / 2)), m); rost.position.set(0.42, 0.05, 0); g.add(rost);
  // 배 마디: 새우는 굽고 가재는 곧게
  const n = 6;
  let tailNode = null;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), a = claws ? k * 0.35 : k * 1.5;
    const r = 0.22 - k * 0.1;
    const seg = new THREE.Mesh(S, i % 2 ? m : band);
    const cx = -0.05 - Math.sin(a) * 0.1 - k * (claws ? 0.42 : 0.2), cy = claws ? -k * 0.03 : -(1 - Math.cos(a)) * 0.18;
    seg.position.set(cx, cy, 0); seg.scale.set(0.16, r * (claws ? 0.75 : 0.95), r * (claws ? 0.95 : 0.8)); seg.rotation.z = -a;
    g.add(seg);
    if (i === n - 1) {
      tailNode = new THREE.Group(); tailNode.position.set(cx - 0.05, cy, 0); tailNode.rotation.z = claws ? 0 : -a - 0.3; g.add(tailNode);
      const fan = cached('fan', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-0.16, 0.1); s.quadraticCurveTo(-0.22, 0, -0.16, -0.1); s.lineTo(0, 0); return new THREE.ShapeGeometry(s, q(6, 2)); });
      for (const yaw of [-0.6, 0, 0.6]) { const f = new THREE.Mesh(fan, tip); f.rotation.set(Math.PI / 2, 0, 0); f.rotation.z = 0; f.rotation.y = yaw * 0.6; f.scale.set(1, 1, 1); f.position.set(0, 0, yaw * 0.05); tailNode.add(f); }
    }
  }
  // 더듬이 (길게 뒤로)
  const ant = new THREE.MeshStandardMaterial({ color: L.fin, roughness: 0.5 }); mats.push(ant);
  for (const s of [-1, 1]) {
    const len = claws ? 0.7 : 0.95;
    g.add(new THREE.Mesh(cached(`ant:${claws}:${s}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.45, 0.06, s * 0.03), new THREE.Vector3(0.62, 0.18, s * 0.1), new THREE.Vector3(0.5, 0.32, s * 0.2), new THREE.Vector3(0.5 - len * 0.6, 0.36, s * 0.32),
    ]), q(16, 8), 0.009, q(5, 3), false)), ant));
    // 눈자루
    const e = new THREE.Mesh(cached('crE', () => new THREE.SphereGeometry(0.035, q(10, 6), q(8, 4))), eye); e.position.set(0.4, 0.1, s * 0.06); g.add(e);
    // 다리
    for (let k = 0; k < 4; k++) {
      const lx = 0.28 - k * 0.09;
      g.add(new THREE.Mesh(cached(`leg:${s}:${k}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(lx, -0.06, s * 0.05), new THREE.Vector3(lx + 0.02, -0.12, s * 0.13), new THREE.Vector3(lx - 0.02, -0.2, s * 0.17),
      ]), q(6, 3), 0.01, q(4, 3), false)), ant));
    }
    if (claws) { // 큰 집게: 팔 + 집게 두 쪽
      const arm = new THREE.Mesh(cached(`arm:${s}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.3, -0.02, s * 0.08), new THREE.Vector3(0.42, 0.0, s * 0.2), new THREE.Vector3(0.56, 0.02, s * 0.22),
      ]), q(8, 4), 0.03, q(6, 4), false)), m);
      g.add(arm);
      const cl = new THREE.Mesh(S, m); cl.scale.set(0.24, 0.1, 0.13); cl.position.set(0.68, 0.03, s * 0.22); cl.rotation.y = -s * 0.15; g.add(cl);
      const fA = new THREE.Mesh(cached('finger', () => new THREE.ConeGeometry(0.04, 0.2, q(8, 5)).rotateZ(-Math.PI / 2)), band); fA.position.set(0.86, 0.06, s * 0.22); fA.rotation.z = 0.15; g.add(fA);
      const fB = new THREE.Mesh(cached('finger'), band); fB.position.set(0.84, -0.01, s * 0.22); fB.rotation.z = -0.2; fB.scale.setScalar(0.8); g.add(fB);
    }
  }
  return tailNode;
}

/** 우렁이: 나선 껍데기 + 몸(발) + 더듬이 */
function buildSnail(L, g, mats) {
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  const body = new THREE.MeshStandardMaterial({ color: L.fin, roughness: 0.65 });
  mats.push(shellMat, body);
  const geo = cached('snailShell', () => {
    // 원뿔 나선: 아래가 넓고 위로 좁아지는 관
    const pts = [], turns = 2.7, N = q(80, 40);
    for (let i = 0; i <= N; i++) {
      const k = i / N, a = k * turns * Math.PI * 2, r = 0.16 * Math.pow(1 - k, 1.1);
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.pow(k, 0.8) * 0.36, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts.reverse());
    const segs = q(120, 48), rs = q(14, 7);
    const t = new THREE.TubeGeometry(curve, segs, 1, rs, false);
    // 관 굵기를 끝으로 갈수록 가늘게: 각 정점을 곡선 중심 쪽으로 당김
    const p = t.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const rings = segs + 1, perRing = rs + 1;
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / perRing), k = ring / (rings - 1);
      const center = curve.getPointAt(Math.min(1, k));
      const rad = 0.19 * Math.pow(1 - k, 1.05) + 0.012;
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(center).multiplyScalar(rad).add(center);
      p.setXYZ(i, v.x, v.y, v.z);
      const stripe = 0.5 + 0.5 * Math.sin((i % perRing) / perRing * Math.PI * 2 * 1 + k * 40);
      c.set(L.c).lerp(new THREE.Color(L.belly), 0.35 * stripe * (1 - k * 0.5));
      if (k > 0.97) c.set(0x3a3020);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    t.setAttribute('color', new THREE.BufferAttribute(col, 3));
    t.computeVertexNormals();
    return t;
  });
  const shell = new THREE.Mesh(geo, shellMat);
  shell.rotation.set(0, 0, -0.45); shell.position.set(-0.06, 0.14, 0);
  g.add(shell);
  const foot = new THREE.Mesh(cached('crS', () => new THREE.SphereGeometry(0.5, q(20, 8), q(14, 6))), body); foot.scale.set(0.7, 0.1, 0.26); foot.position.set(0.08, 0, 0); g.add(foot);
  const headG = new THREE.Group(); headG.position.set(0.36, 0.06, 0); g.add(headG);
  const hd = new THREE.Mesh(cached('crS'), body); hd.scale.set(0.16, 0.12, 0.13); headG.add(hd);
  const eye = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }); mats.push(eye);
  for (const s of [-1, 1]) {
    headG.add(new THREE.Mesh(cached(`tent:${s}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.03, s * 0.03), new THREE.Vector3(0.06, 0.12, s * 0.07), new THREE.Vector3(0.12, 0.2, s * 0.1)]), q(8, 4), 0.012, q(5, 3), false)), body));
    const e = new THREE.Mesh(cached('crE', () => new THREE.SphereGeometry(0.035, q(10, 6), q(8, 4))), eye); e.position.set(0.12, 0.2, s * 0.1); e.scale.setScalar(0.6); headG.add(e);
  }
  return headG;
}

/** 자라: 납작한 등딱지 + 긴 코 + 물갈퀴 발 */
function buildTurtle(L, g, mats) {
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: L.fin, roughness: 0.6 });
  const belly = new THREE.MeshStandardMaterial({ color: L.belly, roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  mats.push(shellMat, skin, belly, eye);
  const geo = cached('turtleShell', () => {
    const t = new THREE.SphereGeometry(0.5, q(40, 16), q(20, 7), 0, Math.PI * 2, 0, Math.PI / 2);
    const p = t.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), R = rng(77), dots = [];
    for (let i = 0; i < 16; i++) dots.push([R() - 0.5, R() - 0.5]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x, y * 0.36, z * 0.85);
      const rr = Math.hypot(x, z) / 0.5;
      c.set(L.c).lerp(new THREE.Color(L.belly), 0.35 * smooth(0.82, 0.98, rr)); // 연한 가장자리
      for (const [dx, dz] of dots) c.lerp(new THREE.Color(L.band), 0.7 * (1 - smooth(0.03, 0.06, Math.hypot(x - dx * 0.7, z - dz * 0.6))));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    t.setAttribute('color', new THREE.BufferAttribute(col, 3));
    t.computeVertexNormals();
    return t;
  });
  const shell = new THREE.Mesh(geo, shellMat); shell.position.y = 0.05; g.add(shell);
  const S = cached('crS', () => new THREE.SphereGeometry(0.5, q(20, 8), q(14, 6)));
  const plast = new THREE.Mesh(S, belly); plast.scale.set(0.92, 0.08, 0.78); plast.position.y = 0.04; g.add(plast);
  const headG = new THREE.Group(); headG.position.set(0.48, 0.07, 0); g.add(headG);
  const neck = new THREE.Mesh(S, skin); neck.scale.set(0.22, 0.1, 0.1); headG.add(neck);
  const hd = new THREE.Mesh(S, skin); hd.scale.set(0.18, 0.12, 0.13); hd.position.set(0.12, 0.02, 0); headG.add(hd);
  const nose = new THREE.Mesh(cached('tNose', () => new THREE.CylinderGeometry(0.014, 0.024, 0.08, q(8, 5)).rotateZ(-Math.PI / 2)), skin); nose.position.set(0.23, 0.03, 0); headG.add(nose);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(cached('crE', () => new THREE.SphereGeometry(0.035, q(10, 6), q(8, 4))), eye); e.position.set(0.16, 0.06, s * 0.05); e.scale.setScalar(0.55); headG.add(e);
    for (const fx of [0.28, -0.3]) {
      const f = new THREE.Mesh(S, skin); f.scale.set(0.2, 0.05, 0.12); f.position.set(fx, 0.03, s * 0.4); f.rotation.y = s * (fx > 0 ? -0.6 : 0.6); g.add(f);
    }
  }
  const tail = new THREE.Mesh(cached('tTail', () => new THREE.ConeGeometry(0.035, 0.12, q(8, 5)).rotateZ(Math.PI / 2)), skin); tail.position.set(-0.5, 0.04, 0); g.add(tail);
  return headG;
}

/**
 * 움직이지 않는 부품을 재질별로 한 지오메트리로 합침 (그리기 횟수: 지느러미·눈·다리 수십 개 → 재질 수만큼)
 * 흔드는 부분(tail)과 그 아래는 그대로. 합친 지오메트리는 종마다 한 번 만들어 공유
 */
function mergeStatic(g, tail, key) {
  g.updateMatrixWorld(true);
  const skip = new Set();
  tail?.traverse((o) => skip.add(o));
  const byMat = new Map();
  g.traverse((o) => { if (o.isMesh && !skip.has(o)) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o); } });
  let i = 0;
  for (const [mat, list] of byMat) {
    const k = i++;
    if (list.length < 2) continue;
    const geo = cached(`merged:${key}:${k}`, () => {
      const withColor = list.every((m) => m.geometry.attributes.color);
      return mergeGeometries(list.map((m) => {
        let gg = m.geometry.clone().applyMatrix4(m.matrixWorld);
        if (gg.index) gg = gg.toNonIndexed();
        for (const a of Object.keys(gg.attributes)) if (a !== 'position' && a !== 'normal' && !(a === 'color' && withColor)) gg.deleteAttribute(a);
        return gg;
      }));
    });
    for (const m of list) m.parent.remove(m);
    g.add(new THREE.Mesh(geo, mat));
  }
}

/** 낮음 품질을 알려 줌 (게임 품질 바꿀 때 불러도 되고, 안 불러도 아래 순서로 알아냄) */
let FISH_Q = null;
export function setFishQuality(level) { FISH_Q = level || null; }
/**
 * 지금 낮음 품질인지: setFishQuality 값 → 게임의 현재 품질 → 부팅 때 고를 품질(저장 설정·주소·기기)
 * 마지막 단계가 필요한 까닭: 호수 장면은 Game 생성자 안에서 만들어져 window.game 이 아직 없음
 */
function isLow() {
  const lv = FISH_Q ?? globalThis.game?.quality?.level ?? (typeof window !== 'undefined' ? bootLevel() : null);
  return lv === 'low';
}
let BOOT = undefined;
function bootLevel() {
  if (BOOT === undefined) { try { BOOT = resolveQuality(loadSettings()).level; } catch { BOOT = null; } }
  return BOOT;
}

/**
 * 물고기 메시 (머리 = +x). len: 몸길이(m) · opts.lo: 낮음 품질 지오메트리 (생략하면 지금 품질을 따름)
 * userData.tail: 흔들 부분(꼬리·꼬리 부채·머리) · userData.dispose(): 재질 정리 (지오메트리는 종마다 한 번 만들어 공유)
 */
export function makeFish(id, len = 0.4, { lo = isLow() } = {}) {
  const L = LOOK[id] || LOOK.fish_crucian;
  const key = LOOK[id] ? id : 'fish_crucian';
  const g = new THREE.Group(), mats = [];
  let tail;
  LO = !!lo; // 휴대폰 낮음: 몸·눈·수염·다리 정점을 줄인 지오메트리
  try {
    if (L.shape === 'shrimp') tail = buildCrust(key, L, g, mats, false);
    else if (L.shape === 'crayfish') tail = buildCrust(key, L, g, mats, true);
    else if (L.shape === 'snail') tail = buildSnail(L, g, mats);
    else if (L.shape === 'turtle') tail = buildTurtle(L, g, mats);
    else tail = buildFish(key, L, g, mats, LO);
    mergeStatic(g, tail, key);
  } finally { LO = false; }
  g.scale.setScalar(len);
  g.userData.tail = tail;
  g.userData.dispose = () => { for (const m of mats) m.dispose(); };
  return g;
}

/** 화면에 들어 보일 몸길이(m): 실제 cm 를 보기 좋게 압축 */
// 들어 보일 때 1.3배 (휴대폰에서도 생김새가 보이게)
export const showLength = (id, size) => Math.min(1.5, Math.max(0.2, (size / 100) * (ITEMS[id]?.legend ? 0.8 : 1.1) * 1.3));
