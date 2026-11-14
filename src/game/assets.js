import { fetchModel } from './fetch_gz.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadUnicoMesh, prebuildTemplates } from './unico.js';
import { SPECIES_IDS } from './species.js';
import { loadSettings, resolveQuality } from './quality.js';
import { enhanceMaterial, kindOf } from './surface.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 부품이 많은 움직이는 모델: 같은 부모 아래 같은 질감 종류의 부품을 정점 색으로 합쳐 그리기 횟수 감소 */
const MERGE_PARTS = new Set(['hen', 'tractor', 'booth', 'koat_hq', 'drone', 'planter', 'thresher', 'smartfarm', 'crops']);
/** 작거나 멀리 보이는 모델: 질감 종류와 관계없이 부모별로 한 덩어리 (가장 큰 부품의 재질 질감을 따름) */
const MERGE_LOOSE = new Set(['hen', 'drone', 'planter', 'booth', 'crops']);
/** 코드가 이름으로 찾아 따로 움직이거나 색을 바꾸는 부품 — 합치지 않음 */
const KEEP_PART = /^(SignBoard|RoofTint|SensorPole|Canopy|Fruit|Blades|Rotor|Wheel|Steer|Plow|Drum)/;

/** 블렌더에서 생성한 환경 GLB 목록 (public/models). 캐릭터 유니코는 src/game/unico.js 에서 코드로 생성 */
export const ENV_MODELS = [
  'tree', 'pine', 'bush', 'rock', 'flowers', 'hay_bale', 'fence', 'smartfarm',
  'market', 'sign', 'trough', 'plot', 'crops', 'hen', 'crow', 'beehive', 'tractor', 'drone', 'wheelbarrow', 'cloud',
  'crate', 'barrel', 'lamp', 'bench', 'mailbox', 'scarecrow', 'thresher', 'dock', 'planter', 'fruit_tree', 'koat_hq', 'booth',
];

/**
 * CC0 외부 에셋 묶음 (Quaternius, docs/ASSETS_CC0.md). 한 GLB 안의 최상위 노드 하나하나가 모델 이름이 된다.
 * q_farm: barn, silo, windmill, well, coop, water_tower, open_barn, tower_windmill ...
 * q_nature: tree_1~5, pine_1~3, birch_1~3, willow_1~2, autumn_1~3, bush_1~2, rock_1~4, mossrock_1~4, stump, log ...
 */
export const PACK_MODELS = ['q_farm', 'q_nature', 'k_props']; // k_props: KayKit 소품 (CC0, 건설 비계·자재·통·상자)
/** 묶음 안에 있지만 게임에서 쓰지 않는 노드: 받은 뒤 바로 버림 (좌표 풀기·재질 손질·메모리 절약) */
const UNUSED_PACK_NODE = /^(snowpine_\d|snowtree_\d|corn_\d|wheat|grass_short)$/;
/** 뼈대 애니메이션이 있는 CC0 동물 (walk/idle/eat/look/run/jump) — 첫 화면에 필요한 것만 */
export const ANIMATED_MODELS = ['q_cow', 'q_sheep', 'q_shiba'];
/**
 * 첫 화면에 필요 없는 동물: 입장 뒤 뒤에서 받음 (먼저 받은 순서대로 쓰임)
 *  1) 목장 구경 동물(말·당나귀·알파카): ranch_view.js addVisitors() 가 도착한 것부터 풀어 놓음
 *  2) 밤에만 나오는 늑대·여우: pests.js 가 assets.has() 로 확인
 */
export const DEFERRED_MODELS = [['q_horse', 'q_donkey', 'q_alpaca'], ['q_wolf', 'q_fox']];
/** 뼈대 동물 컬링 구 여유 배율: 걷기·뛰기·풀 뜯기 동작이 기본 자세 구 밖으로 나가지 않게 */
const SKIN_SPHERE_PAD = 1.5;

const BASE = (import.meta.env?.BASE_URL || '/') + 'models/';

// 캐릭터 몸 메시 받는 순서 (UNC2 bin): 첫 화면은 저해상도(LOD) 전부 + 주인공 + 인트로 화자(안내 강아지)·스폰 근처를 돌아다니는 꼬마 토끼 원본
// 품질 낮음(휴대폰)은 주민이 9m 안에서만 원본 몸이라 따라가기 카메라에선 늘 저해상도 → 꼬마 토끼 원본도 나중에 (맨 먼저)
const BLOCKING_FULL = ['puppy', 'rabbit'];
const LATE_RABBIT = { file: 'villager_rabbit.bin', key: 'v_rabbit', x: -6, z: 5, first: true };
/** 지금 품질이 낮음인지 (저장 설정·주소 ?quality=, 자동이면 기기 — Game 생성 전에 판단) */
function lowQuality() {
  try { return resolveQuality(loadSettings()).level === 'low'; } catch { return false; }
}
/** 나중에 받는 원본 (닉네임 고르는 동안, 플레이어 위치에서 가까운 순): 그 전에는 저해상도 몸으로 보이다가 화면 밖에서 바뀜 */
const DEFERRED_SKINS = [
  { file: 'villager_fox.bin', key: 'v_fox', x: 3.2, z: -8.4 },
  { file: 'villager_raccoon.bin', key: 'v_raccoon', x: -14.5, z: -3.5 },
  { file: 'villager_cat.bin', key: 'v_cat', x: -5.2, z: 27.4 },
  { file: 'villager_bear.bin', key: 'v_bear', x: -9.6, z: -19.4 },
  { file: 'unico_body.bin', key: 'quad', x: 25, z: -24 }, // KOAT 담당 유니콘 (네 발 원본)
];
/** 한가할 때까지 기다림 (풀기·색 만들기가 한 프레임에 몰리지 않게) */
const idle = () => new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 50 }) : setTimeout(r, 0)));
/** 잠깐 쉼 (노드 테스트에서는 프로세스를 붙잡지 않게) */
const pause = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t?.unref?.(); });

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.scenes = new Map();
    this.anims = new Map();
  }

  /** GLB 받기 (배포 빌드는 .gz 로 받아 풂) → 해석 */
  async loadGlb(n) {
    const buf = await fetchModel(`${BASE}${n}.glb`);
    return this.loader.parseAsync(buf, BASE);
  }

  async loadAll(onProgress) {
    let done = 0;
    // 주민 동물: LOD 6종 + 원본 2종(낮음은 1종). 실패해도 게임은 계속 (그 주민은 예전 유니콘으로 대체)
    this._lateRabbit = lowQuality();
    const full = this._lateRabbit ? BLOCKING_FULL.filter((sp) => sp !== 'rabbit') : BLOCKING_FULL;
    const villagers = [...SPECIES_IDS.map((sp) => [`villager_${sp}_lod.bin`, `v_${sp}_lod`]), ...full.map((sp) => [`villager_${sp}.bin`, `v_${sp}`])];
    const total = ENV_MODELS.length + PACK_MODELS.length + ANIMATED_MODELS.length + 3 + villagers.length;
    const tick = () => { done++; onProgress?.(done / total); };
    await Promise.all([
      // 네 발 유니콘(KOAT 담당) 원본은 나중에 (loadDeferred) — 그때까지 저해상도 몸
      loadUnicoMesh(`${BASE}unico_body_lod.bin`, 'quad_lod').then(tick),
      loadUnicoMesh(`${BASE}unico_biped.bin`, 'biped').then(tick),
      loadUnicoMesh(`${BASE}unico_biped_lod.bin`, 'biped_lod').catch(() => {}).then(tick),
      ...villagers.map(([f, key]) => loadUnicoMesh(BASE + f, key).catch((e) => console.warn('주민 메시 로드 실패 (유니콘으로 대체):', f, e?.message || e)).then(tick)),
      ...PACK_MODELS.map(async (n) => {
        try {
          const gltf = await this.loadGlb(n);
          for (const node of [...gltf.scene.children]) {
            if (UNUSED_PACK_NODE.test(node.name)) continue;
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
        await this._loadAnimated(n, true);
        tick();
      }),
      ...ENV_MODELS.map(async (n) => {
        try {
          const gltf = await this.loadGlb(n);
          gltf.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) dequantize(o.geometry); }); // 합치기 전에 압축 좌표 풀기
          if (MERGE_PARTS.has(n)) mergeSiblings(gltf.scene, MERGE_LOOSE.has(n));
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

  /**
   * 첫 화면에 필요 없는 모델을 뒤에서 받기 (여러 번 불러도 한 번만, 묶음 순서대로). 끝나면 deferredDone = true.
   * 실패한 모델은 has() 가 false 로 남아 쓰는 쪽이 건너뜀. DEFERRED_MODELS 는 이름 목록 또는 묶음([[...], [...]]) 목록 둘 다 받음.
   * 캐릭터 원본 몸(주민·KOAT 네 발)은 따로 나란히 받음 — 동물 모델의 완료(deferredDone)·셰이더 준비를 늦추지 않게
   * @param playerPos 저장된 위치 (없으면 스폰) — 캐릭터 원본 몸은 가까운 주민부터. 처음 부른 값이 쓰임
   */
  loadDeferred(playerPos) {
    // 얼굴·옷 템플릿은 닉네임을 고르는 동안 한가할 때 미리 (입장 때 Game 생성자가 멈추지 않게) — 원본 몸을 받는 동안
    this._deferredSkins ||= this._loadDeferredSkins(playerPos, prebuildTemplates(idle).catch(() => {})).catch(() => {});
    this._deferred ||= (async () => {
      const waves = DEFERRED_MODELS.some(Array.isArray) ? DEFERRED_MODELS : [DEFERRED_MODELS];
      for (const wave of waves) await Promise.all(wave.map((n) => this._loadAnimated(n, false)));
      this.deferredDone = true;
    })();
    return this._deferred;
  }

  /**
   * 캐릭터 원본 몸: 받기는 한꺼번에 나란히 시작(파일마다 60~90KB, 닉네임 고르는 동안 망이 비어 있음),
   * 풀기·색 만들기는 가까운 주민부터 하나씩 한가할 때 (한 프레임에 몰리지 않게). 실패하면 3초 뒤 한 번 더, 그래도 안 되면 저해상도 유지
   */
  async _loadDeferredSkins(playerPos, before = null) {
    const at = playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z) ? playerPos : { x: 0, z: 9 };
    const list = [...DEFERRED_SKINS, ...(this._lateRabbit ? [LATE_RABBIT] : [])]
      .sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
    const got = list.map((s) => { const p = fetchModel(BASE + s.file); p.catch(() => {}); return p; });
    await before; // 템플릿 미리 만들기가 먼저 (받는 동안)
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      await idle();
      try { await loadUnicoMesh(BASE + s.file, s.key, { yieldTo: idle, data: got[i] }); } catch {
        await pause(3000);
        try { await loadUnicoMesh(BASE + s.file, s.key, { yieldTo: idle }); } catch (e) { console.warn('캐릭터 원본 몸 로드 실패 (저해상도 유지):', s.file, e?.message || e); }
      }
    }
    this.skinsDone = true;
  }

  async _loadAnimated(n, fallback) {
    try {
      const gltf = await this.loadGlb(n);
      prepare(gltf.scene, { fur: true, spots: n === 'q_cow' ? 'Main' : null }); // 젖소: 얼룩무늬 (양은 털 질감)
      skinSpheres(gltf.scene);
      this.anims.set(n, gltf.animations);
      this.scenes.set(n, gltf.scene);
    } catch (e) {
      console.warn('동물 모델 로드 실패:', n, e?.message || e);
      if (!fallback) return;
      this.anims.set(n, []);
      this.scenes.set(n, fallbackBox(n));
    }
  }

  has(name) { return this.scenes.has(name); }

  /**
   * 뼈대 애니메이션 모델 복제 → { root, mixer, clips }
   * 화면·그림자 상자 밖이면 그리지 않음: 뼈대 메시는 받을 때 넉넉히 잡아 둔 컬링 구(skinSpheres)를 복제본이 그대로 씀
   */
  cloneAnimated(name) {
    const root = SkeletonUtils.clone(this.scenes.get(name));
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = !o.isSkinnedMesh || !!o.boundingSphere; } });
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
    c.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // 작물은 작고 많아서 그림자 생략 (접지 AO 로 충분)
    return c;
  }
}

/**
 * 뼈대 메시 컬링 구: 기본 자세로 정점 위치를 계산해 구를 잡고 SKIN_SPHERE_PAD 배 넓힘.
 * three 는 뼈대 메시의 구를 지오메트리가 아니라 메시 객체(boundingSphere)에서 읽음. 뼈 행렬이 먼저 갱신돼야 함
 */
export function skinSpheres(scene, pad = SKIN_SPHERE_PAD) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    o.computeBoundingSphere();
    o.boundingSphere.radius *= pad;
  });
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

/**
 * 같은 부모 아래 단색 메시들을 (질감 종류·거칠기)별로 묶어 하나의 정점 색 메시로 합침.
 * 이름으로 쓰이는 부품(KEEP_PART)과 그 하위, 발광·투명·텍스처 재질은 그대로 둠.
 */
export function mergeSiblings(root, loose = false) {
  const keep = (o) => { for (let p = o; p && p !== root; p = p.parent) if (KEEP_PART.test(p.name)) return true; return false; };
  const parents = new Set();
  root.traverse((o) => { if (o.isMesh && o.parent) parents.add(o.parent); });
  let merged = 0;
  for (const parent of parents) {
    const buckets = new Map();
    for (const c of parent.children) {
      const m = c.material;
      if (!c.isMesh || c.isSkinnedMesh || c.children.length || keep(c) || !m?.isMeshStandardMaterial || m.map || m.transparent || m.vertexColors) continue;
      if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) continue;
      const key = loose ? `${m.side}` : `${kindOf(m.name)}|${(m.roughness ?? 1).toFixed(1)}|${(m.metalness ?? 0).toFixed(1)}|${m.side}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((c) => {
        c.updateMatrix();
        let g = c.geometry.clone().applyMatrix4(c.matrix);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        // 인덱스는 그대로 둠 (공유 정점 재사용). 법선이 없으면 면마다 각진 법선, 인덱스가 없으면 순번 인덱스 (한 묶음 안 모두 인덱스여야 합쳐짐)
        if (!g.attributes.normal) { if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); }
        if (!g.index) g.setIndex(seqIndex(g.attributes.position.count));
        const col = c.material.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return g;
      });
      const geo = mergeGeometries(geos, false);
      if (!geo) continue;
      const main = list.reduce((a, c) => (c.geometry.attributes.position.count > a.geometry.attributes.position.count ? c : a));
      const mat = main.material.clone();
      mat.color.set(0xffffff);
      mat.vertexColors = true;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${main.name}_merged`;
      for (const c of list) parent.remove(c);
      parent.add(mesh);
      merged += list.length - 1;
    }
  }
  return merged;
}

/** 0..n-1 순번 인덱스 */
function seqIndex(n) {
  const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return new THREE.BufferAttribute(a, 1);
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
