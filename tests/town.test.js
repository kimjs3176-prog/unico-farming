import test from 'node:test';
import assert from 'node:assert/strict';
import { TownSim, BUILDINGS, RUSH_PER_SEC, GIFTS } from '../src/game/sim/town.js';
import { FarmSim, WATER_DURATION } from '../src/game/sim/farm.js';
import { Economy } from '../src/game/sim/economy.js';

test('건설: 돈·레벨·중복·부지 조건', () => {
  const t = new TownSim(3);
  assert.match(t.whyNot(0, 'tank', 100), /모자라요/);
  assert.match(t.whyNot(0, 'stand', 9999, 1), /Lv\.2/);
  assert.equal(t.build(0, 'tank', 800), BUILDINGS.tank.price);
  assert.equal(t.sites[0].state, 'building');
  assert.match(t.whyNot(1, 'tank', 9999), /이미 지었어요/);
  assert.match(t.whyNot(0, 'pavilion', 9999), /이미 건물이/);
  assert.equal(t.build(1, 'tank', 9999), 0);
});

test('공사 진행 → 완성, 진행률, 바로 완성 비용', () => {
  const t = new TownSim(2);
  t.build(0, 'pavilion', 999);
  assert.equal(t.tick(10).length, 0);
  assert.ok(Math.abs(t.progress(0) - 10 / BUILDINGS.pavilion.time) < 1e-9);
  assert.equal(t.rushCost(0), Math.ceil(BUILDINGS.pavilion.time - 10) * RUSH_PER_SEC);
  assert.deepEqual(t.tick(BUILDINGS.pavilion.time), [0]);
  assert.equal(t.sites[0].state, 'done');
  assert.equal(t.doneCount, 1);
  t.build(1, 'tank', 999);
  assert.ok(t.rush(1));
  assert.ok(t.built('tank'));
});

test('효과는 완성된 건물만, 곱해서 합침', () => {
  const t = new TownSim(5);
  t.build(0, 'stand', 9999); t.build(1, 'glasshouse', 9999); t.build(2, 'mill', 9999);
  assert.deepEqual(t.effects(), { sellMult: 1, growMult: 1, waterMult: 1, daily: 0, gift: 0 });
  t.tick(999);
  const e = t.effects();
  assert.equal(e.sellMult, 1.1); assert.equal(e.growMult, 1.15); assert.equal(e.daily, 80);
});

test('새 날: 임대 수입 + 정자 선물', () => {
  const t = new TownSim(5);
  t.build(0, 'mill', 9999); t.build(1, 'pavilion', 9999); t.tick(999);
  const r = t.newDay(() => 0);
  assert.equal(r.coins, 80);
  assert.deepEqual(r.gifts, [GIFTS[0]]);
});

test('저장·불러오기 (알 수 없는 건물은 무시)', () => {
  const t = new TownSim(3);
  t.build(0, 'tank', 999); t.build(1, 'pavilion', 999); t.tick(45);
  const u = new TownSim(3);
  u.load(JSON.parse(JSON.stringify(t.toJSON())));
  assert.equal(u.sites[0].state, 'building'); assert.equal(u.sites[1].state, 'done');
  assert.ok(Math.abs(u.sites[0].left - t.sites[0].left) < 1e-9);
  u.load({ sites: [{ type: 'castle', state: 'done' }] });
  assert.equal(u.sites[0].type, 'tank');
});

test('효과 연결: 물탱크는 물 지속, 온실은 성장, 직판장은 판매가', () => {
  const f = new FarmSim(1);
  f.till(0); f.plant(0, 'carrot');
  f.waterMult = 1.5; f.water(0);
  assert.equal(f.plots[0].water, WATER_DURATION * 1.5);
  const a = new FarmSim(1), b = new FarmSim(1);
  for (const s of [a, b]) { s.till(0); s.plant(0, 'carrot'); s.water(0); }
  b.buildMult = 1.15;
  a.tick(10); b.tick(10);
  assert.ok(Math.abs(b.plots[0].progress / a.plots[0].progress - 1.15) < 1e-6);
  const eco = new Economy(() => 0.5);
  const base = eco.sellPrice('carrot');
  eco.sellMult = 1.1;
  assert.equal(eco.sellPrice('carrot'), Math.max(1, Math.round(base * 1.1)));
});
