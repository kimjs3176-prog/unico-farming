import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 수확물 모형 (머리 위로 번쩍 들어 보이는 당근·토마토 등)
 * 작물별로 한 번만 만들어 두고 수확마다 메시만 복제 (지오메트리·재질은 함께 씀 → 해제하지 않음)
 * 작물 GLB 는 정점 색 재질로 합쳐져 있으므로 같은 재질을 빌려 쓰고 색은 정점 색으로 (새 셰이더 없음, 그리기 1번)
 */
// 작물 GLB 의 재질 색 (선형 값)
const COLORS = {
  carrot: [0.888, 0.262, 0.021], leaf: [0.397, 0.631, 0.114], leaf_dark: [0.153, 0.497, 0.078],
  tomato: [0.807, 0.061, 0.044], corn: [0.913, 0.665, 0.068], cabbage: [0.323, 0.651, 0.147],
  cabbage_dark: [0.114, 0.392, 0.06], strawberry: [0.761, 0.044, 0.102],
};

/** 작물 GLB 에서 정점 색 재질 하나 빌리기 (없으면 새로) */
function vertexColorMaterial(assets) {
  let found = null;
  assets?.scenes?.get?.('crops')?.traverse?.((o) => {
    if (found || !o.isMesh || Array.isArray(o.material)) return;
    if (o.material?.isMeshStandardMaterial && o.material.vertexColors && !o.material.map && !o.material.transparent) found = o.material;
  });
  return found || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
}

/** 지오메트리에 단색 정점 색 입히기 (합치기 위해 위치·법선·색만 남김) */
function tint(geo, name) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const [r, gg, b] = COLORS[name] || [0.4, 0.6, 0.2], n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const leafStar = (r, n = 5) => { // 꼭지 (납작한 별)
  const parts = [];
  for (let k = 0; k < n; k++) {
    const c = new THREE.ConeGeometry(0.025, r, 3);
    c.rotateZ(Math.PI / 2).translate(r / 2, 0, 0).rotateY((k / n) * Math.PI * 2);
    parts.push(c);
  }
  return mergeGeometries(parts);
};

/** 작물별 [재질 이름, 지오메트리] 목록 (원점 = 수확물 가운데) */
function shapes(crop) {
  switch (crop) {
    case 'carrot': {
      const root = new THREE.ConeGeometry(0.085, 0.36, 10).rotateX(Math.PI).translate(0, -0.05, 0);
      const top = new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.13, 0);
      const leaves = [];
      for (let k = 0; k < 4; k++) { const l = new THREE.ConeGeometry(0.03, 0.26, 4); l.translate(0, 0.13, 0).rotateZ((k - 1.5) * 0.28).rotateY(k * 1.4).translate(0, 0.14, 0); leaves.push(l); }
      return [['carrot', mergeGeometries([root, top])], ['leaf', mergeGeometries(leaves)]];
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
  constructor(assets) { this.assets = assets; this.cache = new Map(); this.mat = null; }

  /** 작물 하나의 합친 지오메트리 (처음 한 번만 만듦) */
  geometry(crop) {
    let geo = this.cache.get(crop);
    if (!geo) { geo = mergeGeometries(shapes(crop).map(([name, g]) => tint(g, name))); this.cache.set(crop, geo); }
    return geo;
  }

  /** 수확물 하나 (공유 지오메트리·재질). 쓰고 나면 장면에서 빼기만 */
  make(crop) {
    this.mat ||= vertexColorMaterial(this.assets);
    const m = new THREE.Mesh(this.geometry(crop), this.mat);
    m.castShadow = false;
    return m;
  }
}
