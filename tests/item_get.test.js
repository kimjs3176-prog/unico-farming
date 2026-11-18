// 얻은 물건 보여 주기 (src/game/fx.js FX.itemGet): 논 벼 한 단·목장 달걀/우유/양털
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FX, ITEM_GET } = await import('../src/game/fx.js');
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
