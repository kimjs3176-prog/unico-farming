// 두 발 유니콘 걸음: 디딘 발이 미끄러지지 않는 걷기/달리기 (unico.js bipedGait·legAngle), 기울기 → 걷기/달리기 속도 (player.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// 브라우저 없이: 모델 파일은 디스크에서, 캔버스는 빈 흉내
globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${url}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const ctx2d = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} };
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };

const { Unico, loadUnicoMesh, bipedGait, legAngle, runBlend, GAIT } = await import('../src/game/unico.js');
const { stickSpeed, arriveSpeed, WALK_SPEED, RUN_SPEED } = await import('../src/game/player.js');
await loadUnicoMesh('unico_biped.bin', 'biped');
await loadUnicoMesh('unico_biped_lod.bin', 'biped_lod');
await loadUnicoMesh('unico_body.bin', 'quad');

const L = 0.32; // 두 발 유니콘 다리 길이 (unico_mesh.js biped legLen)

/** 디딘 발의 땅 위 속도를 디딤 동안 적분: 몸 속도 v − 다리가 발을 뒤로 미는 속도 L·cosθ·dθ/dt */
function stanceSlip(v) {
  const r = runBlend(v), g = bipedGait(v, L, r);
  let sum = 0, max = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const u = ((i + 0.5) / N) * g.beta, du = 1e-6;
    const th = legAngle(u, g.beta, g.A), dth = (legAngle(u + du, g.beta, g.A) - th) / du * g.cad;
    const slip = Math.abs(v - L * Math.cos(th) * dth) / v;
    sum += slip; max = Math.max(max, slip);
  }
  return { mean: sum / N, max, g, r };
}

test('디딘 발이 땅에 붙음: 걷기 1.9·달리기 4.6·푹 잔 날 5.3m/s 모두 미끄러짐 평균 10%·최대 20% 미만, 걸음 주기 3.8Hz 이하', () => {
  for (const v of [1.9, 4.6, 5.3]) {
    const s = stanceSlip(v);
    assert.ok(s.mean < 0.1, `${v}m/s 평균 미끄러짐 ${s.mean.toFixed(3)}`);
    assert.ok(s.max < 0.2, `${v}m/s 최대 미끄러짐 ${s.max.toFixed(3)}`);
    assert.ok(s.g.cad <= GAIT.cadMax + 1e-9, `${v}m/s 걸음 주기 ${s.g.cad.toFixed(2)}Hz`);
    assert.ok(s.g.cad >= GAIT.cadMin - 1e-9);
  }
  // 달리기는 발이 공중에 뜨는 순간이 있고(디딤 비율 0.5 미만), 걷기는 늘 한 발이 땅에
  assert.equal(stanceSlip(1.9).r, 0);
  assert.equal(stanceSlip(4.6).r, 1);
  assert.ok(stanceSlip(4.6).g.beta < 0.4);
  assert.equal(stanceSlip(1.9).g.beta, 0.5);
});

test('다리 각도: 디딤 끝·듦 끝이 이어지고(튀지 않음), 멈추면(속도 0) 다리가 곧게', () => {
  for (const v of [0.6, 1.9, 4.6]) {
    const g = bipedGait(v, L, runBlend(v));
    const e = 1e-7;
    assert.ok(Math.abs(legAngle(g.beta - e, g.beta, g.A) - legAngle(g.beta, g.beta, g.A)) < 1e-4, '디딤 → 듦');
    assert.ok(Math.abs(legAngle(1 - e, g.beta, g.A) - legAngle(0, g.beta, g.A)) < 1e-4, '듦 → 다음 디딤');
    assert.ok(Math.abs(legAngle(0, g.beta, g.A) + g.A) < 1e-9, '디딜 때 발은 앞(-A)');
  }
  const still = bipedGait(0, L, 0);
  assert.equal(still.A, 0);
  assert.equal(legAngle(0.3, still.beta, still.A), 0);
});

test('기울기 → 속도: 데드존·살짝(0.9부터)~반쯤(걷기 1.9)·끝까지(달리기 4.6)·경계에서 깜빡이지 않음·Shift 는 걷기', () => {
  assert.equal(stickSpeed(0.08).speed, 0, '데드존 안');
  assert.equal(stickSpeed(0.08, true).run, false, '손을 떼면 달리기 기억을 지움');
  // 걷기 구간은 기울기를 따라 매끄럽게 빨라짐 (0.9 → 1.9)
  const a = stickSpeed(0.13).speed, b = stickSpeed(0.3).speed, c = stickSpeed(0.45).speed, d = stickSpeed(0.599).speed;
  assert.ok(a > 0.85 && a < 1.0, `살짝 ${a}`);
  assert.ok(a < b && b < c && c < d, '기울일수록 빨라짐');
  assert.ok(d > WALK_SPEED - 0.01 && d <= WALK_SPEED, `달리기 직전 ${d}`);
  assert.equal(WALK_SPEED, 1.9);
  assert.equal(stickSpeed(1).speed, RUN_SPEED);
  assert.equal(RUN_SPEED, 4.6);
  // 0.45~0.6 사이에서는 지난 상태 그대로
  assert.equal(stickSpeed(0.55, false).run, false);
  assert.equal(stickSpeed(0.55, true).run, true);
  assert.equal(stickSpeed(0.44, true).run, false);
  assert.equal(stickSpeed(1, false, true).speed, WALK_SPEED, 'Shift');
  assert.equal(stickSpeed(0.55, true).speed, RUN_SPEED, '달리던 중이면 0.45 까지 달리기 속도');
  // 탭 이동: 멀면 달리고 가까워지면 걷기 속도까지
  assert.equal(arriveSpeed(6), RUN_SPEED);
  assert.equal(arriveSpeed(0.3), WALK_SPEED);
  const mid = arriveSpeed(1.5);
  assert.ok(mid > WALK_SPEED && mid < RUN_SPEED);
});

/** 실제 캐릭터를 v 로 +x 방향 이동시키며 디딘 발(디딤 위상인 다리)의 땅 위 미끄러짐을 잼 */
function runUnico(u, v, frames = 240) {
  const foot = (leg) => leg.localToWorld(new THREE.Vector3(0, -u.legLen, 0));
  const dt = 1 / 60;
  u.facing = u.yaw = Math.PI / 2;
  for (let k = 0; k < 120; k++) { u.group.position.x += v * dt; u.moving = true; u.update(dt, null); }
  let prev = null, sum = 0, n = 0, max = 0, minY = Infinity;
  for (let k = 0; k < frames; k++) {
    u.group.position.x += v * dt; u.moving = true; u.update(dt, null); u.group.updateMatrixWorld(true);
    const f = u.legs.map(foot), b = u.gaitNow.beta, st = [u._gaitU < b, (u._gaitU + 0.5) % 1 < b];
    if (prev) for (let i = 0; i < 2; i++) if (st[i] && prev.st[i]) { const s = Math.hypot(f[i].x - prev.f[i].x, f[i].z - prev.f[i].z) / dt / v; sum += s; n++; max = Math.max(max, s); }
    minY = Math.min(minY, f[0].y, f[1].y);
    prev = { f, st };
  }
  return { mean: sum / n, max, minY };
}

test('실제 뼈대: 주인공 걷기·달리기 모두 디딘 발 미끄러짐 10% 미만, 드는 발은 땅을 파고들지 않음', () => {
  for (const v of [1.9, 4.6]) {
    const u = new Unico(null, { rig: 'biped' });
    u.labelAlways = true;
    new THREE.Scene().add(u.group);
    const m = runUnico(u, v);
    assert.ok(m.mean < 0.1, `${v}m/s 평균 ${m.mean.toFixed(3)}`);
    assert.ok(m.max < 0.2, `${v}m/s 최대 ${m.max.toFixed(3)}`);
    assert.ok(m.minY > -0.015, `발이 땅 아래로 ${m.minY.toFixed(3)}m`);
    assert.equal(u.runBlend, v > 3 ? 1 : 0);
  }
});

test('달리기 자세: 더 숙이고 팔을 크게 흔듦, 발소리(onStep)는 발 닿는 순간에 달리기 섞임을 함께 넘김', () => {
  const pose = (v) => {
    const u = new Unico(null, { rig: 'biped' });
    u.labelAlways = true;
    new THREE.Scene().add(u.group);
    const steps = [];
    let late = false;
    u.onStep = (x, z, r) => { if (late) steps.push(r); };
    let pitch = 0, arm = 0;
    const dt = 1 / 60;
    u.facing = u.yaw = 0;
    for (let k = 0; k < 240; k++) { late = k > 120; u.group.position.z += v * dt; u.moving = true; u.update(dt, null); if (late) { pitch += u.bodyG.rotation.x; arm = Math.max(arm, Math.abs(u.arms[0].rotation.x)); } }
    return { pitch: pitch / 119, arm, steps };
  };
  const walk = pose(1.9), run = pose(4.6);
  assert.ok(run.pitch > walk.pitch + 0.1, `달리면 더 숙임 ${walk.pitch.toFixed(2)} → ${run.pitch.toFixed(2)}`);
  assert.ok(run.arm > walk.arm * 1.4, '팔 흔들기');
  // 먼지는 두 발짝에 한 번 (약 2초 동안)
  assert.ok(walk.steps.length >= 4 && walk.steps.every((r) => r === 0), `걷기 발 먼지 (r=0) ${walk.steps.length}`);
  assert.ok(run.steps.length > walk.steps.length && run.steps.every((r) => r > 0.99), '달리기 발 먼지 (r=1)');
  assert.ok(run.steps.length / (119 / 60) < 6, `달려도 먼지는 예전(초당 6번)보다 적게: 초당 ${(run.steps.length / (119 / 60)).toFixed(1)}`);
});

test('달리다 멈추면 한 번 제동(먼지 두 번), 걷다 멈추거나 1.5초 안에 다시 멈추면 제동 없음', () => {
  const u = new Unico(null, { rig: 'biped' });
  u.labelAlways = true;
  new THREE.Scene().add(u.group);
  const puffs = [];
  u.onStep = (x, z, r) => puffs.push(r);
  const go = (v, sec) => { for (let k = 0; k < sec * 60; k++) { u.group.position.z += v / 60; u.moving = true; u.update(1 / 60, null); } };
  const stop = (sec) => { let skid = 0; const n = puffs.length; for (let k = 0; k < sec * 60; k++) { u.moving = false; u.update(1 / 60, null); if (u._skid > 0) skid++; } return { skid, puffs: puffs.length - n }; };
  go(4.6, 2);
  const a = stop(0.5);
  assert.ok(a.skid > 10, '제동 자세');
  assert.equal(a.puffs, 2, '먼지 두 번');
  go(4.6, 0.6);
  assert.equal(stop(0.5).skid, 0, '1.5초 안에는 한 번만');
  go(1.9, 2);
  assert.equal(stop(0.5).skid, 0, '걷다 멈춤');
});

test('주민 동물·네 발 담당·수영은 달리기 섞임 0 (예전 걸음 그대로)', () => {
  const q = new Unico(null, {});
  q.labelAlways = true;
  new THREE.Scene().add(q.group);
  for (let k = 0; k < 120; k++) { q.group.position.z += 4.6 / 60; q.moving = true; q.update(1 / 60, null); }
  assert.equal(q.runBlend, 0);
  const s = new Unico(null, { rig: 'biped' });
  s.labelAlways = true; s.swimming = true;
  new THREE.Scene().add(s.group);
  for (let k = 0; k < 120; k++) { s.group.position.z += 4.6 / 60; s.moving = true; s.update(1 / 60, null); }
  assert.equal(s.runBlend, 0);
  assert.ok(s.legs.every((l) => l.scale.y === 1), '헤엄칠 때 다리 길이 그대로');
});
