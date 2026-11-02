// 자체 제작 GLB(blender/build_all.py 출력)를 meshopt 로 압축. 이미 압축된 파일·CC0(q_*)는 건너뜀.
// crops.glb 는 코드가 노드 위치를 직접 0 으로 놓아(assets.cloneCrop) 양자화 오프셋이 깨지므로 제외.
// 사용: node scripts/compress-models.mjs   (Blender 로 에셋을 다시 만든 뒤 실행)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const DIR = path.resolve('public/models');
const SKIP = new Set(['crops.glb']);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let before = 0, after = 0;
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.glb') && !f.startsWith('q_') && !SKIP.has(f))) {
  const p = path.join(DIR, f);
  const doc = await io.read(p);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) continue;
  const b = fs.statSync(p).size;
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(p, doc);
  const a = fs.statSync(p).size;
  before += b; after += a;
  console.log(f.padEnd(18), (b / 1024).toFixed(0).padStart(5), '→', (a / 1024).toFixed(0).padStart(5), 'KB');
}
console.log('합계', (before / 1024).toFixed(0), '→', (after / 1024).toFixed(0), 'KB');
