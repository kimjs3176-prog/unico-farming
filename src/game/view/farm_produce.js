import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 수확물 모형 (머리 위로 번쩍 들어 보이는 당근·토마토 등)
 * 작물별로 한 번만 만들어 두고 수확마다 메시만 복제 (지오메트리·재질은 함께 씀 → 해제하지 않음)
 * 색은 정점 색, 재질은 수확물 전용 하나 (그리기 1번).
 * 작물 GLB 재질은 빌리지 않음: 꾸밈 셰이더(surface.js)의 '카메라 시선 구멍'이 머리 위 수확물 윗부분을 점점이 지워 버림
 */
// 작물 GLB 의 재질 색 (선형 값)
const COLORS = {
  carrot: [0.888, 0.262, 0.021], leaf: [0.397, 0.631, 0.114], leaf_dark: [0.153, 0.497, 0.078],
  tomato: [0.807, 0.061, 0.044], corn: [0.913, 0.665, 0.068], cabbage: [0.323, 0.651, 0.147],
  cabbage_dark: [0.114, 0.392, 0.06], strawberry: [0.761, 0.044, 0.102],
};

/** 수확물 전용 재질 (모든 작물이 함께 씀, 처음 수확 때 한 번 컴파일) */
let MAT = null;
export const produceMaterial = () => (MAT ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }));

/** 지오메트리에 정점 색 입히기 (합치기 위해 위치·법선·색만 남김). shade(y) 가 있으면 높이에 따라 밝기 */
function tint(geo, name, shade = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const [r, gg, b] = COLORS[name] || [0.4, 0.6, 0.2], pos = g.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = shade ? shade(pos.getY(i)) : 1; arr[i * 3] = r * k; arr[i * 3 + 1] = gg * k; arr[i * 3 + 2] = b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** 당근 뿌리 옆모습: 통통한 어깨(반지름 0.11) → 둥근 끝 */
const CARROT_PROFILE = [[0.0, -0.3], [0.018, -0.292], [0.032, -0.26], [0.05, -0.19], [0.07, -0.1], [0.09, -0.01], [0.105, 0.06], [0.11, 0.1], [0.1, 0.135], [0.07, 0.158], [0.0, 0.165]]
  .map(([x, y]) => new THREE.Vector2(x, y));

const leafStar = (r, n = 5) => { // 꼭지 (납작한 별)
  const parts = [];
  for (let k = 0; k < n; k++) {
    const c = new THREE.ConeGeometry(0.025, r, 3);
    c.rotateZ(Math.PI / 2).translate(r / 2, 0, 0).rotateY((k / n) * Math.PI * 2);
    parts.push(c);
  }
  return mergeGeometries(parts);
};

/** 작물별 [재질 이름, 지오메트리, 높이별 밝기?] 목록 (원점 = 수확물 가운데) */
function shapes(crop) {
  switch (crop) {
    case 'carrot': {
      const root = new THREE.LatheGeometry(CARROT_PROFILE, 12);
      const leaves = [];
      for (let k = 0; k < 5; k++) { const l = new THREE.ConeGeometry(0.035, 0.28, 4); l.translate(0, 0.14, 0).rotateZ((k - 2) * 0.26).rotateY(k * 1.26).translate(0, 0.15, 0); leaves.push(l); }
      // 끝으로 갈수록 진한 주황 (평평한 조명에서도 모양이 읽힘)
      return [['carrot', root, (y) => 0.55 + 0.45 * THREE.MathUtils.smoothstep(y, -0.3, 0.1)], ['leaf', mergeGeometries(leaves)]];
    }
    case 'tomato':
      return [['tomato', new THREE.SphereGeometry(0.14, 14, 10).scale(1, 0.82, 1)], ['leaf_dark', leafStar(0.09).translate(0, 0.115, 0)]];
    case 'corn': {
      const cob = new THREE.CapsuleGeometry(0.075, 0.2, 4, 10);
      const husk = [];
      for (let k = 0; k < 3; k++) { const h = new THREE.ConeGeometry(0.06, 0.3, 4).scale(1, 1, 0.35); h.translate(0, 0.02, 0.06).rotateY((k / 3) * Math.PI * 2); husk.push(h); }
      return [['corn', cob], ['leaf', mergeGeometries(husk).translate(0, -0.08, 0)]];
    }
    case 'cabbage': {
      const outer = [];
      for (let k = 0; k < 4; k++) outer.push(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.6).scale(1, 0.8, 0.55).rotateX(-0.35).translate(0, -0.02, 0.06).rotateY((k / 4) * Math.PI * 2));
      return [['cabbage', new THREE.SphereGeometry(0.14, 14, 10).scale(1, 0.9, 1)], ['cabbage_dark', mergeGeometries(outer)]];
    }
    case 'strawberry': {
      const body = mergeGeometries([new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), new THREE.ConeGeometry(0.1, 0.2, 12, 1, true).rotateX(Math.PI).translate(0, -0.1, 0)]);
      return [['strawberry', body], ['leaf_dark', leafStar(0.08).translate(0, 0.06, 0)]];
    }
    default:
      return [['leaf', new THREE.SphereGeometry(0.12, 10, 8)]];
  }
}

export class ProduceFactory {
  constructor(assets) { this.assets = assets; this.cache = new Map(); }

  /** 작물 하나의 합친 지오메트리 (처음 한 번만 만듦) */
  geometry(crop) {
    let geo = this.cache.get(crop);
    if (!geo) { geo = mergeGeometries(shapes(crop).map(([name, g, shade]) => tint(g, name, shade))); this.cache.set(crop, geo); }
    return geo;
  }

  /** 수확물 하나 (공유 지오메트리·재질). 쓰고 나면 장면에서 빼기만 */
  make(crop) {
    const m = new THREE.Mesh(this.geometry(crop), produceMaterial());
    m.castShadow = false;
    return m;
  }
}
