// 얻은 물건 보여 주기 (src/game/fx.js FX.itemGet): 논 벼 한 단·목장 달걀/우유/양털
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FX, ITEM_GET, faceToward } = await import('../src/game/fx.js');
const { SURF } = await import('../src/game/surface.js');
const { sheafMesh } = await import('../src/game/view/rice_view.js');
const { productMesh } = await import('../src/game/view/ranch_view.js');

const DT = 1 / 60;
const player = () => {
  const acts = [];
  return { acts, position: new THREE.Vector3(), arrow: { visible: true }, unico: { label: { visible: true }, playAction: (a) => acts.push(a) } };
};
const run = (fx, sec) => { for (let t = 0; t < sec; t += DT) fx.update(DT); };

test('itemGet: 머리 위로 솟아 머문 뒤 가방으로 한 번, onDone 한 번, 이름표는 되돌림', () => {
  // 준비
  SURF.seeCam.value.set(0, 5, 10);
  const scene = new THREE.Scene(), fx = new FX(scene, { level: 'low' }), P = player();
  const bag = [], done = [], apex = [];
  fx.onPop = (t) => bag.push(t);
  const m = sheafMesh();
  // 실행
  fx.itemGet(m, P, { emoji: '🌾', delay: 0.3, from: new THREE.Vector3(1, 0.3, 0), onApex: () => apex.push(1), onDone: () => done.push(1) });
  // 확인: 기다리는 동안은 숨김, 이름표도 숨김
  assert.equal(m.visible, false);
  assert.equal(P.unico.label.visible, false);
  run(fx, 0.3 + ITEM_GET.arc + 0.05);
  assert.equal(m.visible, true);
  assert.ok(m.position.y > 2, `머리 위 높이 ${m.position.y.toFixed(2)}`);
  assert.deepEqual(apex, [1]);
  assert.ok(P.acts.includes('lift'), '두 팔 번쩍');
  assert.deepEqual(bag, [], '가방은 아직');
  run(fx, ITEM_GET.hold + 0.1);
  assert.deepEqual(bag, ['🌾']);
  assert.deepEqual(done, [1]);
  assert.equal(m.parent, null, '장면에서 빠짐');
  assert.equal(P.unico.label.visible, true);
  assert.equal(P.arrow.visible, true);
  run(fx, 1);
  assert.deepEqual(done, [1], 'onDone 은 한 번만');
});

test('itemGet: 한 번에 하나만 (새로 부르면 앞의 것은 바로 가방으로)', () => {
  const fx = new FX(new THREE.Scene(), { level: 'high' }), P = player();
  const bag = [];
  fx.onPop = (t) => bag.push(t);
  fx.itemGet(productMesh('egg'), P, { emoji: '🥚' });
  fx.itemGet(productMesh('milk'), P, { emoji: '🥛' });
  assert.deepEqual(bag, ['🥚']);
  run(fx, ITEM_GET.arc + ITEM_GET.hold + 0.2);
  assert.deepEqual(bag, ['🥚', '🥛']);
  assert.equal(fx.item, null);
});

test('itemGet: 멀리 이동하면(순간이동 등) 바로 가방으로', () => {
  const fx = new FX(new THREE.Scene(), null), P = player();
  let done = 0;
  fx.itemGet(productMesh('wool'), P, { emoji: '🧶', onDone: () => done++ });
  P.position.set(30, 0, 0);
  fx.update(DT);
  assert.equal(done, 1);
});

test('생산물 모양은 지오메트리를 함께 써서 끝나도 해제하지 않음 (다음 수확 모양이 깨지지 않게)', () => {
  const a = productMesh('egg'), b = productMesh('egg');
  assert.equal(a.children[0].geometry, b.children[0].geometry);
  const fx = new FX(new THREE.Scene(), null), P = player();
  let disposed = 0;
  a.children[0].geometry.addEventListener('dispose', () => disposed++);
  fx.itemGet(a, P, {});
  fx.finishItem();
  assert.equal(disposed, 0);
  assert.equal(sheafMesh().children[0].geometry, sheafMesh().children[0].geometry);
  assert.equal(productMesh('honey'), null, '모양이 없는 종류는 글자만');
});

test('itemGet: 머리 위 감정 아이콘(🎉)은 걷고, 솟는 동안 카메라 쪽으로 60°까지 돌아섰다가 끝나면 원래 방향', () => {
  // 준비: 카메라는 남쪽(+z), 유니코는 북쪽(facing π)을 봄, 머리 위에 🎉
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), null), P = player();
  P.unico.facing = Math.PI;
  P.unico.emote = { visible: true };
  P.unico.emoteUntil = 99;
  // 실행
  fx.itemGet(productMesh('egg'), P, { delay: 0.3 });
  // 확인
  assert.equal(P.unico.emoteUntil, -1, '감정 아이콘은 바로 걷힘');
  assert.equal(P.unico.facing, Math.PI, '기다리는 동안(뽑기 동작)은 그대로');
  run(fx, 0.32);
  const turned = Math.abs(Math.atan2(Math.sin(P.unico.facing - Math.PI), Math.cos(P.unico.facing - Math.PI)));
  assert.ok(Math.abs(turned - ITEM_GET.turn) < 1e-9, `돌아선 각 ${turned.toFixed(3)}`);
  run(fx, ITEM_GET.arc + ITEM_GET.hold + 0.1);
  assert.equal(P.unico.facing, Math.PI, '끝나면 원래 방향');
});

test('faceToward: 카메라가 30° 옆이면 그만큼만, 반대쪽이면 60°까지만', () => {
  assert.ok(Math.abs(faceToward(0, 0, 0, Math.sin(0.5), Math.cos(0.5)) - 0.5) < 1e-9);
  assert.ok(Math.abs(faceToward(Math.PI, 0, 0, 0, 10) - (Math.PI - Math.PI / 3)) < 1e-9 || Math.abs(faceToward(Math.PI, 0, 0, 0, 10) - (Math.PI + Math.PI / 3)) < 1e-9);
});

test('물건은 머리 뼈보다 ITEM_GET.lift 위에 머묾 (뿔과 겹치지 않게 1.1m 이상)', () => {
  const fx = new FX(new THREE.Scene(), null), P = player();
  const head = new THREE.Object3D(); head.position.set(0, 1.6, 0); head.updateMatrixWorld();
  P.unico.headG = head;
  const m = productMesh('milk');
  fx.itemGet(m, P, {});
  run(fx, ITEM_GET.arc + 0.1);
  assert.ok(ITEM_GET.lift >= 1.1);
  assert.ok(Math.abs(m.position.y - (1.6 + ITEM_GET.lift)) < 0.06, `높이 ${m.position.y.toFixed(2)}`);
});

test('벼 한 단은 그리기 2번 (짚·이삭 둘로 합침) → 폰 낮음 품질에서 수확할 때 드로우콜이 크게 늘지 않음', () => {
  const g = sheafMesh();
  let meshes = 0;
  g.traverse((o) => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 2);
  let wool = 0;
  productMesh('wool').traverse((o) => { if (o.isMesh) wool++; });
  assert.ok(wool <= 1, `양털 ${wool}`);
});
