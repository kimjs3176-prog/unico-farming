/**
 * 캐릭터 한 덩어리 메시를 미리 구워 저장 (런타임 생성 0.7초 → 로드만). 형식은 UNC2 (scripts/lib/unc2.mjs)
 *   유니콘: unico_body.bin(네 발, KOAT 담당) / unico_biped.bin(두 발, 주인공·접속자) + *_lod (멀리 있을 때, 삼각형 약 1/4)
 *   주민 동물: villager_<종>.bin (step 0.030) / villager_<종>_lod.bin (step 0.055, 귀·꼬리 +0.012 두껍게) + meta(뼈대·얼굴/옷 기준점)
 * 실행:
 *   node scripts/build-unico-mesh.mjs               # 주민 12개만 (유니콘 4개는 그대로 — 다시 구우면 모양은 같아도 바이트가 바뀌어 모두 다시 받음)
 *   node scripts/build-unico-mesh.mjs --only=v_fox,v_fox_lod
 *   node scripts/build-unico-mesh.mjs --unicorn     # 유니콘 4개만 다시 굽기 (유니콘 모양을 고쳤을 때만)
 *   node scripts/build-unico-mesh.mjs --only=biped,biped_lod   # 유니콘도 이름을 적으면 그것만
 *   node scripts/build-unico-mesh.mjs --convert     # 예전 v1 유니코 bin 4개 → UNC2 (모양 그대로, 한 번만)
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildUnicoGeometry, parseUnicoBin, unicoDecoderReady } from '../src/game/unico_mesh.js';
import { encodeUNC2, ready as encoderReady } from './lib/unc2.mjs';
import { SPECIES_IDS, speciesShape, shapeHash, bakeMeta } from './lib/species_shapes.mjs';

const OUT = new URL('../public/models/', import.meta.url);
const UNICORN = [['quad', 'unico_body.bin', 0.032], ['biped', 'unico_biped.bin', 0.022], ['quad_lod', 'unico_body_lod.bin', 0.062], ['biped_lod', 'unico_biped_lod.bin', 0.046]];
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`));
const only = arg('only')?.split('=')[1]?.split(',').filter(Boolean);
const unicorn = !!arg('unicorn');
/** 기본은 주민만. 유니콘은 --unicorn 또는 --only 로 이름을 적었을 때만 (D5: 유니콘 bin 은 제자리 변환본을 그대로 둠) */
const want = (key) => (only ? only.includes(key) : unicorn ? !key.startsWith('v_') : key.startsWith('v_'));
const kb = (n) => (n / 1000).toFixed(1) + 'KB';
const gz = (u8) => zlib.gzipSync(u8, { level: 9 }).length;

await encoderReady;
await unicoDecoderReady;

function write(file, u8, info) {
  fs.writeFileSync(new URL(file, OUT), u8);
  console.log(`${file}: ${info}, ${kb(u8.length)} (gz ${kb(gz(u8))})`);
}

if (arg('convert')) {
  // 다시 굽지 않고 제자리 변환: 위치·법선·가중치·슬롯을 그대로 옮겨 담음
  for (const [, file] of UNICORN) {
    const b = fs.readFileSync(new URL(file, OUT));
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    if (b.readUInt32LE(0) !== 0x554e4943) { console.log(`${file}: 이미 UNC2`); continue; }
    const step = b.readUInt32LE(12) / 1e6;
    const r = parseUnicoBin(ab);
    write(file, encodeUNC2({ geometry: r.geometry, slotWeights: r.slotWeights, step, lod: file.includes('_lod') }), `${r.geometry.attributes.position.count} verts (변환)`);
  }
  process.exit(0);
}

for (const [key, file, step] of UNICORN) {
  if (!want(key)) continue;
  const t = Date.now();
  const r = buildUnicoGeometry(step, key.replace('_lod', ''));
  write(file, encodeUNC2({ geometry: r.geometry, slotWeights: r.slotWeights, step, lod: key.endsWith('_lod') }), `${r.stats.verts} verts, ${r.stats.tris} tris, ${Date.now() - t}ms`);
}

for (const sp of SPECIES_IDS) {
  const key = 'v_' + sp;
  if (!want(key) && !want(key + '_lod')) continue;
  const hash = shapeHash(sp);
  const shape = speciesShape(sp);
  // 원본은 meta(top)에 필요해서 LOD 만 구울 때도 만듦
  let t = Date.now();
  const full = buildUnicoGeometry(0.03, shape);
  if (full.stats.clip > 0) throw new Error(`${key}: 경계 밖으로 잘림 ${full.stats.clip}셀 — bounds 를 넓히세요`);
  const P = full.geometry.attributes.position.array;
  let top = -Infinity;
  for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]);
  const meta = bakeMeta(sp, shape, { top });
  if (want(key)) write(`villager_${sp}.bin`, encodeUNC2({ geometry: full.geometry, slotWeights: full.slotWeights, step: 0.03, shapeHash: hash, meta }), `${full.stats.verts} verts, ${full.stats.tris} tris, ${Date.now() - t}ms`);
  if (want(key + '_lod')) {
    t = Date.now();
    const lod = buildUnicoGeometry(0.055, shape, { thick: 0.012 });
    if (lod.stats.clip > 0) throw new Error(`${key}_lod: 경계 밖으로 잘림 ${lod.stats.clip}셀`);
    write(`villager_${sp}_lod.bin`, encodeUNC2({ geometry: lod.geometry, slotWeights: lod.slotWeights, step: 0.055, shapeHash: hash, lod: true, meta }), `${lod.stats.verts} verts, ${lod.stats.tris} tris, ${Date.now() - t}ms`);
  }
}
