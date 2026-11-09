// 입력 정리: reset·잃어버린 조이스틱 손가락
import test from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 없이: 세로 터치 폰처럼 보이게 하는 최소 흉내 (각 시험 파일은 따로 실행됨)
const el = () => ({ className: '', innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.matchMedia = (q) => ({ matches: /coarse|max-width: 600px/.test(q) });

const { Input } = await import('../src/game/input.js');

// ---------------------------------------------------------------- 입력 정리
test('입력: reset 으로 눌린 것 모두 정리, 조이스틱 손가락을 잃어버려도 다음 터치에서 풀림', () => {
  const I = new Input({ addEventListener() {}, setPointerCapture() {} });
  const joy = [];
  I.onJoystick = (on) => joy.push(on);
  const t = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  I.touchStart({ changedTouches: [t(1, 50, 600)], touches: [t(1, 50, 600)] }, 0);
  assert.equal(I.joy.active, true);
  // 손가락 1을 뗀 이벤트를 못 받은 채 새 손가락 2가 왼쪽에 닿음 → 1은 풀리고 2가 조이스틱
  I.touchStart({ changedTouches: [t(2, 60, 620)], touches: [t(2, 60, 620)] }, 1000);
  assert.equal(I.joy.id, 2);
  I.keys.add('KeyW'); I.clicks.push({ x: 1, y: 1 }); I.interactTap = true; I.virtual.y = -1;
  I.reset();
  assert.equal(I.joy.active, false);
  assert.equal(joy.at(-1), false);
  assert.deepEqual(I.axis(), { x: 0, y: 0 });
  assert.equal(I.clicks.length, 0);
  assert.equal(I.interact(), false);
});
