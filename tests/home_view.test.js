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
    ride: { driving: false },
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

/** compileAsync 를 부를 때의 상태(대상 버퍼·방 불빛)를 기록하는 흉내 렌더러 */
function fakeRenderer(h) {
  return {
    rt: 'prev', calls: [],
    getRenderTarget() { return this.rt; },
    setRenderTarget(t) { this.rt = t; },
    compileAsync(o) { this.calls.push({ o, rt: this.rt, light: h.roomLight.visible }); return Promise.resolve(); },
  };
}

test('낮음(후처리 없음) 첫 입장 셰이더 준비: 방·내 캐릭터·늘 그리는 동물·방까지 닿는 큰 묶음을 화면 대상으로, 한 번만', () => {
  const g = fakeGame();
  g.postfx = { enabled: false, composer: { readBuffer: { isRenderTarget: true } } };
  g.camera = new THREE.PerspectiveCamera();
  const lit = () => new THREE.MeshStandardMaterial();
  // 컬링 끈 동물 · 맵 전체 지형 묶음(경계 구가 방 높이까지) · 맵 위 작은 나무 · 빛 안 받는 효과 · 숨긴 동물
  const animal = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit()); animal.frustumCulled = false;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lit()); ground.rotation.x = -Math.PI / 2;
  const tree = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), lit()); tree.position.set(20, 1.5, 30);
  const spark = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); spark.frustumCulled = false;
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit()); hidden.frustumCulled = false; hidden.visible = false;
  g.world.scene.add(animal, ground, tree, spark, hidden);
  g.world.scene.updateMatrixWorld(true);
  const h = new HomeView(g);
  assert.equal(h.roomLight.visible, false, '밖에서는 방 불빛을 장면 계산에서 뺌');
  const r = (g.renderer = fakeRenderer(h));
  h._warmRoom();
  assert.equal(r.calls.length, 1, '한 번에 준비');
  const objs = r.calls[0].o.children;
  assert.equal(animal.parent, g.world.scene, '부모는 그대로');
  assert.equal(h.room.group.parent, g.world.scene);
  assert.ok(objs.includes(h.room.group));
  assert.ok(objs.includes(g.player.unico.group));
  assert.ok(objs.includes(animal), '컬링 끈 동물은 방 안에서도 그려짐');
  assert.ok(objs.includes(ground), '경계 구가 방 높이까지 내려오는 큰 메시도 방 카메라에 걸림');
  assert.ok(!objs.includes(tree) && !objs.includes(spark) && !objs.includes(hidden));
  for (const c of r.calls) {
    assert.equal(c.rt, null, '실제로 그리는 대상(화면)으로');
    assert.equal(c.light, true, '방 불빛을 켠 상태로');
  }
  assert.equal(r.rt, 'prev', '대상 버퍼는 원래대로');
  assert.equal(h.roomLight.visible, false);
  const n = r.calls.length;
  h._warmRoom();
  assert.equal(r.calls.length, n, '한 번만');
});

test('후처리를 쓰는 품질: 방 불빛은 밖에서도 세기 0 으로 장면에 둠 (들어갈 때 셰이더 새로 만들 일 없음)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame();
  g.postfx = { enabled: true, composer: { readBuffer: { isRenderTarget: true } } };
  g.camera = new THREE.PerspectiveCamera();
  const h = new HomeView(g);
  const r = (g.renderer = fakeRenderer(h));
  assert.equal(h.roomLight.visible, true);
  assert.equal(h.roomLight.intensity, 0);
  h.enter();
  assert.equal(r.calls.length, 0, '미리 준비할 것 없음');
  t.mock.timers.tick(450);
  assert.equal(h.inside, true);
  h.roomLight.intensity = 2; // 실내에서 켜짐
  h.leave();
  t.mock.timers.tick(450);
  assert.equal(h.inside, false);
  assert.equal(h.roomLight.visible, true);
  assert.equal(h.roomLight.intensity, 0);
  // 품질이 낮아져 후처리가 꺼지면 (셰이더가 어차피 모두 바뀔 때) 밖에서 불빛을 뺌, 다시 켜지면 되돌림
  const far = new THREE.Vector3(500, 0, 500);
  g.postfx.enabled = false;
  h.update(0.016, far);
  assert.equal(h.roomLight.visible, false);
  g.postfx.enabled = true;
  h.update(0.016, far);
  assert.equal(h.roomLight.visible, true);
  assert.equal(h.roomLight.intensity, 0);
});
