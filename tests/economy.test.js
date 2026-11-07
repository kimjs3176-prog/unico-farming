import test from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../src/game/sim/economy.js';

test('돈 쓰기: 잔액이 있으면 빼고 지출 통계에 더함', () => {
  // 준비
  const eco = new Economy(() => 0.5);
  eco.money = 100;
  // 실행
  const ok = eco.spend(30);
  // 확인
  assert.equal(ok, true);
  assert.equal(eco.money, 70);
  assert.equal(eco.stats.spent, 30);
});

test('돈 쓰기: 모자라거나 잘못된 금액이면 false 이고 아무것도 바뀌지 않음', () => {
  const eco = new Economy(() => 0.5);
  eco.money = 20;
  const spent0 = eco.stats.spent;
  for (const bad of [21, -5, NaN, undefined]) assert.equal(eco.spend(bad), false, String(bad));
  assert.equal(eco.money, 20);
  assert.equal(eco.stats.spent, spent0);
});

test('씨앗 받기: 없던 씨앗도 개수만큼 생기고, 사기는 spend 를 거쳐 통계에 남음', () => {
  const eco = new Economy(() => 0.5);
  eco.addSeeds('tomato', 3);
  eco.addSeeds('tomato', 2);
  assert.equal(eco.inventory.seeds.tomato, 5);
  eco.money = 1000; const s0 = eco.stats.spent;
  assert.equal(eco.buySeed('carrot', 2), true);
  assert.equal(eco.stats.spent - s0, eco.seedPrice('carrot') * 2);
});

test('사료 쓰기: 여러 개도 한 번에, 모자라면 false 이고 그대로', () => {
  const eco = new Economy(() => 0.5);
  eco.inventory.feed = 5;
  assert.equal(eco.useFeed(3), true);
  assert.equal(eco.inventory.feed, 2);
  assert.equal(eco.useFeed(3), false);
  assert.equal(eco.useFeed(0), false);
  assert.equal(eco.inventory.feed, 2);
  assert.equal(eco.useFeed(), true); // 기본 1개
  assert.equal(eco.inventory.feed, 1);
});
