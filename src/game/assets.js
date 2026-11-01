import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadUnicoMesh } from './unico.js';
import { enhanceMaterial } from './surface.js';

/** 블렌더에서 생성한 환경 GLB 목록 (public/models). 캐릭터 유니코는 src/game/unico.js 에서 코드로 생성 */
export const ENV_MODELS = [
  'tree', 'pine', 'bush', 'rock', 'flowers', 'hay_bale', 'fence', 'smartfarm',
  'market', 'sign', 'trough', 'plot', 'crops', 'hen', 'tractor', 'drone', 'wheelbarrow', 'cloud',
  'crate', 'barrel', 'lamp', 'bench', 'mailbox', 'scarecrow', 'thresher', 'dock', 'planter', 'fruit_tree', 'koat_hq', 'booth',
];

/**
 * CC0 외부 에셋 묶음 (Quaternius, docs/ASSETS_CC0.md). 한 GLB 안의 최상위 노드 하나하나가 모델 이름이 된다.
 * q_farm: barn, silo, windmill, well, coop, water_tower, open_barn, tower_windmill ...
 * q_nature: tree_1~5, pine_1~3, birch_1~3, willow_1~2, autumn_1~3, bush_1~2, rock_1~4, mossrock_1~4, stump, log ...
 */
export const PACK_MODELS = ['q_farm', 'q_nature'];
/** 뼈대 애니메이션이 있는 CC0 동물 (walk/idle/eat/look/run/jump) */
export const ANIMATED_MODELS = ['q_cow', 'q_sheep', 'q_horse', 'q_donkey', 'q_alpaca', 'q_shiba'];

const BASE = (import.meta.env?.BASE_URL || '/') + 'models/';

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.scenes = new Map();
    this.anims = new Map();
  }

  async loadAll(onProgress) {
    let done = 0;
    const total = ENV_MODELS.length + PACK_MODELS.length + ANIMATED_MODELS.length + 2;
    const tick = () => { done++; onProgress?.(done / total); };
    await Promise.all([
      loadUnicoMesh(`${BASE}unico_body.bin`, 'quad').then(tick),
      loadUnicoMesh(`${BASE}unico_biped.bin`, 'biped').then(tick),
      ...PACK_MODELS.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          for (const node of [...gltf.scene.children]) {
            const g = new THREE.Group();
            g.name = node.name;
            node.position.set(0, 0, 0);
            g.add(node);
            prepare(g);
            this.scenes.set(node.name, g);
          }
        } catch (e) {
          console.warn('묶음 모델 로드 실패:', n, e?.message || e);
        }
        tick();
      }),
      ...ANIMATED_MODELS.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          prepare(gltf.scene, { fur: true, spots: n === 'q_cow' ? 'Main' : null }); // 젖소: 얼룩무늬 (양은 털 질감)
          this.scenes.set(n, gltf.scene);
          this.anims.set(n, gltf.animations);
        } catch (e) {
          console.warn('동물 모델 로드 실패:', n, e?.message || e);
          this.scenes.set(n, fallbackBox(n));
          this.anims.set(n, []);
        }
        tick();
      }),
      ...ENV_MODELS.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          prepare(gltf.scene);
          this.scenes.set(n, gltf.scene);
        } catch (e) {
          console.warn('모델 로드 실패, 대체 박스 사용:', n, e?.message || e);
          this.scenes.set(n, fallbackBox(n));
        }
        tick();
      }),
    ]);
  }

  has(name) { return this.scenes.has(name); }

  /** 뼈대 애니메이션 모델 복제 → { root, mixer, clips } */
  cloneAnimated(name) {
    const root = SkeletonUtils.clone(this.scenes.get(name));
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(root);
    const clips = Object.fromEntries((this.anims.get(name) || []).map((c) => [c.name, c]));
    return { root, mixer, clips };
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

function prepare(scene, { fur = false, spots = null } = {}) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.isSkinnedMesh) dequantize(o.geometry);
    const m = o.material;
    if (m) {
      // 캐주얼 플랫 룩: 거칠기 높게, 금속성 제거
      m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
      m.metalness = 0;
      if (m.transparent) m.depthWrite = false;
      const glows = m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
      if (glows) m.toneMapped = false;
      else enhanceMaterial(m, fur ? 'fur' : undefined, fur ? { contact: false, rim: 0.18, spots: m.name === spots ? 2.6 : 0 } : undefined);
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

/** meshopt 양자화(Int16 정규화) 속성을 Float32 로 풀기 — 정적 병합(applyMatrix4/merge)과 호환 */
function dequantize(geo) {
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k];
    if (!a || a.array instanceof Float32Array) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) out[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
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
