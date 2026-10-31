import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** 블렌더에서 생성한 GLB 목록 (public/models) */
export const ENV_MODELS = [
  'tree', 'pine', 'bush', 'rock', 'flowers', 'hay_bale', 'fence', 'barn', 'silo', 'windmill', 'smartfarm',
  'market', 'well', 'sign', 'coop', 'trough', 'plot', 'crops', 'cow', 'chicken', 'sheep', 'tractor', 'drone', 'wheelbarrow',
];
/** 원본 마스코트 벡터를 입체화한 유니코 포즈 */
export const UNICO_POSES = ['idle', 'front', 'side', 'back', 'water', 'tablet', 'safety', 'cheer', 'heart', 'wave', 'think', 'lab', 'present', 'megaphone'];

const BASE = (import.meta.env?.BASE_URL || '/') + 'models/';

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.scenes = new Map();
  }

  async loadAll(onProgress) {
    const names = [...ENV_MODELS, ...UNICO_POSES.map((p) => `unico_${p}`)];
    let done = 0;
    await Promise.all(
      names.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          prepare(gltf.scene, n);
          this.scenes.set(n, gltf.scene);
        } catch (e) {
          console.warn('모델 로드 실패, 대체 박스 사용:', n, e?.message || e);
          this.scenes.set(n, fallbackBox(n));
        }
        done++;
        onProgress?.(done / names.length);
      }),
    );
  }

  /** 모델 복제 (지오메트리/머티리얼은 공유) */
  clone(name) {
    const src = this.scenes.get(name);
    if (!src) throw new Error('unknown model ' + name);
    const c = src.clone(true);
    c.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = src.userData.castShadow !== false;
        o.receiveShadow = !src.userData.noReceive;
      }
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
    c.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return c;
  }
}

function prepare(scene, name) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m) {
      // 캐주얼 플랫 룩: 거칠기 높게, 금속성 제거
      m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
      m.metallic = 0;
      if (m.transparent) m.depthWrite = false;
      if (m.emissive && m.emissiveIntensity > 0) m.toneMapped = false;
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
  if (name.startsWith('unico_')) {
    // 릴리프 캐릭터는 양면 렌더 (얇은 조각 뒷면 깨짐 방지)
    scene.traverse((o) => {
      if (o.isMesh) {
        // 원본 일러스트 색을 또렷하게: 자체 발광을 섞어 조명 각도와 무관하게 밝게 (플랫 룩)
        const m = o.material.clone();
        m.side = THREE.DoubleSide;
        m.emissive = m.color.clone();
        m.emissiveIntensity = 0.55;
        m.roughness = 1;
        o.material = m;
        o.receiveShadow = false;
      }
    });
    scene.userData.noReceive = true;
  }
}

function fallbackBox(name) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  mesh.position.y = 0.5;
  mesh.name = name;
  g.add(mesh);
  return g;
}
