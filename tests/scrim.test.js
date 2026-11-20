import test from 'node:test';
import assert from 'node:assert/strict';
import { armScrim } from '../src/ui/scrim.js';

// 이벤트만 흉내 내는 가짜 요소 (DOM 없이)
const fakeEl = () => {
  const on = {};
  const el = {
    addEventListener: (t, f) => { (on[t] ||= []).push(f); },
    fire: (t, target = el) => { for (const f of on[t] || []) f({ type: t, target }); },
  };
  return el;
};

test('말풍선을 누른 손가락의 뒤늦은 click(배경막에서 pointerdown 없음)은 창을 닫지 않음', () => {
  // 준비
  let n = 0;
  const el = armScrim(fakeEl(), () => n++);
  // 실행: pointerdown 은 말풍선에서, click 만 새 배경막에 떨어짐
  el.fire('click');
  // 확인
  assert.equal(n, 0);
});

test('배경막에서 누르고 뗀 click 은 창을 닫음 (한 번만)', () => {
  let n = 0;
  const el = armScrim(fakeEl(), () => n++);
  el.fire('pointerdown');
  el.fire('click');
  assert.equal(n, 1);
  el.fire('click'); // 다음 click 은 다시 pointerdown 이 있어야
  assert.equal(n, 1);
});

test('누름이 취소되거나 다른 곳(창 안 자식)에서 시작하면 닫지 않음', () => {
  let n = 0;
  const el = armScrim(fakeEl(), () => n++);
  el.fire('pointerdown');
  el.fire('pointercancel');
  el.fire('click');
  el.fire('pointerdown', {});
  el.fire('click');
  assert.equal(n, 0);
});
