import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, isPinchStart, PINCH_MS } from '../src/game/input.js';

// 브라우저 없이: window·canvas 는 이벤트 등록만 받는 가짜
const W = 400, H = 800;
globalThis.window ??= { addEventListener() {} };
globalThis.window.innerWidth = W;
const canvas = { addEventListener() {}, setPointerCapture() {} };

const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
/** 손가락 상태를 들고 터치 이벤트를 만들어 보내는 도우미 */
function rig() {
  const inp = new Input(canvas);
  const joyCalls = [];
  inp.onJoystick = (on) => joyCalls.push(on);
  const down = new Map();
  return {
    inp, joyCalls,
    start(now, ...ts) { for (const t of ts) down.set(t.identifier, t); inp.touchStart({ type: 'touchstart', changedTouches: ts, touches: [...down.values()] }, now); },
    move(...ts) { for (const t of ts) down.set(t.identifier, t); inp.touchMove({ type: 'touchmove', changedTouches: ts, touches: [...down.values()] }); },
    end(now, ...ids) { const ts = ids.map((id) => down.get(id)); for (const id of ids) down.delete(id); inp.touchEnd({ type: 'touchend', changedTouches: ts, touches: [...down.values()] }, now); },
  };
}

test('왼쪽 한 손가락 = 조이스틱, 짧게 떼면 탭(터치 표시)으로 들어감', () => {
  const r = rig();
  r.start(0, T(1, 100, 600));
  assert.equal(r.inp.joy.active, true);
  r.move(T(1, 130, 600));
  assert.ok(r.inp.joy.x > 0.4);
  r.end(400, 1);
  assert.equal(r.inp.joy.active, false);
  assert.equal(r.inp.clicks.length, 0, '움직이고 늦게 뗀 건 탭 아님');
  r.start(1000, T(2, 300, 300));
  r.end(1100, 2);
  assert.deepEqual(r.inp.clicks, [{ x: 300, y: 300, touch: true }]);
});

test('화면 가운데를 걸친 핀치: 조이스틱이 취소되고 줌만 됨 (걷기·시점 회전 없음)', () => {
  const r = rig();
  r.start(0, T(1, 160, 400));                 // 왼쪽 반 → 처음엔 조이스틱
  assert.equal(r.inp.joy.active, true);
  r.start(60, T(2, 250, 420));                // 60ms 뒤 오른쪽 반 → 핀치
  assert.equal(r.inp.joy.active, false);
  assert.equal(r.joyCalls.at(-1), false, '조이스틱 표시도 숨김');
  assert.equal(r.inp.touches.size, 2);
  r.move(T(1, 140, 400), T(2, 280, 420));     // 벌리기
  r.move(T(1, 120, 400), T(2, 300, 420));
  assert.ok(r.inp.wheel < 0, '벌리면 가까이 (wheel < 0)');
  assert.equal(r.inp.drag.dx, 0);
  assert.equal(r.inp.drag.dy, 0);
  assert.equal(r.inp.axis().x, 0);
  r.end(300, 1, 2);
  assert.equal(r.inp.clicks.length, 0, '핀치 손가락은 탭이 아님');
});

test('두 손가락이 왼쪽 반에서 함께 닿아도(같은 이벤트) 핀치', () => {
  const r = rig();
  r.start(0, T(1, 80, 400), T(2, 150, 460));
  assert.equal(r.inp.joy.active, false);
  assert.equal(r.inp.touches.size, 2);
  r.move(T(1, 70, 390), T(2, 170, 480));
  r.move(T(1, 60, 380), T(2, 190, 500));
  assert.ok(r.inp.wheel < 0);
});

test('핀치를 끝내고 한 손가락만 떼도 시점이 홱 돌지 않음', () => {
  const r = rig();
  r.start(0, T(1, 260, 300));
  r.start(500, T(2, 330, 500));               // 늦게 닿음 → 두 시점 손가락 (기존 핀치)
  r.move(T(1, 240, 250), T(2, 350, 560));
  r.move(T(1, 200, 200), T(2, 380, 640));      // 크게 벌림
  r.inp.endFrame();
  r.end(900, 2);                              // 한 손가락 떼기
  r.move(T(1, 202, 201));                     // 남은 손가락이 2px 움직임
  assert.equal(r.inp.drag.dx, 2);
  assert.equal(r.inp.drag.dy, 1);
});

test('걸으면서 시점 돌리기: 이미 움직인 조이스틱은 그대로, 오른손은 시점 드래그', () => {
  const r = rig();
  r.start(0, T(1, 100, 600));
  r.move(T(1, 100, 560));                     // 앞으로 걷는 중 (40px)
  r.start(100, T(2, 300, 600));               // 100ms 뒤라도 조이스틱이 움직였으면 핀치 아님
  assert.equal(r.inp.joy.active, true);
  assert.ok(r.inp.axis().y < -0.5);
  r.move(T(2, 330, 600));
  assert.equal(r.inp.drag.dx, 30);
  assert.equal(r.inp.wheel, 0);
});

test('조이스틱을 잡은 채 오른쪽 두 손가락으로 핀치해도 조이스틱은 계속 반응', () => {
  const r = rig();
  r.start(0, T(1, 100, 600));
  r.move(T(1, 100, 570));
  r.start(500, T(2, 260, 300));
  r.start(800, T(3, 330, 400));
  assert.equal(r.inp.touches.size, 2);
  r.move(T(2, 250, 290), T(3, 340, 410));
  r.move(T(1, 140, 600), T(2, 240, 280), T(3, 350, 420)); // 같은 이벤트에 조이스틱 이동
  assert.ok(r.inp.joy.x > 0.5, '핀치 중에도 조이스틱 갱신');
  assert.ok(r.inp.wheel < 0);
});

test('isPinchStart: 시간 안·안 움직임·가까움일 때만', () => {
  const a = { x: 100, y: 400, t: 0, moved: 0 };
  assert.equal(isPinchStart(a, { x: 220, y: 420, t: 80 }, 390), true);
  assert.equal(isPinchStart(a, { x: 220, y: 420, t: PINCH_MS + 1 }, 390), false);
  assert.equal(isPinchStart({ ...a, moved: 20 }, { x: 220, y: 420, t: 80 }, 390), false);
  assert.equal(isPinchStart(a, { x: 760, y: 400, t: 40 }, 844), false, '가로 폰 양손 엄지는 멀리 떨어짐');
});
