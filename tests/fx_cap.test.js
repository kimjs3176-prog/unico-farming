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

