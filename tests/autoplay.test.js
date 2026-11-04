import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTask, shopList, bestSeed, bestUnlocked, cropValue, SELL_AT, RESERVE } from '../src/game/sim/autoplay.js';
import { CROPS, FEED_PRICE } from '../src/game/sim/crops.js';

const base = (o = {}) => ({ pos: { x: 0, z: 0 }, plots: [], animals: [], feed: 0, sellCount: 0, shop: { seeds: null, feed: 0 }, market: { x: 3, z: -7 }, ...o });

test('할 일이 없으면 null', () => {
  assert.equal(chooseTask(base({ plots: [{ i: 0, x: 1, z: 1, type: 'wait' }] })), null);
});

test('급한 일이 먼저: 수확 > 물 > 밭 갈기 (거리가 비슷할 때)', () => {
  const plots = [{ i: 0, x: 2, z: 0, type: 'till' }, { i: 1, x: 3, z: 0, type: 'water' }, { i: 2, x: 4, z: 0, type: 'harvest' }];
  assert.equal(chooseTask(base({ plots })).i, 2);
  assert.equal(chooseTask(base({ plots: plots.slice(0, 2) })).i, 1);
});

test('바로 옆의 덜 급한 일 vs 아주 먼 급한 일: 거리도 따짐', () => {
  const plots = [{ i: 0, x: 1, z: 0, type: 'water' }, { i: 1, x: 60, z: 0, type: 'harvest' }];
  assert.equal(chooseTask(base({ plots })).i, 0);
});

test('건너뛰기 목록의 대상은 고르지 않음', () => {
  const plots = [{ i: 0, x: 1, z: 0, type: 'harvest' }, { i: 1, x: 5, z: 0, type: 'water' }];
  assert.equal(chooseTask(base({ plots, skip: new Set(['plot:0']) })).i, 1);
});

test('동물: 사료가 없으면 사료 주기는 건너뜀, 밤에는 수확만', () => {
  const animals = [{ id: 1, x: 2, z: 0, type: 'feed' }, { id: 2, x: 9, z: 0, type: 'brush' }];
  assert.equal(chooseTask(base({ animals, feed: 0 })).id, 2);
  assert.equal(chooseTask(base({ animals, feed: 3 })).id, 1);
  const night = [{ id: 1, x: 2, z: 0, type: 'pet', sleeping: true }, { id: 2, x: 20, z: 0, type: 'collect', sleeping: true }];
  assert.equal(chooseTask(base({ animals: night })).id, 2);
});

test('장터: 가방이 차면 감, 씨앗이 없어 막혔을 때는 살 수 있을 때만 감', () => {
  assert.equal(chooseTask(base({ sellCount: SELL_AT })).kind, 'market');
  const blocked = base({ plots: [{ i: 0, x: 1, z: 0, type: 'need_seed' }] });
  assert.equal(chooseTask(blocked), null); // 살 돈도 팔 것도 없음
  const canBuy = { ...blocked, shop: { seeds: { crop: 'carrot', n: 3 }, feed: 0 } };
  assert.equal(chooseTask(canBuy).kind, 'market');
  // 다른 할 일이 있으면 그걸 먼저 (장터는 덜 급함)
  const withWork = { ...canBuy, plots: [...canBuy.plots, { i: 1, x: 2, z: 0, type: 'water' }] };
  assert.equal(chooseTask(withWork).type, 'water');
  // 씨앗이 없어 막혔으면 밭 갈기보다 장터가 먼저
  const tillMore = { ...canBuy, plots: [...canBuy.plots, { i: 2, x: 2, z: 0, type: 'till' }] };
  assert.equal(chooseTask(tillMore).kind, 'market');
});

test('가방이 가득 차면 장터가 거의 최우선', () => {
  const plots = [{ i: 0, x: 3, z: -6, type: 'pet' }, { i: 1, x: 3, z: -6, type: 'till' }];
  assert.equal(chooseTask(base({ plots, sellCount: SELL_AT + 5 })).kind, 'market');
});

test('씨앗 고르기: 가진 것 중 이익이 큰 것, 해금된 것 중 가장 좋은 것', () => {
  assert.equal(bestSeed({ carrot: 2, cabbage: 0 }), 'carrot');
  assert.equal(bestSeed({}), null);
  const two = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= 2);
  const best = bestUnlocked(2);
  for (const k of two) assert.ok(cropValue(best) >= cropValue(k));
  assert.equal(bestUnlocked(1), 'carrot');
});

test('장보기: 남겨 둘 돈은 쓰지 않고, 사료 먼저, 필요한 만큼만', () => {
  const s = shopList({ money: 200, level: 1, seedsOwned: 1, plotsFree: 5, feed: 0, hungry: 2 });
  assert.equal(s.feed, 2);
  assert.deepEqual(s.seeds, { crop: 'carrot', n: 4 });
  assert.ok(s.cost <= 200 - RESERVE);
  const poor = shopList({ money: RESERVE + 5, level: 1, seedsOwned: 0, plotsFree: 5, feed: 0, hungry: 0 });
  assert.equal(poor.seeds, null);
  assert.equal(poor.cost, 0);
  const none = shopList({ money: 999, level: 1, seedsOwned: 9, plotsFree: 3, feed: 5, hungry: 2 });
  assert.equal(none.seeds, null); assert.equal(none.feed, 0);
  const capped = shopList({ money: 99999, level: 1, seedsOwned: 0, plotsFree: 40, feed: 0, hungry: 40 });
  assert.ok(capped.seeds.n <= 10 && capped.feed <= 10);
  assert.ok(capped.feed * FEED_PRICE + capped.seeds.n * CROPS[capped.seeds.crop].seedPrice === capped.cost);
});
