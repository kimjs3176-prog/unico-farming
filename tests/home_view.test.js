import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 브라우저 없이: 화면 덮개(div)와 다음 프레임 호출만 흉내
const el = () => ({ className: '', innerHTML: '', classList: { add() {}, remove() {} }, remove() {}, append() {} });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();

const { HomeView } = await import('../src/game/view/home_view.js');
const { IO } = await import('../src/game/view/home_interior.js');

function fakeGame() {
  const days = [];
  const g = {
    days,
    world: {
      scene: new THREE.Scene(), obstacles: [], time: 21 / 24, day: 3, daylight: 0.2,
      onNewDay: (d) => days.push(d), clockText: () => '3일차 21:00',
    },
    ui: { closePanel() {}, toast() {}, panel: null },
    audio: { play() {} },
    player: { frozen: false, position: new THREE.Vector3(), moveTarget: null, unico: { playAction() {}, floorY: null, facing: 0, group: new THREE.Group() } },
    followCam: { yaw: 1.2, pitch: 0.45, distance: 9, first: false },
    tractor: { driving: false },
    onEvent() {},
  };
  return g;
}

test('잠드는 동안 침대·책상 잠자기를 여러 번 눌러도 하루는 한 번만 넘어감', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame(), h = new HomeView(g);
  h.inside = true;
  h.sleep(); h.sleep(); h._use('bed'); h.sleep();
  t.mock.timers.tick(1300);
  assert.deepEqual(g.days, [4]);
  assert.equal(g.world.day, 4);
  assert.equal(h.sim.sleeps, 1);
  assert.equal(g.player.frozen, false);
  // 깬 뒤에는 다시 잘 수 있음 (다음 날 밤)
  g.world.time = 22 / 24;
  h.sleep();
  t.mock.timers.tick(1300);
  assert.deepEqual(g.days, [4, 5]);
});

test('어두운 사이 자정이 지나 이미 날이 넘어갔으면 다시 넘기지 않음', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame(), h = new HomeView(g);
  h.inside = true;
  g.world.time = 23.95 / 24;
  h.sleep();
  // world.update 가 자정을 넘김
  g.world.day = 4; g.world.onNewDay(4);
  t.mock.timers.tick(1300);
  assert.deepEqual(g.days, [4]);
  assert.equal(g.world.day, 4);
});

test('잠드는 동안 가구 안내에는 상호작용이 없음', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame(), h = new HomeView(g);
  h.inside = true;
  const bed = h.room.spots.find((s) => s.key === 'bed');
  const at = new THREE.Vector3(IO.x + bed.x, IO.y, IO.z + bed.z);
  assert.ok(h._updateInside(0.016, at).onInteract, '평소에는 침대 안내');
  h.sleep();
  assert.equal(h._updateInside(0.016, at).onInteract, undefined);
  t.mock.timers.tick(1300);
  assert.ok(h._updateInside(0.016, at).onInteract);
});

test('문 앞에서 E 를 두 번 눌러도 한 번만 들어가고, 나오면 바깥 카메라 그대로', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame(), h = new HomeView(g), cam = g.followCam;
  assert.equal(h.roomLight.visible, false, '밖에서는 방 불빛을 장면 계산에서 뺌');
  h.enter(); h.enter();
  t.mock.timers.tick(450);
  assert.equal(h.inside, true);
  assert.equal(h.roomLight.visible, true);
  h.enter();
  t.mock.timers.tick(450);
  h.leave(); h.leave();
  t.mock.timers.tick(450);
  assert.equal(h.inside, false);
  assert.equal(h.roomLight.visible, false);
  assert.deepEqual([cam.yaw, cam.pitch, cam.distance], [1.2, 0.45, 9]);
});

test('들어가는 페이드 중에 지도로 이동하면 방으로 끌려가지 않음', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame(), h = new HomeView(g);
  h.enter();
  h.leave(true);
  t.mock.timers.tick(1000);
  assert.equal(h.inside, false);
  assert.equal(h.roomLight.visible, false);
});
