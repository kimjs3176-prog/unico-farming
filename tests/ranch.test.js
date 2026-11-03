import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RanchSim, GROW_TIME, BARN, TROUGH_MAX } from '../src/game/sim/ranch.js';
import { RANCH_RECIPES, Processor, WORKSHOP_PRICES } from '../src/game/sim/farmcraft.js';
import { PRODUCTS, CROPS } from '../src/game/sim/crops.js';
import { ITEMS } from '../src/game/sim/items.js';

const ready = (r, a, day = 1) => { r.feed(a, day); r.tick(400, day); };

test('daily care raises hearts once per day; neglect lowers affection', () => {
  const r = new RanchSim([{ type: 'cow' }]);
  const a = r.animals[0];
  assert.equal(a.name, '얼룩이');
  assert.equal(r.actionFor(a, 1).type, 'feed');
  r.feed(a, 1);
  assert.equal(r.actionFor(a, 1).type, 'brush');
  assert.ok(r.brush(a, 1));
  assert.equal(r.brush(a, 1), null, '빗질은 하루 한 번');
  assert.equal(r.actionFor(a, 1).type, 'pet');
  assert.ok(r.pet(a, 1));
  assert.equal(r.pet(a, 1), null);
  assert.equal(r.actionFor(a, 1).type, 'wait');
  const aff = a.aff;
  r.newDay(2); assert.equal(a.aff, aff, '어제 돌봤으면 그대로');
  r.newDay(4); assert.ok(a.aff < aff, '며칠 돌보지 않으면 줄어듦');
});

test('hearts: ♥3 doubles products, ♥4+ sometimes gives a special product, happier animals produce faster', () => {
  const r = new RanchSim([{ type: 'chicken' }, { type: 'chicken' }], () => 0);
  const [lo, hi] = r.animals;
  hi.aff = 100;
  ready(r, lo); ready(r, hi);
  assert.deepEqual([r.harvest(lo).amount, r.harvest(lo)], [1, null]);
  const h = r.harvest(hi);
  assert.equal(h.amount, 2);
  assert.equal(h.gold, 'egg_gold');
  const s = new RanchSim([{ type: 'cow' }, { type: 'cow' }]);
  s.animals[1].aff = 100;
  s.feed(s.animals[0], 1); s.feed(s.animals[1], 1);
  s.tick(80, 1);
  assert.ok(s.animals[1].fedTimer < s.animals[0].fedTimer);
});

test('babies grow up (faster when petted), cannot be fed, and barn capacity limits purchases', () => {
  const r = new RanchSim([{ type: 'cow' }, { type: 'cow' }, { type: 'cow' }, { type: 'sheep' }, { type: 'sheep' }, { type: 'sheep' }]);
  assert.equal(r.room('cow'), 0);
  assert.equal(r.buy('cow'), null, '축사가 꽉 참');
  const chick = r.buy('chicken');
  assert.ok(chick && r.isBaby(chick));
  assert.equal(r.feed(chick, 1), false);
  r.pet(chick, 1);
  r.tick(GROW_TIME - 15, 1);
  assert.equal(r.isBaby(chick), false, '쓰다듬은 만큼 일찍 자람');
  assert.deepEqual(r.lastGrown, [chick]);
  assert.ok(r.upgradeBarn());
  assert.equal(r.room('cow'), BARN[1].big - 6);
});

test('auto feeder trough feeds hungry adults', () => {
  const r = new RanchSim([{ type: 'sheep' }, { type: 'sheep' }]);
  assert.equal(r.fillTrough(50), TROUGH_MAX);
  r.tick(1, 1);
  assert.equal(r.trough, TROUGH_MAX - 2);
  assert.equal(r.lastAutoFed.length, 2);
  assert.ok(r.animals.every((a) => a.fedTimer > 0));
});

test('save round-trip keeps names, hearts, babies and bought animals', () => {
  const r = new RanchSim([{ type: 'cow' }]);
  r.animals[0].aff = 64; r.rename(r.animals[0], '우리 소');
  r.buy('sheep'); r.trough = 5; r.xp = 99; r.upgradeBarn();
  const s = new RanchSim([{ type: 'cow' }]);
  s.load(JSON.parse(JSON.stringify(r.toJSON())));
  assert.equal(s.animals.length, 2);
  assert.equal(s.animals[0].name, '우리 소');
  assert.equal(s.hearts(s.animals[0]), 3);
  assert.ok(s.isBaby(s.animals[1]));
  assert.equal(s.animals[1].type, 'sheep');
  assert.deepEqual([s.trough, s.xp, s.barn], [5, 99, 1]);
  const old = new RanchSim([{ type: 'chicken' }]);
  old.load({ animals: [{ fedTimer: 3, product: null, happiness: 0.4 }] }); // 예전 저장 형식
  assert.equal(old.animals[0].type, 'chicken');
  assert.equal(old.isBaby(old.animals[0]), false);
});

test('ranch workshop goods are worth more than their ingredients', () => {
  const price = (k) => PRODUCTS[k]?.basePrice ?? CROPS[k]?.basePrice ?? ITEMS[k].price;
  for (const [id, R] of Object.entries(RANCH_RECIPES)) {
    const raw = Object.entries(R.input).reduce((a, [k, n]) => a + price(k) * n, 0);
    assert.ok(ITEMS[id].price > raw * 1.15, id);
  }
  const p = new Processor({ recipes: RANCH_RECIPES, prices: WORKSHOP_PRICES });
  assert.ok(p.canMake('goods_cheese', (k) => (k === 'milk' ? 2 : 0)));
  assert.ok(p.start(0, 'goods_cheese'));
  p.tick(RANCH_RECIPES.goods_cheese.time);
  assert.equal(p.collect(0), 'goods_cheese');
  assert.equal(p.nextJarPrice, WORKSHOP_PRICES[2]);
});
