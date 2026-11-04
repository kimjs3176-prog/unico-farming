// KayKit Medieval Hexagon Pack (CC0, Kay Lousberg) 소품 → public/models/k_props.glb 하나로 합침
// 사용: node scripts/pack-kaykit.mjs <glTF 폴더>
//   폴더에는 팩의 Assets/gltf/** 에서 받은 <이름>.gltf · <이름>.bin 과 공용 텍스처 hexagons_medieval.png
// 결과 노드 이름 = k_<원본 이름> (assets.js PACK_MODELS 로 하나씩 꺼내 씀). 라이선스: docs/ASSETS_CC0.md
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, weld, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const DIR = process.argv[2];
const NAMES = ['building_scaffolding', 'building_stage_A', 'building_stage_B', 'building_stage_C', 'building_dirt', 'resource_lumber', 'resource_stone', 'sack', 'barrel', 'crate_A_big', 'crate_B_small', 'crate_open', 'bucket_water', 'pallet', 'wheelbarrow'];
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const out = new Document();
out.createBuffer();
const scene = out.createScene('k_props');
for (const n of NAMES) {
  const doc = await io.read(path.join(DIR, `${n}.gltf`));
  // 한 파일 = 노드 하나로 묶어 합치기
  const src = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const wrap = doc.createNode(`k_${n}`);
  for (const c of src.listChildren()) { src.removeChild(c); wrap.addChild(c); }
  src.addChild(wrap);
  for (const b of doc.getRoot().listBuffers()) b.dispose();
  doc.createBuffer();
  doc.getRoot().listAccessors().forEach((a) => a.setBuffer(doc.getRoot().listBuffers()[0]));
  const map = mergeDocuments(out, doc);
  scene.addChild(map.get(wrap));
}
// 여러 장면이 생기므로 기본 장면 하나만 남김
for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
out.getRoot().setDefaultScene(scene);
const buf = out.getRoot().listBuffers()[0];
out.getRoot().listAccessors().forEach((a) => a.setBuffer(buf));
for (const b of out.getRoot().listBuffers()) if (b !== buf) b.dispose();
await out.transform(unpartition(), dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const dst = path.resolve('public/models/k_props.glb');
await io.write(dst, out);
console.log('wrote', dst, fs.statSync(dst).size, 'bytes');
