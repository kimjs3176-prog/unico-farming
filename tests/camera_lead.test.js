// 따라가기 카메라 앞쪽 내다보기 (src/game/camera.js FollowCamera.lead)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FollowCamera, LEAD, leadWant } = await import('../src/game/camera.js');

const WALK = 4.6; // 걷는 속도 m/s
const BIKE = 10;  // 자전거 속도 m/s
const DT = 1 / 60;
const INPUT = { drag: { dx: 0, dy: 0 }, wheel: 0 };

/** 카메라 기준 앞(+)·오른쪽(+) 성분 */
const split = (c, v) => { const { fwd, right } = c.basis(); return [v.x * fwd.x + v.z * fwd.z, v.x * right.x + v.z * right.z]; };

/** (vx, vz) 로 sec 초 걷기 */
function walk(c, pos, vx, vz, sec, input = INPUT) {
  for (let t = 0; t < sec - 1e-9; t += DT) { pos.x += vx * DT; pos.z += vz * DT; c.update(DT, input, pos); }
}

test('처음 프레임(first)에는 내다보기가 0 이고 바라보는 점은 따라가기 점', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  c.update(DT, INPUT, new THREE.Vector3(3, 0, 2));
  assert.equal(c.lead.length(), 0);
  assert.ok(c.look.distanceTo(c.smooth) < 1e-9);
});

test('카메라 쪽으로 2초 걸으면 바라보는 점이 카메라 쪽으로 1.3m 이상, 따라가기 점은 유니코 그대로', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera()); // yaw 0: 카메라는 남쪽(+Z)
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, 0, WALK, 2);
  const [f] = split(c, c.lead);
  assert.ok(-f >= 1.3, `카메라 쪽 내다보기 ${(-f).toFixed(2)}m`);
  assert.ok(-f <= LEAD.towardMax + 1e-9);
  const lag = Math.hypot(c.smooth.x - pos.x, c.smooth.z - pos.z);
  assert.ok(lag < 0.8, `따라가기 점은 내다보기 없이 유니코 곁 (늦음 ${lag.toFixed(2)}m)`);
  assert.ok(c.smooth.z <= pos.z + 1e-9, '따라가기 점이 유니코보다 앞서지 않음');
});

test('옆으로 걸으면 0.6m 까지만, 멀어지면 조금만', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, WALK, 0, 3);
  const [, r] = split(c, c.lead);
  assert.ok(r > 0.4 && r <= LEAD.sideMax + 1e-9, `옆 ${r.toFixed(2)}m`);
  const c2 = new FollowCamera(new THREE.PerspectiveCamera());
  const p2 = new THREE.Vector3();
  c2.update(DT, INPUT, p2);
  walk(c2, p2, 0, -WALK, 3);
  const [f] = split(c2, c2.lead);
  assert.ok(f > 0.3 && f <= LEAD.awayMax + 1e-9, `멀어지는 쪽 ${f.toFixed(2)}m`);
});

test('창·컷신(input 없음)이면 3초 안에 0.05m 아래로 돌아감', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, 0, WALK, 2);
  assert.ok(c.lead.length() > 1);
  walk(c, pos, 0, 0, 3, null);
  assert.ok(c.lead.length() < 0.05, `남은 내다보기 ${c.lead.length().toFixed(3)}m`);
});

test('자전거(뒤따르는 카메라)로 빨리 달리면 앞쪽을 더 내다봄, 순간이동은 내다보기를 지움', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, 0, -BIKE, 3); // 카메라(남쪽)에서 멀어지며 북쪽으로
  const [f] = split(c, c.lead);
  assert.ok(f > LEAD.awayMax && f <= LEAD.awayFastMax + 1e-9, `자전거 내다보기 ${f.toFixed(2)}m`);
  pos.set(40, 0, -30);
  c.update(DT, INPUT, pos);
  assert.equal(c.lead.length(), 0, '순간이동 뒤 0');
});

test('바라보는 높이 보정 중(옷장)에는 내다보기 없음', () => {
  assert.deepEqual(leadWant(0, 0), [0, 0]);
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  c.lookOffsetY = -1.25;
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, 0, WALK, 2);
  assert.ok(c.lead.length() < 1e-9);
});

test('걷다가·자전거로 돌아서도 내다보기는 한 프레임(60fps)에 LEAD.rate/60 m 넘게 움직이지 않음', () => {
  for (const [v, name] of [[WALK, '걷기'], [BIKE, '자전거']]) {
    // 준비: 카메라에서 멀어지다가 돌아서 카메라 쪽으로
    const c = new FollowCamera(new THREE.PerspectiveCamera());
    const pos = new THREE.Vector3();
    c.update(DT, INPUT, pos);
    walk(c, pos, 0, -v, 3);
    const prev = c.lead.clone();
    let max = 0;
    // 실행
    for (let i = 0; i < 180; i++) { pos.z += v * DT; c.update(DT, INPUT, pos); max = Math.max(max, c.lead.distanceTo(prev)); prev.copy(c.lead); }
    // 확인
    assert.ok(max <= LEAD.rate * DT + 1e-9, `${name} 한 프레임 ${max.toFixed(4)}m`);
    assert.ok(max <= 0.05, `${name} 0.05m 이하`);
  }
});

test('창·컷신(input 없음) 동안 밖에서 읽는 따라가기 점(smooth)은 실제 바라보는 점과 같음 → 컷신이 이어받을 때 튀지 않음', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  const pos = new THREE.Vector3();
  c.update(DT, INPUT, pos);
  walk(c, pos, 0, WALK, 2);
  const before = c.look.clone();
  c.update(DT, null, pos);
  assert.ok(c.smooth.distanceTo(c.look) < 1e-9);
  assert.ok(c.look.distanceTo(before) < 0.05, `바라보는 점 이동 ${c.look.distanceTo(before).toFixed(3)}m`);
  c.update(DT, INPUT, pos);
  assert.ok(c.smooth.distanceTo(c.base) < 1e-9, '조작이 돌아오면 다시 내다보기 없는 점');
});
