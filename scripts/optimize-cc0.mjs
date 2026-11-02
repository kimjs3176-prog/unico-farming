// CC0 외부 에셋(Quaternius) 후처리: 재질 이름·색을 게임 팔레트로 맞추고, 애니메이션 정리, meshopt 압축
// 사용: node scripts/optimize-cc0.mjs <blender/import_cc0.py 출력 폴더> <애니메이션 glTF 폴더>
// 결과: public/models/q_*.glb  (라이선스: docs/ASSETS_CC0.md)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt, weld, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [RAW, ANIM] = process.argv.slice(2);
const OUT = path.resolve('public/models');

// 원본 재질 이름 → [게임 재질 이름(표면 질감 종류를 결정, src/game/surface.js kindOf), sRGB 색]
const BUILDING = {
  LightRed: ['barn_red', '#d65a4a'], DarkRed: ['barn_red_dark', '#a8443a'], RoofBlack: ['roof_slate', '#7b6f66'],
  White: ['cream', '#f4ecdc'], Brown: ['wood', '#a8743f'], LightBrown: ['wood', '#a8743f'], DarkBrown: ['wood_dark', '#6e4a2c'],
  Grey: ['stone', '#a9aaa6'], DarkGrey: ['stone_dark', '#6f7273'], Black: ['iron_dark', '#3b3f42'],
};
const NATURE = {
  Green: ['leaf', '#7dbf4b'], DarkGreen: ['leaf_dark', '#4f9338'], Wood: ['wood_dark', '#77502f'], LightWood: ['wood', '#b98a58'],
  Rock: ['stone', '#a3a6a8'], White: ['birch_bark', '#ebe6d6'], Black: ['bark_mark', '#3d3a36'], Berry: ['berry', '#d9384c'],
  Yellow: ['petal_yellow', '#f4c64a'], Cyan: ['petal_blue', '#79c9ee'], Pink: ['petal_pink', '#f39cc4'],
  Leaves: ['leaf', '#7dbf4b'], Orange: ['leaf_autumn', '#ef9a3c'], LightOrange: ['leaf_autumn_light', '#f6c35a'],
  Snow: ['snow', '#f6faff'], Mushroom_Top: ['mushroom_cap', '#d9534f'], Mushroom_Bottom: ['cream', '#f4ecdc'],
};
// 노드별 예외 (같은 'Green' 이라도 바위 이끼·연잎은 바람에 흔들리지 않게)
const NODE_OVERRIDE = [
  [/^(mossrock|stump_moss|log_moss)/, { Green: ['moss', '#83b552'] }],
  [/^lilypad/, { Green: ['lily_pad', '#6fb04a'] }],
];

// 애니메이션 동물: 파일 → { 게임 이름, 배율, 남길 동작(원본→게임 이름), 재질 색 }
const ANIMALS = {
  'Horse.gltf': { name: 'q_horse', scale: 0.36, colors: { Main: '#b8743f', Main_Dark: '#6a4024', Hair: '#3a2a20', Main_Light: '#f1e2c8' } },
  'Donkey.gltf': { name: 'q_donkey', scale: 0.33, colors: {} },
  'Alpaca.gltf': { name: 'q_alpaca', scale: 0.3, colors: { Main: '#f3e6cf', Main_Light: '#fff8ea', Main_Dark: '#8f6a4c' } },
  'ShibaInu.gltf': { name: 'q_shiba', scale: 0.2, colors: { Main: '#e39a4a', Main_Light: '#fff3e2' } },
  // 농장 팩 양: 걷기 동작이 없어 같은 뼈대의 농장 팩 소 걷기(회전만)를 빌려 옴
  'farm_sheep.glb': { name: 'q_sheep', scale: 0.25, colors: { White: '#f7f2e8', Black: '#34302d' }, borrow: { file: 'farm_cow.glb', clips: { Walk: 'walk' } } },
  // 밤에 목장·밭을 노리는 동물 (쫓아내기)
  'Wolf.gltf': { name: 'q_wolf', scale: 0.26, colors: { Main: '#8a8f99', Main_Light: '#d9dce0' } },
  'Fox.gltf': { name: 'q_fox', scale: 0.18, colors: {} },
  'Cow.gltf': { name: 'q_cow', scale: 0.3, colors: { Main: '#fbf7ef', Main_Light: '#3b3533', Muzzle: '#f2b0b8', Eye_White: '#ffffff' } },
};
// 게임에서 쓰는 동작만 남김 (용량 절약). 반려견만 달리기·앉기 사용
const USE = { default: ['walk', 'idle', 'eat', 'look'], q_sheep: ['walk', 'idle'], q_wolf: ['walk', 'idle', 'run', 'look', 'attack'], q_fox: ['walk', 'idle', 'run', 'look', 'attack'], q_shiba: ['walk', 'idle', 'idle2', 'look', 'run', 'eat', 'jump'] };
const CLIPS = { Attack: 'attack', Walk: 'walk', Idle: 'idle', Idle_2: 'idle2', Eating: 'eat', Idle_Headlow: 'look', Idle_2_HeadLow: 'look', Gallop: 'run', Jump_toIdle: 'jump', Jump_ToIdle: 'jump' };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); };

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function remapStatic(doc, table) {
  const root = doc.getRoot();
  const made = new Map();
  const matFor = (orig, map) => {
    const key = orig.getName().replace(/\.\d+$/, ''); // Blender 가 붙인 .001 접미사 제거
    const src = map[key] || table[key];
    if (!src) { console.warn('  색 매핑 없음:', key); return orig.setAlphaMode('OPAQUE').setAlpha(1); }
    const [name, col] = src;
    if (!made.has(name)) made.set(name, doc.createMaterial(name).setBaseColorFactor([...hex(col), 1]).setRoughnessFactor(0.85).setMetallicFactor(0));
    return made.get(name);
  };
  for (const top of root.getDefaultScene().listChildren()) {
    const over = Object.assign({}, ...NODE_OVERRIDE.filter(([re]) => re.test(top.getName())).map(([, m]) => m));
    top.traverse((n) => {
      for (const prim of n.getMesh()?.listPrimitives() || []) if (prim.getMaterial()) prim.setMaterial(matFor(prim.getMaterial(), over));
    });
  }
}

/** 처음부터 끝까지 기본 자세와 같은 애니메이션 채널(대개 scale·translation) 제거 → JSON·바이너리 축소 */
function dropStaticChannels(doc) {
  let n = 0;
  for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath(), out = ch.getSampler()?.getOutput();
    if (!node || !out || path === 'weights') continue;
    const rest = path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
    const el = [];
    let same = true;
    for (let i = 0; i < out.getCount() && same; i++) {
      out.getElement(i, el);
      const flip = path === 'rotation' && el[3] * rest[3] < 0 ? -1 : 1; // q 와 -q 는 같은 회전
      same = el.every((v, k) => Math.abs(v * flip - rest[k]) < 1e-4);
    }
    if (same) { ch.getSampler().dispose(); ch.dispose(); n++; }
  }
  return n;
}

/** 재질 색을 정점 색(COLOR_0)으로 굽고 재질 하나('Main')로 통일 → join 으로 동물 1마리 = 그리기 1번 */
function bakeVertexColors(doc) {
  const root = doc.getRoot();
  const shared = doc.createMaterial('Main').setRoughnessFactor(0.85).setMetallicFactor(0);
  const buf = root.listBuffers()[0];
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const c = prim.getMaterial()?.getBaseColorFactor() || [1, 1, 1, 1];
    const n = prim.getAttribute('POSITION').getCount();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set(c.slice(0, 3), i * 3);
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buf));
    prim.setMaterial(shared);
  }
}

async function finish(doc, out, { anim = false } = {}) {
  if (anim) {
    console.log('  고정 채널 제거:', dropStaticChannels(doc));
    bakeVertexColors(doc);
    // 같은 메시·같은 스킨 안의 프리미티브는 그대로 합쳐도 안전 (join() 은 스킨 메시를 건너뛰므로 직접 결합)
    for (const mesh of doc.getRoot().listMeshes()) {
      const prims = mesh.listPrimitives();
      if (prims.length < 2) continue;
      const merged = joinPrimitives(prims);
      for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
      mesh.addPrimitive(merged);
    }
    await doc.transform(prune());
    console.log('  프리미티브:', doc.getRoot().listMeshes().map((m) => m.listPrimitives().length).join(','));
  }
  await doc.transform(weld(), dedup(), prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: anim ? 'high' : 'medium' }));
  await io.write(out, doc);
  console.log(path.basename(out), (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}

if (RAW) for (const f of ['q_farm.glb', 'q_nature.glb']) {
  const doc = await io.read(path.join(RAW, f));
  remapStatic(doc, f === 'q_farm.glb' ? BUILDING : NATURE);
  await finish(doc, path.join(OUT, f));
}

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

/**
 * 다른 파일의 동작을 뼈 이름이 같은 노드에 복사 (회전 채널만 → 체격 차이에 안전).
 * 원본 기본 자세 대비 변화량만 옮김: 대상 = 대상기본 × (원본기본⁻¹ × 원본동작)
 */
async function borrowClips(doc, srcPath, clips) {
  const src = await io.read(srcPath);
  const buf = doc.getRoot().listBuffers()[0];
  const byName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  for (const a of src.getRoot().listAnimations()) {
    const key = clips[a.getName().replace(/^.*\|/, '')];
    if (!key) continue;
    const anim = doc.createAnimation(key);
    for (const ch of a.listChannels()) {
      const tgt = byName.get(ch.getTargetNode()?.getName());
      if (ch.getTargetPath() !== 'rotation' || !tgt) continue;
      const sm = ch.getSampler();
      const inp = doc.createAccessor().setType('SCALAR').setArray(sm.getInput().getArray().slice()).setBuffer(buf);
      const srcRest = ch.getTargetNode().getRotation(), dstRest = tgt.getRotation();
      const o = sm.getOutput().getArray().slice(), el = [];
      for (let i = 0; i < o.length; i += 4) {
        const q = qmul(dstRest, qmul(qinv(srcRest), [o[i], o[i + 1], o[i + 2], o[i + 3]]));
        el.push(...q);
      }
      const out = doc.createAccessor().setType('VEC4').setArray(new Float32Array(el)).setBuffer(buf);
      const smp = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(sm.getInterpolation());
      anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(tgt).setTargetPath('rotation').setSampler(smp));
    }
  }
}

const findSrc = (file) => [ANIM, RAW].filter(Boolean).map((d) => path.join(d, file)).find((p) => fs.existsSync(p));

if (ANIM) for (const [file, cfg] of Object.entries(ANIMALS)) {
  const p = findSrc(file);
  if (!p) { console.log('없음:', file); continue; }
  const doc = await io.read(p);
  const root = doc.getRoot();
  if (cfg.borrow) { const bp = findSrc(cfg.borrow.file); if (bp) await borrowClips(doc, bp, cfg.borrow.clips); }
  for (const a of root.listAnimations()) {
    const keep = CLIPS[a.getName().replace(/^.*\|/, '')] || (Object.values(CLIPS).includes(a.getName()) ? a.getName() : null);
    const use = USE[cfg.name] || USE.default;
    if (!keep || !use.includes(keep) || root.listAnimations().some((b) => b !== a && b.getName() === keep)) a.dispose();
    else a.setName(keep);
  }
  for (const m of root.listMaterials()) {
    const c = cfg.colors[m.getName()];
    if (c) m.setBaseColorFactor([...hex(c), 1]);
    m.setRoughnessFactor(0.85).setMetallicFactor(0);
  }
  const scene = root.getDefaultScene();
  const wrap = doc.createNode(cfg.name).setScale([cfg.scale, cfg.scale, cfg.scale]);
  for (const n of scene.listChildren()) { scene.removeChild(n); wrap.addChild(n); }
  scene.addChild(wrap);
  await finish(doc, path.join(OUT, cfg.name + '.glb'), { anim: true });
}
