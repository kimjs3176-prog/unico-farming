import * as THREE from 'three';
import { makeBodySDF, surfacePoint, bonePos } from './unico_mesh.js';

/**
 * 두 발 유니코 코스튬 모양 (규칙·혜택은 sim/costume.js)
 *  - 몸통 옷은 몸통 SDF 표면을 따라 씌운 '껍데기'(shell) → 몸 비율이 바뀌어도 옷이 몸에 꼭 맞음
 *  - 부위별로 뼈에 붙음: body(몸통 뼈) · head(머리 소품 그룹, 모자와 같은 좌표) · armL/armR · legL/legR
 *  - 반환: { parts: { body: [[geometry, material]...], ... }, hideHat, hideScarf, hideSprout }
 */
const TWO_PI = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAT = {};
const mat = (key, color, o = {}) => (MAT[key] ||= Object.assign(new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, depthWrite: !o.opacity }), { name: 'cos_' + key }));
const CLOTH = (key, color, o = {}) => mat(key, color, { side: THREE.DoubleSide, ...o });

function xf(g, { s = [1, 1, 1], r = [0, 0, 0], q = null, p = [0, 0, 0] } = {}) {
  g.scale(...s);
  g.applyQuaternion(q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)));
  g.translate(...p);
  return g;
}
const sph = (rad, o = {}, seg = 16) => xf(new THREE.SphereGeometry(rad, seg, Math.round(seg * 0.7)), o);
const cyl = (r1, r2, h, o = {}, seg = 24, open = false) => xf(new THREE.CylinderGeometry(r1, r2, h, seg, 1, open), o);
const box = (w, h, d, o = {}) => xf(new THREE.BoxGeometry(w, h, d), o);
const torus = (R, t, o = {}, seg = 24) => xf(new THREE.TorusGeometry(R, t, 8, seg), o);
/** 두 점을 잇는 캡슐 */
function capsule(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CapsuleGeometry(r, d.length(), 4, 14);
  return xf(g, { q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()), p: a.clone().add(b).multiplyScalar(0.5).toArray() });
}
const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 6, false);

let BODY_SDF = null;
const BODY = bonePos('biped', 'body'); // 몸통 뼈 (루트 기준)
/** 몸통 표면 위 점 (루트 좌표): 높이 y, 방위각 phi(0 = 정면 +Z) */
function bodyPoint(y, phi) {
  BODY_SDF ||= makeBodySDF('biped');
  return surfacePoint(BODY_SDF, V(0, y, 0.01), V(Math.sin(phi), 0, Math.cos(phi)));
}

/**
 * 몸통을 감싸는 옷 껍데기 (몸통 뼈 좌표)
 * @param y0,y1 루트 기준 높이 범위, off 표면에서 띄우는 두께, flare(y) 아래로 퍼지는 양, phi0·len 감쌀 각도(정면 0)
 */
function shell(y0, y1, { off = 0.03, flare = () => 0, phi0 = -Math.PI, len = TWO_PI, ny = 12, nphi = 36 } = {}) {
  const closed = len >= TWO_PI - 1e-6;
  const cols = closed ? nphi : nphi + 1;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    const y = y0 + ((y1 - y0) * j) / ny;
    for (let i = 0; i < cols; i++) {
      const phi = phi0 + (len * i) / nphi;
      const p = bodyPoint(y, phi);
      const dir = V(Math.sin(phi), 0, Math.cos(phi));
      p.addScaledVector(dir, off + flare(y)).sub(BODY);
      pos.push(p.x, p.y, p.z); uv.push(i / nphi, j / ny);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nphi; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + ((i + 1) % cols), d = (j + 1) * cols + i;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** 몸통 표면 위 한 점에 붙는 작은 부품 위치 (몸통 뼈 좌표, 표면에서 off 만큼 바깥) */
const onBody = (y, phi, off = 0.04) => bodyPoint(y, phi).addScaledVector(V(Math.sin(phi), 0, Math.cos(phi)), off).sub(BODY);

// 팔·다리 뼈 기준 좌표
const ARM = (sx) => bonePos('biped', sx < 0 ? 'armL' : 'armR');
const handLocal = (sx) => V(sx * 0.43, 0.485, 0.065).sub(ARM(sx)); // 손 중심
const legLocal = (sx, y) => V(sx * 0.135, y, 0.012).sub(bonePos('biped', sx < 0 ? 'legL' : 'legR'));

/** 팔 전체를 감싸는 소매 (어깨 → 손목 비율 t) */
const sleeve = (sx, t, r, m) => [capsule(V(0, 0, 0), handLocal(sx).multiplyScalar(t), r), m];

const BUILD = {
  overalls() {
    const denim = CLOTH('denim', 0x4f7fbf), denimD = CLOTH('denimD', 0x3c669f), gold = mat('btn', 0xf2c14e, { rough: 0.35, metal: 0.4 }), shirt = CLOTH('shirtChk', 0xe46b5a);
    const body = [
      [shell(0.2, 0.6, { off: 0.032 }), denim],
      [shell(0.58, 0.8, { off: 0.034, phi0: -0.72, len: 1.44, ny: 6, nphi: 10 }), denim], // 앞 가슴판
      [shell(0.56, 0.6, { off: 0.04, ny: 1 }), denimD], // 허리 솔기
      [box(0.13, 0.1, 0.02, { p: onBody(0.7, 0, 0.045).toArray() }), denimD], // 가슴 주머니
    ];
    for (const sx of [-1, 1]) {
      // 멜빵: 가슴판 위 → 어깨 → 등 허리
      const f = onBody(0.79, sx * 0.55, 0.04), top = onBody(0.86, sx * 1.05, 0.03), bk = onBody(0.62, Math.PI - sx * 0.55, 0.04);
      body.push([tube([f, top.clone().add(V(0, 0.02, 0)), onBody(0.8, Math.PI - sx * 0.9, 0.035), bk], 0.018), denimD]);
      body.push([sph(0.026, { p: onBody(0.78, sx * 0.55, 0.05).toArray() }), gold]);
    }
    const legs = (sx) => [[cyl(0.128, 0.122, 0.15, { p: legLocal(sx, 0.27).toArray() }, 20, true), denim], [torus(0.123, 0.012, { r: [Math.PI / 2, 0, 0], p: legLocal(sx, 0.195).toArray() }), denimD]];
    return { parts: { body, legL: legs(-1), legR: legs(1), armL: [sleeve(-1, 0.3, 0.088, shirt)], armR: [sleeve(1, 0.3, 0.088, shirt)] } };
  },

  raincoat() {
    const y = CLOTH('rain', 0xffcc33, { rough: 0.35 }), yD = CLOTH('rainD', 0xf2b01e, { rough: 0.4 }), btn = mat('rainBtn', 0x3b3532, { rough: 0.4 });
    const body = [
      [shell(0.2, 0.84, { off: 0.04, flare: (h) => Math.max(0, 0.5 - h) * 0.18 }), y],
      [torus(0.17, 0.035, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], p: [0, 0.84 - BODY.y, 0.01] }), yD], // 깃
    ];
    for (const h of [0.72, 0.6, 0.48]) body.push([sph(0.024, { p: onBody(h, 0, 0.05 + Math.max(0, 0.5 - h) * 0.18).toArray() }), btn]);
    const arm = (sx) => [sleeve(sx, 0.78, 0.09, y), [torus(0.085, 0.016, { q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), handLocal(sx).normalize()), p: handLocal(sx).multiplyScalar(0.78).toArray() }), yD]];
    const boot = (sx) => [[cyl(0.124, 0.13, 0.19, { p: legLocal(sx, 0.095).toArray() }, 20), yD]];
    // 비 모자 (챙 넓은 모자, 뒤로 길게)
    const head = [
      [cyl(0.5, 0.56, 0.03, { s: [1, 1, 1.12], r: [-0.12, 0, 0], p: [0, 0.32, -0.06] }, 32), y],
      [xf(new THREE.SphereGeometry(0.33, 24, 12, 0, TWO_PI, 0, Math.PI / 2), { s: [1, 0.72, 1], r: [-0.12, 0, 0], p: [0, 0.33, -0.04] }), y],
    ];
    return { parts: { body, head, armL: arm(-1), armR: arm(1), legL: boot(-1), legR: boot(1) }, hideHat: true, hideSprout: true, hideScarf: true };
  },

  beekeeper() {
    const w = CLOTH('beeW', 0xf7f5ee), net = CLOTH('beeNet', 0x2c2c2c, { opacity: 0.16 }), band = mat('beeBand', 0xf2c14e);
    const head = [
      [cyl(0.54, 0.56, 0.03, { p: [0, 0.36, 0] }, 32), w],
      [cyl(0.27, 0.3, 0.22, { p: [0, 0.48, 0] }, 28), w],
      [torus(0.29, 0.02, { r: [Math.PI / 2, 0, 0], p: [0, 0.4, 0] }, 28), band],
      [cyl(0.5, 0.53, 0.62, { p: [0, 0.05, 0] }, 32, true), net], // 망사
    ];
    const body = [[shell(0.3, 0.82, { off: 0.03 }), w], [shell(0.6, 0.64, { off: 0.04, ny: 1 }), CLOTH('beeBelt', 0xe0c58a)]];
    const glove = (sx) => [[sph(0.086, { p: handLocal(sx).toArray() }), w], [torus(0.075, 0.016, { q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), handLocal(sx).normalize()), p: handLocal(sx).multiplyScalar(0.8).toArray() }), w], sleeve(sx, 0.7, 0.085, w)];
    return { parts: { head, body, armL: glove(-1), armR: glove(1) }, hideHat: true, hideSprout: true };
  },

  chef() {
    const w = CLOTH('chefW', 0xffffff, { rough: 0.7 }), apron = CLOTH('chefAp', 0xe6ebf0, { rough: 0.75 }), navy = CLOTH('chefNavy', 0x34495e), red = CLOTH('chefRed', 0xe35d5d);
    const head = [[cyl(0.21, 0.22, 0.24, { p: [0, 0.48, -0.02] }, 24), w]];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TWO_PI; head.push([sph(0.13, { p: [Math.cos(a) * 0.11, 0.66, -0.02 + Math.sin(a) * 0.11] }), w]); }
    head.push([sph(0.15, { p: [0, 0.7, -0.02] }), w]);
    const body = [
      [shell(0.22, 0.8, { off: 0.036, phi0: -1.05, len: 2.1, ny: 12, nphi: 14, flare: (h) => Math.max(0, 0.45 - h) * 0.1 }), apron], // 앞치마 (흰 몸에 묻히지 않게 연회색)
      [shell(0.58, 0.61, { off: 0.043, ny: 1 }), navy], // 허리끈
      [box(0.14, 0.09, 0.02, { p: onBody(0.42, 0, 0.06).toArray() }), navy],
      [xf(new THREE.ConeGeometry(0.1, 0.16, 3), { r: [Math.PI + 0.25, 0, 0], p: onBody(0.8, 0, 0.05).toArray() }), red], // 목수건
      [torus(0.16, 0.03, { r: [Math.PI / 2, 0, 0], p: [0, 0.84 - BODY.y, 0.02] }), red],
    ];
    return { parts: { head, body }, hideHat: true, hideSprout: true, hideScarf: true };
  },

  koat() {
    const vest = CLOTH('koatV', 0x1f9e93, { rough: 0.6 }), trim = CLOTH('koatT', 0xfac03e), card = mat('koatCard', 0xffffff, { rough: 0.4 }), strap = mat('koatStrap', 0x26557a);
    const body = [
      [shell(0.42, 0.82, { off: 0.035, phi0: 0.32, len: TWO_PI - 0.64 }), vest], // 앞이 트인 조끼
      [shell(0.42, 0.45, { off: 0.042, phi0: 0.32, len: TWO_PI - 0.64, ny: 1 }), trim],
    ];
    const badge = onBody(0.64, -0.45, 0.06);
    body.push([box(0.12, 0.15, 0.015, { r: [0, -0.45, 0], p: badge.toArray() }), card]);
    body.push([box(0.12, 0.035, 0.018, { r: [0, -0.45, 0], p: badge.clone().add(V(0, 0.05, 0)).toArray() }), vest]);
    // 목걸이 줄: 오른쪽 목덜미 → 가슴 → 사원증 → 왼쪽 목덜미
    body.push([tube([onBody(0.86, 2.2, 0.01), onBody(0.84, 0.7, 0.03), onBody(0.74, 0.05, 0.05), badge.clone().add(V(0, 0.075, 0)), onBody(0.84, -0.9, 0.03), onBody(0.86, -2.2, 0.01)], 0.011), strap]);
    return { parts: { body } };
  },

  hanbok() {
    const jeo = CLOTH('hbJeo', 0xf9d66b), skirt = CLOTH('hbSkirt', 0xd9465f), white = CLOTH('hbW', 0xffffff), red = CLOTH('hbRed', 0xc8283f);
    const STRIPES = [0xe35d5d, 0xfac03e, 0x6dbb4f, 0x4a90d9, 0xf3a5c8].map((c, i) => CLOTH('hbS' + i, c));
    const skFlare = (h) => Math.max(0, 0.62 - h) * 0.24;
    const body = [
      [shell(0.2, 0.62, { off: 0.04, flare: skFlare }), skirt], // 다홍치마
      [shell(0.6, 0.84, { off: 0.045 }), jeo], // 노랑 저고리
      [shell(0.79, 0.84, { off: 0.05, phi0: -0.8, len: 1.6, ny: 2, nphi: 10 }), white], // 동정(흰 깃)
    ];
    const knot = onBody(0.7, 0.15, 0.06);
    body.push([sph(0.035, { p: knot.toArray() }), red]);
    body.push([box(0.05, 0.22, 0.015, { r: [0.1, 0, 0.18], p: knot.clone().add(V(0.02, -0.12, 0.015)).toArray() }), red]);
    body.push([box(0.045, 0.18, 0.015, { r: [0.1, 0, -0.1], p: knot.clone().add(V(-0.03, -0.1, 0.02)).toArray() }), red]);
    const arm = (sx) => {
      const out = [sleeve(sx, 0.86, 0.092, jeo)];
      const hd = handLocal(sx), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), hd.clone().normalize());
      STRIPES.forEach((m, i) => out.push([torus(0.091, 0.014, { q, p: hd.clone().multiplyScalar(0.36 + i * 0.1).toArray() }, 18), m])); // 색동
      return out;
    };
    return { parts: { body, armL: arm(-1), armR: arm(1) }, hideScarf: true };
  },
};

const CACHE = {};
/** 코스튬 모양 (처음 쓸 때 한 번 만들고 모든 유니코가 공유) */
export function costumeShape(id) {
  if (!BUILD[id]) return null;
  return (CACHE[id] ||= BUILD[id]());
}
export const COSTUME_IDS = Object.keys(BUILD);
