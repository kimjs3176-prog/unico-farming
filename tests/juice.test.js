// 손맛(juice): 팝(겹쳐도 원래 크기로·몸만), 카메라 흔들림·밀림(쌓이지 않음·움직임 줄이기), 등급별 손맛·히트스톱 (src/game/juice.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { Juice, popCurve, kickEnvelope, TIERS } = await import('../src/game/juice.js');

const step = (j, sec, cam = null, dt = 1 / 60) => { for (let i = 0; i < Math.round(sec / dt); i++) j.update(dt, cam); };

test('팝 곡선: 먼저 눌리고(아래) → 늘어난 뒤(위) → 정확히 1로, 끝은 늘 1', () => {
  const a = 0.3;
  assert.ok(popCurve(0.17, a) < 0.85);
  assert.ok(popCurve(0.45, a) > 1.12);
  assert.equal(popCurve(1, a), 1);
  let prev = popCurve(0, a);
  for (let u = 0.01; u <= 1.0001; u += 0.01) { const y = popCurve(Math.min(1, u), a); assert.ok(Math.abs(y - prev) < 0.1, `끊김 없음 u=${u.toFixed(2)}`); prev = y; }
});

test('팝 두 번이 겹쳐도 끝나면 원래 크기 그대로 (찌그러진 채 남지 않음), 부피는 유지', () => {
  const j = new Juice();
  const o = new THREE.Object3D();
  o.scale.set(1.2, 0.9, 1.1);
  const base = o.scale.clone();
  j.pop(o, 0.2);
  step(j, 0.08);
  j.pop(o, 0.35); // 진행 중 다시: 하나로 합쳐 처음부터
  assert.equal(j.pops.length, 1);
  step(j, 0.05);
  const v = o.scale.x * o.scale.y * o.scale.z, v0 = base.x * base.y * base.z;
  assert.ok(Math.abs(v / v0 - 1) < 1e-6, '부피 유지');
  step(j, 1);
  assert.deepEqual(o.scale.toArray(), base.toArray());
  assert.equal(j.pops.length, 0);
  assert.equal(o.userData.pop, undefined);
});

test('팝 중에 다른 코드가 매 프레임 크기를 정해도(목장 새끼 성장) 끝날 때 오래된 크기로 되돌리지 않음', () => {
  const j = new Juice();
  const o = new THREE.Object3D();
  let grow = 0.5;
  o.scale.setScalar(grow);
  j.pop(o, 0.2);
  for (let i = 0; i < 60; i++) { grow += 0.005; o.scale.setScalar(grow); j.update(1 / 60, null); }
  assert.equal(j.pops.length, 0);
  assert.deepEqual(o.scale.toArray(), [grow, grow, grow], '지금 크기 그대로');
});

test('캐릭터 팝은 몸(root)만: 이름표·내 표시 링이 붙은 group 은 그대로', () => {
  const j = new Juice();
  const group = new THREE.Group(), root = new THREE.Group();
  group.add(root);
  group.userData.popTarget = root;
  j.pop(group, 0.3);
  step(j, 0.05);
  assert.deepEqual(group.scale.toArray(), [1, 1, 1]);
  assert.ok(root.scale.y < 0.95);
  step(j, 1);
  assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
});

const camera = () => {
  const c = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  c.position.set(0, 4, 9); c.lookAt(0, 1, 0); c.updateMatrixWorld();
  return c;
};

test('약한 흔들림(0.2 미만)은 카메라 밀림 + 내 캐릭터 히트스톱, 센 흔들림은 트라우마', () => {
  const stops = [];
  const had = 'game' in globalThis, prev = globalThis.game;
  globalThis.game = { player: { unico: { hitStop: (s) => stops.push(s) } } };
  try {
    const j = new Juice();
    j.shake(0.08);
    assert.equal(j.trauma, 0);
    assert.ok(j._kick && j._kick.m > 0.04, '밀림');
    assert.deepEqual(stops, [TIERS[1].stop]);
    j.shake(0.25);
    assert.equal(j.trauma, 0.25);
    assert.equal(stops.length, 1, '센 흔들림(천둥 등)은 멈칫 없음');
    // 내 동작이 아닌 가벼운 충격: 밀림만, 멈칫 없음 / 다른 캐릭터를 멈칫
    j._kick = null;
    j.shake(0.1, { stop: false });
    assert.ok(j._kick, '밀림은 그대로');
    assert.equal(stops.length, 1, 'stop:false 면 내 캐릭터 멈칫 없음');
    const other = [];
    j.shake(0.1, { actor: { hitStop: (s) => other.push(s) } });
    assert.equal(stops.length, 1);
    assert.deepEqual(other, [TIERS[1].stop], '지정한 캐릭터만 멈칫');
  } finally { if (had) globalThis.game = prev; else delete globalThis.game; }
});

test('흔들림·밀림은 카메라에 쌓이지 않음: 따라가기 카메라가 다시 놓지 않은 프레임에는 먼저 되돌리고, 끝나면 정확히 제자리', () => {
  const j = new Juice();
  const c = camera();
  const p0 = c.position.clone(), q0 = c.quaternion.clone();
  j.feedback(2, new THREE.Vector3(1, 0, 0));
  let moved = 0;
  for (let i = 0; i < 6; i++) { j.update(1 / 60, c); moved = Math.max(moved, c.position.distanceTo(p0)); }
  assert.ok(moved > 0.03, `보일 만큼 흔들림 ${moved.toFixed(3)}m`);
  assert.ok(moved < 0.4, '너무 크지 않게');
  step(j, 1.5, c);
  assert.ok(c.position.distanceTo(p0) < 1e-9, '제자리');
  assert.ok(c.quaternion.angleTo(q0) < 1e-6);
  // 매 프레임 카메라를 다시 놓는 경우(따라가기 카메라)도 그 위에만 더함
  j.feedback(1);
  for (let i = 0; i < 5; i++) { c.position.copy(p0); c.quaternion.copy(q0); j.update(1 / 60, c); }
  assert.ok(c.position.distanceTo(p0) > 0.001);
  c.position.copy(p0); c.quaternion.copy(q0);
  step(j, 0.5, c);
  assert.ok(c.position.distanceTo(p0) < 1e-9);
});

test('밀림 곡선: 약 50ms 에 가장 세고 약 210ms 에 0', () => {
  assert.ok(kickEnvelope(0.05) > 0.99);
  assert.ok(kickEnvelope(0.02) > 0 && kickEnvelope(0.02) < 1);
  assert.equal(kickEnvelope(0.25), 0);
  assert.ok(kickEnvelope(0.15) < 0.6);
});

test('큰 충격(3등급): 시야각이 잠깐 좁아졌다 원래 값으로, 컷신 중에는 시야각 그대로', () => {
  const j = new Juice();
  const c = camera();
  const fov0 = c.fov;
  j.feedback(3, null, { stop: false });
  let minFov = fov0;
  for (let i = 0; i < 6; i++) { j.update(1 / 60, c); minFov = Math.min(minFov, c.fov); }
  assert.ok(minFov < fov0 - 1, '시야 펀치');
  step(j, 1, c);
  assert.equal(c.fov, fov0);
  const had = 'game' in globalThis, prev = globalThis.game;
  globalThis.game = { cinema: { locked: true } };
  try {
    j.feedback(3, null, { stop: false });
    for (let i = 0; i < 6; i++) { j.update(1 / 60, c); assert.equal(c.fov, fov0); }
  } finally { if (had) globalThis.game = prev; else delete globalThis.game; }
});

test('움직임 줄이기(설정·접근성): 흔들림·밀림·시야 펀치는 끄고 팝·히트스톱은 그대로', () => {
  const stops = [];
  const actor = { hitStop: (s) => stops.push(s) };
  const j = new Juice();
  j.screenShake = false;
  const c = camera(), p0 = c.position.clone(), fov0 = c.fov;
  j.feedback(3, null, { actor });
  j.shake(0.5);
  for (let i = 0; i < 10; i++) j.update(1 / 60, c);
  assert.ok(c.position.distanceTo(p0) < 1e-9);
  assert.equal(c.fov, fov0);
  assert.deepEqual(stops, [TIERS[3].stop]);
  const o = new THREE.Object3D();
  j.pop(o, 0.3);
  j.update(0.05, null);
  assert.ok(o.scale.y < 1, '팝은 그대로');
  // 브라우저의 움직임 줄이기 설정
  const keep = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const k = new Juice();
    k.shake(0.08); k.shake(0.5);
    assert.equal(k._kick, null);
    assert.equal(k.trauma, 0);
  } finally { if (keep) globalThis.matchMedia = keep; else delete globalThis.matchMedia; }
});
