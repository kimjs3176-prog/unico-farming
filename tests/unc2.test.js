import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUnicoGeometry, parseUnicoBin, unicoDecoderReady, SLOTS } from '../src/game/unico_mesh.js';
import { encodeUNC2, sections, ready as encoderReady } from '../scripts/lib/unc2.mjs';

await encoderReady;
await unicoDecoderReady;

const bin = (f) => { const b = readFileSync(new URL(`../public/models/${f}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** 원래 정점마다 가장 가까운 디코드 정점까지 거리 최댓값 (1mm 격자 해시) */
function maxPosError(src, dst) {
  const key = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const grid = new Map();
  for (let i = 0; i < dst.length; i += 3) { const k = key(dst[i], dst[i + 1], dst[i + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  let worst = 0;
  for (let i = 0; i < src.length; i += 3) {
    let best = Infinity;
    const cx = Math.round(src[i] * 1000), cy = Math.round(src[i + 1] * 1000), cz = Math.round(src[i + 2] * 1000);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) best = Math.min(best, Math.hypot(dst[j] - src[i], dst[j + 1] - src[i + 1], dst[j + 2] - src[i + 2]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

test('UNC2 왕복: 위치 오차 0.1mm 이하, 가중치 합 255, 정점 스트림은 코덱 v0(0xa0)·인덱스는 0xe1', () => {
  const r = buildUnicoGeometry(0.06, 'biped');
  const u8 = encodeUNC2({ geometry: r.geometry, slotWeights: r.slotWeights, step: 0.06 });
  const sec = sections(u8);
  for (let k = 0; k < 4; k++) assert.equal(u8[sec[k].at], 0xa0, `정점 스트림 ${k} 헤더 (기본 encodeVertexBuffer=0xa1 은 three r182 가 못 읽음)`);
  assert.equal(u8[sec[4].at], 0xe1, '인덱스 코덱 v1');
  const d = parseUnicoBin(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  const g = d.geometry, n = g.attributes.position.count;
  assert.equal(g.index.count, r.geometry.index.count, '삼각형 수 그대로');
  assert.ok(maxPosError(r.geometry.attributes.position.array, g.attributes.position.array) <= 1e-4);
  const sw = g.attributes.skinWeight.array, si = g.attributes.skinIndex.array;
  for (let i = 0; i < n; i++) {
    assert.equal(sw[i * 4] + sw[i * 4 + 1] + sw[i * 4 + 2] + sw[i * 4 + 3], 255);
    for (let k = 0; k < 4; k++) if (!sw[i * 4 + k]) assert.equal(si[i * 4 + k], 0, '가중치 0 이면 인덱스 0');
    let s = 0;
    for (let k = 0; k < SLOTS.length; k++) s += d.slotWeights[i * SLOTS.length + k];
    assert.ok(Math.abs(s - 255) <= 2, `슬롯 합 ${s}`);
  }
  const idx = g.index.array;
  assert.ok(idx instanceof Uint16Array);
  for (let i = 0; i < idx.length; i++) assert.ok(idx[i] < n);
  // 같은 입력 → 같은 바이트
  assert.deepEqual(encodeUNC2({ geometry: r.geometry, slotWeights: r.slotWeights, step: 0.06 }), u8);
});

/**
 * 디코드 정점 → 원래 정점 (위치 0.15mm 안, 1mm 격자). 거의 겹친 정점 쌍(수 µm)은 법선이 더 비슷한 쪽으로. 1:1 이 아니면 null
 */
function matchVerts(src, dst, sn, dn) {
  const key = (x, y, z) => `${x},${y},${z}`, grid = new Map();
  for (let i = 0; i < src.length; i += 3) { const k = key(Math.round(src[i] * 1000), Math.round(src[i + 1] * 1000), Math.round(src[i + 2] * 1000)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i / 3); }
  const map = new Int32Array(dst.length / 3), used = new Uint8Array(src.length / 3);
  for (let j = 0; j < dst.length; j += 3) {
    const cx = Math.round(dst[j] * 1000), cy = Math.round(dst[j + 1] * 1000), cz = Math.round(dst[j + 2] * 1000), J = j / 3;
    let best = -1, score = -Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const i of grid.get(key(cx + a, cy + b, cz + c)) || []) {
      if (used[i] || Math.hypot(src[i * 3] - dst[j], src[i * 3 + 1] - dst[j + 1], src[i * 3 + 2] - dst[j + 2]) > 1.5e-4) continue;
      const sc = sn.getX(i) * dn.getX(J) + sn.getY(i) * dn.getY(J) + sn.getZ(i) * dn.getZ(J);
      if (sc > score) { score = sc; best = i; }
    }
    if (best < 0) return null;
    used[best] = 1; map[J] = best;
  }
  return map;
}

test('UNC2 왕복: 정점마다 법선·뼈 가중치·색 슬롯이 제자리 정점에 남고, 삼각형 연결이 그대로 (정점 재배열 검사)', () => {
  const r = buildUnicoGeometry(0.06, 'biped');
  const src = r.geometry, u8 = encodeUNC2({ geometry: src, slotWeights: r.slotWeights, step: 0.06 });
  const d = parseUnicoBin(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), g = d.geometry;
  const n = g.attributes.position.count;
  assert.equal(n, src.attributes.position.count);
  const map = matchVerts(src.attributes.position.array, g.attributes.position.array, src.attributes.normal, g.attributes.normal);
  assert.ok(map, '디코드 정점과 원래 정점이 1:1');
  const SN = src.attributes.normal, SI = src.attributes.skinIndex.array, SW = src.attributes.skinWeight.array;
  const DN = g.attributes.normal, DI = g.attributes.skinIndex.array, DW = g.attributes.skinWeight.array, S = SLOTS.length;
  let worstDeg = 0;
  for (let j = 0; j < n; j++) {
    const i = map[j];
    // 법선 (8면체 8비트 → 2° 안)
    const dot = SN.getX(i) * DN.getX(j) + SN.getY(i) * DN.getY(j) + SN.getZ(i) * DN.getZ(j);
    const len = Math.hypot(DN.getX(j), DN.getY(j), DN.getZ(j)) * Math.hypot(SN.getX(i), SN.getY(i), SN.getZ(i));
    worstDeg = Math.max(worstDeg, (Math.acos(Math.min(1, dot / len)) * 180) / Math.PI);
    // 뼈 → 가중치 (255 단위, 반올림 흡수로 최대 1.5)
    const want = new Map(), got = new Map();
    for (let k = 0; k < 4; k++) { want.set(SI[i * 4 + k], (want.get(SI[i * 4 + k]) || 0) + SW[i * 4 + k] * 255); got.set(DI[j * 4 + k], (got.get(DI[j * 4 + k]) || 0) + DW[j * 4 + k]); }
    for (const b of new Set([...want.keys(), ...got.keys()])) assert.ok(Math.abs((want.get(b) || 0) - (got.get(b) || 0)) <= 1.5, `정점 ${j} 뼈 ${b}: ${want.get(b)} → ${got.get(b)}`);
    for (let s = 0; s < S; s++) assert.ok(Math.abs(r.slotWeights[i * S + s] * 255 - d.slotWeights[j * S + s]) <= 1, `정점 ${j} 슬롯 ${s}`);
  }
  assert.ok(worstDeg < 2, `법선 최대 오차 ${worstDeg.toFixed(2)}°`);
  // 삼각형: 원래 번호로 바꿔 (감는 방향 유지, 가장 작은 번호부터) 집합이 같음. 거의 겹친 정점(0.15mm 안)은 같은 번호로 봄
  const P = src.attributes.position.array, canon = new Int32Array(n).map((_, i) => i);
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) if (Math.abs(P[i * 3] - P[k * 3]) < 1.5e-4 && Math.hypot(P[i * 3] - P[k * 3], P[i * 3 + 1] - P[k * 3 + 1], P[i * 3 + 2] - P[k * 3 + 2]) < 1.5e-4) canon[k] = canon[i];
  const tri = (I, m) => { const out = new Set(); for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map((x) => canon[m ? m[x] : x]); const rots = [[a, b, c], [b, c, a], [c, a, b]].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]); out.add(rots[0].join()); } return out; };
  const A = tri(src.index.array), B = tri(g.index.array, map);
  assert.equal(B.size, A.size);
  for (const k of B) assert.ok(A.has(k), `없는 삼각형 ${k}`);
});

test('변환한 유니코 bin 4개: 정점·삼각형 수와 크기 상자가 변환 전과 같음 (모양 0 변화)', () => {
  const BEFORE = {
    'unico_body.bin': [11238, 22472, [-0.42963, 0, -0.93992], [0.42963, 2.1199, 1.22992]],
    'unico_body_lod.bin': [2926, 5848, [-0.42992, 0, -0.93769], [0.42992, 2.11974, 1.22979]],
    'unico_biped.bin': [15026, 30048, [-0.49572, -0.00316, -0.68991], [0.49572, 1.83984, 0.55984]],
    'unico_biped_lod.bin': [3439, 6884, [-0.49359, -0.00283, -0.68981], [0.49354, 1.83944, 0.55916]],
  };
  for (const [f, [nv, nt, mn, mx]] of Object.entries(BEFORE)) {
    const ab = bin(f);
    assert.equal(new DataView(ab).getUint32(0, true), 0x32434e55, `${f} 는 UNC2`);
    const { geometry: g, meta } = parseUnicoBin(ab);
    assert.equal(meta, null);
    assert.equal(g.attributes.position.count, nv, f);
    assert.equal(g.index.count / 3, nt, f);
    g.computeBoundingBox();
    const b = g.boundingBox;
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(b.min.getComponent(k) - mn[k]) < 1e-4, `${f} min ${k}`);
      assert.ok(Math.abs(b.max.getComponent(k) - mx[k]) < 1e-4, `${f} max ${k}`);
    }
  }
});

test('예전 v1 bin 도 여전히 읽음 (옛 파일·개발용)', () => {
  const r = buildUnicoGeometry(0.08, 'quad');
  const g = r.geometry, n = g.attributes.position.count, ni = g.index.count;
  const wide = n > 65535;
  const size = 16 + n * (12 + 3 + 4 + 4 + 5) + 4 + ni * (wide ? 4 : 2);
  const buf = Buffer.alloc(size);
  let o = 0;
  const u32 = (v) => { buf.writeUInt32LE(v, o); o += 4; };
  u32(0x554e4943); u32(n); u32(ni); u32(80000);
  const P = g.attributes.position.array, N = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array;
  for (let i = 0; i < n * 3; i++) { buf.writeFloatLE(P[i], o); o += 4; }
  for (let i = 0; i < n * 3; i++) { buf.writeInt8(Math.round(N[i] * 127), o); o += 1; }
  for (let i = 0; i < n * 4; i++) { buf.writeUInt8(SI[i], o); o += 1; }
  for (let v = 0; v < n; v++) { const w = [0, 1, 2, 3].map((k) => Math.round(SW[v * 4 + k] * 255)); w[0] += 255 - w.reduce((a, b) => a + b, 0); for (const x of w) { buf.writeUInt8(x, o); o += 1; } }
  for (let i = 0; i < n * 5; i++) { buf.writeUInt8(Math.round(r.slotWeights[i] * 255), o); o += 1; }
  if (o % 2) o++;
  for (let i = 0; i < ni; i++) { buf.writeUInt16LE(g.index.array[i], o); o += 2; }
  const d = parseUnicoBin(buf.buffer.slice(buf.byteOffset, buf.byteOffset + o));
  assert.equal(d.geometry.attributes.position.count, n);
  assert.deepEqual(Array.from(d.geometry.attributes.position.array.slice(0, 30)), Array.from(P.slice(0, 30)));
  assert.ok(d.slotWeights instanceof Uint8Array, '슬롯 가중치는 Uint8 (메모리 1/4)');
  assert.equal(d.shapeHash, 0);
});

test('UNC2 버전: 모르는 버전은 조용히 잘못 읽지 않고 분명한 오류 (주민은 유니콘으로 대체)', () => {
  const ab = bin('villager_fox_lod.bin');
  const copy = ab.slice(0);
  new DataView(copy).setUint16(4, 2, true);
  assert.throws(() => parseUnicoBin(copy), /UNC2 버전 2/);
  assert.doesNotThrow(() => parseUnicoBin(ab), '버전 1 은 그대로');
});
