import test from 'node:test';
import assert from 'node:assert/strict';
import { RiceSim, RICE_STAGES, thresh } from '../src/game/sim/rice.js';
import { FishingSim, rollBug, BITE_WINDOW } from '../src/game/sim/fishing.js';
import { Collection } from '../src/game/sim/collection.js';
import { Villagers } from '../src/game/sim/villagers.js';
import { Economy } from '../src/game/sim/economy.js';
import { ITEMS } from '../src/game/sim/items.js';

const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

/** 이상적인 물 관리를 하는 플레이어 봇 */
function tendWell(r, i, dt) {
  const p = r.paddies[i];
  if (p.state !== 'growing') return;
  const [lo, hi] = RICE_STAGES[p.stage].water;
  if (p.water < lo) r.water(i, lo + (hi - lo) / 2 - p.water);
  if (p.water > hi) r.drain(i, p.water - (lo + (hi - lo) / 2));
  while (p.weeds) r.weed(i);
}

test('rice: full cycle with good care yields high grade', () => {
  const r = new RiceSim(1, seeded(3));
  assert.equal(r.actionsFor(0, true)[0].type, 'till');
  assert.ok(r.till(0) && r.flood(0));
  assert.equal(r.actionsFor(0, false)[0].type, 'need_seed');
  assert.ok(r.plant(0));
  for (let t = 0; t < 400 && r.paddies[0].state !== 'ripe'; t++) { r.tick(1); tendWell(r, 0, 1); }
  assert.equal(r.paddies[0].state, 'ripe');
  const h = r.harvest(0);
  assert.ok(h.quality >= 90, `quality ${h.quality}`);
  assert.equal(RiceSim.grade(h.quality), 5);
  assert.equal(r.paddies[0].state, 'dry');
  assert.ok(r.skill > 0);
});

test('rice: neglect lowers quality and weeds grow in shallow water', () => {
  const r = new RiceSim(1, seeded(5));
  r.till(0); r.flood(0); r.plant(0);
  r.paddies[0].water = 0;
  for (let t = 0; t < 900 && r.paddies[0].state !== 'ripe'; t++) r.tick(1);
  assert.equal(r.paddies[0].state, 'ripe', 'still ripens eventually');
  assert.ok(r.paddies[0].weeds > 0);
  const h = r.harvest(0);
  assert.ok(h.quality < 40, `quality ${h.quality}`);
  // 비가 오면 물이 찬다
  const r2 = new RiceSim(1); r2.till(0); r2.flood(0); r2.paddies[0].water = 0;
  r2.tick(10, { raining: true });
  assert.ok(r2.paddies[0].water > 3);
});

test('threshing efficiency', () => {
  assert.equal(thresh(10, 1), 10);
  assert.equal(thresh(10, 0), 6);
  assert.equal(thresh(1, 0), 1);
  assert.equal(thresh(0, 1), 0);
});

test('fishing: reel in bite window catches, early reel escapes', () => {
  const f = new FishingSim(seeded(7));
  const fish = f.cast();
  assert.ok(ITEMS[fish]);
  let ev;
  for (let i = 0; i < 200 && ev !== 'bite'; i++) ev = f.tick(0.05);
  assert.equal(ev, 'bite');
  const r = f.reel();
  assert.ok(r.ok && r.size >= ITEMS[fish].size[0] && r.size <= ITEMS[fish].size[1]);
  f.cast();
  assert.equal(f.reel().early, true);
  f.cast();
  for (let i = 0; i < 400 && f.state !== 'escaped'; i++) f.tick(0.05);
  assert.equal(f.state, 'escaped', `waiting past window (${BITE_WINDOW}s) lets the fish go`);
});

test('fishing rarity and bugs by time', () => {
  const f = new FishingSim(seeded(11));
  const counts = {};
  for (let i = 0; i < 3000; i++) { const k = f.cast(); counts[k] = (counts[k] || 0) + 1; }
  assert.ok((counts.fish_crucian || 0) > (counts.fish_goldfish || 0) * 5);
  assert.ok(counts.fish_goldfish > 0, 'legendary fish is possible');
  for (let s = 1; s < 30; s++) { const b = rollBug(seeded(s), { night: true }); assert.ok(['bug_firefly', 'bug_beetle', 'bug_dragonfly'].includes(b) || ITEMS[b].night, b); }
  for (let s = 1; s < 30; s++) assert.ok(!ITEMS[rollBug(seeded(s), { night: false })].night, '밤 곤충은 낮에 안 나옴');
  assert.notEqual(rollBug(seeded(2), { night: false }), 'bug_firefly');
});

test('collection book: new, record, completion reward', () => {
  const c = new Collection();
  assert.deepEqual(c.add('fish_carp', { size: 40 }), { isNew: true, isRecord: false });
  assert.equal(c.add('fish_carp', { size: 55 }).isRecord, true);
  assert.equal(c.add('fish_carp', { size: 30 }).isRecord, false);
  for (const k of ['fruit_apple', 'fruit_peach', 'fruit_pear', 'fruit_persimmon']) c.add(k);
  assert.deepEqual(c.claimCompletions(), [{ cat: 'fruit', money: 300 }]);
  assert.deepEqual(c.claimCompletions(), []);
});

test('villagers: daily talk, gifts, heart rewards, requests', () => {
  const v = new Villagers(seeded(1));
  assert.equal(v.talk('granny', 1).gained, 3);
  assert.equal(v.talk('granny', 1).gained, 0, 'once per day');
  const g = v.gift('granny', 'rice_5', 1);
  assert.ok(g.ok && g.liked);
  assert.equal(v.gift('granny', 'carrot', 1).reason, 'today');
  for (let d = 2; d < 12; d++) v.gift('granny', 'rice_5', d);
  assert.ok(v.hearts('granny') >= 5);
  assert.equal(v.state.granny.claimed, 5, 'every heart reward claimed exactly once');
  const r = v.requestFor('kid', 3, ['carrot']);
  assert.equal(r.item, 'carrot');
  assert.equal(v.requestFor('kid', 3, ['corn']).item, 'carrot', 'same request all day');
  assert.ok(v.fulfill('kid').reward > 0);
  assert.equal(v.fulfill('kid'), null);
});

test('economy handles rice grades, fish and seeds', () => {
  const e = new Economy(seeded(4));
  e.money = 1000;
  assert.ok(e.buyItem('rice_seed', 3));
  assert.equal(e.count('rice_seed'), 5);
  e.addItem('rice_5', 2); e.addItem('rice_1', 2); e.addItem('fish_carp', 1);
  assert.ok(e.sellPrice('rice_5') > e.sellPrice('rice_1') * 2);
  const before = e.money;
  const got = e.sellAll();
  assert.equal(e.money, before + got);
  assert.equal(e.count('rice_seed'), 5, 'sell all keeps seeds');
  assert.equal(e.count('rice_5'), 0);
  assert.ok(e.take('rice_seed', 2) && !e.take('rice_seed', 99));
});
