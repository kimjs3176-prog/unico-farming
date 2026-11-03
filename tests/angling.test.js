import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReelFight, RODS, dailyRequest, Angling, needsFight } from '../src/game/sim/angling.js';
import { FishingSim } from '../src/game/sim/fishing.js';
import { FarmSim } from '../src/game/sim/farm.js';
import { ITEMS } from '../src/game/sim/items.js';

/** 결정적 난수 */
const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

const play = (fish, size, rod, policy, seed) => {
  const f = new ReelFight(fish, size, rod, seeded(seed));
  for (let t = 0; t < 90 && f.state === 'fight'; t += 1 / 30) f.tick(1 / 30, policy(f));
  return f.state;
};
const smart = (f) => f.tension < 0.62 && !f.surging;

test('reel fight: holding forever snaps, never reeling lets it escape', () => {
  assert.equal(play('fish_trout', 40, RODS[0], () => true, 3), 'snapped');
  assert.equal(play('fish_trout', 40, RODS[0], () => false, 3), 'escaped');
});

test('reel fight: careful play lands normal fish; legendary needs better rods', () => {
  for (let s = 1; s <= 20; s++) assert.equal(play('fish_snakehead', 90, RODS[0], smart, s), 'landed');
  const wins = (rod) => Array.from({ length: 40 }, (_, s) => play('fish_sturgeon', 200, rod, smart, s + 1)).filter((x) => x === 'landed').length;
  assert.ok(wins(RODS[0]) < wins(RODS[1]) && wins(RODS[1]) <= wins(RODS[2]));
  assert.ok(wins(RODS[2]) >= 36, '황금 낚싯대 + 요령이면 거의 성공');
});

test('lake-only fish never appear in the pond; night-only fish only at night', () => {
  const sim = new FishingSim(seeded(7));
  for (let i = 0; i < 400; i++) {
    const pond = sim.cast({ lake: false, night: true });
    assert.notEqual(ITEMS[pond].where, 'lake');
    const day = sim.cast({ lake: true, night: false });
    assert.ok(!ITEMS[day].night, day);
    assert.ok(!['fish_loach', 'fish_minnow', 'fish_snail'].includes(day));
  }
});

test('better rod and bait make rare fish more common', () => {
  const rareShare = (rare) => {
    const sim = new FishingSim(seeded(11));
    let n = 0;
    for (let i = 0; i < 3000; i++) if (ITEMS[sim.cast({ lake: true, rare })].rarity >= 3) n++;
    return n;
  };
  assert.ok(rareShare(1.7 * 1.35) > rareShare(1) * 1.4);
});

test('daily request is deterministic per day and claimable once after catching', () => {
  assert.deepEqual(dailyRequest(5), dailyRequest(5));
  const A = new Angling();
  const r = A.today(5);
  assert.equal(A.claim(5), null);
  assert.equal(A.record(r.fish, r.min - 1, 5).request, false);
  assert.equal(A.record(r.fish, r.min, 5).request, true);
  assert.deepEqual(A.claim(5), { money: r.reward, bait: r.bait });
  assert.equal(A.claim(5), null);
  assert.equal(A.today(6).done, false, '다음 날은 새 의뢰');
});

test('rod upgrades need level and coins; save round-trips', () => {
  const A = new Angling();
  assert.equal(A.canUpgrade(99999, 1).reason, 'level');
  assert.equal(A.canUpgrade(10, 5).reason, 'money');
  assert.ok(A.canUpgrade(RODS[1].price, RODS[1].level).ok);
  A.upgrade(); A.upgrade(); A.upgrade();
  assert.equal(A.rodInfo.id, 'gold');
  assert.equal(A.canUpgrade(1e9, 99).reason, 'max');
  const B = new Angling(); B.load(JSON.parse(JSON.stringify(A.toJSON())));
  assert.equal(B.rod, 2);
  assert.ok(needsFight('fish_trout', 30) && !needsFight('fish_crucian', 13));
});

test('weeds slow growth until hoed, weeding loosens soil', () => {
  const grow = (weedy) => {
    const f = new FarmSim(1);
    f.till(0); f.plant(0, 'carrot'); f.water(0);
    if (weedy) f.plots[0].weeds = true;
    f.tick(5);
    return f;
  };
  assert.ok(grow(true).plots[0].progress < grow(false).plots[0].progress * 0.6);
  const f = grow(true);
  assert.equal(f.actionFor(0, true).type, 'weed');
  assert.ok(f.weed(0));
  assert.equal(f.plots[0].weeds, false);
  assert.ok(f.plots[0].loose > 0);
  const g = new FarmSim(1); g.till(0); g.plant(0, 'carrot');
  for (let i = 0; i < 100; i++) g.tick(1);
  assert.ok(!g.plots[0].weeds, '기본값(weedChance 0)에서는 잡초가 나지 않음');
});
