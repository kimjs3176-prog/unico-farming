// 목장 동물(CC0) 법선을 부드럽게 구운 결과 확인: 뼈대 메시 그대로, 각진 면 줄무늬 없음, 정점 수 늘지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder as ThreeMeshopt } from 'three/addons/libs/meshopt_decoder.module.js';
import { softness } from './lib/softness.js';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// 굽기 전 정점 수 (scripts/optimize-cc0.mjs --soften-animals 기준): 굽고 나서 5% 넘게 늘면 안 됨
const OLD_VERTS = { q_cow: 4970, q_sheep: 1236, q_shiba: 3966, q_alpaca: 4156, q_horse: 4400, q_donkey: 4044 };

for (const [name, old] of Object.entries(OLD_VERTS)) {
  test(`${name}: 뼈대 메시 그대로, 법선이 부드럽고 정점 수 ≤ 1.05배`, async () => {
    const doc = await io.read(`public/models/${name}.glb`);
    const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
    const verts = prims.reduce((s, p) => s + p.getAttribute('POSITION').getCount(), 0);
    assert.ok(verts <= old * 1.05, `정점 ${verts} > ${old}×1.05`);
    assert.ok(doc.getRoot().listSkins().length > 0, '스킨 없음');
    for (const p of prims) {
      assert.ok(p.getAttribute('JOINTS_0') && p.getAttribute('WEIGHTS_0'), '뼈 가중치 없음');
      const s = softness(p);
      assert.ok(s > 0.02, `부드러움 ${s.toFixed(4)} (각진 면)`);
    }
    assert.ok(doc.getRoot().listAnimations().some((a) => a.getName() === 'walk'), 'walk 동작 없음');
  });
}

test('늑대·여우는 일부러 각진 그대로 (사실풍 대비)', async () => {
  for (const n of ['q_wolf', 'q_fox']) {
    const doc = await io.read(`public/models/${n}.glb`);
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) assert.ok(softness(p) < 0.02, n);
  }
});

test('three 로 읽어도 뼈대 메시(SkinnedMesh)·skinIndex·법선이 있음 (대체 상자가 아님)', async () => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(ThreeMeshopt);
  for (const n of ['q_shiba', 'q_cow', 'q_sheep']) {
    const buf = fs.readFileSync(`public/models/${n}.glb`);
    const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    let sk = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
    assert.ok(sk instanceof THREE.SkinnedMesh, n);
    assert.ok(sk.geometry.attributes.skinIndex && sk.geometry.attributes.skinWeight && sk.geometry.attributes.normal, n);
    assert.ok(gltf.animations.length >= 2, n);
  }
});

test('암탉: 큰 머리·부드러운 몸 (아기 같은 비율)', async () => {
  const doc = await io.read('public/models/hen.glb');
  const head = doc.getRoot().listMeshes().find((m) => /Head/.test(m.getName()));
  assert.ok(head, 'HeadMesh');
  const p = head.listPrimitives()[0], pos = p.getAttribute('POSITION');
  const min = [9, 9, 9], max = [-9, -9, -9], e = [];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], e[k]); max[k] = Math.max(max[k], e[k]); } }
  assert.ok(max[0] - min[0] > 0.23, `머리 폭 ${(max[0] - min[0]).toFixed(3)}`);
  const body = doc.getRoot().listMeshes().find((m) => /Body/.test(m.getName()));
  assert.ok(softness(body.listPrimitives()[0]) > 0.02, '몸이 각짐');
});
