import * as THREE from 'three';

/**
 * 아이콘용 작은 소품을 만드는 공용 도구 (아이콘 굽기 전용, 게임 실행 중에는 쓰지 않음)
 *  - 재질은 부드러운 표준 재질 하나로 통일 (같은 빛에서 같은 느낌)
 *  - 모든 함수는 THREE 객체만 만들고 그리기는 하지 않음 → node 테스트에서도 만들 수 있음
 */
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const MATS = new Map();
/** 색·광택별 재질 (같은 값이면 공유) */
export function mat(color, { rough = 0.55, metal = 0, emissive = 0, ei = 0, side = THREE.FrontSide, vc = false, opacity = 1 } = {}) {
  const k = [color, rough, metal, emissive, ei, side, vc, opacity].join('|');
  if (!MATS.has(k)) {
    MATS.set(k, new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei, side, vertexColors: vc,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    }));
  }
  return MATS.get(k);
}
export const shiny = (c, o = {}) => mat(c, { rough: 0.22, metal: 0.05, ...o });
export const gold = (c = 0xf2c23a) => mat(c, { rough: 0.25, metal: 0.65, emissive: 0x6a4400, ei: 0.35 });
export const glass = (c = 0xdff3f6) => mat(c, { rough: 0.08, opacity: 0.55 });
export const two = (c, o = {}) => mat(c, { side: THREE.DoubleSide, ...o });

/** 메시 하나 (위치·회전·크기) */
export function mesh(geo, material, { p, r, s } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (p) m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (s != null) Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s);
  return m;
}
export const sphere = (r = 0.5, ws = 24, hs = 16) => new THREE.SphereGeometry(r, ws, hs);
export const cyl = (rt, rb, h, n = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
export const cone = (r, h, n = 16) => new THREE.ConeGeometry(r, h, n);
export const torus = (R, r, n = 28, m = 10, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, m, n, arc);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/** 모서리가 둥근 상자 (작은 반지름은 상자 크기의 0~0.5) */
export function rbox(w, h, d, rad = 0.08, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position;
  const hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad, v = V(), c = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    v.sub(c);
    if (v.lengthSq() > 1e-9) v.setLength(rad);
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  return g;
}
/** 회전체: pts = [[반지름, 높이], ...] 아래→위 */
export const lathe = (pts, n = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), n);
/** 곡선 관: pts = [[x,y,z], ...] */
export const tube = (pts, r = 0.02, n = 24, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => V(...q))), n, r, rs, false);
/** 평평한 도형(앞뒤 두께 조금): pts = [[x,y], ...] 둘레 */
export function flat(pts, depth = 0.01, curve = true) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  if (curve && pts.length > 2) s.splineThru(pts.slice(1).concat([pts[0]]).map(([x, y]) => new THREE.Vector2(x, y)));
  else for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  const g = depth > 0 ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: depth * 0.6, bevelSegments: 2, curveSegments: 10 }) : new THREE.ShapeGeometry(s, 10);
  if (depth > 0) g.translate(0, 0, -depth / 2);
  return g;
}

/** 정점 색 칠하기: fn(x,y,z) → THREE.Color */
export function paint(geo, fn) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(fn(p.getX(i), p.getY(i), p.getZ(i), i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
export const C = (h) => new THREE.Color(h);
export const mixC = (a, b, t) => C(a).lerp(C(b), THREE.MathUtils.clamp(t, 0, 1));
export const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** 늘 같은 값이 나오는 난수 (아이콘이 구울 때마다 바뀌지 않게) */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const group = (...kids) => { const g = new THREE.Group(); for (const k of kids.flat()) if (k) g.add(k); return g; };

/** 작은 반짝이(별 모양 십자) — 황금·진주 같은 귀한 것 표시 */
export function sparkle(p = [0, 0, 0], s = 0.12, c = 0xfff4b0) {
  const m = mat(c, { emissive: c, ei: 0.9, rough: 0.4 });
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.22 : 1; pts.push([Math.cos(a) * r * s, Math.sin(a) * r * s]); }
  return mesh(flat(pts, s * 0.15, false), m, { p });
}

/** 아이콘 카메라 방향 (물체 → 카메라, 앞·오른쪽 조금·위 30도). 굽는 스크립트와 같은 값 */
export const ICON_VIEW = [0.32, 0.6, 1];
const VIEW = new THREE.Vector3(...ICON_VIEW).normalize();
const CAM_X = new THREE.Vector3(0, 1, 0).cross(VIEW).normalize(), CAM_Y = VIEW.clone().cross(CAM_X);
/**
 * 물체를 카메라 쪽으로 눕히고(face 0 = 그대로 ~ 1 = 등이 카메라를 정면으로) 머리(+x)가 화면에서 angle 방향(0 = 오른쪽, 90도 = 위)을 보게
 */
export function faceView(obj, face, angle) {
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const qa = new THREE.Quaternion().setFromUnitVectors(Y, Y.clone().lerp(VIEW, face).normalize());
  let best = 0, bestS = -Infinity;
  for (let d = 0; d < 360; d += 2) {
    const yaw = (d * Math.PI) / 180, h = X.clone().applyAxisAngle(Y, yaw).applyQuaternion(qa);
    const s = h.dot(CAM_X) * Math.cos(angle) + h.dot(CAM_Y) * Math.sin(angle);
    if (s > bestS) { bestS = s; best = yaw; }
  }
  obj.quaternion.copy(qa).multiply(new THREE.Quaternion().setFromAxisAngle(Y, best));
  return obj;
}
