// 불꽃놀이 (함께 수확 달성): src/game/fx.js 의 fireworks — 한 발 = 점 묶음 하나, 오름 → 터짐 → 사라짐
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FX, FIREWORKS, skipOverride } = await import('../src/game/fx.js');
const { SURF } = await import('../src/game/surface.js');
const { heightAt } = await import('../src/game/terrain.js');

test('불꽃놀이: 높음 5발, 한 발은 그리기 한 번(점 묶음)이고 머리 위 3~5m 에서 카메라 쪽으로 터짐', () => {
  // 준비
  SURF.seeCam.value.set(0, 6, 12);
  const fx = new FX(new THREE.Scene(), { level: 'high' });
  // 실행
  fx.fireworks(0, 0, 'high');
  for (let i = 0; i < 32; i++) fx.update(0.05); // 1.6초 (마지막 발이 1.52초에 오름)
  // 확인: 다섯 발 모두 떠 있음
  assert.equal(fx.rockets.length, FIREWORKS.high.shots);
  const g = heightAt(0, 0);
  for (const r of fx.rockets) {
    assert.ok(r.o.isPoints, '점 묶음');
    assert.ok(r.s.y - g >= 3 && r.s.y - g <= 5, `터지는 높이 ${(r.s.y - g).toFixed(2)}m`);
    assert.equal(r.o.material.map, fx.rockets[0].o.material.map, '둥근 빛 그림은 함께 씀');
    assert.equal(r.o.onBeforeRender, skipOverride, '주변광 차폐 패스에서 빼기 (빼지 않으면 불꽃 둘레에 검은 사각형)');
    assert.equal(r.o.userData.flash.onBeforeRender, skipOverride);
  }
  assert.ok(fx.rockets[0].s.z > 0.5, `카메라(+z) 쪽으로 당김 ${fx.rockets[0].s.z.toFixed(2)}`);
  assert.equal(fx.items.length, 0, '입자 상한(별·먼지)과 따로');
});

test('불꽃놀이: 터진 별은 둥글게 퍼지고, 다 사라지면 숨겼다가 다시 씀 (낮음은 한 발)', () => {
  // 준비
  SURF.seeCam.value.set(0, 6, 12);
  const fx = new FX(new THREE.Scene(), { level: 'low' });
  // 실행: 오름 끝 → 터짐
  fx.fireworks(0, 0, 'low');
  fx.update(0.01); fx.update(0.5);
  const r = fx.rockets[0];
  // 확인
  assert.equal(fx.rockets.length, 1);
  assert.equal(r.phase, 1);
  assert.equal(r.o.userData.flash.visible, true, '가운데 번쩍');
  for (let i = 0; i < 4; i++) fx.update(0.1);
  const pos = r.o.geometry.attributes.position.array;
  let minX = Infinity, maxX = -Infinity;
  for (let k = 0; k < r.n; k++) { minX = Math.min(minX, pos[k * 3]); maxX = Math.max(maxX, pos[k * 3]); }
  assert.ok(maxX - minX > 1.5, `퍼진 폭 ${(maxX - minX).toFixed(2)}m`);
  for (let i = 0; i < 40; i++) fx.update(0.1);
  assert.equal(fx.rockets.length, 0);
  assert.equal(r.o.visible, false);
  fx.fireworks(0, 0, 'low');
  fx.update(0.01);
  assert.equal(fx.rockets[0].o, r.o, '다시 씀');
});
