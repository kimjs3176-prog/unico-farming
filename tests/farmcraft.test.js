import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FarmSim, starsOf, FARM_LEVELS } from '../src/game/sim/farm.js';
import { Composter, Processor, Orders, RECIPES, dailyOrders, COMPOST_TIME, ORDER_ALL_BONUS } from '../src/game/sim/farmcraft.js';
import { CROPS } from '../src/game/sim/crops.js';
import { ITEMS } from '../src/game/sim/items.js';

const grow = (opts = {}) => {
  const f = new FarmSim(6);
  f.rng = () => 0.99;
  f.till(0); f.plant(0, opts.crop || 'carrot');
  if (opts.fert) f.fertilize(0);
  const T = CROPS[opts.crop || 'carrot'].growTime;
  for (let t = 0; t < T * 4 && f.plots[0].state !== 'ready'; t += 1) {
    if (opts.water !== false && f.plots[0].water <= 0) f.water(0);
    if (opts.weeds) f.plots[0].weeds = true;
    f.tick(1);
  }
  return f;
};

test('quality: well-watered crops are ★★★, neglected ones ★, fertilizer speeds growth', () => {
  assert.equal(grow().harvest(0).stars, 3);
  const dry = grow({ water: false });
  assert.equal(dry.harvest(0).stars, 1);
  assert.equal(starsOf(0.8), 2);
  const a = new FarmSim(1), b = new FarmSim(1);
  for (const f of [a, b]) { f.till(0); f.plant(0, 'corn'); f.water(0); }
  b.fertilize(0);
  a.tick(20); b.tick(20);
  assert.ok(b.plots[0].progress > a.plots[0].progress * 1.25);
  assert.equal(b.fertilize(0), false, '퇴비는 한 번만');
});

test('giant crops triple the harvest; regrowing crops come back half-grown', () => {
  const f = new FarmSim(1);
  f.rng = () => 0; // 무조건 대왕
  f.till(0); f.plant(0, 'carrot'); f.water(0);
  f.tick(CROPS.carrot.growTime * 1.2);
  assert.ok(f.plots[0].giant);
  const r = f.harvest(0);
  assert.ok(r.giant);
  assert.equal(r.amount % 3, 0);
  const s = grow({ crop: 'strawberry' });
  const h1 = s.harvest(0);
  assert.ok(h1.regrow);
  assert.equal(s.plots[0].state, 'growing');
  assert.equal(s.plots[0].progress, 0.5);
  for (let k = 0; k < CROPS.strawberry.regrow; k++) { s.plots[0].state = 'ready'; s.harvest(0); }
  assert.equal(s.plots[0].state, 'tilled', '정해진 횟수 뒤에는 밭이 빔');
});

test('farming skill levels up from harvests and sprinklers water their rows', () => {
  const f = new FarmSim(18, 6);
  f.xp = FARM_LEVELS[2] - 1;
  assert.equal(f.level, 2);
  f.till(0); f.plant(0, 'carrot'); f.plots[0].state = 'ready';
  assert.equal(f.harvest(0).levelUp, 3);
  f.sprinklerRows = 1;
  for (const i of [1, 7]) { f.till(i); f.plant(i, 'carrot'); }
  f.tick(1);
  assert.ok(f.plots[1].water > 0, '첫 줄은 자동으로 물');
  assert.equal(f.plots[7].water, 0, '둘째 줄은 아님');
});

test('composter turns 3 materials into 1 compost over time', () => {
  const c = new Composter();
  assert.equal(c.add(20), 12);
  c.tick(COMPOST_TIME * 2 + 1);
  assert.equal(c.ready, 2);
  assert.equal(c.take(), 2);
  assert.equal(c.mats, 6);
});

test('processor: jars, recipes, collect; goods are worth more than raw crops', () => {
  const p = new Processor();
  assert.equal(p.freeSlot(), 0);
  assert.ok(p.start(0, 'goods_kimchi'));
  assert.ok(p.start(1, 'goods_juice'));
  assert.equal(p.freeSlot(), -1);
  assert.equal(p.start(2, 'goods_jam'), false, '장독 2개뿐');
  p.tick(RECIPES.goods_juice.time);
  assert.equal(p.collect(1), 'goods_juice');
  assert.equal(p.collect(0), null);
  assert.ok(p.buyJar() && p.buyJar() && !p.buyJar());
  for (const [id, r] of Object.entries(RECIPES)) {
    const raw = Object.entries(r.input).reduce((a, [k, n]) => a + (CROPS[k]?.basePrice ?? 85) * n, 0);
    assert.ok(ITEMS[id].price > raw * 1.15, id);
  }
  assert.ok(Processor.canMake('goods_kimchi', (k) => (k === 'cabbage' ? 3 : 0)));
});

test('daily orders are stable per day, deliverable once, with an all-done bonus', () => {
  assert.deepEqual(dailyOrders(4, 3, 2), dailyOrders(4, 3, 2));
  const o = new Orders();
  const list = o.today(4, 3, 2);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map((x) => x.item)).size, 3);
  let bonus = 0;
  for (let i = 0; i < 3; i++) { const r = o.deliver(i, 4, 3, 2, () => true); assert.ok(r.reward > 0); bonus += r.allBonus; }
  assert.equal(bonus, ORDER_ALL_BONUS);
  assert.equal(o.deliver(0, 4, 3, 2, () => true), null);
  assert.equal(o.deliver(0, 4, 3, 2, () => false), null);
  assert.ok(o.today(5, 3, 2).every((x) => !x.done), '다음 날 새 주문');
});
