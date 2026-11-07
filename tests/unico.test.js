import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// 브라우저 없이: 모델 파일은 디스크에서, 캔버스(바닥 그림자 텍스처)는 빈 흉내
globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${url}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const ctx2d = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} };
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { Unico, loadUnicoMesh } = await import('../src/game/unico.js');
for (const k of ['quad', 'biped']) {
  await loadUnicoMesh(k === 'quad' ? 'unico_body.bin' : 'unico_biped.bin', k);
  await loadUnicoMesh(k === 'quad' ? 'unico_body_lod.bin' : 'unico_biped_lod.bin', `${k}_lod`);
}

const camAt = (d) => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 0, d); return c; };

test('팔레트가 달라도 몸 지오메트리의 위치·뼈 속성은 한 벌을 함께 씀 (색만 따로)', () => {
  const a = new Unico(null, { palette: 'merchant' }), b = new Unico(null, { palette: 'fisher' });
  const ga = a.skin.geometry, gb = b.skin.geometry;
  assert.notEqual(ga, gb);
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) assert.equal(ga.attributes[k], gb.attributes[k], k);
  assert.equal(ga.index, gb.index);
  assert.notEqual(ga.attributes.color, gb.attributes.color);
  assert.equal(a.skinLod.geometry.attributes.position, b.skinLod.geometry.attributes.position);
  // 색이 같은 팔레트(기본 = 없는 이름)는 지오메트리째 공유
  const c = new Unico(null, { palette: 'official' }), d = new Unico(null, { palette: 'no_such_palette' });
  assert.equal(c.skin.geometry, d.skin.geometry);
});

test('스킨 메시의 화면 밖 판정 구는 기본 자세 구(여유 포함)로 미리 정해 둠', () => {
  const u = new Unico(null, { rig: 'biped' });
  assert.ok(u.skin.boundingSphere, '처음 그릴 때 자세로 다시 계산하지 않게');
  assert.equal(u.skin.boundingSphere.radius, u.skin.geometry.boundingSphere.radius);
  assert.ok(u.skinLod.boundingSphere);
});

test('dispose: 함께 쓰는 바닥 그림자 원판·몸 지오메트리는 해제하지 않고, 손 도구·뼈 텍스처는 해제', () => {
  const u = new Unico(null, { rig: 'biped' });
  const fired = [];
  const watch = (o, name) => o.addEventListener('dispose', () => fired.push(name));
  watch(u.shadow.geometry, 'blob');
  watch(u.skin.geometry, 'skin');
  const tool = u.prop('hoe');
  let toolGeo = null;
  tool.traverse((o) => { if (o.isMesh && !toolGeo) toolGeo = o.geometry; });
  watch(toolGeo, 'tool');
  watch(u.shadow.material, 'shadowMat');
  u.dispose();
  assert.ok(!fired.includes('blob'));
  assert.ok(!fired.includes('skin'));
  assert.ok(fired.includes('tool'));
  assert.ok(fired.includes('shadowMat'));
});

test('코스튬 병합 지오메트리는 두 발 유니코끼리 공유', () => {
  const a = new Unico(null, { rig: 'biped', outfit: { costume: 'raincoat' } });
  const b = new Unico(null, { rig: 'biped', outfit: { costume: 'raincoat' } });
  const ga = a.costumeMeshes.raincoat?.map((m) => m.geometry), gb = b.costumeMeshes.raincoat?.map((m) => m.geometry);
  assert.ok(ga?.length);
  assert.deepEqual(ga, gb);
  assert.notEqual(a.costumeMeshes.raincoat[0], b.costumeMeshes.raincoat[0]); // 메시(뼈에 붙는 것)는 따로
});

test('품질 낮음: NPC 는 9m 넘으면 저해상도·실제 그림자 끔, 내 캐릭터는 그대로', () => {
  const npc = new Unico(null, {}), me = new Unico(null, { rig: 'biped' });
  me.labelAlways = true;
  try {
    Unico.setQuality('low');
    const cam = camAt(10);
    me.update(1 / 60, cam); npc.update(1 / 60, cam);
    assert.equal(npc.isLod, true);
    assert.equal(npc.skin.castShadow, false);
    assert.ok(!me.isLod);
    assert.equal(me.skin.castShadow, true);
    // 대화 구도처럼 7m 안으로 오면 원본 몸
    npc.update(1 / 60, camAt(7));
    assert.equal(npc.isLod, false);
    Unico.setQuality('high');
    npc.update(1 / 60, cam);
    assert.equal(npc.isLod, false, '보통·높음은 16m 까지 원본');
    assert.equal(npc.skin.castShadow, true);
  } finally { Unico.setQuality('high'); }
});

test('화면 밖 NPC 는 자세를 몰아서 계산하고, 화면에 그려지면 다시 매 프레임', () => {
  const me = new Unico(null, { rig: 'biped' }), npc = new Unico(null, {});
  me.labelAlways = true;
  Unico.setQuality('low'); // 낮음: NPC 실제 그림자 없음 → 화면 밖 판정만으로 몰아서
  try {
    const cam = camAt(12);
    let steps = 0, last = npc.t;
    const n0 = npc.t, m0 = me.t;
    for (let f = 0; f < 60; f++) {
      me.update(1 / 60, cam); npc.update(1 / 60, cam);
      if (npc.t !== last) { steps++; last = npc.t; }
    }
    assert.ok(steps < 20, `화면 밖 60프레임 중 ${steps}번만 계산`);
    assert.ok(steps >= 5);
    assert.ok(Math.abs((npc.t - n0) - (me.t - m0)) <= 0.1 + 1e-9, '몰아서 계산해도 시간은 따라감');
    // 그려지기 시작하면 매 프레임
    steps = 0;
    for (let f = 0; f < 10; f++) {
      me.update(1 / 60, cam); npc.skin.onBeforeRender(); npc.skinLod.onBeforeRender(); npc.update(1 / 60, cam);
      if (npc.t !== last) { steps++; last = npc.t; }
    }
    assert.equal(steps, 10);
    // 내 캐릭터는 그려지지 않아도 늘 매 프레임
    const t0 = me.t;
    for (let f = 0; f < 10; f++) me.update(1 / 60, cam);
    assert.ok(Math.abs(me.t - t0 - 10 / 60) < 1e-9);
  } finally { Unico.setQuality('high'); }
});
