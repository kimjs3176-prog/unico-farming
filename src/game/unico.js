import { fetchModel } from './fetch_gz.js';
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeLabel } from './label.js';
import { enhanceMaterial } from './surface.js';
import { makeSDF, surfacePoint, normalAt, parseUnicoBin, colorAttribute, RIGS, bonePos, SLOTS } from './unico_mesh.js';
import { costumeShape } from './unico_costume.js';

/**
 * 유니코 3D 캐릭터 (플레이어 / 다른 접속자 / NPC 공용)
 * NPC 동물(소·양)과 같은 매끈한 도형 스타일의 네 발 유니콘에 원안 마스코트 특징을 입힘:
 *   흰 몸 · 청록 곱슬 갈기/꼬리/발굽 · 주황 띠 금색 뿔 · 분홍 주둥이와 볼 · 큰 검은 눈 · 새싹 머리핀
 * - 부품은 피벗(몸통/머리/다리4/꼬리/눈)별로 지오메트리를 병합하고 모든 인스턴스가 공유 → 접속자가 많아도 가벼움
 * - 걷기(대각선 다리 교차), 숨쉬기, 눈 깜빡임, 꼬리 흔들기, 고개 돌리기, 감정표현 애니메이션
 * - 옷/소품(outfit): strawHat, helmet, goggles, scarf, sprout + 두 발 유니코 코스튬(costume, unico_costume.js)
 * 전방은 +Z, 발바닥 y=0, 뿔 끝 약 2.2m
 */

const TWO_PI = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

// ------------------------------------------------------------------ 머티리얼 (공유)
const MAT = {};
function mat(key, color, { rough = 0.7, metal = 0, emissive = 0, transparent = false, opacity = 1 } = {}) {
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, transparent, opacity });
    MAT[key].name = key;
    if (emissive) { MAT[key].emissive = new THREE.Color(color); MAT[key].emissiveIntensity = emissive; }
  }
  return MAT[key];
}
const C = {
  white: () => mat('white', 0xffffff, { rough: 0.62 }),
  snout: () => mat('snout', 0xf7e1ec, { rough: 0.7 }),
  teal: () => mat('teal', 0x30b6aa, { rough: 0.55 }),
  tealD: () => mat('tealD', 0x249d92, { rough: 0.55 }),
  hoof: () => mat('hoof', 0x2aa79b, { rough: 0.45 }),
  gold: () => mat('gold', 0xfac03e, { rough: 0.32, metal: 0.25 }),
  orange: () => mat('orange', 0xe48e00, { rough: 0.4, metal: 0.2 }),
  eye: () => mat('eye', 0x1b1513, { rough: 0.12 }),
  shine: () => mat('shine', 0xffffff, { rough: 0.1, emissive: 0.6 }),
  pink: () => mat('pink', 0xf3b5cc, { rough: 0.8 }),
  earIn: () => mat('earIn', 0xf1d2e2, { rough: 0.8 }),
  leaf: () => mat('leaf', 0xa9d05f, { rough: 0.7 }),
  leafD: () => mat('leafD', 0x6dbb4f, { rough: 0.7 }),
  hay: () => mat('hay', 0xe8c872, { rough: 0.85 }),
  band: () => mat('band', 0x7a5230, { rough: 0.8 }),
  helmet: () => mat('helmet', 0xf6f6f6, { rough: 0.28 }),
  green: () => mat('green', 0x6dbb4f, { rough: 0.6 }),
  goggle: () => mat('goggle', 0x3a3f45, { rough: 0.4, metal: 0.3 }),
  lens: () => mat('lens', 0xbfe8ff, { rough: 0.05, transparent: true, opacity: 0.45 }),
  scarfRed: () => mat('scarfRed', 0xe35d5d, { rough: 0.85 }),
  scarfGreen: () => mat('scarfGreen', 0x7ac943, { rough: 0.85 }),
  scarfBlue: () => mat('scarfBlue', 0x4a90d9, { rough: 0.85 }),
};

// ------------------------------------------------------------------ 지오메트리 헬퍼
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function xf(g, { s = [1, 1, 1], r = [0, 0, 0], q = null, p = [0, 0, 0] } = {}) {
  g.scale(...s);
  if (q) g.applyQuaternion(q);
  else g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)));
  g.translate(...p);
  return g;
}
const sph = (rad, o, seg = 28) => xf(new THREE.SphereGeometry(rad, seg, Math.round(seg * 0.7)), o);
const cone = (rad, h, o, seg = 20) => xf(new THREE.ConeGeometry(rad, h, seg), o);
const cyl = (r1, r2, h, o, seg = 24) => xf(new THREE.CylinderGeometry(r1, r2, h, seg), o);
const torus = (R, t, o, arc = TWO_PI, seg = 24) => xf(new THREE.TorusGeometry(R, t, 10, seg, arc), o);
/** 두 점을 잇는 캡슐 */
function seg(a, b, r, segs = 18) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CapsuleGeometry(r, d.length(), 6, segs);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return xf(g, { q, p: a.clone().add(b).multiplyScalar(0.5).toArray() });
}
/** 표면 바깥을 보도록 (로컬 +Z → dir) */
const outward = (dir) => new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir.clone().normalize());

/** [[geometry, material], ...] → 그룹 병합 메시 생성용 묶음 */
function bundle(parts) {
  const mats = [];
  const geos = parts.map(([g, m]) => {
    let i = mats.indexOf(m);
    if (i < 0) { mats.push(m); i = mats.length - 1; }
    g.userData.mi = i;
    return g.index ? g.toNonIndexed() : g;
  });
  // 그룹은 머티리얼별로 정렬해 드로우콜 최소화
  const order = geos.map((g, k) => [parts[k][0].userData.mi, g]).sort((a, b) => a[0] - b[0]);
  const merged = mergeGeometries(order.map(([, g]) => g), true);
  merged.groups.forEach((gr, k) => (gr.materialIndex = order[k][0]));
  merged.computeBoundingSphere();
  return { geo: merged, mats };
}

// ------------------------------------------------------------------ 한 덩어리 스킨 메시 (public/models/unico_body.bin)
const SKINS = {}; // rig -> { geometry, slotWeights, byPalette: Map }
const SKIN_MAT = enhanceMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 }), 'fur', { contact: true, rim: 0.32 });
const OFFICIAL = { body: 0xffffff, snout: 0xf7e1ec, mane: 0x30b6aa, maneD: 0x249d92, hoof: 0x2aa79b };

/** 게임 시작 전 한 번 호출 (assets.loadAll) */
/** key: 리그 이름 또는 '<리그>_lod' (멀리 있을 때 쓰는 저해상도) */
export async function loadUnicoMesh(url, key = 'quad') {
  const ab = await fetchModel(url); // 배포 빌드는 미리 눌러 둔 .gz 를 받아 풂
  SKINS[key] = { ...parseUnicoBin(ab), byPalette: new Map() };
  // 화면 밖 캐릭터는 그리지 않도록(절두체 컬링) 경계 구를 애니메이션 여유만큼 키움
  const g = SKINS[key].geometry;
  g.computeBoundingSphere();
  g.boundingSphere.radius *= 1.45;
}

function skinGeometry(rig, paletteId) {
  const S = SKINS[rig];
  const pal = PALETTES[paletteId] || OFFICIAL;
  const key = SLOTS.map((s) => pal[s]).join('|'); // 색이 같은 팔레트(안내데스크 = 기본 등)는 같은 지오메트리
  if (!S.byPalette.has(key)) {
    // 위치·법선·뼈 가중치·인덱스는 원본 속성을 그대로 공유(GPU 버퍼도 한 벌), 색만 팔레트마다 따로
    // → 이 지오메트리는 여러 캐릭터가 함께 쓰므로 dispose() 하지 말 것
    const src = S.geometry, g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) if (name !== 'color') g.setAttribute(name, attr);
    g.setIndex(src.index);
    g.setAttribute('color', colorAttribute(S.slotWeights, pal));
    g.boundingSphere = src.boundingSphere.clone();
    S.byPalette.set(key, g);
  }
  return S.byPalette.get(key);
}

/** 스킨 메시의 화면 밖 판정 구: 기본 자세 구에 애니메이션 여유(×1.45)를 둔 값을 직접 넣음
 *  (그냥 두면 처음 그릴 때의 자세로 한 번만 계산돼 여유가 없고, 정점마다 뼈 계산도 해야 함) */
function presetBounds(skin) {
  skin.boundingSphere = skin.geometry.boundingSphere.clone();
}

// 그래픽 품질: 낮음이면 NPC·다른 접속자는 가까이서도 저해상도 몸으로, 실제 그림자는 내 캐릭터만 (Unico.setQuality)
let CHAR_Q = 'high';
// 프레임 번호: 내 캐릭터(labelAlways)가 매 프레임 한 번 올림 → 다른 캐릭터가 최근에 화면에 그려졌는지 판단
let TICK = 0;
/** 화면 밖 캐릭터의 자세 계산 간격(초), 낮음에서 아주 먼(40m 넘는) 캐릭터의 간격 */
const HIDDEN_STEP = 0.1, FAR_STEP = 1 / 15;
// 코스튬 병합 지오메트리: 뼈 기준 좌표라 모든 두 발 유니코가 함께 씀 (`${코스튬}:${부위}`, 해제하지 않음)
const COSTUME_GEO = {};

/** 꼬리·갈기 스프링 한 축 (반동 있는 감쇠 스프링, 작은 단계로 나눠 적분) */
function spring(st, key, vkey, target, k, c, steps, h) {
  for (let i = 0; i < steps; i++) { st[vkey] += (k * (target - st[key]) - c * st[vkey]) * h; st[key] += st[vkey] * h; }
}

// ------------------------------------------------------------------ 템플릿 (한 번만 생성해 공유)
// 네 발 리그 기준 상수 (템플릿 좌표용)
const BODY_Y = 0.8;
const HEAD_AT = V(0, 0.78, 0.66); // 몸통 기준 머리 중심
const HEAD_R = 0.42;
const TPLS = {};

function buildTemplate(rig = 'quad') {
  const T = {};
  // 몸통·목·머리·귀·다리·발굽·갈기·꼬리는 이음새 없는 한 덩어리 스킨 메시(unico_mesh.js)
  // 여기서는 그 표면 위에 붙는 얼굴 부품만 만든다 (표면을 찾아 정확히 밀착)
  const { sdf } = makeSDF(rig);
  const HC = bonePos(rig, 'head'); // 머리 중심(루트 기준)
  const onFace = (dirLocal, inset = 0) => {
    const pw = surfacePoint(sdf, HC, dirLocal);
    const n = normalAt(sdf, pw);
    return { p: pw.addScaledVector(n, -inset).sub(HC), n };
  };
  const FACE = RIGS[rig].face;
  /** 머리 기준 origin 에서 dir 방향으로 표면을 찾아 붙임 (주둥이 부품은 주둥이 중심에서) */
  const onFrom = (origin, dir, inset = 0) => {
    const o = HC.clone().add(origin);
    const pw = surfacePoint(sdf, o, dir);
    const n = normalAt(sdf, pw);
    return { p: pw.addScaledVector(n, -inset).sub(HC), n };
  };
  const SN = FACE ? V(...FACE.snout) : V(0, -0.15, 0.3);
  const head = [];
  for (const sx of [-1, 1]) {
    // 콧구멍: 주둥이 앞쪽 위
    const no = FACE ? onFrom(SN, V(sx * 0.32, 0.38, 1), 0.008) : onFace(V(sx * 0.17, -0.25, 0.95), 0.012);
    head.push([sph(0.024, { s: [1, 0.75, 0.55], q: outward(no.n), p: no.p.toArray() }, 10), C.eye()]);
    // 볼: 주둥이 양옆 머리 표면
    const ch = onFace(FACE ? V(sx * FACE.cheek[0], FACE.cheek[1], FACE.cheek[2]) : V(sx * 0.75, -0.2, 0.62), 0.01);
    head.push([sph(0.09, { s: [1, 0.72, 0.28], q: outward(ch.n), p: ch.p.toArray() }, 16), C.pink()]);
    // 귀 안쪽 (분홍)
    const ear = FACE ? [sx * (FACE.ear[0] - 0.006), FACE.ear[1] - 0.01, FACE.ear[2] + 0.04] : [sx * 0.242, 0.36, 0.0];
    head.push([sph(0.05, { s: [0.75, 1.9, 0.35], r: [0.25, 0, sx * -0.45], p: ear }, 12), C.earIn()]);
  }
  // 미소: 주둥이 아래쪽 앞면을 따라 그린 곡선
  const smile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = -0.11 + 0.22 * t, y = -0.32 - Math.sin(t * Math.PI) * 0.12;
    smile.push((FACE ? onFrom(SN, V(x * 2.2, y, 1), -0.004) : onFace(V(x, -0.37 + Math.sin(t * Math.PI) * -0.03, 0.92), -0.004)).p);
  }
  const curve = new THREE.CatmullRomCurve3(smile);
  head.push([new THREE.TubeGeometry(curve, 16, 0.011, 6, false), C.eye()]);
  // 뿔 (앞으로 기울어진 금색 원뿔 + 주황 띠 2개), 뿌리를 정수리 표면에 박음
  const tilt = 0.32, axis = V(0, Math.cos(tilt), Math.sin(tilt));
  const hornBase = onFace(FACE ? V(...FACE.horn) : V(0, 1, 0.38), 0.03).p;
  const hornQ = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
  head.push([cone(0.078, 0.42, { q: hornQ, p: hornBase.clone().addScaledVector(axis, 0.21).toArray() }, 24), C.gold()]);
  for (const [t, R] of [[0.07, 0.066], [0.18, 0.048]]) {
    const ringQ = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis);
    head.push([torus(R, 0.013, { q: ringQ, p: hornBase.clone().addScaledVector(axis, t).toArray() }, TWO_PI, 20), C.orange()]);
  }
  T.head = bundle(head);

  // ---- 눈 (깜빡임용): 주둥이 위 이마 쪽에 양옆으로, 표면에 살짝 박힘 ----
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = onFace(FACE ? V(sx * FACE.eye[0], FACE.eye[1], FACE.eye[2]) : V(sx * 0.42, 0.05, 0.9), 0.016);
    const ey = FACE ? 0.075 : 0.088;
    eyes.push([sph(ey, { s: [0.85, 1.2, 0.42], q: outward(e.n), p: e.p.toArray() }, 20), C.eye()]);
    eyes.push([sph(0.024, { p: e.p.clone().addScaledVector(e.n, 0.03).add(V(sx * -0.012 + 0.018, 0.032, 0)).toArray() }, 10), C.shine()]);
    eyes.push([sph(0.011, { p: e.p.clone().addScaledVector(e.n, 0.029).add(V(sx * 0.018 - 0.009, -0.03, 0)).toArray() }, 8), C.shine()]);
  }
  T.eyes = bundle(eyes);

  // ---- 소품 (머리/몸통 기준) ----
  T.sprout = bundle([
    [cyl(0.012, 0.012, 0.13, { r: [0, 0, 0.25], p: [-0.24, 0.43, 0.1] }, 8), C.leafD()],
    [sph(0.07, { s: [1.5, 0.35, 0.85], r: [0, 0.3, 0.5], p: [-0.33, 0.5, 0.1] }, 14), C.leaf()],
    [sph(0.06, { s: [1.5, 0.35, 0.85], r: [0, -0.3, -0.4], p: [-0.19, 0.51, 0.1] }, 14), C.leafD()],
  ]);
  T.strawHat = bundle([
    [cyl(0.56, 0.56, 0.035, { r: [-0.08, 0, 0], p: [0, 0.33, -0.03] }, 36), C.hay()],
    [cyl(0.27, 0.29, 0.21, { r: [-0.08, 0, 0], p: [0, 0.45, -0.04] }, 30), C.hay()],
    [torus(0.288, 0.026, { r: [Math.PI / 2 - 0.08, 0, 0], p: [0, 0.38, -0.035] }, TWO_PI, 30), C.band()],
  ]);
  T.helmet = bundle([
    [xf(new THREE.SphereGeometry(0.46, 32, 16, 0, TWO_PI, 0, Math.PI / 2), { s: [1, 0.82, 1.03], p: [0, 0.1, -0.02] }), C.helmet()],
    [cyl(0.3, 0.3, 0.03, { s: [1, 1, 0.55], p: [0, 0.12, 0.37] }, 28), C.helmet()],
    [xf(new THREE.BoxGeometry(0.14, 0.045, 0.03), { r: [-0.6, 0, 0], p: [0, 0.4, 0.29] }), C.green()],
    [xf(new THREE.BoxGeometry(0.045, 0.14, 0.03), { r: [-0.6, 0, 0], p: [0, 0.4, 0.29] }), C.green()],
  ]);
  const gog = [];
  for (const sx of [-1, 1]) {
    const dir = V(sx * 0.17, 0, 0.385).normalize();
    const pos = dir.clone().multiplyScalar(HEAD_R + 0.04);
    gog.push([torus(0.105, 0.022, { q: outward(dir), p: pos.toArray() }, TWO_PI, 24), C.goggle()]);
    gog.push([xf(new THREE.CircleGeometry(0.1, 24), { q: outward(dir), p: pos.toArray() }), C.lens()]);
  }
  gog.push([cyl(0.015, 0.015, 0.12, { r: [0, 0, Math.PI / 2], p: [0, 0.01, 0.44] }, 8), C.goggle()]);
  T.goggles = bundle(gog);
  // 스카프: 목 둘레 (몸통 뼈 기준). 두 발 유니코는 목이 곧게 서 있음
  const scarf = (m) => bundle(rig === 'biped' ? [
    [torus(0.23, 0.05, { r: [Math.PI / 2 + 0.12, 0, 0], p: [0, 0.55, 0.03] }, TWO_PI, 30), m],
    [cone(0.11, 0.2, { r: [Math.PI + 0.2, 0, 0], p: [0.07, 0.42, 0.26] }, 3), m],
  ] : [
    [torus(0.215, 0.055, { r: [Math.PI / 2 + 0.55, 0, 0], p: [0, 0.38, 0.5] }, TWO_PI, 28), m],
    [cone(0.13, 0.24, { r: [Math.PI + 0.35, 0, 0], p: [0, 0.2, 0.68] }, 3), m],
  ]);
  T.scarfRed = scarf(C.scarfRed());
  T.scarfGreen = scarf(C.scarfGreen());
  T.scarfBlue = scarf(C.scarfBlue());
  return T;
}

function meshOf(b) {
  const m = new THREE.Mesh(b.geo, b.mats.length === 1 ? b.mats[0] : b.mats);
  m.castShadow = false; // 얼굴·소품은 작아서 그림자는 몸이 대신 (그림자 패스 부담 감소)
  m.receiveShadow = true;
  return m;
}

const BLOB_GEO = new THREE.CircleGeometry(0.62, 28);
let BLOB_TEX = null;
/** 가장자리가 부드럽게 사라지는 접지 그림자 텍스처 */
function blobTexture() {
  if (BLOB_TEX) return BLOB_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  BLOB_TEX = new THREE.CanvasTexture(c);
  return BLOB_TEX;
}

/**
 * 색 팔레트 — 플레이어는 원안 그대로(흰 몸 + 청록), NPC는 역할별로 다른 색이라 한눈에 구분
 * body: 몸, snout: 주둥이, mane/maneD: 갈기·꼬리 두 톤, hoof: 발굽
 */
export const PALETTES = {
  official: null,
  merchant: { body: 0xfff0d2, snout: 0xffe1c4, mane: 0xf28c28, maneD: 0xd9741a, hoof: 0xd9741a },
  researcher: { body: 0xeee8ff, snout: 0xe6ddff, mane: 0x8e7cc3, maneD: 0x7563ad, hoof: 0x7563ad },
  guide: { body: 0xe6f6e8, snout: 0xd8f0dc, mane: 0x6dbb4f, maneD: 0x58a33c, hoof: 0x58a33c },
  granny: { body: 0xf1ede6, snout: 0xf0e2da, mane: 0xbfc4ca, maneD: 0xa3a9b0, hoof: 0x8f959c },
  kid: { body: 0xffe8f0, snout: 0xffd6e4, mane: 0xf28bb0, maneD: 0xe06e98, hoof: 0xe06e98 },
  fisher: { body: 0xe8f1fa, snout: 0xdbe8f5, mane: 0x3a7bd5, maneD: 0x2b62b0, hoof: 0x2b62b0 },
};
const SWAP = { white: 'body', snout: 'snout', teal: 'mane', tealD: 'maneD', hoof: 'hoof' };

function applyPalette(root, id) {
  const pal = PALETTES[id];
  if (!pal) return;
  const variant = (m) => {
    const slot = SWAP[m.name];
    if (!slot) return m;
    const key = `${m.name}_${id}`;
    if (!MAT[key]) { MAT[key] = m.clone(); MAT[key].name = key; MAT[key].color.setHex(pal[slot]); }
    return MAT[key];
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(variant) : variant(o.material);
  });
}

// 감정표현 → 머리 위 아이콘
// 행동별 손에 드는 도구 (두 발 캐릭터 오른손)
const PROP_OF = { hoe: 'hoe', water: 'can', net: 'net', cast: 'rod', fishwait: 'rod', reel: 'rod', brush: 'brush' };
const HAND_R = [0.16, -0.34, 0.045]; // 오른팔 뼈 기준 손 위치

/** 손 도구 (팔 뼈 로컬 좌표: 팔을 내리고 있을 때 -y 가 손끝 방향, +z 가 앞) */
function makeProp(kind) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.35, metalness: 0.7 });
  if (kind === 'hoe') { // 호미: 짧은 나무 자루 + ㄱ자로 꺾인 쇠 날
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.3, 8), wood);
    handle.rotation.x = Math.PI / 2; handle.position.z = 0.1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 6), metal);
    neck.position.set(0, -0.05, 0.27);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), metal);
    blade.scale.set(1, 1, 0.25); blade.rotation.x = Math.PI; blade.position.set(0, -0.17, 0.3);
    g.add(handle, neck, blade);
  } else if (kind === 'can') { // 물뿌리개
    const tin = new THREE.MeshStandardMaterial({ color: 0x5aa9d6, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.17, 14), tin);
    body.rotation.x = Math.PI / 2; body.position.set(0, -0.12, 0.02);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.24, 6), tin);
    spout.position.set(0, -0.26, 0.11); spout.rotation.x = -0.6;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.03, 10), tin);
    rose.position.set(0, -0.36, 0.18); rose.rotation.x = -0.6;
    g.add(body, spout, rose);
  } else if (kind === 'net') { // 곤충채
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.75, 6), wood);
    handle.position.y = -0.3;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20), metal);
    hoop.position.y = -0.82; hoop.rotation.y = Math.PI / 2;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.26, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4f7ee, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.9 }));
    mesh.rotation.z = Math.PI / 2; mesh.position.set(0.13, -0.82, 0);
    g.add(handle, hoop, mesh);
  } else if (kind === 'brush') { // 가축 빗: 나무 손잡이 + 솔
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 6), wood);
    handle.position.y = -0.06;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.09), new THREE.MeshStandardMaterial({ color: 0xb5824e, roughness: 0.7 }));
    head.position.set(0, -0.16, 0.02);
    const bristle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.07), new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 1 }));
    bristle.position.set(0, -0.2, 0.02);
    g.add(handle, head, bristle);
  } else if (kind === 'rod') { // 낚싯대 (끝 위치: userData.tip)
    const dir = new THREE.Vector3(0, -0.25, 0.97).normalize();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 1.8, 6).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0xc9a35a, roughness: 0.5 }));
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    rod.position.copy(dir).multiplyScalar(-0.12);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), metal);
    reel.rotation.z = Math.PI / 2; reel.position.set(-0.04, -0.03, 0.05);
    const tip = new THREE.Object3D(); tip.position.copy(dir).multiplyScalar(1.68);
    g.add(rod, reel, tip);
    g.userData.tip = tip; g.userData.rod = rod;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const EMOTE_ICON = { startle: '❗', cheer: '🎉', heart: '❤️', wave: '👋', think: '❓', water: '💧', tablet: '📱', present: '📊', megaphone: '📣', lab: '🧪' };

export class Unico {
  /** 그래픽 품질 단계 알려 주기 ('low' | 'medium' | 'high') — 낮음이면 NPC·다른 접속자를 가볍게 그림 */
  static setQuality(level) { CHAR_Q = level || 'high'; }

  /**
   * @param assets (사용 안 함, 호환용)
   * @param opts.name 이름표, opts.outfit { hat: 'straw'|'helmet'|null, goggles, scarf: 'red'|'green'|'blue'|null, sprout }
   */
  constructor(assets, { name = '', labelColor = '#fff', labelBg, outfit = {}, palette = 'official', rig = 'quad' } = {}) {
    if (!SKINS[rig]) throw new Error('loadUnicoMesh() 를 먼저 호출하세요');
    if (!TPLS[rig]) TPLS[rig] = buildTemplate(rig);
    const TPL = TPLS[rig];
    this.rig = rig;
    this.biped = rig === 'biped';
    const R = RIGS[rig];
    this.bodyY = R.bones[0][2][1];
    this.legLen = R.legLen;
    this.group = new THREE.Group();
    this.position = this.group.position;
    this.root = new THREE.Group(); // 회전(진행 방향)
    this.group.add(this.root);
    // 뼈대 (리그 정의대로): 몸통 → 머리 / 다리 / (두 발이면 팔) / 꼬리
    const boneMap = {};
    for (const [n, parent, p] of R.bones) {
      const b = new THREE.Bone();
      b.name = n;
      b.position.set(...p);
      (parent ? boneMap[parent] : this.root).add(b);
      boneMap[n] = b;
    }
    this.bodyG = boneMap.body;
    this.headG = boneMap.head;
    this.tailG = boneMap.tail;
    // 꼬리 사슬·갈기 (스프링 2차 동작). 예전 메시(뼈 없음)여도 동작하도록 있는 것만
    this.tailChain = [boneMap.tail, boneMap.tail2, boneMap.tail3].filter(Boolean);
    this.maneBones = [boneMap.maneH, boneMap.maneN].filter(Boolean);
    this.legs = this.biped ? [boneMap.legL, boneMap.legR] : [boneMap.legFL, boneMap.legFR, boneMap.legBL, boneMap.legBR];
    this.arms = this.biped ? [boneMap.armL, boneMap.armR] : [];
    this.boneMap = boneMap;
    this.costumeMeshes = {}; // 코스튬 id → 부위별 메시 (처음 입을 때 만듦)
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(R.bones.map((b) => boneMap[b[0]]));
    this.skin = new THREE.SkinnedMesh(skinGeometry(rig, palette), SKIN_MAT);
    this.skin.castShadow = true;
    this.skin.receiveShadow = false; // 팔·귀가 몸에 드리운 자기 그림자가 얼룩처럼 보여 끔 (만화풍 깔끔한 음영)
    this.root.add(this.skin);
    this.skin.bind(this.skeleton);
    presetBounds(this.skin);
    // 화면에 그려진 프레임 기록 (화면 밖이면 자세 계산을 몰아서 함)
    this._seen = TICK;
    const seen = () => { this._seen = TICK; };
    this.skin.onBeforeRender = seen;
    // 거리 LOD: 멀리 있으면 같은 뼈대를 쓰는 저해상도 메시로 (삼각형 약 1/4), 그림자는 가까울 때만
    if (SKINS[rig + '_lod']) {
      this.skinLod = new THREE.SkinnedMesh(skinGeometry(rig + '_lod', palette), SKIN_MAT);
      this.skinLod.castShadow = false;
      this.skinLod.receiveShadow = false;
      this.skinLod.visible = false;
      this.root.add(this.skinLod);
      this.skinLod.bind(this.skeleton);
      presetBounds(this.skinLod);
      this.skinLod.onBeforeRender = seen;
    }
    this.bodyMesh = new THREE.Object3D(); // (호환) 숨쉬기는 몸통 뼈 미세 이동으로 대체
    // 얼굴 부품 (머리 뼈에 붙음)
    this.headG.add(meshOf(TPL.head));
    this.eyesG = meshOf(TPL.eyes);
    this.headG.add(this.eyesG);
    // 소품
    this.acc = {};
    const addAcc = (key, parent) => { const m = meshOf(TPL[key]); m.visible = false; parent.add(m); this.acc[key] = m; };
    // 머리 소품은 머리 크기에 맞춰 축소
    this.headAcc = new THREE.Group();
    this.headAcc.scale.setScalar(R.headR / 0.42);
    this.headG.add(this.headAcc);
    for (const k of ['sprout', 'strawHat', 'helmet', 'goggles']) addAcc(k, this.headAcc);
    for (const k of ['scarfRed', 'scarfGreen', 'scarfBlue']) addAcc(k, this.bodyG);
    this.setOutfit({ sprout: true, ...outfit });
    // 바닥 그림자 (부드러운 접지감)
    const sh = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x231916, transparent: true, opacity: 0.42, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.95, 1.45, 1);
    sh.position.y = 0.018;
    sh.renderOrder = 2;
    this.shadow = sh;
    this.root.add(sh);
    // 발굽 접지 그림자 (발이 땅에 닿아 있는 느낌)
    this.footShadows = this.legs.map((leg) => {
      const lw = leg.getWorldPosition(new THREE.Vector3());
      const f = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x1a120f, transparent: true, opacity: 0.55, depthWrite: false }));
      f.rotation.x = -Math.PI / 2;
      f.scale.setScalar(0.2);
      f.position.set(lw.x, 0.02, lw.z);
      f.renderOrder = 3;
      this.root.add(f);
      return f;
    });

    this.props = {}; // 손 도구 (필요할 때 만듦)
    this.holding = null; // 행동과 무관하게 계속 드는 도구 (낚시 중 낚싯대)
    this.swimming = false; // 물속 (수영 자세, 몸이 물에 잠김)
    this.sink = 0;
    this.reelTension = 0; // 감기 자세: 팽팽할수록 뒤로 버팀
    this.onHit = null; // 호미 내리찍기·채 휘두르기 순간 (흙·물보라 효과)

    this.facing = 0;
    this.yaw = 0;
    this.moving = false;
    this.riding = false;
    this.t = Math.random() * 10;
    this.walkPhase = 0;
    this.walkBlend = 0;
    this.action = null;
    this.actionT = 0;
    this.actionUntil = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.lookYaw = 0;
    this.onStep = null;
    this.lastSin = 0;
    this.label = null;
    applyPalette(this.root, palette);
    this.palette = palette;
    if (name) this.setName(name, labelColor, labelBg);
  }

  setOutfit(o) {
    this.outfit = { ...(this.outfit || {}), ...o };
    const f = this.outfit;
    // 코스튬 (두 발 유니코만): 입은 것만 보이게, 모자·새싹·스카프를 가리는 옷이면 그것들은 숨김
    const shape = this.biped && f.costume ? costumeShape(f.costume) : null;
    if (shape && !this.costumeMeshes[f.costume]) {
      const list = [];
      for (const [part, pieces] of Object.entries(shape.parts)) {
        const parent = part === 'head' ? this.headAcc : part === 'body' ? this.bodyG : this.boneMap[part];
        if (!parent || !pieces.length) continue;
        const m = meshOf(COSTUME_GEO[`${f.costume}:${part}`] ||= bundle(pieces.map(([g, mt]) => [g.clone(), mt])));
        parent.add(m); list.push(m);
      }
      this.costumeMeshes[f.costume] = list;
    }
    for (const [id, list] of Object.entries(this.costumeMeshes)) for (const m of list) m.visible = !!shape && id === f.costume;
    const hat = shape?.hideHat ? null : f.hat;
    this.acc.sprout.visible = !!f.sprout && !hat && !shape?.hideSprout;
    this.acc.strawHat.visible = hat === 'straw';
    this.acc.helmet.visible = hat === 'helmet';
    this.acc.goggles.visible = !!f.goggles;
    const scarf = shape?.hideScarf ? null : f.scarf;
    this.acc.scarfRed.visible = scarf === 'red';
    this.acc.scarfGreen.visible = scarf === 'green';
    this.acc.scarfBlue.visible = scarf === 'blue';
  }

  setName(name, color = '#fff', bg) {
    if (this.label) { this.group.remove(this.label); this.label.userData.dispose(); }
    this.label = makeLabel(name, bg ? { color, bg } : { color });
    this.label.position.y = this.biped ? 2.3 : 2.55;
    this.group.add(this.label);
  }

  say(text, seconds = 4) {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.userData.dispose(); }
    this.bubble = makeLabel(text, { color: '#231916', bg: 'rgba(255,255,255,0.92)', size: 36 });
    this.bubble.position.y = 3.0;
    this.group.add(this.bubble);
    this.bubbleUntil = this.t + seconds;
  }

  /** 감정표현/행동 (seconds 동안, 0 이면 해제할 때까지). safety = 안전모 쓰고 탑승 자세 */
  playAction(name, seconds = 1.5) {
    if (name === 'safety') {
      this.riding = true;
      this._savedHat = this.outfit.hat ?? null;
      this.setOutfit({ hat: 'helmet' });
      this.action = null;
      return;
    }
    this.action = name;
    this.actionT = 0;
    this._hitCyc = undefined;
    this.actionUntil = seconds > 0 ? this.t + seconds : Infinity;
    const icon = Object.hasOwn(EMOTE_ICON, name) ? EMOTE_ICON[name] : null; // 원격 플레이어가 보낸 이름은 정해진 것만 ('constructor' 등 차단)
    if (icon) {
      if (this.emote) { this.group.remove(this.emote); this.emote.userData.dispose(); }
      this.emote = makeLabel(icon, { bg: 'rgba(0,0,0,0)', size: 64, scale: 0.008 });
      this.emote.position.y = 2.6;
      this.group.add(this.emote);
      this.emoteUntil = this.t + Math.max(1.2, Math.min(seconds || 2, 2.5));
    }
  }

  clearAction() {
    if (this.riding) { this.riding = false; this.setOutfit({ hat: this._savedHat ?? null }); }
    this.action = null;
  }

  /** 손 도구 (두 발 캐릭터만) */
  prop(kind) {
    if (!this.biped) return null;
    if (!this.props[kind]) {
      const m = makeProp(kind);
      m.position.set(...HAND_R);
      m.visible = false;
      this.arms[1].add(m);
      this.props[kind] = m;
    }
    return this.props[kind];
  }

  /** 낚싯대 끝 월드 위치 */
  rodTip(out) {
    const r = this.props.rod;
    if (!r || !r.visible) return null;
    this.root.updateMatrixWorld(true);
    return r.userData.tip.getWorldPosition(out);
  }

  /** 호환용 (예전 스프라이트 포즈 API) */
  showPose() {}

  /** 자세 전환(감정표현 시작·끝, 트랙터 타고 내리기) 때 뼈 각도를 이전 자세에서 부드럽게 이어 줄 대상 */
  _poseBones() {
    return this._pb ||= [this.bodyG, this.headG, ...this.legs, ...this.arms];
  }

  /**
   * 꼬리·갈기 2차 동작: 몸의 회전·가감속·위아래 움직임을 늦게 따라가는 감쇠 스프링.
   * 꼬리는 뿌리 → 중간 → 끝으로 갈수록 한 박자씩 늦게 휘어 채찍처럼 물결치고,
   * 갈기는 출발·정지·점프 때 뒤로 쏠렸다 돌아오며 방향을 틀면 바깥으로 휘날림.
   */
  _secondary(dt, speed, w, ph, bodyY, bodyRoll, tailBase) {
    if (!this.tailChain.length || dt <= 0) return;
    const clamp = THREE.MathUtils.clamp;
    // 몸의 움직임 측정 (프레임 사이 변화)
    const yawRate = wrap(this.yaw - (this._sYaw ?? this.yaw)) / dt; this._sYaw = this.yaw;
    const acc = (speed - (this._sSpd ?? speed)) / dt; this._sSpd = speed;
    const wy = this.group.position.y + bodyY, vy = (wy - (this._sY ?? wy)) / dt; this._sY = wy;
    this._accS = (this._accS ?? 0) + (clamp(acc, -40, 40) - (this._accS ?? 0)) * (1 - Math.exp(-dt * 12)); // 튀는 값 완화
    const turn = clamp(-yawRate * 0.11, -0.7, 0.7), lag = clamp(-this._accS * 0.035, -0.45, 0.45), bounce = clamp(-vy * 0.35, -0.5, 0.5);
    const sp = (this._springs ||= { tail: this.tailChain.map(() => ({ x: 0, vx: 0, y: 0, vy: 0 })), mane: this.maneBones.map(() => ({ x: 0, vx: 0, z: 0, vz: 0 })) });
    // 반동 있는 스프링 (감쇠비 약 0.35~0.45), 큰 dt(멀리 있어 몰아서 계산할 때 포함)는 나눠서 적분해 안정
    const steps = Math.min(8, Math.ceil(dt / (1 / 60))), h = dt / steps;
    // 꼬리: 걸을 때 엉덩이 따라 좌우로 살랑, 가만히 있으면 느긋하게 흔들
    const swish = Math.sin(ph) * 0.22 * w + Math.sin(this.t * 1.7) * 0.12 * (1 - w);
    let parentY = 0, parentX = 0;
    const tail = this.tailChain;
    for (let i = 0; i < tail.length; i++) {
      const st = sp.tail[i];
      const tx = (i === 0 ? tailBase - 0.06 * w + lag + bounce + Math.sin(this.t * 1.3) * 0.04 : 0) + parentX * 0.55;
      const ty = (i === 0 ? turn + swish : 0) + parentY * 0.6;
      spring(st, 'x', 'vx', tx, 95 - i * 15, 7.5 - i, steps, h);
      spring(st, 'y', 'vy', ty, 85 - i * 15, 7 - i, steps, h);
      st.x = clamp(st.x, -1.1, 1.1); st.y = clamp(st.y, -1.1, 1.1);
      tail[i].rotation.set(st.x, st.y, 0);
      parentX = st.x; parentY = st.y;
    }
    // 갈기: 뒤통수·목덜미가 살짝 늦게 출렁
    const mane = this.maneBones;
    for (let i = 0; i < mane.length; i++) {
      const st = sp.mane[i];
      const tx = clamp(lag * 0.6 + bounce * 0.5 + Math.sin(ph * 2) * 0.05 * w, -0.35, 0.35);
      const tz = clamp(-turn * 0.35 - bodyRoll * 0.8 + Math.sin(this.t * 1.1 + i) * 0.03, -0.35, 0.35);
      spring(st, 'x', 'vx', tx, 140, 9, steps, h);
      spring(st, 'z', 'vz', tz, 130, 9, steps, h);
      mane[i].rotation.set(st.x, 0, st.z);
    }
  }

  update(dt, camera) {
    if (this.labelAlways) TICK++;
    // 언덕: 장면에 바로 놓인 캐릭터는 지면 높이를 따라감 (트랙터 탑승 등 다른 물체에 붙으면 제외)
    // 수영: 몸이 물에 잠김 (잠수 중에는 더 깊이). 자세를 몰아서 계산하는 동안에도 매 프레임
    const sinkT = this.swimming ? (this.action === 'dive' ? -0.68 - Math.sin(Math.min(1, this.actionT / 1.3) * Math.PI) * 1.3 : -0.68) : 0;
    this.sink += (sinkT - this.sink) * (1 - Math.exp(-dt * (this.swimming ? 5 : 8)));
    // floorY: 실내 등 지형 대신 정해진 바닥 높이
    if (this.group.parent?.isScene) this.group.position.y = (this.floorY ?? heightAt(this.group.position.x, this.group.position.z)) + this.sink;
    // 이름표: 가까울 때만 또렷하게 (멀면 흐려져 화면이 복잡하지 않게). 내 캐릭터는 항상 표시
    let d = Infinity;
    if (camera) {
      d = camera.position.distanceTo(this.group.position);
      const low = CHAR_Q === 'low', hero = !!this.labelAlways;
      // 거리별 표현: 15m 넘으면 저해상도 몸, 24m 넘으면 그림자 끔, 40m 넘으면 얼굴 부품 생략 (경계에서 깜빡이지 않게 여유)
      // 낮음: 내 캐릭터가 아니면 9m 넘으면 저해상도 몸 (대화 구도 7m 안팎은 원본), 실제 그림자 대신 바닥 그림자만
      if (this.skinLod) {
        const far = low && !hero ? d > (this.isLod ? 8 : 9) : d > (this.isLod ? 14 : 16);
        if (far !== this.isLod) { this.isLod = far; this.skin.visible = !far; this.skinLod.visible = far; }
      }
      this.skin.castShadow = d < 24 && (hero || !low);
      const faceOn = d < (this.faceOff ? 36 : 40);
      if (faceOn === !!this.faceOff) { this.faceOff = !faceOn; for (const c of this.headG.children) if (c.isMesh) c.visible = faceOn; }
      // 카메라 바로 앞(3m 안)에서는 이름표·감정 아이콘이 화면을 가리지 않게 흐리게
      const near = THREE.MathUtils.clamp((d - 1.8) / 1.6, 0, 1);
      if (this.emote) this.emote.visible = near > 0.3;
      if (this.label && !this.labelAlways) {
      const a = THREE.MathUtils.clamp((22 - d) / 7, 0, 1) * near;
      this.label.material.opacity = a;
      this.label.visible = a > 0.02;
      }
    }
    // 화면 밖(최근 두 프레임 동안 안 그려짐)이면 자세 계산을 몰아서 (흩어진 시점에 한 번씩), 낮음에서는 40m 넘게 먼 캐릭터도
    // 내 캐릭터는 늘 매 프레임, 몸 그림자가 화면에 비칠 수 있는 동안도 매 프레임
    if (!this.labelAlways) {
      const hidden = TICK - this._seen > 2 && !(this.skin.castShadow && this.skin.visible);
      const step = hidden ? HIDDEN_STEP : d > 40 && CHAR_Q === 'low' ? FAR_STEP : 0;
      if (step) {
        this._lazyDt = (this._lazyDt ?? Math.random() * step) + dt;
        if (this._lazyDt < step) return;
        dt = Math.min(this._lazyDt, 0.5); this._lazyDt = 0;
      } else if (this._lazyDt !== undefined) { dt += this._lazyDt; this._lazyDt = undefined; } // 다시 보이면 밀린 시간까지 한 번에 (속도가 튀지 않게)
    }
    this.t += dt;
    // 직전 프레임 자세 저장 (전환 보간용)
    const bones = this._poseBones();
    const prev = (this._prevPose ||= bones.map(() => [0, 0, 0, 1]));
    for (let i = 0; i < bones.length; i++) { const b = bones[i], q = prev[i]; q[0] = b.rotation.x; q[1] = b.rotation.y; q[2] = b.rotation.z; q[3] = b.scale.y; }
    const prevBodyY = this.bodyG.position.y;
    if (this.action && this.t > this.actionUntil) this.action = null;
    if (this.bubble && this.t > this.bubbleUntil) { this.group.remove(this.bubble); this.bubble.userData.dispose(); this.bubble = null; }
    if (this.emote) {
      this.emote.position.y = 2.6 + Math.min(0.4, (this.t - (this.emoteUntil - 2)) * 0.3);
      if (this.t > this.emoteUntil) { this.group.remove(this.emote); this.emote.userData.dispose(); this.emote = null; }
    }

    // 진행 방향으로 부드럽게 회전
    const turnErr = wrap(this.facing - this.yaw);
    const prevYaw = this.yaw;
    // 크게 돌아설 때는 조금 느리게(약 0.3초), 살짝 꺾을 때는 빠르게 → 휙 돌지 않고 몸을 돌려 방향을 틂
    this.yaw += turnErr * (1 - Math.exp(-dt * (Math.abs(turnErr) > 1.6 ? 8 : 12)));
    this.root.rotation.y = this.yaw;
    const turnRate = dt > 0 ? wrap(this.yaw - prevYaw) / dt : 0;
    this._turn = (this._turn ?? 0) + (turnRate - (this._turn ?? 0)) * (1 - Math.exp(-dt * 10));

    // ---- 걷기: 발이 미끄러지지 않도록 실제 이동 거리로 보행 위상을 진행 ----
    const pos = this.group.position;
    const moved = this.lastPos ? Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z) : 0;
    this.lastPos = this.lastPos || new THREE.Vector3();
    this.lastPos.copy(pos);
    const speed = dt > 0 ? moved / dt : 0;
    const walking = this.moving || speed > 0.3;
    this.walkBlend += ((walking ? 1 : 0) - this.walkBlend) * (1 - Math.exp(-dt * 10)); // 프레임 속도와 무관한 감쇠
    const LEG_LEN = this.legLen, BODY_Y = this.bodyY, bp = this.biped;
    // 이등신 종종걸음: 다리가 짧아 보폭만큼 정확히 디디면 초당 7번 넘게 다리를 휘저어 떨려 보이므로
    // 걸음 수(케이던스)를 초당 1.5~3회로 제한하고, 빠를수록 다리를 크게 벌림 (발이 약간 미끄러지는 대신 자연스러운 리듬)
    const sp01 = Math.min(1, speed / 4.6);
    const ampT = bp ? 0.38 + 0.32 * sp01 : 0.42 + 0.18 * sp01; // 다리 최대 각도(rad)
    this.walkAmp = (this.walkAmp ?? ampT) + (ampT - (this.walkAmp ?? ampT)) * (1 - Math.exp(-dt * 6));
    const AMP = this.walkAmp;
    const stride = 2 * LEG_LEN * Math.sin(AMP); // 반주기 동안 디딘 발이 미는 거리
    const cadence = THREE.MathUtils.clamp(Math.max(speed, 1.2) / (2 * stride), 1.5, bp ? 3.0 : 3.2); // 초당 걸음 주기
    if (walking) this.walkPhase += TWO_PI * cadence * dt;
    else if (this.walkBlend > 0.02) { const tgt = Math.ceil(this.walkPhase / Math.PI - 0.15) * Math.PI; this.walkPhase += (tgt - this.walkPhase) * (1 - Math.exp(-dt * 9)); }
    const w = this.walkBlend, ph = this.walkPhase;
    const sw = Math.sin(ph) * AMP * w;
    const legs = this.legs, arms = this.arms;
    const lift = 0, lift2 = 0; // 다리 길이를 줄였다 늘리지 않음 (고무처럼 보임)
    for (const l of legs) l.rotation.set(0, 0, 0);
    if (bp) {
      // 두 발: 좌우 다리 교차, 팔은 반대로 흔들기
      const [L, Rl] = legs;
      L.rotation.x = sw; Rl.rotation.x = -sw;
      L.scale.y = 1 - lift; Rl.scale.y = 1 - lift2;
      const [AL, AR] = arms;
      const armK = 0.55 + 0.4 * sp01; AL.rotation.set(-sw * armK, 0, -(0.14 + 0.05 * sp01) * w); AR.rotation.set(sw * armK, 0, (0.14 + 0.05 * sp01) * w);
      // 대기: 팔이 숨쉬듯 살짝
      if (w < 0.5) { const br = Math.sin(this.t * 2.1) * 0.04; AL.rotation.z -= br; AR.rotation.z += br; }
    } else {
      const [FL, FR, BL, BR] = legs;
      FL.rotation.x = BR.rotation.x = sw;
      FR.rotation.x = BL.rotation.x = -sw;
      FL.scale.y = BR.scale.y = 1 - lift;
      FR.scale.y = BL.scale.y = 1 - lift2;
    }
    // 다리가 기울면 발끝 높이가 L(1-cosθ) 만큼 올라가므로 그만큼 몸을 내려 발을 땅에 붙임
    // 다리를 벌리면 골반이 내려가고(발이 땅에 붙게), 한 발로 디디는 중간에는 살짝 튀어 오름 → 걸음마다 통통
    const bob = -LEG_LEN * (1 - Math.cos(sw)) * (bp ? 0.65 : 1) + (bp ? Math.abs(Math.cos(ph)) * 0.018 * w * (0.5 + sp01) : 0);
    const s = Math.sin(ph);
    if (walking && !this.swimming && Math.sign(s) !== Math.sign(this.lastSin)) this.onStep?.(pos.x, pos.z);
    this.lastSin = s;

    // 몸: 빠를수록 앞으로 기울고, 디딘 발 쪽으로 살짝 기우뚱. 머리는 몸의 흔들림을 반쯤 상쇄(시선 안정)
    let bodyY = BODY_Y + bob, bodyPitch = Math.sin(ph * 2) * 0.025 * w + (bp ? (0.04 + 0.06 * sp01) * w : 0), bodyRoll = bp ? Math.sin(ph) * 0.045 * w : 0;
    let headPitch = -Math.sin(ph * 2) * 0.02 * w - (bp ? 0.04 * sp01 * w : 0), headRoll = -bodyRoll * 0.5;
    const breath = Math.sin(this.t * 2.1) * 0.012 * (1 - w); // 숨쉬기: 가슴이 살짝 오르내림
    bodyY += breath;
    // 돌 때 안쪽으로 살짝 기울기 (빠를수록 크게) — 자전거 타듯 몸이 회전을 따라감
    if (!this.swimming && !this.riding) bodyRoll += THREE.MathUtils.clamp(-this._turn * 0.028 * (0.3 + sp01), -0.11, 0.11) * w;
    // 가속하면 앞으로, 감속하면 뒤로 살짝 (속도 변화를 부드럽게 걸러서)
    const accel = dt > 0 ? (speed - (this._lspd ?? speed)) / dt : 0; this._lspd = speed;
    this._acc = (this._acc ?? 0) + (THREE.MathUtils.clamp(accel, -25, 25) - (this._acc ?? 0)) * (1 - Math.exp(-dt * 8));
    if (bp && !this.swimming && !this.riding) bodyPitch += THREE.MathUtils.clamp(this._acc * 0.006, -0.07, 0.08);
    // 멈추는 순간: 무게가 실리며 살짝 주저앉았다 돌아옴
    if (this._wasWalking && !walking) this._settle = 0.38;
    this._wasWalking = walking;
    if (this._settle > 0) { this._settle = Math.max(0, this._settle - dt); const k = 1 - this._settle / 0.38; bodyY -= Math.sin(k * Math.PI) * 0.035 * (bp ? 1 : 0.6); bodyPitch -= Math.sin(k * Math.PI) * 0.03; }
    // 대기 중 두리번
    if (!this.moving && !this.action) {
      this.lookYaw += (Math.sin(this.t * 0.45) * 0.35 - this.lookYaw) * (1 - Math.exp(-dt * 2));
    } else this.lookYaw *= Math.exp(-dt * 6);
    let headYaw = this.lookYaw;
    // 돌아서기 전에 고개가 먼저 가려는 쪽을 봄
    if (!this.action) headYaw += THREE.MathUtils.clamp(turnErr * 0.45, -0.5, 0.5);
    // 꼬리
    let tailBase = 0; // 꼬리 뿌리 기본 각도 (탑승 시 들어 올림)

    // ---- 감정표현 ----
    if (this.action) {
      this.actionT += dt;
      const a = this.actionT;
      const [AL, AR] = arms;
      switch (this.action) {
        case 'startle': { // 깜짝 놀람: 펄쩍 뛰며 몸을 뒤로 젖히고(네 발이면 앞발을 번쩍), 잠깐 부르르 떨기
          const up = Math.sin(Math.min(1, a / 0.38) * Math.PI);
          const shiver = a > 0.38 ? Math.sin(a * 42) * Math.max(0, 1 - (a - 0.38) / 0.8) : 0;
          bodyY += up * (bp ? 0.34 : 0.4);
          headPitch = -0.38; headRoll = shiver * 0.08;
          if (bp) {
            bodyPitch = -0.16 * Math.min(1, a / 0.2);
            AL.rotation.set(-0.25, 0, -2.25 + shiver * 0.12); AR.rotation.set(-0.25, 0, 2.25 - shiver * 0.12);
            legs[0].rotation.x = 0.35 * up; legs[1].rotation.x = -0.3 * up;
          } else {
            bodyPitch = -0.5 * Math.min(1, a / 0.22) * (1 - Math.max(0, a - 0.9) / 0.4);
            legs[0].rotation.x = legs[1].rotation.x = -1.15 + shiver * 0.15;
            legs[2].rotation.x = legs[3].rotation.x = 0.3;
          }
          break;
        }
        case 'cheer': { // 깡총깡총 + 한 바퀴 (두 발이면 만세)
          const j = Math.abs(Math.sin(a * 9));
          bodyY += j * (bp ? 0.24 : 0.32);
          this.root.rotation.y = this.yaw + Math.min(1, a / 0.9) * TWO_PI;
          headPitch = -0.25;
          for (const l of legs) l.rotation.x = (1 - j) * (bp ? 0.25 : 0.4);
          if (bp) { AL.rotation.set(-0.35, 0, -1.85 + Math.sin(a * 18) * 0.15); AR.rotation.set(-0.35, 0, 1.85 - Math.sin(a * 18) * 0.15); } // 머리가 커서 옆으로 만세
          break;
        }
        case 'wave': { // 손 흔들기
          if (bp) { AR.rotation.set(-0.55, 0, 1.75 + Math.sin(a * 12) * 0.3); headRoll = -0.12; headPitch = -0.1; } // 머리 옆에서 손 흔들기
          else {
            bodyPitch = -0.38; bodyY += 0.12;
            legs[1].rotation.x = -1.4 + Math.sin(a * 12) * 0.35;
            legs[0].rotation.x = -0.5;
            headPitch = 0.15;
          }
          break;
        }
        case 'shoo': { // 쫓기: 두 팔을 머리 위로 크게 휘저으며 발을 쿵쿵
          const st = Math.abs(Math.sin(a * 11));
          bodyY += st * 0.07; headPitch = -0.22 + Math.sin(a * 22) * 0.05; bodyPitch = 0.08;
          if (bp) {
            AL.rotation.set(-0.5, 0, -1.75 + Math.sin(a * 20) * 0.45); AR.rotation.set(-0.5, 0, 1.75 - Math.sin(a * 20 + 1) * 0.45);
            legs[0].rotation.x = Math.max(0, Math.sin(a * 11)) * 0.35; legs[1].rotation.x = Math.max(0, -Math.sin(a * 11)) * 0.35;
          } else { legs[0].rotation.x = legs[1].rotation.x = -0.6 - st * 0.4; bodyPitch = -0.3; }
          break;
        }
        case 'talk': // 말하기: 고개를 끄덕이며 한 손으로 손짓
          headPitch = Math.sin(a * 7) * 0.07 - 0.04; headRoll = Math.sin(a * 2.6) * 0.07;
          if (bp) AR.rotation.set(-0.55 + Math.sin(a * 4.5) * 0.18, 0, 0.3);
          break;
        case 'heart': // 두 손을 가슴 앞에 모으고 흔들흔들
          headRoll = Math.sin(a * 5) * 0.25; bodyRoll = Math.sin(a * 5) * 0.06;
          if (bp) { AL.rotation.set(-1.2, 0, 0.55); AR.rotation.set(-1.2, 0, -0.55); }
          break;
        case 'think': // 턱에 손
          headRoll = 0.3; headYaw = 0.25; headPitch = -0.15;
          if (bp) AR.rotation.set(-1.9, 0, -0.5);
          break;
        case 'water': case 'tablet': case 'lab': // 두 손을 앞으로 (물뿌리개·태블릿)
          headPitch = 0.45 + Math.sin(a * 8) * 0.08;
          if (bp) { AL.rotation.set(-1.0, 0, 0.25); AR.rotation.set(-1.0 + Math.sin(a * 8) * 0.1, 0, -0.25); }
          break;
        case 'present': case 'megaphone': // 한 손을 들어 가리키기
          headPitch = -0.2 + Math.sin(a * 6) * 0.1; headYaw = Math.sin(a * 3) * 0.3;
          if (bp) AR.rotation.set(-1.5 + Math.sin(a * 6) * 0.15, 0, 0.2);
          break;
        case 'hoe': { // 호미질: 높이 들었다가 땅에 콱 내리찍기 (0.6초 주기)
          const T = 0.6, u = (a % T) / T, cyc = Math.floor(a / T);
          const up = u < 0.55 ? 1 - (1 - u / 0.55) ** 2 : u < 0.68 ? 1 - (u - 0.55) / 0.13 : 0;
          const ax = -0.45 - up * 2.0;
          const lean = u >= 0.55 && u < 0.85 ? Math.sin((u - 0.55) / 0.3 * Math.PI) : 0;
          bodyPitch = 0.12 + lean * 0.32 - up * 0.08; bodyY -= lean * 0.06; headPitch = 0.38 - up * 0.15;
          if (bp) { AR.rotation.set(ax, 0, 0.12); AL.rotation.set(ax + 0.15, 0, -0.35); legs[0].rotation.x = 0.28; legs[1].rotation.x = -0.22; }
          else { headPitch = 0.5 + lean * 0.3; }
          if (u >= 0.66 && this._hitCyc !== cyc) { this._hitCyc = cyc; this.onHit?.('hoe'); }
          break;
        }
        case 'plant': { // 쪼그려 앉아 씨앗 넣고 토닥토닥
          const pat = Math.max(0, Math.sin(a * 11)) * 0.18;
          bodyY -= 0.12; bodyPitch = 0.42; headPitch = 0.42;
          if (bp) { AR.rotation.set(-0.55 + pat, 0, -0.08); AL.rotation.set(-0.5 - pat * 0.5, 0, 0.08); legs[0].rotation.x = 0.4; legs[1].rotation.x = -0.4; }
          else headPitch = 0.6 + pat;
          break;
        }
        case 'pull': { // 수확: 허리 숙여 잡고 → 쑥 뽑아 들어 올리기
          const k = Math.min(1, a / 0.35), y = a < 0.35 ? 0 : Math.min(1, (a - 0.35) / 0.18);
          bodyPitch = 0.5 * k * (1 - y) - 0.22 * y; bodyY += y * 0.1 * Math.max(0, 1 - (a - 0.53) * 3); headPitch = 0.45 * (1 - y) - 0.25 * y;
          if (bp) { const ax = -0.65 * (1 - y) - 2.3 * y; AR.rotation.set(ax, 0, 0.15 * y); AL.rotation.set(ax, 0, -0.15 * y); legs[0].rotation.x = 0.3 * (1 - y); legs[1].rotation.x = -0.3 * (1 - y); }
          break;
        }
        case 'push': { // 나무 흔들기: 두 손으로 줄기를 밀었다 당겼다
          const sh = Math.sin(a * 15);
          bodyPitch = 0.16 + sh * 0.09; headPitch = -0.08 + sh * 0.05; bodyRoll = sh * 0.04;
          if (bp) { AR.rotation.set(-1.4 + sh * 0.18, 0, -0.12); AL.rotation.set(-1.4 + sh * 0.18, 0, 0.12); legs[0].rotation.x = 0.38; legs[1].rotation.x = -0.32; }
          else { legs[0].rotation.x = legs[1].rotation.x = -0.9 + sh * 0.2; bodyPitch = -0.3; }
          break;
        }
        case 'net': { // 곤충채 휘두르기: 뒤에서 앞으로 크게 한 번
          const k = Math.min(1, a / 0.42), e = k < 0.45 ? k / 0.45 : 1;
          const sw = k < 0.45 ? 0 : (k - 0.45) / 0.55;
          const ax = -2.5 * e + 2.2 * sw;
          headYaw = 0.35 - sw * 0.6; bodyPitch = sw * 0.2; headPitch = sw * 0.25;
          if (bp) { AR.rotation.set(ax, 0, 0.5 - sw * 0.4); AL.rotation.set(-0.4, 0, -0.3); legs[0].rotation.x = 0.3 * sw; }
          if (k >= 0.8 && this._hitCyc !== -2) { this._hitCyc = -2; this.onHit?.('net'); }
          break;
        }
        case 'scatter': { // 모이·사료 뿌리기: 왼손 그릇, 오른손으로 휙휙
          const fl = Math.sin(a * 7);
          headPitch = 0.3; bodyPitch = 0.08 + Math.max(0, fl) * 0.05;
          if (bp) { AL.rotation.set(-1.05, 0, 0.35); AR.rotation.set(-0.7 - Math.max(0, fl) * 0.9, 0, 0.25 - fl * 0.2); }
          break;
        }
        case 'cast': { // 낚싯대 던지기: 머리 뒤로 젖혔다가 앞으로 휙
          const back = Math.min(1, a / 0.32), thr = a < 0.32 ? 0 : Math.min(1, (a - 0.32) / 0.16);
          const ax = -0.9 - back * 1.9 * (1 - thr) + thr * 0.05;
          bodyPitch = -0.14 * back * (1 - thr) + 0.14 * thr; headPitch = -0.2 * (1 - thr) + 0.12 * thr;
          if (bp) { AR.rotation.set(ax, 0, 0.15); AL.rotation.set(-0.9, 0, -0.2); legs[0].rotation.x = 0.25; legs[1].rotation.x = -0.2; }
          if (thr >= 1 && this._hitCyc !== -3) { this._hitCyc = -3; this.onHit?.('cast'); }
          break;
        }
        case 'fishwait': { // 찌 바라보며 기다리기 (살랑살랑)
          const sw2 = Math.sin(a * 1.6);
          headPitch = 0.12 + Math.sin(a * 0.7) * 0.04; bodyRoll = sw2 * 0.02; headRoll = sw2 * 0.04;
          if (bp) { AR.rotation.set(-0.95 + Math.sin(a * 2.3) * 0.03, 0, 0.1); AL.rotation.set(-0.85, 0, -0.25); }
          break;
        }
        case 'reel': { // 힘겨루기: 뒤로 버티며 오른손으로 릴을 감음
          const ten = this.reelTension, cr = a * (ten > 0.05 ? 13 : 4);
          bodyPitch = -0.12 - ten * 0.2; headPitch = 0.05 - ten * 0.1; bodyRoll = Math.sin(a * 9) * 0.03 * ten;
          if (bp) { AR.rotation.set(-0.85 - ten * 0.25 + Math.sin(a * 21) * 0.03 * ten, 0, 0.1); AL.rotation.set(-1.05 + Math.sin(cr) * 0.18, 0, -0.3 + Math.cos(cr) * 0.12); legs[0].rotation.x = 0.35; legs[1].rotation.x = -0.32; }
          break;
        }
        case 'brush': { // 빗질: 앞으로 숙여 쓱쓱 (팔을 앞뒤로 길게)
          const st = Math.sin(a * 9);
          bodyPitch = 0.28 + st * 0.04; headPitch = 0.3; bodyY -= 0.03; headRoll = st * 0.04;
          if (bp) { AR.rotation.set(-1.05 + st * 0.32, 0, 0.12 - st * 0.08); AL.rotation.set(-0.75, 0, -0.35); legs[0].rotation.x = 0.3; legs[1].rotation.x = -0.25; }
          else headPitch = 0.5 + st * 0.1;
          break;
        }
        case 'lift': { // 낚은 물고기를 머리 위로 번쩍
          bodyY += Math.abs(Math.sin(a * 6)) * 0.05; headPitch = -0.3;
          if (bp) { AR.rotation.set(-0.4, 0, 2.2); AL.rotation.set(-0.4, 0, -2.2); }
          break;
        }
        default: break;
      }
    }
    // ---- 수영: 몸을 앞으로 눕히고 개헤엄 (팔 교대로 젓기 + 발차기), 얼굴은 물 위로 ----
    if (this.swimming) {
      const m = Math.min(1, speed / 2), f = 2.6 + m * 4.5;
      const st = this.t * f;
      bodyPitch = 0.75 + Math.sin(st * 2) * 0.03; bodyRoll = Math.sin(st) * 0.08 * m; headPitch = -0.72; headRoll = -bodyRoll * 0.6;
      bodyY = BODY_Y + Math.sin(st * 2) * 0.03;
      if (this.action === 'dive') { bodyPitch = 1.45; headPitch = 0.2; }
      if (bp) {
        arms[0].rotation.set(-1.25 + Math.sin(st) * (0.4 + m * 0.5), 0, -0.45);
        arms[1].rotation.set(-1.25 + Math.sin(st + Math.PI) * (0.4 + m * 0.5), 0, 0.45);
        legs[0].rotation.x = 0.5 + Math.sin(st * 2.4) * 0.35; legs[1].rotation.x = 0.5 + Math.sin(st * 2.4 + Math.PI) * 0.35;
      } else { legs.forEach((l, i) => (l.rotation.x = Math.sin(st * 2 + i * 1.6) * 0.6)); }
      if (m > 0.2 && Math.sign(Math.sin(st)) !== Math.sign(this._swimS ?? 0)) this.onStroke?.(pos.x, pos.z);
      this._swimS = Math.sin(st);
    }
    // 손 도구 보이기
    const want = this.holding || (this.swimming ? null : PROP_OF[this.action]);
    if (want !== this._propShown) {
      for (const [k, m] of Object.entries(this.props)) m.visible = false;
      const pm = want ? this.prop(want) : null;
      if (pm) pm.visible = true;
      this._propShown = want;
    }
    // ---- 탑승 (트랙터) ----
    if (this.riding) {
      if (bp) { // 의자에 앉아 두 손으로 핸들
        bodyY = BODY_Y - 0.1;
        bodyPitch = 0;
        for (const l of legs) { l.rotation.x = -1.4; l.scale.y = 1; }
        arms[0].rotation.set(-1.15, 0, 0.35); arms[1].rotation.set(-1.15, 0, -0.35);
        tailBase = 0.4;
      } else {
        bodyY = BODY_Y - 0.28;
        bodyPitch = -0.25;
        legs[0].rotation.x = legs[1].rotation.x = -1.2;
        legs[2].rotation.x = legs[3].rotation.x = -1.45;
        tailBase = 0.6;
      }
    }
    this.bodyG.position.y = bodyY;
    this.bodyG.rotation.set(bodyPitch, 0, bodyRoll);
    this.headG.rotation.set(headPitch, headYaw, headRoll);
    this._secondary(dt, speed, w, ph, bodyY, bodyRoll, tailBase);
    // ---- 자세 전환 보간: 감정표현·탑승 상태가 바뀌면 0.3초 동안 이전 자세에서 새 자세로 이어 줌 ----
    // (걷기 주기 자체에는 걸지 않아 발 디딤 타이밍은 그대로)
    const pk = (this._pk ||= { a: this.action || '', r: !!this.riding, s: !!this.swimming });
    if (pk.a !== (this.action || '') || pk.r !== !!this.riding || pk.s !== !!this.swimming) {
      this._transT = 0.3; pk.a = this.action || ''; pk.r = !!this.riding; pk.s = !!this.swimming;
    }
    if (this._transT > 0) {
      this._transT = Math.max(0, this._transT - dt);
      const k = Math.max(1 - Math.exp(-dt * 10), 1 - this._transT / 0.3); // 끝날 때는 정확히 새 자세에 도달
      for (let i = 0; i < bones.length; i++) {
        const b = bones[i], q = prev[i];
        b.rotation.set(q[0] + wrap(b.rotation.x - q[0]) * k, q[1] + wrap(b.rotation.y - q[1]) * k, q[2] + wrap(b.rotation.z - q[2]) * k);
        b.scale.y = q[3] + (b.scale.y - q[3]) * k;
      }
      this.bodyG.position.y = prevBodyY + (bodyY - prevBodyY) * k;
    }
    // 눈 깜빡임
    this.nextBlink -= dt;
    let blink = 1;
    if (this.nextBlink < 0.12) blink = 0.12;
    if (this.nextBlink <= 0) this.nextBlink = 2.5 + Math.random() * 3.5;
    this.eyesG.scale.y = blink;
    // 그림자: 점프하면 작고 옅어짐, 발굽 그림자는 발 위치를 따라감
    const air = Math.max(0, bodyY - this.bodyY);
    const shs = Math.max(0.45, 1 - air * 1.8);
    if (this.biped) this.shadow.scale.set(0.95 * shs, 0.85 * shs, 1);
    else this.shadow.scale.set(0.95 * shs, 1.45 * shs, 1);
    this.shadow.material.opacity = 0.42 * shs;
    this.shadow.visible = !this.riding && !this.swimming;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i], f = this.footShadows[i];
      const a = leg.rotation.x;
      f.position.z = leg.position.z - Math.sin(a) * this.legLen; // 발굽의 수평 위치 (x축 회전 시 발끝은 -z 로)
      const footY = bodyY + leg.position.y - Math.cos(a) * this.legLen * leg.scale.y; // 발굽 높이
      const k = Math.max(0, 1 - Math.max(0, footY) * 6);
      f.material.opacity = 0.55 * k;
      f.scale.setScalar(0.2 * (0.7 + 0.3 * k));
      f.visible = !this.riding && !this.swimming;
    }
  }

  /** 이 캐릭터만 쓰는 자원 해제 (원격 플레이어가 나갈 때).
   *  함께 쓰는 것은 그대로 둠: 바닥 그림자 원판·텍스처, 몸 재질과 팔레트별 몸 지오메트리, 얼굴·소품 템플릿, 코스튬 지오메트리·재질 */
  dispose() {
    this.label?.userData.dispose();
    this.bubble?.userData.dispose();
    this.emote?.userData.dispose();
    this.shadow.material.dispose();
    for (const f of this.footShadows) f.material.dispose();
    // 손 도구는 캐릭터마다 새로 만든 것 (makeProp)
    const own = new Set();
    for (const p of Object.values(this.props)) p.traverse((o) => { if (o.isMesh) own.add(o.geometry).add(o.material); });
    for (const r of own) r.dispose();
    this.skeleton.dispose(); // 뼈 텍스처 (몸·저해상도 몸이 함께 씀)
  }
}
