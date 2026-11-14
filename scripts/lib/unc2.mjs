/**
 * UNC2 인코더 — 캐릭터 몸 메시(유니코·주민)를 작은 바이너리로 (굽기 스크립트·테스트 전용, 게임은 unico_mesh.js parseUnicoBin 으로 읽음)
 * 리틀엔디언, 헤더 80바이트 + 구역(각 4바이트 정렬):
 *   0 u32 magic 'UNC2' · 4 u16 version 1 · 6 u16 posBits 14 · 8 u32 nVerts · 12 u32 nIdx · 16 u32 step(µm)
 *   20 f32×3 bboxMin · 32 f32×3 bboxMax · 44 u32×6 구역 바이트 수 [pos, nrm, skin, slot, idx, meta]
 *   68 u32 shapeHash · 72 u32 flags(bit0 lod, bit1 meta) · 76 u32 0
 * 구역: pos Uint16×4(14비트) / nrm 8면체 Int8×4 / skin Uint8×8 [i0..i3, w0..w3](합 255) / slot Uint8×8 / idx 코덱 v1 / meta JSON
 * 주의: 정점 스트림은 반드시 코덱 v0 (encodeVertexBufferLevel(…, 2, 0)) — 기본 encodeVertexBuffer(v1)는 three r182 디코더가 못 읽음
 */
import { MeshoptEncoder } from 'meshoptimizer';

export const UNC2_MAGIC = 0x32434e55;
export const POS_BITS = 14;
export const HEADER = 80;
export const ready = MeshoptEncoder.ready;

const vbuf = (u8, n, stride) => MeshoptEncoder.encodeVertexBufferLevel(u8, n, stride, 2, 0); // 코덱 v0 (헤더 0xa0)

/**
 * @param o.geometry position(Float32×3), normal(Float32 또는 Int8 정규화), skinIndex, skinWeight(Float32 또는 Uint8 정규화), index
 * @param o.slotWeights Float32Array(n*5, 합 1) 또는 Uint8Array(n*5, 합 ≈255)
 * @returns Uint8Array (같은 입력 → 같은 바이트)
 */
export function encodeUNC2({ geometry: g, slotWeights, step = 0, shapeHash = 0, lod = false, meta = null }) {
  const n0 = g.attributes.position.count;
  const P = g.attributes.position.array, Na = g.attributes.normal, SI = g.attributes.skinIndex.array, SWa = g.attributes.skinWeight;
  const N = Na.array, SW = SWa.array;
  const nScale = Na.normalized ? 1 / 127 : 1, wScale = SWa.normalized ? 1 / 255 : 1;
  const slotU8 = slotWeights instanceof Uint8Array;
  const idx = Uint32Array.from(g.index.array);
  const [remap, n] = MeshoptEncoder.reorderMesh(idx, true, true); // idx 를 제자리에서 고침
  const inv = new Uint32Array(n);
  for (let i = 0; i < n0; i++) if (remap[i] !== 0xffffffff) inv[remap[i]] = i;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n0; i++) for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  const Q = (1 << POS_BITS) - 1;
  const pos = new Uint16Array(n * 4), nf = new Float32Array(n * 4), sk = new Uint8Array(n * 8), sl = new Uint8Array(n * 8);
  for (let j = 0; j < n; j++) {
    const i = inv[j];
    for (let k = 0; k < 3; k++) {
      const r = mx[k] - mn[k] || 1;
      pos[j * 4 + k] = Math.round(((P[i * 3 + k] - mn[k]) / r) * Q);
      nf[j * 4 + k] = N[i * 3 + k] * nScale;
    }
    // 가중치 합 정확히 255 (w0 가 반올림 흡수), 가중치 0 이면 인덱스 0
    const w = [0, 1, 2, 3].map((k) => Math.round(SW[i * 4 + k] * wScale * 255));
    w[0] += 255 - (w[0] + w[1] + w[2] + w[3]);
    for (let k = 0; k < 4; k++) { sk[j * 8 + k] = w[k] ? SI[i * 4 + k] : 0; sk[j * 8 + 4 + k] = w[k]; }
    for (let s = 0; s < 5; s++) sl[j * 8 + s] = slotU8 ? slotWeights[i * 5 + s] : Math.round(slotWeights[i * 5 + s] * 255);
  }
  const metaBytes = meta ? new TextEncoder().encode(JSON.stringify(meta)) : new Uint8Array(0);
  const streams = [
    vbuf(new Uint8Array(pos.buffer), n, 8),
    vbuf(MeshoptEncoder.encodeFilterOct(nf, n, 4, 8), n, 4),
    vbuf(sk, n, 8),
    vbuf(sl, n, 8),
    MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4),
    metaBytes,
  ];
  const total = HEADER + streams.reduce((a, s) => a + ((s.length + 3) & ~3), 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, UNC2_MAGIC, true);
  dv.setUint16(4, 1, true);
  dv.setUint16(6, POS_BITS, true);
  dv.setUint32(8, n, true);
  dv.setUint32(12, idx.length, true);
  dv.setUint32(16, Math.round(step * 1e6), true);
  for (let k = 0; k < 3; k++) { dv.setFloat32(20 + k * 4, mn[k], true); dv.setFloat32(32 + k * 4, mx[k], true); }
  let o = HEADER;
  streams.forEach((s, k) => { dv.setUint32(44 + k * 4, s.length, true); out.set(s, o); o += (s.length + 3) & ~3; });
  dv.setUint32(68, shapeHash >>> 0, true);
  dv.setUint32(72, (lod ? 1 : 0) | (meta ? 2 : 0), true);
  dv.setUint32(76, 0, true);
  return out;
}

/** 구역 시작 오프셋들 (테스트: 스트림 헤더 바이트 검사용) */
export function sections(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = HEADER;
  return [0, 1, 2, 3, 4, 5].map((k) => { const len = dv.getUint32(44 + k * 4, true), at = o; o += (len + 3) & ~3; return { at, len }; });
}
