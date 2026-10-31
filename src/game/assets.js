import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** 블렌더에서 생성한 GLB 목록 (public/models) */
export const ENV_MODELS = [
  'tree', 'pine', 'bush', 'rock', 'flowers', 'hay_bale', 'fence', 'barn', 'silo', 'windmill', 'smartfarm',
  'market', 'well', 'sign', 'coop', 'trough', 'plot', 'crops', 'cow', 'chicken', 'sheep', 'tractor', 'drone', 'wheelbarrow',
];
/** 원본 마스코트 벡터를 고해상도 투명 PNG 로 래스터한 유니코 포즈 (public/sprites) */
export const UNICO_POSES = ['idle', 'front', 'side', 'back', 'water', 'tablet', 'safety', 'cheer', 'heart', 'wave', 'think', 'lab', 'present', 'megaphone'];
export const UNICO_HEIGHT = 2.0; // 캐릭터 키(m), 여백 제외
const SPRITE_MARGIN = 0.03 / 1.06; // render_character_sprites.py 의 MARGIN 비율 (상하 여백)

const ROOT = import.meta.env?.BASE_URL || '/';
const BASE = ROOT + 'models/';
const SPRITES = ROOT + 'sprites/';

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.scenes = new Map();
    this.sprites = new Map(); // pose -> { texture, aspect }
    this.maxAniso = 8;
  }

  async loadAll(onProgress) {
    const names = [...ENV_MODELS];
    const total = names.length + UNICO_POSES.length + 1;
    let done = 0;
    const tick = () => { done++; onProgress?.(done / total); };
    const spriteJob = (async () => {
      let meta = {};
      try { meta = await (await fetch(`${SPRITES}unico_sprites.json`)).json(); } catch (e) { console.warn('스프라이트 메타 로드 실패', e); }
      tick();
      await Promise.all(UNICO_POSES.map(async (p) => {
        try {
          const tex = await this.texLoader.loadAsync(`${SPRITES}unico_${p}.png`);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.anisotropy = this.maxAniso;
          this.sprites.set(p, { texture: tex, aspect: meta[p]?.aspect ?? tex.image.width / tex.image.height });
        } catch (e) { console.warn('스프라이트 로드 실패', p, e?.message || e); }
        tick();
      }));
    })();
    await Promise.all([
      spriteJob,
      ...names.map(async (n) => {
        try {
          const gltf = await this.loader.loadAsync(`${BASE}${n}.glb`);
          prepare(gltf.scene, n);
          this.scenes.set(n, gltf.scene);
        } catch (e) {
          console.warn('모델 로드 실패, 대체 박스 사용:', n, e?.message || e);
          this.scenes.set(n, fallbackBox(n));
        }
        tick();
      }),
    ]);
  }

  /**
   * 유니코 포즈 스프라이트 평면 (발이 y=0, 가로 중앙). 캐릭터 키 UNICO_HEIGHT.
   * - 색은 원본 그대로(unlit, 톤매핑 제외), 알파 테스트로 깊이 정렬, 실루엣 그림자(customDepthMaterial)
   */
  makeUnicoSprite(pose) {
    const s = this.sprites.get(pose);
    if (!s) { const g = new THREE.Group(); g.visible = false; return g; }
    const H = UNICO_HEIGHT / (1 - 2 * SPRITE_MARGIN);
    const W = H * s.aspect;
    const geo = new THREE.PlaneGeometry(W, H);
    geo.translate(0, H / 2 - H * SPRITE_MARGIN, 0);
    const mat = new THREE.MeshBasicMaterial({ map: s.texture, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: s.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    mesh.name = `unico_${pose}`;
    return mesh;
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
}

function fallbackBox(name) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  mesh.position.y = 0.5;
  mesh.name = name;
  g.add(mesh);
  return g;
}
