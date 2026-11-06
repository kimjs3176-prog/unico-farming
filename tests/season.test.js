import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, growthMult, priceMult, DAYS_PER_SEASON, SEASONS } from '../src/game/sim/season.js';
import { FarmSim } from '../src/game/sim/farm.js';
import { CROPS } from '../src/game/sim/crops.js';

test('계절: 7일마다 봄→여름→가을→겨울, 28일 지나면 다음 해 봄', () => {
  assert.equal(seasonOf(1).id, 'spring'); assert.equal(seasonOf(1).dayIn, 1);
  assert.equal(seasonOf(7).id, 'spring'); assert.equal(seasonOf(7).dayIn, 7);
  assert.equal(seasonOf(8).id, 'summer'); assert.equal(seasonOf(8).dayIn, 1);
  assert.equal(seasonOf(15).id, 'autumn');
  assert.equal(seasonOf(22).id, 'winter');
  const next = seasonOf(1 + DAYS_PER_SEASON * 4);
  assert.equal(next.id, 'spring'); assert.equal(next.year, 2);
  assert.equal(seasonOf(0).id, 'spring', '잘못된 날짜도 안전');
  assert.equal(seasonOf(NaN).id, 'spring');
});

test('제철 작물: 25% 빨리 자라고 10% 비싸게, 겨울엔 ×0.6, 제철 작물은 모두 실제 작물', () => {
  const sp = seasonOf(1), wi = seasonOf(22);
  assert.equal(growthMult(sp, 'strawberry'), 1.25);
  assert.equal(growthMult(sp, 'corn'), 1);
  assert.equal(priceMult(sp, 'strawberry'), 1.1);
  assert.equal(priceMult(sp, 'corn'), 1);
  assert.equal(growthMult(wi, 'carrot'), 0.6);
  for (const s of SEASONS) for (const c of s.crops) assert.ok(CROPS[c], `${s.id}: ${c}`);
  // 모든 작물이 1년에 한 번 이상 제철
  for (const c of Object.keys(CROPS)) assert.ok(SEASONS.some((s) => s.crops.includes(c)), c);
});

test('밭: growthMult 를 주면 그만큼 빨리 자람 (주지 않으면 예전과 같음 — 도트판 호환)', () => {
  const grow = (mult) => {
    const f = new FarmSim(1);
    f.weedChance = 0;
    if (mult) f.growthMult = () => mult;
    f.till(0); f.plant(0, 'carrot'); f.water(0);
    f.tick(10);
    return f.plots[0].progress;
  };
  const base = grow(null);
  assert.ok(base > 0);
  assert.ok(Math.abs(grow(1.25) / base - 1.25) < 1e-9);
});
