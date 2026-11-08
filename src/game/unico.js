import { fetchModel } from './fetch_gz.js';
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeLabel } from './label.js';
import { enhanceMaterial } from './surface.js';
import { makeSDF, surfacePoint, normalAt, parseUnicoBin, colorAttribute, RIGS, bonePos, SLOTS, registerRig, unicoDecoderReady } from './unico_mesh.js';
import { costumeShape } from './unico_costume.js';
import { SPECIES, labelHeights } from './species.js';

/**
 * 유니코 3D 캐릭터 (플레이어 / 다른 접속자 / NPC 공용)
 * NPC 동물(소·양)과 같은 매끈한 도형 스타일의 네 발 유니콘에 원안 마스코트 특징을 입힘:
 *   흰 몸 · 청록 곱슬 갈기/꼬리/발굽 · 주황 띠 금색 뿔 · 분홍 주둥이와 볼 · 큰 검은 눈 · 새싹 머리핀
 * - 부품은 피벗(몸통/머리/다리4/꼬리/눈)별로 지오메트리를 병합하고 모든 인스턴스가 공유 → 접속자가 많아도 가벼움
 * - 걷기(대각선 다리 교차), 숨쉬기, 눈 깜빡임, 꼬리 흔들기, 고개 돌리기, 감정표현 애니메이션
 * - 옷/소품(outfit): strawHat, helmet, goggles, scarf, sprout + 두 발 유니코 코스튬(costume, unico_costume.js)
 * - 주민 6명은 동물 종(species.js): 두 발 종 리그 + 구운 얼굴/옷 기준점(bin 의 meta)으로 얼굴·옷 조립, 귀·꼬리 스프링, 종별 걸음·대기 동작
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
  lensV: () => mat('lensV', 0xbfe3f5, { rough: 0.08, transparent: true, opacity: 0.85, emissive: 0.1 }), // 주민 고글 렌즈: 멀리서도 하늘색 (초상화와 같게)
  scarfRed: () => mat('scarfRed', 0xe35d5d, { rough: 0.85 }),
  scarfGreen: () => mat('scarfGreen', 0x7ac943, { rough: 0.85 }),
  scarfBlue: () => mat('scarfBlue', 0x4a90d9, { rough: 0.85 }),
  iris: () => mat('iris', 0xc9a33a, { rough: 0.25 }),
  ring: () => mat('ring', 0x8c847c, { rough: 0.6 }),
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
const torus = (R, t, o, arc = TWO_PI, seg = 24, radial = 10) => xf(new THREE.TorusGeometry(R, t, radial, seg, arc), o);
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

/**
 * 게임 시작 전 한 번 호출 (assets.loadAll). key: 리그 이름 또는 '<리그>_lod' (멀리 있을 때 쓰는 저해상도)
 * @param opts.yieldTo 나중 받기용: 받은 뒤·풀기 전·색 만들기 전에 기다릴 함수 (한가할 때) → 풀기·색 만들기가 한 프레임에 몰리지 않게
 * @param opts.data 미리 시작한 받기 (Promise<ArrayBuffer>) — 여러 파일을 나란히 받고 풀기만 차례로 할 때
 */
export async function loadUnicoMesh(url, key = 'quad', { yieldTo = null, data = null } = {}) {
  const ab = await (data ?? fetchModel(url)); // 배포 빌드는 미리 눌러 둔 .gz 를 받아 풂
  await unicoDecoderReady;
  if (yieldTo) await yieldTo();
  const r = parseUnicoBin(ab);
  // 주민 종: bin 의 meta(뼈대·얼굴/옷 기준점)로 리그 등록 (원본·LOD 중 먼저 온 것). 나중 것은 같은 뼈대·모양인지 확인
  if (r.meta) {
    const base = key.replace(/_lod$/, ''), R = RIGS[base];
    if (!R?.species) registerRig(base, r.meta).shapeHash = r.shapeHash;
    else if (R.bones.map((b) => b[0]).join() !== r.meta.bones.map((b) => b[0]).join() || R.shapeHash !== r.shapeHash) {
      console.warn('주민 메시의 뼈대·모양이 서로 달라 쓰지 않음:', url);
      return;
    }
  }
  SKINS[key] = { ...r, byPalette: new Map() };
  // 화면 밖 캐릭터는 그리지 않도록(절두체 컬링) 경계 구를 애니메이션 여유만큼 키움
  const g = SKINS[key].geometry;
  g.computeBoundingSphere();
  g.boundingSphere.radius *= 1.45;
  // 주민 종: 팔레트가 하나뿐이라 색(가짜 AO 포함)을 받을 때 미리 만들고 슬롯 가중치는 버림 (원본 교체 프레임 부담·메모리 감소)
  const sp = r.meta && SPECIES[r.meta.species];
  if (sp) {
    if (yieldTo) await yieldTo();
    skinGeometry(key, sp.palette, true);
    SKINS[key].slotWeights = null;
  } else if (yieldTo) {
    // 나중에 온 네 발 원본: 이미 있는 KOAT 담당 팔레트 색을 한가할 때 하나씩 미리 만듦 → 바꾸는 프레임에는 만들 것 없음
    for (const [id, pal] of Object.entries(PALETTES)) if (id.startsWith('koat')) { await yieldTo(); skinGeometry(key, pal); }
  }
}

/** pal: 5슬롯 색, ao: 가짜 AO (주민 동물만) */
function skinGeometry(rig, pal, ao = false) {
  const S = SKINS[rig];
  const key = SLOTS.map((s) => pal[s]).join('|') + (ao ? '|ao' : ''); // 색이 같은 팔레트(안내데스크 = 기본 등)는 같은 지오메트리
  if (!S.byPalette.has(key) && !S.slotWeights) return S.byPalette.values().next().value; // 종 몸: 슬롯 가중치를 버린 뒤엔 만들어 둔 색 그대로
  if (!S.byPalette.has(key)) {
    // 위치·법선·뼈 가중치·인덱스는 원본 속성을 그대로 공유(GPU 버퍼도 한 벌), 색만 팔레트마다 따로
    // → 이 지오메트리는 여러 캐릭터가 함께 쓰므로 dispose() 하지 말 것
    const src = S.geometry, g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) if (name !== 'color') g.setAttribute(name, attr);
    g.setIndex(src.index);
    g.setAttribute('color', colorAttribute(S.slotWeights, pal, { normals: src.attributes.normal, ao, sharp: ao })); // 종만 가짜 AO·또렷한 경계 (유니콘은 그대로)
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

/**
 * 얼굴·옷 템플릿을 미리 만들어 둠 (닉네임을 고르는 동안, 한가할 때 하나씩) → 입장할 때 Game 생성자에서 만들지 않음.
 * 유니콘 두 리그(두 발·네 발) + 메시를 받은 주민 종. 이미 있으면 건너뜀
 */
export async function prebuildTemplates(yieldTo = null) {
  const jobs = [['biped', null], ['quad', null], ...Object.values(SPECIES).map((sp) => ['v_' + sp.id, sp])];
  for (const [rig, sp] of jobs) {
    if (TPLS[rig] || !(SKINS[rig] || SKINS[rig + '_lod']) || (sp && !RIGS[rig]?.meta)) continue;
    if (yieldTo) await yieldTo();
    if (!TPLS[rig]) TPLS[rig] = sp ? buildSpeciesTemplate(rig, sp) : buildTemplate(rig);
  }
}

// 그래픽 품질: 낮음이면 NPC·다른 접속자는 가까이서도 저해상도 몸으로, 실제 그림자는 내 캐릭터만 (Unico.setQuality)
let CHAR_Q = null;
/** 지금 품질 단계: setQuality 로 알려 준 값, 없으면 게임의 현재 품질 (자동으로 한 단계 내린 것 포함) */
const charQ = () => CHAR_Q ?? globalThis.game?.quality?.level ?? 'high';
// 프레임 번호: 내 캐릭터(labelAlways)가 매 프레임 한 번 올림 → 다른 캐릭터가 최근에 화면에 그려졌는지 판단
let TICK = 0;
/** 원본 몸으로 바꾼 마지막 프레임 (한 프레임에 하나만) */
let SWAP_TICK = -1;
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

// ------------------------------------------------------------------ 주민 동물 템플릿 (bin 에 구운 기준점으로 조립 — 런타임 SDF 계산 0, 한 번만 만들어 공유)
/** 옷·얼굴 부품 재질: 정점 색 + 정점마다 거칠기(rough 속성 — 천 0.85, 코·단추 0.38) → 재질 하나라 그리기 1번 */
function accMat() {
  if (MAT.acc) return MAT.acc;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  m.name = 'acc';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float rough;\nvarying float vRough;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRough = rough;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRough;').replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'acc-rough';
  return (MAT.acc = m);
}
const CLOTH = 0.85, HARD = 0.38; // 천, 단단한 것(코·단추·금속)

let MOMPPE = null;
/** 몸빼 무늬 한 칸의 실제 크기(m): 지오메트리 UV 를 미터/칸으로 → 엉덩이·바짓가랑이 어디서나 꽃 크기가 같음 */
const MOMPPE_TILE = 0.24;
/** 몸빼 꽃무늬 (64×64 한 장, 모든 곰 할머니가 함께 씀): 장미 분홍 바탕 + 진한 장미색 다섯 잎 꽃(큰 것·작은 것)·흰 꽃술·잎
 *  큰 꽃 지름 약 11cm → 9m 따라가기 카메라에서도 꽃 2~3송이가 읽힘 (예전 4cm 꽃은 1~2px 얼룩) */
function momppeMat() {
  if (MOMPPE) return MOMPPE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  try {
    g.fillStyle = '#e79aae'; g.fillRect(0, 0, 64, 64);
    const flower = (x, y, pr, pd, cr) => {
      g.fillStyle = '#c8506a';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TWO_PI - Math.PI / 2; g.beginPath(); g.arc(x + Math.cos(a) * pd, y + Math.sin(a) * pd, pr, 0, TWO_PI); g.fill(); }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, cr, 0, TWO_PI); g.fill();
    };
    g.fillStyle = '#6fae4a';
    for (const [x, y, r] of [[30, 34, 0.6], [12, 40, -0.5], [56, 58, 0.7]]) { g.beginPath(); g.ellipse(x, y, 6, 2.6, r, 0, TWO_PI); g.fill(); }
    flower(20, 22, 6.5, 7.5, 3.6);
    flower(48, 48, 4.4, 5, 2.4);
    g.fillStyle = '#f6c9d3';
    for (const [x, y] of [[48, 14], [8, 56], [34, 52], [58, 30]]) { g.beginPath(); g.arc(x, y, 1.8, 0, TWO_PI); g.fill(); }
  } catch { /* 캔버스 없음 (테스트) */ }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  MOMPPE = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  MOMPPE.name = 'momppe';
  return MOMPPE;
}

/**
 * [[geometry, 0xRRGGBB | 재질, 거칠기?]] → 인덱스를 지킨 채 한 지오메트리로 (재질별로 모아 그룹, 그룹마다 그리기 1번).
 * 위치 Float32(포인터 레이캐스트용), 법선 Int8, 색 Uint16·거칠기 Uint8 (정점 색 재질 acc 를 쓸 때만) — 예전 비인덱스 Float32 보다 메모리 약 1/4
 */
function bundleVC(parts) {
  if (!parts.length) return null;
  const mats = [];
  const items = parts.map(([g, c, rough]) => {
    const m = typeof c === 'number' ? accMat() : c;
    let mi = mats.indexOf(m);
    if (mi < 0) { mats.push(m); mi = mats.length - 1; }
    return { g, c, rough: rough ?? 0.6, mi };
  }).sort((a, b) => a.mi - b.mi); // 같은 재질은 선언 순서 그대로 (얼굴 입 범위가 이 순서에 기댐)
  const vc = mats.includes(accMat());
  let nv = 0, ni = 0;
  for (const { g } of items) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const col = vc ? new Uint16Array(nv * 3) : null, rgh = vc ? new Uint8Array(nv) : null;
  const geo = new THREE.BufferGeometry(), cc = new THREE.Color();
  let v0 = 0, i0 = 0, gStart = 0;
  items.forEach((it, k) => {
    const P = it.g.attributes.position, N = it.g.attributes.normal, n = P.count;
    for (let i = 0; i < n; i++) {
      const o = (v0 + i) * 3;
      pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
      nor[o] = Math.round(N.getX(i) * 127); nor[o + 1] = Math.round(N.getY(i) * 127); nor[o + 2] = Math.round(N.getZ(i) * 127);
    }
    if (vc) {
      cc.set(typeof it.c === 'number' ? it.c : 0xffffff);
      const r = Math.round(cc.r * 65535), gg = Math.round(cc.g * 65535), b = Math.round(cc.b * 65535), ro = Math.round(it.rough * 255);
      for (let i = 0; i < n; i++) { const o = (v0 + i) * 3; col[o] = r; col[o + 1] = gg; col[o + 2] = b; rgh[v0 + i] = ro; }
    }
    const I = it.g.index, m = I ? I.count : n;
    for (let i = 0; i < m; i++) idx[i0 + i] = (I ? I.getX(i) : i) + v0;
    v0 += n; i0 += m;
    if (k === items.length - 1 || items[k + 1].mi !== it.mi) { geo.addGroup(gStart, i0 - gStart, it.mi); gStart = i0; }
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  if (vc) { geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); geo.setAttribute('rough', new THREE.BufferAttribute(rgh, 1, true)); }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (mats.length === 1) geo.clearGroups();
  geo.computeBoundingSphere();
  return { geo, mats };
}
/** 가는 관 (주민 얼굴 선·옷 단): 점마다 2마디·단면 5각 — 1cm 안팎 굵기라 이 정도면 매끈 (예전 4마디·6각의 약 40%) */
const tube = (pts, r, closed = false, radial = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), Math.max(6, pts.length * 2), r, radial, closed);
/** 표면 법선 n 기준 접평면 축: r(오른쪽) u(위) */
function frame(n) {
  const nn = n.clone().normalize();
  let r = new THREE.Vector3().crossVectors(V(0, 1, 0), nn);
  if (r.lengthSq() < 1e-6) r = V(1, 0, 0);
  r.normalize();
  return { n: nn, r, u: new THREE.Vector3().crossVectors(nn, r) };
}
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const SIDE = [['L', -1], ['R', 1]];

/**
 * 납작한 천 띠 (스카프·허리 띠·머리띠·끈): 점 pts 를 잇고, 단면은 표면 법선(ns) 쪽으로 얇은(th) 둥근 사각, 표면을 따라 넓게(h).
 * 둥근 관(튜브)은 부풀린 고리처럼 보여서 이것을 씀. 열린 끈은 양 끝을 막음
 */
function bandGeo(pts, ns, h, th, closed = true, segs = 3, R = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const M = pts.length, N = closed ? M * segs : (M - 1) * segs + 1;
  const P = [], C = [];
  const t = V(0, 0, 0), nn = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
  const se = (x) => Math.sign(x) * Math.abs(x) ** 0.55; // 둥근 사각 (초타원)
  for (let i = 0; i < N; i++) {
    const u = closed ? i / N : i / (N - 1);
    curve.getPoint(u, c); curve.getTangent(u, t);
    const f = u * (closed ? M : M - 1), i0 = Math.min(M - 1, Math.floor(f)), i1 = closed ? (i0 + 1) % M : Math.min(M - 1, i0 + 1), k = f - Math.floor(f);
    nn.copy(ns[i0]).lerp(ns[i1], k);
    nn.addScaledVector(t, -nn.dot(t)).normalize();
    b.crossVectors(t, nn).normalize();
    C.push(c.clone());
    for (let j = 0; j < R; j++) {
      const a = (j / R) * TWO_PI, x = se(Math.cos(a)) * th * 0.5, y = se(Math.sin(a)) * h * 0.5;
      P.push(c.x + nn.x * x + b.x * y, c.y + nn.y * x + b.y * y, c.z + nn.z * x + b.z * y);
    }
  }
  const idx = [];
  const rings = closed ? N : N - 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < R; j++) {
    const a = i * R + j, b2 = ((i + 1) % N) * R + j, c2 = ((i + 1) % N) * R + ((j + 1) % R), d = i * R + ((j + 1) % R);
    idx.push(a, b2, c2, a, c2, d);
  }
  if (!closed) for (const [ri, cp] of [[0, C[0]], [N - 1, C[N - 1]]]) { // 끝 막기 (가운데 점 부채꼴)
    const ci = P.length / 3;
    P.push(cp.x, cp.y, cp.z);
    for (let j = 0; j < R; j++) { const a = ri * R + j, d = ri * R + ((j + 1) % R); if (ri === 0) idx.push(ci, d, a); else idx.push(ci, a, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 바깥을 보게 (첫 고리 법선이 띠 중심 쪽이면 뒤집음)
  const Nn = g.attributes.normal;
  let dot = 0;
  for (let j = 0; j < R; j++) dot += (P[j * 3] - C[0].x) * Nn.getX(j) + (P[j * 3 + 1] - C[0].y) * Nn.getY(j) + (P[j * 3 + 2] - C[0].z) * Nn.getZ(j);
  if (dot < 0) { for (let q = 0; q < idx.length; q += 3) { const s = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = s; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** 새싹 브로치 (KOAT 연결 고리): 점 p, 바깥 방향 n */
function brooch(p, n) {
  const f = frame(n), c = p.clone().addScaledVector(f.n, 0.012);
  return [
    [seg(c.clone().addScaledVector(f.u, -0.03), c.clone().addScaledVector(f.u, 0.01), 0.006, 6), 0x6dbb4f],
    [sph(0.026, { s: [1.5, 0.45, 0.6], q: outward(f.n), p: c.clone().addScaledVector(f.u, 0.018).addScaledVector(f.r, -0.024).toArray() }, 10), 0xa9d05f],
    [sph(0.022, { s: [1.5, 0.45, 0.6], q: outward(f.n), p: c.clone().addScaledVector(f.u, 0.02).addScaledVector(f.r, 0.02).toArray() }, 10), 0x6dbb4f],
  ];
}

/** 지오메트리 전체를 뼈 하나에 묶음 (몸빼 조각 합치기용: 속성 종류를 맞춤) */
function withSkin(g, bone) {
  const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  return g;
}

/**
 * 몸빼 바지 (스킨 지오메트리, 쉬는 자세 루트 좌표): 허리~엉덩이 고리(meta.rings.momppe, 몸통 뼈) +
 * 가랑이 덮개(몸통 뼈 — 두 바짓가랑이 사이 어두운 틈을 막음) + 다리마다 통 넓은 바짓가랑이(meta.limbs.leg 축, 고무줄 발목, 다리 뼈). 그리기 1번
 */
function momppeGeometry(R, M) {
  const names = R.bones.map((b) => b[0]), B = V(...R.bones[0][2]);
  const pos = [], uv = [], idx = [], si = [], sw = [];
  // UV 는 미터 / 무늬 칸 크기: u = 고리를 따라 간 거리, v = 높이 → 꽃이 늘어나지 않음
  const strip = (rings, bone) => {
    const N = rings[0].length, base = pos.length / 3;
    rings.forEach((l) => {
      let arc = 0;
      for (let i = 0; i <= N; i++) {
        const p = l[i % N];
        if (i) arc += p.distanceTo(l[i - 1]);
        pos.push(p.x, p.y, p.z);
        uv.push(arc / MOMPPE_TILE, p.y / MOMPPE_TILE);
        si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0);
      }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i, b = a + N + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  };
  // 엉덩이: 몸통 뼈 기준 고리 → 루트 좌표
  strip(M.rings.momppe.loops.map((l) => l.map((p) => V(p[0], p[1], p[2]).add(B))), names.indexOf('body'));
  // 바짓가랑이: 다리 축(오른쪽 기준, 왼쪽은 x 뒤집기)을 따라 [높이, 반지름] — 다리 둘레에 맞춰 날씬하게(두 다리가 한 풍선으로 붙지 않게),
  // 아래로 갈수록 좁아지고 발목 고무줄에서 안으로 말림
  const lg = M.limbs.leg, legR = R.bones.find((b) => b[0] === 'legR'), lw = V(...legR[2]).add(B);
  const a = V(...lg.a).add(lw), b = V(...lg.b).add(lw);
  // 구운 맞춤(fit): 높이·방향마다 몸 표면까지 거리 + 틈 → 몸이 바지를 뚫지 않으면서 다리 둘레에 붙음. 안쪽(다른 다리 쪽)은 기본 둘레로 자름
  const fit = lg.fit;
  const PROF = fit ? fit.ys.map((y) => [y, y > 0.3 ? 0.15 : y > 0.15 ? 0.142 : y > 0.11 ? 0.128 : y > 0.097 ? 0.118 : 0.104])
    : [[0.42, 0.15], [0.34, 0.155], [0.25, 0.152], [0.17, 0.142], [0.125, 0.132], [0.1, 0.12], [0.094, 0.104]];
  for (const sx of [-1, 1]) {
    const rings = PROF.map(([y, r0], j) => {
      const t = (a.y - y) / (a.y - b.y), cz = a.z + (b.z - a.z) * t, out = [];
      const ankle = j === PROF.length - 1, gap = y > 0.2 ? 0.02 : 0.014;
      for (let i = 0; i < 16; i++) {
        const th = (i / 16) * TWO_PI, inner = Math.sin(th) < -0.35; // 오른 다리 기준 방향 (왼 다리는 좌우 거울)
        let r = r0;
        if (fit && !ankle) {
          const d = fit.r[j][i] + gap;
          // 안쪽: 가랑이(y 0.2) 위에서는 가운데 선을 조금 넘어(x −0.025) 두 바짓가랑이가 겹침 (사이로 털이 검은 줄로 보이지 않게), 아래는 기본 둘레
          const mid = y >= 0.2 ? Math.min(d, (a.x + 0.025) / -Math.sin(th)) : r0;
          r = inner ? Math.max(r0, mid) : Math.max(r0, d);
        }
        out.push(V(sx * (a.x + Math.sin(th) * r), y, cz + Math.cos(th) * r));
      }
      if (sx < 0) out.reverse(); // 거울이면 감는 방향이 뒤집힘 → 되돌림 (면이 바깥을 보게)
      return out;
    });
    strip(rings, names.indexOf(sx < 0 ? 'legL' : 'legR'));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 바깥을 보게 (첫 삼각형 법선이 안쪽이면 모두 뒤집음)
  const nx = g.attributes.normal.getX(idx[0]), nz = g.attributes.normal.getZ(idx[0]), px = pos[idx[0] * 3], pz = pos[idx[0] * 3 + 2] - B.z;
  if (nx * px + nz * pz < 0) { for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; } g.setIndex(idx); g.computeVertexNormals(); }
  // 가랑이·엉덩이 덮개: 몸통 뼈의 납작한 공 (루트 (0, 0.3, -0.01), 반지름 0.17 × [1.3, 0.85, 1.6]) — 앞뒤로 길게 덮어 뒤에서 두 바짓가랑이 사이
  // 털(검은 세로 줄)이 보이지 않게, 옆으로는 좁게(바짓가랑이 바깥으로 불룩하게 나오지 않게)
  const crotch = withSkin(xf(new THREE.SphereGeometry(0.17, 18, 10), { s: [1.3, 0.85, 1.6], p: [0, 0.3, -0.01] }), names.indexOf('body'));
  const cu = crotch.attributes.uv, cp = crotch.attributes.position;
  for (let i = 0; i < cu.count; i++) cu.setXY(i, (cp.getX(i) + cp.getZ(i)) / MOMPPE_TILE, cp.getY(i) / MOMPPE_TILE);
  const all = mergeGeometries([g, crotch], false);
  all.computeBoundingSphere();
  all.boundingSphere.radius *= 1.45; // 걸을 때 바짓단이 기본 자세 구 밖으로 나가므로 몸과 같은 여유
  return all;
}

/**
 * 얼굴 한 메시: [닫힌 입][얼굴][벌린 입] 순서로 한 버퍼에 담고, 두 지오메트리가 같은 버퍼를 그릴 범위만 달리 씀
 * → 입을 열고 닫아도 그리기 1번 (메시의 geometry 만 바꿈). 벌린 입일 때는 닫힌 입 선이 안 보임
 */
function faceViews(closed, face, open) {
  const cnt = (ps) => ps.reduce((a, [g]) => a + (g.index ? g.index.count : g.attributes.position.count), 0);
  const b = bundleVC([...closed, ...face, ...open]);
  const nc = cnt(closed), nf = cnt(face), no = cnt(open);
  const shut = b.geo, wide = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(shut.attributes)) wide.setAttribute(k, a);
  wide.setIndex(shut.index);
  shut.setDrawRange(0, nc + nf);
  wide.setDrawRange(nc, nf + no);
  wide.boundingSphere = shut.boundingSphere.clone();
  return { geo: shut, open: wide, mats: b.mats };
}

function buildSpeciesTemplate(rig, sp) {
  const M = RIGS[rig].meta, A = M.anchors, L = M.lines, F = sp.face, pal = sp.palette;
  const v = (a) => V(a[0], a[1], a[2]);
  const at = (a, off = 0) => v(a.p).addScaledVector(v(a.n), off); // 앵커 + 법선 방향 off
  const T = {};
  const wear = Object.fromEntries(sp.wear.map((w) => { const [k, c] = w.split(':'); return [k, c ? parseInt(c, 16) : true]; }));

  // ---- 정적 얼굴: 코·볼·눈꺼풀·주름·눈썹·수염·앞니 + 입 (닫힌 선 / 벌린 입, 한 메시) ----
  const face = [];
  if (F.nose.kind === 'oval') {
    const nz = v(A.nose.n), c = at(A.nose, -0.008);
    face.push([sph(F.nose.r, { s: F.nose.s, q: outward(nz), p: c.toArray() }, 14), F.nose.color, HARD]);
    if (F.nose.shine) { const f = frame(nz); face.push([sph(F.nose.r * 0.22, { p: c.clone().addScaledVector(f.n, F.nose.r * F.nose.s[2] * 0.8).addScaledVector(f.r, -F.nose.r * 0.4).addScaledVector(f.u, F.nose.r * 0.25).toArray() }, 6), 0xffffff, HARD]); }
  } else if (F.nose.kind === 'tri') {
    // 작은 분홍 역삼각 (3분할 원뿔, 꼭짓점이 아래)
    face.push([cone(F.nose.r, 0.025, { s: [1, 1, 0.55], r: [Math.PI, 0, 0], p: at(A.nose, 0.004).toArray() }, 3), F.nose.color, 0.5]);
  }
  for (const pl of L.Y || []) face.push([tube(pl.map(v), F.mouth.r), F.mouth.color]);
  if (F.cheek) for (const [s] of SIDE) { const a = A['cheek' + s]; if (a) face.push([sph(F.cheek.r, { s: [1, 0.72, 0.28], q: outward(v(a.n)), p: at(a, -0.01).toArray() }, 12), mixHex(F.cheek.color, pal[SLOTS[a.s]], 1 - F.cheek.a), 0.8]); }
  if (F.lids) for (const pl of L.lids || []) face.push([tube(pl.map(v), F.lids.r), F.lids.color]);
  if (F.crinkle) for (const pl of L.crinkle || []) face.push([tube(pl.map(v), F.crinkle.r), F.crinkle.color]);
  if (F.brows?.kind === 'flat') for (const [s] of SIDE) { const a = A['brow' + s]; face.push([sph(1, { s: [F.brows.r, 0.015, 0.012], q: outward(v(a.n)), p: at(a, 0.002).toArray() }, 10), F.brows.color, 0.8]); }
  if (F.whiskers) for (const [s, sx] of SIDE) {
    const list = A['whisker' + s] || [];
    list.forEach((w, k) => {
      const p0 = v(w.p);
      if (F.whiskers.kind === 'dot') { face.push([sph(F.whiskers.r, { p: p0.toArray() }, 6), F.whiskers.color]); return; }
      const dy = list.length > 2 ? [0.2, 0, -0.2][k] : [0.13, -0.13][k];
      const dir = V(sx, dy, 0.22).normalize();
      const p1 = p0.clone().addScaledVector(dir, F.whiskers.len * 0.5).add(V(0, -0.006, 0)), p2 = p0.clone().addScaledVector(dir, F.whiskers.len).add(V(0, -0.01, 0));
      face.push([tube([p0.clone().addScaledVector(v(w.n), -0.004), p1, p2], F.whiskers.r, false, 4), F.whiskers.color]);
    });
  }
  if (F.teeth && A.teeth) {
    // 앞니 두 개: 입선 아래로 내려 바깥으로 살짝 띄우고, 뒤에 입선 색 판을 대어 흰 주둥이 위에서도 테두리가 보이게 (초상화처럼)
    const f = frame(v(A.teeth.n)), c = at(A.teeth, 0.005).addScaledVector(f.u, -0.012);
    face.push([xf(new THREE.BoxGeometry(0.07, 0.051, 0.008), { q: outward(f.n), p: c.clone().addScaledVector(f.n, -0.004).addScaledVector(f.u, 0.001).toArray() }), F.mouth.color, 0.6]);
    for (const dx of [-0.016, 0.016]) face.push([xf(new THREE.BoxGeometry(0.03, 0.045, 0.012), { q: outward(f.n), p: c.clone().addScaledVector(f.r, dx).toArray() }), F.teeth, 0.4]);
  }
  // 입: 닫힌 선 / 벌린 입(어두운 반원 + 혀). 곰은 작고 따뜻한 갈색 입 + 분홍 혀 (립스틱·콧수염처럼 안 보이게)
  const closed = L.mouth.map((pl) => [tube(pl.map(v), F.mouth.r), F.mouth.color]);
  const mc = A.mouthC, mf = frame(v(mc.n)), MO = F.mouth.open || {}, mw = MO.r ?? 0.042;
  const open = [[sph(mw, { s: [1, 0.72, 0.3], q: outward(mf.n), p: at(mc, 0.002).addScaledVector(mf.u, -0.01).toArray() }, 12), MO.color ?? 0x5a2a2a, 0.5]];
  const tongue = MO.tongue ?? F.mouth.tongue;
  if (tongue) open.push([sph(mw * 0.62, { s: [1, 0.6, 0.35], q: outward(mf.n), p: at(mc, 0.008).addScaledVector(mf.u, -0.026).toArray() }, 10), tongue, 0.45]);
  T.face = faceViews(closed, face, open);

  // ---- 눈 (깜빡임: 눈 높이에서 접히도록 지오메트리를 눈 높이만큼 내림) ----
  const eyes = [], happy = [];
  const eyeY = (A.eyeL.p[1] + A.eyeR.p[1]) / 2;
  for (const [s, sx] of SIDE) {
    const a = A['eye' + s], n = v(a.n), f = frame(n), E = F.eye, r = E.r;
    const c = at(a, -0.016);
    const q = new THREE.Quaternion().setFromAxisAngle(f.n, sx * (E.tilt || 0)).multiply(outward(n));
    eyes.push([sph(r, { s: E.s, q, p: c.toArray() }, 14), C.eye()]);
    let front = r * E.s[2]; // 눈 묶음의 맨 앞 (반짝임을 이 앞에)
    if (F.iris) {
      // 고양이: 호박색 홍채를 눈 앞면보다 0.004 앞으로 (검은 눈은 가는 테두리만), 그 앞에 세로 동공
      const ir = F.irisR, iz = ir * F.irisZ, at0 = front - iz + 0.004;
      eyes.push([sph(ir, { s: [0.95, 1.05, F.irisZ], q, p: c.clone().addScaledVector(f.n, at0).toArray() }, 16), C.iris()]);
      const P2 = F.pupil, pz = P2.r * P2.s[2], ap = at0 + iz + 0.004 - pz;
      eyes.push([sph(P2.r, { s: P2.s, q, p: c.clone().addScaledVector(f.n, ap).toArray() }, 12), C.eye()]);
      front = ap + pz;
    }
    if (F.ring) eyes.push([sph(r * 1.21, { s: [1, 1, 0.25], q: outward(n), p: c.clone().addScaledVector(f.n, -0.004).toArray() }, 14), C.ring()]);
    const fr = c.clone().addScaledVector(f.n, F.iris ? front + 0.002 : r * E.s[2] * 0.9), k = r / 0.075;
    eyes.push([sph(E.shine[0], { p: fr.clone().addScaledVector(f.r, (sx * -0.012 + 0.018) * k).addScaledVector(f.u, 0.032 * k).toArray() }, 6), C.shine()]);
    eyes.push([sph(E.shine[1], { p: fr.clone().addScaledVector(f.r, (sx * 0.018 - 0.009) * k).addScaledVector(f.u, -0.03 * k).toArray() }, 6), C.shine()]);
    if (E.hl3) eyes.push([sph(E.shine[1] * 0.75, { p: fr.clone().addScaledVector(f.r, -0.024 * k).addScaledVector(f.u, 0.004 * k).toArray() }, 6), C.shine()]);
    // 행복 눈 (^^): 눈 자리에 위로 굽은 호
    const arc = [];
    for (let i = 0; i <= 6; i++) { const t = i / 3 - 1; arc.push(c.clone().addScaledVector(f.r, t * r * 0.95).addScaledVector(f.u, r * 0.55 * (1 - t * t) - r * 0.2).addScaledVector(f.n, r * E.s[2] * 0.6)); }
    happy.push([tube(arc, Math.max(0.009, r * 0.16)), F.happy]);
  }
  T.eyes = bundleVC(eyes);
  T.eyes.geo.translate(0, -eyeY, 0);
  T.eyeY = eyeY;
  T.happy = bundleVC(happy);

  // ---- 토끼 코 (씰룩: 코 자리를 중심으로 크기만 바뀜) ----
  if (F.nose.kind === 'Y') {
    T.nose = bundleVC([[sph(F.nose.r, { s: F.nose.s, q: outward(v(A.nose.n)) }, 10), F.nose.color, 0.5]]);
    T.noseAt = at(A.nose, -0.004);
  }
  // ---- 움직이는 눈썹 점 (강아지) ----
  if (F.brows?.kind === 'dot') T.brows = bundleVC(SIDE.map(([s]) => [sph(F.brows.r, { s: [1, 0.8, 0.5], q: outward(v(A['brow' + s].n)), p: at(A['brow' + s], 0).toArray() }, 8), F.brows.color, 0.8]));

  // ---- 머리 옷 (머리 뼈, 늘 보임 — 모자는 실루엣) ----
  const hw = [];
  const hr = M.head.r;
  const ringPN = (k) => { const r = M.rings[k]; return r ? [r.pts.map(v), (r.ns || r.pts.map(() => [0, 1, 0])).map(v)] : null; };
  if (wear.headband && M.rings.headband) {
    const [pts, ns] = ringPN('headband');
    hw.push([bandGeo(pts, ns, 0.055, 0.02, true), wear.headband, CLOTH]);
    // 매듭: +x 쪽 관자놀이(정면에서 보면 화면 오른쪽 — 초상화와 같은 쪽, 고리 점 3) + 짧은 끈 두 가닥이 아래·뒤로
    const kp = pts[3].clone(), kn = ns[3].clone(), f = frame(kn);
    for (const s of [-1, 1]) hw.push([sph(0.045, { s: [1.3, 0.75, 0.5], q: outward(kn), p: kp.clone().addScaledVector(f.u, s * 0.035).addScaledVector(kn, 0.018).toArray() }, 10), wear.headband, CLOTH]);
    hw.push([sph(0.025, { q: outward(kn), p: kp.clone().addScaledVector(kn, 0.024).toArray() }, 8), mixHex(wear.headband, 0x000000, 0.12), CLOTH]);
    for (const [sw, dz] of [[-0.25, -0.35], [0.2, -0.65]]) {
      const dir = V(0.25 - sw, -1, dz).normalize();
      hw.push([cone(0.03, 0.09, { s: [1, 1, 0.4], q: new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir), p: kp.clone().addScaledVector(kn, 0.014).addScaledVector(dir, 0.05).toArray() }, 3), wear.headband, CLOTH]);
    }
  }
  if (wear.goggles) {
    const a = A.forehead, n = v(a.n), f = frame(n), c0 = at(a, 0.025);
    for (const sx of [-1, 1]) {
      const p = c0.clone().addScaledVector(f.r, sx * 0.095);
      hw.push([torus(0.085, 0.018, { q: outward(n), p: p.toArray() }, TWO_PI, 18, 6), 0x3a3f45, HARD]);
      hw.push([xf(new THREE.CircleGeometry(0.08, 16), { q: outward(n), p: p.clone().addScaledVector(n, 0.004).toArray() }), C.lensV()]);
    }
    hw.push([seg(c0.clone().addScaledVector(f.r, -0.012), c0.clone().addScaledVector(f.r, 0.012), 0.012, 6), 0x3a3f45, HARD]);
    // 보라 끈: 이마 → 귀 위 → 뒤통수 (구운 고리: 기울어진 평면에서 두개골 표면을 따라감 — 떠 보이지 않게)
    const gr = ringPN('goggle');
    if (gr) hw.push([bandGeo(gr[0], gr[1], 0.034, 0.012, true, 2), wear.goggles, CLOTH]);
  }
  if (wear.kerchief) {
    // 머릿수건 (얇은 천): 정수리~뒤통수만 덮는 낮은 덮개(위 0.4π) — 앞 단은 이마 위라 눈썹과 단 사이로 털이 보임.
    // 귀 자리는 천을 머리 속으로 눌러 구멍 (귀가 천을 뚫고 다 보이게), 뒤로 목덜미까지 늘어진 삼각 자락 + 오른쪽 뒤 매듭
    const KR = [hr[0] + 0.015, hr[1] + 0.015, hr[2] + 0.015], KC = V(0, 0.06, -0.04), kq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0));
    const TH = 0.4 * Math.PI;
    const onDome = (th, ph, off = 0) => { // th: 꼭대기에서 내려온 각, ph: 방위(0 = 정면, + = 캐릭터 오른쪽 +x)
      const d = V(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
      const p = V(d.x * KR[0], d.y * KR[1], d.z * KR[2]), n = V(d.x / KR[0], d.y / KR[1], d.z / KR[2]).normalize();
      p.addScaledVector(n, off).applyQuaternion(kq).add(KC); n.applyQuaternion(kq);
      return { p, n };
    };
    const dome = xf(new THREE.SphereGeometry(1, 30, 12, 0, TWO_PI, 0, TH), { s: KR, q: kq, p: KC.toArray() });
    // 귀 구멍: 귀 뼈(귀 판 가운데) 0.14m 안의 천을 바깥 법선 반대로 최대 6cm 눌러 넣음 (가장자리는 부드럽게)
    const ears = M.bones.filter((b) => b[0] === 'earL' || b[0] === 'earR').map((b) => V(...b[2]));
    const P = dome.attributes.position, Nn = dome.attributes.normal, pv = V(0, 0, 0), nv = V(0, 0, 0);
    const holed = (p) => Math.max(0, ...ears.map((e) => 1 - THREE.MathUtils.smoothstep(p.distanceTo(e), 0.09, 0.15)));
    for (let i = 0; i < P.count; i++) {
      pv.fromBufferAttribute(P, i); nv.fromBufferAttribute(Nn, i);
      const k = holed(pv);
      if (k > 0) { pv.addScaledVector(nv, -0.06 * k); P.setXYZ(i, pv.x, pv.y, pv.z); }
    }
    dome.computeVertexNormals();
    hw.push([dome, wear.kerchief, CLOTH]);
    // 단: 천 색 그대로 가는 말림 (굵은 테는 딱딱한 모자처럼 보여서 뺌) — 귀 구멍 자리는 건너뜀
    const hemC = mixHex(wear.kerchief, 0x8a6a40, 0.12);
    let run = [];
    const flush = () => { if (run.length > 2) hw.push([tube(run, 0.008), hemC, CLOTH]); run = []; };
    for (let i = 0; i <= 28; i++) { const d = onDome(TH, (i / 28) * TWO_PI, 0.002); if (holed(d.p) > 0.05) flush(); else run.push(d.p); }
    flush();
    // 잔꽃 무늬: 작고 연한 점 (버섯 갓처럼 보이지 않게), 귀 구멍 근처는 빼고
    const dot = mixHex(sp.kerchiefDot ?? 0xe86a7a, wear.kerchief, 0.3);
    for (const [th, n0, cnt] of [[0.12, 0, 3], [0.23, 0.3, 6], [0.33, 0, 9]]) for (let i = 0; i < cnt; i++) {
      const d = onDome(th * Math.PI, n0 + (i / cnt) * TWO_PI, 0.002);
      if (holed(d.p) > 0) continue;
      hw.push([sph(0.016, { s: [1, 1, 0.25], q: outward(d.n), p: d.p.toArray() }, 6), dot, CLOTH]);
    }
    // 뒤 자락: 뒤 단에서 목덜미까지 늘어진 납작한 삼각 (r 0.12, 길이 0.18)
    const bk = onDome(TH, Math.PI, -0.004), down = V(0, -1, -0.32).normalize();
    hw.push([cone(0.12, 0.18, { s: [1, 1, 0.22], q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), down), p: bk.p.clone().addScaledVector(down, 0.075).addScaledVector(bk.n, 0.006).toArray() }, 3), wear.kerchief, CLOTH]);
    // 매듭: 오른쪽 뒤 단 (귀 뒤 — 옆·¾ 에서 보임) + 짧은 두 가닥
    const kd = onDome(TH, 2.05, 0.006), kp = kd.p, kn = kd.n, f = frame(kn);
    for (const s2 of [-1, 1]) hw.push([sph(0.05, { s: [1.25, 0.8, 0.5], q: outward(kn), p: kp.clone().addScaledVector(f.r, s2 * 0.042).addScaledVector(kn, 0.012).toArray() }, 10), wear.kerchief, CLOTH]);
    hw.push([sph(0.026, { q: outward(kn), p: kp.clone().addScaledVector(kn, 0.02).toArray() }, 8), hemC, CLOTH]);
    for (const s2 of [-1, 1]) {
      const dir = V(0, -1, 0).addScaledVector(f.r, s2 * 0.45).normalize();
      hw.push([cone(0.035, 0.09, { s: [1, 1, 0.35], q: new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir), p: kp.clone().addScaledVector(kn, 0.012).addScaledVector(dir, 0.06).toArray() }, 3), wear.kerchief, CLOTH]);
    }
  }
  if (wear.glasses) {
    const P2 = SIDE.map(([s, sx]) => { const a = A['eye' + s], n = v(a.n); return { sx, n, f: frame(n), p: v(a.p).addScaledVector(n, 0.035) }; });
    for (const g of P2) {
      hw.push([torus(0.085, 0.011, { q: outward(g.n), p: g.p.toArray() }, TWO_PI, 20, 6), wear.glasses, HARD]);
      const rim = g.p.clone().addScaledVector(g.f.r, g.sx * 0.085);
      // 안경다리: 머리 타원 옆면에 붙어 귀 쪽으로 (밖으로 떠 보이지 않게)
      const side = (y, z) => { const c = M.head.c, k = 1 - ((y - c[1]) / hr[1]) ** 2 - ((z - c[2]) / hr[2]) ** 2; return V(g.sx * (c[0] + hr[0] * Math.sqrt(Math.max(0, k)) + 0.012), y, z); };
      hw.push([tube([rim, side(g.p.y + 0.02, g.p.z - 0.1), side(g.p.y + 0.025, -0.06)], 0.008), wear.glasses, HARD]);
    }
    hw.push([seg(P2[0].p.clone().addScaledVector(P2[0].f.r, 0.085), P2[1].p.clone().addScaledVector(P2[1].f.r, -0.085), 0.009, 6), wear.glasses, HARD]);
  }
  if (wear.strawhat) {
    // 챙은 귀보다 작게(0.40)·크라운은 더 뒤로(z −0.14)·더 젖혀(−0.5) → 챙이 뾰족 귀 뒤의 후광처럼 (귀와 섞여 가시 왕관처럼 안 보이게)
    const base = v(A.crown.p).add(V(0, -0.03, -0.14));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
    const place = (g) => { g.applyQuaternion(q); g.translate(base.x, base.y, base.z); return g; };
    hw.push([place(cyl(0.4, 0.4, 0.03, {}, 36)), 0xe8c872, CLOTH]);
    hw.push([place(cyl(0.22, 0.245, 0.18, { p: [0, 0.09, 0] }, 30)), 0xe8c872, CLOTH]);
    hw.push([place(torus(0.247, 0.024, { r: [Math.PI / 2, 0, 0], p: [0, 0.035, 0] }, TWO_PI, 30, 6)), wear.strawhat, CLOTH]);
  }
  T.headWear = bundleVC(hw);

  // ---- 몸 옷 (몸통 뼈): 스카프·전대·주머니·멜빵·몸빼 허리·브로치 ----
  const bw = [];
  let broochAt = A.chest ? [v(A.chest.p), v(A.chest.n)] : null;
  if (wear.scarf && M.rings.neck) {
    const [pts, ns] = ringPN('neck');
    bw.push([bandGeo(pts, ns, 0.055, 0.022, true), wear.scarf, CLOTH]);
    // 매듭 삼각 두 장 (큰 것 + 0.4rad 돌린 작은 것): 턱받이 위쪽에 겹쳐 묶은 손수건처럼
    const fr = pts[0], n = V(fr.x, 0, fr.z).normalize();
    const kp = fr.clone().addScaledVector(n, 0.03).add(V(0.05, -0.14, 0));
    bw.push([cone(0.13, 0.22, { s: [1, 1, 0.45], r: [Math.PI + 0.2, 0, 0.15], p: kp.toArray() }, 3), wear.scarf, CLOTH]);
    bw.push([cone(0.09, 0.16, { s: [1, 1, 0.4], r: [Math.PI + 0.12, 0, 0.55], p: kp.clone().add(V(0.06, 0.02, -0.012)).toArray() }, 3), mixHex(wear.scarf, 0x000000, 0.12), CLOTH]);
    broochAt = [fr.clone().addScaledVector(n, 0.04).add(V(0.03, -0.05, 0)), n];
  }
  if (wear.belt && M.rings.waist) {
    const [pts, ns] = ringPN('waist');
    bw.push([bandGeo(pts, ns, 0.06, 0.018, true), wear.belt, CLOTH]);
    if (wear.pouch) {
      // 동전 주머니: 끈을 졸라맨 둥근 복주머니 + 금 똑딱이 (정면 오른쪽)
      const p = pts[1].clone().lerp(pts[2], 0.15), n = ns[1].clone().lerp(ns[2], 0.15).setY(0).normalize();
      const c = p.clone().addScaledVector(n, 0.05).add(V(0, -0.055, 0));
      bw.push([sph(0.06, { s: [1, 0.9, 0.7], q: outward(n), p: c.toArray() }, 14), wear.pouch, CLOTH]);
      bw.push([torus(0.03, 0.008, { r: [Math.PI / 2, 0, 0], p: c.clone().add(V(0, 0.05, 0)).toArray() }, TWO_PI, 12, 5), mixHex(wear.pouch, 0x000000, 0.25), CLOTH]);
      bw.push([sph(0.015, { p: c.clone().addScaledVector(n, 0.042).toArray() }, 8), 0xfac03e, HARD]);
    }
  }
  if (wear.momppe && M.rings.momppe) {
    // 몸빼: 허리 고무줄(몸통 뼈, 몸에 붙게) + 꽃무늬 바지 한 벌(스킨 메시 — 엉덩이·가랑이는 몸통, 바짓가랑이는 다리 뼈를 따라 걸음)
    bw.push([tube(M.rings.momppe.loops[0].map(v), 0.02, true), 0xad7483, CLOTH]); // 고무줄 허리: 바탕 장미색을 25% 어둡게
    T.momppe = momppeGeometry(RIGS[rig], M);
  }
  if (wear.overalls && M.patches.bib) {
    const { nx, ny, pts } = M.patches.bib, g = new THREE.BufferGeometry(), idx = [];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx); }
    g.setIndex(idx); g.computeVertexNormals();
    bw.push([g, wear.overalls, CLOTH]);
    // 앞판 가장자리 단 (조금 진한 분홍) — 평평한 판이 아니라 천으로 보이게
    const edge = [];
    for (let i = 0; i < nx; i++) edge.push(pts[i]);
    for (let j = 1; j < ny; j++) edge.push(pts[j * nx + nx - 1]);
    for (let i = nx - 2; i >= 0; i--) edge.push(pts[(ny - 1) * nx + i]);
    for (let j = ny - 2; j >= 1; j--) edge.push(pts[j * nx]);
    bw.push([tube(edge.map(v), 0.012, true), sp.overallsHem ?? mixHex(wear.overalls, 0x000000, 0.08), CLOTH]);
    // 끈: 납작한 띠 (등에서 엇갈림)
    for (const s of ['L', 'R']) {
      const sp2 = M.paths['strap' + s].map(v), sn = (M.paths['strap' + s + 'N'] || M.paths['strap' + s].map((p) => [p[0], 0, p[2]])).map(v);
      bw.push([bandGeo(sp2, sn, 0.04, 0.012, false, 4, 6), wear.overalls, CLOTH]);
    }
    for (const i of [0, nx - 1]) { const p = v(pts[(ny - 1) * nx + i]), n = V(p.x, 0, p.z).normalize(); bw.push([sph(0.022, { s: [1, 1, 0.5], q: outward(n), p: p.clone().addScaledVector(n, 0.016).add(V(0, -0.025, 0)).toArray() }, 10), 0xfac03e, HARD]); }
    const top = v(pts[(ny - 1) * nx + (nx >> 1)]);
    broochAt = [top.clone().add(V(0, -0.06, 0)), V(top.x, 0, top.z).normalize()];
  }
  if (wear.brooch && broochAt) bw.push(...brooch(...broochAt));
  T.body = bundleVC(bw);

  // ---- 리본 (토끼, 왼쪽 귀 뼈) ----
  if (wear.bow && A.bowL) {
    const n = v(A.bowL.n), f = frame(n), c = at(A.bowL, 0.02);
    T.bow = bundleVC([
      [sph(0.07, { s: [1.3, 0.8, 0.5], q: outward(n), p: c.clone().addScaledVector(f.r, -0.075).toArray() }, 12), wear.bow, CLOTH],
      [sph(0.07, { s: [1.3, 0.8, 0.5], q: outward(n), p: c.clone().addScaledVector(f.r, 0.075).toArray() }, 12), wear.bow, CLOTH],
      [sph(0.035, { q: outward(n), p: c.clone().addScaledVector(n, 0.01).toArray() }, 10), mixHex(wear.bow, 0xffffff, 0.25), CLOTH],
    ]);
  }
  return T;
}

// 종별 걸음 (§4): 배율·더하기. 유니콘은 NO_GAIT (곱하기 1 → 예전과 같은 값)
const NO_GAIT = { amp: 1, bob: 1, roll: 1 };
const GAITS = {
  sashay: { ...NO_GAIT, roll: 1.3, headPitch: -0.05, look: 1.3 }, // 여우: 엉덩이 흔들며 턱 들고
  shuffle: { ...NO_GAIT, amp: 0.8, cadMax: 3.0, waddle: 0.03 }, // 너구리: 종종 뒤뚱
  trot: { ...NO_GAIT, bob: 1.4, nod: 0.04 }, // 강아지: 통통 + 머리 까딱
  waddle: { ...NO_GAIT, cadMax: 1.8, roll: 1.6, bob: 1.2, breathA: 1.5, breathF: 0.6 }, // 곰: 느릿느릿 뒤뚱
  tiptoe: { ...NO_GAIT, bob: 0.6, amp: 0.9, steady: 0.8 }, // 고양이: 사뿐사뿐
  hop: { ...NO_GAIT, hop: true, cadMin: 2.0, cadMax: 2.8 }, // 토끼: 두 발 모아 깡충
};
/** 행복 ^^ 눈이 되는 동작, 입을 벌리는 동작, 강아지가 반가워 꼬리를 세게 흔드는 동작 */
const HAPPY = new Set(['cheer', 'heart', 'rub', 'groom', 'backpat', 'wag']);
const OPEN_MOUTH = new Set(['cheer', 'heart', 'wag']);
const WAG_GLAD = new Set(['talk', 'heart', 'cheer', 'wave']);

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
  } else if (kind === 'megaphone') { // 확성기 (안내 강아지): 금색 나팔 + 빨강 손잡이
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.18, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xfac03e, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide }));
    horn.rotation.x = Math.PI / 2; horn.position.set(0, -0.05, 0.12);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xe35d5d, roughness: 0.6 }));
    grip.position.set(0, -0.06, 0.02);
    g.add(horn, grip);
  } else if (kind === 'tablet') { // 태블릿 (연구원 너구리): 파란 몸체 + 빛나는 화면
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.014), new THREE.MeshStandardMaterial({ color: 0x4a90d9, roughness: 0.4 }));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.004), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0xbfe8ff, emissiveIntensity: 0.4, roughness: 0.2 }));
    screen.position.z = 0.009;
    const t = new THREE.Group();
    t.add(body, screen);
    t.rotation.x = -1.1; t.position.set(-0.08, -0.07, 0.1);
    g.add(t);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const EMOTE_ICON = { startle: '❗', cheer: '🎉', heart: '❤️', wave: '👋', think: '❓', water: '💧', tablet: '📱', present: '📊', megaphone: '📣', lab: '🧪' };

export class Unico {
  /** 그래픽 품질 단계 알려 주기 ('low' | 'medium' | 'high') — 낮음이면 NPC·다른 접속자를 가볍게 그림. 비우면 게임 품질을 따라감 */
  static setQuality(level) { CHAR_Q = level || null; }

  /**
   * @param assets (사용 안 함, 호환용)
   * @param opts.name 이름표, opts.outfit { hat: 'straw'|'helmet'|null, goggles, scarf: 'red'|'green'|'blue'|null, sprout }
   */
  constructor(assets, { name = '', labelColor = '#fff', labelBg, outfit = {}, palette = 'official', rig = 'quad', species = null } = {}) {
    // 주민 동물 종 (species.js): 메시를 하나도 못 받았으면 예전 유니콘 주민으로 대체 — 게임은 멈추지 않음
    let sp = species ? SPECIES[species] || null : null;
    if (sp && !SKINS['v_' + sp.id] && !SKINS['v_' + sp.id + '_lod']) { console.warn('주민 종 메시가 없어 유니콘으로 대체:', species); sp = null; }
    if (sp) rig = 'v_' + sp.id;
    if (!SKINS[rig] && !SKINS[rig + '_lod']) throw new Error('loadUnicoMesh() 를 먼저 호출하세요');
    this.species = sp;
    if (!TPLS[rig]) TPLS[rig] = sp ? buildSpeciesTemplate(rig, sp) : buildTemplate(rig);
    const TPL = TPLS[rig];
    this.rig = rig;
    this.biped = rig === 'biped' || !!sp;
    const R = RIGS[rig];
    this.bodyY = R.bones[0][2][1];
    this.legLen = R.legLen; // 루트(스케일 전) 기준. 땅 위 보폭은 × scale
    this.scale = sp ? sp.scale : 1;
    this._gait = (sp && GAITS[sp.motion.gait]) || NO_GAIT;
    this.group = new THREE.Group();
    this.position = this.group.position;
    this.root = new THREE.Group(); // 회전(진행 방향)
    if (sp) this.root.scale.setScalar(this.scale); // 이름표는 group 에 있어 글자 크기 그대로
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
    // 귀 사슬 (주민 동물): [왼쪽 [아래, 위?], 오른쪽 [...]] — 토끼만 두 마디
    this.earChain = sp ? [[boneMap.earL, boneMap.earL2].filter(Boolean), [boneMap.earR, boneMap.earR2].filter(Boolean)] : null;
    this.legs = this.biped ? [boneMap.legL, boneMap.legR] : [boneMap.legFL, boneMap.legFR, boneMap.legBL, boneMap.legBR];
    this.arms = this.biped ? [boneMap.armL, boneMap.armR] : [];
    this.boneMap = boneMap;
    this.costumeMeshes = {}; // 코스튬 id → 부위별 메시 (처음 입을 때 만듦)
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(R.bones.map((b) => boneMap[b[0]]));
    // 몸 색: 종 팔레트(+가짜 AO) 또는 유니콘 팔레트. 원본이 아직 없으면 저해상도로 시작해 나중에 지오메트리만 올림 (생성은 늘 동기·늘 보임)
    this._pal = sp ? sp.palette : PALETTES[palette] || OFFICIAL;
    this._ao = !!sp;
    this._wantFull = !SKINS[rig];
    this._waitT = 0;
    this.skin = new THREE.SkinnedMesh(skinGeometry(SKINS[rig] ? rig : rig + '_lod', this._pal, this._ao), SKIN_MAT);
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
      this.skinLod = new THREE.SkinnedMesh(skinGeometry(rig + '_lod', this._pal, this._ao), SKIN_MAT);
      this.skinLod.castShadow = false;
      this.skinLod.receiveShadow = false;
      this.skinLod.visible = false;
      this.root.add(this.skinLod);
      this.skinLod.bind(this.skeleton);
      presetBounds(this.skinLod);
      this.skinLod.onBeforeRender = seen;
    }
    this.bodyMesh = new THREE.Object3D(); // (호환) 숨쉬기는 몸통 뼈 미세 이동으로 대체
    this.acc = {};
    if (sp) this._buildSpeciesParts(TPL, boneMap); // 주민 동물: 얼굴·종별 옷 (유니콘 소품·코스튬 없음)
    else {
      // 얼굴 부품 (머리 뼈에 붙음)
      this.headG.add(meshOf(TPL.head));
      this.eyesG = meshOf(TPL.eyes);
      this.headG.add(this.eyesG);
      // 소품
      const addAcc = (key, parent) => { const m = meshOf(TPL[key]); m.visible = false; parent.add(m); this.acc[key] = m; };
      // 머리 소품은 머리 크기에 맞춰 축소
      this.headAcc = new THREE.Group();
      this.headAcc.scale.setScalar(R.headR / 0.42);
      this.headG.add(this.headAcc);
      for (const k of ['sprout', 'strawHat', 'helmet', 'goggles']) addAcc(k, this.headAcc);
      for (const k of ['scarfRed', 'scarfGreen', 'scarfBlue']) addAcc(k, this.bodyG);
    }
    this.setOutfit({ sprout: true, ...outfit });
    // 바닥 그림자 (부드러운 접지감)
    const sh = new THREE.Mesh(BLOB_GEO, new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x231916, transparent: true, opacity: 0.42, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.95, 1.45, 1);
    sh.position.y = 0.018;
    if (sp) sh.position.z = sp.shadow[2];
    sh.renderOrder = 2;
    this.shadow = sh;
    this.root.add(sh);
    // 발굽 접지 그림자 (발이 땅에 닿아 있는 느낌)
    this.footShadows = this.legs.map((leg) => {
      const lw = this.root.worldToLocal(leg.getWorldPosition(new THREE.Vector3())); // 루트(배율 적용) 좌표로 되돌림
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
    // 바깥(NPCs)에서 씀: 플레이어를 보는 정도(0..1)·우정 하트·행복 표정 끝 시각, 플레이어 쪽 상대 각도
    this.attention = 0;
    this.hearts = 0;
    this.happyUntil = 0;
    this.attnYaw = 0;
    this._speakUntil = 0;
    // 이름표·감정 아이콘·말풍선 높이: 종은 굽힌 키로, 유니콘은 예전 값
    const LH = sp ? labelHeights(sp, R.meta.top) : this.biped ? { label: 2.3, emote: 2.6, bubble: 3.0 } : { label: 2.55, emote: 2.6, bubble: 3.0 };
    this.labelY = LH.label; this.emoteY = LH.emote; this.bubbleY = LH.bubble;
    if (!sp) applyPalette(this.root, palette);
    this.palette = palette;
    if (name) this.setName(name, labelColor, labelBg);
  }

  setOutfit(o) {
    this.outfit = { ...(this.outfit || {}), ...o };
    if (this.species) return; // 주민 동물은 종마다 정해진 옷 (코스튬·유니콘 소품 없음)
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
    this.label.position.y = this.labelY;
    this.group.add(this.label);
  }

  say(text, seconds = 4) {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.userData.dispose(); }
    this.bubble = makeLabel(text, { color: '#231916', bg: 'rgba(255,255,255,0.92)', size: 36 });
    this.bubble.position.y = this.bubbleY;
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
    if (name === 'talk' && seconds > 0) this.speak(seconds); // 대화창 말하기 (입 움직임)
    const puff = this.species?.motion.tail.puff;
    if (puff && name === 'startle') this._puff(puff[0], puff[1]);
    else if (this.species?.id === 'cat' && name === 'reel') this._puff(1.35, 1.2);
    const icon = Object.hasOwn(EMOTE_ICON, name) ? EMOTE_ICON[name] : null; // 원격 플레이어가 보낸 이름은 정해진 것만 ('constructor' 등 차단)
    if (icon) {
      if (this.emote) { this.group.remove(this.emote); this.emote.userData.dispose(); }
      this.emote = makeLabel(icon, { bg: 'rgba(0,0,0,0)', size: 64, scale: 0.008 });
      this.emote.position.y = this.emoteY;
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

  /** 말하기: sec 초 동안 입을 8Hz 로 열고 닫음 (주민 동물) */
  speak(sec = 1.5) {
    this._speakUntil = this.t + Math.max(0, sec);
  }

  /** 꼬리 부풀기 (놀람·입질): amt 배, dur 초 */
  _puff(amt, dur) {
    this._puffAmt = amt; this._puffDur = dur; this._puffT = dur;
  }

  /** 주민 동물 부품: 얼굴(faceG 하나로 먼 거리에서 끔)·머리 옷·몸 옷(몸빼 포함)·리본 */
  _buildSpeciesParts(TPL, boneMap) {
    const add = (b, parent) => { if (!b) return null; const m = meshOf(b); parent.add(m); return m; };
    this.faceG = new THREE.Group();
    this.headG.add(this.faceG);
    this.faceM = add(TPL.face, this.faceG); // 얼굴 + 입 (닫힌 선 ↔ 벌린 입: 같은 버퍼, 그릴 범위만 다른 두 지오메트리)
    this._faceGeo = [TPL.face.geo, TPL.face.open];
    this.mouthOpenNow = false;
    this.eyesG = add(TPL.eyes, this.faceG);
    this.eyesG.position.y = TPL.eyeY;
    this.eyesHappy = add(TPL.happy, this.faceG);
    this.eyesHappy.visible = false;
    if (TPL.nose) { this.noseM = add(TPL.nose, this.faceG); this.noseM.position.copy(TPL.noseAt); }
    if (TPL.brows) this.browsM = add(TPL.brows, this.faceG);
    this.headWear = new THREE.Group();
    this.headG.add(this.headWear);
    add(TPL.headWear, this.headWear);
    add(TPL.body, this.bodyG);
    if (TPL.bow) add(TPL.bow, boneMap.earL);
    if (TPL.momppe) {
      // 몸빼 바지: 같은 뼈대에 스킨 (몸과 같은 묶기 행렬 — 뼈 역행렬은 다시 계산하지 않음)
      const m = new THREE.SkinnedMesh(TPL.momppe, momppeMat());
      m.castShadow = false;
      m.receiveShadow = true;
      this.root.add(m);
      m.bind(this.skeleton, this.skin.bindMatrix);
      presetBounds(m);
      this.momppe = m;
    }
  }

  /** 표정 (주민 동물): 행복 ^^ 눈·눈 크기·말할 때 입·토끼 코·강아지 눈썹 */
  _express(dt, blink, w) {
    const sp = this.species, F = sp.face, t = this.t;
    const speaking = t < this._speakUntil;
    // 곰 할머니: 대기 중 70% 는 ^^ 눈 (3~6초마다 다시 뽑음), 말할 때는 눈을 뜸
    if (F.idleHappy) {
      this._idleHT = (this._idleHT ?? 0) - dt;
      if (this._idleHT <= 0) { this._idleHT = 3 + Math.random() * 3; this._idleHappy = Math.random() < F.idleHappy; }
    }
    // 곰의 대기 눈웃음은 눈만 ^^ (입은 다문 채 — 늘 입 벌린 할머니가 되지 않게)
    const idleSmile = !!this._idleHappy && !speaking && !this.action && w < 0.5;
    const happy = HAPPY.has(this.action) || t < this.happyUntil;
    this.eyesG.visible = !(happy || idleSmile);
    this.eyesHappy.visible = happy || idleSmile;
    // 눈 크기: 고양이는 느긋한 눈(0.85), 놀라면 0.4초 동안 1.15배
    const startle = this.action === 'startle' && this.actionT < 0.4;
    let open = startle ? 1.15 : F.eye.open ?? 1;
    if (this.action === 'count') open *= 0.6;
    if (sp.id === 'cat') {
      // 느린 눈인사: 친한(하트 3+) 플레이어가 가까이서 마주 보면 6~9초마다 (0.3초 감기·0.3초 유지·0.3초 뜨기)
      if (this.hearts >= 3 && this.attention > 0.6 && Math.abs(this.attnYaw) < 0.4) {
        this._slowT = (this._slowT ?? 6 + Math.random() * 3) - dt;
        if (this._slowT <= 0) { this._slowT = 6 + Math.random() * 3; this._slowBlink = 0.9; }
      }
      if (this._slowBlink > 0) {
        this._slowBlink -= dt;
        const u = 0.9 - this._slowBlink;
        open *= u < 0.3 ? 1 - (u / 0.3) * 0.88 : u < 0.6 ? 0.12 : 0.12 + ((u - 0.6) / 0.3) * 0.88;
      }
      if (this.action === 'reel') open = Math.max(open, 1);
    }
    const big = startle ? 1.15 : 1;
    this.eyesG.scale.set(big, blink * open, big);
    // 입: 말하는 동안 8Hz 로 열고 닫기, 아니면 만세·하트·반가운 꼬리(강아지)·선물 뒤·하품 때만 (세수·허리 두드리기·대기 눈웃음은 다문 입)
    const yawn = this.action === 'stretch' && this.actionT > 0.6 && this.actionT < 1.6;
    const mo = speaking ? Math.sin(t * TWO_PI * 8) > 0 : OPEN_MOUTH.has(this.action) || t < this.happyUntil || yawn;
    if (mo !== this.mouthOpenNow) { this.mouthOpenNow = mo; this.faceM.geometry = this._faceGeo[mo ? 1 : 0]; }
    // 토끼 코 씰룩 (2~4초마다 0.5초, 'nose' 동작 중엔 계속)
    if (this.noseM) {
      this._noseT = (this._noseT ?? 2 + Math.random() * 2) - dt;
      if (this._noseT <= 0) { this._noseT = 2 + Math.random() * 2; this._noseUntil = t + 0.5; }
      const tw = t < (this._noseUntil ?? 0) || this.action === 'nose';
      this.noseM.scale.setScalar(tw ? 1 + 0.25 * Math.max(0, Math.sin(t * TWO_PI * 6)) : 1);
    }
    if (this.browsM) { const up = happy || startle ? F.brows.move : 0; this.browsM.position.y += (up - this.browsM.position.y) * (1 - Math.exp(-dt * 12)); }
  }

  /**
   * 주민 동물 2차 동작: 귀 스프링(서 있는 귀·처진 귀·두 마디 귀) + 종별 꼬리 (쓸기·낮게·흔들기·물결·짧은·솜방울)
   * 회전 규칙: 귀 rotation.x + = 귀 끝 앞으로, − = 뒤로 젖힘 / z = 바깥으로(out) / y = 돌림(고양이). 매 프레임 새 객체 만들지 않음
   */
  _speciesSecondary(dt, steps, h, w, ph, turn, lag, bounce, vy, tailBase, bodyPitch, headPitch) {
    const clamp = THREE.MathUtils.clamp, sp = this.species, MO = sp.motion, t = this.t, act = this.action, a = this.actionT;
    const st = (this._sst ||= {
      ears: this.earChain.map((c) => c.map(() => ({ x: 0, vx: 0, y: 0, vy: 0, z: 0, vz: 0 }))),
      tail: this.tailChain.map(() => ({ x: 0, vx: 0, y: 0, vy: 0 })),
      flickT: 2 + Math.random() * 4, flicked: false, wagPh: 0, wagA: 0.15, wagHz: 2.5, pomT: 2, pomUntil: 0,
    });
    // ---- 귀 ----
    const E = MO.ears, att = clamp((this.attention || 0) + (act === 'talk' || act === 'present' ? 1 : 0), 0, 1);
    const startle = act === 'startle' && a < 1.2;
    st.flickT -= dt;
    if (E.flick && st.flickT <= 0) {
      st.flickT = E.flick[0] + Math.random() * (E.flick[1] - E.flick[0]);
      if (E.both) { st.ears[0][0].vx += E.flickV; st.ears[1][0].vx += E.flickV; } else st.ears[Math.random() < 0.5 ? 0 : 1][0].vx += E.flickV;
    }
    if (act === 'earflick' && !st.flicked) { st.flicked = true; st.ears[Math.random() < 0.5 ? 0 : 1][0].vx -= 9; }
    if (act !== 'earflick') st.flicked = false;
    const stiff = startle && E.startle?.stiff ? 2 : 1;
    const k = E.k * stiff, c = E.c * Math.sqrt(stiff);
    for (let i = 0; i < 2; i++) {
      const chain = this.earChain[i], s0 = st.ears[i][0];
      if (!chain[0]) continue;
      const out = E.floppy ? (i === 0 ? -1 : 1) : i === 0 ? 1 : -1; // 바깥(처진 귀는 매달린 방향이 반대)
      let tx, tz, ty = 0;
      if (E.floppy) {
        // 처진 귀: 늘 땅 쪽으로 매달린 진자, 착지 때 위로 펄럭
        tx = -(bodyPitch + headPitch) * 0.9 + bounce * 0.8;
        tz = out * (0.1 + clamp(-2.2 * vy, -0.2, act === 'cheer' ? 0.3 : 0.7) + (act === 'cheer' ? 0.35 : 0) + (startle ? 0.5 : 0)) + turn * 0.4; // 만세 깡충 중엔 펄럭임을 줄여 가로 판처럼 서지 않게
        if (act === 'cheer') tx = Math.max(tx, 0.15); // 만세 때도 귀 끝이 아래로 처져 있게 (뻣뻣한 가로 판처럼 안 보이게)
      } else {
        tx = E.perk * att + 0.6 * bounce + 0.5 * lag - (chain.length > 1 ? 0.35 * (this._air || 0) : 0);
        tz = turn * 0.4;
        if (startle && E.startle) { if (E.startle.x !== undefined) tx = E.startle.x; if (E.startle.out) tz += out * E.startle.out; }
        if (chain.length > 1 && (act === 'cheer' || act === 'nose')) tx = 0.15;
        if (E.turn && this.attention > 0.5) ty = clamp(this.attnYaw || 0, -E.turn, E.turn);
      }
      spring(s0, 'x', 'vx', tx, k, c, steps, h);
      spring(s0, 'z', 'vz', tz, k, c, steps, h);
      if (E.turn) spring(s0, 'y', 'vy', ty, k, c, steps, h);
      s0.x = clamp(s0.x, -1.2, 1.2); s0.y = clamp(s0.y, -0.6, 0.6); s0.z = clamp(s0.z, -1.2, 1.2);
      chain[0].rotation.set(s0.x, s0.y, s0.z);
      if (chain[1]) { // 토끼 위 마디: 아래 마디를 한 박자 늦게 따라감
        const s1 = st.ears[i][1];
        spring(s1, 'x', 'vx', 0.5 * s0.x + 0.6 * bounce, E.tipK * stiff, E.tipC, steps, h);
        spring(s1, 'z', 'vz', 0.3 * s0.z, E.tipK * stiff, E.tipC, steps, h);
        s1.x = clamp(s1.x, -1.2, 1.2); s1.z = clamp(s1.z, -1.2, 1.2);
        chain[1].rotation.set(s1.x, 0, s1.z);
      }
    }
    // ---- 꼬리 ---- (rotation.x + = 위로)
    const TL = MO.tail, tail = this.tailChain, mode = TL.mode;
    // 쉬는 각도: 주민은 플레이어를 마주 보므로 큰 꼬리(여우 붓꼬리·고양이 물음표)를 몸 옆으로 비켜 정면에서도 보이게 (걸을 때는 반쯤 가운데로)
    const restX = (TL.restX || 0) * (1 - 0.5 * w), restY = (TL.restYaw || 0) * (1 - 0.5 * w), rest2X = TL.rest2X || 0;
    let rootX = tailBase + lag + bounce + restX, rootY = turn + restY;
    if (mode === 'sweep') { // 여우: 엉덩이와 반대로 크게 쓸기, 귀 휙 때 꼬리 과시
      rootY += TL.amp * Math.sin(t * TWO_PI * TL.hz) * (1 - w) - Math.sin(ph) * TL.walk * w;
      if (act === 'earflick') rootY += 0.6 * Math.sin(Math.min(1, a / 0.8) * Math.PI) * Math.sign(Math.sin(a * 5) || 1);
    } else if (mode === 'low') { // 너구리: 낮게 느긋이
      rootX -= TL.base;
      rootY += TL.amp * Math.sin(t * TWO_PI * TL.hz) * (1 - w) - Math.sin(ph) * TL.walk * w;
    } else if (mode === 'stub') { // 곰: 짧은 꼬리 걸음마다 살랑
      rootY += Math.sin(ph) * TL.amp * w + Math.sin(t * 1.3) * 0.04 * (1 - w);
    } else if (mode === 'swave') { // 고양이: 걸을 때 위로, 입질·감기 때 곧게
      rootX += 0.45 * w + (act === 'reel' ? 0.35 : 0);
    } else if (mode === 'pom') { // 토끼: 2~4초마다·착지마다 까딱
      st.pomT -= dt;
      if (st.pomT <= 0 || this._landed) { st.pomT = 2 + Math.random() * 2; st.pomUntil = t + 0.1; }
      if (t < st.pomUntil) rootX += 0.2;
    } else if (mode === 'wag') { // 강아지: 뿌리 각도를 직접 (반가울수록 크고 빠르게)
      const glad = WAG_GLAD.has(act) || this.attention > 0.8 || (this.attention > 0.5 && this.hearts >= 3);
      const A0 = act === 'wag' ? 0.5 : glad ? 0.45 : w > 0.5 ? 0.35 : 0.15, hz = glad || act === 'wag' ? 7 : w > 0.5 ? 6 : 2.5;
      const kk = 1 - Math.exp(-dt * 4);
      st.wagA += (A0 - st.wagA) * kk; st.wagHz += (hz - st.wagHz) * kk;
      st.wagPh = (st.wagPh + TWO_PI * st.wagHz * dt) % (TWO_PI * 64);
      this._wagPh = st.wagPh; this._wagA = st.wagA;
    }
    this._landed = false;
    let parentX = 0, parentY = 0;
    for (let i = 0; i < tail.length; i++) {
      const s = st.tail[i], K = TL.k[Math.min(i, TL.k.length - 1)], Cc = TL.c[Math.min(i, TL.c.length - 1)];
      let tx = (i === 0 ? rootX : 0) + parentX * 0.55 + (i === 1 ? rest2X : 0), ty = (i === 0 ? rootY : 0) + parentY * 0.6;
      if (mode === 'swave') { // 마디마다 0.9rad 늦춘 S 물결 + 끝 말림
        ty += TL.amp * Math.sin(t * TWO_PI * TL.hz - 0.9 * i) * (act === 'reel' ? 0.2 : 1);
        if (i === tail.length - 1) tx += 0.3 + (act === 'fishwait' ? 0.18 * Math.sin(t * 7.3) * Math.sin(t * 2.1) : 0);
      }
      if (mode === 'wag' && i === 0) { s.y = st.wagA * Math.sin(st.wagPh); s.vy = 0; spring(s, 'x', 'vx', tx, K, Cc, steps, h); }
      else { spring(s, 'x', 'vx', tx, K, Cc, steps, h); spring(s, 'y', 'vy', ty, K, Cc, steps, h); }
      s.x = clamp(s.x, -1.1, 1.1); s.y = clamp(s.y, -1.1, 1.1);
      tail[i].rotation.set(s.x, s.y, 0);
      parentX = s.x - (i === 0 ? restX : i === 1 ? rest2X : 0); parentY = s.y - (i === 0 ? restY : 0); // 쉬는 각도는 통째로 (다음 마디는 움직임만 따라감)
    }
    // 부풀기 (놀람·입질): 빠르게 커졌다가 천천히
    let puff = 1;
    if (this._puffT > 0) {
      this._puffT = Math.max(0, this._puffT - dt);
      const p = this._puffT / this._puffDur;
      puff = 1 + (this._puffAmt - 1) * (p > 0.8 ? (1 - p) / 0.2 : p / 0.8);
    }
    tail[0].scale.setScalar(this.momppe ? 1e-3 : puff); // 곰 할머니 짧은 꼬리는 몸빼 안으로 (허리 띠 위로 삐져나오지 않게)
  }

  /**
   * 꼬리·갈기 2차 동작: 몸의 회전·가감속·위아래 움직임을 늦게 따라가는 감쇠 스프링.
   * 꼬리는 뿌리 → 중간 → 끝으로 갈수록 한 박자씩 늦게 휘어 채찍처럼 물결치고,
   * 갈기는 출발·정지·점프 때 뒤로 쏠렸다 돌아오며 방향을 틀면 바깥으로 휘날림.
   */
  _secondary(dt, speed, w, ph, bodyY, bodyRoll, tailBase, bodyPitch = 0, headPitch = 0) {
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
    if (this.species) { this._speciesSecondary(dt, steps, h, w, ph, turn, lag, bounce, vy, tailBase, bodyPitch, headPitch); return; }
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
    const low = charQ() === 'low';
    if (camera) {
      d = camera.position.distanceTo(this.group.position);
      const hero = !!this.labelAlways;
      // 거리별 표현: 15m 넘으면 저해상도 몸, 24m 넘으면 그림자 끔, 40m 넘으면 얼굴 부품 생략 (경계에서 깜빡이지 않게 여유)
      // 낮음: 내 캐릭터가 아니면 9m 넘으면 저해상도 몸 (대화 구도 7m 안팎은 원본), 실제 그림자 대신 바닥 그림자만
      if (this.skinLod) {
        const far = low && !hero ? d > (this.isLod ? 8 : 9) : d > (this.isLod ? 14 : 16);
        if (far !== this.isLod) { this.isLod = far; this.skin.visible = !far; this.skinLod.visible = far; }
      }
      this.skin.castShadow = d < 24 && (hero || !low);
      if (this.skinLod) this.skinLod.castShadow = this.skin.castShadow; // 저해상도로 바뀌어도 땅 그림자가 사라지지 않게 (약 5천 삼각형)
      const faceOn = d < (this.faceOff ? 36 : 40);
      if (faceOn === !!this.faceOff) {
        this.faceOff = !faceOn;
        if (this.faceG) this.faceG.visible = faceOn; // 주민 동물: 얼굴 묶음 하나로 (숨긴 ^^ 눈·벌린 입은 그대로)
        else for (const c of this.headG.children) if (c.isMesh) c.visible = faceOn;
      }
      // 카메라 바로 앞(3m 안)에서는 이름표·감정 아이콘이 화면을 가리지 않게 흐리게
      const near = THREE.MathUtils.clamp((d - 1.8) / 1.6, 0, 1);
      if (this.emote) this.emote.visible = near > 0.3;
      if (this.label && !this.labelAlways) {
      const a = THREE.MathUtils.clamp((22 - d) / 7, 0, 1) * near;
      this.label.material.opacity = a;
      this.label.visible = a > 0.02;
      }
    }
    // 원본 몸이 늦게 도착(나중 받기): 저해상도로 보이는 동안·화면 밖일 때(또는 10초 뒤) 지오메트리만 바꿈 — 같은 뼈대라 bind 다시 안 함
    // 한 프레임에 하나만 (KOAT 담당 7명이 같은 프레임에 색을 만들면 휴대폰에서 1~2프레임 끊김). 프레임 번호가 아직 0(테스트)이면 제한 없음
    if (this._wantFull && SKINS[this.rig]) {
      this._waitT += dt;
      if ((this.isLod || TICK - this._seen > 2 || this._waitT > 10) && (SWAP_TICK !== TICK || TICK === 0)) {
        SWAP_TICK = TICK;
        this.skin.geometry = skinGeometry(this.rig, this._pal, this._ao);
        presetBounds(this.skin);
        this._wantFull = false;
      }
    }
    // 화면 밖(최근 두 프레임 동안 안 그려짐)이면 자세 계산을 몰아서 (흩어진 시점에 한 번씩), 낮음에서는 40m 넘게 먼 캐릭터도
    // 내 캐릭터는 늘 매 프레임, 몸 그림자가 화면에 비칠 수 있는 동안도 매 프레임
    if (!this.labelAlways) {
      const hidden = TICK - this._seen > 2 && !this.skin.castShadow;
      const step = hidden ? HIDDEN_STEP : d > 40 && low ? FAR_STEP : 0;
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
      this.emote.position.y = this.emoteY + Math.min(0.4, (this.t - (this.emoteUntil - 2)) * 0.3);
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
    const LEG_LEN = this.legLen, BODY_Y = this.bodyY, bp = this.biped, G = this._gait, sp = this.species;
    // 이등신 종종걸음: 다리가 짧아 보폭만큼 정확히 디디면 초당 7번 넘게 다리를 휘저어 떨려 보이므로
    // 걸음 수(케이던스)를 초당 1.5~3회로 제한하고, 빠를수록 다리를 크게 벌림 (발이 약간 미끄러지는 대신 자연스러운 리듬)
    const sp01 = Math.min(1, speed / 4.6);
    const ampT = (bp ? 0.38 + 0.32 * sp01 : 0.42 + 0.18 * sp01) * G.amp; // 다리 최대 각도(rad)
    this.walkAmp = (this.walkAmp ?? ampT) + (ampT - (this.walkAmp ?? ampT)) * (1 - Math.exp(-dt * 6));
    const AMP = this.walkAmp;
    const stride = 2 * LEG_LEN * this.scale * Math.sin(AMP); // 반주기 동안 디딘 발이 미는 거리 (땅 위)
    const cadence = THREE.MathUtils.clamp(Math.max(speed, 1.2) / (2 * stride), G.cadMin ?? 1.5, G.cadMax ?? (bp ? 3.0 : 3.2)); // 초당 걸음 주기
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
    // 토끼 깡충: 두 다리 같은 위상, 공중에서 다리를 접고 팔을 벌림
    let air = 0;
    if (G.hop) {
      air = Math.max(0, Math.sin(ph));
      const lx = (-0.45 * air + 0.25 * (1 - air)) * w;
      legs[0].rotation.x = legs[1].rotation.x = lx;
      arms[0].rotation.z -= 0.5 * air * w; arms[1].rotation.z += 0.5 * air * w;
    }
    this._air = air * w;
    // 다리가 기울면 발끝 높이가 L(1-cosθ) 만큼 올라가므로 그만큼 몸을 내려 발을 땅에 붙임
    // 다리를 벌리면 골반이 내려가고(발이 땅에 붙게), 한 발로 디디는 중간에는 살짝 튀어 오름 → 걸음마다 통통
    const bob = G.hop ? 0 : (-LEG_LEN * (1 - Math.cos(sw)) * (bp ? 0.65 : 1) + (bp ? Math.abs(Math.cos(ph)) * 0.018 * w * (0.5 + sp01) : 0)) * G.bob;
    const s = Math.sin(ph);
    // 발소리: 걸음은 다리가 엇갈릴 때마다, 깡충은 착지 때만 (+ 착지 찌그러짐)
    const stepNow = G.hop ? this.lastSin > 0 && s <= 0 : Math.sign(s) !== Math.sign(this.lastSin);
    if (walking && !this.swimming && stepNow) { this.onStep?.(pos.x, pos.z); if (G.hop) { this._squash = 0.08; this._landed = true; } }
    this.lastSin = s;

    // 몸: 빠를수록 앞으로 기울고, 디딘 발 쪽으로 살짝 기우뚱. 머리는 몸의 흔들림을 반쯤 상쇄(시선 안정)
    let bodyY = BODY_Y + bob, bodyPitch = Math.sin(ph * 2) * 0.025 * w + (bp ? (0.04 + 0.06 * sp01) * w : 0), bodyRoll = bp ? Math.sin(ph) * 0.045 * w * G.roll : 0;
    let headPitch = -Math.sin(ph * 2) * 0.02 * w - (bp ? 0.04 * sp01 * w : 0), headRoll = -bodyRoll * 0.5 * (G.steady ?? 1);
    const breath = Math.sin(this.t * 2.1 * (G.breathF ?? 1)) * 0.012 * (G.breathA ?? 1) * (1 - w); // 숨쉬기: 가슴이 살짝 오르내림
    bodyY += breath;
    // 종별 걸음 맛 (여우 턱 들기, 너구리 뒤뚱, 강아지 머리 까딱, 토끼 깡충 높이, 곰 굽은 허리, 강아지 꼬리 따라 엉덩이)
    let bodySY = 1;
    if (sp) {
      if (G.waddle) bodyRoll += Math.sin(ph) * G.waddle * w;
      if (G.headPitch) headPitch += G.headPitch;
      if (G.nod) headPitch += Math.sin(ph * 2) * G.nod * w;
      if (G.hop) bodyY += 0.14 * air * w;
      if (sp.rest === 'backhand') { bodyPitch += 0.07; headPitch -= 0.05; }
      if (this._wagA) bodyRoll += 0.02 * Math.sin(this._wagPh) * (this._wagA / 0.45);
      if (this._squash > 0) { this._squash -= dt; bodySY = 0.94; }
    }
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
    if (!this.action) headYaw += THREE.MathUtils.clamp(turnErr * 0.45 * (G.look ?? 1), -0.5, 0.5);
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
            if (sp?.id === 'raccoon') { AL.rotation.set(-0.3, 0, -2.0); AR.rotation.set(-0.3, 0, 2.0); } // 두 손 번쩍
            else if (sp?.id === 'puppy') bodyPitch -= 0.2 * up; // 왈! 뒤로 폴짝
            else if (sp?.id === 'bear') { bodyY -= up * 0.34 * 0.3; bodyPitch *= 0.7; AR.rotation.set(-1.9, 0, -0.4); } // 아이고, 손을 볼에
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
          // 머리가 커서 옆으로 만세. 주민 동물은 팔을 옆으로 크게 벌려 머리 밖에서 V (손 약 x ±0.56·y 1.05·조금 앞 — 짧은 팔로 머리 타원 밖에 손이 오는 가장 높은 곳,
          // 더 올리면 손이 볼·머리 뒤에 겹쳐 '으쓱'처럼 보임)
          if (sp) { AL.rotation.set(0.15, 0, -1.8 + Math.sin(a * 18) * 0.08); AR.rotation.set(0.15, 0, 1.8 - Math.sin(a * 18) * 0.08); }
          else if (bp) { AL.rotation.set(-0.35, 0, -1.85 + Math.sin(a * 18) * 0.15); AR.rotation.set(-0.35, 0, 1.85 - Math.sin(a * 18) * 0.15); }
          break;
        }
        case 'wave': { // 손 흔들기
          if (sp) { AR.rotation.set(-0.45, 0, 1.9 + Math.sin(a * 12) * 0.16); headRoll = -0.12; headPitch = -0.1; } // 주민 동물: 어깨보다 늘 높이 (머리 안 뚫는 한계 안)
          else if (bp) { AR.rotation.set(-0.55, 0, 1.75 + Math.sin(a * 12) * 0.3); headRoll = -0.12; headPitch = -0.1; } // 머리 옆에서 손 흔들기
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
        // ---- 주민 동물 대기 동작 (머리 위 아이콘 없음) ----
        case 'count': // 여우: 두 손 가슴 앞에 모아 동전 톡톡 세기 (눈꺼풀 내림)
          headPitch = 0.22; bodyPitch = 0.04;
          if (bp) { AL.rotation.set(-1.15 + Math.sin(a * 38) * 0.08, 0, 0.45); AR.rotation.set(-1.15 - Math.sin(a * 38) * 0.08, 0, -0.45); }
          break;
        case 'earflick': // 여우: 귀 휙 + 꼬리 과시 (귀·꼬리는 2차 동작에서)
          headRoll = Math.sin(Math.min(1, a / 0.8) * Math.PI) * 0.1; headPitch = -0.1;
          break;
        case 'rub': { // 너구리: 앞발 비비기 (생각할 때)
          const r = Math.sin(a * 18) * 0.12;
          headPitch = 0.25;
          if (bp) { AL.rotation.set(-1.15, 0, 0.45 + r); AR.rotation.set(-1.15, 0, -0.45 + r); }
          break;
        }
        case 'goggle': // 너구리: 이마의 고글 고쳐 쓰기
          headPitch = -0.1;
          if (bp) AR.rotation.set(-2.3, 0, -0.3 + Math.sin(a * 6) * 0.05);
          break;
        case 'tilt': { // 강아지: 고개 갸웃 (귀는 스프링으로 흔들림)
          const k = Math.min(1, a / 0.25) * (a > 1.05 ? Math.max(0, 1 - (a - 1.05) / 0.3) : 1);
          headRoll = 0.35 * k; headPitch = -0.05 * k;
          break;
        }
        case 'wag': // 강아지: 꼬리 신나게 + 콩콩
          bodyY += 0.05 * Math.abs(Math.sin(a * 12)); headPitch = -0.12;
          break;
        case 'backpat': // 곰 할머니: 허리 두드리기
          bodyPitch = -0.05; headPitch = -0.12;
          if (bp) AL.rotation.set(0.6 + Math.max(0, Math.sin(a * 7)) * 0.25, 0, -0.3);
          break;
        case 'nod': // 곰 할머니: 끄덕끄덕
          headPitch = 0.12 * Math.sin(a * 2.4);
          break;
        case 'groom': // 고양이: 세수
          headPitch = 0.25; headRoll = 0.2;
          if (bp) AR.rotation.set(-2.0, 0, -0.6 + Math.sin(a * 10) * 0.15);
          break;
        case 'stretch': { // 고양이: 기지개 + 하품
          const k = Math.min(1, a / 0.4) * Math.min(1, Math.max(0, (2 - a) / 0.4));
          bodyPitch = -0.12 * k; headPitch = -0.2 * k;
          if (bp) { AL.rotation.set(-2.6 * k, 0, -0.3 * k); AR.rotation.set(-2.6 * k, 0, 0.3 * k); }
          break;
        }
        case 'hop': { // 토끼: 제자리에서 세 번 깡충
          const j = a < 1.5 ? Math.abs(Math.sin(a * TWO_PI)) : 0;
          bodyY += 0.16 * j; headPitch = -0.1;
          for (const l of legs) l.rotation.x = -0.35 * j;
          if (bp) { AL.rotation.z = -0.4 * j - 0.1; AR.rotation.z = 0.4 * j + 0.1; }
          if (j < 0.05 && (this._hopL ?? 1) >= 0.05) this._landed = true;
          this._hopL = j;
          break;
        }
        case 'nose': // 토끼: 코 씰룩 + 귀 쫑긋 (코·귀는 표정·2차 동작에서)
          headPitch = -0.12; headRoll = Math.sin(a * 3) * 0.05;
          break;
        default: break;
      }
    }
    // ---- 주민 동물 쉬는 팔: 너구리 'T-rex 앞발', 곰 할머니 왼팔 허리 뒤 ----
    if (sp && !this.action && !this.riding && !this.swimming) {
      const [AL, AR] = arms;
      if (sp.rest === 'trex') {
        const k = 1 - 0.5 * w;
        AL.rotation.set(AL.rotation.x + (-0.95 - AL.rotation.x) * k, 0, AL.rotation.z + (0.35 - AL.rotation.z) * k);
        AR.rotation.set(AR.rotation.x + (-0.95 - AR.rotation.x) * k, 0, AR.rotation.z + (-0.35 - AR.rotation.z) * k);
      } else if (sp.rest === 'backhand' && w < 0.5) AL.rotation.set(0.55, 0, -0.25);
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
    const want = this.holding || (this.swimming ? null : sp?.props?.[this.action] ?? PROP_OF[this.action]);
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
    if (sp) this.bodyG.scale.y = bodySY;
    this.headG.rotation.set(headPitch, headYaw, headRoll);
    this._secondary(dt, speed, w, ph, bodyY, bodyRoll, tailBase, bodyPitch, headPitch);
    // ---- 자세 전환 보간: 감정표현·탑승 상태가 바뀌면 0.3초 동안 이전 자세에서 새 자세로 이어 줌 ----
    // (걷기 주기 자체에는 걸지 않아 발 디딤 타이밍은 그대로)
    const pk = (this._pk ||= { a: this.action || '', r: !!this.riding, s: !!this.swimming });
    if (pk.a !== (this.action || '') || pk.r !== !!this.riding || pk.s !== !!this.swimming) {
      this._transT = this._transD = sp?.motion.trans ?? 0.3; pk.a = this.action || ''; pk.r = !!this.riding; pk.s = !!this.swimming;
    }
    if (this._transT > 0) {
      this._transT = Math.max(0, this._transT - dt);
      const k = Math.max(1 - Math.exp(-dt * 10), 1 - this._transT / this._transD); // 끝날 때는 정확히 새 자세에 도달
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
    if (this.nextBlink < (sp?.motion.blinkHold ?? 0.12)) blink = 0.12;
    if (this.nextBlink <= 0) this.nextBlink = 2.5 + Math.random() * 3.5;
    if (sp) this._express(dt, blink, w);
    else this.eyesG.scale.y = blink;
    // 그림자: 점프하면 작고 옅어짐, 발굽 그림자는 발 위치를 따라감
    const up = Math.max(0, bodyY - this.bodyY);
    const shs = Math.max(0.45, 1 - up * 1.8);
    if (sp) this.shadow.scale.set(sp.shadow[0] * shs, sp.shadow[1] * shs, 1);
    else if (this.biped) this.shadow.scale.set(0.95 * shs, 0.85 * shs, 1);
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
