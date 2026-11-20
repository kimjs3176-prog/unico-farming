// q_nature 잎 법선 굽기 확인: 소나무·버드나무 잎이 각진 면이 아니라 둥근 덩어리로 보이게 (scripts/optimize-cc0.mjs --soften-nature)
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { softness } from './lib/softness.js';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('public/models/q_nature.glb');
const tops = doc.getRoot().getDefaultScene().listChildren();
const primsOf = (node, re) => {
  const out = [];
  node.traverse((n) => { for (const p of n.getMesh()?.listPrimitives() || []) if (re.test(p.getMaterial()?.getName() || '')) out.push(p); });
  return out;
};
/** 굽기 전 잎 정점 합계 32515 → 굽고 이어 붙이면 줄어야 함 (정적 병합 정점 감소) */
const OLD_LEAF_VERTS = 32515;
const SOFT_MIN = 0.02;

test('소나무·버드나무 잎은 부드러운 법선 (각진 면 아님)', () => {
  const names = tops.map((n) => n.getName()).filter((n) => /^(pine|willow)_\d$/.test(n));
  assert.ok(names.length >= 5, names.join(','));
  for (const t of tops.filter((n) => names.includes(n.getName()))) {
    for (const p of primsOf(t, /^leaf/)) {
      const s = softness(p);
      assert.ok(s > SOFT_MIN, `${t.getName()} 부드러움 ${s.toFixed(4)}`);
    }
  }
});

test('잎 정점 합계가 굽기 전보다 줄고, 줄기·바위는 그대로 각진 결', () => {
  const leaf = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => /^leaf/.test(p.getMaterial()?.getName() || ''));
  const verts = leaf.reduce((s, p) => s + p.getAttribute('POSITION').getCount(), 0);
  assert.ok(verts < OLD_LEAF_VERTS, `잎 정점 ${verts}`);
  for (const t of tops.filter((n) => /^rock_\d$/.test(n.getName()))) for (const p of primsOf(t, /^stone/)) assert.ok(softness(p) < SOFT_MIN, t.getName());
});
