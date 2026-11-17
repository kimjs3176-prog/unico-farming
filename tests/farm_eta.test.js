// 밭 작물 남은 시간 (src/game/sim/farm.js rateOf·eta·soonest)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FarmSim, WATER_DURATION } from '../src/game/sim/farm.js';
import { CROPS } from '../src/game/sim/crops.js';

const sim0 = () => { const s = new FarmSim(18); s.rng = () => 0.99; s.weedChance = 0; return s; };
/** 실제로 익을 때까지 걸린 시간 */
function actual(s, i, dt = 0.05) {
  let t = 0;
  while (s.plots[i].state !== 'ready' && t < 2000) { s.tick(dt); t += dt; }
  return t;
}

test('물이 자라는 도중에 마름: 젖은 구간 + 마른 구간으로 나눠 셈 (당근 60초, 물 45초 → 95초)', () => {
  const s = sim0();
  s.till(0); s.plant(0, 'carrot'); s.water(0);
  const want = WATER_DURATION + (1 - WATER_DURATION / CROPS.carrot.growTime) * CROPS.carrot.growTime / 0.3;
  assert.ok(Math.abs(s.eta(0) - want) < 1e-6, `${s.eta(0)} ≈ ${want}`);
  // 중간에서 다시 셈해도 실제와 같음
  s.tick(20);
  const e = s.eta(0);
  assert.ok(Math.abs(actual(s, 0) - e) < 0.2, `eta ${e}`);
});

test('마른 밭·스프링클러 줄·김맨 흙·퇴비·계절 배수도 반영, 다 익음 0, 빈 밭 null', () => {
  const s = sim0();
  s.till(0); s.plant(0, 'carrot');
  assert.ok(Math.abs(s.eta(0) - 60 / 0.3) < 1e-6, '물 없음: 0.3 배');
  s.sprinklerRows = 1;
  assert.ok(Math.abs(s.eta(0) - 60) < 1e-6, '스프링클러 줄은 늘 젖음');
  s.sprinklerRows = 0;
  s.till(1); s.plant(1, 'carrot'); s.water(1); s.plots[1].loose = 10; s.fertilize(1);
  s.growthMult = () => 1.2;
  const e = s.eta(1);
  assert.ok(Math.abs(actual(s, 1) - e) < 0.2, `eta ${e}`);
  assert.equal(s.eta(1), 0);
  assert.equal(s.eta(5), null);
  // rateOf 는 tick 과 같은 배수
  assert.ok(Math.abs(s.rateOf({ crop: 'carrot', fert: true }, true) - 1.3 * 1.2) < 1e-9);
});

test('soonest: 가장 먼저 익는 밭, 마른 밭 있음, 다 익은 수', () => {
  const s = sim0();
  assert.deepEqual(s.soonest(), { i: -1, eta: null, dry: false, readyCount: 0 });
  s.till(2); s.plant(2, 'carrot'); s.water(2);
  s.till(3); s.plant(3, 'carrot');
  let r = s.soonest();
  assert.equal(r.i, 2);
  assert.equal(r.dry, true, '3번 밭이 마름');
  s.water(3);
  assert.equal(s.soonest().dry, false);
  s.plots[4].state = 'ready'; s.plots[4].crop = 'carrot';
  r = s.soonest();
  assert.equal(r.readyCount, 1);
  assert.equal(r.i, 2);
});
