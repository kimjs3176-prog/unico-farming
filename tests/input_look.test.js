// 입력: 시점 끌기 뒤 자동 복귀 멈춤(lookHold), 시점 판정(input.looking), 한글 조합 Enter (src/game/input.js)
// mobile_gaps.test.js 에서 나눔 — 입력 모듈을 바꾸는 배치가 이 파일을 고침
import test from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 없이: window·canvas 는 이벤트 등록만 받는 가짜
globalThis.window ??= { addEventListener() {} };
globalThis.window.innerWidth = 400;
globalThis.innerWidth = 400; globalThis.innerHeight = 800;

const { Input, lookHold, isSubmitEnter } = await import('../src/game/input.js');

// ---------------------------------------------------------------- 트랙터 시점 복귀
test('시점 끌기: 끄는 동안과 손을 뗀 뒤 0.5초는 자동 복귀를 멈춤', () => {
  let h = lookHold(0, true, 1 / 60);
  assert.equal(h, 0.5);
  for (let i = 0; i < 20; i++) h = lookHold(h, false, 1 / 60); // 약 0.33초
  assert.ok(h > 0, '아직 기다리는 중');
  for (let i = 0; i < 20; i++) h = lookHold(h, false, 1 / 60);
  assert.equal(h, 0, '0.5초가 지나면 복귀');
  assert.equal(lookHold(undefined, false, 0.016), 0, '처음(값 없음)은 바로 복귀');
});

test('입력: looking 은 마우스 드래그·시점 터치만 (조이스틱 손가락은 빼고)', () => {
  const canvas = { addEventListener() {}, setPointerCapture() {} };
  const I = new Input(canvas);
  assert.equal(I.looking, false);
  I.drag.active = true;
  assert.equal(I.looking, true);
  I.drag.active = false;
  const ev = (id, x) => ({ type: 'touchstart', changedTouches: [{ identifier: id, clientX: x, clientY: 500 }], touches: [{ identifier: id, clientX: x, clientY: 500 }] });
  I.touchStart(ev(1, 60), 0); // 왼쪽 반 = 조이스틱
  assert.equal(I.joy.active, true);
  assert.equal(I.looking, false, '조이스틱은 시점이 아님');
  I.touchEnd({ type: 'touchend', changedTouches: [{ identifier: 1, clientX: 60, clientY: 500 }], touches: [] }, 100);
  I.touchStart(ev(2, 330), 1000); // 오른쪽 반 = 시점
  assert.equal(I.looking, true);
});

// ---------------------------------------------------------------- 한글 조합 Enter
test('입력칸 Enter: 한글 조합을 확정하는 Enter 는 보내기가 아님', () => {
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: false }), true);
  assert.equal(isSubmitEnter({ key: 'Enter' }), true);
  assert.equal(isSubmitEnter({ key: 'a', isComposing: false }), false);
});

