import test from 'node:test';
import assert from 'node:assert/strict';
import { TownSim, BUILDINGS, RUSH_PER_SEC, GIFTS, TIERS, tierPrice } from '../src/game/sim/town.js';
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

const doneTown = (type) => { const t = new TownSim(5); t.build(0, type, 99999); t.rush(0); return t; };

test('건물 등급 ★2·★3: 기본 가격의 2.5배·6배, 레벨 조건, 한 단계씩만', () => {
  const t = doneTown('tank'), B = BUILDINGS.tank;
  assert.equal(t.tierOf(0), 1);
  assert.deepEqual(t.nextTier(0), { tier: 2, price: Math.round(B.price * 2.5), lv: 4, desc: TIERS.tank[1].desc });
  assert.match(t.whyNotUpgrade(0, 99999, 3), /Lv\.4/);
  assert.match(t.whyNotUpgrade(0, 10, 9), /모자라요/);
  assert.equal(t.upgrade(0, 99999, 9), tierPrice('tank', 2));
  assert.equal(t.tierOf(0), 2);
  assert.equal(t.nextTier(0).price, B.price * 6);
  assert.equal(t.upgrade(0, 99999, 9), B.price * 6);
  assert.equal(t.nextTier(0), null);
  assert.equal(t.upgrade(0, 99999, 9), 0, '★3 위로는 없음');
  assert.match(t.whyNotUpgrade(0, 99999, 9), /가장 높은/);
});

test('건물 등급 효과: 정자 선물 +1씩, 물탱크 2배까지, 직판장은 ×1.15 까지만, 방앗간·온실은 그대로', () => {
  const eff = (type, tier) => { const t = doneTown(type); for (let k = 1; k < tier; k++) t.upgrade(0, 99999, 9); return t.effects(); };
  assert.deepEqual([1, 2, 3].map((k) => eff('pavilion', k).gift), [1, 2, 3]);
  assert.deepEqual([1, 2, 3].map((k) => eff('tank', k).waterMult), [1.5, 1.75, 2.0]);
  assert.ok(eff('stand', 3).sellMult <= 1.15 + 1e-9, String(eff('stand', 3).sellMult));
  assert.deepEqual([1, 2, 3].map((k) => eff('mill', k).daily), [80, 80, 80], '수익 시설은 올려도 수입 그대로');
  assert.deepEqual([1, 2, 3].map((k) => eff('glasshouse', k).growMult), [1.15, 1.15, 1.15]);
  // 공사 중·빈 부지는 올릴 수 없음
  const t = new TownSim(5); t.build(1, 'mill', 99999);
  assert.match(t.whyNotUpgrade(1, 99999, 9), /완성된 건물만/);
  assert.match(t.whyNotUpgrade(0, 99999, 9), /완성된 건물만/);
});

test('건물 등급 저장·불러오기: 등급은 남고, 등급 없는 옛 저장은 ★1, 이상한 등급은 1~3 으로', () => {
  const t = doneTown('pavilion'); t.upgrade(0, 99999, 9);
  const back = new TownSim(5); back.load(JSON.parse(JSON.stringify(t.toJSON())));
  assert.equal(back.tierOf(0), 2);
  const old = new TownSim(5); old.load({ sites: [{ type: 'tank', state: 'done', left: 0 }] });
  assert.equal(old.tierOf(0), 1);
  assert.equal(old.effects().waterMult, 1.5);
  const odd = new TownSim(5); odd.load({ sites: [{ type: 'tank', state: 'done', left: 0, tier: 99 }, { type: 'mill', state: 'building', left: 5, tier: 3 }] });
  assert.equal(odd.tierOf(0), 3);
  assert.equal(odd.tierOf(1), 1, '공사 중이면 등급 없음');
  assert.deepEqual(Object.keys(BUILDINGS), ['pavilion', 'tank', 'stand', 'glasshouse', 'mill'], '도트 판이 쓰는 건물 표는 그대로');
});
