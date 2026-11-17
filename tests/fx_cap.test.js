// 입자 FX: 동시에 떠 있는 개수 상한과 상한에 걸린 별 고리 (src/game/fx.js)
// mobile_gaps.test.js 에서 나눔 — FX 모듈을 바꾸는 배치가 이 파일을 고침
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FX, fxCap } = await import('../src/game/fx.js');
const { SURF } = await import('../src/game/surface.js');

// ---------------------------------------------------------------- 입자 상한
test('FX: 동시에 떠 있는 입자는 낮음 48개, 그 밖 128개까지 (넘으면 더 만들지 않음)', () => {
  assert.equal(fxCap({ level: 'low' }), 48);
  assert.equal(fxCap({ level: 'high' }), 128);
  assert.equal(fxCap(null), 128);
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), { level: 'low' });
  for (let i = 0; i < 10; i++) fx.burst(0, 1, 0, 0xffd75a, 12);
  fx.sprinkle(0, 0);
  fx.dust(0, 0);
  assert.equal(fx.items.length, 48);
  assert.equal(fx.live, 48);
  assert.ok(fx.group.children.length <= 48, '메시도 상한까지만 만듦');
  for (let i = 0; i < 40; i++) fx.update(0.05);
  assert.equal(fx.items.length, 0);
  assert.equal(fx.live, 0, '끝난 입자는 수에서 빠짐');
  fx.setQuality({ level: 'medium' });
  for (let i = 0; i < 12; i++) fx.burst(0, 1, 0, 0xffd75a, 12);
  assert.equal(fx.live, 128);
});

test('FX: 상한에 걸린 별 터지기는 개수를 줄여 고른 고리로 (한쪽으로 쏠리지 않음)', () => {
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), { level: 'low' });
  fx.sprinkle(0, 0); fx.sprinkle(0, 0); // 28
  for (let i = 0; i < 4; i++) fx.dust(0, 0); // 40
  assert.equal(fx.live, 40);
  fx.burst(0, 1, 0, 0xffd75a, 24);
  const stars = fx.items.filter((it) => it.star);
  assert.equal(stars.length, 8, '남은 8개만');
  assert.equal(fx.live, 48);
  const ang = stars.map((it) => Math.atan2(it.obj.userData.v.z, it.obj.userData.v.x)).map((a) => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  ang.forEach((a, i) => assert.ok(Math.abs(a - (i / 8) * Math.PI * 2) < 1e-9, `${i}번째 별 각도`));
  fx.burst(0, 1, 0, 0xffd75a, 24); // 가득 차면 아무것도 안 만듦
  assert.equal(fx.items.filter((it) => it.star).length, 8);
});

// ---------------------------------------------------------------- 떠오르는 글자: 가방으로 날리기 끄기
test('FX.pop: to 가 없으면 가방 날리기(onPop)를 부르지 않음 (수확 별·하트는 떠오르기만)', () => {
  SURF.seeCam.value.set(0, 5, 10);
  const ctx = { measureText: (t) => ({ width: t.length * 20 }), clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, fillText() {} };
  const had = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 300, height: 150, getContext: () => ctx }) }; // 글자표용 가짜 캔버스
  const fx = new FX(new THREE.Scene(), { level: 'high' });
  const flown = [];
  fx.onPop = (t) => flown.push(t);
  fx.pop(0, 0, '⭐⭐', { fly: false });
  assert.deepEqual(flown, []);
  assert.ok(fx.items.some((it) => !it.kind), '글자는 그대로 떠오름');
  fx.pop(0, 0, '💕');
  assert.deepEqual(flown, [], '기본은 떠오르기만 (물건이 아닌 것은 가방으로 날아가지 않음)');
  fx.pop(0, 0, '🥕', { to: 'bag' });
  assert.deepEqual(flown, ['🥕'], "to:'bag' 일 때만 가방으로");
  if (had) globalThis.document = had; else delete globalThis.document;
});


test('FX.pop 글자: 덮어쓰기 재질 패스(GTAO 법선)에서는 크기 0 으로 건너뜀 → 글자 둘레 검은 판 없음', () => {
  SURF.seeCam.value.set(0, 5, 10);
  const ctx = { measureText: (t) => ({ width: t.length * 20 }), clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, fillText() {} };
  const had = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 300, height: 150, getContext: () => ctx }) };
  const scene = new THREE.Scene();
  const fx = new FX(scene, { level: 'high' });
  fx.pop(1, 2, '⭐⭐⭐', { fly: false });
  const s = fx.items.find((it) => !it.kind).obj;
  assert.equal(s.material.depthWrite, false);
  s.updateMatrixWorld(true);
  s.onBeforeRender(null, scene);
  assert.notEqual(s.matrixWorld.elements[0], 0, '보통 그리기는 그대로');
  scene.overrideMaterial = new THREE.MeshNormalMaterial();
  s.onBeforeRender(null, scene);
  assert.ok(s.matrixWorld.elements.slice(0, 15).every((v) => v === 0), '덮어쓰기 패스: 크기 0');
  scene.overrideMaterial = null;
  s.updateMatrixWorld(true);
  assert.equal(s.matrixWorld.elements[12], 1, '다음 계산 때 제자리');
  if (had) globalThis.document = had; else delete globalThis.document;
});
