import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadUnicoMesh } from './unico.js';
import { enhanceMaterial } from './surface.js';

/** 블렌더에서 생성한 환경 GLB 목록 (public/models). 캐릭터 유니코는 src/game/unico.js 에서 코드로 생성 */
export const ENV_MODELS = [
  'tree', 'pine', 'bush', 'rock', 'flowers', 'hay_bale', 'fence', 'barn', 'silo', 'windmill', 'smartfarm',
  'market', 'well', 'sign', 'coop', 'trough', 'plot', 'crops', 'cow', 'chicken', 'sheep', 'tractor', 'drone', 'wheelbarrow', 'cloud',
  'crate', 'barrel', 'lamp', 'bench', 'mailbox', 'scarecrow', 'thresher', 'dock', 'planter', 'fruit_tree', 'koat_hq', 'booth',
];

const BASE = (import.meta.env?.BASE_URL || '/') + 'models/';

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.scenes = new Map();
  }

  async loadAll(onProgress) {
    let done = 0;
    await Promise.all([
      loadUnicoMesh(`${BASE}unico_body.bin`, 'quad').then(() => { done++; onProgress?.(done / (ENV_MODELS.length + 2)); }),
      loadUnicoMesh(`${BASE}unico_biped.bin`, 'biped').then(() => { done++; onProgress?.(done / (ENV_MODELS.length + 2)); }),
      ...ENV_MODELS.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          prepare(gltf.scene);
          this.scenes.set(n, gltf.scene);
        } catch (e) {
          console.warn('모델 로드 실패, 대체 박스 사용:', n, e?.message || e);
          this.scenes.set(n, fallbackBox(n));
        }
        done++;
        onProgress?.(done / (ENV_MODELS.length + 2));
      }),
    ]);
  }

  /** 모델 복제 (지오메트리/머티리얼은 공유) */
  clone(name) {
    const src = this.scenes.get(name);
    if (!src) throw new Error('unknown model ' + name);
    const c = src.clone(true);
    c.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return c;
  }

  /** crops.glb 안의 crop_<type>_<stage> 노드 복제 */
  cloneCrop(type, stage) {
    const src = this.scenes.get('crops');
    const node = src.getObjectByName(`crop_${type}_${stage}`);
    if (!node) return new THREE.Group();
    const c = node.clone(true);
    c.position.set(0, 0, 0);
    c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return c;
  }
}

function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m) {
      // 캐주얼 플랫 룩: 거칠기 높게, 금속성 제거
      m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
      m.metalness = 0;
      if (m.transparent) m.depthWrite = false;
      const glows = m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
      if (glows) m.toneMapped = false;
      else enhanceMaterial(m);
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

function fallbackBox(name) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  mesh.position.y = 0.5;
  mesh.name = name;
  g.add(mesh);
  return g;
}
