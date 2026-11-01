import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeLabel } from './label.js';
import { makeSDF, surfacePoint, normalAt, parseUnicoBin, colorAttribute, BONES } from './unico_mesh.js';

/**
 * 유니코 3D 캐릭터 (플레이어 / 다른 접속자 / NPC 공용)
 * NPC 동물(소·양)과 같은 매끈한 도형 스타일의 네 발 유니콘에 원안 마스코트 특징을 입힘:
 *   흰 몸 · 청록 곱슬 갈기/꼬리/발굽 · 주황 띠 금색 뿔 · 분홍 주둥이와 볼 · 큰 검은 눈 · 새싹 머리핀
 * - 부품은 피벗(몸통/머리/다리4/꼬리/눈)별로 지오메트리를 병합하고 모든 인스턴스가 공유 → 접속자가 많아도 가벼움
 * - 걷기(대각선 다리 교차), 숨쉬기, 눈 깜빡임, 꼬리 흔들기, 고개 돌리기, 감정표현 애니메이션
 * - 옷/소품(outfit): strawHat, helmet, goggles, scarf, sprout
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
let SKIN = null; // { geometry, slotWeights, byPalette: Map }
const SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
const OFFICIAL = { body: 0xffffff, snout: 0xf7e1ec, mane: 0x30b6aa, maneD: 0x249d92, hoof: 0x2aa79b };

/** 게임 시작 전 한 번 호출 (assets.loadAll) */
export async function loadUnicoMesh(url) {
  const ab = await (await fetch(url)).arrayBuffer();
  SKIN = { ...parseUnicoBin(ab), byPalette: new Map() };
}

function skinGeometry(paletteId) {
  if (!SKIN.byPalette.has(paletteId)) {
    const g = SKIN.geometry.clone(); // 속성 배열은 복사되지만 1회/팔레트
    g.setAttribute('color', colorAttribute(SKIN.slotWeights, PALETTES[paletteId] || OFFICIAL));
    SKIN.byPalette.set(paletteId, g);
  }
  return SKIN.byPalette.get(paletteId);
}

// ------------------------------------------------------------------ 템플릿 (한 번만 생성해 공유)
// 몸통 그룹 원점 = 몸통 중심 (지면에서 BODY_Y)
const BODY_Y = 0.8;
const LEG_LEN = 0.6; // 고관절~발바닥
const HEAD_AT = V(0, 0.78, 0.66); // 몸통 기준 머리 중심
const HEAD_R = 0.42;
let TPL = null;

function buildTemplate() {
  const T = {};
  // 몸통·목·머리·귀·다리·발굽·갈기·꼬리는 이음새 없는 한 덩어리 스킨 메시(unico_mesh.js)
  // 여기서는 그 표면 위에 붙는 얼굴 부품만 만든다 (표면을 찾아 정확히 밀착)
  const { sdf } = makeSDF();
  const HC = V(0, BODY_Y, 0).add(HEAD_AT); // 머리 중심(루트 기준)
  const onFace = (dirLocal, inset = 0) => {
    const pw = surfacePoint(sdf, HC, dirLocal);
    const n = normalAt(sdf, pw);
    return { p: pw.addScaledVector(n, -inset).sub(HC), n };
  };
  const head = [];
  for (const sx of [-1, 1]) {
    const no = onFace(V(sx * 0.17, -0.25, 0.95), 0.012);
    head.push([sph(0.026, { s: [1, 0.8, 0.6], q: outward(no.n), p: no.p.toArray() }, 10), C.eye()]); // 콧구멍
    const ch = onFace(V(sx * 0.75, -0.2, 0.62), 0.01);
    head.push([sph(0.09, { s: [1, 0.72, 0.28], q: outward(ch.n), p: ch.p.toArray() }, 16), C.pink()]); // 볼
    // 귀 안쪽 (분홍)
    head.push([sph(0.05, { s: [0.75, 1.9, 0.35], r: [0.25, 0, sx * -0.45], p: [sx * 0.242, 0.36, 0.0] }, 12), C.earIn()]);
  }
  // 미소: 주둥이 아래쪽 표면을 따라 그린 곡선
  const smile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = -0.1 + 0.2 * t, y = -0.37 + Math.sin(t * Math.PI) * -0.03;
    smile.push(onFace(V(x, y, 0.92), -0.004).p);
  }
  const curve = new THREE.CatmullRomCurve3(smile);
  head.push([new THREE.TubeGeometry(curve, 16, 0.011, 6, false), C.eye()]);
  // 뿔 (앞으로 기울어진 금색 나선 원뿔 + 주황 띠 2개), 뿌리를 정수리 표면에 박음
  const tilt = 0.32, axis = V(0, Math.cos(tilt), Math.sin(tilt));
  const hornBase = onFace(V(0, 1, 0.38), 0.03).p;
  const hornQ = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
  head.push([cone(0.078, 0.42, { q: hornQ, p: hornBase.clone().addScaledVector(axis, 0.21).toArray() }, 24), C.gold()]);
  for (const [t, R] of [[0.07, 0.066], [0.18, 0.048]]) {
    const ringQ = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis);
    head.push([torus(R, 0.013, { q: ringQ, p: hornBase.clone().addScaledVector(axis, t).toArray() }, TWO_PI, 20), C.orange()]);
  }
  T.head = bundle(head);

  // ---- 눈 (깜빡임용, 표면에 살짝 박힌 큰 검은 눈 + 하이라이트) ----
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = onFace(V(sx * 0.42, 0.05, 0.9), 0.018);
    eyes.push([sph(0.088, { s: [0.82, 1.15, 0.42], q: outward(e.n), p: e.p.toArray() }, 20), C.eye()]);
    eyes.push([sph(0.026, { p: e.p.clone().addScaledVector(e.n, 0.035).add(V(sx * -0.015 + 0.02, 0.035, 0)).toArray() }, 10), C.shine()]);
    eyes.push([sph(0.012, { p: e.p.clone().addScaledVector(e.n, 0.034).add(V(sx * 0.02 - 0.01, -0.035, 0)).toArray() }, 8), C.shine()]);
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
  const scarf = (m) => bundle([
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
  m.castShadow = true;
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
const EMOTE_ICON = { cheer: '🎉', heart: '❤️', wave: '👋', think: '❓', water: '💧', tablet: '📱', present: '📊', megaphone: '📣', lab: '🧪' };

export class Unico {
  /**
   * @param assets (사용 안 함, 호환용)
   * @param opts.name 이름표, opts.outfit { hat: 'straw'|'helmet'|null, goggles, scarf: 'red'|'green'|'blue'|null, sprout }
   */
  constructor(assets, { name = '', labelColor = '#fff', labelBg, outfit = {}, palette = 'official' } = {}) {
    if (!SKIN) throw new Error('loadUnicoMesh() 를 먼저 호출하세요');
    if (!TPL) TPL = buildTemplate();
    this.group = new THREE.Group();
    this.position = this.group.position;
    this.root = new THREE.Group(); // 회전(진행 방향)
    this.group.add(this.root);
    // 뼈대: 몸통 → 머리 / 다리 4 / 꼬리 (기존 피벗과 같은 위치·이름이라 애니메이션 코드 그대로 사용)
    this.bodyG = new THREE.Bone();
    this.bodyG.position.y = BODY_Y;
    this.root.add(this.bodyG);
    this.headG = new THREE.Bone();
    this.headG.position.copy(HEAD_AT);
    this.bodyG.add(this.headG);
    this.legs = [[-0.25, 0.36], [0.25, 0.36], [-0.25, -0.38], [0.25, -0.38]].map(([x, z]) => {
      const b = new THREE.Bone();
      b.position.set(x, -0.2, z);
      this.bodyG.add(b);
      return b;
    });
    this.tailG = new THREE.Bone();
    this.tailG.position.set(0, 0.12, -0.56);
    this.bodyG.add(this.tailG);
    this.root.updateMatrixWorld(true);
    const bones = { body: this.bodyG, head: this.headG, legFL: this.legs[0], legFR: this.legs[1], legBL: this.legs[2], legBR: this.legs[3], tail: this.tailG };
    this.skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));
    this.skin = new THREE.SkinnedMesh(skinGeometry(palette), SKIN_MAT);
    this.skin.castShadow = this.skin.receiveShadow = true;
    this.skin.frustumCulled = false;
    this.root.add(this.skin);
    this.skin.bind(this.skeleton);
    this.bodyMesh = new THREE.Object3D(); // (호환) 숨쉬기는 몸통 뼈 미세 이동으로 대체
    // 얼굴 부품 (머리 뼈에 붙음)
    this.headG.add(meshOf(TPL.head));
    this.eyesG = meshOf(TPL.eyes);
    this.headG.add(this.eyesG);
    // 소품
    this.acc = {};
    const addAcc = (key, parent) => { const m = meshOf(TPL[key]); m.visible = false; parent.add(m); this.acc[key] = m; };
    for (const k of ['sprout', 'strawHat', 'helmet', 'goggles']) addAcc(k, this.headG);
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
      const f = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x1a120f, transparent: true, opacity: 0.55, depthWrite: false }));
      f.rotation.x = -Math.PI / 2;
      f.scale.setScalar(0.2);
      f.position.set(leg.position.x, 0.02, leg.position.z);
      f.renderOrder = 3;
      this.root.add(f);
      return f;
    });

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
    this.acc.sprout.visible = !!f.sprout && !f.hat;
    this.acc.strawHat.visible = f.hat === 'straw';
    this.acc.helmet.visible = f.hat === 'helmet';
    this.acc.goggles.visible = !!f.goggles;
    this.acc.scarfRed.visible = f.scarf === 'red';
    this.acc.scarfGreen.visible = f.scarf === 'green';
    this.acc.scarfBlue.visible = f.scarf === 'blue';
  }

  setName(name, color = '#fff', bg) {
    if (this.label) { this.group.remove(this.label); this.label.userData.dispose(); }
    this.label = makeLabel(name, bg ? { color, bg } : { color });
    this.label.position.y = 2.55;
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
    this.actionUntil = seconds > 0 ? this.t + seconds : Infinity;
    const icon = EMOTE_ICON[name];
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

  /** 호환용 (예전 스프라이트 포즈 API) */
  showPose() {}

  update(dt, camera) {
    this.t += dt;
    if (this.action && this.t > this.actionUntil) this.action = null;
    if (this.bubble && this.t > this.bubbleUntil) { this.group.remove(this.bubble); this.bubble.userData.dispose(); this.bubble = null; }
    if (this.emote) {
      this.emote.position.y = 2.6 + Math.min(0.4, (this.t - (this.emoteUntil - 2)) * 0.3);
      if (this.t > this.emoteUntil) { this.group.remove(this.emote); this.emote.userData.dispose(); this.emote = null; }
    }

    // 진행 방향으로 부드럽게 회전
    this.yaw += wrap(this.facing - this.yaw) * Math.min(1, dt * 12);
    this.root.rotation.y = this.yaw;

    // ---- 걷기: 발이 미끄러지지 않도록 실제 이동 거리로 보행 위상을 진행 ----
    const pos = this.group.position;
    const moved = this.lastPos ? Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z) : 0;
    this.lastPos = this.lastPos || new THREE.Vector3();
    this.lastPos.copy(pos);
    const speed = dt > 0 ? moved / dt : 0;
    const walking = this.moving || speed > 0.3;
    this.walkBlend += ((walking ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 10);
    const AMP = 0.5; // 다리 최대 각도(rad)
    const stride = 2 * LEG_LEN * Math.sin(AMP); // 반주기 동안 디딘 발이 미는 거리
    if (walking) this.walkPhase += (Math.max(speed, 1.2) / stride) * Math.PI * dt;
    const w = this.walkBlend, ph = this.walkPhase;
    const sw = Math.sin(ph) * AMP * w;
    const [FL, FR, BL, BR] = this.legs;
    FL.rotation.set(sw, 0, 0); BR.rotation.set(sw, 0, 0);
    FR.rotation.set(-sw, 0, 0); BL.rotation.set(-sw, 0, 0);
    // 드는 발(앞으로 나가는 쪽)은 살짝 접어 들어 올림, 디딘 발은 펴서 땅에 닿게
    const lift = Math.max(0, Math.cos(ph)) * 0.14 * w, lift2 = Math.max(0, -Math.cos(ph)) * 0.14 * w;
    FL.scale.y = BR.scale.y = 1 - lift;
    FR.scale.y = BL.scale.y = 1 - lift2;
    // 다리가 기울면 발끝 높이가 L(1-cosθ) 만큼 올라가므로 그만큼 몸을 내려 발을 땅에 붙임
    const bob = -LEG_LEN * (1 - Math.cos(sw));
    const s = Math.sin(ph);
    if (walking && Math.sign(s) !== Math.sign(this.lastSin)) this.onStep?.(pos.x, pos.z);
    this.lastSin = s;

    let bodyY = BODY_Y + bob, bodyPitch = Math.sin(ph * 2) * 0.03 * w, bodyRoll = 0;
    let headPitch = Math.sin(ph * 2 + 0.5) * 0.06 * w, headRoll = 0;
    // 숨쉬기
    const breath = Math.sin(this.t * 2.1) * 0.012 * (1 - w); // 숨쉬기: 가슴이 살짝 오르내림
    bodyY += breath;
    // 대기 중 두리번
    if (!this.moving && !this.action) {
      this.lookYaw += (Math.sin(this.t * 0.45) * 0.35 - this.lookYaw) * Math.min(1, dt * 2);
    } else this.lookYaw *= 1 - Math.min(1, dt * 6);
    let headYaw = this.lookYaw;
    // 꼬리
    this.tailG.rotation.set(Math.sin(this.t * 1.7) * 0.08 - 0.05 * w, Math.sin(this.t * (2.2 + w * 4)) * (0.25 + 0.2 * w), 0);

    // ---- 감정표현 ----
    if (this.action) {
      this.actionT += dt;
      const a = this.actionT;
      switch (this.action) {
        case 'cheer': { // 깡총깡총 + 한 바퀴
          const j = Math.abs(Math.sin(a * 9));
          bodyY += j * 0.32;
          this.root.rotation.y = this.yaw + Math.min(1, a / 0.9) * TWO_PI;
          headPitch = -0.25;
          for (const l of this.legs) l.rotation.x = (1 - j) * 0.4;
          break;
        }
        case 'wave': { // 앞발 들어 흔들기
          bodyPitch = -0.38; bodyY += 0.12;
          FR.rotation.x = -1.4 + Math.sin(a * 12) * 0.35;
          FL.rotation.x = -0.5;
          headPitch = 0.15;
          break;
        }
        case 'heart': headRoll = Math.sin(a * 5) * 0.25; bodyRoll = Math.sin(a * 5) * 0.06; break;
        case 'think': headRoll = 0.3; headYaw = 0.25; headPitch = -0.15; break;
        case 'water': case 'tablet': case 'lab': headPitch = 0.45 + Math.sin(a * 8) * 0.08; break;
        case 'present': case 'megaphone': headPitch = -0.2 + Math.sin(a * 6) * 0.1; headYaw = Math.sin(a * 3) * 0.3; break;
        default: break;
      }
    }
    // ---- 탑승 (트랙터) ----
    if (this.riding) {
      bodyY = BODY_Y - 0.28;
      bodyPitch = -0.25;
      FL.rotation.x = FR.rotation.x = -1.2;
      BL.rotation.x = BR.rotation.x = -1.45;
      this.tailG.rotation.x = 0.6;
    }
    this.bodyG.position.y = bodyY;
    this.bodyG.rotation.set(bodyPitch, 0, bodyRoll);
    this.headG.rotation.set(headPitch, headYaw, headRoll);
    // 눈 깜빡임
    this.nextBlink -= dt;
    let blink = 1;
    if (this.nextBlink < 0.12) blink = 0.12;
    if (this.nextBlink <= 0) this.nextBlink = 2.5 + Math.random() * 3.5;
    this.eyesG.scale.y = blink;
    // 그림자: 점프하면 작고 옅어짐, 발굽 그림자는 발 위치를 따라감
    const air = Math.max(0, bodyY - BODY_Y);
    const shs = Math.max(0.45, 1 - air * 1.8);
    this.shadow.scale.set(0.95 * shs, 1.45 * shs, 1);
    this.shadow.material.opacity = 0.42 * shs;
    this.shadow.visible = !this.riding;
    this.legs.forEach((leg, i) => {
      const f = this.footShadows[i];
      const a = leg.rotation.x;
      f.position.z = leg.position.z - Math.sin(a) * LEG_LEN; // 발굽의 수평 위치 (x축 회전 시 발끝은 -z 로)
      const footY = bodyY + leg.position.y - Math.cos(a) * LEG_LEN * leg.scale.y; // 발굽 높이
      const k = Math.max(0, 1 - Math.max(0, footY) * 6);
      f.material.opacity = 0.55 * k;
      f.scale.setScalar(0.2 * (0.7 + 0.3 * k));
      f.visible = !this.riding;
    });
  }

  dispose() {
    this.label?.userData.dispose();
    this.bubble?.userData.dispose();
    this.emote?.userData.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
