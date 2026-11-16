import test from 'node:test';
import assert from 'node:assert/strict';
import { jumpStep, JUMP_V, GRAVITY } from '../src/game/player.js';

/** 점프 한 번을 dt 간격으로 끝까지 진행 → 최고 높이·공중 시간 */
function simulate(dt) {
  let y = 1e-4, v = JUMP_V, t = 0, peak = 0, landed = false;
  while (!landed && t < 5) { const r = jumpStep(y, v, dt); y = r.y; v = r.v; landed = r.landed; t += dt; peak = Math.max(peak, y); }
  return { peak, t, y, v, landed };
}

test('점프: 높이 약 0.9m, 공중 약 0.6초 뒤 땅(0)에 내려앉음', () => {
  // 실행
  const r = simulate(1 / 60);
  // 확인
  assert.equal(r.landed, true);
  assert.equal(r.y, 0); assert.equal(r.v, 0);
  assert.ok(Math.abs(r.peak - (JUMP_V ** 2) / (2 * GRAVITY)) < 0.06, `최고 높이 ${r.peak.toFixed(3)}m`);
  assert.ok(r.t > 0.55 && r.t < 0.65, `공중 ${r.t.toFixed(3)}초`);
});

test('점프: 프레임이 끊겨도(1/20초) 높이·공중 시간이 크게 다르지 않음', () => {
  const a = simulate(1 / 60), b = simulate(1 / 20);
  assert.ok(Math.abs(a.peak - b.peak) < 0.1, `60fps ${a.peak.toFixed(2)} vs 20fps ${b.peak.toFixed(2)}`);
  assert.ok(Math.abs(a.t - b.t) < 0.06, `60fps ${a.t.toFixed(2)}초 vs 20fps ${b.t.toFixed(2)}초`);
});

test('점프: 땅 아래로 파고들지 않음 (내려앉는 프레임에 정확히 0)', () => {
  const r = jumpStep(0.01, -3, 0.05);
  assert.deepEqual(r, { y: 0, v: 0, landed: true });
});
