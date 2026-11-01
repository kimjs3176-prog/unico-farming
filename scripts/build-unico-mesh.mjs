/**
 * 유니코 한 덩어리 메시를 미리 구워 저장: unico_body.bin(네 발, 주민) / unico_biped.bin(두 발, 주인공) (런타임 생성 0.7초 → 로드만)
 * 형식(리틀엔디언): 헤더 Uint32[4] = [magic 0x554e4943, nVerts, nIdx, step*1e6]
 *   position Float32×3, normal Int8×3(정규화), skinIndex Uint8×4, skinWeight Uint8×4(/255), slot Uint8×5(/255), index Uint16|Uint32
 * 실행: node scripts/build-unico-mesh.mjs
 */
import fs from 'node:fs';
import { buildUnicoGeometry, SLOTS } from '../src/game/unico_mesh.js';

const STEP = 0.032;
for (const [rig, file] of [['quad', 'unico_body.bin'], ['biped', 'unico_biped.bin']]) {
const t = Date.now();
const { geometry: g, slotWeights, stats } = buildUnicoGeometry(STEP, rig);
const n = stats.verts, idx = g.index.array, ni = idx.length;
const wide = n > 65535;
const size = 16 + n * (12 + 3 + 4 + 4 + SLOTS.length) + ni * (wide ? 4 : 2);
const buf = Buffer.alloc(size + 4);
let o = 0;
const u32 = (v) => { buf.writeUInt32LE(v, o); o += 4; };
u32(0x554e4943); u32(n); u32(ni); u32(Math.round(STEP * 1e6));
const P = g.attributes.position.array, N = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array;
for (let i = 0; i < n * 3; i++) { buf.writeFloatLE(P[i], o); o += 4; }
for (let i = 0; i < n * 3; i++) { buf.writeInt8(Math.max(-127, Math.min(127, Math.round(N[i] * 127))), o); o += 1; }
for (let i = 0; i < n * 4; i++) { buf.writeUInt8(SI[i], o); o += 1; }
for (let v = 0; v < n; v++) {
  // 정수 가중치 합이 정확히 255 가 되도록
  const w = [0, 1, 2, 3].map((k) => Math.round(SW[v * 4 + k] * 255));
  w[0] += 255 - w.reduce((a, b) => a + b, 0);
  for (const x of w) { buf.writeUInt8(Math.max(0, x), o); o += 1; }
}
for (let i = 0; i < n * SLOTS.length; i++) { buf.writeUInt8(Math.round(slotWeights[i] * 255), o); o += 1; }
if (o % (wide ? 4 : 2)) o += (wide ? 4 : 2) - (o % (wide ? 4 : 2));
for (let i = 0; i < ni; i++) { if (wide) buf.writeUInt32LE(idx[i], o); else buf.writeUInt16LE(idx[i], o); o += wide ? 4 : 2; }
fs.writeFileSync(new URL(`../public/models/${file}`, import.meta.url), buf.subarray(0, o));
console.log(`${file}: ${stats.verts} verts, ${stats.tris} tris, ${(o / 1024).toFixed(0)}KB, ${Date.now() - t}ms`);
}
